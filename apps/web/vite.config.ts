import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.ADC_WEB_OUT_DIR
  ? path.resolve(process.env.ADC_WEB_OUT_DIR)
  : path.resolve(dirname, "../../docs");

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    manifest: false,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: "assets/adc-home.js",
        chunkFileNames: "assets/adc-home-[name].js",
        assetFileNames: (assetInfo) => {
          const assetName = typeof assetInfo.name === "string" ? assetInfo.name : "";
          if (assetName.endsWith(".css")) {
            return "assets/adc-home.css";
          }
          return "assets/[name][extname]";
        }
      }
    }
  }
});
