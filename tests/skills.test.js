import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { syncHarnessHub } from "../scripts/update-harness-hub.mjs";

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
  assert(schema.properties.presentation.properties.showHeroStats);
  assert(schema.properties.intent.properties.artifactKind.enum.includes("research"));
  assert.equal(Object.hasOwn(schema.properties, "template"), false);
  assert(schema.properties.sections.items.properties.type.enum.includes("diff"));
});

test("Harness Hub skill aggregation full-overwrites overlapping skills without conflict copies", async () => {
  const manifestPath = path.join(rootDir, ".codex", "harness-hub-aggregation.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));

  assert.match(manifest.source.commit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.source.path, "D:/harness-hub");
  assert.equal(manifest.importedSkills.includes("workflow-router"), false);
  assert(manifest.importedSkills.includes("karpathy-guidelines"));
  assert(manifest.importedSkills.includes("harness-quality-check"));
  assert(manifest.importedSkills.includes("insight"));
  assert(manifest.importedSkills.includes("source-post"));
  assert(manifest.localOnlySkills.includes("html-work-reports"));
  assert.equal(manifest.localOnlySkills.includes("source-to-insight-blog"), false);
  assert(manifest.overlappingSkills.includes("tdd-workflow"));
  assert(manifest.overlappingSkills.includes("workflow-router"));
  assert.equal(manifest.policy.syncMode, "full-overwrite");
  assert.equal(manifest.counts.preservedConflicts, 0);
  assert(manifest.overwrittenSkills.includes("effective-interact"));
  assert(manifest.overwrittenSkills.includes("workflow-router"));

  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "workflow-router", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "workflow-router", "_harness-hub")), false);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "karpathy-guidelines", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "harness-quality-check", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "insight", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "insight", "scripts", "collect-insight-events.mjs")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "source-post", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "source-to-insight-blog", "SKILL.md")), false);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "html-work-reports", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "tdd-workflow", "agents", "openai.yaml")), false);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "tdd-workflow", "_harness-hub")), false);
  assert.equal(fs.existsSync(path.join(rootDir, ".codex", "skills", "effective-interact", "_harness-hub")), false);
});

test("Claude Code curated skills expose Harness Hub additions without Codex scaffolding", async () => {
  const claudeSkillsRoot = path.join(rootDir, ".claude", "skills");
  const requiredFiles = [
    path.join(claudeSkillsRoot, "harness-quality-check", "SKILL.md"),
    path.join(claudeSkillsRoot, "harness-quality-check", "assets", "fixtures", "advisory-html-report.json"),
    path.join(claudeSkillsRoot, "insight", "SKILL.md"),
    path.join(claudeSkillsRoot, "insight", "references", "host-adapters.md"),
    path.join(claudeSkillsRoot, "insight", "scripts", "collect-insight-events.mjs"),
    path.join(claudeSkillsRoot, "insight", "scripts", "build-insight-report.mjs"),
    path.join(claudeSkillsRoot, "source-post", "SKILL.md"),
    path.join(claudeSkillsRoot, "source-post", "scripts", "validate-source-post.mjs")
  ];

  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(file), true, `${file} should exist`);
  }

  const readme = await fsp.readFile(path.join(claudeSkillsRoot, "README.md"), "utf8");
  assert.match(readme, /Included \(17\)/);
  assert.match(readme, /harness-quality-check/);
  assert.match(readme, /insight/);
  assert.match(readme, /source-post/);
  assert.doesNotMatch(readme, /source-to-insight-blog/);
  assert.match(readme, /\.claude-plugin/);

  const claudeWebappTesting = await fsp.readFile(path.join(claudeSkillsRoot, "webapp-testing", "SKILL.md"), "utf8");
  const codexWebappTesting = await fsp.readFile(path.join(rootDir, ".codex", "skills", "webapp-testing", "SKILL.md"), "utf8");
  assert.equal(claudeWebappTesting, codexWebappTesting);

  const claudeSourcePost = await fsp.readFile(path.join(claudeSkillsRoot, "source-post", "SKILL.md"), "utf8");
  const codexSourcePost = await fsp.readFile(path.join(rootDir, ".codex", "skills", "source-post", "SKILL.md"), "utf8");
  assert.equal(claudeSourcePost, codexSourcePost);
  assert.equal(fs.existsSync(path.join(claudeSkillsRoot, "source-to-insight-blog", "SKILL.md")), false);

  const forbidden = [];
  function visit(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "_harness-hub" || entry.name === "agents") {
          forbidden.push(entryPath);
          continue;
        }
        visit(entryPath);
      } else if (entry.isFile() && entry.name === "openai.yaml") {
        forbidden.push(entryPath);
      }
    }
  }
  visit(claudeSkillsRoot);
  assert.deepEqual(forbidden, []);
});

