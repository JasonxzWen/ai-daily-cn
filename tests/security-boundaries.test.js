import assert from "node:assert/strict";
import test from "node:test";

import { buildOccurrenceStore } from "../src/occurrence-store.js";
import { urlHostMatches } from "../src/public-url.js";
import { decodeXmlEntitiesOnce } from "../src/xml.js";

test("URL host matching accepts exact hosts and subdomains without trusting path or suffix lookalikes", () => {
  assert.equal(urlHostMatches("https://github.com/openai/codex", "github.com"), true);
  assert.equal(urlHostMatches("https://api.github.com/repos/openai/codex", "github.com"), true);
  assert.equal(urlHostMatches("https://api.github.com/repos/openai/codex", "github.com", { allowSubdomains: false }), false);
  assert.equal(urlHostMatches("https://github.com.evil.example/openai/codex", "github.com"), false);
  assert.equal(urlHostMatches("https://evil.example/github.com/openai/codex", "github.com"), false);
  assert.equal(urlHostMatches("https://notgithub.com/openai/codex", "github.com"), false);
});

test("XML entities decode exactly once", () => {
  assert.equal(
    decodeXmlEntitiesOnce("&amp;lt;script&amp;gt; &lt;strong&gt;ok&lt;/strong&gt; &#65; &#x42;"),
    "&lt;script&gt; <strong>ok</strong> A B"
  );
  assert.equal(decodeXmlEntitiesOnce("&#38;amp; &#x26;amp;"), "&amp; &amp;");
  assert.equal(decodeXmlEntitiesOnce("&#999999999;"), "&#999999999;");
});

test("occurrence summaries remove script and style blocks with spaced closing tags", () => {
  const store = buildOccurrenceStore({
    reportDate: "2026-07-15",
    generatedAt: "2026-07-15T00:00:00.000Z",
    sources: [{
      id: "security-boundary-source",
      name: "Security Boundary Source",
      url: "https://example.com/feed.xml",
      status: "checked"
    }],
    candidates: [{
      observation_id: "security-boundary-observation",
      source_id: "security-boundary-source",
      title: "Boundary test",
      url: "https://example.com/item",
      event_date: "2026-07-15",
      summary: "Before<script>alert(1)</script >After<style>.hidden{display:none}</style >Done"
    }]
  });

  assert.equal(store.occurrences[0].summary, "Before After Done");
});
