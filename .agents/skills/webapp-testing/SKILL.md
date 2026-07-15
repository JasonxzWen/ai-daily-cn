---
name: webapp-testing
description: Load when a task needs one-off local web app inspection with Playwright, screenshots, console logs, or UI issue reproduction against a dev server; use e2e-testing for durable suites.
license: Complete terms in LICENSE.txt
---


# Web Application Testing

> Harness Hub adaptation: prefer the project's existing browser runner and user-visible readiness over fixed network or time waits.

Reuse the project's existing browser runner and conventions. When none exists and the bundled helper fits, write a small native Python Playwright script.

**Helper Scripts Available**:
- `scripts/with_server.py` - Manages server lifecycle (supports multiple servers)

**Always run scripts with `--help` first** to see usage. DO NOT read the source until you try running the script first and find that a customized solution is abslutely necessary. These scripts can be very large and thus pollute your context window. They exist to be called directly as black-box scripts rather than ingested into your context window.

## Decision Tree: Choosing Your Approach

```
User task ->Is it static HTML?
    +-- Yes -> Read HTML file directly to identify selectors
    |   +-- Success -> Write Playwright script using selectors
    |   +-- Fails/Incomplete -> Treat as dynamic (below)
    +-- No (dynamic webapp) -> Is the server already running?
        +-- No -> Run: python scripts/with_server.py --help
        |   Then use the helper + write simplified Playwright script
        +-- Yes -> Reconnaissance-then-action:
            1. Navigate and wait for the task's user-visible state
            2. Capture the screenshot, DOM, and relevant console output
            3. Identify selectors by role or label; use test IDs only as a fallback
            4. Execute actions and assert the resulting visible state
```

## Example: Using with_server.py

To start a server, run `--help` first, then use the helper:

**Single server:**
```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**Multiple servers (e.g., backend + frontend):**
```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

To create an automation script, include only Playwright logic (servers are managed automatically):
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:5173')
    page.get_by_role('heading', name='Dashboard').wait_for()
    # ... your automation logic
    browser.close()
```

## Reconnaissance-Then-Action Pattern

1. **Inspect rendered DOM**:
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   ```

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfall

Network inactivity is not proof that a dynamic app is ready: polling, sockets, and background requests may never settle. Wait for the exact heading, control, URL, status, or other user-visible state required by the task.

## Best Practices

- **Use bundled scripts as black boxes** - To accomplish a task, consider whether one of the scripts available in `scripts/` can help. These scripts handle common, complex workflows reliably without cluttering the context window. Use `--help` to see usage, then invoke directly. 
- Use the existing browser runner before introducing a second one
- Use `sync_playwright()` when a standalone Python script is the smallest fit
- Always close the browser when done
- Prefer role, label, and visible text selectors; use CSS or test IDs only when user-facing semantics are unavailable
- Rely on Playwright locator actionability and web-first assertions; avoid fixed sleeps

## Reference Files

- **examples/** - Examples showing common patterns:
  - `element_discovery.py` - Discovering buttons, links, and inputs on a page
  - `static_html_automation.py` - Using file:// URLs for local HTML
  - `console_logging.py` - Capturing console logs during automation
