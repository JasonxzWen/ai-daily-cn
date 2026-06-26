#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export function findBuildIntroducedDirtyFiles({ before, after }) {
  const beforePaths = new Set(parseGitStatusPaths(before));
  return parseGitStatusPaths(after)
    .filter((filePath) => !beforePaths.has(filePath))
    .sort();
}

export function parseGitStatusPaths(output) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const rawPath = line.length > 3 ? line.slice(3).trim() : "";
      const filePath = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1).trim() : rawPath;
      return filePath.replaceAll("\\", "/");
    })
    .filter(Boolean);
}

export async function runBuildCleanCheck(options = {}) {
  const cwd = options.cwd || process.cwd();
  const before = await gitStatus(cwd);
  await runBuild(cwd);
  const after = await gitStatus(cwd);
  const introduced = findBuildIntroducedDirtyFiles({ before, after });
  if (introduced.length > 0) {
    return {
      ok: false,
      introduced_dirty_files: introduced
    };
  }
  return {
    ok: true,
    introduced_dirty_files: []
  };
}

async function gitStatus(cwd) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
  return stdout;
}

async function runBuild(cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "src/cli.js",
      "build",
      "--data-input",
      "reports-data",
      "--input",
      "reports-source",
      "--out",
      "docs"
    ], {
      cwd,
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`build exited with code ${code}`);
      error.code = code;
      reject(error);
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runBuildCleanCheck();
  if (!result.ok) {
    console.error("Build introduced new dirty files:");
    for (const filePath of result.introduced_dirty_files) {
      console.error(`- ${filePath}`);
    }
    process.exitCode = 1;
  }
}
