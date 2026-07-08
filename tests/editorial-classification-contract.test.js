import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  evaluateEditorialAdmission,
  formatEditorialContractErrors,
  loadEditorialClassificationContract,
  validateEditorialClassificationContract
} from "../src/editorial-classification-contract.js";

const rootDir = process.cwd();
const contract = loadEditorialClassificationContract({ rootDir });

test("editorial classification contract validates schema and freezes IA/taxonomy boundaries", () => {
  const result = validateEditorialClassificationContract(contract, { rootDir });
  assert.equal(result.valid, true, formatEditorialContractErrors(result.errors));

  assert.deepEqual(contract.homepage_tabs.map((tab) => tab.id), [
    "today_selected",
    "trend_tracking",
    "watch_sources",
    "github",
    "builder",
    "industry"
  ]);
  assert.deepEqual(contract.daily_lanes.map((lane) => lane.id), [
    "must_read",
    "major_company_strategy",
    "watch_source_updates",
    "open_source_github",
    "product_industry",
    "builder_twitter",
    "trend_tracking"
  ]);
  assert.equal(contract.admission_targets.today_selected.max_items, 20);
  assert.equal(contract.admission_targets.must_read.max_items, 8);
  assert.equal(contract.admission_targets.today_selected.quota_policy, "upper_bound_not_quota");
  assert.equal(contract.admission_targets.must_read.quota_policy, "upper_bound_not_quota");
});

test("editorial classification contract contains target topics, entities, and public/internal field boundary", () => {
  const topics = new Set(contract.topics.map((topic) => topic.label));
  for (const topic of [
    "基座模型",
    "AI工程栈",
    "AI助手与Agent",
    "AI实践方法",
    "工作场景AI软件",
    "新兴AI产品与项目",
    "企业AI采纳",
    "企业职能AI",
    "AI市场动态",
    "多模态AI",
    "AI算力与推理服务",
    "AI政策与地缘",
    "C端AI产品",
    "具身智能"
  ]) {
    assert(topics.has(topic), `${topic} should be a target topic`);
  }

  const entities = new Set(contract.entities.map((entity) => entity.label));
  for (const entity of [
    "Anthropic",
    "OpenAI",
    "Microsoft",
    "Google",
    "Nvidia",
    "阿里巴巴",
    "Meta",
    "字节跳动",
    "腾讯",
    "Apple",
    "Amazon",
    "DeepSeek"
  ]) {
    assert(entities.has(entity), `${entity} should be a watched entity`);
  }

  assert.deepEqual(contract.public_private_boundary.public_articles_forbidden_fields, [
    "editorial_rank",
    "rank_policy",
    "selection_reasons",
    "demotion_reasons"
  ]);
  assert.equal(contract.watch_source_policy.internal_retention, "full");
  assert.equal(contract.watch_source_policy.public_surface, "digest_list_entry");
  assert.deepEqual(contract.trend_policy.public_states, ["hot", "active"]);
});

test("editorial classification contract rejects structural and semantic regressions", () => {
  const broken = structuredClone(contract);
  broken.homepage_tabs[0].id = "personal_score";
  broken.admission_targets.today_selected.max_items = 30;
  broken.github_policy.readme_insufficient.today_selected_allowed = true;
  broken.trend_policy.public_states.push("watching");

  const result = validateEditorialClassificationContract(broken, { rootDir });
  assert.equal(result.valid, false);
  assert(result.errors.some((error) => error.path === "/homepage_tabs"));
  assert(result.errors.some((error) => error.path === "/admission_targets/today_selected/max_items"));
  assert(result.errors.some((error) => error.path === "/github_policy/readme_insufficient/today_selected_allowed"));
  assert(result.errors.some((error) => error.path === "/trend_policy/public_states"));
});

test("golden editorial examples can enter selected and must-read targets without public demotions", async () => {
  const cases = await readFixture("golden-cases.json");
  for (const item of cases) {
    const decision = evaluateEditorialAdmission(contract, item);
    assert.equal(decision.targets.today_selected.eligible, item.expected.today_selected, item.id);
    assert.equal(decision.targets.must_read.eligible, item.expected.must_read, item.id);
    for (const reason of item.expected.selection_reasons) {
      assert(decision.selection_reasons.includes(reason), `${item.id} should select ${reason}`);
    }
    assert.deepEqual(decision.demotion_reasons, item.expected.demotion_reasons, item.id);
    if (item.expected.github_summary_mode) {
      assert.equal(decision.presentation.github_summary_mode, item.expected.github_summary_mode);
    }
  }
});

test("red-light editorial examples cannot backfill selected or must-read targets", async () => {
  const cases = await readFixture("red-light-cases.json");
  for (const item of cases) {
    const decision = evaluateEditorialAdmission(contract, item);
    assert.equal(decision.targets.today_selected.eligible, false, item.id);
    assert.equal(decision.targets.must_read.eligible, false, item.id);
    for (const reason of item.expected.demotion_reasons) {
      assert(decision.demotion_reasons.includes(reason), `${item.id} should demote ${reason}`);
    }
    if (Object.hasOwn(item.expected, "github_tab_allowed")) {
      assert.equal(decision.presentation.github_tab_allowed, item.expected.github_tab_allowed, item.id);
    }
    if (item.expected.github_summary_mode) {
      assert.equal(decision.presentation.github_summary_mode, item.expected.github_summary_mode, item.id);
    }
  }
});

test("unconfirmed high-signal major-company items require label and non-factualized title cues", () => {
  const good = {
    id: "unconfirmed-good",
    title: "线索显示 Nvidia 正评估新的推理服务定价",
    summary: "未确认高信号：线索显示 Nvidia 正评估新的推理服务定价，仍需等待官方或多源确认。",
    source_type: "media",
    event_type: "pricing_business",
    entities: ["nvidia"],
    verification_status: "unconfirmed_high_signal",
    public_label: "未确认高信号",
    evidence_level: "medium",
    source_count: 1,
    priority: "high"
  };
  const bad = {
    ...good,
    id: "unconfirmed-bad",
    title: "Nvidia 将调整推理服务定价",
    summary: "Nvidia 将调整推理服务定价。",
    public_label: undefined
  };

  const goodDecision = evaluateEditorialAdmission(contract, good);
  assert.equal(goodDecision.targets.today_selected.eligible, true);
  assert.equal(goodDecision.targets.must_read.eligible, true);
  assert(goodDecision.selection_reasons.includes("unconfirmed_high_signal_disclosed"));

  const badDecision = evaluateEditorialAdmission(contract, bad);
  assert.equal(badDecision.targets.today_selected.eligible, false);
  assert(badDecision.demotion_reasons.includes("unconfirmed_signal_missing_public_disclosure"));
  assert(badDecision.demotion_reasons.includes("unconfirmed_signal_factualized"));
});

async function readFixture(name) {
  const fixturePath = path.join(rootDir, "tests", "fixtures", "editorial-classification", name);
  return JSON.parse(await fs.readFile(fixturePath, "utf8"));
}
