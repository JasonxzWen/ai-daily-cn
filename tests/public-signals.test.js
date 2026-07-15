import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  buildOccurrenceStore,
  writeOccurrenceStore
} from "../src/occurrence-store.js";
import {
  buildPublicSignalArtifacts,
  projectOccurrenceStore,
  PUBLIC_SIGNAL_PAGE_SIZE,
  PUBLIC_SIGNAL_RECENT_WINDOW_HOURS,
  validatePublicSignalArtifactSet
} from "../src/public-signals.js";
import { occurrenceStoreRelativePath } from "../src/reports-data-layout.js";
import { scanPublicArtifactsForLocalInfo } from "../src/privacy.js";
import { validateOccurrenceStore, validatePublicSignals } from "../src/schema.js";
import { buildPublicSignals, buildSite, planGeneratedFiles, validatePublicSignalsOutput } from "../src/site.js";
import { mergeDiscoveryPayloads, writeDiscoveryOccurrenceStore } from "../src/draft.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedAt = "2026-07-14T08:00:00.000Z";
const execFileAsync = promisify(execFile);

function source(overrides = {}) {
  return {
    id: "collector-a",
    name: "Collector A RSS",
    url: "https://collector.example/feed.xml",
    category: "community",
    status: "checked",
    ...overrides
  };
}

function candidate(overrides = {}) {
  const candidateId = overrides.id || "candidate-a";
  return {
    id: candidateId,
    observation_id: overrides.observation_id || `observation-${candidateId}`,
    source_id: "collector-a",
    category: "hot_blog",
    title: "OpenAI 发布一项模型更新",
    url: "https://openai.com/index/example-model-update",
    source: "Collector A RSS",
    event_date: "2026-07-14",
    status: "excluded",
    source_level: "official",
    verification_status: "primary_confirmed",
    editorial_category: "model_release",
    evidence: "OpenAI announced a concrete model update with API details.",
    ...overrides
  };
}

test("occurrence store is lossless before editorial selection and keeps duplicate URLs", () => {
  const sharedUrl = "https://openai.com/index/example-model-update";
  const candidates = [
    candidate(),
    candidate({
      id: "candidate-b",
      source_id: "collector-b",
      source: "Collector B Newsletter",
      url: sharedUrl,
      status: "included",
      included_in: "main_items",
      main_rank: 1,
      main_rank_score: 999,
      main_selection_stage: "strict"
    }),
    candidate({
      id: "candidate-c",
      url: "https://news.ycombinator.com/item?id=123",
      title: "HN 讨论一项 AI 工程工具",
      source_level: "future_unknown_source_level",
      verification_status: "future_unknown_verification",
      editorial_category: "future_unknown_editorial_category"
    })
  ];
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source(), source({ id: "collector-b", name: "Collector B Newsletter" })],
    candidates
  });

  assert.equal(store.input_record_count, 3);
  assert.equal(store.occurrence_count, 3);
  assert.equal(store.normalization_error_count, 0);
  assert.equal(store.occurrences.length, 3);
  assert.equal(new Set(store.occurrences.map((item) => item.id)).size, 3);
  assert.equal(new Set(store.occurrences.filter((item) => item.url === sharedUrl).map((item) => item.cluster_id)).size, 1);
  assert.equal(store.occurrences.some((item) => "status" in item), false);
  assert.equal(store.occurrences.some((item) => "included_in" in item), false);
  assert.equal(store.occurrences.some((item) => "main_rank_score" in item), false);

  const validation = validateOccurrenceStore(store);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("classification and editorial metadata never change occurrence membership or chronology", () => {
  const input = [
    candidate({ id: "candidate-a", event_date: "2026-07-14" }),
    candidate({
      id: "candidate-b",
      url: "https://github.com/example/repo",
      event_date: "2026-07-13",
      source_level: "github",
      editorial_category: "open_source"
    })
  ];
  const baseline = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: input
  });
  const mutated = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source({ status: "blocked", category: "other" })],
    candidates: input.map((item, index) => ({
      ...item,
      status: index === 0 ? "included" : "excluded",
      included_in: index === 0 ? "main_items" : undefined,
      source_level: `unknown-level-${index}`,
      verification_status: `unknown-verification-${index}`,
      editorial_category: `unknown-editorial-${index}`,
      main_reject_reason: "not_selected_lower_priority",
      main_rank_score: 1000 - index
    }))
  });

  assert.deepEqual(mutated.occurrences.map((item) => item.id), baseline.occurrences.map((item) => item.id));

  const baselinePublic = projectOccurrenceStore(baseline).occurrences;
  const mutatedPublic = projectOccurrenceStore(mutated).occurrences;
  assert.deepEqual(mutatedPublic.map((item) => item.id), baselinePublic.map((item) => item.id));
  assert.deepEqual(mutatedPublic.map((item) => item.event_date), baselinePublic.map((item) => item.event_date));
  assert.equal(mutatedPublic.every((item) => item.credibility_tag === "pending_review"), true);
});

test("unknown taxonomy falls back visibly while invalid records are isolated per item", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({
        source_group: "future_group",
        source_level: "future_level",
        verification_status: "future_status",
        editorial_category: "future_category"
      }),
      candidate({ id: "unsafe-url", url: "javascript:alert(1)" }),
      candidate({ id: "missing-title", title: "" })
    ]
  });

  assert.equal(store.input_record_count, 3);
  assert.equal(store.occurrence_count, 2);
  assert.equal(store.normalization_error_count, 1);
  const projected = projectOccurrenceStore(store);
  assert.equal(projected.occurrences.length, 2);
  const unknown = projected.occurrences.find((item) => item.id === store.occurrences.find((item) => item.raw_source_level === "future_level").id);
  assert.equal(unknown.source_group, "community_discussions");
  assert.equal(unknown.credibility_tag, "pending_review");
  assert.deepEqual(unknown.content_tags, ["community_discussion"]);
  assert(projected.occurrences.some((item) => item.title === "Collector A RSS"));
});

test("public occurrence URLs remove credentials and secret query parameters", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source({
      url: "https://collector-user:collector-pass@collector.example/feed?id=7&token=collector-secret"
    })],
    candidates: [candidate({
      url: "https://reader:password@content.example/update?id=9&api_key=content-secret&utm_source=test"
    })]
  });
  const occurrence = store.occurrences[0];
  const projected = projectOccurrenceStore(store).occurrences[0];

  assert.equal(occurrence.url, "https://content.example/update?id=9");
  assert.equal(occurrence.collector.url, "https://collector.example/feed?id=7");
  assert.equal(projected.url, occurrence.url);
  assert.equal(projected.collected_via.url, occurrence.collector.url);
  assert.equal(JSON.stringify(projected).includes("secret"), false);
  assert.equal(JSON.stringify(projected).includes("password"), false);

  const tampered = structuredClone(store);
  tampered.occurrences[0].url = "https://user:password@content.example/update?token=secret";
  tampered.occurrences[0].collector.url = "https://collector.example/feed?api_key=secret";
  tampered.occurrences[0].image_url = "https://image-user:image-pass@images.example/hero.png";
  assert.equal(validateOccurrenceStore(tampered).valid, false);
  assert.throws(() => projectOccurrenceStore(tampered), /invalid occurrence store/i);
});

test("public occurrence URLs reject local and private network addresses", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source({ url: "http://127.0.0.1:8787/feed" })],
    candidates: [
      candidate({ id: "localhost", url: "http://localhost:3000/private" }),
      candidate({ id: "private-ip", url: "http://192.168.1.20/private" }),
      candidate({ id: "ipv4-compatible-ipv6", url: "http://[::127.0.0.1]/private" }),
      candidate({ id: "site-local-ipv6", url: "http://[fec0::1]/private" }),
      candidate({ id: "public", url: "https://publisher.example/public" })
    ]
  });

  assert.equal(store.input_record_count, 5);
  assert.equal(store.occurrence_count, 1);
  assert.deepEqual(store.normalization_errors.map((item) => item.code), ["url_unsafe", "url_unsafe", "url_unsafe", "url_unsafe"]);
  assert.equal(store.occurrences[0].url, "https://publisher.example/public");
  assert.equal(store.occurrences[0].collector.url, "https://publisher.example/public");

  const tampered = structuredClone(store);
  tampered.occurrences[0].collector.url = "http://10.0.0.2/internal-feed";
  assert.equal(validateOccurrenceStore(tampered).valid, false);
});

