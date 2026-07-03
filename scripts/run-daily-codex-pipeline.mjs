#!/usr/bin/env node
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_SANDBOX = "workspace-write";
const DEFAULT_WORK_DIR = path.join(".tmp", "daily-codex-pipeline");

export async function prepareDailyCodexPipeline(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredDate(options.reportDate || options.date);
  const workDir = path.resolve(rootDir, options.workDir || path.join(DEFAULT_WORK_DIR, reportDate));
  const admissionInputPath = options.admissionInputPath
    ? path.resolve(rootDir, options.admissionInputPath)
    : "";
  const admittedItems = admissionInputPath ? await loadAdmittedItems(admissionInputPath) : [];
  const includePlaceholderSummaries = Boolean(options.includePlaceholderSummaries);
  const publish = Boolean(options.publish);
  const plan = buildDailyCodexPipelinePlan({
    ...options,
    rootDir,
    reportDate,
    workDir,
    admittedItems,
    includePlaceholderSummaries,
    publish
  });

  await writePlanFiles(plan);
  return plan;
}

export function buildDailyCodexPipelinePlan(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const reportDate = requiredDate(options.reportDate || options.date);
  const workDir = path.resolve(rootDir, options.workDir || path.join(DEFAULT_WORK_DIR, reportDate));
  const codexBin = options.codexBin || defaultCodexBin();
  const sandbox = options.sandbox || DEFAULT_SANDBOX;
  const model = options.model || "";
  const npmBin = options.npmBin || "";
  const publish = Boolean(options.publish);
  const admittedItems = normalizeAdmittedItems(options.admittedItems || []);
  const summaryItems = admittedItems.length
    ? admittedItems
    : (options.includePlaceholderSummaries ? [placeholderSummaryItem(reportDate)] : []);
  const outputs = buildOutputs({ rootDir, workDir, reportDate });
  const codexOptions = { codexBin, rootDir, model, sandbox };
  const validationStages = [
    commandStage({
      id: "content-contract",
      title: "Run content contract",
      dependsOn: ["build"],
      workDir,
      command: npmCommand(["run", "content:contract"], npmBin),
      cwd: rootDir
    }),
    commandStage({
      id: "page-check",
      title: "Run browser page checklist",
      dependsOn: ["build"],
      workDir,
      command: npmCommand([
        "run",
        "quality:page-check",
        "--",
        "--date",
        reportDate,
        "--output",
        outputs.pageCheck
      ], npmBin),
      cwd: rootDir,
      outputPath: outputs.pageCheck
    })
  ];
  const publishStages = publish
    ? [
        commandStage({
          id: "publish-dry-run",
          title: "Validate daily publish plan",
          dependsOn: ["content-contract", "page-check"],
          workDir,
          command: npmCommand(["run", "publish:dry-run:daily", "--", "--date", reportDate], npmBin),
          cwd: rootDir
        }),
        commandStage({
          id: "publish",
          title: "Publish generated report",
          dependsOn: ["publish-dry-run"],
          workDir,
          command: npmCommand(["run", "publish", "--", "--date", reportDate, "--confirm-push", "--skip-pages-verify"], npmBin),
          fallbackCommand: npmCommand(["run", "publish:github-api", "--", "confirm-push", "--date", reportDate, "--skip-pages-verify"], npmBin),
          fallbackTitle: "Publish generated report through GitHub API fallback",
          cwd: rootDir
        }),
        commandStage({
          id: "pages-verify",
          title: "Verify published Pages URL",
          dependsOn: ["publish"],
          workDir,
          command: npmCommand(["run", "publish:verify-pages", "--", "--date", reportDate], npmBin),
          cwd: rootDir,
          allowFailure: true
        })
      ]
    : [];
  const stages = [
    codexStage({
      id: "collect",
      title: "Collect raw candidates",
      promptPath: path.join(workDir, "prompts", "01-collect.md"),
      outputPath: outputs.candidates,
      lastMessagePath: path.join(workDir, "logs", "01-collect.last-message.md"),
      eventsPath: path.join(workDir, "logs", "01-collect.events.jsonl"),
      stderrPath: path.join(workDir, "logs", "01-collect.stderr.log"),
      prompt: buildCollectPrompt({ reportDate, rootDir, outputs }),
      ...codexOptions
    }),
    codexStage({
      id: "admit",
      title: "Admit report-worthy items",
      dependsOn: ["collect"],
      promptPath: path.join(workDir, "prompts", "02-admit.md"),
      outputPath: outputs.admission,
      lastMessagePath: path.join(workDir, "logs", "02-admit.last-message.md"),
      eventsPath: path.join(workDir, "logs", "02-admit.events.jsonl"),
      stderrPath: path.join(workDir, "logs", "02-admit.stderr.log"),
      prompt: buildAdmitPrompt({ reportDate, outputs }),
      ...codexOptions
    }),
    ...summaryItems.map((item, index) => summaryStage({
      item,
      index,
      reportDate,
      outputs,
      workDir,
      codexOptions
    })),
    codexStage({
      id: "assemble",
      title: "Assemble structured report draft",
      dependsOn: ["admit", ...summaryItems.map((item) => `summarize:${item.id}`)],
      promptPath: path.join(workDir, "prompts", "90-assemble.md"),
      outputPath: outputs.draftReport,
      lastMessagePath: path.join(workDir, "logs", "90-assemble.last-message.md"),
      eventsPath: path.join(workDir, "logs", "90-assemble.events.jsonl"),
      stderrPath: path.join(workDir, "logs", "90-assemble.stderr.log"),
      prompt: buildAssemblePrompt({ reportDate, outputs }),
      ...codexOptions
    }),
    commandStage({
      id: "quality-review",
      title: "Review draft quality",
      dependsOn: ["assemble"],
      workDir,
      command: npmCommand([
        "run",
        "quality:review",
        "--",
        "--date",
        reportDate,
        "--input",
        outputs.draftReport,
        "--candidate-pool",
        outputs.candidates,
        "--output",
        outputs.qualityReview,
        "--fail-on-issues"
      ], npmBin),
      cwd: rootDir,
      outputPath: outputs.qualityReview
    }),
    commandStage({
      id: "write-report",
      title: "Normalize report JSON",
      dependsOn: ["quality-review"],
      workDir,
      command: npmCommand([
        "run",
        "report:write",
        "--",
        outputs.draftReport,
        "reports-data",
        reportDate,
        "--candidate-pool",
        outputs.candidates
      ], npmBin),
      cwd: rootDir
    }),
    commandStage({
      id: "sources-phase5-audit",
      title: "Audit source run history",
      dependsOn: ["write-report"],
      workDir,
      command: npmCommand([
        "run",
        "sources:phase5-audit",
        "--",
        "--date",
        reportDate,
        "--history-dir",
        "reports-data",
        "--days",
        "3",
        "--output",
        outputs.sourcePhase5Audit
      ], npmBin),
      cwd: rootDir,
      outputPath: outputs.sourcePhase5Audit
    }),
    commandStage({
      id: "build",
      title: "Build static site",
      dependsOn: ["sources-phase5-audit"],
      workDir,
      command: npmCommand(["run", "build"], npmBin),
      cwd: rootDir
    }),
    ...validationStages,
    ...publishStages
  ];

  return {
    version: 1,
    report_date: reportDate,
    root_dir: rootDir,
    work_dir: workDir,
    codex: {
      bin: codexBin,
      model,
      sandbox,
      ephemeral: true,
      independent_context_per_stage: true
    },
    npm: {
      bin: npmBin || defaultNpmBin()
    },
    publish: {
      enabled: publish,
      fallback: publish ? "publish:github-api" : ""
    },
    outputs,
    stages
  };
}

