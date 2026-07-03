#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { chromium } from "@playwright/test";
import { evaluateDailyPageChecklist, classifyDailyPageCheckResults } from "../src/page-checklist.js";

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const positional = positionalArgs(argv);
const inferred = inferPositionalArgs(positional);
const reportDate = args.date || firstDate(argv);
const rootDir = path.resolve(args["repo-root"] || process.cwd());
const outDir = path.resolve(rootDir, args.out || inferred.outDir || "docs");
const outputArg = args.output || inferred.outputPath;
const outputPath = outputArg ? path.resolve(rootDir, outputArg) : "";
const viewports = parseViewports(args.viewports || inferred.viewports || "1280x900,375x812");

if (!reportDate) {
  process.stderr.write("quality:page-check requires --date YYYY-MM-DD\n");
  process.exit(1);
}

const server = await startStaticServer(outDir);
const browser = await chromium.launch();
const results = [];
const publicReportData = await readPublicReportData(outDir, reportDate);
const expectedQualityStatus = String(publicReportData?.quality_status?.status || "").trim();

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const [year, month] = reportDate.split("-");
    await page.goto(`${server.url}/reports/${year}/${month}/${reportDate}.html`, { waitUntil: "domcontentloaded" });
    await eagerLoadImages(page);
    results.push(await evaluateDailyPageChecklist(page, { reportDate, expectedQualityStatus }));
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const classification = classifyDailyPageCheckResults(results);
const payload = {
  ok: classification.ok,
  blocking: !classification.ok,
  blocking_checks: classification.blocking_checks,
  degraded_checks: classification.degraded_checks,
  degraded_sections: classification.degraded_sections,
  report_date: reportDate,
  expected_quality_status: expectedQualityStatus,
  results
};
const json = `${JSON.stringify(payload, null, 2)}\n`;

if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, json, "utf8");
}

process.stdout.write(json);
if (!payload.ok) {
  process.exitCode = 1;
}

async function startStaticServer(root) {
  const normalizedRoot = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(normalizedRoot, ...pathname.split("/").filter(Boolean));

    if (filePath !== normalizedRoot && !filePath.startsWith(`${normalizedRoot}${path.sep}`)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const content = await fs.readFile(filePath);
      res.writeHead(200, { "content-type": contentType(filePath) });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: (callback) => server.close(callback)
  };
}

async function readPublicReportData(outDir, reportDate) {
  const [year, month] = reportDate.split("-");
  const dataPath = path.join(outDir, "data", year, month, `${reportDate}.json`);
  try {
    return JSON.parse(await fs.readFile(dataPath, "utf8"));
  } catch {
    return null;
  }
}

async function eagerLoadImages(page) {
  await page.evaluate(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (const image of document.images) {
      image.loading = "eager";
    }
    for (let y = 0; y <= document.documentElement.scrollHeight; y += Math.max(window.innerHeight, 1)) {
      window.scrollTo(0, y);
      await nextFrame();
    }
    window.scrollTo(0, 0);
    await nextFrame();
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
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

function firstDate(argv) {
  return argv.find((token) => /^\d{4}-\d{2}-\d{2}$/.test(token));
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

function inferPositionalArgs(positional) {
  const inferred = {
    outDir: "",
    outputPath: "",
    viewports: ""
  };
  const values = [...positional];
  const dateIndex = values.findIndex((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (dateIndex >= 0) {
    values.splice(dateIndex, 1);
  }

  for (const value of values) {
    const viewportList = normalizeViewportList(value);
    if (viewportList) {
      inferred.viewports = [inferred.viewports, viewportList].filter(Boolean).join(",");
      continue;
    }
    if (!inferred.outDir && !looksLikeJsonOutputPath(value)) {
      inferred.outDir = value;
      continue;
    }
    if (!inferred.outputPath) {
      inferred.outputPath = value;
    }
  }

  return inferred;
}

function normalizeViewportList(value) {
  const parts = String(value || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || !parts.every((part) => /^\d+x\d+$/.test(part))) {
    return "";
  }
  return parts.join(",");
}

function looksLikeJsonOutputPath(value) {
  return /\.json$/i.test(String(value || ""));
}

function parseViewports(value) {
  return String(value || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(\d+)x(\d+)$/.exec(part);
      if (!match) {
        throw new Error(`Invalid viewport: ${part}`);
      }
      return {
        width: Number.parseInt(match[1], 10),
        height: Number.parseInt(match[2], 10)
      };
    });
}
