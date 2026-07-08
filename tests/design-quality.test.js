import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateDesignQuality } from "../src/design-quality.js";

test("repository ADC frontend quality workflow satisfies the contract", async () => {
  const result = await validateDesignQuality({ rootDir: path.resolve(".") });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert(result.required_docs.every((doc) => doc.exists));
  assert.equal(result.sources_checked, 2);
});

test("design quality validator rejects missing external source records", async () => {
  const rootDir = await createFixture({
    manifest: {
      schema_version: "1",
      adopted_sources: [],
      quality_contract: validQualityContract()
    }
  });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_quality_source_missing"));
});

test("design quality validator rejects direct production dependency adoption", async () => {
  const manifest = validManifest();
  manifest.adopted_sources[1].production_dependency = true;
  const rootDir = await createFixture({ manifest });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.message.includes("impeccable.production_dependency")));
});

test("design quality validator requires source or tool evidence in frontend PR contract", async () => {
  const manifest = validManifest();
  manifest.quality_contract.required_frontend_pr_evidence =
    manifest.quality_contract.required_frontend_pr_evidence.filter((item) => item !== "source_or_tool_evidence");
  const rootDir = await createFixture({ manifest });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(
    result.issues.some(
      (issue) =>
        issue.code === "design_quality_evidence_missing" &&
        issue.message.includes("source_or_tool_evidence")
    )
  );
});

test("design quality validator rejects incomplete workflow boundaries", async () => {
  const rootDir = await createFixture({
    workflowDoc: "ADC frontend workflow without markers.\n"
  });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_quality_workflow_incomplete"));
});

test("design quality validator rejects missing package script chaining", async () => {
  const rootDir = await createFixture({
    packageJson: {
      type: "module",
      scripts: {
        test: "node --test tests/design-quality.test.js",
        validate: "pnpm run test",
        "validate:docs": "git diff --check"
      }
    }
  });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_quality_script_missing"));
  assert(result.issues.some((issue) => issue.code === "design_quality_script_not_chained"));
});

test("design quality validator rejects package-level external design tool adoption", async () => {
  const packageJson = validPackageJson();
  packageJson.devDependencies = {
    "impeccable-cli": "^1.0.0"
  };
  packageJson.scripts["impeccable:audit"] = "npx impeccable audit";
  const rootDir = await createFixture({ packageJson });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_quality_external_tool_dependency_forbidden"));
  assert(result.issues.some((issue) => issue.code === "design_quality_external_tool_script_forbidden"));
});

test("design quality validator rejects workspace package external design tool dependencies", async () => {
  const rootDir = await createFixture({
    workspacePackages: [
      {
        path: "apps/web/package.json",
        packageJson: {
          name: "@adc/web",
          type: "module",
          devDependencies: {
            "@impeccable/cli": "^1.0.0"
          }
        }
      },
      {
        path: "packages/design/package.json",
        packageJson: {
          name: "@adc/design",
          type: "module",
          dependencies: {
            "@vendor/taste-skill-adapter": "^1.0.0"
          }
        }
      }
    ]
  });

  const result = await validateDesignQuality({ rootDir });

  assert.equal(result.ok, false);
  assert(
    result.issues.some(
      (issue) => issue.code === "design_quality_external_tool_dependency_forbidden" && issue.path === "apps/web/package.json"
    )
  );
  assert(
    result.issues.some(
      (issue) =>
        issue.code === "design_quality_external_tool_dependency_forbidden" &&
        issue.path === "packages/design/package.json"
    )
  );
});