export async function runDailyCodexPipeline(initialPlan, options = {}) {
  let plan = initialPlan;
  const completedStages = [];
  await writeRunSummary(plan, {
    final_status: "running",
    next_action: { kind: "none" },
    completedStages
  });

  const runAndRecord = async (stage) => {
    const result = await runStage(stage, options);
    completedStages.push(await stageResultSummary(stage, result));
    await writeRunSummary(plan, {
      final_status: "running",
      next_action: { kind: "none" },
      completedStages
    });
  };

  try {
    await runAndRecord(plan.stages.find((stage) => stage.id === "collect"));
    await runAndRecord(plan.stages.find((stage) => stage.id === "admit"));

    const admittedItems = await loadAdmittedItems(plan.outputs.admission);
    plan = buildDailyCodexPipelinePlan({
      rootDir: plan.root_dir,
      reportDate: plan.report_date,
      workDir: plan.work_dir,
      codexBin: plan.codex.bin,
      model: plan.codex.model,
      sandbox: plan.codex.sandbox,
      npmBin: plan.npm.bin,
      publish: Boolean(plan.publish?.enabled),
      admittedItems
    });
    await writePlanFiles(plan);

    for (const stage of plan.stages) {
      if (stage.id === "collect" || stage.id === "admit") continue;
      await runAndRecord(stage);
    }

    const finalOutcome = finalPipelineOutcome(plan, completedStages);
    await writeRunSummary(plan, {
      final_status: finalOutcome.final_status,
      next_action: finalOutcome.next_action,
      completedStages
    });
    return plan;
  } catch (error) {
    await writeRunSummary(plan, {
      final_status: "blocked",
      next_action: {
        kind: "inspect_pipeline_stage_failure",
        stage_id: error.stage_id || "",
        summary_path: plan.outputs.runSummary,
        message: error.message
      },
      completedStages,
      error
    });
    throw error;
  }
}

