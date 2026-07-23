import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import { writeCandidatePool } from "../src/candidates.js";
import {
  buildCuratedSourceAssetReconciliation,
  loadCuratedShadowCanonicalOwners
} from "../src/curated-source-shadow.js";
import { loadSignalAdmissionContract } from "../src/signal-admission.js";
import { buildSignalPoolArtifacts } from "../src/signal-pool.js";
import {
  checkPublishPreflight,
  createDailyPublishPlan,
  createPublishPlan,
  createSignalPublishPlan,
  isGitHubApiFallbackEligibleError,
  parsePorcelain,
  prepareCleanPublishWorktree,
  preparePublishWorktree,
  publishGeneratedArtifactsViaGitHubApi,
  publishGeneratedArtifacts,
  resumePublishPush,
  verifyPublishedUrl
} from "../src/publish.js";
import { buildOccurrenceStore, writeOccurrenceStore } from "../src/occurrence-store.js";
import {
  internalCandidatePoolRelativePath,
  legacyInternalCandidatePoolRelativePath
} from "../src/reports-data-layout.js";
import { rawMaterialUrlHash, rawObservationContentHash } from "../src/raw-observation-integrity.js";
import { buildPublicSignals, buildSite } from "../src/site.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";
let curatedShadowCanonicalFixturePromise;

function withoutGitHubTokenEnv() {
  return {
    ...process.env,
    GH_TOKEN: "",
    GITHUB_TOKEN: ""
  };
}

test("publish dry-run 在干净工作树输出发布计划", async () => {
  const repoRoot = await tempRepoWithFixture();
  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    git: fakeGit()
  });

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.branch, "main");
  assert.equal(plan.commit_message, "chore: publish AI daily report 2026-05-13");
  assert.equal(plan.expected_pages_url, "https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json");
  assert(plan.will_write_files.includes("docs/data/2026/05/2026-05-13.json"));
  assert(plan.will_stage_files.includes("docs/feed.json"));
  assert(plan.will_stage_files.includes("docs/home.json"));
  assert(plan.will_stage_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/favicon.ico"));
  assert(!plan.will_stage_files.includes("docs/ops.html"));
  assert(plan.will_stage_files.includes("docs/trends.json"));
});

test("daily dry-run requires an explicit report date and stays date-scoped", async () => {
  const repoRoot = await tempRepoWithFixture();

  await assert.rejects(
    createDailyPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      git: fakeGit()
    }),
    (error) => error instanceof PublisherError && error.code === "daily_report_date_required"
  );

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit()
  });

  assert.equal(plan.mode, "daily-dry-run");
  assert.equal(plan.reports.length, 1);
  assert.equal(plan.reports[0].report_date, "2026-05-13");
  assert.equal(plan.expected_pages_url, "https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json");
  assert(plan.will_write_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/home.json"));
  assert(plan.will_stage_files.includes("docs/favicon.ico"));
  assert(!plan.will_stage_files.includes("docs/ops.html"));
  assert(plan.will_stage_files.includes("docs/data/official-blogs.json"));
  assert(!plan.will_stage_files.includes("docs/official-blogs/index.html"));
  assert(plan.will_stage_files.includes("docs/data/2026/05/2026-05-13.json"));
  assert(!plan.will_stage_files.includes("docs/data/2026/05/2026-05-13.candidates.json"));
});

test("daily dry-run stages the deleted legacy candidate pool beside its gzip replacement", async () => {
  const repoRoot = await tempRepoWithFixture();
  const reportDate = "2026-05-13";
  const outputDir = path.join(repoRoot, "reports-data");
  const legacyRelativePath = `reports-data/${legacyInternalCandidatePoolRelativePath(reportDate).replaceAll("\\", "/")}`;
  const compressedRelativePath = `reports-data/${internalCandidatePoolRelativePath(reportDate).replaceAll("\\", "/")}`;
  const legacyPath = path.join(repoRoot, ...legacyRelativePath.split("/"));
  await fs.mkdir(path.dirname(legacyPath), { recursive: true });
  await fs.writeFile(legacyPath, "{}\n", "utf8");
  await writeCandidatePool(outputDir, reportDate, {
    schema_version: 1,
    report_date: reportDate,
    generated_at: fixedGeneratedAt,
    sources: [{
      id: "fixture-source",
      name: "Fixture source",
      url: "https://example.com/feed",
      category: "builder",
      status: "checked"
    }],
    candidates: []
  });

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate,
    git: fakeGit({
      status: [
        ` D ${legacyRelativePath}`,
        `?? ${compressedRelativePath}`
      ].join("\n")
    })
  });

  assert(plan.will_stage_files.includes(legacyRelativePath));
  assert(plan.will_stage_files.includes(compressedRelativePath));
});

test("signal dry-run stages only the dated occurrence store and public signal tree", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const occurrencePath = "reports-data/occurrences/2026/05/2026-05-13.json";
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  const publicSignalPoolPath = "reports-data/public-signal-pool/2026/05/2026-05-13.json";
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  await writeSignalPoolReceiptFixture(repoRoot, "2026-05-13");
  const plan = await createSignalPublishPlan({
    repoRoot,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: [
        ` M docs/signals/index.json`,
        `?? docs/signals/community_discussions/page-001.json`,
        `?? ${occurrencePath}`,
        `?? ${observationsPath}`,
        `?? ${funnelPath}`,
        `?? ${signalPoolPath}`,
        `?? ${publicSignalPoolPath}`
      ].join("\n")
    })
  });

  assert.equal(plan.mode, "signals-dry-run");
  assert.equal(plan.scope, "signals");
  assert.deepEqual(plan.reports, []);
  assert(plan.will_stage_files.includes("docs/signals/index.json"));
  assert(plan.will_stage_files.includes("docs/signals/community_discussions/page-001.json"));
  assert(plan.will_stage_files.includes(occurrencePath));
  assert(plan.will_stage_files.includes(observationsPath));
  assert(plan.will_stage_files.includes(funnelPath));
  assert(plan.will_stage_files.includes(signalPoolPath));
  assert(plan.will_stage_files.includes(publicSignalPoolPath));
  assert(plan.will_stage_files.every((file) => (
    file.startsWith("docs/signals/") ||
    [occurrencePath, observationsPath, funnelPath, signalPoolPath, publicSignalPoolPath].includes(file)
  )));
});

test("signal dry-run rejects an incomplete signal pool shadow receipt pair", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  await writeSignalPoolReceiptFixture(repoRoot, "2026-05-13", { omitPublicSignalPool: true });

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({ status: "?? reports-data/signals/2026/05/2026-05-13.json" })
    }),
    (error) => error instanceof PublisherError && error.code === "signal_pool_receipt_pair_incomplete"
  );
});

test("signal dry-run rejects a signal pool whose public-ready projection was changed", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  await writeSignalPoolReceiptFixture(repoRoot, "2026-05-13", {
    mutatePublicSignalPool: (payload) => {
      payload.source_pool_hash = `sha256:${"f".repeat(64)}`;
    }
  });

  await assert.rejects(
    createSignalPublishPlan({ repoRoot, reportDate: "2026-05-13", git: fakeGit() }),
    (error) => error instanceof PublisherError &&
      error.code === "signal_pool_receipt_invalid" &&
      error.details.cause_code === "signal_pool_public_projection_mismatch"
  );
});

test("signal dry-run rejects an incomplete curated shadow receipt pair", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const observationsPath = path.join(repoRoot, "reports-data", "observations", "2026", "05", "2026-05-13.json");
  await fs.mkdir(path.dirname(observationsPath), { recursive: true });
  await fs.writeFile(observationsPath, "{}\n", "utf8");

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({ status: "?? reports-data/observations/2026/05/2026-05-13.json" })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_pair_incomplete"
  );
});

test("signal dry-run ignores an incomplete pair only when atomic rollback recovery evidence exists", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const recoveryPath = `${observationsPath}.123.550e8400-e29b-41d4-a716-446655440000.backup`;
  await fs.mkdir(path.dirname(path.join(repoRoot, ...observationsPath.split("/"))), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(repoRoot, ...observationsPath.split("/")), "new partial raw\n", "utf8"),
    fs.writeFile(path.join(repoRoot, ...recoveryPath.split("/")), "previous raw\n", "utf8")
  ]);

  const plan = await createSignalPublishPlan({
    repoRoot,
    reportDate: "2026-05-13",
    git: fakeGit({ status: `?? ${observationsPath}\n?? ${recoveryPath}` })
  });
  assert.equal(plan.mode, "signals-dry-run");
  assert.equal(plan.scope, "signals");
  assert.equal(plan.will_stage_files.includes(observationsPath), false);
  assert.equal(plan.will_stage_files.includes(recoveryPath), false);
});

test("signal dry-run keeps a valid Phase 1A pair when only the pool pair has recovery evidence", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  await writeSignalPoolReceiptFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  const publicSignalPoolPath = "reports-data/public-signal-pool/2026/05/2026-05-13.json";
  const recoveryPath = `${signalPoolPath}.123.550e8400-e29b-41d4-a716-446655440000.backup`;
  await fs.writeFile(path.join(repoRoot, ...recoveryPath.split("/")), "recoverable pool backup\n", "utf8");

  const plan = await createSignalPublishPlan({
    repoRoot,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: [observationsPath, funnelPath, signalPoolPath, publicSignalPoolPath, recoveryPath]
        .map((file) => `?? ${file}`)
        .join("\n")
    })
  });
  assert(plan.will_stage_files.includes(observationsPath));
  assert(plan.will_stage_files.includes(funnelPath));
  assert.equal(plan.will_stage_files.includes(signalPoolPath), false);
  assert.equal(plan.will_stage_files.includes(publicSignalPoolPath), false);
  assert.equal(plan.will_stage_files.includes(recoveryPath), false);
});

