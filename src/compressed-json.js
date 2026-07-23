import fs from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";

export function encodeJsonArtifact(value, filePath = "") {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  return String(filePath).toLowerCase().endsWith(".json.gz")
    ? gzipSync(Buffer.from(serialized), { level: 9, mtime: 0 })
    : serialized;
}

export function decodeJsonArtifact(raw) {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const serialized = isGzipPayload(bytes)
    ? gunzipSync(bytes).toString("utf8")
    : bytes.toString("utf8");
  return JSON.parse(serialized);
}

export async function readJsonArtifact(filePath, fileSystem = fs) {
  return decodeJsonArtifact(await fileSystem.readFile(filePath));
}

export function isGzipPayload(raw) {
  return raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b;
}
