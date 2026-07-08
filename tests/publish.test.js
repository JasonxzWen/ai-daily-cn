import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PublisherError } from "../src/errors.js";
import {
  checkPublishPreflight,
  createDailyPublishPlan,
  createPublishPlan,
  isGitHubApiFallbackEligibleError,
  parsePorcelain,
  prepareCleanPublishWorktree,
  preparePublishWorktree,
  publishGeneratedArtifactsViaGitHubApi,
  publishGeneratedArtifacts,
  resumePublishPush,
  verifyPublishedUrl
} from "../src/publish.js";
import { buildSite } from "../src/site.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const fixedGeneratedAt = "2026-05-13T02:35:00+08:00";

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
  assert.equal(plan.expected_pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");
  assert(plan.will_write_files.includes("docs/reports/2026/05/2026-05-13.html"));
  assert(plan.will_stage_files.includes("docs/feed.json"));
  assert(plan.will_stage_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/ops.html"));
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
  assert.equal(plan.expected_pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");
  assert(plan.will_write_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/articles.json"));
  assert(plan.will_stage_files.includes("docs/ops.html"));
  assert(plan.will_stage_files.includes("docs/data/official-blogs.json"));
  assert(plan.will_stage_files.includes("docs/official-blogs/index.html"));
  assert(plan.will_stage_files.includes("docs/data/2026/05/2026-05-13.json"));
  assert(!plan.will_stage_files.includes("docs/data/2026/05/2026-05-13.candidates.json"));
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
  await fs.writeFile(
    path.join(repoRoot, "reports-data", "source-status-history.json"),
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
      status: " M reports-data/source-status-history.json"
    })
  });

  assert(plan.will_stage_files.includes("reports-data/source-status-history.json"));
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
  const [year, month] = report.report_date.split("-");
  assert(plan.will_stage_files.includes(`docs/assets/avatars/${year}/${month}/${report.report_date}-example.png`));
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
      "main_stream_blacklist_refill_5_to_30",
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
  assert.equal(result.clean, true);
  assert.equal(result.dependency_status.required, false);
  assert.deepEqual(
    calls.map((call) => call.args.slice(0, 2).join(" ")),
    [
      "ls-remote git@github.com:owner/repo.git",
      "clone --branch",
      "rev-parse --abbrev-ref",
      "rev-parse HEAD",
      "status --porcelain"
    ]
  );
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
      "checkout -B",
      "reset --hard",
      "clean -fd",
      "rev-parse --abbrev-ref",
      "rev-parse HEAD",
      "status --porcelain"
    ]
  );
});

test("publish prepare-clean-worktree installs dependencies with the configured npm cache", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-daily-clean-npm-cache-"));
  const worktreeDir = path.join(repoRoot, ".tmp", "publish-worktrees", "main");
  const npmCache = path.join(repoRoot, ".tmp", "npm-cache");
  await fs.mkdir(path.join(worktreeDir, ".git"), { recursive: true });
  await fs.writeFile(path.join(worktreeDir, "package.json"), JSON.stringify({ scripts: {} }));
  const calls = [];

  const result = await prepareCleanPublishWorktree({
    repoRoot,
    worktreeDir,
    remoteUrl: "git@github.com:owner/repo.git",
    npmCache,
    commandRunner: fakeCommandRunner({ calls })
  });

  const npmCall = calls.find((call) => call.file === "npm" || call.file === "npm.cmd" || call.file === "cmd.exe");
  assert.ok(npmCall, "expected npm ci to run");
  if (os.platform() === "win32") {
    assert.equal(npmCall.file, "cmd.exe");
    assert.deepEqual(npmCall.args.slice(0, 3), ["/d", "/s", "/c"]);
    assert.match(npmCall.args[3], /^npm ci --cache /);
    assert.match(npmCall.args[3], /npm-cache/);
  } else {
    assert.deepEqual(npmCall.args, ["ci", "--cache", npmCache]);
  }
  assert.equal(npmCall.env.NPM_CONFIG_CACHE, npmCache);
  assert.equal(npmCall.env.npm_config_cache, undefined);
  assert.equal(result.dependency_status.command, `npm ci --cache ${npmCache}`);
  assert.equal(result.dependency_status.npm_cache, npmCache);
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
  assert(result.published_files.includes("docs/reports/2026/05/2026-05-13.html"));
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
  assert.equal(result.pages_url, "https://jasonxzwen.github.io/ai-daily-cn/reports/2026/05/2026-05-13.html");
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
    if (url.includes("github.io")) {
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
      html: `docs/reports/${year}/${month}/${reportDate}.html`,
      validation_commands: ["npm run validate"]
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
