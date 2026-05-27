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
  assert(schema.properties.sections.items.properties.type.enum.includes("diff"));
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
              body: "A reusable plugin set for agent workflows.",
              tags: ["daily signal"],
              points: [
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
  assert.match(html, /class="card-title-link" href="https:\/\/example\.com\/project-alpha"/);
  assert.match(html, /card-detail-list/);
  assert.match(html, /<dt>领域<\/dt>/);
  assert.match(html, /Use for repeatable workflows\./);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
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
