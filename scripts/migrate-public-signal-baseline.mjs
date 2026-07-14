#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { compareOccurrenceChronology } from "../src/occurrence-store.js";
import { buildPublicSignalArtifacts } from "../src/public-signals.js";
import { validateOccurrenceStore } from "../src/schema.js";

const args = parseArgs(process.argv.slice(2));
const rootDir = process.cwd();
const sourceDir = path.resolve(rootDir, args.source || "docs/signals");
const occurrenceRoot = path.resolve(rootDir, "reports-data/occurrences");
const outputDir = path.resolve(rootDir, args.out || "reports-data/occurrences/baseline-v1");
const manifestPath = path.resolve(rootDir, args.manifest || "reports-data/occurrence-baseline-manifest.json");

if (outputDir !== occurrenceRoot && !outputDir.startsWith(`${occurrenceRoot}${path.sep}`)) {
  throw new Error(`Baseline output must stay under ${occurrenceRoot}.`);
}

const sourceIndexPath = path.join(sourceDir, "index.json");
const sourceIndexBytes = await fs.readFile(sourceIndexPath);
const sourceIndex = JSON.parse(sourceIndexBytes.toString("utf8"));
const sourceItems = await readDeclaredSignalItems(sourceDir, sourceIndex);
assertUniqueIds(sourceItems);
if (sourceItems.length !== sourceIndex.total_count) {
  throw new Error(`Signal index declares ${sourceIndex.total_count} items but pages contain ${sourceItems.length}.`);
}

const stores = buildMonthlyStores(sourceItems, sourceIndex.generated_at);
const roundTrip = buildPublicSignalArtifacts({ occurrenceStores: stores });
assertRoundTrip(sourceItems, roundTrip.occurrences);

if (args.force) {
  await fs.rm(outputDir, { recursive: true, force: true });
} else if ((await listFiles(outputDir)).length > 0) {
  throw new Error(`Baseline output is not empty: ${outputDir}. Re-run with --force to replace it.`);
}
await fs.mkdir(outputDir, { recursive: true });

const fileRecords = [];
for (const store of stores) {
  const relativePath = `${store.report_date.slice(0, 7)}.json.gz`;
  const target = path.join(outputDir, relativePath);
  const json = `${JSON.stringify(store, null, 2)}\n`;
  const compressed = gzipSync(Buffer.from(json), { level: 9, mtime: 0 });
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, compressed);
  await fs.rename(temporary, target);
  fileRecords.push({
    path: path.relative(rootDir, target).split(path.sep).join("/"),
    report_date: store.report_date,
    occurrence_count: store.occurrence_count,
    sha256: sha256(compressed),
    compressed_bytes: compressed.length
  });
}

const manifest = {
  schema_version: 1,
  kind: "public_signal_occurrence_baseline",
  source: {
    path: path.relative(rootDir, sourceIndexPath).split(path.sep).join("/"),
    sha256: sha256(sourceIndexBytes),
    generated_at: sourceIndex.generated_at,
    occurrence_count: sourceItems.length
  },
  migration: {
    policy: "one_time_lossless_public_signal_to_occurrence_store",
    production_reads_legacy_artifacts: false,
    generated_at: sourceIndex.generated_at
  },
  files: fileRecords
};
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  source_count: sourceItems.length,
  store_count: stores.length,
  output_dir: outputDir,
  manifest_path: manifestPath,
  compressed_bytes: fileRecords.reduce((sum, item) => sum + item.compressed_bytes, 0)
}, null, 2)}\n`);

async function readDeclaredSignalItems(baseDir, index) {
  const items = [];
  for (const group of Array.isArray(index.groups) ? index.groups : []) {
    let groupCount = 0;
    for (let pageNumber = 1; pageNumber <= Number(group.page_count || 0); pageNumber += 1) {
      const pagePath = path.join(baseDir, group.id, `page-${String(pageNumber).padStart(3, "0")}.json`);
      const page = JSON.parse(await fs.readFile(pagePath, "utf8"));
      if (page.group?.id !== group.id || page.page !== pageNumber || page.total_count !== group.count) {
        throw new Error(`Signal page metadata does not match index: ${pagePath}.`);
      }
      const pageItems = Array.isArray(page.items) ? page.items : [];
      groupCount += pageItems.length;
      items.push(...pageItems);
    }
    if (groupCount !== group.count) {
      throw new Error(`Signal group ${group.id} declares ${group.count} items but pages contain ${groupCount}.`);
    }
  }
  return items;
}

function buildMonthlyStores(items, generatedAt) {
  const groups = new Map();
  for (const item of items) {
    const month = String(item.event_date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error(`Signal item ${item.id || "(unknown)"} has no migratable event month.`);
    }
    const group = groups.get(month) || [];
    group.push(toStoredOccurrence(item));
    groups.set(month, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, occurrences]) => {
      occurrences.sort(compareOccurrenceChronology);
      const store = {
        schema_version: 1,
        kind: "occurrence_store",
        report_date: `${month}-01`,
        generated_at: generatedAt,
        input_record_count: occurrences.length,
        occurrence_count: occurrences.length,
        coalesced_record_count: 0,
        normalization_error_count: 0,
        normalization_errors: [],
        occurrences
      };
      const validation = validateOccurrenceStore(store);
      if (!validation.valid) {
        throw new Error(`Migrated occurrence store ${month} is invalid: ${JSON.stringify(validation.errors.slice(0, 10))}`);
      }
      return validation.value;
    });
}

function toStoredOccurrence(item) {
  return {
    id: item.id,
    observation_id: `baseline:${item.id}`,
    raw_record_count: 1,
    cluster_id: item.cluster_id,
    title: item.title,
    url: item.url,
    summary: item.summary ?? null,
    publisher_hint: item.publisher?.name || new URL(item.url).hostname,
    collector: {
      name: item.collected_via?.name || item.publisher?.name || new URL(item.url).hostname,
      url: item.collected_via?.url || item.publisher?.home_url || new URL(item.url).origin,
      health: item.source_health || "unknown",
      category: item.source_group || null
    },
    raw_content_kind: "historical_signal",
    raw_source_level: null,
    raw_verification_status: null,
    raw_credibility_tag: item.credibility_tag || null,
    raw_content_category: null,
    raw_source_group: item.source_group || null,
    raw_tags: Array.isArray(item.content_tags) ? [...item.content_tags] : [],
    author: item.author ?? null,
    handle: item.handle ?? null,
    original_text: item.original_text ?? null,
    event_date: item.event_date,
    published_at: item.published_at ?? null,
    collected_at: item.collected_at,
    date_anomaly: item.date_anomaly ?? null,
    image_url: item.image_url ?? null,
    access_state: item.access_state || "unknown"
  };
}

function assertRoundTrip(sourceItems, projectedItems) {
  const projectedById = new Map(projectedItems.map((item) => [item.id, item]));
  if (projectedById.size !== sourceItems.length) {
    throw new Error(`Round-trip cardinality changed from ${sourceItems.length} to ${projectedById.size}.`);
  }
  for (const sourceItem of sourceItems) {
    const projected = projectedById.get(sourceItem.id);
    const expected = { ...sourceItem };
    delete expected.record_origin;
    if (!projected || JSON.stringify(projected) !== JSON.stringify(expected)) {
      throw new Error(`Round-trip changed public signal ${sourceItem.id}.`);
    }
  }
}

function assertUniqueIds(items) {
  const ids = items.map((item) => item?.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error("Signal baseline requires unique non-empty occurrence IDs.");
  }
}

async function listFiles(directory) {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--force") {
      result.force = true;
      continue;
    }
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = values[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`${value} requires a value.`);
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
