---
name: e2e-testing
description: Load when a task needs durable Playwright E2E suites, Page Object Models, fixtures, CI browser tests, or flaky-test strategy; use webapp-testing for one-off local inspection.
license: MIT
---

# E2E Testing Patterns

Reuse the project's existing E2E runner and conventions. New projects default to Playwright. One test should prove one user outcome through the same controls and feedback a user sees.

## Behavior Contract

- Wait for the required heading, control, URL, status, or result; network silence and elapsed time are not readiness signals.
- Prefer role, label, and visible text locators. Use a test ID only when no stable user-facing locator exists.
- Keep setup deterministic and local. Reuse project fixtures, auth helpers, and data factories before adding another layer.
- Assert the outcome in the test, including loading, empty, error, permission, recovery, and destructive states when they matter.

```typescript
import { expect, test } from '@playwright/test'

test('filters items', async ({ page }) => {
  await page.goto('/items')
  await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible()
  await page.getByLabel('Search items').fill('alpha')
  await expect(page.getByRole('article').first()).toContainText(/alpha/i)
})
```

## Extraction Boundary

Use a page object only when several tests repeat the same stable navigation or interaction. Keep outcome assertions in the test; avoid generic base pages, wrappers for single locators, and a second fixture system.

Organize tests by user capability using the repository's current layout. Do not reorganize an established suite merely to match a template.

## Coverage And Configuration

Use a risk-based browser matrix. Start greenfield coverage with Chromium; add Firefox, WebKit, mobile viewports, or real devices only when product reach, browser-specific behavior, input mode, or accepted risk requires them.

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

Reuse the project's server command, base URL, reporters, retries, and CI entry point. Do not add a second report format or change CI unless the accepted task includes it.

## Flake Diagnosis

- Reproduce a suspected flake with the narrowest test and `--repeat-each`; retries collect evidence but do not prove stability.
- Replace ambiguous selectors and timing proxies with the exact visible precondition and outcome.
- Inspect trace, screenshot, video, console, and request evidence already captured by the runner before adding logging.
- Quarantine only with an owner, linked defect, and removal condition. Never let a skip become an undocumented pass.

## Safety

Do not run payment, wallet, or other critical flows against production, real money, or personal accounts. Use mocks, sandboxes, and disposable test data that the project already authorizes.

Browser coverage is evidence, not permission to publish, submit remote state, change credentials, or mutate production data.