test("Claude Code curated skills are tracked repository artifacts", () => {
  const trackedResult = spawnSync(
    "git",
    [
      "ls-files",
      "--",
      ".claude/skills/README.md",
      ".claude/skills/insight/SKILL.md",
      ".claude/skills/harness-quality-check/SKILL.md"
    ],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );

  assert.equal(trackedResult.status, 0, trackedResult.stderr || trackedResult.stdout);
  const trackedFiles = new Set(trackedResult.stdout.trim().split(/\r?\n/).filter(Boolean));
  assert(trackedFiles.has(".claude/skills/README.md"));
  assert(trackedFiles.has(".claude/skills/insight/SKILL.md"));
  assert(trackedFiles.has(".claude/skills/harness-quality-check/SKILL.md"));

  const ignoredResult = spawnSync("git", ["check-ignore", "-q", "--", ".claude/skills/README.md"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(ignoredResult.status, 1, ".claude/skills/README.md must not be ignored");
});

test("Harness Hub source commit matches local source HEAD when strict source check is enabled", async (t) => {
  if (process.env.HARNESS_HUB_STRICT_SOURCE_CHECK !== "1") {
    t.skip("Set HARNESS_HUB_STRICT_SOURCE_CHECK=1 during Harness Hub maintenance to compare against the mutable local source checkout.");
    return;
  }

  const manifestPath = path.join(rootDir, ".codex", "harness-hub-aggregation.json");
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  const sourceRoot = manifest.source?.path;

  if (!sourceRoot || !fs.existsSync(path.join(sourceRoot, ".git"))) {
    t.skip(`Local Harness Hub source is unavailable: ${sourceRoot ?? "missing"}`);
    return;
  }

  const head = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(manifest.source.commit, head);
});

test("Harness Hub version sniff prompt routes to package-release-sniffer", () => {
  const scriptPath = path.join(rootDir, ".codex", "skills", "workflow-router", "scripts", "skill-activation-check.mjs");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--prompt",
      "Sniff newly published npm and PyPI AI agent packages from primary registry and release feeds for today's developer-tool monitoring.",
      "--json"
    ],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.selectedSkill, "package-release-sniffer");
});

test("Workflow router treats Harness Hub update adaptation as maintenance", () => {
  const scriptPath = path.join(rootDir, ".codex", "skills", "workflow-router", "scripts", "route-intent.mjs");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--prompt",
      "Update Harness Hub skill aggregation and adapt local overlay changes.",
      "--json"
    ],
    {
      cwd: rootDir,
      encoding: "utf8"
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.state, "harness-hub-maintenance");
  assert.equal(payload.owner, "hub-maintenance-workflow");
});