async function createFixture(options = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-design-quality-"));
  await write(path.join(rootDir, "design", "design-quality-sources.json"), `${JSON.stringify(options.manifest || validManifest(), null, 2)}\n`);
  await write(path.join(rootDir, "design", "frontend-quality-workflow.md"), options.workflowDoc || validWorkflowDoc());
  await write(path.join(rootDir, ".codex", "skills", "adc-frontend-quality", "SKILL.md"), options.adcSkill || validAdcSkill());
  await write(
    path.join(rootDir, ".codex", "skills", "design-taste-frontend", "SKILL.md"),
    options.tasteSkill || validTasteSkill()
  );
  await write(path.join(rootDir, "package.json"), `${JSON.stringify(options.packageJson || validPackageJson(), null, 2)}\n`);
  for (const workspacePackage of options.workspacePackages || []) {
    await write(
      path.join(rootDir, workspacePackage.path),
      `${JSON.stringify(workspacePackage.packageJson, null, 2)}\n`
    );
  }
  return rootDir;
}

function validManifest() {
  return {
    schema_version: "1",
    adopted_sources: [
      {
        id: "taste-skill",
        url: "https://github.com/Leonxlnx/taste-skill",
        local_skill: ".codex/skills/design-taste-frontend/SKILL.md",
        license: "MIT",
        upstream_commit: "3c7017d636c3a4aad378433ea6d0cfa6c921da4a",
        role: "design_read_and_anti_template_calibration",
        production_dependency: false
      },
      {
        id: "impeccable",
        url: "https://github.com/pbakaus/impeccable",
        license: "Apache-2.0",
        role: "external_design_audit_vocabulary_and_optional_detector",
        install_command: "npx impeccable install",
        init_command: "/impeccable init",
        production_dependency: false
      }
    ],
    quality_contract: validQualityContract()
  };
}

function validQualityContract() {
  return {
    implementation_stack: ["React", "Astryx", "Vite"],
    required_frontend_pr_evidence: [
      "design_read",
      "design_dials",
      "source_or_tool_evidence",
      "audit_or_skip_reason",
      "browser_acceptance"
    ],
    forbidden: ["direct_generated_code_to_production", "landing_page_replacement_for_data_product"]
  };
}

function validWorkflowDoc() {
  return [
    "<!-- adc-frontend-quality:v1 -->",
    "<!-- taste-skill-boundary -->",
    "<!-- impeccable-boundary -->",
    "<!-- frontend-quality-validation -->",
    "Use design-taste-frontend. Run npx impeccable install when available.",
    "It is not for dashboards, data tables, multi-step product UI, or routine React logic.",
    "React and Astryx remain the implementation target.",
    "Record DESIGN_VARIANCE, MOTION_INTENSITY, and VISUAL_DENSITY.",
    "Handle prefers-reduced-motion and run Playwright browser acceptance.",
    ""
  ].join("\n");
}

function validAdcSkill() {
  return [
    "---",
    "name: adc-frontend-quality",
    "description: Load when changing the ADC web frontend, visual system, React/Astryx product UI, or frontend PR acceptance; do not load for backend-only source ingestion, routine report generation, or non-UI documentation edits.",
    "---",
    "Read design/frontend-quality-workflow.md and design/design-quality-sources.json.",
    "Use design-taste-frontend and Impeccable as evidence.",
    "Keep React and Astryx as production targets.",
    "Record browser acceptance evidence.",
    ""
  ].join("\n");
}

function validTasteSkill() {
  return [
    "---",
    "name: design-taste-frontend",
    "source: https://github.com/Leonxlnx/taste-skill",
    "upstream_commit: 3c7017d636c3a4aad378433ea6d0cfa6c921da4a",
    "license: MIT",
    "---",
    "Do not load for dashboards, data tables, multi-step product UI, routine React/Next logic, HTML reports.",
    ""
  ].join("\n");
}

function validPackageJson() {
  return {
    type: "module",
    scripts: {
      "design-quality:validate": "node scripts/validate-design-quality.mjs",
      test: "node --test tests/design-quality.test.js",
      validate: "pnpm run design-quality:validate && pnpm run test",
      "validate:docs": "pnpm run design-quality:validate && git diff --check"
    }
  };
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
