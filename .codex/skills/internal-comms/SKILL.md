---
name: internal-comms
description: Load when a workflow-router-selected owner workflow needs internal communications such as status reports, leadership updates, 3P updates, newsletters, FAQs, incident reports, or project updates; skip public marketing copy.
license: Complete terms in LICENSE.txt
metadata:
  source: "anthropics/skills skills/internal-comms"
  upstream_commit: "690f15cac7f7b4c055c5ab109c79ed9259934081"
  adaptation: "Examples moved to references/ and trigger text made organization-neutral."
---

## When to use this skill
To write internal communications, use this skill for:
- 3P updates (Progress, Plans, Problems)
- Company newsletters
- FAQ responses
- Status reports
- Leadership updates
- Project updates
- Incident reports

## How to use this skill

To write any internal communication:

1. **Identify the communication type** from the request
2. **Load the appropriate guideline file** from the `references/` directory:
    - `references/3p-updates.md` - For Progress/Plans/Problems team updates
    - `references/company-newsletter.md` - For company-wide newsletters
    - `references/faq-answers.md` - For answering frequently asked questions
    - `references/general-comms.md` - For anything else that doesn't explicitly match one of the above
3. **Follow the specific instructions** in that file for formatting, tone, and content gathering

If the communication type doesn't match any existing guideline, ask for clarification or more context about the desired format.

## Keywords
3P updates, company newsletter, company comms, weekly update, faqs, common questions, updates, internal comms
