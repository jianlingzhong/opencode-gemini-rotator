import path from "path";
import os from "os";
import { type Plugin } from "@opencode-ai/plugin";
import fs from "fs";
import { z } from "zod";
import { type KeyInfo } from "./shared.js";

const statusFile = path.join(os.tmpdir(), "gemini-rotator-status.json");

interface KeyState {
    isValid: boolean;
    availableAt: number;
}

/**
 * Zod schema for the plugin options object as it appears in
 * `opencode.json`. Keeping validation at the boundary protects us from
 * prototype pollution and stops obvious config typos like `key:` (no s).
 */
export const RotatorOptionsSchema = z
    .object({
        keys: z.union([z.array(z.string()), z.string()]).optional(),
        logFile: z.string().optional(),
    })
    .strict();

export type RotatorOptions = z.infer<typeof RotatorOptionsSchema>;

interface ToastClient {
    tui?: {
        showToast: (args: {
            body: {
                message: string;
                variant?: "info" | "warning" | "success" | "error";
                duration?: number;
            };
        }) => Promise<unknown>;
    };
}

interface GeminiErrorBody {
    error?: {
        message?: string;
        status?: string;
        details?: Array<{ reason?: string }>;
    };
}

// Cap the keyStates Map to prevent unbounded growth if a caller passes
// many ephemeral keys via inbound headers. Real-world pools are < 50.
const MAX_TRACKED_KEYS = 256;

// Throttle status-file writes so a high-RPS workload doesn't spam
// the disk. The TUI sidebar polls at 5s + watches for changes, so a
// 250ms throttle is more than fast enough for human-visible feedback.
const STATUS_WRITE_THROTTLE_MS = 250;
let lastWriteAt = 0;
let pendingInfo: KeyInfo | null = null;
let writeTimer: NodeJS.Timeout | null = null;

function flushStatus(): void {
    if (!pendingInfo) return;
    const info = pendingInfo;
    pendingInfo = null;
    lastWriteAt = Date.now();
    fs.promises.writeFile(statusFile, JSON.stringify(info)).catch(() => {});
}

function notifyKeyUpdate(info: KeyInfo): void {
    pendingInfo = info;
    const now = Date.now();
    const since = now - lastWriteAt;
    if (since >= STATUS_WRITE_THROTTLE_MS) {
        flushStatus();
    } else if (!writeTimer) {
        writeTimer = setTimeout(() => {
            writeTimer = null;
            flushStatus();
        }, STATUS_WRITE_THROTTLE_MS - since);
        // Don't block process exit on this timer.
        writeTimer.unref?.();
    }
}

/**
 * Render a key safely for display in logs, toasts, and the TUI sidebar.
 * - OAuth bearer tokens (`ya29.*`) are labeled rather than truncated.
 * - Standard API keys show a 4-char prefix and 4-char suffix so the user
 *   can distinguish keys in their pool without exposing the secret middle.
 * - Very short identifiers (test fakes) are shown verbatim.
 */