export async function loadAdmittedItems(inputPath) {
  const content = await fs.readFile(inputPath, "utf8");
  return normalizeAdmittedItems(extractAdmittedItems(JSON.parse(content)));
}

async function writePlanFiles(plan) {
  await fs.mkdir(plan.work_dir, { recursive: true });
  await Promise.all(plan.stages.map(async (stage) => {
    if (!stage.prompt_path || !stage.prompt) return;
    await fs.mkdir(path.dirname(stage.prompt_path), { recursive: true });
    await fs.writeFile(stage.prompt_path, stage.prompt, "utf8");
    if (stage.item_path && stage.item) {
      await fs.mkdir(path.dirname(stage.item_path), { recursive: true });
      await fs.writeFile(stage.item_path, `${JSON.stringify(stage.item.raw || stage.item, null, 2)}\n`, "utf8");
    }
  }));
  await fs.writeFile(path.join(plan.work_dir, "pipeline-plan.json"), `${JSON.stringify(publicPlan(plan), null, 2)}\n`, "utf8");
}

async function writeRunSummary(plan, options = {}) {
  const error = options.error || null;
  const summary = {
    report_date: plan.report_date,
    mode: "codex_pipeline",
    final_status: options.final_status || "running",
    next_action: options.next_action || { kind: "none" },
    pipeline_plan_path: path.join(plan.work_dir, "pipeline-plan.json"),
    work_dir: plan.work_dir,
    outputs: plan.outputs,
    publish: plan.publish || { enabled: false, fallback: "" },
    completed_stages: options.completedStages || [],
    failed_stage_id: error?.stage_id || "",
    error: error ? {
      message: error.message,
      code: error.code || "",
      stage_id: error.stage_id || ""
    } : null,
    updated_at: new Date().toISOString()
  };
  await fs.mkdir(path.dirname(plan.outputs.runSummary), { recursive: true });
  await fs.writeFile(plan.outputs.runSummary, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

async function stageResultSummary(stage, result = {}) {
  const stdoutPath = result.fallback_used ? stage.fallback_stdout_path : (stage.stdout_path || stage.events_path || "");
  const stderrPath = result.fallback_used ? stage.fallback_stderr_path : (stage.stderr_path || "");
  return {
    id: stage.id,
    kind: stage.kind,
    ok: result.ok !== false,
    allowed_failure: Boolean(result.allowed_failure),
    fallback_used: Boolean(result.fallback_used),
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    output_path: stage.output_path || "",
    error: result.error ? {
      message: result.error.message,
      code: result.error.code || ""
    } : null,
    result_json: await readStageJson({ stdoutPath, outputPath: stage.output_path || "" })
  };
}

function finalPipelineOutcome(plan, completedStages = []) {
  if (!plan.publish?.enabled) {
    return { final_status: "generated_only", next_action: { kind: "none" } };
  }
  const pagesVerify = completedStages.find((stage) => stage.id === "pages-verify");
  if (pagesVerify && (pagesVerify.ok === false || !pagesVerify.result_json || pagesVerify.result_json?.ok === false || pagesVerify.result_json?.verification_error)) {
    return {
      final_status: "published_pending_pages_verification",
      next_action: {
        kind: "verify_pages_later",
        stage_id: "pages-verify",
        summary_path: plan.outputs.runSummary,
        report_date: plan.report_date,
        message: "Repository publish completed, but Pages verification did not confirm the live page yet."
      }
    };
  }
  return { final_status: "published", next_action: { kind: "none" } };
}

async function validateCodexStageOutput(stage) {
  const outputPath = stage.output_path || "";
  if (!outputPath) {
    throw stageOutputError(stage, "missing_stage_output_path", "Codex stage has no output path.");
  }
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(outputPath, "utf8"));
  } catch (error) {
    throw stageOutputError(stage, "invalid_stage_output_json", `Codex stage did not write valid JSON to ${outputPath}: ${error.message}`);
  }
  const id = String(stage.id || "");
  if (id === "collect" && !Array.isArray(parsed.raw_candidates)) {
    throw stageOutputError(stage, "collect_candidates_required", "Collect stage output requires raw_candidates array.");
  }
  if (id === "admit" && !Array.isArray(parsed.accepted_items)) {
    throw stageOutputError(stage, "admission_items_required", "Admission stage output requires accepted_items array.");
  }
  if (id.startsWith("summarize:")) {
    const hasReaderCopy = Boolean(String(parsed.title || "").trim()) &&
      (Boolean(String(parsed.summary || "").trim()) || (Array.isArray(parsed.bullets) && parsed.bullets.some((item) => String(item || "").trim())));
    if (!parsed.insufficient_evidence && !hasReaderCopy) {
      throw stageOutputError(stage, "summary_reader_copy_required", "Summary stage output requires title plus summary or bullets, unless insufficient_evidence is true.");
    }
  }
  return parsed;
}

