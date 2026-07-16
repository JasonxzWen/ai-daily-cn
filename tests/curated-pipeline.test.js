import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectAifyTodayPicks, parseAifyTodayPicksHtml } from "../src/aify-today-picks.js";
import {
  loadCuratedShadowCanonicalOwners,
  runCuratedSourceShadow,
  validateCuratedShadowArtifacts,
  writeJsonPairAtomic
} from "../src/curated-source-shadow.js";
import { buildDailyWorkflowStages, runDailyWorkflow } from "../src/daily-runner.js";
import { findRepoSafeReceiptPrivacyFindings, scanPublicArtifactsForLocalInfo } from "../src/privacy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(
  __dirname,
  "fixtures",
  "product-contract",
  "production-regression-2026-07-15"
);

test("scheduled curated source shadow runs before legacy signal persistence", () => {
  const stages = buildDailyWorkflowStages({
    reportDate: "2026-07-16",
    publish: false,
    generatedAt: "2026-07-16T02:33:00.000Z"
  });
  const stageIds = stages.map((stage) => stage.id);
  const shadowIndex = stageIds.indexOf("curated_source_shadow");
  const legacySignalIndex = stageIds.indexOf("signals_write");

  assert.notEqual(shadowIndex, -1, "real daily workflow must schedule curated_source_shadow");
  assert.notEqual(legacySignalIndex, -1, "legacy signal persistence remains scheduled");
  assert(shadowIndex < legacySignalIndex, "shadow receipts must close before legacy signal persistence");
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
  assert.equal(Object.hasOwn(result, "html"), false, "the homepage body must never be persisted");
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

  for (const title of ["TEST2", "TEST_S"]) {
    assert.equal(rejectionReason({ title }), "placeholder_content");
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

  assert.equal(raw.observation_count, 8);
  assert.equal(raw.input_record_count, 9);
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
  secretDiscovery.candidates[0].description = "Authorization: Bearer ghp_FAKESECRET0123456789 must never persist.";
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
    targets: ["reports-data/observations", "reports-data/source-funnel"]
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
