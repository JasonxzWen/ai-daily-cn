import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildDailyWorkflowStages } from "../src/daily-runner.js";
import { collectContentSources } from "../src/discovery.js";
import { generateReportDraft, officialBlogContentTypeByCandidateId } from "../src/draft.js";

const reportDate = "2026-07-10";
const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("daily workflow produces official-blog context before report draft and passes the private artifact explicitly", () => {
  const stages = buildDailyWorkflowStages({ reportDate, publish: false });
  const contentIndex = stages.findIndex((stage) => stage.id === "discover_content_sources");
  const producerIndex = stages.findIndex((stage) => stage.id === "official_blog_context");
  const draftIndex = stages.findIndex((stage) => stage.id === "report_draft");
  const producer = stages[producerIndex];
  const draft = stages[draftIndex];

  assert(producerIndex > contentIndex);
  assert(producerIndex < draftIndex);
  assert.deepEqual(producer.command.args, [
    "src/cli.js",
    "official-blog:context",
    "--input",
    `.tmp/content-sources-${reportDate}.json`,
    "--output",
    `.tmp/official-blog-context-${reportDate}.json`,
    "--date",
    reportDate,
    "--limit",
    "8"
  ]);
  const contextFlag = draft.command.args.indexOf("--official-blog-context");
  assert(contextFlag > 0);
  assert.equal(draft.command.args[contextFlag + 1], `.tmp/official-blog-context-${reportDate}.json`);
});

test("official-blog context producer rejects a requested date that differs from its source artifact", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-context-cli-date-"));
  const inputPath = path.join(tmp, ".tmp", "content-sources.json");
  const outputPath = path.join(tmp, ".tmp", "official-blog-context.json");
  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({ report_date: "2026-07-09", candidates: [] })}\n`, "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(rootDir, "src", "cli.js"),
      "official-blog:context",
      "--repo-root",
      rootDir,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--date",
      reportDate
    ], { cwd: rootDir }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.error, "official_blog_context_report_date_mismatch");
      return true;
    }
  );
});

test("official-blog context producer rejects a dated request when the source artifact has no business date", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-context-cli-missing-date-"));
  const inputPath = path.join(tmp, ".tmp", "content-sources.json");
  const outputPath = path.join(tmp, ".tmp", "official-blog-context.json");
  await fs.mkdir(path.dirname(inputPath), { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify({ candidates: [] })}\n`, "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [
      path.join(rootDir, "src", "cli.js"),
      "official-blog:context",
      "--repo-root",
      rootDir,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--date",
      reportDate
    ], { cwd: rootDir }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.error, "official_blog_context_report_date_missing");
      return true;
    }
  );
});

test("real content-source output carries its business date through official-blog context into the draft", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-daily-context-producer-"));
  const sourceRelativePath = `.tmp/content-sources-${reportDate}.json`;
  const contextRelativePath = `.tmp/official-blog-context-${reportDate}.json`;
  const sourcePath = path.join(tmp, sourceRelativePath);
  const contextPath = path.join(tmp, contextRelativePath);
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });

  const generatedAt = `${reportDate}T08:00:00.000Z`;
  const collected = await collectContentSources({
    rootDir: tmp,
    reportDate,
    generatedAt,
    sources: [],
    env: {},
    fetchImpl: async () => {
      throw new Error("empty source fixture must not fetch");
    }
  });
  assert.equal(collected.report_date, reportDate);
  assert.equal(collected.generated_at, generatedAt);
  await fs.writeFile(sourcePath, `${JSON.stringify({ ok: true, ...collected }, null, 2)}\n`, "utf8");

  await execFileAsync(process.execPath, [
    path.join(rootDir, "src", "cli.js"),
    "official-blog:context",
    "--repo-root",
    tmp,
    "--input",
    sourcePath,
    "--output",
    contextPath,
    "--date",
    reportDate,
    "--generated-at",
    generatedAt
  ], { cwd: rootDir });

  const result = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt,
    inputPaths: [sourceRelativePath],
    officialBlogContextPath: contextRelativePath,
    allowDegradedInputs: true,
    cacheEvidence: false
  });

  assert.equal(result.officialBlogContextReceipt.consumed, true);
  assert.equal(result.officialBlogContextReceipt.reason, "same_day_source_and_context_sha_verified");
});

