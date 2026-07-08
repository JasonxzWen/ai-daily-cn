import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateDesignArtifacts } from "../src/design-artifacts.js";

test("repository design toolchain artifacts satisfy the contract", async () => {
  const result = await validateDesignArtifacts({ rootDir: path.resolve(".") });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert(result.required_docs.every((doc) => doc.exists));
  assert(result.artifacts_checked >= 1);
});

test("design artifact validator rejects direct generated-code production policy", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-design-artifacts-"));
  await write(path.join(rootDir, "design", "adc-visual-system.md"), "ADC visual system\n");
  await write(
    path.join(rootDir, "design", "design-toolchain.md"),
    "Stitch and v0 are used for prototype evidence. Generated code is translated into Astryx components for GitHub Pages.\n"
  );
  await write(path.join(rootDir, "design", "prototypes", "README.md"), "Prototype records\n");
  await write(path.join(rootDir, "design", "prototypes", "_template.prompt.md"), "Prompt\n");
  await write(path.join(rootDir, "design", "prototypes", "_template.decision.md"), "Decision\n");
  await write(
    path.join(rootDir, "design", "prototypes", "_template.design.json"),
    `${JSON.stringify({
      schema_version: "1",
      id: "bad-policy",
      title: "Bad policy",
      tool: "stitch",
      status: "draft",
      prompt: { path: "design/prototypes/_template.prompt.md" },
      evidence: {
        screenshots: [],
        decision_record: "design/prototypes/_template.decision.md"
      },
      production_boundary: {
        generated_code_policy: "production_direct",
        forbidden_output: ["exported source code"]
      }
    }, null, 2)}\n`
  );

  const result = await validateDesignArtifacts({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_artifact_code_policy_invalid"));
});

test("design artifact validator rejects references outside design directory", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-design-artifacts-"));
  await write(path.join(rootDir, "design", "adc-visual-system.md"), "ADC visual system\n");
  await write(
    path.join(rootDir, "design", "design-toolchain.md"),
    "Stitch and v0 are used for prototype evidence. Generated code is translated into Astryx components for GitHub Pages.\n"
  );
  await write(path.join(rootDir, "design", "prototypes", "README.md"), "Prototype records\n");
  await write(path.join(rootDir, "outside.prompt.md"), "Prompt outside design\n");
  await write(path.join(rootDir, "design", "prototypes", "_template.decision.md"), "Decision\n");
  await write(
    path.join(rootDir, "design", "prototypes", "_template.design.json"),
    `${JSON.stringify({
      schema_version: "1",
      id: "outside-design",
      title: "Outside design reference",
      tool: "manual",
      status: "draft",
      prompt: { path: "outside.prompt.md" },
      evidence: {
        screenshots: [],
        decision_record: "design/prototypes/_template.decision.md"
      },
      production_boundary: {
        generated_code_policy: "reference_only",
        forbidden_output: ["direct generated code"]
      }
    }, null, 2)}\n`
  );
  await write(path.join(rootDir, "design", "prototypes", "_template.prompt.md"), "Prompt\n");

  const result = await validateDesignArtifacts({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_artifact_reference_outside_design"));
});

test("design artifact validator rejects incomplete decision records", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-design-artifacts-"));
  await write(path.join(rootDir, "design", "adc-visual-system.md"), "ADC visual system\n");
  await write(
    path.join(rootDir, "design", "design-toolchain.md"),
    "Stitch and v0 are used for prototype evidence. Generated code is translated into Astryx components for GitHub Pages.\n"
  );
  await write(path.join(rootDir, "design", "prototypes", "README.md"), "Prototype records\n");
  await write(path.join(rootDir, "design", "prototypes", "_template.prompt.md"), "Prompt\n");
  await write(path.join(rootDir, "design", "prototypes", "_template.decision.md"), "Only notes\n");
  await write(
    path.join(rootDir, "design", "prototypes", "_template.design.json"),
    `${JSON.stringify({
      schema_version: "1",
      id: "incomplete-decision",
      title: "Incomplete decision",
      tool: "manual",
      status: "draft",
      prompt: { path: "design/prototypes/_template.prompt.md" },
      evidence: {
        screenshots: [],
        decision_record: "design/prototypes/_template.decision.md"
      },
      production_boundary: {
        generated_code_policy: "reference_only",
        forbidden_output: ["direct generated code"]
      }
    }, null, 2)}\n`
  );

  const result = await validateDesignArtifacts({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "design_artifact_decision_section_missing"));
});

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