test("signal dry-run revalidates curated shadow receipt schema before staging", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const observationsPath = path.join(repoRoot, "reports-data", "observations", "2026", "05", "2026-05-13.json");
  const funnelPath = path.join(repoRoot, "reports-data", "source-funnel", "2026", "05", "2026-05-13.json");
  await fs.mkdir(path.dirname(observationsPath), { recursive: true });
  await fs.mkdir(path.dirname(funnelPath), { recursive: true });
  await Promise.all([
    fs.writeFile(observationsPath, "{}\n", "utf8"),
    fs.writeFile(funnelPath, "{}\n", "utf8")
  ]);

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          "?? reports-data/observations/2026/05/2026-05-13.json",
          "?? reports-data/source-funnel/2026/05/2026-05-13.json"
        ].join("\n")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_invalid"
  );
});

test("signal dry-run rejects schema-valid curated receipts with broken raw-to-funnel lineage", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", { observation: true, omitObservationLane: true });
  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          "?? reports-data/observations/2026/05/2026-05-13.json",
          "?? reports-data/source-funnel/2026/05/2026-05-13.json"
        ].join("\n")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_invalid"
  );
});

test("signal dry-run rejects schema-valid receipts with incomplete canonical reconciliation", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", {
    mutateReconciliation: (reconciliation) => reconciliation.current_entries.pop()
  });
  await assert.rejects(
    createSignalPublishPlan({ repoRoot, reportDate: "2026-05-13", git: fakeGit() }),
    (error) => error instanceof PublisherError &&
      error.code === "curated_shadow_receipt_invalid" &&
      error.details.cause_code === "curated_shadow_current_registry_mismatch"
  );
});

test("signal dry-run rejects a parsed raw observation bound to the wrong source entry", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", {
    observation: true,
    observationLaneSourceIds: ["different-runtime-source"]
  });
  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          "?? reports-data/observations/2026/05/2026-05-13.json",
          "?? reports-data/source-funnel/2026/05/2026-05-13.json"
        ].join("\n")
      })
    }),
    (error) => error instanceof PublisherError &&
      error.code === "curated_shadow_receipt_invalid" &&
      error.details.misbound_raw_ids.length === 1
  );
});

