# AI 日报 generation-first 改造计划（阶段 0）

> **归档说明（2026-07-14）：** 本文记录旧版遗留编辑报告的阶段 0 决策与当时问题，不再描述公共 signal listener 的现状。公共流无来源准入、enablement、kill switch、时间窗口或数量配额；当前合同见 `docs/ai-daily-source-expansion-spec.md` 和 `docs/ai-daily-source-integration-plan.md`。
>
> 状态：规划 + POC。配套规格见 `tasks/current-task.md`；红灯测试见 `tests/generation-first.test.js`。
> 唯一内容权威仍是 `prompts/ai-daily/modules/editorial-authority.md`。

## 1. 根因（一句话）

"AI 日报生成器"生成正文的环节里没有 AI。读者看到的标题/摘要/要点/翻译由 `src/draft.js` 的类别 switch + 正则 + 写死中文句拼成（`mainItem`/`mainItemBullets`/`mainItemScopeFactText`/`readerImpactForCandidate`），`src/` 全程无模型调用；LLM 只在事后 `codex_ai_repair_contract` 改个别字段。因此"AI 味 / 模板化 / 废话 / 不像人写"是架构必然，靠加事后门禁治不好。

## 2. 方向

generation-first，不是 gate-first：

- **作者层交还给 LLM**：从候选池一次性写出 8–12 条 story（标题、事实摘要、要点）、hot_blogs 摘要、builder 逐帖翻译。
- **确定性代码降级为基础设施**：采集、事实/链接校验、去重、媒体护栏、渲染、发布。
- **质量靠重写（generate→judge→regenerate），不靠正则黑名单 strip**。
- **验收打真实产物**：契约/测试跑当天 `reports-data`，不跑 `--self-test` 合成样例。

## 3. POC：同一份真实候选，模板 vs LLM 作者

数据来源：`2026-06-23` 定时任务真实候选池 `.tmp/source-candidates-2026-06-23.json` 与真实模板产物 `reports-data/2026/06/2026-06-23.json`（取自 cron run-worktree）。下表 LLM 列严格只用候选 `evidence` 原文，不编造。

### 3.1 主线 main_items

| 来源候选（真实 evidence） | 现在（模板生成，真实产物） | generation-first（LLM 作者） |
|---|---|---|
| Alibaba Cloud Blog：*AI Gateway FinOps Features Officially Launched — Making Every Token's Consumption "Visible and Controllable"*（LLM 成本治理 + token 配额管理） | 标题：**Alibaba Cloud披露模型能力和评估方法更新**（主题错配：和"模型能力评估"无关）<br>bullet：材料把模型能力和评估方法更新落到能力边界、评估设置、数据来源、使用场景和限制说明，已披露事实集中在… | 标题：**阿里云 AI Gateway 上线 FinOps，按 token 计量与配额管控 LLM 成本**<br>• 把每次 token 消耗做到"可见、可控"，面向 LLM 调用的成本治理与额度管理。<br>• 适合正在为多模型调用做成本归因/限额的平台与工程团队。<br>来源：Alibaba Cloud Blog（一手） |
| OpenAI News：*Samsung Electronics brings ChatGPT and Codex to employees*（全球员工部署 ChatGPT Enterprise + Codex，OpenAI 最大企业落地之一） | 标题：**OpenAI更新agent 工作流和开发工具能力**<br>bullet：材料把agent 工作流和开发工具能力落到任务编排、上下文、权限控制…（与 [5] 字节级相同） | 标题：**三星向全球员工部署 ChatGPT Enterprise 与 Codex，成 OpenAI 最大企业落地之一**<br>• 覆盖全球员工，是 OpenAI 迄今规模最大的企业 AI 推广之一。<br>• 信号：大型制造企业把编码 agent 纳入全员工作流。 |
| OpenAI News：*Daybreak: Tools for securing every organization*（Codex Security + GPT-5.5-Cyber，规模化发现/验证/修复漏洞） | 标题：**OpenAI更新agent 工作流和开发工具能力**<br>bullet：（与三星那条**完全相同**的通用句） | 标题：**OpenAI 发布 Daybreak 安全工具：Codex Security 与 GPT-5.5-Cyber**<br>• 面向组织安全，规模化发现、验证、修补漏洞。<br>• 含 Codex Security 与新模型 GPT-5.5-Cyber。 |
| OpenAI News：*Patch the Planet*（Daybreak 计划，AI+专家协助开源维护者修漏洞） | 标题：**OpenAI更新AI 产品、平台或工程实践**<br>bullet：材料把AI 产品、平台或工程实践落到功能变化… | 标题：**OpenAI "Patch the Planet"：AI+专家协助开源维护者修漏洞**<br>• Daybreak 计划帮助开源维护者发现、验证、修复漏洞。<br>• 机制：AI 初筛 + 专家复核。 |

要点：候选 evidence 本身是准确、可用的；模板层把它**抹平成错配的通用句**（FinOps 文章被标"模型能力评估"，两篇不同的 OpenAI 安全文章拿到**字节级相同**的 bullet）。LLM 列只是如实地把已有 evidence 写成人话。

### 3.2 Builder/X（真实产物 2026-06-17）

现状：8 条里 6 条是同一句伪翻译（"原帖围绕AI 工具和 agent 实践给出一条工程落地线索，重点是文件入口、版本历史…读者可把它作为 Builder/X 讨论信号…"），覆盖 5 个不同作者。generation-first：保留原帖原文 + 逐帖真实翻译，互不相同（红灯测试 REQ-GF-3 守住这条）。

## 4. 阶段化落地

- **阶段 0（本规格）**：契约 + 红灯测试（绑定真实 reports-data）+ POC + 实现规格。【本次交付】
- **阶段 1**：把 LLM 作者接进 `daily:run`——`report:draft` 产出"结构化候选 + 证据"，由 LLM 一次性写出完整 report JSON；模板降级为 LLM 不可用时的兜底；`codex_ai_repair_contract` 从主路径退为可选润色。
- **阶段 2**：门禁改造——`content:contract` 增 `--report` 真实产物入口；`feedback:validate` 必须对真实产物跑断言才允许 `implemented`；删除/合并 example-pinned 正则与重复规则（Builder/Top20 规则现散落 9–10 个 prompt 模块）。
- **阶段 3**：可靠性——质量门从"阻塞"改"降级照发"，无人值守优先发 `degraded`；稳定 real-publish + github-api 兜底。

## 5. 验收

- `node --test tests/generation-first.test.js` 由红转绿（对真实 `reports-data`）。
- 重新生成 `2026-06-23` 样例：主线 8–12 条、标题与来源主题一致、无跨条目复用 bullet、builder 逐帖不同。
- 不破坏既有 `corepack pnpm run test` 与发布链路。

## 6. 信源真问题（与作者层并行处理）

- 当时的微信/知乎入口还是占位地址，无法取得内容；当前实现改为公开可用入口或明确的 base URL / token / 网络访问状态，不能再以 kill switch 或来源分级跳过公共监听。
- link icon 靠 53 域名静态缓存，新源永远首字母：运行时解析+缓存，或接受现状。
- `~/.codex/automations/ai-daily/automation.toml` 在磁盘上是双重编码乱码（UTF-8→GBK→UTF-8），定时任务提示词本身是花的中文，建议重写为干净 UTF-8。
