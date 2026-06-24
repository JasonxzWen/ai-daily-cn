// Phase 3c: page checks are tiered — editorial weak-signal-card failures degrade
// (publish with disclosure); structural failures still hard-block.
//
// Run: node --test tests/page-check-tiering.test.js

import assert from "node:assert/strict";
import test from "node:test";
import { classifyDailyPageCheckResults } from "../src/page-checklist.js";

test("editorial weak-card page-check failure degrades, not blocks", () => {
  const results = [
    {
      checks: [
        { id: "report_date_visible", ok: true },
        { id: "community_cards_reader_facing", ok: false }
      ]
    }
  ];
  const c = classifyDailyPageCheckResults(results);
  assert.equal(c.ok, true, "no structural failure -> not blocking");
  assert.deepEqual(c.degraded_checks, ["community_cards_reader_facing"]);
  assert.deepEqual(c.degraded_sections, ["community_leads"]);
  assert.deepEqual(c.blocking_checks, []);
});

test("structural page-check failure still blocks", () => {
  const results = [
    {
      checks: [
        { id: "community_cards_reader_facing", ok: false },
        { id: "daily_report_hero", ok: false }
      ]
    }
  ];
  const c = classifyDailyPageCheckResults(results);
  assert.equal(c.ok, false);
  assert.deepEqual(c.blocking_checks, ["daily_report_hero"]);
});

test("hot blog reader-facing weakness degrades", () => {
  const c = classifyDailyPageCheckResults([{ checks: [{ id: "hot_blog_cards_reader_facing", ok: false }] }]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.degraded_sections, ["hot_blogs"]);
});

test("all checks pass -> ok with no degrade", () => {
  const c = classifyDailyPageCheckResults([{ checks: [{ id: "x", ok: true }, { id: "y", ok: true }] }]);
  assert.equal(c.ok, true);
  assert.deepEqual(c.degraded_checks, []);
  assert.deepEqual(c.blocking_checks, []);
});