test("signal dry-run rejects curated receipt paths that traverse a directory link", async (t) => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  const observationsDir = path.join(repoRoot, "reports-data", "observations");
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-publish-linked-receipt-"));
  t.after(() => fs.rm(outsideDir, { recursive: true, force: true }));
  await fs.rename(observationsDir, path.join(outsideDir, "observations"));
  try {
    await fs.symlink(
      path.join(outsideDir, "observations"),
      observationsDir,
      process.platform === "win32" ? "junction" : "dir"
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) {
      t.skip(`directory links are unavailable in this environment: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(
    createSignalPublishPlan({ repoRoot, reportDate: "2026-05-13", git: fakeGit() }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_path_unsafe"
  );
});

test("signal dry-run ignores a valid stale receipt pair instead of claiming the current run", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", {
    generatedAt: "2026-05-13T07:00:00.000Z"
  });
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  const publicSignalPoolPath = "reports-data/public-signal-pool/2026/05/2026-05-13.json";
  const plan = await createSignalPublishPlan({
    repoRoot,
    reportDate: "2026-05-13",
    git: fakeGit({ status: ` M docs/signals/index.json\n M ${observationsPath}\n M ${funnelPath}` })
  });
  assert(plan.current_dirty_files.includes(observationsPath));
  assert.equal(plan.will_stage_files.includes(observationsPath), false);
  assert.equal(plan.will_stage_files.includes(funnelPath), false);
  assert(plan.will_stage_files.includes("docs/signals/index.json"));
});

test("daily dry-run leaves a verified same-day shadow pair to the signal publisher", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({ status: `?? ${observationsPath}\n?? ${funnelPath}` })
  });
  assert(plan.current_dirty_files.includes(observationsPath));
  assert.equal(plan.will_stage_files.includes(observationsPath), false);
  assert.equal(plan.will_stage_files.includes(funnelPath), false);
});

test("signal dry-run rejects secret text inside otherwise schema-valid curated receipts", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", {
    observation: true,
    excerpt: "Authorization: Bearer ghp_FAKESECRET0123456789"
  });
  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          "?? reports-data/observations/2026/05/2026-05-13.json",
          "?? reports-data/source-funnel/2026/05/2026-05-13.json"
        ].join("\n")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_invalid"
  );
});

test("signal dry-run rejects curated receipts whose payload date differs from the selected date", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13", { payloadReportDate: "2026-05-12" });
  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          "?? reports-data/observations/2026/05/2026-05-13.json",
          "?? reports-data/source-funnel/2026/05/2026-05-13.json"
        ].join("\n")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_receipt_invalid"
  );
});

test("signal dry-run tolerates same-day discovery evidence without widening the signal commit", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const evidencePath = "docs/assets/evidence/content-openrouter-rankings-2026-05-13-1.png";
  const plan = await createSignalPublishPlan({
    repoRoot,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: ` M docs/signals/index.json\n?? ${evidencePath}`
    })
  });

  assert(plan.current_dirty_files.includes(evidencePath));
  assert.equal(plan.will_stage_files.includes(evidencePath), false);
  assert.deepEqual(plan.will_stage_files, ["docs/signals/index.json"]);
});

test("signal dry-run still rejects discovery evidence from a different date", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/signals/index.json\n?? docs/assets/evidence/content-openrouter-rankings-2026-05-12-1.png"
      })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("signal scope rejects legacy publisher changes instead of widening its stage plan", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      git: fakeGit({ status: " M docs/signals/index.json\n M docs/index.html" })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("signal scope rejects custom artifact roots instead of validating and staging different trees", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate: "2026-05-13",
      dataInputDir: "custom-data",
      git: fakeGit({ status: " M docs/signals/index.json" })
    }),
    (error) => error instanceof PublisherError && error.code === "signal_custom_artifact_root_unsupported"
  );
});

test("signal scope rejects a valid but stale signal tree that omits the dated occurrence store", async () => {
  const repoRoot = await tempRepoWithFixture();
  const reportDate = "2026-05-13";
  await writeSignalFixture(repoRoot, reportDate);
  await writeOccurrenceStore({
    rootDir: repoRoot,
    outputDir: "reports-data",
    store: buildOccurrenceStore({
      reportDate,
      generatedAt: `${reportDate}T09:00:00.000Z`,
      sources: [{
        id: "community-listener",
        name: "Community listener",
        url: "https://example.com/feed.xml",
        category: "community",
        source_group: "community_discussions",
        status: "checked"
      }],
      candidates: [
        {
          id: "signal-item",
          observation_id: "signal-item-observation",
          source_id: "community-listener",
          category: "community_lead",
          title: "Community signal",
          url: "https://example.com/signals/one",
          source: "Community listener",
          event_date: reportDate,
          collected_at: `${reportDate}T08:00:00.000Z`,
          status: "excluded"
        },
        {
          id: "new-unbuilt-signal",
          observation_id: "new-unbuilt-signal-observation",
          source_id: "community-listener",
          category: "community_lead",
          title: "New signal missing from stale pages",
          url: "https://example.com/signals/two",
          source: "Community listener",
          event_date: reportDate,
          collected_at: `${reportDate}T09:00:00.000Z`
        }
      ]
    })
  });

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate,
      git: fakeGit({ status: " M docs/signals/index.json" })
    }),
    (error) => error instanceof PublisherError && error.code === "signal_occurrence_lineage_mismatch"
  );
});

test("signal scope rejects publication when the immutable history baseline changed after build", async () => {
  const repoRoot = await tempRepoWithFixture();
  const reportDate = "2026-05-13";
  const baselinePath = await writePublishBaselineFixture(repoRoot);
  await writeSignalFixture(repoRoot, reportDate);

  const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  baseline.occurrences[0].summary = "This valid mutation is not authorized by the baseline manifest.";
  await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

  await assert.rejects(
    createSignalPublishPlan({
      repoRoot,
      reportDate,
      git: fakeGit({ status: " M docs/signals/index.json" })
    }),
    (error) => error instanceof PublisherError && error.code === "occurrence_baseline_manifest_invalid"
  );
});

test("signal scope rejects a self-consistent public tree with occurrences absent from storage", async () => {
  const repoRoot = await tempRepoWithFixture();
  const reportDate = "2026-05-13";
  await writeSignalFixture(repoRoot, reportDate);
  const extraDate = "2026-05-12";
  await writeOccurrenceStore({
    rootDir: repoRoot,
    outputDir: "reports-data",
    store: buildOccurrenceStore({
      reportDate: extraDate,
      generatedAt: `${extraDate}T08:00:00.000Z`,
      sources: [{ id: "extra-listener", name: "Extra listener", url: "https://example.com/extra.xml", status: "checked" }],
      candidates: [{
        id: "extra-signal",
        observation_id: "extra-signal-observation",
        source_id: "extra-listener",
        category: "community_lead",
        title: "Extra public signal",
        url: "https://example.com/signals/extra",
        source: "Extra listener",
        event_date: extraDate,
        collected_at: `${extraDate}T08:00:00.000Z`
      }]
    })
  });
  await buildPublicSignals({ rootDir: repoRoot, dataInputDir: "reports-data", outDir: "docs" });
  await fs.rm(path.join(repoRoot, "reports-data", "occurrences", "2026", "05", `${extraDate}.json`));

  await assert.rejects(
    createSignalPublishPlan({ repoRoot, reportDate, git: fakeGit({ status: " M docs/signals/index.json" }) }),
    (error) => error instanceof PublisherError && error.code === "signal_occurrence_lineage_mismatch"
  );
});

test("signal scope fails closed when the required empty baseline manifest is deleted", async () => {
  const repoRoot = await tempRepoWithFixture();
  const reportDate = "2026-05-13";
  await writeSignalFixture(repoRoot, reportDate);
  await fs.rm(path.join(repoRoot, "reports-data", "occurrence-baseline-manifest.json"));

  await assert.rejects(
    createSignalPublishPlan({ repoRoot, reportDate, git: fakeGit({ status: " M docs/signals/index.json" }) }),
    (error) => error instanceof PublisherError && error.code === "occurrence_baseline_manifest_invalid"
  );
});

test("signal publish commits only signal-owned files without report quality admission", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const calls = [];
  const occurrencePath = "reports-data/occurrences/2026/05/2026-05-13.json";
  const result = await publishGeneratedArtifacts({
    repoRoot,
    reportDate: "2026-05-13",
    scope: "signals",
    confirmPush: true,
    git: fakeGit({
      calls,
      status: [
        " M docs/signals/index.json",
        ` M ${occurrencePath}`,
        "?? docs/assets/evidence/content-openrouter-rankings-2026-05-13-1.png"
      ].join("\n")
    })
  });

  assert.equal(result.scope, "signals");
  assert.equal(result.repo_updated, true);
  assert.equal(result.pushed, true);
  assert.deepEqual(calls.find((call) => call.name === "add").files.sort(), ["docs/signals/index.json", occurrencePath].sort());
  assert.match(calls.find((call) => call.name === "commit").message, /signal stream/);
});

test("signal GitHub API fallback leaves same-day discovery evidence out of the signal tree", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const evidencePath = "docs/assets/evidence/content-openrouter-rankings-2026-05-13-1.png";
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    reportDate: "2026-05-13",
    scope: "signals",
    confirmPush: true,
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({
      status: ` M docs/signals/index.json\n?? ${evidencePath}`
    }),
    fetchImpl: fakeGitHubFetch()
  });

  assert.equal(result.published_files.includes("docs/signals/index.json"), true);
  assert.equal(result.published_files.includes(evidencePath), false);
});

test("signal GitHub API fallback preserves a remote receipt pair when the local optional pair is absent", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  const publicSignalPoolPath = "reports-data/public-signal-pool/2026/05/2026-05-13.json";
  const calls = [];
  await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    reportDate: "2026-05-13",
    scope: "signals",
    confirmPush: true,
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: " M docs/signals/index.json" }),
    fetchImpl: fakeGitHubFetch({
      calls,
      remoteTree: [
        { path: observationsPath, type: "blob", sha: "remote-observations" },
        { path: funnelPath, type: "blob", sha: "remote-funnel" },
        { path: signalPoolPath, type: "blob", sha: "remote-signal-pool" },
        { path: publicSignalPoolPath, type: "blob", sha: "remote-public-signal-pool" }
      ]
    })
  });
  const tree = calls.find((call) => call.url.endsWith("/git/trees") && call.method === "POST").body.tree;
  assert.equal(tree.some((entry) => [observationsPath, funnelPath, signalPoolPath, publicSignalPoolPath].includes(entry.path)), false);
  assert.equal(tree.some((entry) => entry.sha === null), false);
});

test("signal GitHub API fallback rejects an orphaned remote receipt", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({
      repoRoot,
      reportDate: "2026-05-13",
      scope: "signals",
      confirmPush: true,
      token: "test-token",
      repository: "owner/repo",
      verifyPages: false,
      git: fakeGit({ status: " M docs/signals/index.json" }),
      fetchImpl: fakeGitHubFetch({
        remoteTree: [{ path: observationsPath, type: "blob", sha: "remote-observations" }]
      })
    }),
    (error) => error instanceof PublisherError && error.code === "curated_shadow_remote_receipt_pair_incomplete"
  );
});

test("signal GitHub API fallback rejects an orphaned remote signal pool receipt", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({
      repoRoot,
      reportDate: "2026-05-13",
      scope: "signals",
      confirmPush: true,
      token: "test-token",
      repository: "owner/repo",
      verifyPages: false,
      git: fakeGit({ status: " M docs/signals/index.json" }),
      fetchImpl: fakeGitHubFetch({
        remoteTree: [{ path: signalPoolPath, type: "blob", sha: "remote-signal-pool" }]
      })
    }),
    (error) => error instanceof PublisherError && error.code === "signal_pool_remote_receipt_pair_incomplete"
  );
});

test("signal GitHub API fallback uploads a verified clean local receipt pair", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeSignalFixture(repoRoot, "2026-05-13");
  await writeCuratedShadowReceiptFixture(repoRoot, "2026-05-13");
  await writeSignalPoolReceiptFixture(repoRoot, "2026-05-13");
  const observationsPath = "reports-data/observations/2026/05/2026-05-13.json";
  const funnelPath = "reports-data/source-funnel/2026/05/2026-05-13.json";
  const signalPoolPath = "reports-data/signals/2026/05/2026-05-13.json";
  const publicSignalPoolPath = "reports-data/public-signal-pool/2026/05/2026-05-13.json";
  const calls = [];
  await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    reportDate: "2026-05-13",
    scope: "signals",
    confirmPush: true,
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: "" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });
  const tree = calls.find((call) => call.url.endsWith("/git/trees") && call.method === "POST").body.tree;
  assert(tree.some((entry) => entry.path === observationsPath && typeof entry.content === "string"));
  assert(tree.some((entry) => entry.path === funnelPath && typeof entry.content === "string"));
  assert(tree.some((entry) => entry.path === signalPoolPath && typeof entry.content === "string"));
  assert(tree.some((entry) => entry.path === publicSignalPoolPath && typeof entry.content === "string"));
});

test("daily dry-run stages sanitized retrospective records for the selected date", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeRetrospectiveFixture(repoRoot, "2026-05-13");

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: [
        " M retrospectives/index.json",
        "?? retrospectives/2026/05/2026-05-13.daily_publish.daily-run.json"
      ].join("\n")
    })
  });

  assert(plan.will_stage_files.includes("retrospectives/index.json"));
  assert(plan.will_stage_files.includes("retrospectives/2026/05/2026-05-13.daily_publish.daily-run.json"));
});

test("daily dry-run expands folded untracked retrospective directories", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeRetrospectiveFixture(repoRoot, "2026-05-13");

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: [
        " M retrospectives/index.json",
        "?? retrospectives/2026/05/"
      ].join("\n")
    })
  });

  assert(plan.will_stage_files.includes("retrospectives/index.json"));
  assert(plan.will_stage_files.includes("retrospectives/2026/05/2026-05-13.daily_publish.daily-run.json"));
});

test("daily dry-run rejects folded retrospective directories with other dates", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeRetrospectiveFixture(repoRoot, "2026-05-13");
  await writeRetrospectiveFixture(repoRoot, "2026-05-14");

  await assert.rejects(
    createDailyPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          " M retrospectives/index.json",
          "?? retrospectives/2026/05/"
        ].join("\n")
      })
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "publisher_dirty_outside_publish_plan" &&
      error.details.files.includes("retrospectives/2026/05/2026-05-14.daily_publish.daily-run.json")
  );
});

test("daily dry-run stages selected-date rollup correction retrospective records", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeRetrospectiveFixture(repoRoot, "2026-05-13", {
    runType: "rollup",
    slug: "daily-publish-correction",
    status: "blocked"
  });

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: ""
    })
  });

  assert(plan.will_stage_files.includes("retrospectives/index.json"));
  assert(plan.will_stage_files.includes("retrospectives/2026/05/2026-05-13.rollup.daily-publish-correction.json"));
});

test("publish dry-run allows degraded Builder coverage and exposes degraded sections", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.rm(path.join(repoRoot, "reports-source"), { recursive: true, force: true });
  const report = JSON.parse(await fs.readFile(path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"), "utf8"));
  report.source_audit = {
    builder_sources: {
      checked: true,
      sources: [
        {
          name: "follow-builders X feed",
          url: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json",
          status: "blocked",
          notes: "retry_failed_after_1"
        }
      ],
      candidates_found: 2,
      included: 2,
      blocked_reason: "x_feed_failed",
      notes: "fixture"
    }
  };
  report.builder_observations = [
    {
      author: "Example Builder",
      content: "Example Builder shared one X status.",
      url: "https://x.com/example/status/2059000000000000000"
    },
    {
      author: "Example Writer",
      content: "Example Writer shared one blog post.",
      url: "https://example.com/builder-post"
    }
  ];
  const dataDir = path.join(repoRoot, "reports-data", "2026", "05");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "2026-05-15.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-15",
    git: fakeGit()
  });

  assert.equal(plan.reports[0].quality_status, "degraded");
  assert(
    plan.reports[0].degraded_sections.some(
      (issue) => issue.code === "builder_coverage_below_minimum" && issue.section === "builder_observations"
    )
  );
});

test("publish dry-run 允许仅包含发布产物的 dirty worktree", async () => {
  const repoRoot = await tempRepoWithFixture();
  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    generatedAt: fixedGeneratedAt,
    git: fakeGit({ status: " M docs/index.html\n M docs/trends.json" })
  });

  assert.deepEqual(plan.current_dirty_files, ["docs/index.html", "docs/trends.json"]);
  assert(plan.will_stage_files.includes("docs/index.html"));
  assert(plan.will_stage_files.includes("docs/trends.json"));
});

test("daily dry-run stages dirty docs files that are generated by the site build", async () => {
  const repoRoot = await tempRepoWithFixture();
  const markdown = await fs.readFile(path.join(repoRoot, "reports-source", "official-release.md"), "utf8");
  await fs.writeFile(
    path.join(repoRoot, "reports-source", "official-release-previous.md"),
    markdown.replaceAll("2026-05-13", "2026-05-12"),
    "utf8"
  );

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: " M docs/data/2026/05/2026-05-12.json"
    })
  });

  assert(plan.will_stage_files.includes("docs/data/2026/05/2026-05-12.json"));
});

test("daily dry-run stages dirty article index generated by the site build", async () => {
  const repoRoot = await tempRepoWithFixture();

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: " M docs/articles.json"
    })
  });

  assert.deepEqual(plan.current_dirty_files, ["docs/articles.json"]);
  assert(plan.will_stage_files.includes("docs/articles.json"));
});

test("daily dry-run stages source status history metadata", async () => {
  const repoRoot = await tempRepoWithFixture();
  const sourceStatusHistoryPath = path.join(repoRoot, "reports-data", "internal", "source-status-history.json");
  await fs.mkdir(path.dirname(sourceStatusHistoryPath), { recursive: true });
  await fs.writeFile(
    sourceStatusHistoryPath,
    `${JSON.stringify({ schema_version: 1, records: [] }, null, 2)}\n`,
    "utf8"
  );

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: " M reports-data/internal/source-status-history.json"
    })
  });

  assert(plan.will_stage_files.includes("reports-data/internal/source-status-history.json"));
});

test("daily dry-run rejects dirty retired editorial rank artifacts", async () => {
  const repoRoot = await tempRepoWithFixture();
  const rankArtifactPath = path.join(
    repoRoot,
    "reports-data",
    "2026",
    "05",
    "internal",
    "editorial-rank-2026-05-13.json"
  );
  await fs.mkdir(path.dirname(rankArtifactPath), { recursive: true });
  await fs.writeFile(
    rankArtifactPath,
    `${JSON.stringify({ schema_version: 1, report_date: "2026-05-13", items: [] }, null, 2)}\n`,
    "utf8"
  );

  await assert.rejects(
    () => createDailyPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M reports-data/2026/05/internal/editorial-rank-2026-05-13.json"
      })
    }),
    (error) => error instanceof PublisherError && error.code === "publisher_dirty_outside_publish_plan"
  );
});

test("publish dry-run stages evidence and builder avatar assets for the selected report", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.rm(path.join(repoRoot, "reports-source"), { recursive: true, force: true });
  const report = JSON.parse(await fs.readFile(path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"), "utf8"));
  report.evidence_assets = [
    {
      type: "figure",
      title: "Fixture evidence",
      source_url: report.main_items[0].url,
      local_path: "assets/evidence/fixture-evidence.png",
      caption: "Fixture evidence image.",
      extraction_status: "source_image"
    }
  ];
  report.builder_observations = [
    {
      author: "Example Builder",
      handle: "example",
      role: "builder",
      event_date: report.report_date,
      source: "follow-builders X feed",
      original_text: "Coding agents need eval loops.",
      translation: "Coding agent 需要 eval loops。",
      content: "Coding agent 需要 eval loops。",
      avatar_url: "https://unavatar.io/x/example",
      url: "https://x.com/example/status/2059000000000000000"
    }
  ];
  report.self_check.builder_observations = 1;
  const dataDir = path.join(repoRoot, "reports-data", "2026", "05");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, `${report.report_date}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const plan = await createPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: report.report_date,
    git: fakeGit()
  });

  assert(plan.will_stage_files.includes("docs/assets/evidence/fixture-evidence.png"));
  assert(!plan.will_stage_files.some((file) => file.startsWith("docs/assets/avatars/")));
});