test("public occurrence text redacts embedded non-public network URLs", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate({
      id: "private-url-in-text",
      summary: "Internal console: http://10.0.0.1/admin; public context remains.",
      original_text: "Build output: https://jenkins.corp.internal/job/42. Keep the release note."
    })]
  });
  const occurrence = store.occurrences[0];
  const projected = projectOccurrenceStore(store).occurrences[0];

  assert.equal(occurrence.summary.includes("10.0.0.1"), false);
  assert.equal(occurrence.original_text.includes("jenkins.corp.internal"), false);
  assert.match(occurrence.summary, /\[non-public link removed\]/);
  assert.match(occurrence.original_text, /\[non-public link removed\]/);
  assert.equal(JSON.stringify(projected).includes("10.0.0.1"), false);
  assert.equal(JSON.stringify(projected).includes("jenkins.corp.internal"), false);
});

test("public artifact privacy scan rejects credential and secret-bearing URLs", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-public-signal-privacy-"));
  const signalsDir = path.join(tmp, "docs", "signals");
  await fs.mkdir(signalsDir, { recursive: true });
  await fs.writeFile(path.join(signalsDir, "index.json"), JSON.stringify({
    material: "https://user:password@example.com/item",
    collector: "https://collector.example/feed?api_key=secret",
    collector_url: "http://127.0.0.1:8787/feed"
  }), "utf8");

  const result = await scanPublicArtifactsForLocalInfo({ rootDir: tmp, targets: ["docs/signals"] });
  assert.equal(result.ok, false);
  assert(result.findings.some((item) => item.pattern === "public_url_credentials"));
  assert(result.findings.some((item) => item.pattern === "public_url_secret_query"));
  assert(result.findings.some((item) => item.pattern === "public_url_private_host"));

  const occurrenceDir = path.join(tmp, "reports-data", "occurrences", "2026", "07");
  await fs.mkdir(occurrenceDir, { recursive: true });
  await fs.writeFile(path.join(occurrenceDir, "2026-07-14.json"), JSON.stringify({
    material: "https://user:password@example.com/item?token=secret"
  }), "utf8");
  const storeScan = await scanPublicArtifactsForLocalInfo({ rootDir: tmp, targets: ["reports-data/occurrences"] });
  assert.equal(storeScan.ok, false);
  assert(storeScan.findings.some((item) => item.pattern === "public_url_credentials"));
  assert(storeScan.findings.some((item) => item.pattern === "public_url_secret_query"));

  const prosePath = path.join(signalsDir, "private-prose.json");
  await fs.writeFile(prosePath, JSON.stringify({
    summary: "Deployment detail is visible at https://jenkins.corp.internal/job/42"
  }), "utf8");
  const proseScan = await scanPublicArtifactsForLocalInfo({
    rootDir: tmp,
    targets: ["docs/signals/private-prose.json"]
  });
  assert.equal(proseScan.ok, false);
  assert(proseScan.findings.some((item) => item.pattern === "public_url_private_host"));
});

test("occurrence IDs and chronology are stable across input order and timezone offsets", () => {
  const records = [
    candidate({
      id: "shared-id",
      observation_id: "shared-observation-earlier",
      title: "Earlier offset record",
      published_at: "2026-07-14T10:00:00+08:00"
    }),
    candidate({
      id: "shared-id",
      observation_id: "shared-observation-later",
      title: "Later UTC record",
      published_at: "2026-07-14T03:00:00Z"
    }),
    candidate({
      id: "fresh-without-published-at",
      title: "Fresh undated publication",
      url: "https://example.com/fresh",
      event_date: "2026-07-14",
      published_at: null
    }),
    candidate({
      id: "old-with-published-at",
      title: "Old dated publication",
      url: "https://example.com/old",
      event_date: "2020-01-01",
      published_at: "2020-01-01T12:00:00Z"
    })
  ];
  const forward = buildOccurrenceStore({ reportDate: "2026-07-14", generatedAt, sources: [source()], candidates: records });
  const reversed = buildOccurrenceStore({ reportDate: "2026-07-14", generatedAt, sources: [source()], candidates: [...records].reverse() });
  const rebuilt = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt: "2026-07-14T09:00:00.000Z",
    sources: [source()],
    candidates: records.map((item, index) => ({
      ...item,
      title: `${item.title} edited`,
      summary: `Rewritten reader summary ${index}`
    }))
  });
  const idsByTitle = (store) => Object.fromEntries(store.occurrences.map((item) => [item.title, item.id]));
  const idsByStableObservation = (store) => Object.fromEntries(store.occurrences.map((item) => [
    `${item.url}|${item.published_at || item.event_date}`,
    item.id
  ]));

  assert.deepEqual(idsByTitle(forward), idsByTitle(reversed));
  assert.deepEqual(idsByStableObservation(forward), idsByStableObservation(rebuilt));
  assert.deepEqual(forward.occurrences.map((item) => item.id), rebuilt.occurrences.map((item) => item.id));
  assert(forward.occurrences.findIndex((item) => item.title === "Later UTC record") <
    forward.occurrences.findIndex((item) => item.title === "Earlier offset record"));
  assert(forward.occurrences.findIndex((item) => item.title === "Fresh undated publication") <
    forward.occurrences.findIndex((item) => item.title === "Old dated publication"));
});

test("observation IDs remain stable when candidate IDs and display metadata change", () => {
  const records = [
    candidate({
      id: "unstable-a",
      observation_id: "native-observation-a",
      title: "Observation A",
      summary: "Summary A",
      tags: ["alpha"]
    }),
    candidate({
      id: "unstable-b",
      observation_id: "native-observation-b",
      title: "Observation B",
      summary: "Summary B",
      tags: ["beta"]
    })
  ];
  const baseline = buildOccurrenceStore({ reportDate: "2026-07-14", generatedAt, sources: [source()], candidates: records });
  const rewritten = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt: "2026-07-14T09:00:00.000Z",
    sources: [source()],
    candidates: [...records].reverse().map((item, index) => ({
      ...item,
      id: `rewritten-candidate-${index}`,
      title: `${item.title} rewritten`,
      summary: `${item.summary} rewritten`,
      tags: [`rewritten-${index}`],
      source_level: `rewritten-level-${index}`,
      verification_status: `rewritten-verification-${index}`,
      editorial_category: `rewritten-editorial-${index}`
    }))
  });
  const idsByObservation = (store) => Object.fromEntries(store.occurrences.map((item) => [item.observation_id, item.id]));

  assert.equal(baseline.occurrence_count, 2);
  assert.equal(new Set(baseline.occurrences.map((item) => item.id)).size, 2);
  assert.deepEqual(idsByObservation(rewritten), idsByObservation(baseline));
});

