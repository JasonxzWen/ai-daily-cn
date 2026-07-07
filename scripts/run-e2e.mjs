import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const env = { ...process.env };
const localBrowsers = path.join(rootDir, ".tmp", "pw-browsers");

if (!env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localBrowsers)) {
  env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}

const testFiles = [
  "tests/e2e/react-home.e2e.js",
  "tests/e2e/site.e2e.js"
];

for (const testFile of testFiles) {
  const result = await runTestFile(testFile);
  if (result.signal) {
    process.kill(process.pid, result.signal);
    break;
  }
  if (result.code !== 0) {
    process.exit(result.code ?? 1);
  }
}

function runTestFile(testFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [testFile], {
      cwd: rootDir,
      env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}
