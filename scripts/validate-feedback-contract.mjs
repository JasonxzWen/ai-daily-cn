#!/usr/bin/env node
import { validateFeedbackContract } from "../src/feedback-contract.js";

const result = await validateFeedbackContract({ rootDir: process.cwd() });

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (!result.ok) {
  process.exitCode = 1;
}
