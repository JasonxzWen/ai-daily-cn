import os from "node:os";

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
  return platform === "win32" ? "corepack.cmd" : "corepack";
}

export function pnpmInvocationForArgs(args, options = {}) {
  const platform = options.platform || os.platform();
  if (platform !== "win32") {
    return {
      file: pnpmExecutable({ platform }),
      args: ["pnpm", ...args]
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