test("native and fallback observation identities ignore mutable display and tracking metadata", () => {
  const raw = candidate({
    id: "native-row-a",
    url: "https://publisher.example/item?gclid=aaa&utm_source=first",
    published_at: "2026-07-14T10:00:00+08:00",
    author: "Alice"
  });
  delete raw.observation_id;
  delete raw.source_id;
  raw.source_url = "https://collector.example/feed.xml";
  raw.native_id = "native-42";
  const rewritten = {
    ...raw,
    id: "native-row-b",
    url: "https://publisher.example/item?gclid=bbb&utm_source=second",
    published_at: "2026-07-14T02:00:00Z",
    author: "Bob",
    source: "Renamed Collector"
  };
  const first = mergeDiscoveryPayloads([{ sources: [source()], candidates: [raw] }], {
    reportDate: "2026-07-14",
    generatedAt
  }).candidates[0];
  const second = mergeDiscoveryPayloads([{ sources: [source()], candidates: [rewritten] }], {
    reportDate: "2026-07-14",
    generatedAt
  }).candidates[0];
  assert.equal(first.observation_id, second.observation_id);

  const fallbackA = { ...raw, native_id: undefined, url: "https://publisher.example/fallback?fbclid=aaa" };
  const fallbackB = { ...rewritten, native_id: undefined, url: "https://publisher.example/fallback?fbclid=bbb" };
  const fallbackFirst = mergeDiscoveryPayloads([{ sources: [source()], candidates: [fallbackA] }], {
    reportDate: "2026-07-14",
    generatedAt
  }).candidates[0];
  const fallbackSecond = mergeDiscoveryPayloads([{ sources: [source()], candidates: [fallbackB] }], {
    reportDate: "2026-07-14",
    generatedAt
  }).candidates[0];
  assert.equal(fallbackFirst.observation_id, fallbackSecond.observation_id);

  const auditSourceId = (name) => mergeDiscoveryPayloads([{
    source_audit: {
      builder_sources: {
        sources: [{ name, url: "https://collector.example/audit-feed.xml", status: "checked" }]
      }
    },
    candidates: []
  }], { reportDate: "2026-07-14", generatedAt }).sources
    .find((item) => item.url === "https://collector.example/audit-feed.xml")?.id;
  assert.equal(auditSourceId("Old audit display name"), auditSourceId("Renamed audit display name"));
});

test("malformed source identifiers are normalized per record without crashing discovery", () => {
  const sourceRows = [
    source({ id: 101, url: "https://collector.example/numeric.xml" }),
    source({ id: { invalid: true }, url: "https://collector.example/object.xml" }),
    source({ id: "", url: "https://collector.example/empty.xml" })
  ];
  const candidateRows = [
    candidate({ id: "numeric-source", source_id: 101, source_url: sourceRows[0].url, url: "https://example.com/numeric" }),
    candidate({ id: "object-source", source_id: { invalid: true }, source_url: sourceRows[1].url, url: "https://example.com/object" }),
    candidate({ id: "empty-source", source_id: "", source_url: sourceRows[2].url, url: "https://example.com/empty" })
  ];

  const merged = mergeDiscoveryPayloads([{ sources: sourceRows, candidates: candidateRows }], {
    reportDate: "2026-07-14",
    generatedAt
  });

  assert.equal(merged.candidates.length, 3);
  assert(merged.sources.every((item) => typeof item.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.id)));
  assert(merged.candidates.every((item) => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item.source_id)));
  assert(merged.candidates.every((item) => merged.sources.some((sourceItem) => sourceItem.id === item.source_id)));
});

test("unknown discovery classification remains other and pending on the occurrence branch", () => {
  const raw = candidate({
    id: "future-category",
    category: "future_new_kind",
    source: "Neutral Collector",
    source_url: "https://collector.example/source",
    url: "https://publisher.example/future-kind"
  });
  delete raw.source_level;
  delete raw.verification_status;
  delete raw.editorial_category;
  const merged = mergeDiscoveryPayloads([{ sources: [], candidates: [raw] }], {
    reportDate: "2026-07-14",
    generatedAt
  });
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });
  const signal = projectOccurrenceStore(store).occurrences[0];

  assert.equal(merged.candidates[0].category, "community_lead", "legacy candidate pool keeps its closed compatibility category");
  assert.equal(store.occurrences[0].raw_content_kind, "future_new_kind");
  assert.equal(store.occurrences[0].raw_source_level, null);
  assert.equal(store.occurrences[0].raw_verification_status, null);
  assert.equal(store.occurrences[0].raw_content_category, null);
  assert.equal(signal.source_group, "other");
  assert.deepEqual(signal.content_tags, ["other"]);
  assert.equal(signal.credibility_tag, "pending_review");
});

test("explicit credibility tag survives discovery normalization and wins over legacy metadata", () => {
  const raw = candidate({
    id: "explicit-credibility",
    credibility_tag: "single_source_relay",
    source_level: "official",
    verification_status: "primary_confirmed"
  });
  const merged = mergeDiscoveryPayloads([{ sources: [source()], candidates: [raw] }], {
    reportDate: "2026-07-14",
    generatedAt
  });
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });
  const signal = projectOccurrenceStore(store).occurrences[0];

  assert.equal(merged.candidates[0].credibility_tag, "single_source_relay");
  assert.equal(merged.occurrenceCandidates[0].credibility_tag, "single_source_relay");
  assert.equal(store.occurrences[0].raw_credibility_tag, "single_source_relay");
  assert.equal(signal.credibility_tag, "single_source_relay");
});

test("malformed observation identifiers do not coalesce distinct safe discovery records", () => {
  const rows = [
    candidate({ id: "object-observation-a", observation_id: { native: "a" }, url: "https://publisher.example/a" }),
    candidate({ id: "object-observation-b", observation_id: { native: "b" }, url: "https://publisher.example/b" })
  ];
  const merged = mergeDiscoveryPayloads([{ sources: [source()], candidates: rows }], {
    reportDate: "2026-07-14",
    generatedAt
  });
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: merged.sources,
    candidates: merged.occurrenceCandidates
  });

  assert.equal(new Set(merged.occurrenceCandidates.map((item) => item.observation_id)).size, 2);
  assert.equal(store.input_record_count, 2);
  assert.equal(store.occurrence_count, 2);
  assert.equal(store.coalesced_record_count, 0);

  const directStore = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: rows
  });
  assert.equal(directStore.occurrence_count, 0);
  assert.deepEqual(directStore.normalization_errors.map((item) => item.code), ["observation_id_missing", "observation_id_missing"]);
});

test("long observation and source identifiers keep complete identity semantics", () => {
  const observationPrefix = "observation".repeat(60);
  const observationStore = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "long-observation-a", observation_id: `${observationPrefix}a`, url: "https://publisher.example/long-a" }),
      candidate({ id: "long-observation-b", observation_id: `${observationPrefix}b`, url: "https://publisher.example/long-b" })
    ]
  });
  assert.equal(observationStore.occurrence_count, 2);
  assert.equal(new Set(observationStore.occurrences.map((item) => item.observation_id)).size, 2);

  const sourcePrefix = "source".repeat(60);
  const sourceA = `${sourcePrefix}a`;
  const sourceB = `${sourcePrefix}b`;
  const sourceStore = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [
      source({ id: sourceA, name: "Long Source A", url: "https://collector.example/a" }),
      source({ id: sourceB, name: "Long Source B", url: "https://collector.example/b" })
    ],
    candidates: [
      candidate({ id: "long-source-a", source_id: sourceA, observation_id: "same-native", url: "https://publisher.example/source-a" }),
      candidate({ id: "long-source-b", source_id: sourceB, observation_id: "same-native", url: "https://publisher.example/source-b" })
    ]
  });
  assert.equal(sourceStore.occurrence_count, 2);
  assert.deepEqual(new Set(sourceStore.occurrences.map((item) => item.collector.name)), new Set(["Long Source A", "Long Source B"]));
});

test("repeated raw rows for one observation coalesce transparently without URL dedupe", () => {
  const duplicate = candidate({ observation_id: "same-native-observation", tags: ["first"] });
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      duplicate,
      {
        ...duplicate,
        id: "another-editorial-row",
        title: "A longer enriched title",
        url: "https://openai.com/index/example-model-update?version=2",
        event_date: "2026-07-15",
        tags: ["second"]
      }
    ]
  });

  assert.equal(store.input_record_count, 2);
  assert.equal(store.occurrence_count, 1);
  assert.equal(store.coalesced_record_count, 1);
  assert.equal(store.occurrences[0].raw_record_count, 2);
  assert.equal(store.occurrences[0].event_date, "2026-07-15");
  assert.deepEqual(store.occurrences[0].raw_tags, ["first", "second"]);
});