function stageOutputError(stage, code, message) {
  const error = new Error(message);
  error.code = code;
  error.stage_id = stage.id;
  return error;
}

async function runStage(stage) {
  if (!stage) {
    throw new Error("Missing pipeline stage");
  }
  try {
    if (stage.kind === "codex_exec") {
      await fs.mkdir(path.dirname(stage.events_path), { recursive: true });
      await fs.mkdir(path.dirname(stage.output_path), { recursive: true });
      const prompt = await fs.readFile(stage.prompt_path, "utf8");
      await spawnWithPrompt(stage.command[0], stage.command.slice(1), {
        cwd: stage.cwd,
        prompt,
        stdoutPath: stage.events_path,
        stderrPath: stage.stderr_path
      });
      await validateCodexStageOutput(stage);
      return { fallback_used: false, ok: true };
    }
    if (stage.kind === "command") {
      try {
        await spawnWithPrompt(stage.command[0], stage.command.slice(1), {
          cwd: stage.cwd,
          prompt: "",
          stdoutPath: stage.stdout_path,
          stderrPath: stage.stderr_path
        });
        return { fallback_used: false, ok: true };
      } catch (error) {
        if (stage.allow_failure) {
          return { fallback_used: false, ok: false, allowed_failure: true, error };
        }
        if (!stage.fallback_command) {
          throw error;
        }
        await spawnWithPrompt(stage.fallback_command[0], stage.fallback_command.slice(1), {
          cwd: stage.cwd,
          prompt: "",
          stdoutPath: stage.fallback_stdout_path,
          stderrPath: stage.fallback_stderr_path
        });
        return { fallback_used: true, fallback_command: stage.fallback_command, ok: true };
      }
    }
    throw new Error(`Unsupported stage kind: ${stage.kind}`);
  } catch (error) {
    error.stage_id = error.stage_id || stage.id;
    throw error;
  }
}