test("daily dry-run stages date-scoped evidence screenshots created during discovery", async () => {
  const repoRoot = await tempRepoWithFixture();
  const evidenceDir = path.join(repoRoot, "docs", "assets", "evidence");
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDir, "content-openrouter-rankings-2026-05-13-1.png"),
    "fixture image"
  );

  const plan = await createDailyPublishPlan({
    repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: "?? docs/assets/evidence/content-openrouter-rankings-2026-05-13-1.png"
    })
  });

  assert(plan.will_stage_files.includes("docs/assets/evidence/content-openrouter-rankings-2026-05-13-1.png"));
});

test("publish dry-run blocks publisher files outside the selected publish plan", async () => {
  const repoRoot = await tempRepoWithFixture();

  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/index.html\n?? docs/assets/evidence/unplanned-evidence.png"
      })
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "publisher_dirty_outside_publish_plan" &&
      error.details.files.includes("docs/assets/evidence/unplanned-evidence.png")
  );
});

test("publish dry-run stops when a selected report quality status is blocked", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-publish-blocked-quality-"));
  const dataDir = path.join(repoRoot, "reports-data", "2026", "05");
  await fs.mkdir(dataDir, { recursive: true });
  const report = JSON.parse(await fs.readFile(path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"), "utf8"));
  report.quality_status = {
    status: "blocked",
    reasons: ["startup_failed"],
    affected_sections: ["all"],
    public_note: "Report generation startup failed."
  };
  await fs.writeFile(path.join(dataDir, "2026-05-15.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      reportDate: "2026-05-15",
      git: fakeGit()
    }),
    (error) => error instanceof PublisherError && error.code === "report_quality_blocked"
  );
});

test("publish dry-run stops when selected strict report was not generated from current origin/main", async () => {
  const repoRoot = await tempRepoWithFixture();
  const report = JSON.parse(await fs.readFile(path.join(rootDir, "tests/fixtures/reports/good/structured-report.json"), "utf8"));
  report.report_date = "2026-06-02";
  report.html_path = "reports/2026/06/2026-06-02.html";
  report.canonical_url = "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/06/2026-06-02.html";
  report.source_window.date_from = "2026-06-02";
  report.source_window.date_to = "2026-06-02";
  report.self_check.report_date = "2026-06-02";
  report.self_check.automation_revision = {
    schema_version: 1,
    git_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    git_commit_short: "aaaaaaaaaaaa",
    git_branch: "main",
    origin_main_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    origin_main_short: "bbbbbbbbbbbb",
    prompt_manifest: "prompts/ai-daily/manifest.json",
    prompt_modules: ["fixed-source-checklist.md"],
    source_registry_count: 68,
    source_registry_enablement_counts: { core: 28, optional: 35, manual: 5 },
    rules: [
      "main_stream_blacklist_refill_5_to_12",
      "content_units_min_45_when_candidates_available",
      "model_releases_must_mirror_main_items",
      "github_api_fallback_for_git_transport",
      "fixed_source_checklist"
    ]
  };
  const currentAutomationRevision = {
    ...report.self_check.automation_revision,
    git_commit: "cccccccccccccccccccccccccccccccccccccccc",
    git_commit_short: "cccccccccccc",
    origin_main_sha: "cccccccccccccccccccccccccccccccccccccccc",
    origin_main_short: "cccccccccccc"
  };
  const dataDir = path.join(repoRoot, "reports-data", "2026", "06");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "2026-06-02.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      outDir: "docs",
      generatedAt: fixedGeneratedAt,
      reportDate: "2026-06-02",
      git: fakeGit(),
      currentAutomationRevision
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "automation_revision_gate_failed" &&
      error.details.issues.some((issue) => issue.revision_mismatches.includes("origin_main_sha"))
  );
});

test("publish dry-run 遇到非发布器管理改动时停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("publish dry-run 遇到 wrong branch 停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ branch: "feature/test" })
    }),
    (error) => error instanceof PublisherError && error.code === "wrong_branch"
  );
});

test("publish dry-run 遇到 remote ahead 停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await assert.rejects(
    createPublishPlan({
      repoRoot,
      inputDir: "reports-source",
      dataInputDir: "reports-data",
      generatedAt: fixedGeneratedAt,
      git: fakeGit({ remoteAhead: 1 })
    }),
    (error) => error instanceof PublisherError && error.code === "remote_ahead"
  );
});

test("publish preflight 检查分支、远端、工作树和 git 写权限", async () => {
  const result = await checkPublishPreflight({
    git: fakeGit({ status: " M docs/index.html\n M docs/trends.json", pushDryRunOutput: "dry-run ok" }),
    gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
  });

  assert.equal(result.mode, "preflight");
  assert.equal(result.git_writable, true);
  assert.equal(result.push_transport.ok, true);
  assert.deepEqual(result.current_dirty_files, ["docs/index.html", "docs/trends.json"]);
});

test("publish preflight fails early when push transport is unavailable", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({
        pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
      }),
      gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
    }),
    (error) => error instanceof PublisherError && error.code === "git_push_unavailable"
  );
});

test("publish preflight fails early when remote tracking cannot be refreshed", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({
        fetchError: new Error("fatal: unable to access remote")
      }),
      gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
    }),
    (error) => error instanceof PublisherError && error.code === "git_fetch_unavailable"
  );
});

