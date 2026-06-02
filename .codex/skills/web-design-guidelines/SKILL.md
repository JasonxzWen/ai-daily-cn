---
name: web-design-guidelines
description: Load when a workflow-router-selected owner workflow needs UI, UX, accessibility, or web interface guideline compliance review; use frontend-design when creating or changing production UI.
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---


# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use the available web or browser tool to retrieve the latest rules. If network access is unavailable, explain that the live guideline fetch could not be performed and review against the local skill guidance. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
