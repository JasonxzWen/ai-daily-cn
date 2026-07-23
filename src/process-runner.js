import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function mergeCommandEnv(overrides = {}, options = {}) {
  const platform = options.platform || process.platform;
  const env = { ...(options.baseEnv || process.env) };
  const normalizedOverrides = overrides || {};

  if (platform === "win32") {
    for (const key of Object.keys(normalizedOverrides)) {
      for (const existingKey of Object.keys(env)) {
        if (existingKey !== key && existingKey.toLowerCase() === key.toLowerCase()) {
          delete env[existingKey];
        }
      }
    }
  }

  return { ...env, ...normalizedOverrides };
}

export function pnpmExecutable(options = {}) {
  const platform = options.platform || os.platform();
  if (platform === "win32") {
    return "corepack.cmd";
  }
  const corepackAvailable = options.corepackAvailable === undefined
    ? executableOnPath("corepack", options.env || process.env)
    : Boolean(options.corepackAvailable);
  return corepackAvailable ? "corepack" : "pnpm";
}

export function pnpmInvocationForArgs(args, options = {}) {
  const platform = options.platform || os.platform();
  if (platform !== "win32") {
    const executable = pnpmExecutable(options);
    return {
      file: executable,
      args: executable === "corepack" ? ["pnpm", ...args] : [...args]
    };
  }

  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", ["corepack", "pnpm", ...args.map(quoteCmdArg)].join(" ")]
  };
}

export function pnpmCommandText(args) {
  return `corepack pnpm ${args.join(" ")}`;
}

export function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t"&|<>^]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '\\"')}"`;
}

function executableOnPath(command, env) {
  const pathValue = String(env?.PATH || "");
  if (!pathValue) {
    return false;
  }
  return pathValue.split(path.delimiter).some((directory) => {
    try {
      fs.accessSync(path.join(directory || ".", command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
