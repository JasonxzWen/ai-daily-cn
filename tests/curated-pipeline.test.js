import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  aifyPayloadSequenceHash,
  collectAifyTodayPicks,
  parseAifyTodayPicksHtml,
  validatePersistedAifyTodayItem
} from "../src/aify-today-picks.js";
import {
  inspectCuratedShadowLineage,
  loadCuratedShadowCanonicalOwners,
  runCuratedSourceShadow,
  validateCuratedShadowArtifacts,
  writeJsonPairAtomic
} from "../src/curated-source-shadow.js";
import {
  classifySignalAdmission,
  cleanupExpiredSignalAdmissionTemp,
  loadSignalAdmissionContract
} from "../src/signal-admission.js";
import {
  buildSignalPoolArtifacts,
  computeSignalPoolHash,
  loadPriorSignalState,
  runSignalPoolShadow,
  validateSignalPoolArtifacts
} from "../src/signal-pool.js";
import { buildSignalSummary } from "../src/signal-summary.js";
import { buildDailyWorkflowStages, runDailyWorkflow } from "../src/daily-runner.js";
import { findRepoSafeReceiptPrivacyFindings, scanPublicArtifactsForLocalInfo } from "../src/privacy.js";
import { rawMaterialUrlHash, rawObservationContentHash } from "../src/raw-observation-integrity.js";
import { validateRawObservations } from "../src/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(
  __dirname,
  "fixtures",
  "product-contract",
  "production-regression-2026-07-15"
);

test("scheduled curated source and pool shadows run before legacy signal persistence", () => {
  const stages = buildDailyWorkflowStages({
    reportDate: "2026-07-16",
    publish: false,
    generatedAt: "2026-07-16T02:33:00.000Z"
  });
  const stageIds = stages.map((stage) => stage.id);
  const sourceShadowIndex = stageIds.indexOf("curated_source_shadow");
  const poolShadowIndex = stageIds.indexOf("signal_pool_shadow");
  const legacySignalIndex = stageIds.indexOf("signals_write");

  assert.notEqual(sourceShadowIndex, -1, "real daily workflow must schedule curated_source_shadow");
  assert.notEqual(poolShadowIndex, -1, "real daily workflow must schedule signal_pool_shadow");
  assert.notEqual(legacySignalIndex, -1, "legacy signal persistence remains scheduled");
  assert(sourceShadowIndex < poolShadowIndex, "pool admission must consume the completed source shadow");
  assert(poolShadowIndex < legacySignalIndex, "pool receipts must close before legacy signal persistence");
  assert.deepEqual(stages[poolShadowIndex].command, {
    tool: "node",
    args: [
      "src/cli.js",
      "signals:pool-shadow",
      "--date",
      "2026-07-16",
      "--generated-at",
      "2026-07-16T02:33:00.000Z",
      "--input",
      "reports-data",
      "--out",
      "reports-data",
      "--output",
      ".tmp/signal-pool-shadow-2026-07-16.json"
    ]
  });
});

test("curated shadow failure degrades without blocking the legacy publisher", async (t) => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-runner-"));
  t.after(() => fs.rm(launcherRoot, { recursive: true, force: true }));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(cleanRoot, { recursive: true });
  const calls = [];
  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-07-16",
    publish: false,
    retryDelayMs: 0,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      calls.push(stage.id);
      if (stage.id === "curated_source_shadow") {
        const error = new Error("curated_shadow_schema_validation_failed");
        error.code = "curated_shadow_schema_validation_failed";
        throw error;
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert(calls.includes("signals_write"), "legacy signal persistence must continue after shadow failure");
  assert.notEqual(result.summary.final_status, "blocked");
  assert.equal(result.summary.stages.find((stage) => stage.id === "curated_source_shadow").status, "degraded");
});

test("signal pool shadow failure degrades without blocking the legacy publisher", async (t) => {
  const launcherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adc-pool-runner-"));
  t.after(() => fs.rm(launcherRoot, { recursive: true, force: true }));
  const cleanRoot = path.join(launcherRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(cleanRoot, { recursive: true });
  const calls = [];
  const result = await runDailyWorkflow({
    launcherRoot,
    reportDate: "2026-07-16",
    publish: false,
    retryDelayMs: 0,
    prepareCleanWorktree: async () => ({
      ok: true,
      next_cwd: cleanRoot,
      remote_main_sha: "1111111111111111111111111111111111111111"
    }),
    runStage: async (stage) => {
      calls.push(stage.id);
      if (stage.id === "signal_pool_shadow") {
        const error = new Error("signal_pool_schema_validation_failed");
        error.code = "signal_pool_schema_validation_failed";
        throw error;
      }
      return { ok: true, output: { stage: stage.id } };
    }
  });

  assert(calls.includes("signals_write"), "legacy signal persistence must continue after pool shadow failure");
  assert.notEqual(result.summary.final_status, "blocked");
  assert.equal(result.summary.stages.find((stage) => stage.id === "signal_pool_shadow").status, "degraded");
});

test("Aify Today Picks parser preserves the upstream ordered editorial payload", async () => {
  const html = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const result = parseAifyTodayPicksHtml(html, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html; charset=utf-8"
  });

  assert.equal(result.status, "success_with_items");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    title: "Anthropic 发布多智能体研究系统的工程实践",
    url: "https://www.anthropic.com/engineering/multi-agent-research-system",
    summary: "Anthropic 复盘如何用编排器、并行子智能体与评估体系构建可复用的深度研究 harness。",
    date: "2026-07-16",
    source: "Anthropic Engineering",
    quality_score: 90,
    flavors: ["拆解", "实战"],
    domain: "基础模型与算力技术栈",
    channels_l1: ["AI 工程栈"],
    channels_l2: ["Agent 工程实践"],
    companies: ["Anthropic"],
    products: ["Claude"],
    upstream_tags: ["拆解", "实战", "基础模型与算力技术栈", "AI 工程栈", "Agent 工程实践"],
    upstream_selection_date: "2026-07-16",
    upstream_position: 1,
    upstream_positions: [1],
    upstream_payload_hash: result.items[0].upstream_payload_hash,
    upstream_snapshot_hash: result.upstream_snapshot_hash
  });
  assert.match(result.items[0].upstream_payload_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.upstream_snapshot_hash, /^sha256:[a-f0-9]{64}$/);
  const payloadHashTamper = structuredClone(result.items[0]);
  payloadHashTamper.upstream_payload_hash = `sha256:${"f".repeat(64)}`;
  assert.deepEqual(validatePersistedAifyTodayItem(payloadHashTamper, { reportDate: "2026-07-16" }), {
    valid: false,
    reason: "persisted_payload_mismatch"
  });
  assert.equal(Object.hasOwn(result, "html"), false, "the homepage body must never be persisted");
});

test("Aify payload sequence receipt binds each canonical payload to its upstream position", () => {
  const snapshotHash = `sha256:${"a".repeat(64)}`;
  const upstreamItems = [
    {
      upstream_position: 1,
      upstream_positions: [1],
      upstream_payload_hash: `sha256:${"b".repeat(64)}`,
      upstream_snapshot_hash: snapshotHash,
      upstream_selection_date: "2026-07-16"
    },
    {
      upstream_position: 2,
      upstream_positions: [2],
      upstream_payload_hash: `sha256:${"c".repeat(64)}`,
      upstream_snapshot_hash: snapshotHash,
      upstream_selection_date: "2026-07-16"
    }
  ];
  const rawObservations = {
    observations: upstreamItems.map((upstream, index) => ({
      id: `raw-sequence-${index + 1}`,
      source_id: "aify_today_picks",
      collector: { id: "aify_today_picks" },
      upstream
    }))
  };
  const sourceFunnel = {
    lanes: [{
      lane_id: "aify_today_picks",
      source_entry_ids: ["aify_today_picks"],
      stages: { parsed: { item_ids: ["raw-sequence-1", "raw-sequence-2"] } },
      collector_receipt: {
        upstream_snapshot_hash: snapshotHash,
        upstream_selection_date: "2026-07-16",
        upstream_payload_sequence_hash: aifyPayloadSequenceHash(upstreamItems)
      }
    }]
  };
  assert.equal(inspectCuratedShadowLineage(rawObservations, sourceFunnel).valid, true);

  const swapped = structuredClone(rawObservations);
  [swapped.observations[0].upstream.upstream_position, swapped.observations[1].upstream.upstream_position] = [2, 1];
  [swapped.observations[0].upstream.upstream_positions, swapped.observations[1].upstream.upstream_positions] = [[2], [1]];
  const lineage = inspectCuratedShadowLineage(swapped, sourceFunnel);
  assert.equal(lineage.valid, false);
  assert.deepEqual(lineage.aify_payload_sequence_mismatch_ids, ["raw-sequence-1", "raw-sequence-2"]);
});