test("Harness Hub updater preserves local overlays while refreshing upstream copies", async () => {
  const sourceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-harness-hub-source-"));
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-harness-hub-target-"));
  const sourceSkillsRoot = path.join(sourceRoot, "skills");
  const targetSkillsRoot = path.join(targetRoot, ".codex", "skills");
  const manifestPath = path.join(targetRoot, ".codex", "harness-hub-aggregation.json");

  async function write(filePath, content) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, "utf8");
  }

  await write(path.join(sourceSkillsRoot, "imported-skill", "SKILL.md"), "source imported skill\n");
  await write(path.join(sourceSkillsRoot, "imported-skill", "notes.md"), "source imported notes\n");
  await write(path.join(sourceSkillsRoot, "overlap-skill", "SKILL.md"), "source overlap skill\n");
  await write(path.join(sourceSkillsRoot, "overlap-skill", "references", "upstream.md"), "source upstream reference\n");
  await write(path.join(sourceSkillsRoot, "overlap-skill", "scripts", "new-helper.mjs"), "export const helper = true;\n");

  await write(path.join(targetSkillsRoot, "imported-skill", "SKILL.md"), "old imported skill\n");
  await write(path.join(targetSkillsRoot, "imported-skill", "local.txt"), "remove me\n");
  await write(path.join(targetSkillsRoot, "stale-imported-skill", "SKILL.md"), "remove stale imported skill\n");
  await write(path.join(targetSkillsRoot, "overlap-skill", "SKILL.md"), "local active overlap skill\n");
  await write(path.join(targetSkillsRoot, "overlap-skill", "local-only.md"), "keep me\n");
  await write(path.join(targetSkillsRoot, "overlap-skill", "_harness-hub", "stale.md"), "stale upstream copy\n");
  await write(path.join(targetSkillsRoot, "local-only-skill", "SKILL.md"), "local only skill\n");

  await write(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: "2026-06-08T00:00:00.000Z",
        source: {
          path: sourceRoot.replaceAll(path.sep, "/"),
          branch: "old-branch",
          commit: "0".repeat(40),
          status: "## old-branch"
        },
        target: {
          path: targetRoot.replaceAll(path.sep, "/"),
          skillsRoot: ".codex/skills"
        },
        policy: {
          importedSkills: "Hub-only skills are copied into .codex/skills.",
          overlappingSkills:
            "Existing local skill files remain active. Hub-only files are added. Same-path Hub conflicts are preserved under _harness-hub/ inside the same skill.",
          localOnlySkills: "Local-only skills are left untouched.",
          skippedTopLevelSourceDirs: ["artifacts"],
          baseline: "Original local skills are computed from tracked .codex/skills/*/SKILL.md files before this aggregation."
        },
        importedSkills: ["imported-skill", "stale-imported-skill", "overlap-skill"],
        overlappingSkills: ["overlap-skill"],
        localOnlySkills: ["local-only-skill", "stale-local-only-skill"]
      },
      null,
      2
    )}\n`
  );

  const result = syncHarnessHub({
    root: targetRoot,
    sourceRoot,
    sourceMetadata: {
      branch: "main",
      commit: "1".repeat(40),
      status: "## main"
    }
  });

  assert.equal(await fsp.readFile(path.join(targetSkillsRoot, "imported-skill", "SKILL.md"), "utf8"), "source imported skill\n");
  assert.equal(fs.existsSync(path.join(targetSkillsRoot, "imported-skill", "local.txt")), false);
  assert.equal(fs.existsSync(path.join(targetSkillsRoot, "stale-imported-skill", "SKILL.md")), false);
  assert.equal(await fsp.readFile(path.join(targetSkillsRoot, "overlap-skill", "SKILL.md"), "utf8"), "local active overlap skill\n");
  assert.equal(
    await fsp.readFile(path.join(targetSkillsRoot, "overlap-skill", "_harness-hub", "SKILL.md"), "utf8"),
    "source overlap skill\n"
  );
  assert.equal(
    await fsp.readFile(path.join(targetSkillsRoot, "overlap-skill", "references", "upstream.md"), "utf8"),
    "source upstream reference\n"
  );
  assert.equal(
    await fsp.readFile(path.join(targetSkillsRoot, "overlap-skill", "scripts", "new-helper.mjs"), "utf8"),
    "export const helper = true;\n"
  );
  assert.equal(await fsp.readFile(path.join(targetSkillsRoot, "overlap-skill", "local-only.md"), "utf8"), "keep me\n");
  assert.equal(fs.existsSync(path.join(targetSkillsRoot, "overlap-skill", "_harness-hub", "stale.md")), false);
  assert.equal(await fsp.readFile(path.join(targetSkillsRoot, "local-only-skill", "SKILL.md"), "utf8"), "local only skill\n");

  assert.equal(result.manifest.source.commit, "1".repeat(40));
  assert.deepEqual(result.manifest.importedSkills, ["imported-skill"]);
  assert.deepEqual(result.manifest.overlappingSkills, ["overlap-skill"]);
  assert.deepEqual(result.manifest.localOnlySkills, ["local-only-skill"]);
  assert.equal(result.manifest.counts.preservedConflicts, 1);
  assert.equal(result.manifest.counts.copiedFiles, 4);
  assert.equal(result.manifest.counts.localOnlyFilesKept, 1);
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


test("effective-interact rejects legacy template inputs after 0.4.0 overwrite", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-legacy-template-"));
  const inputPath = path.join(tmp, "legacy-template.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "Legacy template check",
      summary: "Legacy template inputs must not be accepted.",
      status: "complete",
      template: "research-explainer",
      sections: [{ type: "markdown", title: "Result", content: "- Should fail" }]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "legacy-template", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );

  assert.notEqual(generated.status, 0);
  assert.match(generated.stderr || generated.stdout, /template is no longer supported/);
});

test("effective-interact renders 0.4.0 presentation opt-ins and artifact kind", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-presentation-"));
  const inputPath = path.join(tmp, "presentation.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "Presentation check",
      summary: "BLUF: the page uses explicit presentation toggles.",
      status: "complete",
      renderMode: "pre-rendered",
      presentation: {
        showHeroStats: true,
        showSuccessCriteria: true,
        showClaims: true,
        showEvidence: true,
        showVerification: true,
        showNextActions: true
      },
      intent: {
        artifactKind: "research",
        primaryQuestion: "What changed?",
        decision: "Use the updated component-first report contract.",
        timeBudget: "2m",
        successCriteria: ["Legacy template is absent", "Evidence is visible"]
      },
      claims: [{ id: "claim-1", statement: "The report uses the 0.4.0 input contract.", kind: "conclusion", evidenceIds: ["evidence-1"], confidence: "high" }],
      evidence: [{ id: "evidence-1", kind: "file", label: "Schema", filePath: ".codex/skills/effective-interact/references/interaction-input-schema.json", status: "pass" }],
      verification: [{ label: "Generator", status: "pass", detail: "Generated with pre-rendered mode." }],
      nextActions: ["Use sections and presentation toggles instead of legacy templates."],
      sections: [
        { type: "summary-cards", title: "Summary", cards: [{ label: "Mode", value: "0.4.0", detail: "Component-first" }] },
        { type: "markdown", title: "Details", content: "- No legacy template field." }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "presentation", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-artifact-kind="research"/);
  assert.match(html, /hero-stat-grid/);
  assert.match(html, /data-report-region="claims"/);
  assert.match(html, /data-report-region="evidence"/);
  assert.match(html, /data-report-region="verification"/);
  assert.match(html, /data-report-region="actions"/);
  assert.doesNotMatch(html, /data-template=/);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact filterable cards render the upstream component contract", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-filterable-cards-"));
  const inputPath = path.join(tmp, "filterable-cards.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "Filterable cards check",
      summary: "Cards expose upstream filter controls and searchable bodies.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [{
        type: "filterable-cards",
        title: "Cards",
        items: [
          { title: "Alpha", body: "Alpha body", category: "A" },
          { title: "Beta", body: "Beta body", category: "B" }
        ]
      }]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "filterable-cards", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-section-type="filterable-cards"/);
  assert.match(html, /data-filter-target="section-cards-1"/);
  assert.match(html, /data-search-target="section-cards-1"/);
  assert.match(html, /Alpha body/);
  assert.match(html, /Beta body/);
});

test("effective-interact preserves local production extensions while aggregating upstream style", async () => {
  const design = await fsp.readFile(path.join(skillDir, "DESIGN.md"), "utf8");
  const patterns = await fsp.readFile(path.join(skillDir, "references", "interaction-patterns.md"), "utf8");
  const css = await fsp.readFile(path.join(skillDir, "assets", "components", "interaction-ui.css"), "utf8");
  const js = await fsp.readFile(path.join(skillDir, "assets", "components", "interaction-ui.js"), "utf8");

  assert.match(design, /Upstream\/Local Aggregation Policy/);
  assert.match(patterns, /Do not dim, blur, grayscale, or otherwise suppress sibling card text on hover/);
  assert.doesNotMatch(css, /:has\(\.interactive-card:hover\)\s+\.interactive-card:not\(:hover\)/);
  assert.match(js, /if \(item\.matches\("button"\)\) return;/);
  assert.match(js, /data-scale-mode/);
  assert.match(js, /data-lightbox-image/);

  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-effective-interact-merge-"));
  const fixture = path.join(skillDir, "assets", "fixtures", "upstream-local-aggregation-report.json");
  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", fixture, "--out-dir", tmp, "--slug", "upstream-local-aggregation", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-render-mode="pre-rendered"/);
  assert.match(html, /data-section-type="filterable-cards"/);
  assert.match(html, /card-title-link/);
  assert.match(html, /card-subtitle/);
  assert.match(html, /data-card-stats/);
  assert.match(html, /data-lightbox-image="true"/);
  assert.match(html, /data-filter-value="daily" aria-pressed="true"/);
  assert.match(html, /<article[^>]+data-filter-value="upstream"[^>]+hidden/);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact filterable cards render local tracking components with multi-entity lines and public trace", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-tracking-component-"));
  const inputPath = path.join(tmp, "tracking-component.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-06-12",
      summary: "Tracking component visual check.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Daily Tracking",
          group: "signals",
          cardClass: "tracking-card",
          showFilters: false,
          items: [
            {
              group: "model usage",
              title: "OpenRouter",
              href: "https://openrouter.ai/rankings",
              body: "Local component rebuilt from normalized source data.",
              component: {
                kind: "openrouter_rankings",
                source: "OpenRouter",
                sourceUrl: "https://openrouter.ai/rankings",
                collectedAt: "2026-06-12T02:00:00+08:00",
                tabs: [
                  { id: "top-models", label: "七日排名", view: "line_multi", status: "complete" },
                  { id: "leaderboard", label: "当前榜单", view: "leaderboard", status: "complete" }
                ],
                series: [
                  {
                    id: "top-models",
                    tabId: "top-models",
                    chart: "line_multi",
                    rows: [
                      {
                        rank: 1,
                        label: "DeepSeek V4 Flash",
                        model: "DeepSeek V4 Flash",
                        provider: "deepseek",
                        value: 4500000000000,
                        valueLabel: "4.5T tokens",
                        change: "+55%",
                        metric: "2026-06-12"
                      },
                      { rank: 2, model: "Claude Sonnet 4.6", provider: "anthropic", value: 1770000000000, valueLabel: "1.77T tokens", change: "", metric: "2026-06-12" },
                      { rank: 3, model: "MiniMax M3", provider: "minimax", value: 1220000000000, valueLabel: "1.22T tokens", change: "", metric: "2026-06-12" },
                      { rank: 4, model: "Newcomer Nova", provider: "example-ai", value: 1040000000000, valueLabel: "1.04T tokens", change: "NEW", metric: "2026-06-12" },
                      { rank: 1, model: "DeepSeek V4 Flash", provider: "deepseek", value: 2900000000000, valueLabel: "2.9T tokens", change: "", metric: "2026-06-05" },
                      { rank: 2, model: "Claude Sonnet 4.6", provider: "anthropic", value: 1410000000000, valueLabel: "1.41T tokens", change: "", metric: "2026-06-05" },
                      { rank: 3, model: "MiniMax M3", provider: "minimax", value: 910000000000, valueLabel: "910B tokens", change: "", metric: "2026-06-05" },
                      { rank: 4, model: "Legacy Llama 2", provider: "meta", value: 720000000000, valueLabel: "720B tokens", change: "", metric: "2026-06-05" },
                      { rank: 1, model: "DeepSeek V4 Flash", provider: "deepseek", value: 2400000000000, valueLabel: "2.4T tokens", change: "", metric: "2026-05-29" }
                    ]
                  }
                ],
                rows: [
                  {
                    rank: 1,
                    model: "DeepSeek V4 Flash",
                    provider: "deepseek",
                    value: 4500000000000,
                    value_label: "4.5T tokens",
                    change: "+55%"
                  }
                ],
                trace: {
                  sourceUrl: "https://openrouter.ai/rankings",
                  collectedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "openrouter-rankings-v1",
                  dataHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  rawDomHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  cacheStatus: "live",
                  topRows: [{ rank: 1, model: "DeepSeek V4 Flash", provider: "deepseek" }],
                  diff: { status: "first_snapshot", changedRows: [] }
                }
              }
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "tracking-component", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-tracking-component/);
  assert.match(html, /data-component-kind="openrouter_rankings"/);
  assert.doesNotMatch(html, /data-scale-mode="linear"/);
  assert.doesNotMatch(html, /data-scale-mode="log"/);
  assert.match(html, /data-tracking-line-chart/);
  assert.match(html, /data-trend-lines="5"/);
  assert.match(html, /data-tracking-line-model="DeepSeek V4 Flash"/);
  assert.match(html, /data-tracking-line-model="Legacy Llama 2"/);
  assert.match(html, /data-tracking-line-model="Newcomer Nova"/);
  assert.match(html, /data-tracking-line-label="DeepSeek V4 Flash"/);
  assert.doesNotMatch(html, /tracking-line-legend-item/);
  assert.match(html, /data-tracking-tooltip/);
  assert.doesNotMatch(html, /data-tracking-stack/);
  assert.match(html, /2026-06-12/);
  assert.match(html, /data-tracking-trace/);
  assert.match(html, /sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.doesNotMatch(html, /raw_dom/i);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact renders sanitized official tracking component snapshots", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-official-tracking-component-"));
  const inputPath = path.join(tmp, "official-tracking-component.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-06-12",
      summary: "Official tracking component snapshot check.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Daily Tracking",
          group: "signals",
          cardClass: "tracking-card",
          showFilters: false,
          items: [
            {
              group: "model usage",
              title: "OpenRouter",
              href: "https://openrouter.ai/rankings",
              body: "Official component snapshot recolored locally.",
              component: {
                kind: "openrouter_rankings",
                source: "OpenRouter",
                sourceUrl: "https://openrouter.ai/rankings",
                collectedAt: "2026-06-12T02:00:00+08:00",
                officialSnapshot: {
                  status: "available",
                  source: "official_dom",
                  componentKind: "openrouter_rankings",
                  sourceUrl: "https://openrouter.ai/rankings",
                  capturedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "openrouter-rankings-v1",
                  sourceSelector: "main [data-openrouter-rankings]",
                  html: "<section class=\"or-card\" data-openrouter-rankings><header>OpenRouter Top Models</header><table><tbody><tr><td>DeepSeek V4 Flash</td><td>2.9T tokens</td></tr></tbody></table></section>",
                  css: ".or-card { color: rgb(12, 18, 28); background: #fff; } .or-card table { width: 100%; }",
                  domHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                  cssHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                },
                tabs: [
                  { id: "leaderboard", label: "LLM Leaderboard", view: "leaderboard", status: "complete" }
                ],
                series: [],
                rows: [],
                trace: {
                  sourceUrl: "https://openrouter.ai/rankings",
                  collectedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "openrouter-rankings-v1",
                  dataHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  rawDomHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  cacheStatus: "live",
                  topRows: [],
                  diff: { status: "first_snapshot", changedRows: [] }
                }
              }
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "official-tracking-component", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-official-component-snapshot/);
  assert.match(html, /data-component-kind="openrouter_rankings"/);
  assert.match(html, /OpenRouter Top Models/);
  assert.match(html, /DeepSeek V4 Flash/);
  assert.match(html, /data-official-tracking-css/);
  assert.doesNotMatch(html, /data-scale-mode="linear"/);
  assert.doesNotMatch(html, /<div class="toolbar tracking-component-tabs"/);
  assert.doesNotMatch(html, /<script>window\.__bad|onclick|javascript:/i);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact rejects broad official tracking page dumps", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-broad-official-tracking-component-"));
  const inputPath = path.join(tmp, "broad-official-tracking-component.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-06-12",
      summary: "Broad official tracking component snapshot check.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Daily Tracking",
          group: "signals",
          cardClass: "tracking-card",
          showFilters: false,
          items: [
            {
              group: "model usage",
              title: "OpenRouter",
              href: "https://openrouter.ai/rankings",
              body: "Official component snapshot should not render a whole page dump.",
              component: {
                kind: "openrouter_rankings",
                source: "OpenRouter",
                sourceUrl: "https://openrouter.ai/rankings",
                collectedAt: "2026-06-12T02:00:00+08:00",
                officialSnapshot: {
                  status: "available",
                  source: "official_dom",
                  componentKind: "openrouter_rankings",
                  sourceUrl: "https://openrouter.ai/rankings",
                  capturedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "openrouter-rankings-v1",
                  sourceSelector: "main",
                  html: "<main class=\"tabular-nums\"><nav>OpenRouter navigation</nav><section><table><tbody><tr><td>DeepSeek V4 Flash</td><td>2.9T tokens</td></tr></tbody></table></section></main>",
                  css: ".tabular-nums { min-height: 4000px; } nav { display: block; }",
                  domHash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                  cssHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                },
                trace: {
                  sourceUrl: "https://openrouter.ai/rankings",
                  collectedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "openrouter-rankings-v1",
                  dataHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  rawDomHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  cacheStatus: "live",
                  topRows: [],
                  diff: { status: "first_snapshot", changedRows: [] }
                }
              }
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "broad-official-tracking-component", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.doesNotMatch(html, /data-official-component-snapshot/);
  assert.doesNotMatch(html, /<main class="tabular-nums"/);
  assert.match(html, /snapshot 本轮不可用|source unavailable|官方 web 组件/);

  const validation = spawnSync(process.execPath, [validateReportScript, payload.outputPath, "--json", "--skip-browser"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
});

test("effective-interact renders Artificial Analysis collected tabs without fallback panels", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-aa-component-"));
  const inputPath = path.join(tmp, "aa-component.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily 2026-06-12",
      summary: "AA component visual check.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Daily Tracking",
          group: "signals",
          cardClass: "tracking-card",
          showFilters: false,
          items: [
            {
              group: "model benchmark",
              title: "Artificial Analysis",
              href: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
              body: "Local component rebuilt from score, token and cost tabs.",
              component: {
                kind: "artificial_analysis_index",
                source: "Artificial Analysis",
                sourceUrl: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
                collectedAt: "2026-06-12T02:00:00+08:00",
                tabs: [
                  { id: "score", label: "Score", view: "score_table", status: "complete" },
                  { id: "token-usage", label: "Token Usage", view: "stacked_bar", status: "complete" },
                  { id: "cost", label: "Cost", view: "stacked_bar", status: "complete" },
                  { id: "score-vs-cost", label: "Score vs. Cost", view: "scatter", status: "complete" }
                ],
                series: [
                  {
                    id: "aa-score",
                    tabId: "score",
                    chart: "score_table",
                    rows: [
                      { rank: 1, model: "Claude Opus 4.8", provider: "anthropic", value: 61, valueLabel: "61 分", change: "AA Index" }
                    ]
                  },
                  {
                    id: "aa-token",
                    tabId: "token-usage",
                    chart: "stacked_bar",
                    rows: [
                      { rank: 1, model: "Claude Opus 4.8", provider: "anthropic", value: 676000000, valueLabel: "676M", change: "", metric: "Token Usage" }
                    ]
                  },
                  {
                    id: "aa-cost",
                    tabId: "cost",
                    chart: "stacked_bar",
                    rows: [
                      { rank: 1, model: "Claude Opus 4.8", provider: "anthropic", value: 4309, valueLabel: "$4,309", change: "", metric: "Cost" }
                    ]
                  },
                  {
                    id: "aa-score-cost",
                    tabId: "score-vs-cost",
                    chart: "scatter",
                    rows: [
                      { rank: 1, model: "Claude Opus 4.8", provider: "anthropic", value: 61, valueLabel: "61 分 / $4,309", change: "", metric: "Score vs. Cost", secondaryValue: 4309, secondaryValueLabel: "$4,309" }
                    ]
                  }
                ],
                rows: [
                  { rank: 1, model: "Claude Opus 4.8", provider: "anthropic", value: 61, value_label: "61 分", change: "AA Index" }
                ],
                trace: {
                  sourceUrl: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index",
                  collectedAt: "2026-06-12T02:00:00+08:00",
                  selectorVersion: "artificial-analysis-index-v1",
                  dataHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                  rawDomHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                  cacheStatus: "live",
                  topRows: [{ rank: 1, model: "Claude Opus 4.8", provider: "anthropic" }],
                  diff: { status: "first_snapshot", changedRows: [] }
                }
              }
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "aa-component", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  assert.match(html, /data-component-kind="artificial_analysis_index"/);
  assert.match(html, /Token Usage/);
  assert.match(html, /\$4,309/);
  assert.match(html, /61 分 \/ \$4,309/);
  assert.doesNotMatch(html, /source_tab_not_collected/);

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
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "热门博客",
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
  assert.match(card, /<h3><a class="card-title-link" href="https:\/\/huggingface\.co\/blog\/reachy-mini" rel="noreferrer"><span class="card-title-text">/);
  assert.match(card, /<span class="chip">LOCAL SPEECH-TO-SPEECH AGENT STACK<\/span>/);
  assert.match(card, /card-media-grid/);
  assert.match(card, /data-lightbox-image="true"/);
  assert.match(card, /data-lightbox-caption="Original blog architecture diagram\."/);
  assert.match(card, /role="button"/);
  assert.match(card, /tabindex="0"/);
  assert.match(card, /<figcaption>Original blog architecture diagram\.<\/figcaption>/);
});

test("effective-interact filterable card title icons allow relative build assets", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-relative-title-icon-"));
  const inputPath = path.join(tmp, "relative-title-icon.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily Icon Contract",
      summary: "Relative title icons should survive sanitization.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Builder",
          group: "signals",
          cardClass: "builder-card",
          showFilters: false,
          items: [
            {
              group: "X/Twitter",
              showGroup: false,
              title: "Avatar Builder",
              subtitle: "@avatarbuilder",
              href: "https://x.com/avatarbuilder/status/2059000000000000002",
              titleIcon: "../../../assets/avatars/2026/06/2026-06-23-avatarbuilder.png",
              body: "Original X status with a localized avatar asset available."
            },
            {
              group: "X/Twitter",
              showGroup: false,
              title: "Unsafe Host Path",
              href: "https://x.com/unsafe/status/2059000000000000003",
              titleIcon: "C:\\Users\\Admin\\avatar.png",
              body: "Host-local paths must not render."
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "relative-title-icon", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const cards = html.match(/<article class="interactive-card evidence-card evidence-spotlight builder-card"[\s\S]*?<\/article>/g) || [];

  assert.equal(cards.length, 2);
  assert.match(cards[0], /<img class="inline-site-icon card-title-icon" src="\.\.\/\.\.\/\.\.\/assets\/avatars\/2026\/06\/2026-06-23-avatarbuilder\.png"/);
  assert.doesNotMatch(cards[1], /card-title-icon/);
});

test("effective-interact filterable cards support exclusive default filters", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-exclusive-card-filters-"));
  const inputPath = path.join(tmp, "exclusive-card-filters.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI Daily Filter Contract",
      summary: "Filterable card defaults.",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "Exclusive Filters",
          richId: "exclusive-filters",
          group: "main",
          includeAllFilter: false,
          defaultFilterValue: "Beta",
          items: [
            {
              group: "Alpha",
              title: "Alpha card",
              body: "Alpha should be hidden by default."
            },
            {
              group: "Beta",
              title: "Beta card",
              body: "Beta should be visible by default."
            }
          ]
        },
        {
          type: "filterable-cards",
          title: "Default Filters",
          richId: "default-filters",
          group: "main",
          items: [
            {
              group: "One",
              title: "One card",
              body: "Default filters keep the all button."
            },
            {
              group: "Two",
              title: "Two card",
              body: "Default filters keep the all button."
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "exclusive-card-filters", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const sectionFor = (id) => html.match(new RegExp(`<section[^>]+id="section-${id}"[\\s\\S]*?<\\/section>`))?.[0] || "";
  const buttonsFor = (section) => section.match(/<button\b[\s\S]*?<\/button>/g) || [];
  const buttonValuesFor = (section) => buttonsFor(section).map((button) => button.match(/data-filter-value="([^"]+)"/)?.[1]);
  const cardOpenTagFor = (section, value) => (
    (section.match(/<article\b[\s\S]*?<\/article>/g) || [])
      .find((card) => card.includes(`data-filter-value="${value}"`))
      ?.match(/^<article[^>]+>/)?.[0] || ""
  );

  const exclusiveSection = sectionFor("exclusive-filters");
  assert.ok(exclusiveSection, "exclusive filter section should render");
  assert.deepEqual(buttonValuesFor(exclusiveSection), ["Alpha", "Beta"]);
  assert.match(exclusiveSection, /data-filter-target="section-exclusive-filters"/);
  assert.doesNotMatch(exclusiveSection, /data-filter-target="exclusive-filters"/);
  assert.doesNotMatch(exclusiveSection, /data-filter-value="all"/);
  assert.match(buttonsFor(exclusiveSection)[0], /data-filter-value="Alpha"[^>]+aria-pressed="false"/);
  assert.match(buttonsFor(exclusiveSection)[1], /data-filter-value="Beta"[^>]+aria-pressed="true"/);
  assert.match(cardOpenTagFor(exclusiveSection, "Alpha"), /\shidden(?=[\s>])/);
  assert.doesNotMatch(cardOpenTagFor(exclusiveSection, "Beta"), /\shidden(?=[\s>])/);

  const defaultSection = sectionFor("default-filters");
  assert.ok(defaultSection, "default filter section should render");
  assert.deepEqual(buttonValuesFor(defaultSection), ["all", "One", "Two"]);
  assert.match(defaultSection, /data-filter-target="section-default-filters"/);
  assert.match(buttonsFor(defaultSection)[0], /data-filter-value="all"[^>]+aria-pressed="true"/);

  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(pathToFileURL(payload.outputPath).href);
    await page.click('#section-exclusive-filters > .toolbar button[data-filter-value="Alpha"]');
    const clickedState = await page.evaluate(() => {
      const section = document.querySelector("#section-exclusive-filters");
      return {
        buttons: [...(section?.querySelectorAll(":scope > .toolbar > button") || [])].map((button) => ({
          value: button.getAttribute("data-filter-value"),
          pressed: button.getAttribute("aria-pressed"),
          hidden: button.hidden
        })),
        cards: [...(section?.querySelectorAll("[data-focus-field] > article[data-filter-value]") || [])].map((card) => ({
          value: card.getAttribute("data-filter-value"),
          hidden: card.hidden
        }))
      };
    });
    assert.deepEqual(clickedState.buttons, [
      { value: "Alpha", pressed: "true", hidden: false },
      { value: "Beta", pressed: "false", hidden: false }
    ]);
    assert.deepEqual(clickedState.cards, [
      { value: "Alpha", hidden: false },
      { value: "Beta", hidden: true }
    ]);
    await page.close();
  } finally {
    await browser.close();
  }
});

test("effective-interact renders up to five card media items for daily tracking cards", async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-daily-card-media-limit-"));
  const inputPath = path.join(tmp, "tracking-media.json");
  await fsp.writeFile(
    inputPath,
    JSON.stringify({
      title: "AI 日报 2026-05-28",
      summary: "测试 tracking 卡片多图渲染。",
      status: "complete",
      renderMode: "pre-rendered",
      sections: [
        {
          type: "filterable-cards",
          title: "每日追踪",
          group: "main",
          cardClass: "tracking-card",
          showFilters: false,
          items: [
            {
              group: "TRACKING",
              title: "OpenRouter",
              href: "https://openrouter.ai/rankings",
              body: "公开榜单跟踪。",
              media: Array.from({ length: 5 }, (_unused, index) => ({
                src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
                alt: `Chart ${index + 1}`,
                caption: `Chart ${index + 1}`
              }))
            }
          ]
        }
      ]
    }),
    "utf8"
  );

  const generated = spawnSync(
    process.execPath,
    [createReportScript, "--input", inputPath, "--out-dir", tmp, "--slug", "tracking-media", "--json"],
    { cwd: rootDir, encoding: "utf8" }
  );
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const payload = JSON.parse(generated.stdout);
  const html = await fsp.readFile(payload.outputPath, "utf8");
  const mediaBlock = html.match(/<div class="card-media-grid" data-count="5">[\s\S]*?<\/div>/)?.[0] || "";
  assert(mediaBlock);
  assert.equal((mediaBlock.match(/<figure>/g) || []).length, 5);
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