test("git transport failures are eligible for GitHub API fallback", () => {
  assert.equal(isGitHubApiFallbackEligibleError(new PublisherError("git_fetch_unavailable", "fetch failed")), true);
  assert.equal(isGitHubApiFallbackEligibleError(new PublisherError("git_push_unavailable", "push dry-run failed")), true);
  assert.equal(isGitHubApiFallbackEligibleError(new PublisherError("git_not_writable", "git metadata locked")), true);
  assert.equal(isGitHubApiFallbackEligibleError(new PublisherError("remote_ahead", "remote has newer commits")), false);
  assert.equal(isGitHubApiFallbackEligibleError(new Error("fetch failed")), false);
});

test("publish preflight 在 git 元数据不可写时停止", async () => {
  await assert.rejects(
    checkPublishPreflight({
      git: fakeGit({ status: " M docs/index.html" }),
      gitWritableCheck: async () => {
        throw new PublisherError("git_not_writable", "当前环境不能写入 Git 元数据目录，真实发布无法创建 index.lock。");
      }
    }),
    (error) => error instanceof PublisherError && error.code === "git_not_writable"
  );
});

test("publish prepare-worktree defers git_not_writable so report generation can continue", async () => {
  const result = await preparePublishWorktree({
    git: fakeGit(),
    gitWritableCheck: async () => {
      throw new PublisherError("git_not_writable", "当前环境不能写入 Git 元数据目录，真实发布无法创建 index.lock。", {
        gitDir: "D:\\ai-daily-cn\\.git"
      });
    }
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_not_writable");
  assert.equal(result.publish_blocker.details.gitDir, "D:\\ai-daily-cn\\.git");
  assert.equal(result.preflight, null);
  assert.equal(result.current_branch, "main");
});

test("publish prepare-worktree defers git push transport failures so report generation can continue", async () => {
  const result = await preparePublishWorktree({
    git: fakeGit({
      pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
    }),
    gitWritableCheck: async () => ({ ok: true, git_dir: ".git" })
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_push_unavailable");
  assert.match(result.publish_blocker.details.cause, /Permission denied/);
});

test("publish prepare-worktree defers checkout index.lock failure so generation can continue", async () => {
  let branch = "codex/discovery-fallbacks";

  const result = await preparePublishWorktree({
    git: {
      async status() {
        return "";
      },
      async branch() {
        return branch;
      },
      async checkout() {
        throw new Error("fatal: Unable to create 'D:/repo/.git/index.lock': Permission denied");
      }
    }
  });

  assert.equal(result.publish_ready, false);
  assert.equal(result.publish_blocker.code, "git_not_writable");
  assert.match(result.publish_blocker.message, /index\.lock/);
  assert.equal(result.current_branch, "codex/discovery-fallbacks");
  assert.equal(result.switched_branch, false);
});

test("publish prepare-worktree 先提交本地改动再切回发布分支", async () => {
  const calls = [];
  let branch = "feature/report-sections";
  let status = " M src/cli.js\n?? notes.md";

  const result = await preparePublishWorktree({
    commitMessage: "chore: save local changes before daily report",
    git: {
      async status() {
        return status;
      },
      async branch() {
        return branch;
      },
      async remoteStatus() {
        return {
          status: "ok",
          upstream: "origin/main",
          localAhead: 0,
          remoteAhead: 0
        };
      },
      async addAll() {
        calls.push({ name: "addAll" });
      },
      async commit(message) {
        calls.push({ name: "commit", message });
        status = "";
        return "[feature/report-sections abc123] save";
      },
      async checkout(targetBranch) {
        calls.push({ name: "checkout", branch: targetBranch });
        branch = targetBranch;
      }
    }
  });

  assert.equal(result.committed_local_changes, true);
  assert.equal(result.switched_branch, true);
  assert.equal(result.current_branch, "main");
  assert.deepEqual(calls.map((call) => call.name), ["addAll", "commit", "checkout"]);
});

test("publish prepare-clean-worktree clones a dedicated main checkout without touching launcher changes", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-launcher-"));
  const worktreeDir = path.join(repoRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  const result = await prepareCleanPublishWorktree({
    repoRoot,
    worktreeDir,
    remoteUrl: "git@github.com:owner/repo.git",
    installDependencies: false,
    commandRunner: fakeCommandRunner({ calls })
  });

  assert.equal(result.mode, "prepare-clean-worktree");
  assert.equal(result.repo_root, worktreeDir);
  assert.equal(result.remote_main_sha, "1111111111111111111111111111111111111111");
  assert.equal(result.cloned, true);
  assert.equal(result.clone_reference_root, repoRoot);
  assert.equal(result.clean, true);
  assert.equal(result.dependency_status.required, false);
  const cloneCall = calls.find((call) => call.args[0] === "clone");
  assert.ok(cloneCall, "expected clean worktree clone command");
  assert.deepEqual(cloneCall.args.slice(0, 4), ["clone", "--reference-if-able", repoRoot, "--dissociate"]);
  assert.deepEqual(cloneCall.args.slice(-2), ["git@github.com:owner/repo.git", worktreeDir]);
  assert.deepEqual(
    calls.map((call) => call.args.slice(0, 2).join(" ")),
    [
      "ls-remote git@github.com:owner/repo.git",
      "clone --reference-if-able",
      "rev-parse --abbrev-ref",
      "rev-parse HEAD",
      "status --porcelain"
    ]
  );
});

test("publish prepare-clean-worktree uses SSH pushurl for GitHub HTTPS remotes", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-ssh-pushurl-"));
  const worktreeDir = path.join(repoRoot, ".tmp", "publish-worktrees", "main");
  const calls = [];

  const result = await prepareCleanPublishWorktree({
    repoRoot,
    worktreeDir,
    remoteUrl: "https://github.com/owner/repo.git",
    installDependencies: false,
    commandRunner: fakeCommandRunner({ calls })
  });

  const pushUrlCall = calls.find((call) => call.args.slice(0, 4).join(" ") === "remote set-url --push origin");
  assert.ok(pushUrlCall, "expected clean worktree pushurl configuration");
  assert.deepEqual(pushUrlCall.args, [
    "remote",
    "set-url",
    "--push",
    "origin",
    "git@github.com:owner/repo.git"
  ]);
  assert.equal(result.remote_url, "https://github.com/owner/repo.git");
  assert.equal(result.push_remote_url, "git@github.com:owner/repo.git");
});

test("publish prepare-clean-worktree resets only the dedicated checkout when it already exists", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-existing-"));
  const worktreeDir = path.join(repoRoot, ".tmp", "publish-worktrees", "main");
  await fs.mkdir(path.join(worktreeDir, ".git"), { recursive: true });
  const calls = [];

  const result = await prepareCleanPublishWorktree({
    repoRoot,
    worktreeDir,
    remoteUrl: "git@github.com:owner/repo.git",
    installDependencies: false,
    commandRunner: fakeCommandRunner({ calls })
  });

  assert.equal(result.cloned, false);
  assert.equal(result.reset_to_remote, true);
  assert.deepEqual(
    calls.map((call) => call.args.slice(0, 2).join(" ")),
    [
      "ls-remote git@github.com:owner/repo.git",
      "fetch origin",
      "checkout --force",
      "reset --hard",
      "clean -fd",
      "rev-parse --abbrev-ref",
      "rev-parse HEAD",
      "status --porcelain"
    ]
  );
  const checkoutCall = calls.find((call) => call.args[0] === "checkout");
  assert.deepEqual(checkoutCall?.args, ["checkout", "--force", "-B", "main", "origin/main"]);
});

test("publish prepare-clean-worktree refreshes existing dependencies with the configured pnpm store", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-pnpm-store-"));
  const worktreeDir = path.join(repoRoot, ".tmp", "publish-worktrees", "main");
  const pnpmStoreDir = path.join(repoRoot, ".tmp", "pnpm-store");
  await fs.mkdir(path.join(worktreeDir, ".git"), { recursive: true });
  await fs.mkdir(path.join(worktreeDir, "node_modules"), { recursive: true });
  await fs.writeFile(path.join(worktreeDir, "package.json"), JSON.stringify({ scripts: {} }));
  const calls = [];

  const result = await prepareCleanPublishWorktree({
    repoRoot,
    worktreeDir,
    remoteUrl: "git@github.com:owner/repo.git",
    pnpmStoreDir,
    commandRunner: fakeCommandRunner({ calls })
  });

  const pnpmCall = calls.find((call) =>
    call.file === "pnpm" ||
    call.file === "corepack" ||
    call.file === "corepack.cmd" ||
    call.file === "cmd.exe"
  );
  assert.ok(pnpmCall, "expected pnpm install to run");
  if (pnpmCall.file === "cmd.exe") {
    assert.equal(pnpmCall.file, "cmd.exe");
    assert.deepEqual(pnpmCall.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.match(pnpmCall.args[3], /^corepack pnpm install --frozen-lockfile --store-dir /);
    assert.match(pnpmCall.args[3], /pnpm-store/);
  } else if (pnpmCall.file === "corepack") {
    assert.deepEqual(pnpmCall.args, ["pnpm", "install", "--frozen-lockfile", "--store-dir", pnpmStoreDir]);
  } else {
    assert.equal(pnpmCall.file, "pnpm");
    assert.deepEqual(pnpmCall.args, ["install", "--frozen-lockfile", "--store-dir", pnpmStoreDir]);
  }
  assert.equal(pnpmCall.env.PNPM_STORE_DIR, pnpmStoreDir);
  assert.equal(pnpmCall.env.pnpm_store_dir, undefined);
  assert.equal(result.dependency_status.command, `corepack pnpm install --frozen-lockfile --store-dir ${pnpmStoreDir}`);
  assert.equal(result.dependency_status.pnpm_store_dir, pnpmStoreDir);
});

test("publish prepare-clean-worktree rejects external paths unless explicitly allowed", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-safe-"));
  const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-external-"));

  await assert.rejects(
    prepareCleanPublishWorktree({
      repoRoot,
      worktreeDir: externalDir,
      remoteUrl: "git@github.com:owner/repo.git",
      installDependencies: false,
      commandRunner: fakeCommandRunner()
    }),
    (error) => error instanceof PublisherError && error.code === "publish_worktree_outside_repo"
  );
});

test("publish 需要显式确认参数", async () => {
  await assert.rejects(
    publishGeneratedArtifacts({ git: fakeGit({ status: " M docs/index.html" }) }),
    (error) => error instanceof PublisherError && error.code === "publish_confirmation_required"
  );
});

test("publish no-op returns the same result envelope as a real publish", async () => {
  const result = await publishGeneratedArtifacts({
    confirmPush: true,
    reportDate: "2026-05-13",
    git: fakeGit({ status: "" })
  });

  assert.equal(result.scope, "daily");
  assert.equal(result.publish_mode, "git");
  assert.equal(result.repo_updated, false);
  assert.equal(result.committed, false);
  assert.equal(result.pushed, false);
  assert.equal(result.pages_verified, false);
  assert.equal(result.verification_error, "");
  assert.equal(result.pages_url, "https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json");
});

test("github api publish 需要显式确认参数", async () => {
  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({ git: fakeGit({ status: " M docs/index.html" }) }),
    (error) => error instanceof PublisherError && error.code === "publish_confirmation_required"
  );
});

