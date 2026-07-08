import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadEditorialClassificationContract } from "../src/editorial-classification-contract.js";
import {
  buildEditorialRankArtifact,
  formatEditorialRankErrors,
  loadEditorialRankPolicy,
  validateEditorialRankArtifact,
  validateEditorialRankPolicy
} from "../src/editorial-rank.js";

const rootDir = process.cwd();
const contract = loadEditorialClassificationContract({ rootDir });
const policy = loadEditorialRankPolicy({ rootDir });
const generatedAt = "2026-07-08T00:00:00.000Z";
const sourceWindow = {
  from: "2026-07-07T00:00:00.000Z",
  to: generatedAt
};

test("editorial rank policy is internal-only and references the classification contract", () => {
  const result = validateEditorialRankPolicy(policy, { rootDir, contract });
  assert.equal(result.valid, true, formatEditorialRankErrors(result.errors));
  assert.equal(policy.artifact.max_items, 100);
  assert.equal(policy.artifact.public, false);
  assert.equal(policy.selection_limits.today_selected, contract.admission_targets.today_selected.max_items);
  assert.equal(policy.selection_limits.must_read, contract.admission_targets.must_read.max_items);

  const broken = structuredClone(policy);
  broken.score_weights.rank_policy.personal_score = 999;
  broken.artifact.public = true;
  const brokenResult = validateEditorialRankPolicy(broken, { rootDir, contract });
  assert.equal(brokenResult.valid, false);
  assert(brokenResult.errors.some((error) => error.path === "/score_weights/rank_policy/personal_score"));
  assert(brokenResult.errors.some((error) => error.path === "/artifact/public"));
});

test("editorial rank artifact validates and keeps rank fields internal", async () => {
  const candidates = [
    ...await readJson("tests/fixtures/editorial-rank/mixed-candidates.json"),
    ...await readJson("tests/fixtures/editorial-classification/golden-cases.json"),
    ...await readJson("tests/fixtures/editorial-classification/red-light-cases.json")
  ];
  const artifact = buildEditorialRankArtifact({
    rootDir,
    contract,
    policy,
    candidates,
    generatedAt,
    sourceWindow
  });
  const validation = validateEditorialRankArtifact(artifact, { rootDir, policy });
  assert.equal(validation.valid, true, formatEditorialRankErrors(validation.errors));
  assert.equal(artifact.policy_id, policy.policy_id);
  assert(artifact.items.length <= 100);

  const forbiddenPublicFields = new Set(contract.public_private_boundary.public_articles_forbidden_fields);
  for (const item of artifact.items) {
    assert(forbiddenPublicFields.has("editorial_rank"));
    assert.equal(typeof item.editorial_rank, "number");
    assert.equal(typeof item.rank_policy, "string");
  }
});

test("high-signal items are ranked and admitted while weak items do not backfill", async () => {
  const candidates = await readJson("tests/fixtures/editorial-rank/mixed-candidates.json");
  const artifact = buildEditorialRankArtifact({
    rootDir,
    contract,
    policy,
    candidates,
    generatedAt,
    sourceWindow
  });

  const anthropic = findItem(artifact, "anthropic-official-agent-practice");
  assert.equal(anthropic.rank_policy, "breaking_official_technical");
  assert.equal(anthropic.admission.today_selected.selected, true);
  assert.equal(anthropic.admission.must_read.selected, true);
  assert(anthropic.lane_ids.includes("must_read"));

  const industry = findItem(artifact, "industry-background-brief");
  assert.equal(industry.rank_policy, "industry_background");
  assert.equal(industry.admission.today_selected.selected, false);
  assert.equal(industry.admission.must_read.selected, false);

  const selected = artifact.items.filter((item) => item.admission.today_selected.selected);
  const mustRead = artifact.items.filter((item) => item.admission.must_read.selected);
  assert(selected.length < policy.selection_limits.today_selected);
  assert(mustRead.length < policy.selection_limits.must_read);
});

