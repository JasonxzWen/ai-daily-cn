import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const skillDir = path.join(rootDir, ".codex", "skills", "effective-interact");
const skillPath = path.join(skillDir, "SKILL.md");
const createReportScript = path.join(skillDir, "scripts", "create-interaction.mjs");
const validateReportScript = path.join(skillDir, "scripts", "validate-interaction.mjs");

test("repo has Chinese agent instructions and effective-interact routing", async () => {
  const agents = await fsp.readFile(path.join(rootDir, "AGENTS.md"), "utf8");

  assert.match(agents, /始终使用中文回复用户/);
  assert.match(agents, /\.codex\/skills\/effective-interact/);
  assert.match(agents, /npm run validate/);
});

test("effective-interact skill is installed with generator, validator, schema, and templates", async () => {
  const skill = await fsp.readFile(skillPath, "utf8");
  const requiredFiles = [
    createReportScript,
    validateReportScript,
    path.join(skillDir, "references", "interaction-input-schema.json"),
    path.join(skillDir, "references", "interaction-patterns.md"),
    path.join(skillDir, "assets", "templates", "implementation-handoff.html"),
    path.join(skillDir, "assets", "templates", "review-findings.html"),
    path.join(skillDir, "assets", "components", "interaction-ui.css"),
    path.join(skillDir, "assets", "components", "interaction-ui.js"),
    path.join(skillDir, "assets", "fixtures", "pre-rendered-report.json")
  ];

  assert.match(skill, /Chinese `\.html`/);
  assert.match(skill, /source file link/);
  assert.match(skill, /validate-interaction\.mjs/);

  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(file), true, `${file} should exist`);
  }

  const schema = JSON.parse(await fsp.readFile(path.join(skillDir, "references", "interaction-input-schema.json"), "utf8"));
  assert.deepEqual(schema.required, ["title", "summary", "status", "sections"]);
  assert(schema.properties.heroMode.enum.includes("daily-report"));
  assert(schema.properties.heroStats);
  assert(schema.properties.sections.items.properties.type.enum.includes("diff"));
});

test("Harness Hub skill aggregation imports new skills without dropping local skill assets", async () => {
  const manifestPath = path.join(rootDir, ".codex", "harness-hub-aggregation.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));

  assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.source.path, "D:/harness-hub");
  assert(manifest.importedSkills.includes("workflow-router"));
  assert(manifest.importedSkills.includes("karpathy-guidelines"));
  assert(manifest.localOnlySkills.includes("html-work-reports"));
  assert(manifest.overlappingSkills.includes("tdd-workflow"));

  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "workflow-router", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "karpathy-guidelines", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "html-work-reports", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "tdd-workflow", "agents", "openai.yaml")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "tdd-workflow", "_harness-hub", "SKILL.md")), true);
  assert.equal(
    fs.existsSync(path.join(rootDir, ".codex", "skills", "effective-interact", "_harness-hub", "scripts", "create-interaction.mjs")),
    true
  );
});

test("effective-interact generator creates a validated self-contained interaction report", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-effective-interact-"));
  const fixture = path.join(skillDir, "assets", "fixtures", "pre-rendered-report.json");

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", fixture, "--out-dir", tmp, "--slug", "skill-smoke", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /effective-interact create-interaction\.mjs/);
  assert.match(html, /data-render-mode="pre-rendered"/);
  assert.match(html, /data-section-type="diff"/);
  assert.doesNotMatch(html, /https:\/\/cdn\.jsdelivr\.net/);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);

  const result = JSON.parse(validation.stdout);
  assert.equal(result.ok, true);
  assert(result.checks.includes("source-linked-code-evidence"));
});