test("report draft consumes same-day official-blog context with matching source SHA", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-daily-context-"));
  const sourceRelativePath = `.tmp/content-sources-${reportDate}.json`;
  const contextRelativePath = `.tmp/official-blog-context-${reportDate}.json`;
  const sourcePath = path.join(tmp, sourceRelativePath);
  const contextPath = path.join(tmp, contextRelativePath);
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  const sourcePayload = {
    report_date: reportDate,
    generated_at: `${reportDate}T08:00:00.000Z`,
    source_audit: {},
    sources: [],
    candidates: [{ id: "openai-context-candidate", title: "OpenAI context candidate", url: "https://openai.com/index/context-candidate/" }]
  };
  const sourceRaw = `${JSON.stringify(sourcePayload, null, 2)}\n`;
  await fs.writeFile(sourcePath, sourceRaw, "utf8");
  const context = {
    schema_version: 1,
    kind: "official_blog_knowledge_context",
    visibility: "internal",
    generated_at: `${reportDate}T08:00:00.000Z`,
    admission_policy: { version: "official-blog-admission-v1" },
    stats: { total_entries: 0, matched_entries: 0, unmatched_entries: 0, matched_records: 1, invalid_entries: 0 },
    records: [{ id: "openai-context-record", content_type: "engineering_note", score: 0, source_entry_indexes: [0] }],
    invalid_entries: []
  };
  const bindings = [{ record_id: "openai-context-record", content_type: "engineering_note", score: 0, candidate_ids: ["openai-context-candidate"], normalized_urls: [] }];
  const artifact = {
    ok: true,
    kind: "official_blog_daily_context",
    report_date: reportDate,
    generated_at: `${reportDate}T08:00:00.000Z`,
    source_artifact_path: sourceRelativePath,
    source_artifact_sha256: createHash("sha256").update(sourceRaw).digest("hex"),
    context_sha256: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    bindings_sha256: createHash("sha256").update(JSON.stringify(bindings)).digest("hex"),
    bindings,
    context
  };
  await fs.writeFile(contextPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const result = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    generatedAt: `${reportDate}T08:00:00.000Z`,
    inputPaths: [sourceRelativePath],
    officialBlogContextPath: contextRelativePath,
    outputPath: ".tmp/daily-report.json",
    candidateOutputPath: `.tmp/source-candidates-${reportDate}.json`,
    allowDegradedInputs: true,
    cacheEvidence: false
  });

  assert.equal(result.officialBlogContextReceipt.consumed, true);
  assert.equal(result.officialBlogContextReceipt.record_count, 1);
  assert.deepEqual(result.officialBlogContextReceipt.content_types, ["engineering_note"]);
  assert.equal(result.report.self_check.official_blog_context.artifact_sha256, result.officialBlogContextReceipt.artifact_sha256);
  assert.equal(JSON.stringify(result.report.self_check.official_blog_context).includes(tmp), false);
});

test("report draft refuses to consume stale official-blog source hashes without blocking the daily", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-daily-context-stale-"));
  const sourceRelativePath = `.tmp/content-sources-${reportDate}.json`;
  const contextRelativePath = `.tmp/official-blog-context-${reportDate}.json`;
  await fs.mkdir(path.join(tmp, ".tmp"), { recursive: true });
  await fs.writeFile(
    path.join(tmp, sourceRelativePath),
    `${JSON.stringify({ report_date: reportDate, source_audit: {}, sources: [], candidates: [] })}\n`,
    "utf8"
  );
  await fs.writeFile(path.join(tmp, contextRelativePath), `${JSON.stringify({
    ok: true,
    kind: "official_blog_daily_context",
    report_date: reportDate,
    source_artifact_path: sourceRelativePath,
    source_artifact_sha256: "0".repeat(64),
    context_sha256: "1".repeat(64),
    bindings_sha256: createHash("sha256").update(JSON.stringify([])).digest("hex"),
    bindings: [],
    context: { kind: "official_blog_knowledge_context", visibility: "internal", records: [] }
  })}\n`, "utf8");

  const result = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    inputPaths: [sourceRelativePath],
    officialBlogContextPath: contextRelativePath,
    allowDegradedInputs: true,
    cacheEvidence: false
  });

  assert.equal(result.officialBlogContextReceipt.consumed, false);
  assert.equal(result.officialBlogContextReceipt.reason, "source_artifact_sha256_mismatch");
  assert.equal(result.report.self_check.official_blog_context.consumed, false);
});

