import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateIllustrationAssets } from "../src/illustration-assets.js";

test("repository ADC illustration assets satisfy the contract", async () => {
  const result = await validateIllustrationAssets({ rootDir: path.resolve(".") });

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  assert(result.required_docs.every((doc) => doc.exists));
  assert(result.assets_checked >= 1);
});

test("illustration validator rejects third-party copies", async () => {
  const rootDir = await createFixture({
    copiedFromThirdParty: true
  });

  const result = await validateIllustrationAssets({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "illustration_third_party_copy_forbidden"));
});

test("illustration validator rejects generated asset drift", async () => {
  const rootDir = await createFixture({
    publicSvg: `<svg><title>ADC.</title><desc>different</desc></svg>\n`
  });

  const result = await validateIllustrationAssets({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "illustration_generated_asset_drift"));
});

test("illustration validator rejects incomplete prompts", async () => {
  const rootDir = await createFixture({
    prompt: "Draw a character.\n"
  });

  const result = await validateIllustrationAssets({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "illustration_prompt_contract_missing"));
});

test("illustration validator rejects remote SVG references with whitespace or url functions", async () => {
  const rootDir = await createFixture({
    sourceSvg: `<svg xmlns="http://www.w3.org/2000/svg" style="background:url(https://example.com/x.png)"><title>ADC.</title><desc>Original ADC asset</desc><text href = "https://example.com">ADC.</text></svg>\n`,
    publicSvg: `<svg xmlns="http://www.w3.org/2000/svg" style="background:url(https://example.com/x.png)"><title>ADC.</title><desc>Original ADC asset</desc><text href = "https://example.com">ADC.</text></svg>\n`
  });

  const result = await validateIllustrationAssets({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "illustration_svg_embedded_external_asset"));
});

test("illustration validator requires SVG source and public asset extensions", async () => {
  const rootDir = await createFixture({
    sourceAsset: "apps/web/public/assets/adc-character.txt",
    publicAsset: "docs/assets/adc-character.txt"
  });

  const result = await validateIllustrationAssets({ rootDir });

  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.code === "illustration_reference_extension_invalid"));
});

async function createFixture(options = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "adc-illustration-assets-"));
  const sourceSvg = options.sourceSvg || `<svg><title>ADC.</title><desc>Original ADC asset</desc><text>ADC.</text></svg>\n`;
  const publicSvg = options.publicSvg || sourceSvg;
  const sourceAsset = options.sourceAsset || "apps/web/public/assets/adc-character.svg";
  const publicAsset = options.publicAsset || "docs/assets/adc-character.svg";
  const prompt = options.prompt || [
    "Create a desktop-first AI news data product character.",
    "Use black-and-white rough ink line art.",
    "Do not copy third-party illustration IP.",
    ""
  ].join("\n");

  await write(path.join(rootDir, "design", "illustration-workflow.md"), [
    "Original black-and-white third-party Vite illustration workflow.",
    ""
  ].join("\n"));
  await write(path.join(rootDir, "design", "illustrations", "README.md"), "Illustrations\n");
  await write(path.join(rootDir, "design", "illustrations", "adc-character.v1.prompt.md"), prompt);
  await write(path.join(rootDir, "design", "illustrations", "adc-character.v1.decision.md"), [
    "## Accepted",
    "Use line art.",
    "## Rejected",
    "No copied asset.",
    "## Usage",
    "Homepage.",
    "## Rights",
    "Original.",
    ""
  ].join("\n"));
  await write(path.join(rootDir, sourceAsset), sourceSvg);
  await write(path.join(rootDir, publicAsset), publicSvg);
  await write(
    path.join(rootDir, "design", "illustrations", "adc-character.v1.asset.json"),
    `${JSON.stringify({
      schema_version: "1",
      id: "adc-character-v1",
      title: "ADC character v1",
      status: "active",
      style_family: "adc-line-art",
      source_asset: sourceAsset,
      public_asset: publicAsset,
      prompt: {
        path: "design/illustrations/adc-character.v1.prompt.md"
      },
      decision_record: "design/illustrations/adc-character.v1.decision.md",
      rights: {
        original: true,
        copied_from_third_party: Boolean(options.copiedFromThirdParty),
        external_references: []
      },
      production_boundary: {
        allowed_surfaces: ["apps/web"],
        forbidden_uses: ["third-party IP copy"]
      },
      build: {
        generated_by: "vite public copy"
      }
    }, null, 2)}\n`
  );

  return rootDir;
}

async function write(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