test("coalesced material URL keeps the access state from the same preferred record", () => {
  const shared = "same-observation";
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({
        id: "indirect-row",
        observation_id: shared,
        url: "javascript:blocked",
        intermediary_url: "https://a-intermediary.example/item"
      }),
      candidate({
        id: "direct-row",
        observation_id: shared,
        url: "https://z-publisher.example/item"
      })
    ]
  });

  assert.equal(store.occurrence_count, 1);
  assert.equal(store.occurrences[0].url, "https://z-publisher.example/item");
  assert.equal(store.occurrences[0].access_state, "direct");
});

test("future date anomalies remain visible but use collection chronology", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({
        id: "future-date",
        title: "Future-dated source record",
        url: "https://example.com/future",
        event_date: "2029-05-11"
      }),
      candidate({
        id: "current-date",
        title: "Current source record",
        url: "https://example.com/current",
        published_at: "2026-07-14T09:00:00.000Z"
      })
    ]
  });
  const projected = projectOccurrenceStore(store);
  const future = store.occurrences.find((item) => item.title === "Future-dated source record");

  assert.equal(store.occurrence_count, 2);
  assert.equal(future.event_date, "2029-05-11");
  assert.equal(future.date_anomaly, "future_relative_to_collection");
  assert.equal(projected.occurrences.find((item) => item.id === future.id).date_anomaly, "future_relative_to_collection");
  assert.equal(store.occurrences[0].title, "Current source record");
});

test("equivalent query parameter order shares one URL cluster", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "query-a", url: "https://example.com/item?b=2&a=1" }),
      candidate({ id: "query-b", url: "https://example.com/item?a=1&b=2" })
    ]
  });

  assert.equal(store.occurrence_count, 2);
  assert.equal(new Set(store.occurrences.map((item) => item.cluster_id)).size, 1);
});

test("source grouping and publisher identity are independent from credibility metadata", () => {
  const makeStore = (sourceLevel) => buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source({ name: "Collector Newsletter", category: "news" })],
    candidates: [candidate({
      url: "https://publisher.example/article",
      source: "Collector Newsletter",
      publisher: "Example Media",
      author: "Alice",
      source_level: sourceLevel,
      verification_status: "future_verification"
    })]
  });
  const official = projectOccurrenceStore(makeStore("official")).occurrences[0];
  const community = projectOccurrenceStore(makeStore("community")).occurrences[0];

  assert.equal(official.source_group, "news_newsletters");
  assert.equal(community.source_group, "news_newsletters");
  assert.equal(official.publisher.name, "Example Media");
  assert.equal(official.collected_via.name, "Collector Newsletter");
});

test("public X signals preserve author handle and original post text", () => {
  const originalText = "A complete original builder post about a newly released AI developer tool, including implementation details.";
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source({ name: "X Builder Monitor", category: "builder" })],
    candidates: [candidate({
      url: "https://x.com/alice/status/123",
      source: "X Builder Monitor",
      publisher: "",
      author: "Alice",
      handle: "@alice",
      original_text: originalText,
      summary: "Alice 介绍了一个新的 AI 开发工具。"
    })]
  });
  const signal = projectOccurrenceStore(store).occurrences[0];

  assert.equal(signal.author, "Alice");
  assert.equal(signal.handle, "@alice");
  assert.equal(signal.original_text, originalText);
  assert.equal(signal.summary, "Alice 介绍了一个新的 AI 开发工具。");
  assert.equal(signal.publisher.name, "x.com");
  assert.notEqual(signal.publisher.name, signal.author);
});

test("invalid collector URLs defer to a safe candidate collector URL without placeholders", () => {
  const merged = mergeDiscoveryPayloads([{
    sources: [source({ id: "broken-collector", url: "javascript:alert(1)" })],
    candidates: [candidate({
      id: "safe-candidate-collector",
      source_id: "broken-collector",
      source_url: "https://safe-collector.example/feed.xml",
      url: "https://publisher.example/item"
    })]
  }], { reportDate: "2026-07-14", generatedAt });
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: merged.sources,
    candidates: merged.candidates
  });

  assert.equal(store.occurrences[0].collector.url, "https://safe-collector.example/feed.xml");
  assert.notEqual(new URL(store.occurrences[0].collector.url).hostname, "example.com");

  const auditMerged = mergeDiscoveryPayloads([{
    source_audit: {
      builder_sources: {
        sources: [{ id: "broken-audit-source", name: "Broken Audit Source", url: "javascript:alert(1)", status: "blocked" }]
      }
    },
    candidates: [candidate({
      id: "safe-material-fallback",
      source_id: "broken-audit-source",
      source: "Broken Audit Source",
      url: "https://publisher.example/audit-fallback"
    })]
  }], { reportDate: "2026-07-14", generatedAt });
  const auditStore = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: auditMerged.sources,
    candidates: auditMerged.occurrenceCandidates
  });
  assert.equal(auditStore.occurrences[0].collector.url, "https://publisher.example/audit-fallback");
  assert.notEqual(new URL(auditStore.occurrences[0].collector.url).hostname, "example.com");
});

test("empty occurrence stores stay authoritative and ignore legacy candidates and reports", () => {
  const emptyStore = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [],
    candidates: []
  });
  const artifacts = buildPublicSignalArtifacts({
    occurrenceStores: [emptyStore],
    legacyCandidatePools: [{
      report_date: "2026-07-14",
      generated_at: "2099-01-01T00:00:00.000Z",
      sources: [source()],
      candidates: [candidate({ id: "legacy-candidate" })]
    }],
    reports: [{
      report_date: "2026-07-14",
      generated_at: "2099-01-02T00:00:00.000Z",
      stories: [{
        title: "Legacy report item",
        url: "https://legacy-report.example/item"
      }]
    }],
    generatedAt: "2099-01-03T00:00:00.000Z"
  });

  assert.equal(artifacts.index.generated_at, generatedAt);
  assert.equal(artifacts.index.total_count, 0);
  assert.deepEqual(artifacts.index.groups, []);
  assert.deepEqual(artifacts.pages, []);
  assert.deepEqual(artifacts.occurrences, []);
  assert.deepEqual(artifacts.index.coverage, {
    input_record_count: 0,
    occurrence_count: 0,
    coalesced_record_count: 0,
    normalization_error_count: 0
  });
});