async function spawnWithPrompt(command, args, options) {
  await fs.mkdir(path.dirname(options.stdoutPath), { recursive: true });
  await fs.mkdir(path.dirname(options.stderrPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const stdout = fsSync.createWriteStream(options.stdoutPath, { flags: "a" });
    const stderr = fsSync.createWriteStream(options.stderrPath, { flags: "a" });
    const stdoutFinished = finished(stdout);
    const stderrFinished = finished(stderr);
    let settled = false;
    const settle = (handler) => {
      if (settled) return;
      settled = true;
      handler();
    };
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: shouldUseShell(command)
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on("error", (error) => {
      stdout.destroy();
      stderr.destroy();
      settle(() => reject(error));
    });
    child.on("close", async (code) => {
      try {
        await Promise.all([stdoutFinished, stderrFinished]);
      } catch (error) {
        settle(() => reject(error));
        return;
      }
      settle(() => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
        }
      });
    });
    if (options.prompt) {
      child.stdin.end(options.prompt);
    } else {
      child.stdin.end();
    }
  });
}

function summaryStage({ item, index, reportDate, outputs, workDir, codexOptions }) {
  const itemPath = path.join(workDir, "summary-inputs", `${pad2(index + 1)}-${item.id}.json`);
  const outputPath = path.join(outputs.summariesDir, `${pad2(index + 1)}-${item.id}.json`);
  const promptPath = path.join(workDir, "prompts", `10-summary-${pad2(index + 1)}-${item.id}.md`);
  return codexStage({
    id: `summarize:${item.id}`,
    title: `Summarize ${item.title || item.id}`,
    dependsOn: ["admit"],
    item,
    item_path: itemPath,
    promptPath,
    outputPath,
    lastMessagePath: path.join(workDir, "logs", `10-summary-${pad2(index + 1)}-${item.id}.last-message.md`),
    eventsPath: path.join(workDir, "logs", `10-summary-${pad2(index + 1)}-${item.id}.events.jsonl`),
    stderrPath: path.join(workDir, "logs", `10-summary-${pad2(index + 1)}-${item.id}.stderr.log`),
    prompt: buildSummaryPrompt({ reportDate, item, itemPath, outputPath }),
    ...codexOptions
  });
}

function codexStage({ id, title, dependsOn = [], promptPath, outputPath, lastMessagePath, eventsPath, stderrPath, prompt, item, item_path: itemPath, codexBin, rootDir, model, sandbox }) {
  const command = [
    codexBin,
    "exec",
    "--ephemeral",
    "--json",
    "-C",
    rootDir,
    "--sandbox",
    sandbox,
    "--output-last-message",
    lastMessagePath
  ];
  if (model) {
    command.push("--model", model);
  }
  command.push("-");
  return {
    id,
    title,
    kind: "codex_exec",
    depends_on: dependsOn,
    cwd: rootDir,
    command,
    prompt_path: promptPath,
    output_path: outputPath,
    last_message_path: lastMessagePath,
    events_path: eventsPath,
    stderr_path: stderrPath,
    prompt,
    ...(item ? { item } : {}),
    ...(itemPath ? { item_path: itemPath } : {})
  };
}

function commandStage({ id, title, dependsOn = [], command, fallbackCommand = null, fallbackTitle = "", cwd, workDir, outputPath = "", allowFailure = false }) {
  const base = workDir || path.join(cwd, DEFAULT_WORK_DIR);
  return {
    id,
    title,
    kind: "command",
    depends_on: dependsOn,
    cwd,
    command,
    output_path: outputPath,
    allow_failure: allowFailure,
    stdout_path: path.join(base, "logs", `${id}.stdout.log`),
    stderr_path: path.join(base, "logs", `${id}.stderr.log`),
    ...(fallbackCommand ? {
      fallback_title: fallbackTitle,
      fallback_command: fallbackCommand,
      fallback_stdout_path: path.join(base, "logs", `${id}.fallback.stdout.log`),
      fallback_stderr_path: path.join(base, "logs", `${id}.fallback.stderr.log`)
    } : {})
  };
}

