import fs from "node:fs/promises";
import path from "node:path";
import { defaultGeneratedAt } from "./time.js";

export async function assemblePrompt(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const promptDir = path.resolve(rootDir, options.promptDir || "prompts/ai-daily");
  const manifestPath = path.join(promptDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const reportDate = options.reportDate || new Date().toISOString().slice(0, 10);
  const generatedAt = options.generatedAt || defaultGeneratedAt();

  const parts = [];
  parts.push(`# ${manifest.name}`);
  parts.push("");
  parts.push(`生成日期：${reportDate}`);
  parts.push(`提示词组装时间：${generatedAt}`);
  parts.push("");

  for (const moduleName of manifest.modules) {
    const modulePath = path.join(promptDir, "modules", moduleName);
    const body = await fs.readFile(modulePath, "utf8");
    parts.push(body.trim());
    parts.push("");
  }

  parts.push("## 今日执行要求");
  parts.push("");
  parts.push(`- 今天的 \`report_date\` 使用 \`${reportDate}\`。`);
  parts.push("- 先把结构化日报草稿写入 `.tmp/daily-report.json`，再调用 `corepack pnpm run report:write -- .tmp/daily-report.json reports-data YYYY-MM-DD`。");
  parts.push("- 最终发布主产物是 `docs/reports/YYYY/MM/YYYY-MM-DD.html`。");
  parts.push("- 结构化数据写入 `reports-data/YYYY/MM/YYYY-MM-DD.json`，再由仓库工具渲染 HTML。");
  parts.push("- 公开日报 HTML 由 `.codex/skills/effective-interact` 以 `pre-rendered` 模式生成。");
  parts.push(`- 发布前必须通过 \`corepack pnpm run validate\` 和 \`corepack pnpm run publish:dry-run:daily -- --date ${reportDate}\`。`);
  parts.push("- 真实 commit/push 或 GitHub API 远端写入只有在用户已授权的发布命令中执行。");
  parts.push("- 真实发布后必须验证当日 GitHub Pages URL 返回 HTTP 200 且页面内容包含当日 `report_date`。");
  parts.push("- 最终回复必须单独列出“反思与自动化迭代建议”，内容来自 `self_check.optimization_suggestions`；没有建议时说明本轮无新增建议。");
  parts.push("");

  return `${parts.join("\n")}\n`;
}