test("github api publish 通过远端 API 提交发布产物且不写本机 git 元数据", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.equal(result.scope, "daily");
  assert.equal(result.repo_updated, true);
  assert.equal(result.commit_sha, "commit-new");
  assert.deepEqual(result.published_files, ["docs/index.html"]);
  assert.equal(result.pages_verified, true);
  assert.equal(calls.find((call) => call.method === "PATCH").body.force, false);
  assert.equal(
    calls.find((call) => call.url.endsWith("/git/trees")).body.tree[0].content,
    "<!doctype html><title>AI 日报 2026-05-13</title>"
  );
});

test("github api publish 允许从非 main 工作树发布到远端 main", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ branch: "codex/discovery-fallbacks", status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.branch, "main");
  assert.equal(result.source_branch, "codex/discovery-fallbacks");
  assert.equal(result.committed, true);
  assert.equal(calls.find((call) => call.method === "PATCH").body.force, false);
});

test("github api publish 可从 token resolver 读取凭据", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    repository: "owner/repo",
    verifyPages: false,
    tokenResolver: async () => "resolved-token",
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch()
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
});

test("github api publish 跳过远端已一致的发布产物", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  const content = "<!doctype html><title>same</title>";
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), content);

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: " M docs/index.html" }),
    fetchImpl: fakeGitHubFetch({
      calls,
      remoteTree: [{ path: "docs/index.html", type: "blob", sha: gitBlobSha(content) }]
    })
  });

  assert.equal(result.committed, false);
  assert.equal(result.pushed, false);
  assert.equal(result.scope, "daily");
  assert.equal(result.repo_updated, false);
  assert.equal(result.pages_verified, false);
  assert.equal(result.verification_error, "");
  assert.equal(result.message, "远端已经包含相同发布产物，没有需要提交的变更。");
  assert.equal(calls.some((call) => call.method === "POST"), false);
});

test("github api publish can use planned generated files when the worktree is clean", async () => {
  const repoRoot = await tempRepoWithFixture();
  const buildResult = await buildSite({
    rootDir: repoRoot,
    inputDir: "reports-source",
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt: fixedGeneratedAt
  });
  await fs.mkdir(path.join(repoRoot, "reports-data/2026/05"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "reports-data/2026/05/2026-05-13.json"),
    `${JSON.stringify(buildResult.reports[0], null, 2)}\n`,
    "utf8"
  );

  const calls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    reportDate: "2026-05-13",
    token: "test-token",
    repository: "owner/repo",
    verifyPages: false,
    git: fakeGit({ status: "" }),
    fetchImpl: fakeGitHubFetch({ calls })
  });

  assert.equal(result.committed, true);
  assert(!result.published_files.includes("docs/reports/2026/05/2026-05-13.html"));
  assert(result.published_files.includes("docs/data/2026/05/2026-05-13.json"));
  assert(result.published_files.includes("reports-data/2026/05/2026-05-13.json"));
});

test("github api publish 遇到非发布器管理改动时停止", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html>");
  await fs.writeFile(path.join(repoRoot, "src/cli.js"), "console.log('dirty');");

  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({
      repoRoot,
      confirmPush: true,
      token: "test-token",
      repository: "owner/repo",
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" }),
      fetchImpl: fakeGitHubFetch()
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("publish 只提交发布器管理的文件", async () => {
  const calls = [];
  const result = await publishGeneratedArtifacts({
    confirmPush: true,
    reportDate: "2026-05-13",
    git: fakeGit({
      status: " M docs/index.html\n?? reports-data/2026/05/2026-05-13.json",
      calls
    })
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert.deepEqual(result.staged_files, ["docs/index.html", "reports-data/2026/05/2026-05-13.json"]);
  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "add", "commit", "push"]);
});

test("publish keeps dirty retrospective records scoped to the selected report date", async () => {
  const calls = [];
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: [
          " M retrospectives/index.json",
          "?? retrospectives/2026/05/2026-05-13.daily_publish.daily-run.json",
          "?? retrospectives/2026/05/2026-05-14.daily_publish.daily-run.json"
        ].join("\n"),
        calls
      })
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "publisher_dirty_outside_publish_plan" &&
      error.details.files.includes("retrospectives/2026/05/2026-05-14.daily_publish.daily-run.json")
  );

  assert.deepEqual(calls.map((call) => call.name), ["fetch"]);
});

test("github api publish keeps dirty retrospective records scoped to the selected report date", async () => {
  const repoRoot = await tempRepoWithFixture();
  await writeRetrospectiveFixture(repoRoot, "2026-05-13");
  await writeRetrospectiveFixture(repoRoot, "2026-05-14");

  await assert.rejects(
    publishGeneratedArtifactsViaGitHubApi({
      repoRoot,
      confirmPush: true,
      reportDate: "2026-05-13",
      token: "test-token",
      repository: "owner/repo",
      verifyPages: false,
      git: fakeGit({
        status: [
          " M retrospectives/index.json",
          "?? retrospectives/2026/05/2026-05-13.daily_publish.daily-run.json",
          "?? retrospectives/2026/05/2026-05-14.daily_publish.daily-run.json"
        ].join("\n")
      }),
      fetchImpl: fakeGitHubFetch()
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "publisher_dirty_outside_publish_plan" &&
      error.details.files.includes("retrospectives/2026/05/2026-05-14.daily_publish.daily-run.json")
  );
});

test("publish checks push transport before creating a new publish commit", async () => {
  const calls = [];
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/index.html",
        calls,
        pushDryRunError: new Error("ssh: connect to host github.com port 22: Permission denied")
      })
    }),
    (error) => error instanceof PublisherError && error.code === "git_push_unavailable"
  );

  assert.deepEqual(calls.map((call) => call.name), ["fetch"]);
});

test("publish reports committed local state when the final push fails", async () => {
  const calls = [];
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      reportDate: "2026-05-13",
      git: fakeGit({
        status: " M docs/index.html",
        calls,
        pushError: new Error("fatal: Could not read from remote repository.")
      })
    }),
    (error) =>
      error instanceof PublisherError &&
      error.code === "git_push_failed" &&
      error.details.repo_updated === true
  );

  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "add", "commit", "push"]);
});

test("publish 可在 push 后验证 Pages URL", async () => {
  const calls = [];
  const result = await publishGeneratedArtifacts({
    confirmPush: true,
    reportDate: "2026-05-13",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "<title>AI 日报 2026-05-13</title>"
    }),
    git: fakeGit({
      status: " M docs/index.html\n?? reports-data/2026/05/2026-05-13.json",
      calls
    })
  });

  assert.equal(result.pages_verified, true);
  assert.equal(result.verification_error, "");
  assert.equal(result.pages_url, "https://jasonxzwen.github.io/ai-daily-cn/data/2026/05/2026-05-13.json");
});

test("publish resume pushes existing local commits and verifies Pages", async () => {
  const calls = [];
  const result = await resumePublishPush({
    confirmPush: true,
    reportDate: "2026-05-13",
    verifyPages: true,
    verificationAttempts: 1,
    verificationIntervalMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "<title>AI 鏃ユ姤 2026-05-13</title>"
    }),
    git: fakeGit({
      status: "",
      localAhead: 3,
      calls
    })
  });

  assert.equal(result.pushed, true);
  assert.equal(result.repo_updated, true);
  assert.equal(result.pushed_existing_commits, true);
  assert.equal(result.pages_verified, true);
  assert.deepEqual(calls.map((call) => call.name), ["fetch", "pushDryRun", "push"]);
});

test("publish 遇到非发布器管理改动时停止", async () => {
  await assert.rejects(
    publishGeneratedArtifacts({
      confirmPush: true,
      git: fakeGit({ status: " M src/cli.js\n M docs/index.html" })
    }),
    (error) => error instanceof PublisherError && error.code === "dirty_worktree"
  );
});

