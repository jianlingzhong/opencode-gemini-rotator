/**
 * End-to-end smoke test for the exported `server` plugin factory.
 *
 * Unlike `server.test.ts` (which exercises the `GeminiRotator` class
 * directly), this file ensures the OpenCode-facing plugin entry point
 * correctly:
 *   1. Patches `globalThis.fetch`.
 *   2. Routes a real `fetch()` call through the rotator.
 *   3. Writes the configured debug log.
 *   4. Restores `globalThis.fetch` afterwards (via `_resetForTesting`).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { server, _resetForTesting } from "./server.js";

describe("server() plugin factory", () => {
    const logFile = path.join(os.tmpdir(), `gemini-rotator-verify-${process.pid}.log`);
    const statusFile = path.join(os.tmpdir(), "gemini-rotator-status.json");
    const originalFetch = globalThis.fetch;

    beforeAll(() => {
        // Start with a clean log for deterministic assertions.
        try {
            fs.writeFileSync(logFile, "");
        } catch {
            /* ignore */
        }
    });

    afterAll(() => {
        _resetForTesting();
        globalThis.fetch = originalFetch;
        for (const f of [logFile, statusFile]) {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch {
                /* ignore */
            }
        }
    });

    it("intercepts a Gemini request and rotates on API_KEY_INVALID", async () => {
        const stub = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        message: "API key not valid. Please pass a valid API key.",
                        status: "INVALID_ARGUMENT",
                        details: [{ reason: "API_KEY_INVALID" }],
                    },
                }),
                { status: 400 },
            ),
        );
        vi.stubGlobal("fetch", stub);

        const showToast = vi.fn().mockResolvedValue({});

        await server({ client: { tui: { showToast } } } as Parameters<typeof server>[0], {
            keys: ["FAKE_KEY_1", "FAKE_KEY_2"],
            logFile,
        });

        await expect(
            fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }] }),
                },
            ),
        ).rejects.toThrow(/invalid/i);

        // Give the async appendFile a brief moment to flush.
        await new Promise(r => setTimeout(r, 50));

        expect(fs.existsSync(logFile)).toBe(true);
        const log = fs.readFileSync(logFile, "utf-8");
        expect(log).toContain("Intercepting Gemini Request");
        expect(log).toContain("FAKE_KEY_1");
        expect(log).toContain("FAKE_KEY_2");
        expect(stub).toHaveBeenCalledTimes(2);

        vi.unstubAllGlobals();
    });
});