test("signal validators enforce counts, uniqueness, pagination, and chronology semantics", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate(), candidate({ id: "candidate-b", url: "https://openai.com/index/b" })]
  });
  const invalidStore = structuredClone(store);
  invalidStore.occurrence_count = 999;
  assert.equal(validateOccurrenceStore(invalidStore).valid, false);

  const artifacts = buildPublicSignalArtifacts({ occurrenceStores: [store], generatedAt, pageSize: 1 });
  const invalidIndex = structuredClone(artifacts.index);
  invalidIndex.total_count = 999;
  assert.equal(validatePublicSignals(invalidIndex).valid, false);

  const invalidTaxonomy = structuredClone(artifacts.index);
  invalidTaxonomy.taxonomy_version = 999;
  assert.equal(validatePublicSignals(invalidTaxonomy).valid, false);

  const invalidGroupMetadata = structuredClone(artifacts.index);
  invalidGroupMetadata.groups[0].label = "Wrong label";
  invalidGroupMetadata.groups[0].first_page_url = "signals/other/page-001.json";
  assert.equal(validatePublicSignals(invalidGroupMetadata).valid, false);

  const invalidPage = structuredClone(artifacts.pages[0].data);
  invalidPage.next_url = null;
  assert.equal(validatePublicSignals(invalidPage).valid, false);

  const duplicatePage = structuredClone(artifacts.pages[0].data);
  duplicatePage.items.push(structuredClone(duplicatePage.items[0]));
  duplicatePage.page_size = 2;
  duplicatePage.total_count = 2;
  duplicatePage.page_count = 1;
  duplicatePage.next_url = null;
  assert.equal(validatePublicSignals(duplicatePage).valid, false);

  assert.equal(validatePublicSignalArtifactSet(artifacts).valid, true);
  const mixedGeneration = structuredClone(artifacts);
  mixedGeneration.pages[0].data.generated_at = "2026-07-14T09:00:00.000Z";
  assert.equal(validatePublicSignalArtifactSet(mixedGeneration).valid, false);

  const falseCoverage = structuredClone(artifacts);
  falseCoverage.index.coverage.occurrence_count = 0;
  assert.equal(validatePublicSignalArtifactSet(falseCoverage).valid, false);

  const falseRecentCount = structuredClone(artifacts);
  falseRecentCount.index.recent_count = 0;
  falseRecentCount.index.groups[0].recent_count = 0;
  falseRecentCount.files[0].data.recent_count = 0;
  falseRecentCount.files[0].data.groups[0].recent_count = 0;
  assert.equal(validatePublicSignalArtifactSet(falseRecentCount).valid, false);

  const crossPageReordered = structuredClone(artifacts);
  const groupPages = crossPageReordered.pages.filter((entry) => entry.data.group.id === crossPageReordered.index.groups[0].id);
  [groupPages[0].data.items, groupPages[1].data.items] = [groupPages[1].data.items, groupPages[0].data.items];
  crossPageReordered.index.groups[0].preview = structuredClone(groupPages[0].data.items);
  assert.equal(validatePublicSignalArtifactSet(crossPageReordered).valid, false);

  const missingDeclaredOccurrences = structuredClone(artifacts);
  missingDeclaredOccurrences.occurrences = [];
  assert.equal(validatePublicSignalArtifactSet(missingDeclaredOccurrences).valid, false);

  const missingDeclaredFile = structuredClone(artifacts);
  missingDeclaredFile.files.pop();
  assert.equal(validatePublicSignalArtifactSet(missingDeclaredFile).valid, false);

  const mismatchedDeclaredFile = structuredClone(artifacts);
  mismatchedDeclaredFile.files[0].data = { ...mismatchedDeclaredFile.files[0].data, total_count: 999 };
  assert.equal(validatePublicSignalArtifactSet(mismatchedDeclaredFile).valid, false);
});

test("public signal pages are exact, finite, conditional by group, and schema-valid", () => {
  const candidates = Array.from({ length: 7 }, (_, index) => candidate({
    id: `candidate-${index}`,
    url: index < 4
      ? `https://github.com/example/repo-${index}`
      : `https://openai.com/index/update-${index}`,
    event_date: index < 2 ? "2026-07-14" : "2026-07-13",
    source_level: index < 4 ? "github" : "official",
    editorial_category: index < 4 ? "open_source" : "product_radar"
  }));
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates
  });
  const artifacts = buildPublicSignalArtifacts({
    occurrenceStores: [store],
    generatedAt,
    pageSize: 2,
    previewSize: 1
  });

  assert.equal(artifacts.index.total_count, 7);
  assert.equal(artifacts.index.recent_count, 7);
  assert.equal(artifacts.index.recent_window_hours, 48);
  assert.equal(artifacts.index.groups[0].recent_count, 7);
  assert.equal(artifacts.index.page_size, 2);
  assert.deepEqual(artifacts.index.groups.map((group) => group.id), ["community_discussions"]);
  assert.equal(artifacts.index.groups.some((group) => group.id === "other"), false);
  assert.equal(artifacts.pages.length, 4);

  const pageIds = artifacts.pages.flatMap((entry) => entry.data.items.map((item) => item.id));
  assert.equal(pageIds.length, 7);
  assert.equal(new Set(pageIds).size, 7);
  assert.deepEqual(new Set(pageIds), new Set(store.occurrences.map((item) => item.id)));
  for (const entry of artifacts.pages) {
    assert.match(entry.path, /^signals\/[a-z_]+\/page-\d{3}\.json$/);
    const validation = validatePublicSignals(entry.data);
    assert.equal(validation.valid, true, `${entry.path}: ${JSON.stringify(validation.errors)}`);
  }
  const indexValidation = validatePublicSignals(artifacts.index);
  assert.equal(indexValidation.valid, true, JSON.stringify(indexValidation.errors));
  assert.equal(artifacts.pages.at(-1).data.next_url, null);
});

test("only occurrence stores determine public signal generation time", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate()]
  });
  const artifacts = buildPublicSignalArtifacts({
    occurrenceStores: [store],
    legacyCandidatePools: [{
      report_date: "2099-01-01",
      generated_at: "2099-01-01T00:00:00.000Z",
      sources: [],
      candidates: []
    }],
    reports: [{
      report_date: "2099-12-31",
      generated_at: "2099-12-31T00:00:00.000Z"
    }],
    generatedAt: "2100-01-01T00:00:00.000Z"
  });

  assert.equal(artifacts.index.generated_at, generatedAt);
  assert(artifacts.pages.every((entry) => entry.data.generated_at === generatedAt));
});

test("occurrence store writes to a stable dated path independent of report output", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-occurrence-store-"));
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate()]
  });
  const target = await writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store });

  assert.equal(
    target,
    path.join(tmp, "reports-data", ...occurrenceStoreRelativePath("2026-07-14").split(path.sep))
  );
  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), store);
});

test("occurrence store refuses a same-day rewrite that drops or mutates an existing occurrence", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-occurrence-monotonic-"));
  const initial = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "kept-a", url: "https://example.com/a" }),
      candidate({ id: "kept-b", url: "https://example.com/b" })
    ]
  });
  const target = await writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store: initial });

  const dropping = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate({ id: "kept-a", url: "https://example.com/a" })]
  });
  const missingId = initial.occurrences.find((item) => item.url === "https://example.com/b")?.id;
  await assert.rejects(
    writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store: dropping }),
    (error) => error?.code === "occurrence_store_non_monotonic_rewrite" &&
      error?.details?.missing_occurrence_ids?.includes(missingId)
  );

  const mutating = structuredClone(initial);
  mutating.occurrences[0].title = "rewritten after persistence";
  await assert.rejects(
    writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store: mutating }),
    (error) => error?.code === "occurrence_store_non_monotonic_rewrite" &&
      error?.details?.changed_occurrence_ids?.includes(initial.occurrences[0].id)
  );

  assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), initial);
});

test("occurrence store permits an exact same-day superset without rewriting prior rows", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-occurrence-superset-"));
  const first = candidate({ id: "stable-a", url: "https://example.com/a" });
  const initial = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [first]
  });
  await writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store: initial });
  const expanded = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [first, candidate({ id: "stable-b", url: "https://example.com/b" })]
  });

  const target = await writeOccurrenceStore({ rootDir: tmp, outputDir: "reports-data", store: expanded });
  const persisted = JSON.parse(await fs.readFile(target, "utf8"));
  assert.equal(persisted.occurrence_count, 2);
  assert.deepEqual(persisted.occurrences.find((item) => item.id === initial.occurrences[0].id), initial.occurrences[0]);
});