test("GitHub README-insufficient items are downgraded to momentum-only GitHub lane", async () => {
  const candidates = await readJson("tests/fixtures/editorial-rank/mixed-candidates.json");
  const artifact = buildEditorialRankArtifact({
    rootDir,
    contract,
    policy,
    candidates,
    generatedAt,
    sourceWindow
  });
  const contextual = findItem(artifact, "github-contextual-eval-repo");
  assert.equal(contextual.rank_policy, "github_contextual_repo");
  assert.equal(contextual.admission.today_selected.selected, true);
  assert.equal(contextual.admission.must_read.selected, true);

  const momentumOnly = findItem(artifact, "github-momentum-only-repo");
  assert.equal(momentumOnly.rank_policy, "github_momentum_downgrade");
  assert(momentumOnly.demotion_reasons.includes("github_readme_context_insufficient"));
  assert(momentumOnly.demotion_reasons.includes("momentum_only"));
  assert.equal(momentumOnly.admission.today_selected.eligible, false);
  assert.equal(momentumOnly.admission.today_selected.selected, false);
  assert.equal(momentumOnly.admission.must_read.selected, false);
  assert.deepEqual(momentumOnly.lane_ids, ["open_source_github"]);
});

test("unconfirmed high-signal disclosure failures cannot enter selected or must-read", async () => {
  const golden = await readJson("tests/fixtures/editorial-classification/golden-cases.json");
  const redLights = await readJson("tests/fixtures/editorial-classification/red-light-cases.json");
  const good = golden.find((item) => item.id === "bytedance-unconfirmed-high-signal");
  const bad = redLights.find((item) => item.id === "unconfirmed-high-signal-factualized");
  const artifact = buildEditorialRankArtifact({
    rootDir,
    contract,
    policy,
    candidates: [good, bad],
    generatedAt,
    sourceWindow
  });

  const goodItem = findItem(artifact, good.id);
  assert.equal(goodItem.rank_policy, "major_company_high_signal");
  assert.equal(goodItem.admission.today_selected.selected, true);
  assert.equal(goodItem.admission.must_read.selected, true);
  assert(goodItem.selection_reasons.includes("unconfirmed_high_signal_disclosed"));

  const badItem = findItem(artifact, bad.id);
  assert.equal(badItem.admission.today_selected.selected, false);
  assert.equal(badItem.admission.must_read.selected, false);
  assert(badItem.demotion_reasons.includes("unconfirmed_signal_missing_public_disclosure"));
  assert(badItem.demotion_reasons.includes("unconfirmed_signal_factualized"));
});

test("selection limits are upper bounds and Top100 output is stable", () => {
  const candidates = Array.from({ length: 120 }, (_, index) => ({
    id: `bulk-official-${String(index).padStart(3, "0")}`,
    title: `Official model release ${String(index).padStart(3, "0")}`,
    summary: "Official model release with model and platform implications.",
    source_type: "official",
    event_type: "model_release",
    entities: ["openai"],
    topics: ["foundation_models"],
    verification_status: "confirmed",
    evidence_level: "high",
    source_count: 1,
    priority: "high"
  }));
  const artifact = buildEditorialRankArtifact({
    rootDir,
    contract,
    policy,
    candidates,
    generatedAt,
    sourceWindow
  });

  assert.equal(artifact.items.length, 100);
  assert.equal(artifact.items[0].source_id, "bulk-official-000");
  assert.equal(artifact.items.at(-1).source_id, "bulk-official-099");
  assert.deepEqual(artifact.items.map((item) => item.editorial_rank), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(artifact.items.filter((item) => item.admission.today_selected.selected).length, 20);
  assert.equal(artifact.items.filter((item) => item.admission.must_read.selected).length, 8);
});

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(rootDir, relativePath), "utf8"));
}

function findItem(artifact, sourceId) {
  const item = artifact.items.find((entry) => entry.source_id === sourceId);
  assert(item, `${sourceId} should exist in rank artifact`);
  return item;
}
