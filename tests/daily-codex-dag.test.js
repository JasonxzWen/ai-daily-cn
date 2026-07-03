import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createDailyCodexDagPlan, validateDailyCodexDag } from "../src/daily-codex-dag.js";

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, "config", "daily-codex-dag.json");

test("daily codex DAG manifest validates target node contract", async () => {
  const result = await validateDailyCodexDag({ rootDir });

  assert.equal(result.ok, true, result.failures.join("\n"));
  assert.equal(result.node_ids.length, 16);
  assert(result.node_ids.includes("fetch-source-health"));
  assert(result.node_ids.includes("publish-cleanup"));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-codex-dag.json")));
  assert(result.checked_files.some((file) => file.endsWith("config/daily-resilience-policy.json")));
});

test("daily codex DAG plan projection is deterministic and topological", async () => {
  const manifest = await loadManifest();
  const originalManifest = JSON.stringify(manifest);
  const first = await createDailyCodexDagPlan({ rootDir, manifest });
  const second = await createDailyCodexDagPlan({ rootDir, manifest });

  assert.equal(first.ok, true, first.failures.join("\n"));
  assert.equal(second.ok, true, second.failures.join("\n"));
  assert.deepEqual(first.plan, second.plan);
  assert.equal(JSON.stringify(manifest), originalManifest, "planner must not mutate manifest input");

  const plan = first.plan;
  assert.equal(plan.node_count, 16);
  assert.equal(plan.nodes.length, 16);
  assert.equal(new Set(plan.nodes.map((item) => item.id)).size, 16);

  const levelById = new Map(plan.nodes.map((item) => [item.id, item.level]));
  for (const item of plan.nodes) {
    for (const dep of item.dependencies) {
      assert(
        levelById.get(dep) < item.level,
        `${item.id} should be after dependency ${dep}`
      );
    }
  }

  const articleAndEditionLevel = plan.levels.find((level) => level.node_ids.includes("persist-article-db"));
  assert.deepEqual(
    articleAndEditionLevel.node_ids.filter((id) => id === "persist-article-db" || id === "assemble-daily-edition"),
    ["persist-article-db", "assemble-daily-edition"],
    "same-level nodes should preserve manifest order"
  );

  assert(levelById.get("per-item-summary") > levelById.get("admit-reject"));
  assert(levelById.get("quality-audit") > levelById.get("per-item-summary"));
  assert(levelById.get("build-cards-page") > levelById.get("persist-article-db"));
  assert(levelById.get("build-cards-page") > levelById.get("assemble-daily-edition"));

  const score = plan.nodes.find((item) => item.id === "score");
  assert.deepEqual(Object.keys(score).sort(), [
    "dependencies",
    "execution_status",
    "id",
    "inputs",
    "kind",
    "level",
    "outputs",
    "owner_path_scope",
    "parallel_group",
    "plan_status",
    "public_artifact",
    "runner_stage_ref",
    "title"
  ]);
  assert.equal(score.plan_status, "planned");
  assert.equal(plan.nodes.find((item) => item.id === "admit-reject").plan_status, "mapped");
});

test("daily codex DAG plan projection refuses invalid manifests without throwing", async () => {
  const manifest = await loadManifest();
  node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/missing-plan-input.json";

  const result = await createDailyCodexDagPlan({ rootDir, manifest });

  assert.equal(result.ok, false);
  assert.equal(result.plan, null);
  assert(result.validation);
  assert(
    result.failures.some((failure) => failure.includes("node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/missing-plan-input.json is not produced")),
    result.failures.join("\n")
  );

  const structurallyInvalid = await loadManifest();
  node(structurallyInvalid, "score").inputs = { path: "not-an-array.json", required: true };
  const structuralResult = await createDailyCodexDagPlan({ rootDir, manifest: structurallyInvalid });

  assert.equal(structuralResult.ok, false);
  assert.equal(structuralResult.plan, null);
  assert(structuralResult.validation);
  assert(
    structuralResult.failures.some((failure) => failure.includes("/nodes/4/inputs must be array")),
    structuralResult.failures.join("\n")
  );
});

