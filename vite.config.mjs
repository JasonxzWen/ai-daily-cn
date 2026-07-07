import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, "docs");

function serveDocsData() {
  return {
    name: "serve-docs-data",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = decodeURIComponent((req.url || "").split("?")[0] || "");
        if (!isPublicDataPath(pathname)) {
          next();
          return;
        }
        const filePath = path.resolve(docsDir, pathname.replace(/^\/+/, ""));
        const relative = path.relative(docsDir, filePath);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        try {
          const body = await fs.readFile(filePath);
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(body);
        } catch {
          next();
        }
      });
    }
  };
}

function isPublicDataPath(pathname) {
  return pathname === "/feed.json"
    || pathname === "/articles.json"
    || pathname === "/trends.json"
    || pathname.startsWith("/data/");
}

export default defineConfig({
  root: "web",
  base: "./",
  publicDir: false,
  plugins: [react(), tailwindcss(), serveDocsData()],
  build: {
    outDir: "../docs",
    emptyOutDir: false,
    assetsDir: "assets/app"
  },
  server: {
    host: "127.0.0.1"
  },
  preview: {
    host: "127.0.0.1"
  }
});
