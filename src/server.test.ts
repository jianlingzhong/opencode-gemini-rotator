import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { GeminiRotator, maskKey } from "./server.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1/models";

function makeClient() {
    return {
        tui: {
            showToast: vi.fn().mockResolvedValue({}),
        },
    };
}

describe("maskKey", () => {
    it("labels OAuth bearer tokens", () => {
        expect(maskKey("ya29.abcdefghij")).toBe("OAuth Token");
        expect(maskKey("Bearer foo")).toBe("OAuth Token");
    });
    it("shows short fakes verbatim", () => {
        expect(maskKey("key1")).toBe("key1");
    });
    it("masks middle of long keys", () => {
        expect(maskKey("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234")).toBe("AIza…1234");
    });
});

function jsonError(body: object, status: number, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

describe("GeminiRotator — request routing", () => {
    let rotator: GeminiRotator;
    let mockClient: ReturnType<typeof makeClient>;

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
        mockClient = makeClient();
        rotator = new GeminiRotator(mockClient, { keys: ["key1", "key2"] });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("passes through non-gemini requests unmodified", async () => {
        const originalFetch = globalThis.fetch;
        const response = new Response("ok", { status: 200 });
        vi.mocked(originalFetch).mockResolvedValue(response);

        const res = await rotator.fetch("https://example.com");

        expect(res).toBe(response);
        expect(originalFetch).toHaveBeenCalledWith("https://example.com", undefined);
    });

    it("uses x-goog-api-key header for standard API keys", async () => {
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response("ok", { status: 200 }));

        await rotator.fetch(`${GEMINI_URL}?key=originalKey`);

        const call = vi.mocked(originalFetch).mock.calls[0];
        const headers = call[1]?.headers as Headers;
        expect(headers.get("x-goog-api-key")).toBe("key1");
        expect(headers.has("Authorization")).toBe(false);
    });

    it("strips the ?key= query parameter from outbound URL", async () => {
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response("ok", { status: 200 }));

        await rotator.fetch(`${GEMINI_URL}?key=originalKey&other=foo`);

        const outboundUrl = vi.mocked(originalFetch).mock.calls[0][0] as string;
        expect(outboundUrl).not.toContain("key=");
        expect(outboundUrl).toContain("other=foo");
    });

    it("uses Authorization: Bearer for ya29. OAuth tokens", async () => {
        rotator = new GeminiRotator(mockClient, { keys: ["ya29.test-token"] });
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response("ok", { status: 200 }));

        await rotator.fetch(GEMINI_URL);

        const headers = vi.mocked(originalFetch).mock.calls[0][1]?.headers as Headers;
        expect(headers.get("Authorization")).toBe("Bearer ya29.test-token");
        expect(headers.has("x-goog-api-key")).toBe(false);
    });

    it("preserves a pre-formed 'Bearer ' prefix", async () => {
        rotator = new GeminiRotator(mockClient, { keys: ["Bearer some-token-value"] });
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response("ok", { status: 200 }));

        await rotator.fetch(GEMINI_URL);

        const headers = vi.mocked(originalFetch).mock.calls[0][1]?.headers as Headers;
        expect(headers.get("Authorization")).toBe("Bearer some-token-value");
    });

    it("passes through when no keys are configured at all", async () => {
        rotator = new GeminiRotator(mockClient, {});
        const originalFetch = globalThis.fetch;
        const response = new Response("ok", { status: 200 });
        vi.mocked(originalFetch).mockResolvedValue(response);

        const res = await rotator.fetch(GEMINI_URL);

        expect(res).toBe(response);
    });
});

describe("GeminiRotator — key parsing", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete process.env.GEMINI_API_KEYS;
    });

    it("parses comma-separated key string", async () => {
        const rotator = new GeminiRotator(makeClient(), { keys: "a, b , c" });
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response("ok", { status: 200 }));
        await rotator.fetch(GEMINI_URL);
        const headers = vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers as Headers;
        expect(headers.get("x-goog-api-key")).toBe("a");
    });

    it("reads from GEMINI_API_KEYS env var when no options.keys provided", async () => {
        process.env.GEMINI_API_KEYS = "env-key-1,env-key-2";
        const rotator = new GeminiRotator(makeClient(), {});
        vi.mocked(globalThis.fetch).mockResolvedValue(new Response("ok", { status: 200 }));
        await rotator.fetch(GEMINI_URL);
        const headers = vi.mocked(globalThis.fetch).mock.calls[0][1]?.headers as Headers;
        expect(headers.get("x-goog-api-key")).toBe("env-key-1");
    });

    it("filters out empty keys from input", async () => {
        const rotator = new GeminiRotator(makeClient(), { keys: ["a", "", "b", " "] });
        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(new Response("rl", { status: 429 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));
        await rotator.fetch(GEMINI_URL);
        const secondHeaders = vi.mocked(globalThis.fetch).mock.calls[1][1]?.headers as Headers;
        expect(secondHeaders.get("x-goog-api-key")).toBe("b");
    });
});

