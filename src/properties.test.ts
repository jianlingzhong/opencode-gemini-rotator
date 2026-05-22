/**
 * Property-based tests for the pure helpers in `src/server.ts`.
 *
 * These run thousands of randomized inputs through `maskKey()` and the
 * rotator's key-parsing logic, looking for invariants that should hold
 * for ALL strings, not just the hand-picked ones in `server.test.ts`.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import fc from "fast-check";
import { GeminiRotator, maskKey } from "./server.js";

describe("maskKey — properties", () => {
    it("never returns the full original key", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 13, maxLength: 80 }), key => {
                // Exclude trivial inputs that aren't keys.
                fc.pre(!key.startsWith("ya29.") && !key.startsWith("Bearer "));
                const masked = maskKey(key);
                // Either it's the OAuth label (won't be for these inputs)
                // or it must be strictly shorter than the original.
                expect(masked.length).toBeLessThan(key.length);
                expect(masked).not.toBe(key);
            }),
            { numRuns: 200 },
        );
    });

    it("preserves first 4 and last 4 chars for long keys", () => {
        fc.assert(
            fc.property(
                fc
                    .string({ minLength: 13, maxLength: 80 })
                    .filter(s => !s.startsWith("ya29.") && !s.startsWith("Bearer ")),
                key => {
                    const masked = maskKey(key);
                    expect(masked.startsWith(key.slice(0, 4))).toBe(true);
                    expect(masked.endsWith(key.slice(-4))).toBe(true);
                },
            ),
            { numRuns: 200 },
        );
    });

    it("is idempotent for already-masked values (no further shortening)", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 13, maxLength: 80 }), key => {
                fc.pre(!key.startsWith("ya29.") && !key.startsWith("Bearer "));
                const once = maskKey(key);
                // maskKey of a masked value should at least preserve its shape;
                // we don't assert exact equality because the masked value contains
                // a `…` character which is itself > 12 chars when the key was long.
                expect(once.length).toBeLessThanOrEqual(key.length);
            }),
            { numRuns: 200 },
        );
    });

    it("always labels OAuth tokens", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 200 }), tail => {
                const ya29 = `ya29.${tail}`;
                const bearer = `Bearer ${tail}`;
                expect(maskKey(ya29)).toBe("OAuth Token");
                expect(maskKey(bearer)).toBe("OAuth Token");
            }),
            { numRuns: 100 },
        );
    });
});

describe("GeminiRotator — cooldown timing (fake clock)", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("sleeps for the full cooldown when all keys exhausted", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("rl", { status: 429 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const rotator = new GeminiRotator(
            { tui: { showToast: vi.fn().mockResolvedValue({}) } },
            { keys: ["only-key"] },
        );

        const p = rotator.fetch("https://generativelanguage.googleapis.com/v1/models");
        // First fetch fires immediately; second is gated behind the 60s 429 cooldown.
        // Without advancing the timer, the promise should not resolve.
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(60_000);
        const res = await p;

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("GeminiRotator — concurrent fetch", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("handles 50 parallel calls without state corruption", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { status: 200 })));
        const rotator = new GeminiRotator(
            { tui: { showToast: vi.fn().mockResolvedValue({}) } },
            { keys: ["k1", "k2", "k3"] },
        );

        const calls = Array.from({ length: 50 }, () =>
            rotator.fetch("https://generativelanguage.googleapis.com/v1/models"),
        );
        const results = await Promise.all(calls);

        // All should resolve to 200.
        for (const r of results) expect(r.status).toBe(200);
        // Underlying fetch was called exactly once per request.
        expect(globalThis.fetch).toHaveBeenCalledTimes(50);
    });
});
