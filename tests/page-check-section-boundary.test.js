import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

import { evaluateDailyPageChecklist } from "../src/page-checklist.js";

test("page checklist allows a news-card title that mentions a retired section label", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(`<!doctype html>
    <html data-render-mode="pre-rendered">
      <body>
        <header id="report-top" data-hero-mode="daily-report">2026-07-10</header>
        <main>
          <section id="section-track-industry">
            <h2>正文主线</h2>
            <article class="interactive-card">
              <h3>全球首个具身原生预训练模型发布，为机器人构建大脑</h3>
            </article>
          </section>
        </main>
      </body>
    </html>`);

  const result = await evaluateDailyPageChecklist(page, {
    reportDate: "2026-07-10",
    imageTimeoutMs: 200
  });
  const forbiddenSections = result.checks.find((check) => check.id === "forbidden_sections_absent");

  assert.equal(forbiddenSections?.ok, true, JSON.stringify(forbiddenSections));
});

test("page checklist still rejects an actual retired section label", async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.setContent(`<!doctype html>
    <html data-render-mode="pre-rendered">
      <body>
        <header id="report-top" data-hero-mode="daily-report">2026-07-10</header>
        <main><section><h2>模型发布</h2></section></main>
      </body>
    </html>`);

  const result = await evaluateDailyPageChecklist(page, {
    reportDate: "2026-07-10",
    imageTimeoutMs: 200
  });
  const forbiddenSections = result.checks.find((check) => check.id === "forbidden_sections_absent");

  assert.equal(forbiddenSections?.ok, false);
  assert.deepEqual(forbiddenSections?.details?.forbidden_hits, ["模型发布"]);
});