test("parsePorcelain 保留首行前导状态列并兼容单状态输出", () => {
  assert.deepEqual(parsePorcelain(" M docs/feed.json\n?? reports-data/2026/05/2026-05-14.json"), [
    { code: " M", path: "docs/feed.json" },
    { code: "??", path: "reports-data/2026/05/2026-05-14.json" }
  ]);
  assert.deepEqual(parsePorcelain("M docs/feed.json"), [{ code: "M ", path: "docs/feed.json" }]);
});

test("verifyPublishedUrl 重试直到页面可访问且包含目标日期", async () => {
  const statuses = [404, 200];
  const result = await verifyPublishedUrl("https://example.com/report.html", {
    attempts: 2,
    intervalMs: 0,
    expectedText: "2026-05-13",
    fetchImpl: async () => {
      const status = statuses.shift();
      return {
        ok: status === 200,
        status,
        text: async () => "AI 日报 2026-05-13"
      };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
});

test("verifyPublishedUrl 在页面持续不可用时返回错误", async () => {
  const result = await verifyPublishedUrl("https://example.com/missing.html", {
    attempts: 1,
    intervalMs: 0,
    fetchImpl: async () => ({
      ok: false,
      status: 404,
      text: async () => "not found"
    })
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /HTTP 404/);
});

test("github api publish falls back to git credential helper when gh auth is unavailable", async () => {
  const repoRoot = await tempRepoWithFixture();
  await fs.mkdir(path.join(repoRoot, "docs"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, "docs/index.html"), "<!doctype html><title>AI 日报 2026-05-13</title>");

  const commandCalls = [];
  const fetchCalls = [];
  const result = await publishGeneratedArtifactsViaGitHubApi({
    repoRoot,
    confirmPush: true,
    repository: "owner/repo",
    verifyPages: false,
    env: withoutGitHubTokenEnv(),
    commandRunner: async (file, args, options = {}) => {
      commandCalls.push({ file, args, input: options.input, env: options.env || {} });
      if (file === "gh") {
        throw new Error("Access is denied");
      }
      if (file === "git" && args.join(" ") === "credential fill") {
        return "protocol=https\nhost=github.com\nusername=x-access-token\npassword=credential-token\n";
      }
      return "";
    },
    git: fakeGit({
      status: " M docs/index.html",
      remoteUrl: "https://github.com/owner/repo.git"
    }),
    fetchImpl: fakeGitHubFetch({ calls: fetchCalls })
  });

  assert.equal(result.committed, true);
  assert.equal(result.pushed, true);
  assert(commandCalls.some((call) => call.file === "gh"));
  const credentialCall = commandCalls.find((call) => call.file === "git" && call.args.join(" ") === "credential fill");
  assert.equal(credentialCall.input, "protocol=https\nhost=github.com\n\n");
  assert.equal(fetchCalls[0].headers.Authorization, "Bearer credential-token");
});

function fakeGit(overrides = {}) {
  const calls = overrides.calls || [];
  return {
    async status() {
      return overrides.status || "";
    },
    async branch() {
      return overrides.branch || "main";
    },
    async remoteStatus() {
      return {
        status: "ok",
        upstream: "origin/main",
        localAhead: overrides.localAhead || 0,
        remoteAhead: overrides.remoteAhead || 0
      };
    },
    async fetch(branch) {
      if (overrides.fetchError) {
        throw overrides.fetchError;
      }
      calls.push({ name: "fetch", branch });
      return overrides.fetchOutput || "";
    },
    async add(files) {
      calls.push({ name: "add", files });
      return "";
    },
    async commit(message) {
      calls.push({ name: "commit", message });
      return "[main abc123] test";
    },
    async pushDryRun(branch) {
      if (overrides.pushDryRunError) {
        throw overrides.pushDryRunError;
      }
      calls.push({ name: "pushDryRun", branch });
      return overrides.pushDryRunOutput || "dry-run ok";
    },
    async push(branch) {
      calls.push({ name: "push", branch });
      if (overrides.pushError) {
        throw overrides.pushError;
      }
      return "pushed";
    },
    async remoteUrl() {
      return overrides.remoteUrl || "git@github.com:owner/repo.git";
    }
  };
}

function fakeCommandRunner(options = {}) {
  const calls = options.calls || [];
  return async (file, args, commandOptions = {}) => {
    calls.push({ file, args, cwd: commandOptions.cwd, env: commandOptions.env || {} });
    if (options.fail && options.fail(args)) {
      throw new Error(options.failMessage || "command failed");
    }
    if (args[0] === "ls-remote") {
      return `${options.remoteSha || "1111111111111111111111111111111111111111"}\trefs/heads/main\n`;
    }
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
      return options.branch || "main";
    }
    if (args[0] === "rev-parse" && args[1] === "HEAD") {
      return options.headSha || options.remoteSha || "1111111111111111111111111111111111111111";
    }
    if (args[0] === "status") {
      return options.status || "";
    }
    return "";
  };
}

function fakeGitHubFetch(options = {}) {
  const calls = options.calls || [];
  const remoteTree = options.remoteTree || [];
  return async (url, init = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body, headers: init.headers || {} });

    if (url.endsWith("/git/ref/heads/main")) {
      return jsonResponse({ object: { sha: "commit-base" } });
    }
    if (url.endsWith("/git/commits/commit-base")) {
      return jsonResponse({ sha: "commit-base", tree: { sha: "tree-base" } });
    }
    if (url.endsWith("/git/trees/tree-base?recursive=1")) {
      return jsonResponse({ tree: remoteTree });
    }
    if (url.endsWith("/git/trees") && method === "POST") {
      return jsonResponse({ sha: "tree-new" });
    }
    if (url.endsWith("/git/commits") && method === "POST") {
      return jsonResponse({ sha: "commit-new" });
    }
    if (url.endsWith("/git/refs/heads/main") && method === "PATCH") {
      return jsonResponse({ object: { sha: "commit-new" } });
    }
    if (new URL(url).hostname === "jasonxzwen.github.io") {
      return {
        ok: true,
        status: 200,
        text: async () => "AI 日报 2026-05-13"
      };
    }
    return jsonResponse({ message: `unexpected ${method} ${url}` }, 404);
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
    json: async () => value
  };
}

function gitBlobSha(content) {
  return crypto.createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0${content}`).digest("hex");
}

async function tempRepoWithFixture() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-publish-"));
  const inputDir = path.join(tmp, "reports-source");
  const configDir = path.join(tmp, "config");
  await fs.mkdir(path.join(tmp, "reports-data"), { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });
  await fs.copyFile(path.join(rootDir, "config/trends.json"), path.join(configDir, "trends.json"));
  await fs.copyFile(
    path.join(rootDir, "tests/fixtures/reports/good/official-release.md"),
    path.join(inputDir, "official-release.md")
  );
  return tmp;
}

async function writeSignalFixture(repoRoot, reportDate) {
  await ensurePublishBaselineManifest(repoRoot);
  const generatedAt = `${reportDate}T08:00:00.000Z`;
  const sources = [{
    id: "community-listener",
    name: "Community listener",
    url: "https://example.com/feed.xml",
    category: "community",
    source_group: "community_discussions",
    status: "checked"
  }];
  const candidates = [{
    id: "signal-item",
    observation_id: "signal-item-observation",
    source_id: "community-listener",
    category: "community_lead",
    title: "Community signal",
    url: "https://example.com/signals/one",
    source: "Community listener",
    event_date: reportDate,
    collected_at: generatedAt,
    status: "excluded"
  }];
  await writeOccurrenceStore({
    rootDir: repoRoot,
    outputDir: "reports-data",
    store: buildOccurrenceStore({ reportDate, generatedAt, sources, candidates })
  });
  await buildPublicSignals({
    rootDir: repoRoot,
    dataInputDir: "reports-data",
    outDir: "docs",
    generatedAt
  });
}

async function writeCuratedShadowReceiptFixture(repoRoot, reportDate, options = {}) {
  await ensureCuratedShadowCanonicalOwners(repoRoot);
  const canonicalOwners = await loadCuratedShadowCanonicalOwners({ rootDir: repoRoot });
  const [year, month] = reportDate.split("-");
  const payloadReportDate = options.payloadReportDate || reportDate;
  const generatedAt = options.generatedAt || `${payloadReportDate}T08:00:00.000Z`;
  const observationsPath = path.join(repoRoot, "reports-data", "observations", year, month, `${reportDate}.json`);
  const funnelPath = path.join(repoRoot, "reports-data", "source-funnel", year, month, `${reportDate}.json`);
  const rawId = "raw_0123456789abcdef01234567";
  const excerpt = options.excerpt || "A safe runtime observation.";
  const observation = {
    id: rawId,
    observation_id: "runtime-observation",
    source_id: "runtime-source",
    raw_record_count: 1,
    material_url: "https://example.com/item",
    material_url_hash: rawMaterialUrlHash("https://example.com/item"),
    title: "Runtime observation",
    excerpt,
    excerpt_origin: "source_feed",
    excerpt_hash: `sha256:${crypto.createHash("sha256").update(excerpt).digest("hex")}`,
    publisher_hint: "Example",
    collector: {
      id: "runtime-source",
      name: "Runtime source",
      url: "https://example.com/feed",
      source_kind: "runtime_fixture"
    },
    author: null,
    handle: null,
    event_date: payloadReportDate,
    published_at: null,
    collected_at: generatedAt,
    fetch_status: "fetched",
    parse_status: "parsed",
    content_hash: null,
    source_group: "news_newsletters",
    content_tags: []
  };
  observation.content_hash = rawObservationContentHash(observation);
  const observations = options.observation ? [observation] : [];
  const stage = (unit, status = "not_run", itemIds = []) => ({
    status,
    unit,
    count: itemIds.length,
    item_ids: itemIds,
    failure_reason: ""
  });
  const lane = (laneId, logicalSourceId = "aify-news", parsedIds = [], sourceEntryIds = [laneId]) => ({
    lane_id: laneId,
    logical_source_id: logicalSourceId,
    source_entry_ids: sourceEntryIds,
    priority: true,
    terminal_status: parsedIds.length > 0 ? "success_with_items" : "not_run",
    failure_reason: "",
    stages: {
      registered: stage("source_entry", "success_with_items", [laneId]),
      fetched: parsedIds.length > 0 ? stage("fetch_attempt", "success_with_items", [`fetch:${laneId}:1`]) : stage("fetch_attempt"),
      parsed: parsedIds.length > 0 ? stage("observation", "success_with_items", parsedIds) : stage("observation"),
      admitted: stage("signal"),
      displayed: stage("edition_item")
    }
  });
  const assetReconciliation = buildCuratedSourceAssetReconciliation({
    ...canonicalOwners,
    sources: canonicalOwners.registry.sources,
    auditRows: new Map(),
    rawObservations: { generated_at: generatedAt, observations },
    sourcesPath: canonicalOwners.sourcesAnchor
  });
  options.mutateReconciliation?.(assetReconciliation);
  await fs.mkdir(path.dirname(observationsPath), { recursive: true });
  await fs.mkdir(path.dirname(funnelPath), { recursive: true });
  await Promise.all([
    fs.writeFile(observationsPath, `${JSON.stringify({
      schema_version: 1,
      kind: "raw_observations",
      report_date: payloadReportDate,
      generated_at: generatedAt,
      input_record_count: observations.length,
      observation_count: observations.length,
      normalization_error_count: 0,
      normalization_errors: [],
      rejection_count: 0,
      rejections: [],
      observations
    }, null, 2)}\n`, "utf8"),
    fs.writeFile(funnelPath, `${JSON.stringify({
      schema_version: 1,
      kind: "source_funnel",
      pipeline_phase: "phase_1a_shadow",
      report_date: payloadReportDate,
      generated_at: generatedAt,
       asset_reconciliation: assetReconciliation,
      lanes: [
        lane("aify_today_picks"),
        lane("site-aify-news"),
        ...(options.observation && !options.omitObservationLane)
          ? [lane(
              "runtime-source",
              "runtime-source",
              [rawId],
              options.observationLaneSourceIds || ["runtime-source"]
            )]
          : []
      ]
    }, null, 2)}\n`, "utf8")
  ]);
}

async function writeSignalPoolReceiptFixture(repoRoot, reportDate, options = {}) {
  const [year, month] = reportDate.split("-");
  const rawPath = path.join(repoRoot, "reports-data", "observations", year, month, `${reportDate}.json`);
  const funnelPath = path.join(repoRoot, "reports-data", "source-funnel", year, month, `${reportDate}.json`);
  const [rawObservations, sourceFunnel, contract] = await Promise.all([
    fs.readFile(rawPath, "utf8").then(JSON.parse),
    fs.readFile(funnelPath, "utf8").then(JSON.parse),
    loadSignalAdmissionContract({ rootDir })
  ]);
  const contractPath = path.join(repoRoot, "config", "signal-admission-contract.json");
  await fs.mkdir(path.dirname(contractPath), { recursive: true });
  await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  const artifacts = await buildSignalPoolArtifacts({
    rootDir: repoRoot,
    reportDate,
    generatedAt: rawObservations.generated_at,
    rawObservations,
    sourceFunnel,
    contract
  });
  options.mutateSignalPool?.(artifacts.signalPool);
  options.mutatePublicSignalPool?.(artifacts.publicSignalPool);
  const signalPath = path.join(repoRoot, "reports-data", "signals", year, month, `${reportDate}.json`);
  const publicSignalPath = path.join(repoRoot, "reports-data", "public-signal-pool", year, month, `${reportDate}.json`);
  await Promise.all([
    fs.mkdir(path.dirname(signalPath), { recursive: true }),
    fs.mkdir(path.dirname(publicSignalPath), { recursive: true })
  ]);
  const writes = [];
  if (!options.omitSignalPool) {
    writes.push(fs.writeFile(signalPath, `${JSON.stringify(artifacts.signalPool, null, 2)}\n`, "utf8"));
  }
  if (!options.omitPublicSignalPool) {
    writes.push(fs.writeFile(publicSignalPath, `${JSON.stringify(artifacts.publicSignalPool, null, 2)}\n`, "utf8"));
  }
  await Promise.all(writes);
}

async function ensureCuratedShadowCanonicalOwners(repoRoot) {
  curatedShadowCanonicalFixturePromise ||= loadCuratedShadowCanonicalOwners({ rootDir }).then((owners) => ({
    registrySource: owners.registry.sources[0],
    promotionReview: "# Fixture promotion review\n\n<!-- promotion-candidate-review -->\n\n### End\n",
    recoveryLedger: "# Fixture recovery ledger\n\n### REC-315\n\n### REC-316\n"
  }));
  const fixture = await curatedShadowCanonicalFixturePromise;
  await Promise.all([
    fs.mkdir(path.join(repoRoot, "config", "sources"), { recursive: true }),
    fs.mkdir(path.join(repoRoot, "docs"), { recursive: true }),
    fs.mkdir(path.join(repoRoot, "tasks"), { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(
      path.join(repoRoot, "config", "sources", "registry.json"),
      `${JSON.stringify({ schema_version: 1, sources: [fixture.registrySource] }, null, 2)}\n`,
      "utf8"
    ),
    fs.writeFile(path.join(repoRoot, "docs", "source-order-tuning-review.md"), fixture.promotionReview, "utf8"),
    fs.writeFile(path.join(repoRoot, "tasks", "project-recovery-ledger.md"), fixture.recoveryLedger, "utf8")
  ]);
}

async function ensurePublishBaselineManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "reports-data", "occurrence-baseline-manifest.json");
  try {
    await fs.access(manifestPath);
    return;
  } catch {
    // A fixture with no historical baseline still declares the required immutable empty set.
  }
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify({
      schema_version: 1,
      kind: "public_signal_occurrence_baseline",
      source: { occurrence_count: 0 },
      migration: { production_reads_legacy_artifacts: false },
      files: []
    }, null, 2)}\n`,
    "utf8"
  );
}

