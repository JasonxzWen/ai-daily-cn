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

export function npmExecutable(options = {}) {
  const platform = options.platform || os.platform();
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function npmInvocationForArgs(args, options = {}) {
  const platform = options.platform || os.platform();
  if (platform !== "win32") {
    return {
      file: npmExecutable({ platform }),
      args
    };
  }

  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", ["npm", ...args.map(quoteCmdArg)].join(" ")]
  };
}

export function npmCommandText(args) {
  return `npm ${args.join(" ")}`;
}

export function quoteCmdArg(value) {
  const text = String(value);
  if (!/[ \t"&|<>^]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '\\"')}"`;
}