function buildOutputs({ rootDir, workDir, reportDate }) {
  const [year, month] = reportDate.split("-");
  return {
    candidates: path.join(workDir, "01-candidates.json"),
    admission: path.join(workDir, "02-admission.json"),
    summariesDir: path.join(workDir, "summaries"),
    draftReport: path.join(workDir, "90-daily-report-draft.json"),
    qualityReview: path.join(workDir, "91-quality-review.json"),
    sourcePhase5Audit: path.join(workDir, "91-source-phase5-audit.json"),
    pageCheck: path.join(workDir, "92-page-check.json"),
    runSummary: path.join(rootDir, ".tmp", `run-summary-${reportDate}.json`),
    reportData: path.join(rootDir, "reports-data", year, month, `${reportDate}.json`),
    reportHtml: path.join(rootDir, "docs", "reports", year, month, `${reportDate}.html`)
  };
}

function buildCollectPrompt({ reportDate, rootDir, outputs }) {
  return `你是 AI 日报的信息收集阶段。只收集事实候选，不做公开文案，不判断入选，不写摘要。

工作目录：${rootDir}
目标日期：${reportDate}
输出文件：${outputs.candidates}

请在完全独立上下文内完成：
1. 运行仓库已有 discovery/source health 命令，优先使用 npm scripts，不修改 product files。
2. 合并候选为 JSON，保留每条候选的 title、url、source、event_date、source_level、verification_status、raw_text、evidence、section_hint。
3. 记录命令、失败、跳过原因和源健康状态。
4. 不要写“为什么值得看”“发生了什么”“入选理由”这类公开文案。

输出必须写入 ${outputs.candidates}，JSON 顶层格式：
{
  "report_date": "${reportDate}",
  "stage": "collect",
  "commands": [],
  "raw_candidates": [],
  "source_audit": {},
  "warnings": []
}
`;
}

function buildAdmitPrompt({ reportDate, outputs }) {
  return `你是 AI 日报的信息准入阶段。只判断候选是否值得进入日报，不写公开摘要，不润色标题。

输入候选文件：${outputs.candidates}
输出准入文件：${outputs.admission}
目标日期：${reportDate}

请在完全独立上下文内完成：
1. 读取候选池，只根据事实新鲜度、来源可信度、读者价值、重复度、风险边界做准入。
2. 输出 accepted_items 和 rejected_items。准入理由只能放在 internal_admission_reason，不能作为公开文案。
3. 每个 accepted item 必须保留 candidate_id、title、url、source_label、section、evidence_refs。
4. 不要写“发生了什么”“为什么值得看”“今天最值得看”“信号集中在”等公开摘要或模板句。

输出必须写入 ${outputs.admission}，JSON 顶层格式：
{
  "report_date": "${reportDate}",
  "stage": "admit",
  "accepted_items": [],
  "rejected_items": [],
  "internal_notes": []
}
`;
}

function buildSummaryPrompt({ reportDate, item, itemPath, outputPath }) {
  return `你是 AI 日报的单条新闻概括阶段。你只处理一个已准入条目，必须面向读者写可发布内容。

目标日期：${reportDate}
条目输入文件：${itemPath}
条目输出文件：${outputPath}

待概括条目：
${JSON.stringify(item, null, 2)}

写作规则：
1. 信息准入已经完成；不要解释为什么入选，不要写来源审计、候选池、权限边界、后续部署边界。
2. 用 story-first 方式写：标题要说清楚发生了什么，正文用 2-3 条中文 bullet 交代事实、变化、限制、适用对象或影响。
3. 每条 bullet 都要给读者信息增量，不能写“为什么值得看”“发生了什么：”“更有价值的信息是”“可用于比较”“接口形态”等后台判断话术。
4. GitHub/Hugging Face 项目必须说明它是什么、解决什么问题、适合谁看；不能只复读 repo slug。
5. 如果证据不足，明确写 insufficient_evidence=true，并说明缺什么，不要编造。

输出必须写入 ${outputPath}，JSON 顶层格式：
{
  "candidate_id": "${item.id}",
  "title": "",
  "summary": "",
  "bullets": [],
  "source": { "label": "", "url": "" },
  "insufficient_evidence": false,
  "evidence_notes": []
}
`;
}