test("daily codex DAG validator catches structural and boundary regressions", async () => {
  const cases = [
    {
      name: "duplicate node id",
      mutate(manifest) {
        manifest.nodes[1].id = manifest.nodes[0].id;
      },
      expected: "duplicate node id"
    },
    {
      name: "missing dependency",
      mutate(manifest) {
        node(manifest, "parse-extract").dependencies = ["missing-node"];
      },
      expected: "depends on missing node missing-node"
    },
    {
      name: "dependency cycle",
      mutate(manifest) {
        node(manifest, "fetch-source-health").dependencies = ["publish-cleanup"];
      },
      expected: "dependency cycle detected"
    },
    {
      name: "missing schema ref",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/missing-dag-output.schema.json";
      },
      expected: "node score.schemas.output failed to read JSON"
    },
    {
      name: "missing schema fragment",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/daily-codex-dag.schema.json#/$defs/doesNotExist";
      },
      expected: "node score.schemas.output references missing schema fragment /$defs/doesNotExist"
    },
    {
      name: "prototype schema fragment",
      mutate(manifest) {
        node(manifest, "score").schemas.output = "schemas/daily-codex-dag.schema.json#/__proto__";
      },
      expected: "node score.schemas.output references missing schema fragment /__proto__"
    },
    {
      name: "missing fixture ref",
      mutate(manifest) {
        node(manifest, "score").fixture = "tests/fixtures/daily-codex-dag/missing.json";
      },
      expected: "node score.fixture missing"
    },
    {
      name: "unsafe absolute artifact path",
      mutate(manifest) {
        node(manifest, "score").outputs[0].path = "C:/temp/score.json";
      },
      expected: "must be a safe repo-relative template path"
    },
    {
      name: "unsafe parent artifact path",
      mutate(manifest) {
        node(manifest, "score").outputs[0].path = "../score.json";
      },
      expected: "must be a safe repo-relative template path"
    },
    {
      name: "public output marked private",
      mutate(manifest) {
        node(manifest, "persist-article-db").public_artifact = false;
      },
      expected: "has public_artifact false but writes docs/articles.json"
    },
    {
      name: "mapped node without resilience policy mode",
      mutate(manifest) {
        node(manifest, "admit-reject").failure_policy.mode = "planned";
      },
      expected: "mapped node admit-reject must use failure_policy.mode resilience_policy_ref"
    },
    {
      name: "mapped node without resilience policy ref",
      mutate(manifest) {
        node(manifest, "admit-reject").resilience_policy_ref = "";
      },
      expected: "node admit-reject uses resilience_policy_ref mode without resilience_policy_ref"
    },
    {
      name: "missing resilience policy stage",
      mutate(manifest) {
        node(manifest, "admit-reject").resilience_policy_ref = "missing_policy_stage";
      },
      expected: "references missing resilience policy stage missing_policy_stage"
    },
    {
      name: "planned node missing resilience policy stage",
      mutate(manifest) {
        node(manifest, "fetch-source-health").resilience_policy_ref = "missing_policy_stage";
      },
      expected: "references missing resilience policy stage missing_policy_stage"
    },
    {
      name: "fanout without fanout config",
      mutate(manifest) {
        delete node(manifest, "per-item-summary").fanout;
      },
      expected: "fanout node per-item-summary requires fanout config"
    },
    {
      name: "fanout references missing source",
      mutate(manifest) {
        node(manifest, "per-item-summary").fanout.from = "missing-fanout-source";
      },
      expected: "fanout node per-item-summary references missing source missing-fanout-source"
    },
    {
      name: "non fanout declares fanout config",
      mutate(manifest) {
        node(manifest, "score").fanout = { from: "admit-reject", item_id_field: "accepted_items[].id" };
      },
      expected: "non-fanout node score cannot declare fanout config"
    },
    {
      name: "barrier without wait config",
      mutate(manifest) {
        delete node(manifest, "quality-audit").barrier;
      },
      expected: "barrier node quality-audit requires barrier config"
    },
    {
      name: "barrier waits for missing source",
      mutate(manifest) {
        node(manifest, "quality-audit").barrier.wait_for = ["missing-barrier-source"];
      },
      expected: "barrier node quality-audit waits for missing node missing-barrier-source"
    },
    {
      name: "non barrier declares barrier config",
      mutate(manifest) {
        node(manifest, "score").barrier = { wait_for: ["admit-reject"] };
      },
      expected: "non-barrier node score cannot declare barrier config"
    },
    {
      name: "publish without public quality gate",
      mutate(manifest) {
        node(manifest, "publish-cleanup").dependencies = [];
      },
      expected: "publish-cleanup must transitively depend on quality-audit"
    },
    {
      name: "input without dependencies",
      mutate(manifest) {
        node(manifest, "parse-extract").dependencies = [];
      },
      expected: "node parse-extract declares inputs but has no dependency outputs to read from"
    },
    {
      name: "input missing upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/missing-scored-input.json";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/missing-scored-input.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "input from non ancestor sibling",
      mutate(manifest) {
        node(manifest, "build-cards-page").dependencies = ["assemble-daily-edition"];
      },
      expected: "node build-cards-page input docs/articles.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "self output does not satisfy input lineage",
      mutate(manifest) {
        const target = node(manifest, "score");
        target.inputs[0].path = target.outputs[0].path;
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/scored-candidates.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "fanout input template is exact",
      mutate(manifest) {
        node(manifest, "quality-audit").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/summaries/{candidate_id}.json";
      },
      expected: "node quality-audit input .tmp/daily-codex-pipeline/{report_date}/artifacts/summaries/{candidate_id}.json is not produced by any direct or transitive dependency output"
    },
    {
      name: "input path cannot prefix match upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json.backup";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates.json.backup is not produced by any direct or transitive dependency output"
    },
    {
      name: "input path cannot be prefix of upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs[0].path = ".tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates";
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/classified-candidates is not produced by any direct or transitive dependency output"
    },
    {
      name: "optional input still needs upstream output",
      mutate(manifest) {
        node(manifest, "score").inputs.push({
          path: ".tmp/daily-codex-pipeline/{report_date}/artifacts/optional-sidecar.json",
          required: false
        });
      },
      expected: "node score input .tmp/daily-codex-pipeline/{report_date}/artifacts/optional-sidecar.json is not produced by any direct or transitive dependency output"
    }
  ];

  for (const item of cases) {
    const manifest = await loadManifest();
    item.mutate(manifest);
    const result = await validateDailyCodexDag({ rootDir, manifest });
    assert.equal(result.ok, false, item.name);
    assert(
      result.failures.some((failure) => failure.includes(item.expected)),
      `${item.name}\nexpected: ${item.expected}\nactual:\n${result.failures.join("\n")}`
    );
  }
});

async function loadManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

function node(manifest, id) {
  const found = manifest.nodes.find((item) => item.id === id);
  assert(found, `missing fixture node ${id}`);
  return found;
}
