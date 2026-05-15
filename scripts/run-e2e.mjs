import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const env = { ...process.env };
const localBrowsers = path.join(rootDir, ".tmp", "pw-browsers");

if (!env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localBrowsers)) {
  env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}

const child = spawn(process.execPath, ["tests/e2e/site.e2e.js"], {
  cwd: rootDir,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