function buildAssemblePrompt({ reportDate, outputs }) {
  return `你是 AI 日报的结构化组装阶段。准入和逐条概括已经独立完成；你只把这些结果装配成 report draft JSON。

目标日期：${reportDate}
候选文件：${outputs.candidates}
准入文件：${outputs.admission}
逐条摘要目录：${outputs.summariesDir}
输出草稿：${outputs.draftReport}

规则：
1. 不要重新判断准入，不要重写逐条摘要。只在 schema 必需时做字段映射。
2. public summary 必须从已发布条目的读者摘要归纳，不能写候选池、来源审计、入选理由。
3. stories/main_items 用已准入条目和逐条 summary/bullets 填充；source audit 留在内部结构字段。
4. hot_blogs summary 保持 100-200 个中文字符；GitHub/Hugging Face description 保持项目用途说明。
5. 输出必须能交给 npm run report:write 标准化。

输出必须写入 ${outputs.draftReport}。
`;
}

function extractAdmittedItems(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["accepted_items", "admitted_items", "included_items", "items", "stories", "main_items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [];
}

function normalizeAdmittedItems(items) {
  return items
    .filter((item) => item && item.rejected !== true && item.accepted !== false && item.status !== "rejected")
    .map((item, index) => {
      const rawId = item.candidate_id || item.id || item.url || item.title || `item-${index + 1}`;
      return {
        id: sanitizeFileName(rawId),
        candidate_id: item.candidate_id || item.id || "",
        title: item.title || item.name || "",
        url: item.url || item.source_url || "",
        source_label: item.source_label || item.publisher || item.source || "",
        section: item.section || item.included_in || item.section_hint || "",
        evidence_refs: item.evidence_refs || item.evidence || [],
        raw: item
      };
    });
}

function placeholderSummaryItem(reportDate) {
  return {
    id: "accepted-item-placeholder",
    candidate_id: "accepted-item-placeholder",
    title: `Accepted item placeholder for ${reportDate}`,
    url: "",
    source_label: "",
    section: "",
    evidence_refs: [],
    raw: {
      note: "Dry-run placeholder. Pass --admission-input to materialize one summary stage per accepted item."
    }
  };
}

function publicPlan(plan) {
  return {
    ...plan,
    stages: plan.stages.map((stage) => {
      const { prompt, ...publicStage } = stage;
      return publicStage;
    })
  };
}

function npmCommand(args, npmBin = "") {
  return [npmBin || defaultNpmBin(), ...args];
}

function defaultCodexBin() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function defaultNpmBin() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function shouldUseShell(command) {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(String(command || ""));
}

async function readStageJson({ stdoutPath = "", outputPath = "" } = {}) {
  for (const filePath of [outputPath, stdoutPath]) {
    if (!filePath) continue;
    try {
      const content = await fs.readFile(filePath, "utf8");
      const parsed = parseLastJsonObject(content);
      if (parsed) return parsed;
    } catch {
      // Stage JSON is best-effort summary metadata; logs remain authoritative.
    }
  }
  return null;
}

function parseLastJsonObject(text) {
  const input = String(text || "");
  let last = null;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] !== "{") continue;
    const candidate = balancedJsonObjectAt(input, index);
    if (!candidate) continue;
    try {
      last = JSON.parse(candidate);
    } catch {
      // Keep scanning for the last complete JSON object in mixed npm output.
    }
    index += candidate.length - 1;
  }
  return last;
}