test("effective-interact hero highlight renders link and reason as full-width stacked lines", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-hero-layout-"));
  const inputPath = path.join(tmp, "hero-layout.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI 日报 2026-05-27",
      summary: "- **[Copilot Studio computer-using agents GA](https://example.com/copilot)**：这是今天最值得放在 header 的产品消息。",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "markdown",
          title: "主体信息",
          content: "- 已验证的主体信息。"
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "hero-layout", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /class="hero-brief hero-brief-single"/);
  assert.match(html, /hero-highlight-list/);
  assert.match(html, /hero-highlight-link/);
  assert.match(html, /hero-highlight-reason/);
  assert.doesNotMatch(html, /<p class="hero-summary-text">-\s*<strong>/);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact can hide hero summary and navigation while keeping report stats", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-hide-hero-summary-"));
  const inputPath = path.join(tmp, "hide-hero-summary.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-05-28",
      summary: "- **[Hidden highlight](https://example.com)**: this should not render in the hero.",
      hideHeroSummary: true,
      hideNavigation: true,
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      intent: {
        primaryQuestion: "What changed?",
        decision: "Keep the hero concise.",
        successCriteria: ["Hero summary is suppressed."]
      },
      nextActions: ["Follow up"],
      sections: [
        {
          type: "markdown",
          title: "Main",
          content: "- Verified item."
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "hide-hero-summary", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const body = html.slice(html.indexOf("<body>"));
  assert.match(body, /class="hero-brief hero-brief-single"/);
  assert.match(body, /hero-stat-grid/);
  assert.doesNotMatch(body, /hero-summary-text/);
  assert.doesNotMatch(body, /hero-highlight-list/);
  assert.doesNotMatch(body, /Hidden highlight/);
  assert.doesNotMatch(body, /report-nav/);
  assert.doesNotMatch(body, /速览/);
});

test("effective-interact section headers omit visual group label tags", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-no-section-group-label-"));
  const inputPath = path.join(tmp, "no-section-group-label.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-05-29",
      summary: "Section group labels should stay machine metadata only.",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "markdown",
          title: "Hot Blogs",
          group: "main",
          content: "- Verified item."
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "no-section-group-label", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const section = html.match(/<section class="panel rich-section"[^>]*id="section-hot-blogs-1"[\s\S]*?<\/section>/)?.[0] || "";
  assert(section);
  assert.match(section, /<h2>Hot Blogs<\/h2>/);
  assert.doesNotMatch(section, /<p class="meta">/);
  assert.match(section, /data-section-group="main"/);
});

test("effective-interact date-only hero renders only the visible date", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-date-only-hero-"));
  const inputPath = path.join(tmp, "date-only-hero.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-05-28",
      summary: "This summary should stay outside the hero.",
      heroMode: "date-only",
      heroTitle: "2026-05-28",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      intent: {
        primaryQuestion: "What changed?",
        decision: "Keep only the date in the hero.",
        successCriteria: ["No status or intent cards."]
      },
      nextActions: ["Follow up"],
      sections: [
        {
          type: "markdown",
          title: "Main",
          content: "- Verified item."
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "date-only-hero", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const start = html.indexOf('<header id="report-top"');
  const end = html.indexOf("</header>", start) + "</header>".length;
  const header = html.slice(start, end);
  assert.match(header, /report-hero-minimal/);
  assert.match(header, /class="report-title report-date-title">2026-05-28<\/h1>/);
  assert.doesNotMatch(header, /AI Daily/);
  assert.doesNotMatch(header, /eyebrow/);
  assert.doesNotMatch(header, /status-pill/);
  assert.doesNotMatch(header, /hero-stat-grid/);
  assert.doesNotMatch(header, /hero-decision-grid/);
  assert.doesNotMatch(header, /What changed\?/);
  assert.doesNotMatch(header, /Follow up/);
});

test("effective-interact daily report hero renders summary metrics and links", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-compact-hero-"));
  const inputPath = path.join(tmp, "compact-hero.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-05-29",
      summary: "今日主线：模型能力、企业可运维性和 agent 采用证据同时推进。",
      heroMode: "daily-report",
      heroTitle: "2026-05-29",
      heroEyebrow: "AI 日报",
      heroStats: [
        { label: "主体", value: "4", detail: "重点条目" },
        { label: "信源窗", value: "05-27..05-29", detail: "扩展" }
      ],
      heroLinks: [
        {
          label: "结构化 JSON",
          href: "https://example.com/data.json",
          icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmciLz4="
        }
      ],
      hideNavigation: true,
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "markdown",
          title: "主体信息",
          content: "- Verified item."
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "compact-hero", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const start = html.indexOf('<header id="report-top"');
  const end = html.indexOf("</header>", start) + "</header>".length;
  const header = html.slice(start, end);
  assert.match(header, /data-hero-mode="daily-report"/);
  assert.match(header, /<div class="eyebrow">AI 日报<\/div>/);
  assert.match(header, /<h1 class="report-title report-date-title">2026-05-29<\/h1>/);
  assert.match(header, /今日主线：模型能力/);
  assert.match(header, /<span>主体<\/span>/);
  assert.match(header, /<strong>4<\/strong>/);
  assert.match(header, /class="inline-site-icon hero-link-icon"/);
  assert.match(header, /href="https:\/\/example\.com\/data\.json"/);
  assert.doesNotMatch(header, /hero-decision-grid/);
  assert.doesNotMatch(html, /<nav class="report-nav"/);
});

test("effective-interact keeps local daily-report extensions while applying Harness Hub defaults", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-effective-interact-merged-"));
  const inputPath = path.join(tmp, "merged-effective-interact.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily merged behavior",
      summary: "- **[Primary item](https://example.com/primary)**: local hero highlight layout should still render.",
      heroMode: "daily-report",
      heroTitle: "2026-06-02",
      heroStats: [{ label: "Items", value: "1", detail: "local extension" }],
      heroLinks: [{ label: "Data", href: "https://example.com/data.json" }],
      hideNavigation: true,
      status: "complete",
      sections: [
        {
          type: "mermaid",
          title: "Fallback flow",
          content: "graph LR\n  A --> B"
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "merged-effective-interact", "--json"],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        EFFECTIVE_INTERACT_DISABLE_BROWSER_MERMAID: "1"
      }
    }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  assert.equal(payload.renderMode, "pre-rendered");

  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-render-mode="pre-rendered"/);
  assert.match(html, /data-hero-mode="daily-report"/);
  assert.match(html, /<h1 class="report-title report-date-title">2026-06-02<\/h1>/);
  assert.match(html, /hero-highlight-list/);
  assert.match(html, /hero-link/);
  assert.doesNotMatch(html, /<nav class="report-nav"/);
  assert.match(html, /data-rich-kind="mermaid" data-render-state="degraded"/);
  assert.match(html, /data-mermaid-renderer="fallback"/);
});

test("effective-interact can collapse appendix sections and next actions by default", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-collapsed-appendix-"));
  const inputPath = path.join(tmp, "collapsed-appendix.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-05-28",
      summary: "Collapsed appendix check.",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      nextActionsCollapsed: true,
      nextActions: ["Tighten source checks"],
      sections: [
        {
          type: "markdown",
          title: "Source Audit",
          group: "verification",
          appendix: true,
          appendixLabel: "Appendix",
          collapsed: true,
          summary: "Trace details only.",
          content: "- Retried discovery once."
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "collapsed-appendix", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const appendix = html.match(/<details class="panel rich-section collapsible-panel appendix-panel"[^>]*id="section-source-audit-1"[\s\S]*?<\/details>/)?.[0] || "";
  assert(appendix);
  assert.match(appendix, /data-section-collapsed="true"/);
  assert.match(appendix, /data-section-appendix="true"/);
  assert.match(appendix, /<span class="meta">Appendix<\/span>/);
  assert.match(appendix, /<span class="collapsible-title">Source Audit<\/span>/);
  assert.match(appendix, /Retried discovery once/);
  assert.doesNotMatch(appendix.match(/^<details[^>]+>/)?.[0] || "", /\sopen(?:\s|>)/);

  const nextActions = html.match(/<details class="panel supplemental-panel collapsible-panel appendix-panel"[^>]*id="next-actions"[\s\S]*?<\/details>/)?.[0] || "";
  assert(nextActions);
  assert.match(nextActions, /<span class="collapsible-title">下一步<\/span>/);
  assert.match(nextActions, /Tighten source checks/);
  assert.doesNotMatch(nextActions.match(/^<details[^>]+>/)?.[0] || "", /\sopen(?:\s|>)/);
});

test("effective-interact pre-rendered markdown keeps ordered lists and highlight tags", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-ordered-list-"));
  const inputPath = path.join(tmp, "ordered-list.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI 日报 2026-05-28",
      summary: "Ordered list check.",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "markdown",
          title: "GitHub Trending",
          content: [
            "1. ![GitHub](data:image/png;base64,iVBORw0KGgo=) **[example/repo](https://github.com/example/repo)** ==trend-new|NEW==：示例项目。",
            "2. **[example/up](https://github.com/example/up)** ==trend-up|↑ UP +2==：上升项目。",
            "3. **[example/down](https://github.com/example/down)** ==trend-down|↓ DOWN -1==：下降项目。",
            "4. **[example/same](https://github.com/example/same)** ==trend-same|SAME==：持平项目。",
            "",
            "| 指标 | 数值 | 说明 |",
            "|---|---|---|",
            "| Stars | 456 | 本周新增 |"
          ].join("\n")
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "ordered-list", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /<ol><li><img class="inline-site-icon"/);
  assert.match(html, /<strong><a href="https:\/\/github\.com\/example\/repo"/);
  assert.match(html, /<mark class="text-highlight trend-status trend-status-new">NEW<\/mark>/);
  assert.match(html, /<mark class="text-highlight trend-status trend-status-up">↑ UP \+2<\/mark>/);
  assert.match(html, /<mark class="text-highlight trend-status trend-status-down">↓ DOWN -1<\/mark>/);
  assert.match(html, /<mark class="text-highlight trend-status trend-status-same">SAME<\/mark>/);
  assert.doesNotMatch(html, /<ul><li>1\./);
  assert.match(html, /<div class="markdown-table-scroll"><table>/);
});

test("effective-interact filterable cards render linked project subcards", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-project-cards-"));
  const inputPath = path.join(tmp, "project-cards.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI 日报 2026-05-27",
      summary: "Project cards layout check.",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "今日值得关注的项目",
          group: "projects",
          cardClass: "project-card",
          items: [
            {
              group: "PROJECTS",
              title: "Project Alpha",
              href: "https://example.com/project-alpha",
              titleIcon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
              body: "A **reusable** plugin set for ==agent workflows==. <script>alert(1)</script>",
              tags: ["daily signal"],
              points: [
                {
                  label: "Publisher",
                  value: "Hugging Face",
                  icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
                },
                { label: "领域", value: "agent、workflow" },
                { label: "作用", value: "Use for repeatable workflows." }
              ]
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "project-cards", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /project-card/);
  assert.match(html, /project-card-grid/);
  assert.match(html, /<h3><img class="[^"]*\binline-site-icon\b[^"]*"/);
  assert.match(html, /class="card-title-link" href="https:\/\/example\.com\/project-alpha"/);
  assert.match(html, /card-detail-list/);
  assert.match(html, /card-detail-icon/);
  assert.match(html, /<dt>领域<\/dt>/);
  assert.match(html, /A <strong>reusable<\/strong> plugin set for <mark class="text-highlight">agent workflows<\/mark>\./);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Use for repeatable workflows\./);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact filterable cards can hide visual group labels", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-hidden-card-group-"));
  const inputPath = path.join(tmp, "hidden-card-group.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI 日报 2026-05-28",
      summary: "Blog card hierarchy check.",
      status: "complete",
      template: "research-explainer",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "热门技术博客",
          group: "main",
          cardClass: "blog-card",
          showFilters: false,
          items: [
            {
              group: "LOCAL SPEECH-TO-SPEECH AGENT STACK",
              showGroup: false,
              title: "Reachy Mini goes fully local",
              href: "https://huggingface.co/blog/reachy-mini",
              tags: ["LOCAL SPEECH-TO-SPEECH AGENT STACK"],
              media: [
                {
                  src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
                  alt: "Architecture",
                  caption: "Original blog architecture diagram."
                }
              ],
              body: "这篇文章说明本地语音 agent 栈。"
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "hidden-card-group", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const card = html.match(/<article class="interactive-card evidence-card evidence-spotlight blog-card"[\s\S]*?<\/article>/)?.[0] || "";
  assert(card);
  assert.match(html, /blog-card-grid/);
  assert.match(card, /data-filter-value="LOCAL SPEECH-TO-SPEECH AGENT STACK"/);
  assert.doesNotMatch(card, /<div class="meta">LOCAL SPEECH-TO-SPEECH AGENT STACK<\/div>/);
  assert.match(card, /<h3><a class="card-title-link" href="https:\/\/huggingface\.co\/blog\/reachy-mini"/);
  assert.match(card, /<span class="chip">LOCAL SPEECH-TO-SPEECH AGENT STACK<\/span>/);
  assert.match(card, /card-media-grid/);
  assert.match(card, /<figcaption>Original blog architecture diagram\.<\/figcaption>/);
});

test("GitHub Pages deployment workflow publishes the generated docs artifact", async () => {
  const workflow = await fsp.readFile(path.join(rootDir, ".github", "workflows", "deploy-pages.yml"), "utf8");

  assert.match(workflow, /push:\r?\n\s+branches: \["main"\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /deploy:\r?\n\s+runs-on: ubuntu-latest\r?\n\s+environment:/);
  assert.match(workflow, /name: Setup Node\r?\n\s+uses: actions\/setup-node@v6\r?\n\s+with:\r?\n\s+node-version: "22"/);
  assert.match(workflow, /uses: actions\/checkout@v6/);
  assert.match(workflow, /uses: actions\/setup-node@v6/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /uses: actions\/configure-pages@v5/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path: docs/);
  assert.match(workflow, /uses: actions\/deploy-pages@v4/);
  assert.match(workflow, /name: github-pages/);
});