test("Aify Today Picks isolates credential and secret-bearing upstream URLs", async () => {
  const html = `<!doctype html><main>今日精选</main><script>
    const ARTICLES_TODAY = [{"title":"Unsafe item","url":"https://reader:secret@example.com/post?token=leak","summary":"A detailed engineering summary.","date":"2026-07-16","source":"Example Engineering","quality_score":90,"flavors":["engineering"],"domain":"agents","channels_l1":["engineering"],"channels_l2":["agents"],"companies":[],"products":[]}];
    const SITE = {"last_updated":"2026-07-16"};
  </script>`;
  const result = parseAifyTodayPicksHtml(html, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });

  assert.equal(result.status, "failed");
  assert.equal(result.items.length, 0);
  assert.equal(result.rejected_items[0].reason, "material_url_unsafe");
  assert.equal(JSON.stringify(result).includes("reader:secret"), false);
  assert.equal(JSON.stringify(result).includes("token=leak"), false);

  const secretFragment = parseAifyTodayPicksHtml(html.replace(
    "https://reader:secret@example.com/post?token=leak",
    "https://example.com/post#token=fragment-leak"
  ), {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(secretFragment.rejected_items[0].reason, "material_url_unsafe");
  assert.equal(JSON.stringify(secretFragment).includes("fragment-leak"), false);

  const secretText = parseAifyTodayPicksHtml(html.replace(
    "A detailed engineering summary.",
    "Authorization: Bearer ghp_FAKESECRET0123456789 must never persist."
  ).replace("https://reader:secret@example.com/post?token=leak", "https://example.com/post"), {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(secretText.items.length, 0);
  assert.equal(secretText.rejected_items[0].reason, "secret_text");
  assert.equal(JSON.stringify(secretText).includes("FAKESECRET"), false);
});

test("Aify Today Picks ignores assignment bait inside strings, templates, and comments", () => {
  const bait = `<!doctype html><main>今日精选</main><script>
    const stringBait = "const ARTICLES_TODAY = []";
    const templateBait = \`const SITE = {"last_updated":"2026-07-16"}\`;
    // const ARTICLES_TODAY = [];
    /* const SITE = {"last_updated":"2026-07-16"}; */
  </script>`;
  const result = parseAifyTodayPicksHtml(bait, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_reason, "articles_today_missing");
});

test("Aify Today Picks ignores assignments rendered as visible HTML text", async () => {
  const fixture = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const visibleBait = fixture.replace("<script>", "<pre>").replace("</script>", "</pre>");
  const result = parseAifyTodayPicksHtml(visibleBait, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_reason, "articles_today_missing");
});

test("Aify Today Picks ignores assignments in non-executable data scripts", async () => {
  const fixture = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const dataOnly = fixture.replace("<script>", "<main>今日精选</main><script type=\"application/json\">");
  const result = parseAifyTodayPicksHtml(dataOnly, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_reason, "articles_today_missing");

  const externalScript = fixture.replace("<script>", "<main>今日精选</main><script src=\"/app.js\">");
  const externalResult = parseAifyTodayPicksHtml(externalScript, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(externalResult.status, "failed");
  assert.equal(externalResult.failure_reason, "articles_today_missing");
});

test("Aify collector times out independently of the daily stage timeout", async () => {
  const result = await collectAifyTodayPicks({
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    fetchTimeoutMs: 5,
    fetchImpl: async (_url, request) => new Promise((resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { code: "ABORT_ERR" })), { once: true });
    })
  });
  assert.equal(result.content_lane.status, "blocked");
  assert.equal(result.content_lane.failure_reason, "fetch_timeout");
});

test("Aify Today Picks ignores assignment bait inside regular-expression literals", () => {
  const options = {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  };
  const regexOnly = `<!doctype html><main>今日精选</main><script>
    const articlePattern = /const ARTICLES_TODAY = []/;
    const sitePattern = /const SITE = {"last_updated":"2026-07-16"}/;
  </script>`;
  const missing = parseAifyTodayPicksHtml(regexOnly, options);
  assert.equal(missing.status, "failed");
  assert.equal(missing.failure_reason, "articles_today_missing");

  const beforeRealAssignments = regexOnly.replace(
    "</script>",
    'const ARTICLES_TODAY = []; const SITE = {"last_updated":"2026-07-16"};</script>'
  );
  const healthyEmpty = parseAifyTodayPicksHtml(beforeRealAssignments, options);
  assert.equal(healthyEmpty.status, "healthy_empty");
  assert.equal(healthyEmpty.failure_reason, "");

  const returnRegexOnly = regexOnly.replace(
    "const articlePattern =",
    "function articlePattern() { return"
  ).replace(
    ";\n    const sitePattern =",
    "; } function sitePattern() { return"
  ).replace(";\n  </script>", "; }</script>");
  const returnMissing = parseAifyTodayPicksHtml(returnRegexOnly, options);
  assert.equal(returnMissing.status, "failed");
  assert.equal(returnMissing.failure_reason, "articles_today_missing");

  const controlFlowRegex = `<!doctype html><main>今日精选</main><script>
    if (true) /const ARTICLES_TODAY = []/.test('x');
    if (true) /const SITE = {"last_updated":"2026-07-16"}/.test('x');
  </script>`;
  assert.equal(parseAifyTodayPicksHtml(controlFlowRegex, options).failure_reason, "articles_today_missing");

  const htmlCommentBait = `<!doctype html><main>今日精选</main><script>
    <!-- const ARTICLES_TODAY = [];
    <!-- const SITE = {"last_updated":"2026-07-16"};
  </script>`;
  assert.equal(parseAifyTodayPicksHtml(htmlCommentBait, options).failure_reason, "articles_today_missing");

  const localScopeBait = `<!doctype html><main>今日精选</main><script>
    function bait() { const ARTICLES_TODAY = []; const SITE = {"last_updated":"2026-07-16"}; }
  </script>`;
  assert.equal(parseAifyTodayPicksHtml(localScopeBait, options).failure_reason, "articles_today_missing");
});

test("Aify Today Picks fails closed on missing, duplicate, and stale homepage structure", async () => {
  const fixture = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const cases = [
    ["articles_today_missing", fixture.replace("const ARTICLES_TODAY", "const ARTICLES_ARCHIVE")],
    ["articles_today_duplicate", fixture.replace("let ARTICLES = ARTICLES_TODAY;", "const ARTICLES_TODAY = [];\nlet ARTICLES = ARTICLES_TODAY;")],
    ["snapshot_stale", fixture.replace('"last_updated":"2026-07-16"', '"last_updated":"2026-07-15"')],
    ["today_section_marker_missing", fixture.replace("今日精选", "今日归档")]
  ];
  for (const [failureReason, html] of cases) {
    const result = parseAifyTodayPicksHtml(html, {
      reportDate: "2026-07-16",
      sourceUrl: "https://aify-news.pages.dev/",
      responseUrl: "https://aify-news.pages.dev/",
      contentType: "text/html"
    });
    assert.equal(result.status, "failed", failureReason);
    assert.equal(result.failure_reason, failureReason);
    assert.equal(result.items.length, 0);
  }
});

test("Aify Today Picks ignores Today Picks marker bait inside script comments", async () => {
  const fixture = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const withoutMarker = fixture.replaceAll("今日精选", "今日归档");
  const commentBait = withoutMarker.replace(
    "</script>",
    `// { id: "today", name: "今日精选" }
     /* class="np-title">今日精选</ */
     </script>`
  );
  const result = parseAifyTodayPicksHtml(commentBait, {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_reason, "today_section_marker_missing");
});

test("Aify Today Picks rejects placeholders, instructions, HTML, and non-content endpoints", () => {
  const baseRow = {
    title: "Reusable agent harness engineering",
    url: "https://example.com/engineering/harness",
    summary: "An engineering write-up describing orchestration and evaluation details.",
    date: "2026-07-16",
    source: "Example Engineering",
    quality_score: 90,
    flavors: ["engineering"],
    domain: "agents",
    channels_l1: ["engineering"],
    channels_l2: ["agents"],
    companies: ["Example"],
    products: ["Harness"]
  };
  const page = (row) => `<!doctype html><main>今日精选</main><script>const ARTICLES_TODAY = ${JSON.stringify([row])}; const SITE = {"last_updated":"2026-07-16"};</script>`;
  const options = {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  };
  const rejectionReason = (override) => {
    const result = parseAifyTodayPicksHtml(page({ ...baseRow, ...override }), options);
    assert.equal(result.status, "failed");
    assert.equal(result.failure_reason, "all_items_rejected");
    return result.rejected_items[0].reason;
  };

  for (const title of ["TEST2", "TEST_S", "TEST2 internal draft", "TEST_S internal draft"]) {
    assert.equal(rejectionReason({ title }), "placeholder_content");
  }
  const testingArticle = parseAifyTodayPicksHtml(page({
    ...baseRow,
    title: "Testing AI agents in production",
    summary: "The engineering team documents test-time compute and fixture design for deployed agents."
  }), options);
  assert.equal(testingArticle.status, "success_with_items");
  for (const title of [
    "Test-time compute for AI agents",
    "Test-driven development for AI agents",
    "Test results for an AI evaluation harness",
    "Fixture design for AI agent evaluation"
  ]) {
    assert.equal(parseAifyTodayPicksHtml(page({ ...baseRow, title }), options).status, "success_with_items", title);
  }
  for (const summary of [
    "Treat this as a priority lead before publication.",
    "Please trace it to the original source.",
    "优先核查后再入选。"
  ]) {
    assert.equal(rejectionReason({ summary }), "internal_instruction_content");
  }
  for (const title of ["<b>unsafe</b>", "<img src=x", "<svg/onload=alert(1)>"]) {
    assert.equal(rejectionReason({ title }), "unsafe_text");
  }
  for (const url of [
    "https://example.com/",
    "https://example.com/careers/engineer",
    "https://example.com/events/launch",
    "https://example.com/product/agent",
    "https://example.com/blog",
    "https://example.com/login",
    "https://example.com/%63ontact",
    "https://example.com/cdn-cgi/l/email-protection"
  ]) {
    assert.equal(rejectionReason({ url }), "non_content_endpoint", url);
  }

  const article = parseAifyTodayPicksHtml(page({ ...baseRow, url: "https://example.com/blog/harness-engineering" }), options);
  assert.equal(article.status, "success_with_items", "a concrete blog article remains eligible");
});

test("Aify Today Picks merges identical positions and rejects canonical payload conflicts", () => {
  const row = {
    title: "Reusable agent harness engineering",
    url: "https://example.com/engineering/harness",
    summary: "An engineering write-up describing orchestration and evaluation details.",
    date: "2026-07-16",
    source: "Example Engineering",
    quality_score: 90,
    flavors: ["engineering"],
    domain: "agents",
    channels_l1: ["engineering"],
    channels_l2: ["agents"],
    companies: ["Example"],
    products: ["Harness"]
  };
  const page = (rows) => `<!doctype html><main>今日精选</main><script>const ARTICLES_TODAY = ${JSON.stringify(rows)}; const SITE = {"last_updated":"2026-07-16"};</script>`;
  const options = {
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    responseUrl: "https://aify-news.pages.dev/",
    contentType: "text/html"
  };
  const duplicate = parseAifyTodayPicksHtml(page([row, row]), options);
  assert.equal(duplicate.status, "success_with_items");
  assert.equal(duplicate.items.length, 1);
  assert.deepEqual(duplicate.items[0].upstream_positions, [1, 2]);

  const conflict = parseAifyTodayPicksHtml(page([row, { ...row, summary: "A materially different payload for the same canonical URL." }]), options);
  assert.equal(conflict.status, "failed");
  assert.equal(conflict.items.length, 0);
  assert.deepEqual(conflict.rejected_items.map((item) => item.reason), [
    "canonical_url_payload_conflict",
    "canonical_url_payload_conflict"
  ]);

  const invalidTypes = parseAifyTodayPicksHtml(page([{ ...row, flavors: ["engineering", 42] }]), options);
  assert.equal(invalidTypes.status, "failed");
  assert.equal(invalidTypes.rejected_items[0].reason, "upstream_field_type_invalid");

  const unsafeFields = parseAifyTodayPicksHtml(page([
    { ...row, url: "https://example.com/blank-title", title: "   " },
    { ...row, url: " https://example.com/padded-url " },
    { ...row, url: "https://example.com/secret-flavor", flavors: ["Bearer ghp_FAKESECRET0123456789"] },
    { ...row, url: "https://example.com/secret-company", companies: ["Authorization: Bearer ghp_FAKESECRET0123456789"] }
  ]), options);
  assert.equal(unsafeFields.status, "failed");
  assert.deepEqual(unsafeFields.rejected_items.map((item) => item.reason), [
    "title_missing",
    "material_url_unsafe",
    "secret_text",
    "secret_text"
  ]);
  assert.equal(JSON.stringify(unsafeFields).includes("FAKESECRET"), false);

  const orderedQueryUrl = "https://mp.weixin.qq.com/s?__biz=abc&mid=2&idx=1&sn=safe";
  const safeQuery = parseAifyTodayPicksHtml(page([{ ...row, url: orderedQueryUrl }]), options);
  assert.equal(safeQuery.status, "success_with_items");
  assert.equal(safeQuery.items[0].url, orderedQueryUrl, "safe upstream material URLs remain byte-preserving");
});

test("Aify site health records fetched but not parsed when the Today Picks structure is stale", async () => {
  const fixture = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const stale = fixture.replace('"last_updated":"2026-07-16"', '"last_updated":"2026-07-15"');
  const result = await collectAifyTodayPicks({
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://aify-news.pages.dev/",
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
      text: async () => stale
    })
  });
  assert.equal(result.site_health.fetched_count, 1);
  assert.equal(result.site_health.parsed_count, 0);
  assert.equal(result.site_health.status, "failed");
  assert.equal(result.site_health.failure_reason, "snapshot_stale");
});

test("Aify site health stays healthy when valid structure contains only item-level rejections", async () => {
  const html = `<!doctype html><main>今日精选</main><script>
    const ARTICLES_TODAY = [{"title":"   ","url":"https://example.com/item","summary":"A concrete summary.","date":"2026-07-16","source":"Example","quality_score":90,"flavors":["engineering"],"domain":"agents","channels_l1":[],"channels_l2":[],"companies":[],"products":[]}];
    const SITE = {"last_updated":"2026-07-16"};
  </script>`;
  const result = await collectAifyTodayPicks({
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      url: "https://aify-news.pages.dev/",
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null },
      text: async () => html
    })
  });
  assert.equal(result.content_lane.status, "failed");
  assert.equal(result.content_lane.failure_reason, "all_items_rejected");
  assert.equal(result.site_health.status, "success_with_items");
  assert.equal(result.site_health.parsed_count, 1);
  assert.equal(result.site_health.failure_reason, "");
});

test("Aify transport blocks same-host redirects that carry credentials or secrets", async () => {
  const requests = [];
  const result = await collectAifyTodayPicks({
    reportDate: "2026-07-16",
    sourceUrl: "https://aify-news.pages.dev/",
    fetchImpl: async (url) => {
      requests.push(String(url));
      return {
        ok: false,
        status: 302,
        headers: { get: (name) => name.toLowerCase() === "location" ? "https://user:pass@aify-news.pages.dev/?token=leak" : null }
      };
    }
  });

  assert.equal(requests.length, 1, "unsafe redirect must be rejected before a second request");
  assert.equal(result.site_health.status, "blocked");
  assert.equal(result.site_health.failure_reason, "redirect_url_unsafe");
  assert.equal(JSON.stringify(result).includes("user:pass"), false);
  assert.equal(JSON.stringify(result).includes("token=leak"), false);
});