function balancedJsonObjectAt(input, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(startIndex, index + 1);
      }
    }
  }
  return "";
}

function sanitizeFileName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/https?:\/\//gi, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "item";
}

function requiredDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    throw new Error("daily codex pipeline requires --date YYYY-MM-DD");
  }
  return value;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const equalIndex = token.indexOf("=");
    if (equalIndex > 2) {
      parsed[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function positionalArgs(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        index += 1;
      }
      continue;
    }
    values.push(token);
  }
  return values;
}

function firstDate(argv) {
  return argv.find((token) => /^\d{4}-\d{2}-\d{2}$/.test(token)) || "";
}

function firstNonDatePositional(argv) {
  return positionalArgs(argv).find((token) => !/^\d{4}-\d{2}-\d{2}$/.test(token) && !/^(execute|dry-run|plan-only)$/i.test(token)) || "";
}

function npmConfig(name) {
  return process.env[`npm_config_${name.replace(/-/g, "_")}`] || "";
}

function dateOption(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function stringOption(value) {
  const text = String(value || "");
  return /^(true|false)$/i.test(text) ? "" : text;
}

function truthy(value) {
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  let plan = null;
  try {
    const argv = process.argv.slice(2);
    const args = parseArgs(argv);
    const execute = truthy(args.execute) || truthy(npmConfig("execute")) || positionalArgs(argv).includes("execute");
    const publish = truthy(args.publish) || truthy(npmConfig("publish")) || positionalArgs(argv).includes("publish");
    const dryRunFlag = truthy(args["dry-run"]) || truthy(args["plan-only"]) || truthy(npmConfig("dry-run")) || truthy(npmConfig("plan-only")) || positionalArgs(argv).includes("dry-run") || positionalArgs(argv).includes("plan-only");
    const dryRun = Boolean(dryRunFlag || !execute);
    plan = await prepareDailyCodexPipeline({
      rootDir: args["repo-root"] || process.cwd(),
      reportDate: dateOption(args.date) || dateOption(npmConfig("date")) || firstDate(argv),
      workDir: stringOption(args["work-dir"]) || stringOption(npmConfig("work-dir")) || firstNonDatePositional(argv),
      codexBin: stringOption(args["codex-bin"]) || stringOption(npmConfig("codex-bin")) || defaultCodexBin(),
      npmBin: stringOption(args["npm-bin"]) || stringOption(npmConfig("npm-bin")),
      model: stringOption(args.model) || stringOption(npmConfig("model")) || "",
      sandbox: stringOption(args.sandbox) || stringOption(npmConfig("sandbox")) || DEFAULT_SANDBOX,
      publish,
      admissionInputPath: stringOption(args["admission-input"]) || stringOption(npmConfig("admission-input")),
      includePlaceholderSummaries: dryRun && !(stringOption(args["admission-input"]) || stringOption(npmConfig("admission-input")))
    });

    if (dryRun) {
      process.stdout.write(`${JSON.stringify({
        ok: true,
        dry_run: true,
        publish,
        plan_path: path.join(plan.work_dir, "pipeline-plan.json"),
        summary_path: plan.outputs.runSummary,
        work_dir: plan.work_dir,
        stages: plan.stages.map((stage) => ({ id: stage.id, kind: stage.kind, prompt_path: stage.prompt_path || "", output_path: stage.output_path || "" }))
      }, null, 2)}\n`);
    } else {
      const executedPlan = await runDailyCodexPipeline(plan);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        dry_run: false,
        publish,
        plan_path: path.join(executedPlan.work_dir, "pipeline-plan.json"),
        summary_path: executedPlan.outputs.runSummary,
        report_data: executedPlan.outputs.reportData,
        report_html: executedPlan.outputs.reportHtml
      }, null, 2)}\n`);
    }
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: error.code || "daily_codex_pipeline_failed",
      message: error.message,
      stage_id: error.stage_id || "",
      summary_path: plan?.outputs?.runSummary || ""
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
