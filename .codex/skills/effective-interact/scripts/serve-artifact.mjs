#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 0,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") args.host = argv[++index];
    else if (arg === "--port") args.port = Number.parseInt(argv[++index], 10);
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!args.file) args.file = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.port) || args.port < 0 || args.port > 65535) {
    throw new Error("--port must be an integer between 0 and 65535.");
  }

  return args;
}

function usage() {
  return [
    "Usage: node skills/effective-interact/scripts/serve-artifact.mjs <artifact.html> [--host 127.0.0.1] [--port 0] [--json]",
    "",
    "Serves one generated artifact over localhost for in-app browser handoff.",
    "The server exposes only / and /<filename>; it does not serve the full workspace."
  ].join("\n");
}

function responseBody(filePath, url) {
  return {
    ok: true,
    file: filePath,
    url,
    pid: globalThis.process?.pid ?? null
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }

    if (!args.file) throw new Error("artifact file is required.");

    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact file not found: ${filePath}. Regenerate it before serving.`);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error(`Artifact path is not a file: ${filePath}`);

    const fileName = path.basename(filePath);
    const contentType = contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";

    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", "http://local.invalid");
      const normalizedPath = decodeURIComponent(requestUrl.pathname);
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end("Method Not Allowed");
        return;
      }

      if (normalizedPath !== "/" && normalizedPath !== `/${fileName}`) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not Found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      fs.createReadStream(filePath).pipe(response);
    });

    server.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });

    server.listen(args.port, args.host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : args.port;
      const url = `http://${args.host}:${port}/${encodeURIComponent(fileName)}`;
      const payload = responseBody(filePath, url);
      if (args.json) console.log(JSON.stringify(payload, null, 2));
      else console.log(`Serving ${pathToFileURL(filePath).href} at ${url}`);
    });

    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => {
        server.close(() => process.exit(0));
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

await main();
