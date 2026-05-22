#!/usr/bin/env node
// Simple bundle-size budget enforcer for opencode-gemini-rotator.
// Run after `bun run build`.

import { statSync } from "node:fs";

const BUDGETS = [
    { path: "dist/server.js", maxBytes: 20 * 1024 },
    { path: "dist/index.js", maxBytes: 20 * 1024 },
    { path: "dist/tui.js", maxBytes: 32 * 1024 },
];

let failed = false;
for (const { path, maxBytes } of BUDGETS) {
    let size;
    try {
        size = statSync(path).size;
    } catch {
        console.error(`✗ ${path} — file not found (run 'bun run build' first)`);
        failed = true;
        continue;
    }
    const kb = (size / 1024).toFixed(1);
    const budgetKb = (maxBytes / 1024).toFixed(1);
    if (size > maxBytes) {
        console.error(`✗ ${path} — ${kb} KB exceeds budget of ${budgetKb} KB`);
        failed = true;
    } else {
        console.log(`✓ ${path} — ${kb} KB (budget ${budgetKb} KB)`);
    }
}
process.exit(failed ? 1 : 0);