test("curated shadow rejects repository paths that traverse a directory link", async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-owned-path-"));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const rootDir = path.join(parent, "repository");
  const outsideDir = path.join(parent, "outside");
  const linkedDir = path.join(rootDir, "linked-input");
  await fs.mkdir(rootDir, { recursive: true });
  await fs.mkdir(outsideDir, { recursive: true });
  await fs.writeFile(path.join(outsideDir, "input.json"), "{}\n", "utf8");
  try {
    await fs.symlink(outsideDir, linkedDir, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
      t.skip(`directory links are unavailable in this environment: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [path.join(linkedDir, "input.json")]
    }),
    { code: "curated_shadow_input_outside_repository" }
  );
});

test("curated shadow pair writer rolls both receipts back when the second finalize fails", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-pair-rollback-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const rawPath = path.join(rootDir, "raw.json");
  const funnelPath = path.join(rootDir, "funnel.json");
  const previousRaw = "{\"version\":\"old-raw\"}\n";
  const previousFunnel = "{\"version\":\"old-funnel\"}\n";
  await fs.writeFile(rawPath, previousRaw, "utf8");
  await fs.writeFile(funnelPath, previousFunnel, "utf8");
  let renameCalls = 0;
  const fileSystem = {
    ...fs,
    rename: async (...args) => {
      renameCalls += 1;
      if (renameCalls === 4) {
        const error = new Error("injected second finalize failure");
        error.code = "EIO";
        throw error;
      }
      return fs.rename(...args);
    }
  };

  await assert.rejects(
    writeJsonPairAtomic([
      [rawPath, { version: "new-raw" }],
      [funnelPath, { version: "new-funnel" }]
    ], fileSystem),
    { code: "EIO" }
  );
  assert.equal(await fs.readFile(rawPath, "utf8"), previousRaw);
  assert.equal(await fs.readFile(funnelPath, "utf8"), previousFunnel);
  assert.deepEqual((await fs.readdir(rootDir)).sort(), ["funnel.json", "raw.json"]);
});

test("curated shadow pair writer reports rollback failure and retains the recoverable backup", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-pair-rollback-failure-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const rawPath = path.join(rootDir, "raw.json");
  const funnelPath = path.join(rootDir, "funnel.json");
  await fs.writeFile(rawPath, "old raw\n", "utf8");
  await fs.writeFile(funnelPath, "old funnel\n", "utf8");
  let renameCalls = 0;
  const fileSystem = {
    ...fs,
    rename: async (...args) => {
      renameCalls += 1;
      if (renameCalls === 4 || renameCalls === 6) {
        const error = new Error(renameCalls === 4 ? "injected finalize failure" : "injected restore failure");
        error.code = renameCalls === 4 ? "EIO" : "EPERM";
        throw error;
      }
      return fs.rename(...args);
    }
  };

  await assert.rejects(
    writeJsonPairAtomic([
      [rawPath, { version: "new-raw" }],
      [funnelPath, { version: "new-funnel" }]
    ], fileSystem),
    { code: "curated_shadow_pair_rollback_failed" }
  );
  const recoveryFiles = await fs.readdir(rootDir);
  assert(recoveryFiles.some((name) => name.startsWith("raw.json.") && name.endsWith(".backup")));
  assert(recoveryFiles.some((name) => name.endsWith(".tmp")), "a strict recovery marker remains after rollback failure");
  assert.equal(await fs.readFile(funnelPath, "utf8"), "old funnel\n");
});

test("curated source shadow persists repo-safe raw and 186/24/24 funnel receipts", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-shadow-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const repositoryRoot = path.resolve(__dirname, "..");
  await fs.mkdir(path.join(rootDir, "config"), { recursive: true });
  await fs.cp(path.join(repositoryRoot, "config", "sources"), path.join(rootDir, "config", "sources"), { recursive: true });
  await fs.copyFile(
    path.join(repositoryRoot, "config", "source-display-contract.json"),
    path.join(rootDir, "config", "source-display-contract.json")
  );
  await fs.copyFile(
    path.join(repositoryRoot, "config", "signal-admission-contract.json"),
    path.join(rootDir, "config", "signal-admission-contract.json")
  );
  await fs.mkdir(path.join(rootDir, "docs"), { recursive: true });
  await fs.copyFile(
    path.join(repositoryRoot, "docs", "source-order-tuning-review.md"),
    path.join(rootDir, "docs", "source-order-tuning-review.md")
  );
  await fs.mkdir(path.join(rootDir, "tasks"), { recursive: true });
  await fs.copyFile(
    path.join(repositoryRoot, "tasks", "project-recovery-ledger.md"),
    path.join(rootDir, "tasks", "project-recovery-ledger.md")
  );
  await fs.mkdir(path.join(rootDir, ".tmp"), { recursive: true });
  const discoveryPath = path.join(rootDir, ".tmp", "curated-tracer-input.json");
  await fs.copyFile(path.join(fixtureRoot, "discovery-input.json"), discoveryPath);
  const activeAifyPath = path.join(rootDir, "config", "sources", "aify-news.json");
  const activeAifyBefore = await fs.readFile(activeAifyPath);
  const aifyHtml = await fs.readFile(path.join(fixtureRoot, "aify-home.html"), "utf8");
  const unsafeAifyRow = {
    title: "Unsafe Aify row",
    url: "https://reader:secret@example.com/post?token=leak",
    summary: "This row must be isolated without persisting its unsafe URL.",
    date: "2026-07-16",
    source: "Unsafe source",
    quality_score: 1,
    flavors: ["test"],
    domain: "test",
    channels_l1: [],
    channels_l2: [],
    companies: [],
    products: []
  };
  const aifyHtmlWithRejectedRow = aifyHtml.replace("}];", `},${JSON.stringify(unsafeAifyRow)}];`);
  assert.notEqual(aifyHtmlWithRejectedRow, aifyHtml, "fixture must include the rejected upstream row");
  const aifyResult = {
    source_url: "https://aify-news.pages.dev/",
    site_health: {
      lane_id: "site-aify-news",
      logical_source_id: "aify-news",
      source_entry_id: "site-aify-news",
      status: "success_with_items",
      failure_reason: "",
      http_status: 200,
      response_url: "https://aify-news.pages.dev/",
      response_bytes: Buffer.byteLength(aifyHtml),
      redirect_count: 0,
      fetched_count: 1,
      parsed_count: 1
    },
    content_lane: {
      ...parseAifyTodayPicksHtml(aifyHtmlWithRejectedRow, {
        reportDate: "2026-07-16",
        sourceUrl: "https://aify-news.pages.dev/",
        responseUrl: "https://aify-news.pages.dev/",
        contentType: "text/html; charset=utf-8"
      }),
      fetched_count: 1,
      parsed_count: 1,
      cache_fallback_used: false
    }
  };

  const inconsistentAifyResult = structuredClone(aifyResult);
  inconsistentAifyResult.content_lane.input_count += 1;
  await assert.rejects(
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [discoveryPath],
      aifyResult: inconsistentAifyResult,
      outputDir: "reports-data-inconsistent-aify"
    }),
    { code: "curated_shadow_aify_receipt_invalid" }
  );

  const result = await runCuratedSourceShadow({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    inputPaths: [discoveryPath],
    aifyResult,
    outputDir: "reports-data"
  });
  const raw = JSON.parse(await fs.readFile(result.raw_observations_path, "utf8"));
  const funnel = JSON.parse(await fs.readFile(result.source_funnel_path, "utf8"));
  const admissionContract = await loadSignalAdmissionContract({ rootDir });

  const deterministicDiscovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
  const githubCandidate = deterministicDiscovery.candidates.find((item) => item.observation_id === "github-trending-vshulcz-deja-vu-2026-07-16");
  const deterministicTags = Array.from({ length: 40 }, (_, index) => `tag-${String(index).padStart(2, "0")}`);
  githubCandidate.content_tags = deterministicTags;
  deterministicDiscovery.candidates.push({
    ...structuredClone(githubCandidate),
    id: `${githubCandidate.id}-duplicate`,
    url: githubCandidate.url.endsWith("/") ? githubCandidate.url.slice(0, -1) : `${githubCandidate.url}/`,
    content_tags: [...deterministicTags].reverse(),
    source_synopsis: "A second source metadata record describes the same AI repository with deterministic recovery and shared memory behavior."
  });
  const longOriginalTextCandidate = deterministicDiscovery.candidates.find((item) => item.observation_id === "x-simonw-2077545830802976796");
  longOriginalTextCandidate.original_text = "The AI runtime documents deterministic checkpoint recovery and isolated execution. ".repeat(20);
  const forwardPath = path.join(rootDir, ".tmp", "deterministic-forward.json");
  const reversePath = path.join(rootDir, ".tmp", "deterministic-reverse.json");
  await Promise.all([
    fs.writeFile(forwardPath, `${JSON.stringify(deterministicDiscovery, null, 2)}\n`, "utf8"),
    fs.writeFile(reversePath, `${JSON.stringify({
      ...deterministicDiscovery,
      candidates: [...deterministicDiscovery.candidates].reverse()
    }, null, 2)}\n`, "utf8")
  ]);
  const [forwardResult, reverseResult] = await Promise.all([
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [forwardPath],
      aifyResult,
      outputDir: "reports-data-deterministic-forward"
    }),
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [reversePath],
      aifyResult,
      outputDir: "reports-data-deterministic-reverse"
    })
  ]);
  const [forwardRaw, reverseRaw] = await Promise.all([
    fs.readFile(forwardResult.raw_observations_path, "utf8").then(JSON.parse),
    fs.readFile(reverseResult.raw_observations_path, "utf8").then(JSON.parse)
  ]);
  assert.deepEqual(forwardRaw.observations, reverseRaw.observations, "duplicate provenance selection must be input-order independent");
  const deterministicGithubRaw = forwardRaw.observations.find((item) => item.observation_id === githubCandidate.observation_id);
  assert.equal(deterministicGithubRaw.material_url, githubCandidate.url);
  assert.deepEqual(deterministicGithubRaw.content_tags, deterministicTags.slice(0, 32));
  assert(
    forwardRaw.observations.find((item) => item.observation_id === longOriginalTextCandidate.observation_id).excerpt.length <= 360,
    "persistent raw observations must keep only a bounded source excerpt"
  );

  assert.equal(raw.observation_count, 13);
  assert.equal(raw.input_record_count, 14);
  assert.equal(raw.rejection_count, 1);
  assert.deepEqual(raw.rejections, [{
    source_id: "aify_today_picks",
    upstream_position: 2,
    reason: "material_url_unsafe",
    upstream_payload_hash: raw.rejections[0].upstream_payload_hash
  }]);
  assert.equal(JSON.stringify(raw).includes("reader:secret"), false);
  assert.equal(JSON.stringify(raw).includes("token=leak"), false);
  const aifyObservation = raw.observations.find((item) => item.source_id === "aify_today_picks");
  assert.equal(aifyObservation.title, "Anthropic 发布多智能体研究系统的工程实践");
  assert.equal(aifyObservation.excerpt, "Anthropic 复盘如何用编排器、并行子智能体与评估体系构建可复用的深度研究 harness。");
  assert.equal(aifyObservation.upstream.title, aifyObservation.title);
  assert.equal(aifyObservation.upstream.summary, aifyObservation.excerpt);
  assert.equal(aifyObservation.upstream.url, aifyObservation.material_url);
  assert.equal(aifyObservation.upstream.date, aifyObservation.event_date);
  assert.deepEqual(aifyObservation.upstream.upstream_tags, ["拆解", "实战", "基础模型与算力技术栈", "AI 工程栈", "Agent 工程实践"]);
  assert.equal(Object.hasOwn(raw, "html"), false);
  assert.equal(aifyObservation.event_date_origin, "upstream_editorial");
  assert.equal(aifyObservation.excerpt_origin, "upstream_editorial");
  assert.equal(aifyObservation.excerpt_hash, testSha256(aifyObservation.excerpt));
  assert.equal(aifyObservation.content_format_hint, "hot_blog");
  assert.equal(aifyObservation.access_state, "direct");
  const xObservation = raw.observations.find((item) => item.observation_id === "x-simonw-2077545830802976796");
  assert.equal(xObservation.excerpt, "The self-contained terminal Mermaid renderer is a fascinating part of the repository.");
  assert.equal(xObservation.excerpt_origin, "source_original_text");
  assert.equal(xObservation.excerpt_hash, testSha256(xObservation.excerpt));
  const rawIntegrityTamperCases = [
    (target) => { target.material_url_hash = rawMaterialUrlHash("https://example.com/forged-material"); },
    (target) => {
      target.excerpt = `${target.excerpt} forged`;
      target.excerpt_hash = testSha256(target.excerpt);
    },
    (target) => { target.excerpt_origin = "legacy_candidate_copy"; }
  ];
  for (const mutate of rawIntegrityTamperCases) {
    const tamperedRaw = structuredClone(raw);
    mutate(tamperedRaw.observations.find((item) => item.observation_id === xObservation.observation_id));
    assert.equal(validateRawObservations(tamperedRaw).valid, false, "URL, excerpt and provenance must stay bound to content_hash");
  }
  const forgedNonAifyUpstream = structuredClone(raw);
  const forgedTarget = forgedNonAifyUpstream.observations.find((item) => item.observation_id === xObservation.observation_id);
  forgedTarget.upstream = {
    ...structuredClone(aifyObservation.upstream),
    title: forgedTarget.title,
    summary: forgedTarget.excerpt,
    url: forgedTarget.material_url,
    date: forgedTarget.event_date
  };
  assert.equal(validateRawObservations(forgedNonAifyUpstream).valid, false, "only Aify observations may carry trusted upstream payloads");
  const forgedAifyRaw = structuredClone(raw);
  const forgedAify = forgedAifyRaw.observations.find((item) => item.source_id === "aify_today_picks");
  forgedAify.title = "TEST2";
  forgedAify.excerpt = "TEST_S";
  forgedAify.excerpt_hash = testSha256(forgedAify.excerpt);
  forgedAify.upstream.title = forgedAify.title;
  forgedAify.upstream.summary = forgedAify.excerpt;
  forgedAify.content_hash = rawObservationContentHash(forgedAify);
  assert.equal(validateRawObservations(forgedAifyRaw).valid, false, "persisted Aify receipts must replay the mechanical content gate");
  assert.equal(
    classifySignalAdmission(forgedAify, { reportDate: "2026-07-16", contract: admissionContract }).reason_code,
    "test_or_placeholder"
  );
  assert.equal(buildSignalSummary({
    signalId: "sig_aaaaaaaaaaaaaaaaaaaaaaaa",
    observations: [forgedAify],
    contract: admissionContract
  }).status, "failed");
  const forgedAifyPublisher = structuredClone(raw);
  forgedAifyPublisher.observations.find((item) => item.source_id === "aify_today_picks").upstream.source = "Forged Publisher";
  assert.equal(validateRawObservations(forgedAifyPublisher).valid, false, "raw content integrity must bind trusted upstream publisher data");
  const noLinkObservation = raw.observations.find((item) => item.observation_id === "anthropic-harness-manual-2026-07-16");
  assert.equal(noLinkObservation.collector.url, null, "collector URL must never fall back to the material URL");
  assert.equal(noLinkObservation.event_date_origin, "source");
  const undatedObservation = raw.observations.find((item) => item.observation_id === "example-undated-model-note-2026-07-16");
  assert.equal(undatedObservation.event_date_origin, "report_date_fallback");

  const expectedAdmission = JSON.parse(await fs.readFile(path.join(fixtureRoot, "admission-expected.json"), "utf8"));
  const built = await buildSignalPoolArtifacts({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    rawObservations: raw,
    sourceFunnel: funnel
  });
  const reversed = await buildSignalPoolArtifacts({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    rawObservations: { ...raw, observations: [...raw.observations].reverse() },
    sourceFunnel: funnel
  });
  assert.equal(JSON.stringify(reversed), JSON.stringify(built), "pool IDs, decisions, ordering and JSON must be input-order independent");
  assert.equal(
    built.signalPool.input_observation_count,
    built.signalPool.disposition_counts.admitted + built.signalPool.disposition_counts.rejected + built.signalPool.disposition_counts.needs_review
  );
  assert.deepEqual(built.signalPool.disposition_counts, { admitted: 7, rejected: 5, needs_review: 1 });
  assert.equal(built.signalPool.pre_admission_receipts.length, 1);
  assert.equal(built.signalPool.pre_admission_receipts[0].source_reason, "material_url_unsafe");
  assert.equal(built.signalPool.pre_admission_receipts[0].reason_code, "unsafe_url");
  assert.equal(built.signalPool.signal_count, 5);
  assert.equal(built.publicSignalPool.item_count, 4);
  const admissionByObservation = new Map(built.signalPool.admission_receipts.map((item) => [item.observation_id, item]));
  for (const [observationId, expected] of Object.entries(expectedAdmission.expected_by_observation_id)) {
    const actual = admissionByObservation.get(observationId);
    assert(actual, `${observationId} must have exactly one admission receipt`);
    assert.equal(actual.disposition, expected.disposition, observationId);
    if (expected.reason_code) assert.equal(actual.reason_code, expected.reason_code, observationId);
  }
  const aifyAdmission = built.signalPool.admission_receipts.find((item) => item.source_id === expectedAdmission.expected_aify.source_id);
  assert.equal(aifyAdmission.disposition, "admitted");
  const anthropicSignal = built.signalPool.signals.find((item) => item.material_url === aifyObservation.upstream.url);
  assert(anthropicSignal, "Aify and ordinary observations for the same canonical URL must form one signal");
  assert.equal(anthropicSignal.title, aifyObservation.upstream.title);
  assert.equal(anthropicSignal.source_summary, aifyObservation.upstream.summary);
  assert.equal(anthropicSignal.publisher.name, aifyObservation.upstream.source);
  assert.equal(anthropicSignal.summary_status, "ready");
  assert.equal(anthropicSignal.summary_origin, "upstream_editorial");
  assert.equal(anthropicSignal.editorial_ready, true);
  assert.equal(anthropicSignal.review_policy, "aify_today_passthrough_v1");
  assert.deepEqual(anthropicSignal.upstream_tags, aifyObservation.upstream.upstream_tags);
  assert.equal(anthropicSignal.upstream_position, aifyObservation.upstream.upstream_position);
  assert.equal(anthropicSignal.upstream_payload_hash, aifyObservation.upstream.upstream_payload_hash);
  assert.equal(anthropicSignal.upstream_snapshot_hash, aifyObservation.upstream.upstream_snapshot_hash);
  assert.equal(anthropicSignal.editorial_source.name, "Aify News");
  assert.equal(anthropicSignal.editorial_source.url, "https://aify-news.pages.dev/");
  assert.equal(anthropicSignal.observation_refs.length, 3);
  assert.equal(anthropicSignal.collected_via.length, 3);
  assert(anthropicSignal.collected_via.some((item) => item.id === "manual-anthropic-no-link" && item.url === null));
  assert.match(anthropicSignal.source_identity.icon_url, /^data:image\//);
  assert.equal(anthropicSignal.source_identity.host, "anthropic.com");
  const aifySummaryReceipt = built.signalPool.summary_receipts.find((item) => item.signal_id === anthropicSignal.signal_id);
  assert.deepEqual(aifySummaryReceipt.semantic_calls, {
    summary: 0,
    translation: 0,
    critic: 0,
    semantic_verifier: 0,
    scoring: 0
  });
  assert.deepEqual(aifySummaryReceipt.claim_spans, [], "trusted upstream must not fabricate claim spans");
  const ordinarySignal = built.signalPool.signals.find((item) => item.observation_refs.includes("x-simonw-2077545830802976796"));
  const ordinarySummaryReceipt = built.signalPool.summary_receipts.find((item) => item.signal_id === ordinarySignal.signal_id);
  assert.equal(ordinarySignal.summary_status, "ready");
  assert.equal(ordinarySignal.summary_origin, "source_synopsis");
  assert.equal(ordinarySummaryReceipt.claim_spans.length, 1);
  assert.equal(ordinarySummaryReceipt.claim_spans[0].observation_id, "x-simonw-2077545830802976796");
  assert.equal(ordinarySummaryReceipt.claim_spans[0].content_hash, raw.observations.find((item) => item.observation_id === "x-simonw-2077545830802976796").content_hash);
  assert.equal(ordinarySummaryReceipt.critic.status, "not_required_source_synopsis");
  assert.equal(ordinarySummaryReceipt.semantic_verifier.status, "passed_exact_span");
  const summaryFailure = built.signalPool.signals.find((item) => item.observation_refs.includes("example-summary-gate-failure-2026-07-16"));
  assert(summaryFailure, "summary readiness must not remove an admitted member");
  assert.equal(summaryFailure.summary_status, "failed");
  assert.equal(summaryFailure.source_summary, null);
  assert.equal(built.publicSignalPool.items.some((item) => item.signal_id === summaryFailure.signal_id), false);
  assert.equal(JSON.stringify(built.publicSignalPool).includes("reason_code"), false);
  assert.equal(JSON.stringify(built.publicSignalPool).includes("selection_reason"), false);

  const tamperCases = [
    (signalPool, publicSignalPool) => {
      const receipt = signalPool.admission_receipts.find((item) => item.disposition === "rejected");
      receipt.reason_code = receipt.reason_code === "off_topic" ? "promotion_or_hiring" : "off_topic";
      publicSignalPool.source_pool_hash = computeSignalPoolHash(signalPool);
    },
    (signalPool, publicSignalPool) => {
      const signal = signalPool.signals.find((item) => item.review_policy === "aify_today_passthrough_v1");
      signal.title = `${signal.title} tampered`;
      publicSignalPool.items.find((item) => item.signal_id === signal.signal_id).title = signal.title;
      publicSignalPool.source_pool_hash = computeSignalPoolHash(signalPool);
    },
    (signalPool, publicSignalPool) => {
      const receipt = signalPool.summary_receipts.find((item) => item.origin === "source_synopsis");
      receipt.claim_spans[0].end -= 1;
      publicSignalPool.source_pool_hash = computeSignalPoolHash(signalPool);
    }
  ];
  for (const mutate of tamperCases) {
    const signalPool = structuredClone(built.signalPool);
    const publicSignalPool = structuredClone(built.publicSignalPool);
    mutate(signalPool, publicSignalPool);
    assert.throws(
      () => validateSignalPoolArtifacts({
        rootDir,
        signalPool,
        publicSignalPool,
        rawObservations: raw,
        sourceFunnel: funnel,
        contract: admissionContract,
        existingSignals: new Map()
      }),
      { code: "signal_pool_derivation_mismatch" }
    );
  }

  const modelObservation = raw.observations.find((item) => item.observation_id === "example-summary-gate-failure-2026-07-16");
  const modelSpanEnd = Math.min(72, modelObservation.excerpt.length);
  const modelBuilt = await buildSignalPoolArtifacts({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    rawObservations: raw,
    sourceFunnel: funnel,
    contract: admissionContract,
    summaryProposals: new Map([[summaryFailure.signal_id, {
      signal_id: summaryFailure.signal_id,
      source_summary: "文章解释了长时间运行的智能体如何通过检查点、确定性重放与隔离执行恢复任务。",
      claim_spans: [{
        observation_id: modelObservation.observation_id,
        content_hash: modelObservation.content_hash,
        field: "excerpt",
        start: 0,
        end: modelSpanEnd,
        text_hash: testSha256(modelObservation.excerpt.slice(0, modelSpanEnd))
      }],
      critic: { status: "passed", reason_code: null },
      semantic_verifier: { status: "passed", reason_code: null },
      semantic_calls: { summary: 1, translation: 0, critic: 1, semantic_verifier: 1, scoring: 0 }
    }]])
  });
  assert.equal(
    modelBuilt.signalPool.signals.find((item) => item.signal_id === summaryFailure.signal_id).summary_origin,
    "model_generated"
  );
  const zeroCallSummary = buildSignalSummary({
    signalId: summaryFailure.signal_id,
    observations: [modelObservation],
    contract: admissionContract,
    summaryProposals: new Map([[summaryFailure.signal_id, {
      signal_id: summaryFailure.signal_id,
      source_summary: "The agent runtime restores work through durable checkpoints, deterministic replay and isolated execution.",
      claim_spans: [{
        observation_id: modelObservation.observation_id,
        content_hash: modelObservation.content_hash,
        field: "excerpt",
        start: 0,
        end: modelSpanEnd,
        text_hash: testSha256(modelObservation.excerpt.slice(0, modelSpanEnd))
      }],
      critic: { status: "passed", reason_code: null },
      semantic_verifier: { status: "passed", reason_code: null },
      semantic_calls: { summary: 0, translation: 0, critic: 0, semantic_verifier: 0, scoring: 0 }
    }]])
  });
  assert.equal(zeroCallSummary.status, "failed");
  assert.equal(zeroCallSummary.failure_code, "semantic_call_evidence_missing");
  assert.throws(
    () => validateSignalPoolArtifacts({
      rootDir,
      signalPool: modelBuilt.signalPool,
      publicSignalPool: modelBuilt.publicSignalPool,
      rawObservations: raw,
      sourceFunnel: funnel,
      contract: admissionContract,
      existingSignals: new Map()
    }),
    { code: "signal_pool_model_summary_unverifiable" },
    "publisher validation must reject self-attested model summary evidence until an independent receipt owner exists"
  );

  const poolResult = await runSignalPoolShadow({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    inputDir: "reports-data",
    outputDir: "reports-data"
  });
  const persistedPool = JSON.parse(await fs.readFile(poolResult.signal_pool_path, "utf8"));
  const persistedPublicPool = JSON.parse(await fs.readFile(poolResult.public_signal_pool_path, "utf8"));
  assert.equal(JSON.stringify(persistedPool), JSON.stringify(built.signalPool));
  assert.equal(JSON.stringify(persistedPublicPool), JSON.stringify(built.publicSignalPool));
  const priorState = await loadPriorSignalState({ rootDir, reportDate: "2026-07-17" });
  assert(priorState.has(anthropicSignal.canonical_url));
  assert(priorState.get(anthropicSignal.canonical_url).observation_content_hashes.includes(anthropicSignal.content_hash));
  const invalidHistoryCases = [
    { name: "internal-only", writeInternal: true, writePublic: false },
    { name: "public-only", writeInternal: false, writePublic: true },
    {
      name: "generation-mismatch",
      writeInternal: true,
      writePublic: true,
      mutatePublic: (payload) => { payload.generated_at = "2026-07-16T02:34:00.000Z"; }
    },
    {
      name: "hash-mismatch",
      writeInternal: true,
      writePublic: true,
      mutatePublic: (payload) => { payload.source_pool_hash = `sha256:${"f".repeat(64)}`; }
    },
    {
      name: "projection-mismatch",
      writeInternal: true,
      writePublic: true,
      mutatePublic: (payload) => { payload.items[0].title = `${payload.items[0].title} tampered`; }
    },
    { name: "wrong-directory", writeInternal: true, writePublic: true, wrongDirectory: true }
  ];
  for (const historyCase of invalidHistoryCases) {
    const caseRoot = path.join(rootDir, ".tmp", "history-cases", historyCase.name);
    const month = historyCase.wrongDirectory ? "06" : "07";
    const internalPath = path.join(caseRoot, "signals", "2026", month, "2026-07-16.json");
    const publicPath = path.join(caseRoot, "public-signal-pool", "2026", month, "2026-07-16.json");
    if (historyCase.writeInternal) {
      await fs.mkdir(path.dirname(internalPath), { recursive: true });
      await fs.writeFile(internalPath, `${JSON.stringify(persistedPool, null, 2)}\n`, "utf8");
    }
    if (historyCase.writePublic) {
      const payload = structuredClone(persistedPublicPool);
      historyCase.mutatePublic?.(payload);
      await fs.mkdir(path.dirname(publicPath), { recursive: true });
      await fs.writeFile(publicPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }
    await assert.rejects(
      loadPriorSignalState({ rootDir, reportDate: "2026-07-17", inputDir: caseRoot }),
      { code: "signal_pool_history_invalid" },
      `${historyCase.name} historical companion state must fail closed`
    );
  }
  assert.equal(poolResult.signal_count, 5);
  assert.equal(poolResult.public_ready_count, 4);
  await assert.rejects(
    fs.access(path.join(rootDir, ".tmp", "ai-daily", "quarantine", "2026-07-16.json")),
    { code: "ENOENT" }
  );

  const nextGeneratedAt = "2026-07-17T02:33:00.000Z";
  const nextDiscoveryPayload = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
  nextDiscoveryPayload.report_date = "2026-07-17";
  nextDiscoveryPayload.generated_at = nextGeneratedAt;
  const nextDiscoveryPath = path.join(rootDir, ".tmp", "curated-tracer-input-2026-07-17.json");
  await fs.writeFile(nextDiscoveryPath, `${JSON.stringify(nextDiscoveryPayload, null, 2)}\n`, "utf8");
  const nextAifyResult = structuredClone(aifyResult);
  nextAifyResult.content_lane.upstream_selection_date = "2026-07-17";
  for (const item of nextAifyResult.content_lane.items) item.upstream_selection_date = "2026-07-17";
  const nextSourceResult = await runCuratedSourceShadow({
    rootDir,
    reportDate: "2026-07-17",
    generatedAt: nextGeneratedAt,
    inputPaths: [nextDiscoveryPath],
    aifyResult: nextAifyResult,
    outputDir: "reports-data"
  });
  const nextPoolResult = await runSignalPoolShadow({
    rootDir,
    reportDate: "2026-07-17",
    generatedAt: nextGeneratedAt,
    inputDir: "reports-data",
    outputDir: "reports-data"
  });
  const nextPool = JSON.parse(await fs.readFile(nextPoolResult.signal_pool_path, "utf8"));
  const repeatedAdmissions = nextPool.admission_receipts.filter((item) => (
    expectedAdmission.expected_by_observation_id[item.observation_id]?.disposition === "admitted"
  ));
  assert.equal(nextPool.signal_count, 0, "unchanged prior-day signal observations must not be re-admitted");
  assert(repeatedAdmissions.every((item) => item.reason_code === "duplicate_no_new_state"));

  const [nextRaw, nextFunnel] = await Promise.all([
    fs.readFile(nextSourceResult.raw_observations_path, "utf8").then(JSON.parse),
    fs.readFile(nextSourceResult.source_funnel_path, "utf8").then(JSON.parse)
  ]);
  const changedRaw = structuredClone(nextRaw);
  const changedObservation = changedRaw.observations.find((item) => item.observation_id === "x-simonw-2077545830802976796");
  changedObservation.excerpt = "Simon Willison now traces a materially changed AI CLI renderer implementation with new runtime behavior.";
  changedObservation.excerpt_hash = testSha256(changedObservation.excerpt);
  changedObservation.content_hash = rawObservationContentHash(changedObservation);
  const nextExistingSignals = await loadPriorSignalState({ rootDir, reportDate: "2026-07-17" });
  const changedPool = await buildSignalPoolArtifacts({
    rootDir,
    reportDate: "2026-07-17",
    generatedAt: nextGeneratedAt,
    rawObservations: changedRaw,
    sourceFunnel: nextFunnel,
    contract: admissionContract,
    existingSignals: nextExistingSignals
  });
  assert.equal(
    changedPool.signalPool.admission_receipts.find((item) => item.observation_id === changedObservation.observation_id).disposition,
    "admitted",
    "a changed content hash on an existing canonical URL is a new state"
  );
  await Promise.all([
    fs.writeFile(nextPoolResult.signal_pool_path, `${JSON.stringify(changedPool.signalPool, null, 2)}\n`, "utf8"),
    fs.writeFile(nextPoolResult.public_signal_pool_path, `${JSON.stringify(changedPool.publicSignalPool, null, 2)}\n`, "utf8")
  ]);
  const reboundState = await loadPriorSignalState({ rootDir, reportDate: "2026-07-18" });
  const changedSignal = changedPool.signalPool.signals.find((item) => item.observation_refs.includes(changedObservation.observation_id));
  const originalObservation = raw.observations.find((item) => item.observation_id === changedObservation.observation_id);
  const changedHistory = reboundState.get(changedSignal.canonical_url);
  assert.equal(changedHistory.report_date, "2026-07-17");
  assert.equal(changedHistory.content_hash, changedSignal.content_hash, "latest signal state remains the primary history pointer");
  assert(changedHistory.observation_content_hashes.includes(originalObservation.content_hash));
  assert(changedHistory.observation_content_hashes.includes(changedObservation.content_hash));
  const reboundAdmission = classifySignalAdmission(originalObservation, {
    reportDate: "2026-07-18",
    contract: admissionContract,
    existingSignals: reboundState
  });
  assert.equal(reboundAdmission.reason_code, "duplicate_no_new_state", "H1 -> H2 -> H1 must not re-admit the old state");
  await assert.rejects(
    runSignalPoolShadow({
      rootDir,
      reportDate: "2026-07-17",
      generatedAt: nextGeneratedAt,
      inputDir: "reports-data",
      outputDir: "reports-data",
      cleanupFileSystem: { rm: async () => { throw new Error("injected cleanup failure"); } }
    }),
    { code: "signal_pool_temp_cleanup_failed" }
  );
  await assert.rejects(
    runSignalPoolShadow({
      rootDir,
      reportDate: "2026-07-18",
      generatedAt: "2026-07-18T02:33:00.000Z",
      inputDir: "missing-reports-data",
      outputDir: "missing-reports-data",
      cleanupFileSystem: { rm: async () => { throw new Error("injected cleanup failure after primary failure"); } }
    }),
    (error) => {
      assert.equal(error.code, "signal_pool_temp_cleanup_failed");
      assert.equal(error.details.primary_error_code, "signal_pool_raw_missing_or_invalid");
      return true;
    }
  );

  assert.equal(funnel.asset_reconciliation.current_entries.length, 186);
  assert.equal(funnel.asset_reconciliation.historical_decisions.length, 24);
  assert(funnel.asset_reconciliation.historical_decisions.every((item) => item.logical_source_id));
  assert.equal(funnel.asset_reconciliation.promotion_proposals.length, 24);
  assert.deepEqual(funnel.asset_reconciliation.promotion_action_counts, { promoted: 9, defer: 12, retire: 3 });
  const aliasOwners = new Map();
  for (const logical of funnel.asset_reconciliation.logical_sources) {
    for (const alias of [logical.logical_source_id, ...logical.aliases]) {
      if (aliasOwners.has(alias)) {
        assert.equal(aliasOwners.get(alias), logical.logical_source_id, `${alias} must have one logical source owner`);
      }
      aliasOwners.set(alias, logical.logical_source_id);
    }
  }
  assert.deepEqual(
    funnel.asset_reconciliation.current_entries.find((item) => item.source_id === "community-hn-frontpage-100").logical_source_ids,
    ["hacker-news", "community-hotspots"]
  );
  assert.equal(
    funnel.asset_reconciliation.historical_decisions.find((item) => item.source_id === "content-ai-news-buttondown").action,
    "replace"
  );
  assert.equal(
    funnel.asset_reconciliation.historical_decisions.find((item) => item.source_id === "content-hn-frontpage").logical_source_id,
    "community-hotspots"
  );
  assert.equal(
    funnel.asset_reconciliation.historical_decisions.find((item) => item.source_id === "content-papers-with-code-api").logical_source_id,
    "huggingface-daily-papers"
  );
  assert.equal(
    funnel.asset_reconciliation.promotion_proposals.find((item) => item.source_id === "content-azure-blog").action,
    "promoted"
  );
  assert.equal(
    funnel.asset_reconciliation.promotion_proposals.find((item) => item.source_id === "content-product-hunt-devtools").action,
    "retire"
  );
  const aifyContentLane = funnel.lanes.find((lane) => lane.lane_id === "aify_today_picks");
  const aifyHealthLane = funnel.lanes.find((lane) => lane.lane_id === "site-aify-news");
  const githubTrendingLane = funnel.lanes.find((lane) => lane.lane_id === "github-trending");
  const priorityLogicalSourceIds = funnel.lanes
    .filter((lane) => lane.priority && lane.lane_id === lane.logical_source_id)
    .map((lane) => lane.logical_source_id)
    .sort();
  assert.deepEqual(priorityLogicalSourceIds, [
    "aify-news",
    "anthropic-research-engineering",
    "arxiv-papers",
    "chinese-direct-rss",
    "follow-builders",
    "github-trending",
    "github-watch-follow-builders",
    "huggingface-daily-papers",
    "swe-bench-pro"
  ]);
  const priorityLogicalLanes = funnel.lanes.filter((lane) => lane.priority && lane.lane_id === lane.logical_source_id);
  assert(priorityLogicalLanes.every((lane) => lane.stages.fetched.status !== "not_run"), "every priority logical source must close its fetched receipt");
  assert(priorityLogicalLanes.every((lane) => lane.stages.parsed.status !== "not_run"), "every priority logical source must close its parsed receipt");
  const aifyLogicalLane = funnel.lanes.find((lane) => lane.lane_id === "aify-news");
  const aifyLogicalSource = funnel.asset_reconciliation.logical_sources.find((source) => source.logical_source_id === "aify-news");
  const azureLogicalSource = funnel.asset_reconciliation.logical_sources.find((source) => source.logical_source_id === "azure-ai-blog");
  const magnifierLogicalSource = funnel.asset_reconciliation.logical_sources.find((source) => source.logical_source_id === "the-magnifier-ai");
  const retiredAdobeLogicalSource = funnel.asset_reconciliation.logical_sources.find((source) => source.logical_source_id === "content-adobe-ai-blog");
  assert.equal(aifyLogicalLane.stages.fetched.status, "success_with_items");
  assert.equal(aifyLogicalLane.stages.parsed.status, "success_with_items");
  assert.equal(aifyLogicalSource.current_config_state, "active");
  assert.equal(aifyLogicalSource.transport_state, "fetched");
  assert.deepEqual(aifyLogicalSource.roles, ["editorial_source", "collector", "site_watch"]);
  assert.equal(aifyLogicalSource.content_state.parsed.count, 1);
  assert.equal(aifyLogicalSource.content_state.admitted.status, "not_run");
  assert.equal(aifyLogicalSource.content_state.displayed.status, "not_run");
  assert.equal(azureLogicalSource.current_config_state, "active");
  assert.equal(azureLogicalSource.decision, "keep-active");
  assert(magnifierLogicalSource.aliases.includes("content-themagnifier-ai"));
  assert(funnel.asset_reconciliation.logical_sources
    .find((source) => source.logical_source_id === "community-hotspots")
    .aliases.includes("content-hn-frontpage"));
  assert(funnel.asset_reconciliation.logical_sources
    .find((source) => source.logical_source_id === "huggingface-daily-papers")
    .aliases.includes("content-papers-with-code-api"));
  assert.equal(retiredAdobeLogicalSource.current_config_state, "retired");
  assert.equal(retiredAdobeLogicalSource.decision, "retire");
  assert.equal(retiredAdobeLogicalSource.transport_state, "unknown");
  assert.equal(retiredAdobeLogicalSource.content_state.parsed.status, "unknown");
  const canonicalOwners = await loadCuratedShadowCanonicalOwners({ rootDir });
  const mismatchedRawSnapshot = structuredClone(raw);
  mismatchedRawSnapshot.observations.find((item) => item.source_id === "aify_today_picks").upstream.upstream_snapshot_hash = `sha256:${"d".repeat(64)}`;
  assert.throws(
    () => validateCuratedShadowArtifacts({
      rawObservations: mismatchedRawSnapshot,
      sourceFunnel: funnel,
      ...canonicalOwners
    }),
    { code: "curated_shadow_aify_receipt_mismatch" }
  );
  const mismatchedFunnelSnapshot = structuredClone(funnel);
  mismatchedFunnelSnapshot.lanes.find((lane) => lane.lane_id === "aify_today_picks")
    .collector_receipt.upstream_snapshot_hash = `sha256:${"e".repeat(64)}`;
  assert.throws(
    () => validateCuratedShadowArtifacts({
      rawObservations: raw,
      sourceFunnel: mismatchedFunnelSnapshot,
      ...canonicalOwners
    }),
    { code: "curated_shadow_aify_receipt_mismatch" }
  );
  const brokenDynamicLineage = structuredClone(funnel);
  brokenDynamicLineage.asset_reconciliation.logical_sources
    .find((source) => source.logical_source_id === "smol-ai-news")
    .source_entry_ids = [];
  assert.throws(
    () => validateCuratedShadowArtifacts({
      rawObservations: raw,
      sourceFunnel: brokenDynamicLineage,
      ...canonicalOwners
    }),
    { code: "curated_shadow_logical_entry_mismatch" }
  );
  const duplicateAlias = structuredClone(funnel);
  duplicateAlias.asset_reconciliation.logical_sources
    .find((source) => source.logical_source_id === "community-hotspots")
    .aliases.push("content-adobe-ai-blog");
  assert.throws(
    () => validateCuratedShadowArtifacts({
      rawObservations: raw,
      sourceFunnel: duplicateAlias,
      ...canonicalOwners
    }),
    { code: "curated_shadow_logical_alias_owner_conflict" }
  );
  const unknownLogicalSource = funnel.asset_reconciliation.logical_sources.find((source) => source.transport_state === "unknown");
  assert(unknownLogicalSource, "a logical source without current runtime evidence must remain explicit");
  assert.deepEqual(unknownLogicalSource.content_state.parsed, {
    status: "unknown",
    count: 0,
    observed_at: null,
    receipt: null
  });
  assert.equal(aifyContentLane.stages.parsed.count, 1);
  assert.equal(aifyContentLane.stages.admitted.status, "not_run");
  assert.equal(aifyContentLane.stages.displayed.status, "not_run");
  assert.equal(aifyHealthLane.stages.fetched.count, 1);
  assert.equal(aifyContentLane.collector_receipt.input_count, 2);
  assert.equal(aifyContentLane.collector_receipt.represented_input_count, 1);
  assert.equal(aifyContentLane.collector_receipt.rejection_count, 1);
  assert.match(aifyContentLane.collector_receipt.upstream_snapshot_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(aifyContentLane.collector_receipt.upstream_payload_sequence_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(aifyHealthLane.collector_receipt.receipt_kind, "aify_site_health");
  assert.notEqual(aifyHealthLane.lane_id, aifyContentLane.lane_id);
  assert.deepEqual(
    githubTrendingLane.stages.parsed.item_ids,
    raw.observations.filter((item) => item.source_id === "github-trending").map((item) => item.id)
  );
  assert.equal(githubTrendingLane.stages.fetched.status, "success_with_items");
  assert.equal(githubTrendingLane.stages.fetched.count, 1);
  const parsedRawIds = new Set(funnel.lanes.flatMap((lane) => lane.stages.parsed.item_ids));
  assert(raw.observations.every((item) => parsedRawIds.has(item.id)), "every raw observation must close at least one parsed lane");
  assert.deepEqual(
    aifyContentLane.stages.parsed.item_ids,
    raw.observations.filter((item) => item.source_id === "aify_today_picks").map((item) => item.id)
  );
  assert(funnel.lanes.every((lane) => lane.stages.admitted.status === "not_run"));
  assert(funnel.lanes.every((lane) => lane.stages.displayed.status === "not_run"));
  assert(funnel.lanes.some((lane) => lane.lane_id === "collection:github-trending"));
  assert(funnel.asset_reconciliation.logical_sources.every((source) => (
    source.logical_source_id &&
    source.evidence_origin.length > 0 &&
    source.roles.length > 0 &&
    source.owner_pr &&
    source.decision_reason &&
    source.anchors.length > 0
  )));

  const baseDiscovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
  const partialAuditDiscovery = structuredClone(baseDiscovery);
  Object.assign(
    partialAuditDiscovery.source_audit.content_sources.sources.find((source) => source.id === "content-anthropic-engineering"),
    {
      status: "blocked",
      transport_status: "degraded",
      completeness_status: "partial",
      parsed_count: 1
    }
  );
  const partialAuditPath = path.join(rootDir, ".tmp", "partial-audit-with-observations.json");
  await fs.writeFile(partialAuditPath, `${JSON.stringify(partialAuditDiscovery, null, 2)}\n`, "utf8");
  const partialAuditResult = await runCuratedSourceShadow({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    inputPaths: [partialAuditPath],
    aifyResult,
    outputDir: "reports-data-partial-audit"
  });
  const partialAuditFunnel = JSON.parse(await fs.readFile(partialAuditResult.source_funnel_path, "utf8"));
  const partialAuditLane = partialAuditFunnel.lanes.find(
    (lane) => lane.lane_id === "collection:content-anthropic-engineering"
  );
  assert.equal(partialAuditLane.stages.fetched.status, "success_with_items");
  assert.equal(partialAuditLane.stages.parsed.status, "success_with_items");
  assert.equal(
    partialAuditFunnel.asset_reconciliation.current_entries.find(
      (source) => source.source_id === "content-anthropic-engineering"
    ).transport_state,
    "blocked",
    "partial transport degradation must remain visible outside the successful observation lineage"
  );

  const mixedGithub = structuredClone(baseDiscovery);
  mixedGithub.sources = mixedGithub.sources.filter((source) => source.id !== "github-trending");
  mixedGithub.candidates = mixedGithub.candidates.filter((candidate) => candidate.source_id !== "github-trending");
  mixedGithub.source_audit.content_sources.sources = mixedGithub.source_audit.content_sources.sources
    .filter((source) => source.name !== "GitHub Trending")
    .concat([
      { id: "github-trending-daily", name: "GitHub Trending daily", url: "https://github.com/trending", status: "no_signal", parsed_count: 0 },
      { id: "github-trending-weekly", name: "GitHub Trending weekly", url: "https://github.com/trending", status: "blocked", parsed_count: 0 },
      { id: "github-trending-token", name: "GitHub Trending token", url: "https://github.com/trending", status: "skipped_missing_token", parsed_count: 0 },
      { id: "github-trending-base-url", name: "GitHub Trending base URL", url: "https://github.com/trending", status: "skipped_missing_base_url", parsed_count: 0 }
    ]);
  const mixedGithubPath = path.join(rootDir, ".tmp", "github-mixed.json");
  await fs.writeFile(mixedGithubPath, `${JSON.stringify(mixedGithub, null, 2)}\n`, "utf8");
  const mixedGithubResult = await runCuratedSourceShadow({
    rootDir,
    reportDate: "2026-07-16",
    generatedAt: "2026-07-16T02:33:00.000Z",
    inputPaths: [mixedGithubPath],
    aifyResult,
    outputDir: "reports-data-github-mixed"
  });
  const mixedGithubFunnel = JSON.parse(await fs.readFile(mixedGithubResult.source_funnel_path, "utf8"));
  assert.equal(
    mixedGithubFunnel.lanes.find((lane) => lane.lane_id === "collection:github-trending-daily").terminal_status,
    "healthy_empty"
  );
  assert.equal(
    mixedGithubFunnel.lanes.find((lane) => lane.lane_id === "collection:github-trending-weekly").terminal_status,
    "blocked"
  );
  assert.equal(
    mixedGithubFunnel.lanes.find((lane) => lane.lane_id === "collection:github-trending-token").terminal_status,
    "blocked"
  );
  assert.equal(
    mixedGithubFunnel.lanes.find((lane) => lane.lane_id === "collection:github-trending-base-url").terminal_status,
    "blocked"
  );
  assert.equal(mixedGithubResult.degraded, true, "one blocked collector must remain visible even when a sibling is healthy-empty");

  const escapedOutputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "adc-curated-escaped-output-"));
  t.after(() => fs.rm(escapedOutputRoot, { recursive: true, force: true }));
  const linkedOutputDir = path.join(rootDir, "linked-output");
  await fs.mkdir(linkedOutputDir, { recursive: true });
  await fs.symlink(
    escapedOutputRoot,
    path.join(linkedOutputDir, "observations"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await assert.rejects(
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [discoveryPath],
      aifyResult,
      outputDir: "linked-output"
    }),
    { code: "curated_shadow_output_outside_repository" }
  );
  await assert.rejects(
    fs.access(path.join(escapedOutputRoot, "2026", "07", "2026-07-16.json")),
    { code: "ENOENT" }
  );

  const secretDiscovery = structuredClone(baseDiscovery);
  secretDiscovery.candidates[0].source_synopsis = "Authorization: Bearer ghp_FAKESECRET0123456789 must never persist.";
  const secretDiscoveryPath = path.join(rootDir, ".tmp", "secret-input.json");
  await fs.writeFile(secretDiscoveryPath, `${JSON.stringify(secretDiscovery, null, 2)}\n`, "utf8");
  await assert.rejects(
    runCuratedSourceShadow({
      rootDir,
      reportDate: "2026-07-16",
      generatedAt: "2026-07-16T02:33:00.000Z",
      inputPaths: [secretDiscoveryPath],
      aifyResult,
      outputDir: "reports-data-secret"
    }),
    { code: "curated_shadow_privacy_validation_failed" }
  );
  await assert.rejects(
    fs.access(path.join(rootDir, "reports-data-secret", "observations", "2026", "07", "2026-07-16.json")),
    { code: "ENOENT" }
  );
  await assert.rejects(
    fs.access(path.join(rootDir, "reports-data-secret", "source-funnel", "2026", "07", "2026-07-16.json")),
    { code: "ENOENT" }
  );

  const cleanPrivacy = await scanPublicArtifactsForLocalInfo({
    rootDir,
    targets: [
      "reports-data/observations",
      "reports-data/source-funnel",
      "reports-data/signals",
      "reports-data/public-signal-pool"
    ]
  });
  assert.equal(cleanPrivacy.ok, true, JSON.stringify(cleanPrivacy.findings));
  const leakPath = path.join(rootDir, "reports-data", "observations", "leak.json");
  await fs.writeFile(leakPath, JSON.stringify({
    material_url: "https://user:password@example.com/item?api_key=secret",
    username_only_url: "https://user@example.com/item",
    encoded_credentials_url: "https://user%3Apassword@example.com/item",
    collector_url: "http://127.0.0.1:8787/feed",
    prose_localhost: "see http://foo.localhost:3000/private",
    prose_single_label_host: "see http://intranet:8080/private",
    local_path: path.join(rootDir, "private", "value"),
    access_token: "must-not-persist",
    excerpt: "Authorization: Bearer ghp_FAKESECRET0123456789"
  }), "utf8");
  const unsafePrivacy = await scanPublicArtifactsForLocalInfo({
    rootDir,
    targets: ["reports-data/observations"]
  });
  assert.equal(unsafePrivacy.ok, false);
  assert(unsafePrivacy.findings.some((item) => item.pattern === "public_url_credentials"));
  assert(unsafePrivacy.findings.some((item) => item.pattern === "public_url_secret_query"));
  assert(unsafePrivacy.findings.some((item) => item.pattern === "public_url_private_host"));
  assert(unsafePrivacy.findings.some((item) => item.pattern === "structured_secret_field"));
  assert(unsafePrivacy.findings.some((item) => item.pattern === "secret_authorization_value"));
  assert(unsafePrivacy.findings.some((item) => item.pattern === "local_environment_path"));
  const signalLeakPath = path.join(rootDir, "reports-data", "signals", "leak.json");
  await fs.writeFile(signalLeakPath, JSON.stringify({
    source_summary: "Authorization: Bearer ghp_FAKESECRET0123456789",
    material_url: "http://127.0.0.1:8787/private"
  }), "utf8");
  const unsafeSignalPrivacy = await scanPublicArtifactsForLocalInfo({
    rootDir,
    targets: ["reports-data/signals"]
  });
  assert.equal(unsafeSignalPrivacy.ok, false);
  assert(unsafeSignalPrivacy.findings.some((item) => item.pattern === "secret_authorization_value"));
  assert(unsafeSignalPrivacy.findings.some((item) => item.pattern === "public_url_private_host"));
  const inMemoryPrivacy = findRepoSafeReceiptPrivacyFindings({
    username_only_url: "https://user@example.com/item",
    encoded_credentials_url: "https://user%3Apassword@example.com/item",
    prose_localhost: "see http://localhost:3000/private",
    prose_single_label_host: "see http://intranet:8080/private",
    local_path: path.join(rootDir, "private", "value")
  }, { rootDir });
  assert(inMemoryPrivacy.some((item) => item.pattern === "public_url_credentials"));
  assert(inMemoryPrivacy.some((item) => item.pattern === "local_environment_path"));
  assert(inMemoryPrivacy.some((item) => item.pattern === "public_url_private_host"));

  assert.deepEqual(await fs.readFile(activeAifyPath), activeAifyBefore);
  await assert.rejects(fs.access(path.join(rootDir, "docs", "index.html")), { code: "ENOENT" });
  await assert.rejects(fs.access(path.join(rootDir, "docs", "signals")), { code: "ENOENT" });
});

test("historical engineering fixture calibrates admission without production backfill", async () => {
  const repositoryRoot = path.resolve(__dirname, "..");
  const contract = await loadSignalAdmissionContract({ rootDir: repositoryRoot });
  const observation = JSON.parse(await fs.readFile(path.join(fixtureRoot, "anthropic-engineering-historical.json"), "utf8"));
  const production = classifySignalAdmission(observation, {
    reportDate: "2026-07-16",
    contract
  });
  assert.deepEqual(production, {
    disposition: "rejected",
    reason_code: "stale_without_update",
    topic_path: ["工程与开源", "工程实践"],
    content_format: "文章 / 博客"
  });

  const isolatedReplay = classifySignalAdmission(observation, {
    reportDate: "2026-07-16",
    contract,
    historicalFixtureMode: true
  });
  assert.equal(isolatedReplay.disposition, "admitted");
  assert.equal(isolatedReplay.reason_code, "admitted");
  assert.deepEqual(isolatedReplay.topic_path, ["工程与开源", "工程实践"]);
  assert.equal(isolatedReplay.content_format, "文章 / 博客");
});

test("trusted Aify admission bypasses ordinary editorial exclusions after mechanical gates", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const upstreamRow = {
    title: "Join our AI hiring event",
    url: "https://example.com/ai-hiring-practice",
    summary: "Aify selected this item and supplied a complete editorial description for readers.",
    date: "2026-07-16",
    source: "Example AI",
    flavors: ["engineering"],
    domain: "agents",
    channels_l1: [],
    channels_l2: [],
    companies: ["Example AI"],
    products: []
  };
  const parsed = parseAifyTodayPicksHtml(
    `<!doctype html><main>今日精选</main><script>const ARTICLES_TODAY = ${JSON.stringify([upstreamRow])}; const SITE = {"last_updated":"2026-07-16"};</script>`,
    {
      reportDate: "2026-07-16",
      sourceUrl: "https://aify-news.pages.dev/",
      responseUrl: "https://aify-news.pages.dev/",
      contentType: "text/html"
    }
  );
  assert.equal(parsed.status, "success_with_items");
  const observation = {
    id: "raw_aaaaaaaaaaaaaaaaaaaaaaaa",
    observation_id: "aify-trusted-hiring-language",
    source_id: "aify_today_picks",
    material_url: "https://example.com/ai-hiring-practice",
    title: "Join our AI hiring event",
    excerpt: "Aify selected this item and supplied a complete editorial description for readers.",
    publisher_hint: "Example AI",
    event_date: "2026-07-16",
    event_date_origin: "upstream_editorial",
    content_hash: `sha256:${"a".repeat(64)}`,
    source_group: "news_newsletters",
    content_format_hint: "hot_blog",
    content_tags: [],
    upstream: parsed.items[0]
  };

  assert.deepEqual(classifySignalAdmission(observation, { reportDate: "2026-07-16", contract }), {
    disposition: "admitted",
    reason_code: "admitted",
    topic_path: ["产品与能力", "Agent / 应用"],
    content_format: "Newsletter / Digest"
  });
  const duplicate = classifySignalAdmission(observation, {
    reportDate: "2026-07-16",
    contract,
    existingSignals: new Map([["https://example.com/ai-hiring-practice", observation.content_hash]])
  });
  assert.equal(duplicate.reason_code, "duplicate_no_new_state");
});

test("source group alone cannot admit off-topic copy or substring matches", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const base = {
    id: "raw_bbbbbbbbbbbbbbbbbbbbbbbb",
    observation_id: "official-office-renovation",
    source_id: "official-example",
    raw_record_count: 1,
    material_url: "https://example.com/blog/office-renovation",
    title: "Office renovation update",
    excerpt: "The company replaced every chair and repainted the meeting rooms this summer.",
    publisher_hint: "Example",
    event_date: "2026-07-16",
    event_date_origin: "source",
    published_at: null,
    content_hash: `sha256:${"b".repeat(64)}`,
    source_group: "official_blogs",
    content_format_hint: "hot_blog",
    content_tags: []
  };
  const result = classifySignalAdmission(base, { reportDate: "2026-07-16", contract });
  assert.equal(result.disposition, "rejected");
  assert.equal(result.reason_code, "off_topic", "chair must not satisfy the short relevance term ai");
});

test("admission membership stays separate from summary readiness", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const observation = {
    id: "raw_dddddddddddddddddddddddd",
    observation_id: "valid-agent-article-without-synopsis",
    source_id: "official-example",
    raw_record_count: 1,
    material_url: "https://example.com/engineering/agent-runtime",
    title: "A production architecture for long-running AI agents",
    excerpt: null,
    excerpt_origin: "none",
    excerpt_hash: null,
    publisher_hint: "Example Engineering",
    event_date: "2026-07-16",
    event_date_origin: "source",
    published_at: null,
    content_hash: `sha256:${"d".repeat(64)}`,
    source_group: "official_blogs",
    content_format_hint: "hot_blog",
    content_tags: ["engineering_practice"]
  };
  const admission = classifySignalAdmission(observation, { reportDate: "2026-07-16", contract });
  assert.equal(admission.disposition, "admitted");
  const summary = buildSignalSummary({ signalId: "sig_dddddddddddddddddddddddd", contract, observations: [observation] });
  assert.equal(summary.status, "pending");
  assert.equal(summary.failure_code, "source_synopsis_missing");
});

test("legacy candidate rationale cannot masquerade as a grounded source synopsis", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const excerpt = "This item is useful for AI engineers deciding whether it is worth following the project.";
  const result = buildSignalSummary({
    signalId: "sig_eeeeeeeeeeeeeeeeeeeeeeee",
    contract,
    observations: [{
      id: "raw_eeeeeeeeeeeeeeeeeeeeeeee",
      observation_id: "legacy-selection-rationale",
      title: "An AI engineering project",
      excerpt,
      excerpt_origin: "legacy_candidate_copy",
      excerpt_hash: testSha256(excerpt),
      content_hash: `sha256:${"e".repeat(64)}`
    }]
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_code, "source_synopsis_unverified");
  assert.equal(result.source_summary, null);
});

test("placeholder gate rejects fixture sentinels without rejecting testing terminology", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const base = {
    id: "raw_ffffffffffffffffffffffff",
    observation_id: "testing-ai-agents",
    source_id: "official-example",
    raw_record_count: 1,
    material_url: "https://example.com/engineering/testing-ai-agents",
    title: "Testing AI agents in production",
    excerpt: "The engineering team documents test-time compute, fixture design and bounded evaluation for deployed agents.",
    publisher_hint: "Example Engineering",
    event_date: "2026-07-16",
    event_date_origin: "source",
    published_at: null,
    content_hash: `sha256:${"f".repeat(64)}`,
    source_group: "official_blogs",
    content_format_hint: "hot_blog",
    content_tags: ["engineering_practice"]
  };
  assert.equal(classifySignalAdmission(base, { reportDate: "2026-07-16", contract }).disposition, "admitted");
  for (const title of [
    "Test-time compute for AI agents",
    "Test-driven development for AI agents",
    "Test results for an AI evaluation harness",
    "Fixture design for AI agent evaluation"
  ]) {
    assert.equal(
      classifySignalAdmission({ ...base, title, observation_id: title }, { reportDate: "2026-07-16", contract }).disposition,
      "admitted",
      title
    );
  }
  for (const title of ["TEST2", "TEST_S", "placeholder content"]) {
    const result = classifySignalAdmission({ ...base, title, observation_id: title }, { reportDate: "2026-07-16", contract });
    assert.equal(result.reason_code, "test_or_placeholder", title);
  }
});

test("routine partnership release wording does not satisfy technical substance", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const base = {
    id: "raw_abababababababababababab",
    observation_id: "routine-ai-partnership",
    source_id: "official-example",
    raw_record_count: 1,
    material_url: "https://example.com/news/ai-partnership",
    title: "Acme announces an AI strategic partnership release",
    excerpt: "Acme announced an AI strategic partnership release with broad capability claims and no technical details.",
    publisher_hint: "Acme",
    event_date: "2026-07-16",
    event_date_origin: "source",
    published_at: null,
    content_hash: `sha256:${"a".repeat(64)}`,
    source_group: "official_blogs",
    content_format_hint: "official_release",
    content_tags: []
  };
  for (const title of [
    base.title,
    "OpenAI partners with Acme on broad AI capabilities",
    "OpenAI is partnering with Acme on broad AI capabilities"
  ]) {
    const routine = classifySignalAdmission({ ...base, title }, { reportDate: "2026-07-16", contract });
    assert.equal(routine.disposition, "rejected", title);
    assert.equal(routine.reason_code, "corporate_pr_without_substance", title);
  }
  const technical = classifySignalAdmission({
    ...base,
    excerpt: "The partnership publishes the system architecture, implementation details and reproducible benchmark dataset."
  }, { reportDate: "2026-07-16", contract });
  assert.equal(technical.disposition, "admitted");
});

test("ordinary source synopsis rejects adjacent Chinese sentences without whitespace", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const excerpt = "第一句说明智能体运行时如何保存检查点。第二句说明系统如何恢复执行。";
  const result = buildSignalSummary({
    signalId: "sig_cccccccccccccccccccccccc",
    contract,
    observations: [{
      id: "raw_cccccccccccccccccccccccc",
      observation_id: "two-chinese-sentences",
      title: "智能体运行时复盘",
      excerpt,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(excerpt),
      content_hash: `sha256:${"c".repeat(64)}`
    }]
  });
  assert.equal(result.status, "failed");
  assert.equal(result.failure_code, "source_synopsis_not_one_sentence");
});

test("ordinary source synopsis handles abbreviations and no-space English sentence boundaries", async () => {
  const contract = await loadSignalAdmissionContract({ rootDir: path.resolve(__dirname, "..") });
  const summaries = [
    "The runtime supports portable outputs, e.g. browser traces, without requiring a separate worker.",
    "The system routes U.S. traffic through isolated AI inference workers with bounded retries.",
    "Version No. 5 routes AI inference jobs through isolated workers with bounded retries.",
    "Acme Inc. documents how its AI runtime resumes work from durable checkpoints.",
    "A. Smith documents how the AI runtime resumes work from durable checkpoints.",
    "The runtime pauses... then resumes AI tasks from the last durable checkpoint.",
    "The docs at example.com explain how AI workers recover from interrupted execution.",
    "Researchers found a new scaling law for agent training.",
    "Researchers identified a new scaling law for agent training.",
    "Researchers demonstrate reliable recovery across interrupted agent runs.",
    "OpenAI unveiled a new reasoning model for developers.",
    "The paper presents a deterministic replay method for long-running agents.",
    "The benchmark reveals a new scaling law for agent training.",
    "The model beats larger systems on three reasoning benchmarks.",
    "The framework is built for production deployment with isolated workers.",
    "The toolkit that supports recovery improves reliability across interrupted runs.",
    "Researchers who build agents demonstrate reliable recovery across interrupted runs.",
    "This method supports durable recovery across interrupted agent runs.",
    "An overview of how the runtime works explains durable recovery in production.",
    "For production deployments, teams use isolated workers to recover interrupted runs.",
    "To improve recovery, the runtime saves durable checkpoints before each tool call.",
    "Having built the toolkit, researchers found a reliable recovery method.",
    "While the model runs, teams record isolated execution traces.",
    "The method improved through repeated evaluation on recovery tasks.",
    "The model launched on Monday with durable agent memory.",
    "They trained on production traces for several hours.",
    "It developed for two years before reaching production stability.",
    "The team won three agent benchmarks with the new recovery method.",
    "The release fixes a checkpoint corruption bug in long-running agents.",
    "The reasoning model improves reliability across production agent tasks.",
    "The coding agent provides isolated execution for production workflows.",
    "The engineering team documents deterministic recovery across production workloads.",
    "The ranking system tracks daily repository changes across AI projects.",
    "The monitoring framework reports failures across production deployments.",
    "The reporting system tracks model failures across production deployments.",
    "A reporting pipeline exposes daily model evaluation metrics to operators.",
    "The warning service prevents repeated tool failures in production workflows.",
    "The agent warning system prevents repeated tool failures in production workflows.",
    "The model reporting pipeline exposes daily evaluation metrics to operators.",
    "The benchmark reporting service tracks daily evaluation failures for operators.",
    "Researchers observing model behavior found a reliable recovery method.",
    "A guide documenting runtime behavior helps developers recover interrupted runs.",
    "Teams documenting runtime behavior found a reliable recovery method.",
    "Researchers using tools improve reliability across long-running agent tasks.",
    "The paper emphasizes that the model improves reliability across agent tasks.",
    "The report stresses that the runtime preserves isolated execution state.",
    "The benchmark underscores that deterministic replay improves recovery.",
    "Researchers watch the agent recover from interrupted execution.",
    "The team notices the agent recover from interrupted execution.",
    "Researchers see the agent recover from interrupted execution.",
    "Researchers hear the agent recover from interrupted execution.",
    "Google DeepMind 提出的方法优于现有系统。",
    "平台监控的模型提升了生产环境中的恢复性能。",
    "研究团队提出的方法提升了模型的推理性能。",
    "The method achieves higher accuracy on agent recovery tasks.",
    "The paper proposes a deterministic replay method for long-running agents.",
    "OpenAI launches a new reasoning model for developers.",
    "研究结果表明该方法在三个推理基准上都优于现有系统。",
    "Anthropic 发布了一个支持持久记忆的智能体工程工具包。",
    "一个支持多智能体协作的工具包能够减少部署成本。",
    "该项目是一个支持确定性重放的开源工程工具包。",
    "为编程 Agent 提供可自托管、可通过 SSH 同步的共享记忆库。"
  ];
  for (const [index, excerpt] of summaries.entries()) {
    const result = buildSignalSummary({
      signalId: `sig_${String(index + 1).repeat(24)}`,
      contract,
      observations: [{
        id: `raw_${String(index + 1).repeat(24)}`,
        observation_id: `abbreviation-${index}`,
        title: "AI runtime engineering note",
        excerpt,
        excerpt_origin: "source_feed",
        excerpt_hash: testSha256(excerpt),
        content_hash: `sha256:${String(index + 1).repeat(64)}`
      }]
    });
    assert.equal(result.status, "ready", excerpt);
  }
  const twoSentences = "The agent runtime saves durable checkpoints.This second sentence explains recovery behavior.";
  const rejected = buildSignalSummary({
    signalId: "sig_999999999999999999999999",
    contract,
    observations: [{
      id: "raw_999999999999999999999999",
      observation_id: "two-english-sentences",
      title: "Agent runtime checkpoints",
      excerpt: twoSentences,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(twoSentences),
      content_hash: `sha256:${"9".repeat(64)}`
    }]
  });
  assert.equal(rejected.status, "failed");
  assert.equal(rejected.failure_code, "source_synopsis_not_one_sentence");

  const lowerCaseBoundary = "The agent runtime stops.it resumes from a durable checkpoint with isolated state.";
  const lowerCaseRejected = buildSignalSummary({
    signalId: "sig_888888888888888888888888",
    contract,
    observations: [{
      id: "raw_888888888888888888888888",
      observation_id: "two-lowercase-sentences",
      title: "Agent runtime recovery",
      excerpt: lowerCaseBoundary,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(lowerCaseBoundary),
      content_hash: `sha256:${"8".repeat(64)}`
    }]
  });
  assert.equal(lowerCaseRejected.failure_code, "source_synopsis_not_one_sentence");

  const uppercaseTldBoundary = "The agent runtime saves checkpoints.AI workers then resume from isolated state.";
  const uppercaseTldRejected = buildSignalSummary({
    signalId: "sig_555555555555555555555555",
    contract,
    observations: [{
      id: "raw_555555555555555555555555",
      observation_id: "uppercase-tld-sentence-boundary",
      title: "Agent runtime recovery",
      excerpt: uppercaseTldBoundary,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(uppercaseTldBoundary),
      content_hash: `sha256:${"5".repeat(64)}`
    }]
  });
  assert.equal(uppercaseTldRejected.failure_code, "source_synopsis_not_one_sentence");

  const fragment = "Anthropic · 1234567890 tokens";
  const fragmentRejected = buildSignalSummary({
    signalId: "sig_777777777777777777777777",
    contract,
    observations: [{
      id: "raw_777777777777777777777777",
      observation_id: "summary-fragment",
      title: "AI ranking snapshot",
      excerpt: fragment,
      excerpt_origin: "structured_source",
      excerpt_hash: testSha256(fragment),
      content_hash: `sha256:${"7".repeat(64)}`
    }]
  });
  assert.equal(fragmentRejected.failure_code, "source_synopsis_fragment");

  const nounPhrase = "Anthropic agent harness engineering toolkit.";
  const nounPhraseRejected = buildSignalSummary({
    signalId: "sig_444444444444444444444444",
    contract,
    observations: [{
      id: "raw_444444444444444444444444",
      observation_id: "summary-noun-phrase",
      title: "Anthropic harness toolkit",
      excerpt: nounPhrase,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(nounPhrase),
      content_hash: `sha256:${"4".repeat(64)}`
    }]
  });
  assert.equal(nounPhraseRejected.failure_code, "source_synopsis_fragment");

  const participlePhrase = "Anthropic building agent harness engineering toolkit.";
  const participlePhraseRejected = buildSignalSummary({
    signalId: "sig_121212121212121212121212",
    contract,
    observations: [{
      id: "raw_121212121212121212121212",
      observation_id: "summary-participle-phrase",
      title: "Anthropic harness toolkit",
      excerpt: participlePhrase,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(participlePhrase),
      content_hash: `sha256:${"1".repeat(64)}`
    }]
  });
  assert.equal(participlePhraseRejected.failure_code, "source_synopsis_fragment");

  for (const [index, excerpt] of [
    "An agent framework built for production deployment.",
    "A deterministic replay method proposed for long-running agents.",
    "A deterministic method proposed yesterday by researchers.",
    "An agent framework deployed for production use with isolated workers.",
    "A model evaluated across three reasoning benchmarks for agent recovery.",
    "An open-source agent library designed for production use with isolated workers.",
    "An agent SDK built for production deployment with durable recovery.",
    "A benchmark evaluated across three reasoning tasks for agent recovery.",
    "A dataset collected from production traces for agent recovery research.",
    "The framework deployed for production use with isolated workers.",
    "This model evaluated across three reasoning benchmarks for recovery.",
    "This repository developed for long-running production agents.",
    "Agent runtime built for durable recovery and isolated execution.",
    "An agent runtime launched for production deployment with isolated workers.",
    "A toolkit for agents to build reliable workflows.",
    "A toolkit for agents build reliable workflows.",
    "Building agents that use tools reliably.",
    "Having built a reliable toolkit for production agents.",
    "While the model runs.",
    "Although the model improves reliability across agent tasks.",
    "If the model improves reliability across agent tasks.",
    "Since the model improves reliability across agent tasks.",
    "Once the model improves reliability across agent tasks.",
    "Even though the model improves reliability across agent tasks.",
    "Even if the model improves reliability across agent tasks.",
    "Even when the model improves reliability across agent tasks.",
    "Assuming the model improves reliability across agent tasks.",
    "Whenever the model improves reliability across agent tasks.",
    "Whether the model improves reliability across agent tasks.",
    "Where the runtime recovers from interrupted execution.",
    "How the runtime improves reliability across agent tasks.",
    "What the runtime supports across long-running agent tasks.",
    "Why the runtime improves reliability across agent tasks.",
    "Though the model improves reliability across agent tasks.",
    "An overview of what is included in the production agent runtime.",
    "An overview of how the runtime supports durable recovery in production.",
    "An agent toolkit that supports durable recovery.",
    "An agent toolkit that is designed for durable recovery.",
    "An agent toolkit that supports and restores durable recovery.",
    "Agent toolkits that can support durable recovery.",
    "Agent toolkits that can support agents but reliably improve recovery.",
    "A toolkit that can improve recovery across long runs.",
    "A toolkit that can improve recovery across benchmark runs in production.",
    "A toolkit that supports agents while the runtime improves recovery.",
    "A toolkit that supports agents whose runtime improves recovery.",
    "An overview of what is included in production runs at scale.",
    "A study explaining why the model improves reliability across agent tasks.",
    "A benchmark showing when agents recover from failures in production.",
    "A paper examining whether the model improves reliability across tasks.",
    "A benchmark where agents recover and the team records execution traces.",
    "A paper showing models outperform humans on reasoning tasks.",
    "A benchmark demonstrating agents recover reliably after failures.",
    "A report claiming models surpass humans on reasoning tasks.",
    "A study suggesting agents improve reliability across long runs.",
    "A paper arguing models outperform larger systems on reasoning tasks.",
    "A paper proposing researchers use deterministic replay for long-running agents.",
    "A report claiming model performance improves on reasoning benchmarks.",
    "A study suggesting agent memory improves recovery across long runs.",
    "A memo arguing runtime isolation prevents cross-agent interference.",
    "A study observing models improve over repeated training runs.",
    "A report observing agents recover after production failures.",
    "A paper emphasizing models outperform humans on reasoning tasks.",
    "A study observing the model improves over repeated training runs.",
    "A memo emphasizing the runtime prevents cross-agent interference.",
    "A study reporting agent memory improves recovery across long runs.",
    "Provided the model improves reliability across agent tasks.",
    "Supposing the model improves reliability across agent tasks.",
    "Wherever the model improves reliability across agent tasks.",
    "A model released after months of production testing.",
    "A model tested against three reasoning benchmarks.",
    "支持多智能体协作与确定性重放能力的开源工程工具包。",
    "一个支持多智能体协作与持久记忆的新型智能体助手。",
    "Anthropic 面向生产部署并支持持久记忆的智能体工程工具包。",
    "Google DeepMind 面向生产部署并支持持久记忆的智能体工程工具包。",
    "字节跳动面向生产部署并支持持久记忆的智能体工程工具包。",
    "OpenAI 推出的面向开发者与企业部署的新型推理模型。",
    "OpenAI 发布的多智能体工程工具包。",
    "Google DeepMind 构建的多智能体研究系统。",
    "研究团队提出的用于长上下文推理与高效训练的新算法。",
    "Anthropic 展示的生产级智能体架构。",
    "Google DeepMind 实现的长上下文推理方法。",
    "平台监控的面向大规模生产环境的智能体运行性能指标。",
    "模型达到的多个复杂推理基准上的最新综合性能水平。",
    "Anthropic 复盘的面向生产部署的多智能体故障恢复案例。",
    "面向企业生产环境的平台监控的模型运行性能指标。",
    "研究团队提出的能够支持多智能体协作的工程实践方案。",
    "平台监控的可以提升生产性能的智能体运行指标。",
    "团队发布的正在支持复杂任务处理的新型智能体助手。",
    "研究团队提出的可能支持多智能体协作的工程实践方案。",
    "研究团队提出的、可能能够支持多智能体协作的工程实践方案。",
    "平台监控的应该提升生产性能的智能体运行指标。",
    "团队发布的预计支持复杂任务处理的新型智能体助手。",
    "研究团队提出的而且支持多智能体协作的工程实践方案。",
    "平台监控的但仍提升生产性能的智能体运行指标。",
    "团队发布的且支持复杂任务处理的新型智能体助手。"
  ].entries()) {
    const result = buildSignalSummary({
      signalId: `sig_f${String(index).repeat(23)}`,
      contract,
      observations: [{
        id: `raw_f${String(index).repeat(23)}`,
        observation_id: `review-summary-fragment-${index}`,
        title: "Agent engineering summary",
        excerpt,
        excerpt_origin: "source_feed",
        excerpt_hash: testSha256(excerpt),
        content_hash: `sha256:${"f".repeat(64)}`
      }]
    });
    assert.equal(result.failure_code, "source_synopsis_fragment", excerpt);
  }

  const chineseNounPhrase = "Anthropic 多智能体研究系统工程实践工具包。";
  const chineseNounPhraseRejected = buildSignalSummary({
    signalId: "sig_333333333333333333333333",
    contract,
    observations: [{
      id: "raw_333333333333333333333333",
      observation_id: "summary-chinese-noun-phrase",
      title: "Anthropic 工程实践工具包",
      excerpt: chineseNounPhrase,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(chineseNounPhrase),
      content_hash: `sha256:${"3".repeat(64)}`
    }]
  });
  assert.equal(chineseNounPhraseRejected.failure_code, "source_synopsis_fragment");

  const chineseAttributivePhrase = "一个支持多智能体协作与确定性重放的开源工程工具包。";
  const chineseAttributivePhraseRejected = buildSignalSummary({
    signalId: "sig_131313131313131313131313",
    contract,
    observations: [{
      id: "raw_131313131313131313131313",
      observation_id: "summary-chinese-attributive-phrase",
      title: "多智能体工程工具包",
      excerpt: chineseAttributivePhrase,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(chineseAttributivePhrase),
      content_hash: `sha256:${"d".repeat(64)}`
    }]
  });
  assert.equal(chineseAttributivePhraseRejected.failure_code, "source_synopsis_fragment");

  const corporateSuffixBoundary = "The company is OpenAI Inc. It released an AI agent runtime with durable checkpoints.";
  const corporateSuffixRejected = buildSignalSummary({
    signalId: "sig_222222222222222222222222",
    contract,
    observations: [{
      id: "raw_222222222222222222222222",
      observation_id: "corporate-suffix-sentence-boundary",
      title: "OpenAI agent runtime",
      excerpt: corporateSuffixBoundary,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(corporateSuffixBoundary),
      content_hash: `sha256:${"2".repeat(64)}`
    }]
  });
  assert.equal(corporateSuffixRejected.failure_code, "source_synopsis_not_one_sentence");

  const padded = "  The AI runtime resumes work from a durable checkpoint with isolated state.  ";
  const paddedRejected = buildSignalSummary({
    signalId: "sig_666666666666666666666666",
    contract,
    observations: [{
      id: "raw_666666666666666666666666",
      observation_id: "padded-summary",
      title: "AI runtime recovery",
      excerpt: padded,
      excerpt_origin: "source_feed",
      excerpt_hash: testSha256(padded),
      content_hash: `sha256:${"6".repeat(64)}`
    }]
  });
  assert.equal(paddedRejected.failure_code, "source_synopsis_unverified");
});

test("signal admission temp cleanup removes only expired owned artifacts", async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-pool-temp-cleanup-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const materialsRoot = path.join(rootDir, ".tmp", "ai-daily", "materials");
  const quarantineRoot = path.join(rootDir, ".tmp", "ai-daily", "quarantine");
  const oldMaterial = path.join(materialsRoot, "old-run", "material.txt");
  const recentMaterial = path.join(materialsRoot, "recent-run", "material.txt");
  const oldQuarantine = path.join(quarantineRoot, "old-run.json");
  const recentQuarantine = path.join(quarantineRoot, "recent-run.json");
  await fs.mkdir(path.dirname(oldMaterial), { recursive: true });
  await fs.mkdir(path.dirname(recentMaterial), { recursive: true });
  await fs.mkdir(quarantineRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(oldMaterial, "old", "utf8"),
    fs.writeFile(recentMaterial, "recent", "utf8"),
    fs.writeFile(oldQuarantine, "{}\n", "utf8"),
    fs.writeFile(recentQuarantine, "{}\n", "utf8")
  ]);
  const oldTime = new Date("2026-07-14T00:00:00.000Z");
  const recentTime = new Date("2026-07-16T02:00:00.000Z");
  await Promise.all([
    fs.utimes(oldMaterial, oldTime, oldTime),
    fs.utimes(path.dirname(oldMaterial), oldTime, oldTime),
    fs.utimes(oldQuarantine, oldTime, oldTime),
    fs.utimes(recentMaterial, recentTime, recentTime),
    fs.utimes(path.dirname(recentMaterial), recentTime, recentTime),
    fs.utimes(recentQuarantine, recentTime, recentTime)
  ]);

  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-pool-temp-outside-"));
  t.after(() => fs.rm(outsideDir, { recursive: true, force: true }));
  const outsideFile = path.join(outsideDir, "must-survive.txt");
  await fs.writeFile(outsideFile, "outside", "utf8");
  try {
    await fs.symlink(outsideDir, path.join(materialsRoot, "linked-outside"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) throw error;
  }

  const cleanup = await cleanupExpiredSignalAdmissionTemp({
    rootDir,
    now: "2026-07-16T03:00:00.000Z",
    retentionHours: 24
  });
  assert(cleanup.removed.some((item) => item.includes("old-run")));
  await assert.rejects(fs.access(path.dirname(oldMaterial)), { code: "ENOENT" });
  await assert.rejects(fs.access(oldQuarantine), { code: "ENOENT" });
  await fs.access(recentMaterial);
  await fs.access(recentQuarantine);
  await fs.access(outsideFile);
});

function testSha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}
