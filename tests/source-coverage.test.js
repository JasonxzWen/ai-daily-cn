// Stage A: guard that the headline-lab engineering/research sources and the
// individual-builder blog class are registered as monitored content sources.
// Prevents silent removal/downgrade of the sources the maintainer explicitly
// requires (anthropic /engineering + /research, openai research, deepmind
// research) and the builder-blog catch-net.
//
// Run: node --test tests/source-coverage.test.js

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfgPath = path.join(__dirname, "..", "config", "sources", "default-content-sources.json");
const sources = JSON.parse(fs.readFileSync(cfgPath, "utf8")).sources;
const byId = new Map(sources.map((s) => [s.id, s]));
const sourceDir = path.join(__dirname, "..", "config", "sources");
const allSources = fs.readdirSync(sourceDir)
  .filter((name) => name.endsWith(".json"))
  .flatMap((name) => JSON.parse(fs.readFileSync(path.join(sourceDir, name), "utf8")).sources || []);
const allById = new Map(allSources.map((s) => [s.id, s]));

test("headline-lab engineering/research sources are monitored as core T0 primary", () => {
  const required = [
    ["content-anthropic-engineering", "/engineering/"],
    ["content-anthropic-research", "/research/"]
  ];
  for (const [id, linkPattern] of required) {
    const s = byId.get(id);
    assert.ok(s, `${id} must be a registered content source`);
    assert.equal(s.tier, "T0", `${id} must be T0`);
    assert.equal(s.authority, "primary", `${id} must be primary authority`);
    assert.equal(s.enablement, "core", `${id} must be core (always checked)`);
    assert.equal(s.source_kind, "html_index", `${id} must be html_index (no RSS)`);
    assert.equal(s.linkPattern, linkPattern, `${id} linkPattern`);
  }
});

test("individual-builder blog class is registered (catch-net for practitioner posts)", () => {
  const builders = sources.filter((s) => /^content-builder-/.test(s.id));
  assert.ok(builders.length >= 2, "at least two individual-builder blog sources");
  for (const s of builders) {
    assert.equal(s.candidate_category, "hot_blog");
    assert.equal(s.authority, "secondary", `${s.id} individual builder = secondary authority`);
    assert.ok(["rss", "html_index"].includes(s.source_kind));
  }
});

test("handoff source plan registers official GitHub org feeds and removes placeholder platform routes", () => {
  const officialGithubOrgFeeds = [
    "content-github-openai-org",
    "content-github-anthropics-org",
    "content-github-google-deepmind-org",
    "content-github-meta-llama-org",
    "content-github-deepseek-ai-org",
    "content-github-qwenlm-org"
  ];
  for (const id of officialGithubOrgFeeds) {
    const source = allById.get(id);
    assert.ok(source, `${id} must be registered in config/sources`);
    assert.equal(source.source_kind, "rss", `${id} must use GitHub Atom/RSS semantics`);
    assert.match(source.url, /^https:\/\/github\.com\/.+\.atom$/i, `${id} must point at a GitHub organization Atom feed`);
    assert.equal(source.authority, "primary", `${id} must remain a first-party source`);
    assert.equal(source.verification_policy, "primary_allowed", `${id} should be usable as primary evidence`);
  }

  const removedPlaceholderRoutes = [
    "wechat-rsshub-newrank-template",
    "wechat-wechat2rss-feed",
    "platform-wechat-ai-feed",
    "platform-zhihu-rsshub-hotlist",
    "platform-zhihu-ai-feed",
    "platform-jike-rsshub-ai-topic",
    "platform-reddit-local-llama-feed"
  ];
  for (const id of removedPlaceholderRoutes) {
    assert.equal(allById.has(id), false, `${id} should not remain registered as an inactive placeholder source`);
  }
});

test("Wechat2RSS public feeds are registered as medium-trust Chinese AI leads", () => {
  const wechat2rssFeeds = [
    "wechat2rss-jiqizhixin",
    "wechat2rss-xinzhiyuan",
    "wechat2rss-qbitai",
    "wechat2rss-paperweekly",
    "wechat2rss-xixiaoyao",
    "wechat2rss-ml-beginner",
    "wechat2rss-cv-ai",
    "wechat2rss-datawhale",
    "wechat2rss-swarma",
    "wechat2rss-aliyun-developer",
    "wechat2rss-ali-tech",
    "wechat2rss-tencent-tech"
  ];

  for (const id of wechat2rssFeeds) {
    const source = allById.get(id);
    assert.ok(source, `${id} must be registered in config/sources`);
    assert.equal(source.source_kind, "rss", `${id} must use Wechat2RSS RSS output`);
    assert.equal(source.candidate_category, "community_lead", `${id} must stay in lead discovery`);
    assert.equal(source.tier, "T3", `${id} must remain a low-priority discovery tier`);
    assert.equal(source.authority, "intermediary", `${id} must not be treated as primary authority`);
    assert.equal(source.enablement, "optional", `${id} should run in default content discovery`);
    assert.equal(source.verification_policy, "primary_required", `${id} must require primary-source confirmation`);
    assert.equal(source.platform, "wechat", `${id} must be marked as a WeChat-derived feed`);
    assert.equal(source.source_level, "wechat2rss_medium_trust", `${id} must declare the medium-trust lane`);
    assert.match(source.url, /^https:\/\/wechat2rss\.xlab\.app\/feed\/[a-f0-9]+\.xml$/i, `${id} must point at a public Wechat2RSS feed`);
  }
});