describe("GeminiRotator — rotation behavior", () => {
    let rotator: GeminiRotator;
    let mockClient: ReturnType<typeof makeClient>;

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
        mockClient = makeClient();
        rotator = new GeminiRotator(mockClient, { keys: ["key1", "key2"] });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("rotates to the next key on HTTP 429", async () => {
        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(new Response("rate limit", { status: 429 }))
            .mockResolvedValueOnce(new Response("success", { status: 200 }));

        const res = await rotator.fetch(GEMINI_URL);

        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        const secondHeaders = vi.mocked(globalThis.fetch).mock.calls[1][1]?.headers as Headers;
        expect(secondHeaders.get("x-goog-api-key")).toBe("key2");
    });

    it("rotates on 403 quota exceeded", async () => {
        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(
                jsonError(
                    { error: { message: "Quota exceeded.", status: "RESOURCE_EXHAUSTED" } },
                    403,
                ),
            )
            .mockResolvedValueOnce(new Response("success", { status: 200 }));

        const res = await rotator.fetch(GEMINI_URL);

        expect(res.status).toBe(200);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("permanently marks API_KEY_INVALID keys as invalid", async () => {
        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(
                jsonError(
                    {
                        error: {
                            message: "API key not valid. Please pass a valid API key.",
                            status: "INVALID_ARGUMENT",
                            details: [{ reason: "API_KEY_INVALID" }],
                        },
                    },
                    400,
                ),
            )
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));

        const res = await rotator.fetch(GEMINI_URL);
        expect(res.status).toBe(200);
        const second = vi.mocked(globalThis.fetch).mock.calls[1][1]?.headers as Headers;
        expect(second.get("x-goog-api-key")).toBe("key2");
    });

    it("throws when all keys are marked invalid", async () => {
        const invalidBody = {
            error: {
                message: "API key not valid.",
                status: "INVALID_ARGUMENT",
                details: [{ reason: "API_KEY_INVALID" }],
            },
        };
        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(jsonError(invalidBody, 400))
            .mockResolvedValueOnce(jsonError(invalidBody, 400));

        await expect(rotator.fetch(GEMINI_URL)).rejects.toThrow(/invalid/i);
    });

    it("returns non-rotatable errors (e.g. 500) directly to the caller", async () => {
        const errResp = new Response("server error", { status: 500 });
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(errResp);

        const res = await rotator.fetch(GEMINI_URL);

        expect(res.status).toBe(500);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns 4xx with non-quota error body without rotating", async () => {
        // 400 with an unrelated error reason → not a rotate trigger
        const body = { error: { message: "Bad request", status: "INVALID_ARGUMENT" } };
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonError(body, 400));

        const res = await rotator.fetch(GEMINI_URL);

        expect(res.status).toBe(400);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("respects abort signal during rotation", async () => {
        const controller = new AbortController();
        vi.mocked(globalThis.fetch).mockImplementation(async () => {
            controller.abort();
            throw Object.assign(new Error("Aborted"), { name: "AbortError" });
        });

        await expect(rotator.fetch(GEMINI_URL, { signal: controller.signal })).rejects.toThrow();
    });
});

describe("GeminiRotator — log redaction", () => {
    let tmpLog: string;

    beforeEach(() => {
        tmpLog = path.join(os.tmpdir(), `gemini-rotator-redact-${Date.now()}-${Math.random()}.log`);
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        try {
            if (fs.existsSync(tmpLog)) fs.unlinkSync(tmpLog);
        } catch {
            /* ignore */
        }
    });

    it("never writes a full long API key to the log", async () => {
        const SECRET = "AIzaSyTHISISAFAKEKEYTHATSHOULDNEVERAPPEARWHOLE12345";
        const rotator = new GeminiRotator(makeClient(), {
            keys: [SECRET, "AIzaSySECONDFAKE_____________________________"],
            logFile: tmpLog,
        });

        vi.mocked(globalThis.fetch)
            .mockResolvedValueOnce(new Response("rl", { status: 429 }))
            .mockResolvedValueOnce(new Response("ok", { status: 200 }));

        await rotator.fetch(GEMINI_URL);

        // Wait for async appendFile flushes.
        await new Promise(resolve => setTimeout(resolve, 50));

        const log = fs.readFileSync(tmpLog, "utf-8");
        expect(log).not.toContain(SECRET);
        // Mask should appear instead.
        expect(log).toContain(maskKey(SECRET));
    });

    it("never writes a ya29 OAuth token to the log", async () => {
        const TOKEN = "ya29.SOMETHINGTHATLOOKSLIKEAREALTOKEN_DO_NOT_LEAK";
        const rotator = new GeminiRotator(makeClient(), {
            keys: [TOKEN],
            logFile: tmpLog,
        });

        vi.mocked(globalThis.fetch).mockResolvedValue(new Response("ok", { status: 200 }));

        await rotator.fetch(GEMINI_URL);
        await new Promise(resolve => setTimeout(resolve, 50));

        const log = fs.readFileSync(tmpLog, "utf-8");
        expect(log).not.toContain(TOKEN);
        expect(log).toContain("OAuth Token");
    });
});

describe("GeminiRotator — patch/unpatch", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("monkey-patches and restores globalThis.fetch", () => {
        const sentinel = vi.fn() as unknown as typeof globalThis.fetch;
        vi.stubGlobal("fetch", sentinel);

        const rotator = new GeminiRotator(makeClient(), { keys: ["k"] });
        rotator.patch();
        expect(globalThis.fetch).not.toBe(sentinel);

        rotator.unpatch();
        expect(globalThis.fetch).toBe(sentinel);
    });
});