test("report draft refuses an official-blog source artifact from another report date", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-daily-context-date-"));
  const sourceRelativePath = `.tmp/content-sources-${reportDate}.json`;
  const contextRelativePath = `.tmp/official-blog-context-${reportDate}.json`;
  await fs.mkdir(path.join(tmp, ".tmp"), { recursive: true });
  const sourceRaw = `${JSON.stringify({ report_date: "2026-07-09", source_audit: {}, sources: [], candidates: [] })}\n`;
  await fs.writeFile(path.join(tmp, sourceRelativePath), sourceRaw, "utf8");
  const context = { kind: "official_blog_knowledge_context", visibility: "internal", records: [] };
  await fs.writeFile(path.join(tmp, contextRelativePath), `${JSON.stringify({
    ok: true,
    kind: "official_blog_daily_context",
    report_date: reportDate,
    source_artifact_path: sourceRelativePath,
    source_artifact_sha256: createHash("sha256").update(sourceRaw).digest("hex"),
    context_sha256: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    bindings_sha256: createHash("sha256").update(JSON.stringify([])).digest("hex"),
    bindings: [],
    context
  })}\n`, "utf8");

  const result = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    inputPaths: [sourceRelativePath],
    officialBlogContextPath: contextRelativePath,
    allowDegradedInputs: true,
    cacheEvidence: false
  });

  assert.equal(result.officialBlogContextReceipt.consumed, false);
  assert.equal(result.officialBlogContextReceipt.reason, "source_artifact_report_date_mismatch");
});

test("report draft rejects official-blog bindings that do not match context records and source entries", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "official-blog-daily-context-binding-"));
  const sourceRelativePath = `.tmp/content-sources-${reportDate}.json`;
  const contextRelativePath = `.tmp/official-blog-context-${reportDate}.json`;
  await fs.mkdir(path.join(tmp, ".tmp"), { recursive: true });
  const sourceRaw = `${JSON.stringify({
    report_date: reportDate,
    source_audit: {},
    sources: [],
    candidates: [{ id: "candidate-1", title: "Exact official blog candidate", url: "https://openai.com/index/new-tools-for-building-agents/" }]
  })}\n`;
  await fs.writeFile(path.join(tmp, sourceRelativePath), sourceRaw, "utf8");
  const context = {
    kind: "official_blog_knowledge_context",
    visibility: "internal",
    records: [{
      id: "exact-record",
      content_type: "product_practice",
      score: 43,
      source_entry_indexes: [0]
    }]
  };
  const bindings = [{
    record_id: "not-in-context",
    content_type: "safety_policy",
    score: 999,
    candidate_ids: ["candidate-1"],
    normalized_urls: []
  }];
  await fs.writeFile(path.join(tmp, contextRelativePath), `${JSON.stringify({
    ok: true,
    kind: "official_blog_daily_context",
    report_date: reportDate,
    source_artifact_path: sourceRelativePath,
    source_artifact_sha256: createHash("sha256").update(sourceRaw).digest("hex"),
    context_sha256: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    bindings_sha256: createHash("sha256").update(JSON.stringify(bindings)).digest("hex"),
    bindings,
    context
  })}\n`, "utf8");

  const result = await generateReportDraft({
    rootDir: tmp,
    reportDate,
    inputPaths: [sourceRelativePath],
    officialBlogContextPath: contextRelativePath,
    allowDegradedInputs: true,
    cacheEvidence: false
  });

  assert.equal(result.officialBlogContextReceipt.consumed, false);
  assert.equal(result.officialBlogContextReceipt.reason, "bindings_context_source_mismatch");
});

test("official-blog content type keeps the highest-score binding for one candidate", () => {
  const resolved = officialBlogContentTypeByCandidateId({
    bindings: [
      { record_id: "exact", content_type: "product_practice", score: 43, candidate_ids: ["candidate-1"] },
      { record_id: "topical", content_type: "best_practice", score: 9, candidate_ids: ["candidate-1"] }
    ]
  });

  assert.equal(resolved.get("candidate-1"), "product_practice");
});
