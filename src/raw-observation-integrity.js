import { createHash } from "node:crypto";

import { aifyCanonicalPayloadProjection } from "./aify-today-picks.js";

export function rawMaterialUrlHash(value) {
  return sha256(String(value || ""));
}

export function rawObservationContentHash(observation) {
  return sha256(stableJson({
    title: observation?.title,
    excerpt: observation?.excerpt ?? null,
    excerpt_origin: observation?.excerpt_origin,
    excerpt_hash: observation?.excerpt_hash ?? null,
    material_url_hash: observation?.material_url_hash,
    event_date: observation?.event_date,
    author: observation?.author ?? null,
    handle: observation?.handle ?? null,
    upstream: upstreamContentProjection(observation?.upstream)
  }));
}

function upstreamContentProjection(upstream) {
  if (!upstream) return null;
  return {
    ...aifyCanonicalPayloadProjection(upstream),
    upstream_tags: upstream.upstream_tags,
    upstream_payload_hash: upstream.upstream_payload_hash
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(String(value || "")).digest("hex")}`;
}