test("independent signal writer merges same-day reruns while freezing persisted evidence", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-occurrence-rerun-"));
  const discoveryPath = path.join(tmp, "discovery.json");
  const initialPayload = {
    report_date: "2026-07-14",
    generated_at: generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "stable-a", title: "First observed title", summary: "First observed summary" }),
      null
    ]
  };
  await fs.writeFile(discoveryPath, `${JSON.stringify(initialPayload, null, 2)}\n`, "utf8");
  const first = await writeDiscoveryOccurrenceStore({
    rootDir: tmp,
    reportDate: "2026-07-14",
    generatedAt,
    inputPaths: [discoveryPath]
  });
  const frozenOccurrence = structuredClone(first.store.occurrences[0]);
  const frozenErrors = structuredClone(first.store.normalization_errors);

  const rerunGeneratedAt = "2026-07-14T09:00:00.000Z";
  initialPayload.generated_at = rerunGeneratedAt;
  initialPayload.candidates = [
    candidate({ id: "stable-a", title: "Mutable upstream title", summary: "Mutable upstream summary" }),
    null,
    candidate({ id: "stable-b", url: "https://example.com/b" }),
    candidate({ id: "unsafe-new", url: "javascript:alert(1)" })
  ];
  await fs.writeFile(discoveryPath, `${JSON.stringify(initialPayload, null, 2)}\n`, "utf8");
  const rerun = await writeDiscoveryOccurrenceStore({
    rootDir: tmp,
    reportDate: "2026-07-14",
    generatedAt: rerunGeneratedAt,
    inputPaths: [discoveryPath]
  });
  const persisted = JSON.parse(await fs.readFile(rerun.occurrenceStorePath, "utf8"));

  assert.deepEqual(rerun.store, persisted);
  assert.deepEqual(persisted.occurrences.find((item) => item.id === frozenOccurrence.id), frozenOccurrence);
  assert.equal(persisted.occurrences.some((item) => item.observation_id === "observation-stable-b"), true);
  assert.deepEqual(persisted.normalization_errors.slice(0, frozenErrors.length), frozenErrors);
  assert.equal(persisted.normalization_error_count, 2);
  assert.equal(
    persisted.input_record_count,
    persisted.occurrences.reduce((sum, item) => sum + item.raw_record_count, 0) + persisted.normalization_errors.length
  );
  assert.equal(validateOccurrenceStore(persisted).valid, true);
});

test("independent signal writer persists discovery records without running editorial selection", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-signal-writer-"));
  const discoveryPath = path.join(tmp, "discovery.json");
  await fs.writeFile(discoveryPath, `${JSON.stringify({
    report_date: "2026-07-14",
    generated_at: generatedAt,
    sources: [source(), null],
    candidates: [
      candidate({ id: "raw-a", source_level: "future_unknown_source_level" }),
      null,
      candidate({ id: "unsafe", url: "javascript:alert(1)" }),
      candidate({ id: "raw-b", url: "https://github.com/example/raw-b" })
    ]
  }, null, 2)}\n`, "utf8");

  const result = await writeDiscoveryOccurrenceStore({
    rootDir: tmp,
    reportDate: "2026-07-14",
    generatedAt,
    inputPaths: [discoveryPath],
    outputDir: "reports-data"
  });

  assert.equal(result.store.occurrence_count, 2);
  assert.equal(result.store.input_record_count, 4);
  assert.equal(result.store.normalization_error_count, 2);
  assert.deepEqual(result.store.normalization_errors.map((item) => item.code), ["record_invalid", "url_unsafe"]);
  assert.equal(result.store.occurrences.some((item) => item.observation_id === "observation-raw-a"), true);
  assert.equal(await fileExists(result.occurrenceStorePath), true);
  assert.equal(await fileExists(path.join(tmp, ".tmp", "daily-report.json")), false);
  assert.equal(await fileExists(path.join(tmp, ".tmp", "source-candidates-2026-07-14.json")), false);

  const cliRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-signal-writer-cli-"));
  const cliInput = path.join(cliRoot, "discovery.json");
  await fs.copyFile(discoveryPath, cliInput);
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(rootDir, "src", "cli.js"),
    "signals:write",
    "--repo-root", cliRoot,
    "--date", "2026-07-14",
    "--generated-at", generatedAt,
    "--input", cliInput,
    "--out", "reports-data"
  ], { cwd: rootDir, encoding: "utf8" });
  const cliResult = JSON.parse(stdout);
  assert.equal(cliResult.ok, true);
  assert.equal(cliResult.occurrence_count, 2);
  assert.equal(cliResult.input_record_count, 4);
  assert.equal(cliResult.normalization_error_count, 2);
  assert.equal(await fileExists(cliResult.occurrence_store_path), true);
});

test("public signal defaults use bounded transport pages only, never an item cap", () => {
  assert.equal(PUBLIC_SIGNAL_PAGE_SIZE, 50);
  assert.equal(PUBLIC_SIGNAL_RECENT_WINDOW_HOURS, 48);
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: Array.from({ length: 121 }, (_, index) => candidate({
      id: `candidate-${index}`,
      url: `https://github.com/example/repo-${index}`,
      source_level: "github",
      editorial_category: "open_source"
    }))
  });
  const artifacts = buildPublicSignalArtifacts({ occurrenceStores: [store], generatedAt });
  const pageItems = artifacts.pages.flatMap((entry) => entry.data.items);

  assert.equal(artifacts.index.total_count, 121);
  assert.equal(pageItems.length, 121);
  assert.equal(artifacts.pages.length, 3);
});

test("public signal index separates the recent 48-hour stream from the lossless archive", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "recent", event_date: "2026-07-14" }),
      candidate({ id: "archive", event_date: "2026-07-10", url: "https://example.com/archive" })
    ]
  });
  const artifacts = buildPublicSignalArtifacts({ occurrenceStores: [store], generatedAt });

  assert.equal(artifacts.index.total_count, 2);
  assert.equal(artifacts.index.recent_count, 1);
  assert.equal(artifacts.index.groups[0].count, 2);
  assert.equal(artifacts.index.groups[0].recent_count, 1);
  assert.equal(artifacts.pages.flatMap((entry) => entry.data.items).length, 2);
});

test("repository contract keeps public signal membership lossless and labels non-gating", async () => {
  const [
    featureList,
    feedbackLedger,
    roadmap,
    reconciliation,
    handbook,
    quickReference,
    recoveryLedger,
    qualityDocument,
    editorialAuthority,
    storyContract,
    mainStreamSpec,
    promptModules,
    promptManifest
  ] = await Promise.all([
    readJson("feature_list.json"),
    readJson("config/feedback-ledger.json"),
    readText("docs/ai-daily-cross-agent-iteration-roadmap.md"),
    readText("docs/ai-daily-requirements-reconciliation.md"),
    readText("docs/source-first-ia-handbook.md"),
    readText("docs/feedback-buglist-quick-reference.md"),
    readText("tasks/project-recovery-ledger.md"),
    readText("quality-document.md"),
    readText("prompts/ai-daily/modules/editorial-authority.md"),
    readText("docs/ai-daily-story-contract.md"),
    readText("docs/ai-daily-main-stream-generation-repair-spec.md"),
    readJson("prompts/ai-daily/modules.json"),
    readJson("prompts/ai-daily/manifest.json")
  ]);
  const feature = featureList.features.find((item) => item.id === "lossless-public-signal-stream");
  const feedback = feedbackLedger.items.find((item) => item.id === "feedback/p1-lossless-public-signal-stream");

  assert(feature, "feature inventory must own the lossless public signal stream");
  assert.equal(feature.status, "ready_for_validation");
  assert(feature.acceptance.some((item) => item.includes("must not change membership or default chronology")));
  assert(feature.acceptance.some((item) => item.includes("persistent observation_id")));
  assert(feature.acceptance.some((item) => item.includes("raw_record_count/coalesced_record_count")));
  assert(feedback, "feedback ledger must own the no-admission public contract");
  assert.equal(feedback.status, "implemented");
  assert.equal(feedback.validation.test_name, "repository contract keeps public signal membership lossless and labels non-gating");

  const legacyScopedFeedbackIds = [
    "feedback/p1-domestic-dynamics-public-visibility",
    "feedback/p1-public-signal-layering",
    "feedback/p1-china-ai-hard-gate",
    "feedback/p1-chinese-hot-blog-slot",
    "feedback/p1-huggingface-trending-section",
    "feedback/p1-public-importance-selection",
    "feedback/p1-editorial-importance-density-source-visibility"
  ];
  for (const id of legacyScopedFeedbackIds) {
    const item = feedbackLedger.items.find((entry) => entry.id === id);
    assert(item, `feedback ledger missing ${id}`);
    assert.match(item.expected_behavior, /legacy|optional|public signal stream/i, `${id} must separate legacy editorial behavior from public signals`);
  }
  for (const id of ["feedback/p1-domestic-dynamics-public-visibility", "feedback/p1-public-signal-layering"]) {
    const item = feedbackLedger.items.find((entry) => entry.id === id);
    assert.equal(item.validation.command, "corepack pnpm run test");
    assert.equal(item.validation.test_name, "repository contract keeps public signal membership lossless and labels non-gating");
    assert(item.scope.includes("tests/public-signals.test.js"));
  }

  const aify = featureList.features.find((item) => item.id === "aify-news-logical-source");
  assert(aify.evidence.stop_conditions.some((item) => item.includes("docs/signals page-union parity")));

  for (const document of [roadmap, reconciliation, handbook]) {
    assert(document.includes("public-signal-stream-contract:v1"));
    assert(document.includes("No content-admission gate"));
    assert(document.includes("Credibility, content, source, health, and access metadata are labels and filters only"));
  }
  for (const document of [editorialAuthority, storyContract, mainStreamSpec]) {
    assert(document.includes("public-signal-stream-contract:v1"));
    assert.match(document, /仅适用于可选遗留编辑报告|仅保留为可选遗留编辑报告/);
    assert(document.includes("docs/signals"));
    assert.match(document, /不治理|不得控制/);
  }
  const editorialModule = promptModules.modules.find((item) => item.name === "editorial-authority");
  assert.match(editorialModule.purpose, /可选遗留编辑报告/);
  assert.match(editorialModule.purpose, /不治理 docs\/signals/);
  assert.match(promptManifest.description, /可选遗留编辑报告/);
  assert.match(promptManifest.description, /不治理 docs\/signals/);
  assert(quickReference.includes("feedback/p1-lossless-public-signal-stream"));
  assert(reconciliation.includes("REQ-014"));
  assert(reconciliation.includes("Runtime Claim Rule (Historical Legacy Edited Report)"));
  assert(recoveryLedger.includes("REC-328 - Make the public product a lossless source-first signal listener"));
  assert(recoveryLedger.includes("Historical phase: this stable REC originally recorded"));
  assert(recoveryLedger.includes("REC-322 - Restore reader filtering"));
  assert(recoveryLedger.includes("REC-331 - Make Aify News first-class in governance and observable in production"));
  assert(recoveryLedger.includes("safe Aify observations are present in the occurrence store"));
  assert(recoveryLedger.includes("legacy candidate dispositions, persisted edited reports, and the legacy public article index remain diagnostic evidence only"));
  assert(qualityDocument.includes("every safe Aify observation belongs in the public signal projection"));
});

