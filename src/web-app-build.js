import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { mergeCommandEnv, pnpmInvocationForArgs } from "./process-runner.js";

export const WEB_APP_GENERATED_FILES = [
  "index.html",
  "assets/adc-home.css",
  "assets/adc-home.js"
];

export async function buildWebApp(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outDir = path.resolve(rootDir, options.outDir || "docs");
  const packagePath = path.join(rootDir, "apps", "web", "package.json");
  const skipUnavailable = Boolean(options.skipUnavailable);

  if (!(await exists(packagePath))) {
    if (skipUnavailable) {
      return {
        ok: true,
        skipped: true,
        skipped_reason: "web_app_workspace_missing",
        outDir,
        writtenFiles: []
      };
    }
    throw new Error(`Web app workspace not found: ${packagePath}`);
  }

  const invocation = pnpmInvocationForArgs(["--filter", "@adc/web", "run", "build"]);
  await spawnChecked(invocation, {
    cwd: rootDir,
    env: mergeCommandEnv({ ADC_WEB_OUT_DIR: outDir }),
    forwardOutput: options.forwardOutput !== false
  });

  return {
    ok: true,
    skipped: false,
    outDir,
    writtenFiles: WEB_APP_GENERATED_FILES
  };
}

async function spawnChecked(invocation, options) {
  let output = "";
  await new Promise((resolve, reject) => {
    const child = spawn(invocation.file, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (options.forwardOutput) {
        process.stderr.write(chunk);
      }
    });

    child.stderr.on("data", (chunk) => {
      output += chunk;
      if (options.forwardOutput) {
        process.stderr.write(chunk);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`web app build exited with code ${code}`);
      error.code = code;
      error.output = output;
      reject(error);
    });
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