async function writePublishBaselineFixture(repoRoot) {
  const reportDate = "2026-04-01";
  const generatedAt = `${reportDate}T08:00:00.000Z`;
  const store = buildOccurrenceStore({
    reportDate,
    generatedAt,
    sources: [{
      id: "baseline-listener",
      name: "Baseline listener",
      url: "https://example.com/baseline.xml",
      category: "community",
      source_group: "community_discussions",
      status: "checked"
    }],
    candidates: [{
      id: "baseline-item",
      observation_id: "baseline-item-observation",
      source_id: "baseline-listener",
      category: "community_lead",
      title: "Historical community signal",
      url: "https://example.com/signals/historical",
      source: "Baseline listener",
      event_date: reportDate,
      collected_at: generatedAt,
      status: "excluded"
    }]
  });
  const baselinePath = path.join(repoRoot, "reports-data", "occurrences", "baseline-v1", "2026-04.json");
  await fs.mkdir(path.dirname(baselinePath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(store, null, 2)}\n`);
  await fs.writeFile(baselinePath, bytes);
  const relativePath = path.relative(repoRoot, baselinePath).replaceAll("\\", "/");
  await fs.writeFile(
    path.join(repoRoot, "reports-data", "occurrence-baseline-manifest.json"),
    `${JSON.stringify({
      schema_version: 1,
      kind: "public_signal_occurrence_baseline",
      source: { occurrence_count: store.occurrence_count },
      migration: { production_reads_legacy_artifacts: false },
      files: [{
        path: relativePath,
        report_date: store.report_date,
        occurrence_count: store.occurrence_count,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        compressed_bytes: bytes.length
      }]
    }, null, 2)}\n`,
    "utf8"
  );
  return baselinePath;
}

async function writeRetrospectiveFixture(repoRoot, reportDate, options = {}) {
  const [year, month] = reportDate.split("-");
  const runType = options.runType || "daily_publish";
  const slug = options.slug || "daily-run";
  const record = {
    schema_version: 1,
    id: `${reportDate}.${runType}.${slug}`,
    run_type: runType,
    date: reportDate,
    title: `Retrospective ${reportDate}`,
    status: options.status || "generated_only",
    summary: "Sanitized daily publish retrospective fixture.",
    evidence: {
      report_json: `reports-data/${year}/${month}/${reportDate}.json`,
      docs_data_json: `docs/data/${year}/${month}/${reportDate}.json`,
      validation_commands: ["corepack pnpm run validate"]
    },
    blockers: [],
    degraded_sections: [],
    lessons: [],
    suggestions: [],
    ledger_links: ["feedback/p1-authoritative-retrospectives"],
    followups: []
  };
  const recordPath = path.join(repoRoot, "retrospectives", year, month, `${record.id}.json`);
  await fs.mkdir(path.dirname(recordPath), { recursive: true });
  await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(repoRoot, "retrospectives", "index.json"),
    `${JSON.stringify({
      schema_version: 1,
      generated_at: "2026-06-12T12:00:00.000Z",
      records: [
        {
          id: record.id,
          run_type: record.run_type,
          date: record.date,
          status: record.status,
          path: `retrospectives/${year}/${month}/${record.id}.json`,
          title: record.title
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
}