export function maskKey(key: string): string {
    if (key.startsWith("ya29.") || key.startsWith("Bearer ")) return "OAuth Token";
    if (key.length <= 12) return key;
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export class GeminiRotator {
    private originalFetch: typeof globalThis.fetch;
    private keyStates: Map<string, KeyState> = new Map();
    private logFile: string | undefined;
    private fallbackKeys: string[] = [];
    private client: ToastClient;

    constructor(client: ToastClient, options: RotatorOptions = {}) {
        this.client = client;
        this.originalFetch = globalThis.fetch;
        // File logging is opt-in: enable via `options.logFile` or OPENCODE_GEMINI_DEBUG=1
        if (options.logFile) {
            this.logFile = options.logFile;
        } else if (process.env.OPENCODE_GEMINI_DEBUG === "1") {
            this.logFile = path.join(os.tmpdir(), "gemini-rotator-debug.log");
        }

        if (Array.isArray(options.keys)) {
            this.fallbackKeys = options.keys;
        } else if (typeof options.keys === "string") {
            this.fallbackKeys = options.keys.split(",").map(k => k.trim());
        } else if (process.env.GEMINI_API_KEYS) {
            this.fallbackKeys = process.env.GEMINI_API_KEYS.split(",").map(k => k.trim());
        }
        this.fallbackKeys = this.fallbackKeys.filter(k => k.length > 0);

        // Notify the TUI sidebar of the current pool so it can render
        // immediately, even before the first request flows through.
        if (this.fallbackKeys.length > 0) {
            notifyKeyUpdate({
                index: 1,
                maskedKey: maskKey(this.fallbackKeys[0]),
                total: this.fallbackKeys.length,
            });
        } else {
            // Clear any stale status from a previous run / unit test.
            try {
                if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);
            } catch {
                // best-effort
            }
            notifyKeyUpdate({ index: 0, maskedKey: "None", total: 0 });
        }
    }

    private async fileLog(msg: string): Promise<void> {
        if (!this.logFile) return;
        const timestampedMsg = `[${new Date().toISOString()}] ${msg}\n`;
        try {
            await fs.promises.appendFile(this.logFile, timestampedMsg);
        } catch {
            // Logging failures should never crash a request
        }
    }

    private async showToast(
        message: string,
        variant: "info" | "warning" | "success" | "error" = "info",
        duration?: number,
    ): Promise<void> {
        try {
            await this.client.tui?.showToast({
                body: { message, variant, duration },
            });
        } catch {
            // TUI may not be available
        }
    }

    private sleep(ms: number, signal?: AbortSignal) {
        return new Promise<void>((resolve, reject) => {
            if (signal?.aborted) return reject(new Error("Aborted"));
            const timer = setTimeout(resolve, ms);
            signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new Error("Aborted"));
            });
        });
    }

    public async fetch(reqInfo: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let urlObj: URL;
        if (typeof reqInfo === "string") {
            urlObj = new URL(reqInfo);
        } else if (reqInfo instanceof URL) {
            urlObj = new URL(reqInfo.toString());
        } else if (reqInfo instanceof Request) {
            urlObj = new URL(reqInfo.url);
        } else {
            return this.originalFetch(reqInfo, init);
        }

        if (urlObj.hostname !== "generativelanguage.googleapis.com") {
            return this.originalFetch(reqInfo, init);
        }

        const requestHeaders = new Headers(init?.headers);
        const isRequestObj = reqInfo instanceof Request;

        if (isRequestObj) {
            (reqInfo as Request).headers.forEach((value, key) => {
                if (!requestHeaders.has(key)) {
                    requestHeaders.set(key, value);
                }
            });
        }

        const providedKey =
            requestHeaders.get("x-goog-api-key") ||
            urlObj.searchParams.get("key") ||
            requestHeaders.get("authorization") ||
            "";

        let keysToUse = this.fallbackKeys;
        if (providedKey) {
            if (providedKey.includes(",")) {
                keysToUse = providedKey
                    .split(",")
                    .map(k => k.trim())
                    .filter(k => k.length > 0);
            } else {
                if (this.fallbackKeys.length > 0) {
                    keysToUse = [...this.fallbackKeys];
                    if (!keysToUse.includes(providedKey)) {
                        keysToUse.push(providedKey);
                    }
                } else {
                    keysToUse = [providedKey];
                }
            }
        }

        if (keysToUse.length === 0) {
            return this.originalFetch(reqInfo, init);
        }

        urlObj.searchParams.delete("key");
        const newUrlStr = urlObj.toString();

        await this.fileLog(`--- Intercepting Gemini Request: ${urlObj.pathname} ---`);

        keysToUse.forEach(k => {
            if (!this.keyStates.has(k)) {
                // Evict oldest entries if the map would exceed the cap.
                // For a session-scoped rotator this is purely defensive.
                if (this.keyStates.size >= MAX_TRACKED_KEYS) {
                    const firstKey = this.keyStates.keys().next().value;
                    if (firstKey !== undefined) this.keyStates.delete(firstKey);
                }
                this.keyStates.set(k, { isValid: true, availableAt: 0 });
            }
        });

        while (true) {
            if (init?.signal?.aborted) {
                await this.fileLog(`Request aborted by user.`);
                throw new Error("Aborted");
            }

            const validKeys = keysToUse.filter(k => {
                const state = this.keyStates.get(k);
                return state && state.isValid !== false;
            });

            if (validKeys.length === 0) {
                await this.fileLog(`All keys marked as invalid!`);
                this.showToast(`All provided Gemini keys are invalid!`, "error", 10000);
                throw new Error("All provided Gemini keys are invalid");
            }

            const now = Date.now();
            validKeys.sort((a, b) => {
                const stateA = this.keyStates.get(a)!;
                const stateB = this.keyStates.get(b)!;
                const isAvailableA = stateA.availableAt <= now;
                const isAvailableB = stateB.availableAt <= now;

                if (isAvailableA && isAvailableB) {
                    return keysToUse.indexOf(a) - keysToUse.indexOf(b);
                } else if (isAvailableA) {
                    return -1;
                } else if (isAvailableB) {
                    return 1;
                } else {
                    return stateA.availableAt - stateB.availableAt;
                }
            });

            const activeKey = validKeys[0];
            const activeState = this.keyStates.get(activeKey)!;
            const activeKeyMasked = maskKey(activeKey);

            notifyKeyUpdate({
                index: keysToUse.indexOf(activeKey) + 1,
                maskedKey: activeKeyMasked,
                total: keysToUse.length,
            });

            if (activeState.availableAt > now) {
                const sleepMs = activeState.availableAt - now;
                await this.fileLog(
                    `All keys exhausted. Sleeping ${sleepMs}ms until ${activeKeyMasked} available.`,
                );
                this.showToast(
                    `All keys on cooldown. Waiting ${Math.ceil(sleepMs / 1000)}s…`,
                    "warning",
                    sleepMs,
                );
                await this.sleep(sleepMs, init?.signal ?? undefined);
            }

            const fetchHeaders = new Headers(requestHeaders);
            if (activeKey.startsWith("Bearer ") || activeKey.startsWith("ya29.")) {
                fetchHeaders.set(
                    "Authorization",
                    activeKey.startsWith("Bearer ") ? activeKey : `Bearer ${activeKey}`,
                );
                fetchHeaders.delete("x-goog-api-key");
            } else {
                fetchHeaders.set("x-goog-api-key", activeKey);
                fetchHeaders.delete("Authorization");
            }

            let fetchInput: RequestInfo | URL;
            let fetchInit: RequestInit;

            if (isRequestObj) {
                const clonedReq = (reqInfo as Request).clone();
                fetchInput = new Request(newUrlStr, {
                    method: clonedReq.method,
                    headers: fetchHeaders,
                    body: clonedReq.body,
                    mode: clonedReq.mode,
                    credentials: clonedReq.credentials,
                    cache: clonedReq.cache,
                    redirect: clonedReq.redirect,
                    referrer: clonedReq.referrer,
                    referrerPolicy: clonedReq.referrerPolicy,
                    integrity: clonedReq.integrity,
                    keepalive: clonedReq.keepalive,
                    signal: clonedReq.signal,
                });
                fetchInit = init || {};
            } else {
                fetchInput = newUrlStr;
                fetchInit = { ...init, headers: fetchHeaders };
            }

            let response: Response;
            try {
                await this.fileLog(`Trying key (${activeKeyMasked})`);
                response = await this.originalFetch(fetchInput, fetchInit);
                await this.fileLog(`Response Status: ${response.status}`);
            } catch (error) {
                await this.fileLog(`Fetch threw an error: ${error}`);
                throw error;
            }

            let shouldRotate = false;
            let isInvalid = false;
            let delayMs = 10000;

            if (response.status === 429) {
                shouldRotate = true;
                await this.fileLog(`Rate limited (429).`);
                delayMs = 60000;
            } else if (
                !response.ok &&
                (response.status === 403 || response.status === 400 || response.status === 503)
            ) {
                const cloned = response.clone();
                try {
                    const errorData = (await cloned.json()) as GeminiErrorBody;
                    const msg = errorData?.error?.message?.toLowerCase() || "";
                    const firstDetail = errorData?.error?.details?.[0];
                    const reason = firstDetail?.reason?.toLowerCase() || "";
                    const errorStatus = errorData?.error?.status?.toLowerCase() || "";

                    await this.fileLog(
                        `Error: msg="${msg}", reason="${reason}", status="${errorStatus}"`,
                    );

                    if (msg.includes("api key not valid") || reason.includes("api_key_invalid")) {
                        isInvalid = true;
                        shouldRotate = true;
                    } else if (
                        msg.includes("quota") ||
                        msg.includes("rate limit") ||
                        reason.includes("rate_limit") ||
                        reason.includes("quota_exceeded") ||
                        errorStatus === "resource_exhausted" ||
                        errorStatus === "unavailable"
                    ) {
                        shouldRotate = true;
                        const retryAfter = response.headers.get("retry-after");
                        if (retryAfter) {
                            const parsed = parseInt(retryAfter, 10);
                            if (!isNaN(parsed)) delayMs = parsed * 1000;
                        } else {
                            const afterMatch = msg.match(/reset after\s+([0-9.]+)(s|m|h)/i);
                            if (afterMatch) {
                                const val = parseFloat(afterMatch[1]);
                                const unit = afterMatch[2].toLowerCase();
                                if (unit === "s") delayMs = val * 1000;
                                if (unit === "m") delayMs = val * 60 * 1000;
                                if (unit === "h") delayMs = val * 3600 * 1000;
                            }
                        }
                    }
                } catch {
                    // Body wasn't JSON; treat as opaque non-rotatable error and pass through.
                }
            }

            if (isInvalid) {
                activeState.isValid = false;
                this.showToast(`Key (${activeKeyMasked}) is invalid.`, "error", 5000);
                continue;
            }

            if (shouldRotate) {
                activeState.availableAt = Date.now() + delayMs;
                this.showToast(
                    `Rotating from ${activeKeyMasked} (Cooldown: ${Math.ceil(delayMs / 1000)}s)`,
                    "warning",
                    3000,
                );
                continue;
            }

            return response;
        }
    }

    public patch(): void {
        globalThis.fetch = this.fetch.bind(this);
    }

    public unpatch(): void {
        globalThis.fetch = this.originalFetch;
    }
}

let rotator: GeminiRotator | null = null;

/**
 * Reset the singleton (test-only helper). Restores the original
 * `globalThis.fetch` so test files don't leak state between suites.
 * @internal
 */
export function _resetForTesting(): void {
    if (rotator) {
        rotator.unpatch();
        rotator = null;
    }
}

export const id = "gemini-key-rotator";
export const server: Plugin = async ({ client }, options) => {
    if (rotator) rotator.unpatch();
    // Validate untrusted options at the trust boundary. We throw on a
    // genuine schema violation (e.g. `keys: 42`) but accept the most
    // common typing mistakes by passing `{}` if validation fails.
    const parsed = RotatorOptionsSchema.safeParse(options ?? {});
    const opts = parsed.success ? parsed.data : {};
    if (!parsed.success) {
        console.warn(
            "[opencode-gemini-rotator] Invalid plugin options; falling back to defaults:",
            parsed.error.issues,
        );
    }
    // OpenCode's PluginInput exposes a wider client surface; we only depend
    // on the optional `tui.showToast` subset (see `ToastClient`).
    rotator = new GeminiRotator(client as ToastClient, opts);
    rotator.patch();
    return {};
};