test("site build writes and plans every signal page while safely removing stale managed pages", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-public-signal-site-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const poolDir = path.join(dataInputDir, "internal", "candidates", "2026", "07");
  await fs.mkdir(path.join(tmp, "config"), { recursive: true });
  await fs.copyFile(path.join(rootDir, "config", "trends.json"), path.join(tmp, "config", "trends.json"));
  await fs.mkdir(poolDir, { recursive: true });
  await fs.writeFile(path.join(poolDir, "2026-07-14.candidates.json"), `${JSON.stringify({
    schema_version: 1,
    report_date: "2026-07-14",
    generated_at: generatedAt,
    sources: [source()],
    candidates: [
      candidate({ id: "site-1", url: "https://github.com/example/site-1", source_level: "github" }),
      candidate({ id: "site-2", url: "https://github.com/example/site-2", source_level: "github" }),
      candidate({ id: "site-3", url: "https://openai.com/index/site-3" }),
      candidate({
        id: "story-derived-site-3",
        url: "https://openai.com/index/site-3",
        title: "Legacy edited context for site 3",
        category: "main_item"
      })
    ]
  }, null, 2)}\n`, "utf8");
  await writeOccurrenceStore({
    rootDir: tmp,
    outputDir: "reports-data",
    store: buildOccurrenceStore({
      reportDate: "2026-07-14",
      generatedAt,
      sources: [source()],
      candidates: [
        candidate({ id: "site-1", url: "https://github.com/example/site-1", source_level: "github" }),
        candidate({ id: "site-2", url: "https://github.com/example/site-2", source_level: "github" }),
        candidate({ id: "site-3", url: "https://openai.com/index/site-3" })
      ]
    })
  });

  const stalePath = path.join(outDir, "signals", "other", "page-999.json");
  await fs.mkdir(path.dirname(stalePath), { recursive: true });
  await fs.writeFile(stalePath, "{}\n", "utf8");

  const planned = await planGeneratedFiles({
    rootDir: tmp,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });
  assert.equal(planned.files.includes("signals/index.json"), true);
  assert.equal(planned.files.includes("signals/community_discussions/page-001.json"), true);
  assert.equal(planned.files.includes("signals/other/page-999.json"), true);

  const result = await buildSite({
    rootDir: tmp,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });
  assert.equal(result.publicSignals.index.total_count, 3);
  assert.equal(result.publicSignals.index.coverage.occurrence_count, 3);
  assert.equal((await validatePublicSignalsOutput({ rootDir: tmp, outDir: "docs" })).ok, true);
  assert.equal(result.writtenFiles.includes("signals/index.json"), true);
  assert.equal(await fileExists(path.join(outDir, "signals", "index.json")), true);
  assert.equal(await fileExists(stalePath), false);

  const firstIndexBytes = await fs.readFile(path.join(outDir, "signals", "index.json"), "utf8");
  const unchanged = await buildSite({
    rootDir: tmp,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: "2026-07-14T08:30:00.000Z"
  });
  assert.equal(unchanged.writtenFiles.some((file) => file.startsWith("signals/")), false);
  assert.equal(await fs.readFile(path.join(outDir, "signals", "index.json"), "utf8"), firstIndexBytes);

  const interruptedBackup = path.join(outDir, ".signals-backup-interrupted");
  const interruptedStage = path.join(outDir, ".signals-stage-interrupted");
  await fs.rename(path.join(outDir, "signals"), interruptedBackup);
  await fs.mkdir(interruptedStage, { recursive: true });
  await fs.writeFile(path.join(interruptedStage, "partial.json"), "{}\n", "utf8");
  await buildSite({
    rootDir: tmp,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });
  assert.equal(await fileExists(path.join(outDir, "signals", "index.json")), true);
  const outputEntries = await fs.readdir(outDir);
  assert.equal(outputEntries.some((entry) => entry.startsWith(".signals-stage-")), false);
  assert.equal(outputEntries.some((entry) => entry.startsWith(".signals-backup-")), false);

  await writeOccurrenceStore({
    rootDir: tmp,
    outputDir: "reports-data",
    mergeExisting: true,
    store: buildOccurrenceStore({
      reportDate: "2026-07-14",
      generatedAt: "2026-07-14T09:00:00.000Z",
      sources: [source()],
      candidates: [
        candidate({ id: "site-1", url: "https://github.com/example/site-1", source_level: "github" }),
        candidate({ id: "site-2", url: "https://github.com/example/site-2", source_level: "github" }),
        candidate({ id: "site-3", url: "https://openai.com/index/site-3" }),
        candidate({ id: "site-4", url: "https://news.ycombinator.com/item?id=site-4" })
      ]
    })
  });
  const occurrenceOnlyUpdate = await buildSite({
    rootDir: tmp,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: "2026-07-14T10:00:00.000Z"
  });
  assert.equal(occurrenceOnlyUpdate.publicSignals.index.total_count, 4);
  assert.equal(occurrenceOnlyUpdate.publicSignals.index.generated_at, "2026-07-14T09:00:00.000Z");
  assert.equal(occurrenceOnlyUpdate.writtenFiles.includes("signals/index.json"), true);
});

test("standalone public signal build atomically replaces only the managed signals tree", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-public-signal-standalone-"));
  const dataInputDir = path.join(tmp, "reports-data");
  const outDir = path.join(tmp, "docs");
  const poolDir = path.join(dataInputDir, "internal", "candidates", "2026", "07");
  const legacyArtifacts = new Map([
    ["index.html", "<!doctype html><title>Legacy home</title>\n"],
    ["feed.json", "{\"legacy\":\"feed\"}\n"],
    ["articles.json", "{\"legacy\":\"articles\"}\n"],
    ["reports/2026/07/2026-07-14.html", "<!doctype html><title>Legacy report</title>\n"]
  ]);
  await fs.mkdir(poolDir, { recursive: true });
  for (const [relativePath, content] of legacyArtifacts) {
    const target = path.join(outDir, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }
  await fs.writeFile(path.join(poolDir, "2026-07-14.candidates.json"), `${JSON.stringify({
    schema_version: 1,
    report_date: "2026-07-14",
    generated_at: generatedAt,
    sources: [source()],
    candidates: [candidate({ id: "legacy-candidate" })]
  }, null, 2)}\n`, "utf8");
  const persistedReportPath = path.join(dataInputDir, "2026", "07", "2026-07-09.json");
  await fs.mkdir(path.dirname(persistedReportPath), { recursive: true });
  await fs.copyFile(
    path.join(rootDir, "reports-data", "2026", "07", "2026-07-09.json"),
    persistedReportPath
  );
  await writeOccurrenceStore({
    rootDir: tmp,
    outputDir: "reports-data",
    store: buildOccurrenceStore({
      reportDate: "2026-07-14",
      generatedAt,
      sources: [source()],
      candidates: [candidate({ id: "observed-candidate" })]
    })
  });

  const stalePath = path.join(outDir, "signals", "other", "page-999.json");
  await fs.mkdir(path.dirname(stalePath), { recursive: true });
  await fs.writeFile(stalePath, "{}\n", "utf8");

  const first = await buildPublicSignals({
    rootDir: tmp,
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });

  assert.equal(first.publicSignals.index.total_count, 1);
  assert.equal(first.publicSignals.index.coverage.occurrence_count, 1);
  assert.equal(first.publicSignals.index.generated_at, generatedAt);
  assert(first.writtenFiles.length > 0);
  assert(first.writtenFiles.every((relativePath) => relativePath.startsWith("signals/")));
  assert.equal(await fileExists(stalePath), false);
  for (const [relativePath, content] of legacyArtifacts) {
    assert.equal(await fs.readFile(path.join(outDir, ...relativePath.split("/")), "utf8"), content);
  }
  assert.equal(await fileExists(path.join(outDir, ".nojekyll")), false);
  assert.equal(await fileExists(path.join(outDir, "home.json")), false);
  assert.equal(await fileExists(path.join(outDir, "trends.json")), false);

  const firstIndexBytes = await fs.readFile(path.join(outDir, "signals", "index.json"), "utf8");
  const second = await buildPublicSignals({
    rootDir: tmp,
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });
  assert.deepEqual(second.writtenFiles, []);
  assert.equal(await fs.readFile(path.join(outDir, "signals", "index.json"), "utf8"), firstIndexBytes);

  const emptyTmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-public-signal-empty-"));
  const emptyGeneratedAt = "2026-07-14T09:00:00.000Z";
  await writeOccurrenceStore({
    rootDir: emptyTmp,
    outputDir: "reports-data",
    store: buildOccurrenceStore({
      reportDate: "2026-07-14",
      generatedAt: emptyGeneratedAt,
      sources: [],
      candidates: []
    })
  });
  const empty = await buildPublicSignals({
    rootDir: emptyTmp,
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: "2099-01-01T00:00:00.000Z"
  });
  assert.equal(empty.publicSignals.index.generated_at, emptyGeneratedAt);
  assert.equal(empty.publicSignals.index.total_count, 0);
  assert.deepEqual(empty.publicSignals.index.groups, []);
  assert.deepEqual(empty.publicSignals.occurrences, []);
  assert.equal(empty.publicSignals.index.coverage.occurrence_count, 0);
  assert.equal(await fileExists(path.join(emptyTmp, "docs", "signals", "index.json")), true);
  assert.equal(await fileExists(persistedReportPath), true);
  assert.equal(await fileExists(path.join(poolDir, "2026-07-14.candidates.json")), true);
});

test("public signal build loads immutable compressed occurrence baselines", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-signal-baseline-"));
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate({ id: "compressed-baseline" })]
  });
  const baselineDir = path.join(tmp, "reports-data", "occurrences", "baseline-v1");
  const baselinePath = path.join(baselineDir, "2026-07.json.gz");
  await fs.mkdir(baselineDir, { recursive: true });
  const compressed = gzipSync(Buffer.from(`${JSON.stringify(store, null, 2)}\n`), { level: 9, mtime: 0 });
  await fs.writeFile(baselinePath, compressed);
  await writeBaselineManifest(tmp, [{ filePath: baselinePath, store, compressed }]);

  const result = await buildPublicSignals({
    rootDir: tmp,
    dataInputDir: "reports-data",
    outDir: "docs"
  });

  assert.equal(result.publicSignals.index.total_count, 1);
  assert.equal(result.publicSignals.index.coverage.input_record_count, 1);
  assert.equal(result.publicSignals.index.coverage.occurrence_count, 1);
  assert.equal(result.publicSignals.occurrences[0].title, store.occurrences[0].title);
});

test("public signal build rejects missing or mutated immutable baseline shards", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-signal-baseline-invalid-"));
  const store = buildOccurrenceStore({
    reportDate: "2026-07-14",
    generatedAt,
    sources: [source()],
    candidates: [candidate({ id: "compressed-baseline-invalid" })]
  });
  const baselineDir = path.join(tmp, "reports-data", "occurrences", "baseline-v1");
  const baselinePath = path.join(baselineDir, "2026-07.json.gz");
  await fs.mkdir(baselineDir, { recursive: true });
  const compressed = gzipSync(Buffer.from(`${JSON.stringify(store, null, 2)}\n`), { level: 9, mtime: 0 });
  await fs.writeFile(baselinePath, compressed);
  await writeBaselineManifest(tmp, [{ filePath: baselinePath, store, compressed }]);

  const mutatedStore = structuredClone(store);
  mutatedStore.occurrences[0].summary = "Manifest did not authorize this otherwise valid mutation.";
  const mutated = gzipSync(Buffer.from(`${JSON.stringify(mutatedStore, null, 2)}\n`), { level: 9, mtime: 0 });
  await fs.writeFile(baselinePath, mutated);
  await assert.rejects(
    buildPublicSignals({ rootDir: tmp, dataInputDir: "reports-data", outDir: "docs" }),
    (error) => error?.code === "occurrence_baseline_manifest_invalid"
  );

  await fs.rm(baselinePath);
  await assert.rejects(
    buildPublicSignals({ rootDir: tmp, dataInputDir: "reports-data", outDir: "docs" }),
    (error) => error?.code === "occurrence_baseline_manifest_invalid"
  );
});

test("public signal build fails closed when a required manifest and baseline directory are both missing", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-signal-baseline-deleted-"));
  await assert.rejects(
    buildPublicSignals({
      rootDir: tmp,
      dataInputDir: "reports-data",
      outDir: "docs",
      requireBaselineManifest: true
    }),
    (error) => error?.code === "occurrence_baseline_manifest_invalid"
  );
});

async function writeBaselineManifest(workspaceRoot, entries) {
  const files = entries.map(({ filePath, store, compressed }) => ({
    path: path.relative(workspaceRoot, filePath).split(path.sep).join("/"),
    report_date: store.report_date,
    occurrence_count: store.occurrence_count,
    sha256: createHash("sha256").update(compressed).digest("hex"),
    compressed_bytes: compressed.length
  }));
  const manifest = {
    schema_version: 1,
    kind: "public_signal_occurrence_baseline",
    source: { occurrence_count: files.reduce((sum, item) => sum + item.occurrence_count, 0) },
    migration: { production_reads_legacy_artifacts: false },
    files
  };
  await fs.writeFile(
    path.join(workspaceRoot, "reports-data", "occurrence-baseline-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return fs.readFile(path.join(rootDir, ...relativePath.split("/")), "utf8");
}
