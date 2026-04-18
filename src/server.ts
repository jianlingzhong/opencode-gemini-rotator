import path from "path";
import os from "os";
import { type Plugin } from "@opencode-ai/plugin";
import fs from 'fs';
import { type KeyInfo } from "./shared.js";
const statusFile = path.join(os.tmpdir(), "gemini-rotator-status.json");

interface KeyState {
    isValid: boolean;
    availableAt: number;
}

let lastKeyInfo: KeyInfo = { index: 0, maskedKey: 'None', total: 0 };

function notifyKeyUpdate(info: KeyInfo) {
    lastKeyInfo = info;
    fs.promises.writeFile(statusFile, JSON.stringify(info)).catch(() => {});
}

export class GeminiRotator {
    private originalFetch: typeof globalThis.fetch;
    private keyStates: Map<string, KeyState> = new Map();
    private logFile: string;
    private fallbackKeys: string[] = [];
    private client: any;

    constructor(client: any, options: any) {
        this.client = client;
        this.originalFetch = globalThis.fetch;
        this.logFile = options?.logFile || path.join(os.tmpdir(), 'gemini-rotator-debug.log');

        if (options?.keys && Array.isArray(options.keys)) {
            this.fallbackKeys = options.keys as string[];
        } else if (typeof options?.keys === 'string') {
            this.fallbackKeys = (options.keys as string).split(',').map((k: string) => k.trim());
        } else if (process.env.GEMINI_API_KEYS) {
            this.fallbackKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim());
        }
        this.fallbackKeys = this.fallbackKeys.filter(k => k.length > 0);

        // Initialize status file with the loaded keys to clear any stale/fake keys from tests
        // and instantly notify the UI that we have a pool ready.
        if (this.fallbackKeys.length > 0) {
            const activeKey = this.fallbackKeys[0];
            const activeKeyMasked = activeKey.length > 15 ? activeKey.substring(0, 8) + "..." : (activeKey.startsWith('ya29.') ? "OAuth Token" : activeKey);
            notifyKeyUpdate({
                index: 1,
                maskedKey: activeKeyMasked,
                total: this.fallbackKeys.length
            });
        } else {
            // Clear status file so we don't show stale data (e.g. from unit tests)
            try {
                if (fs.existsSync(statusFile)) {
                    fs.unlinkSync(statusFile);
                }
            } catch (e) {}
            notifyKeyUpdate({ index: 0, maskedKey: 'None', total: 0 });
        }
    }

    private async fileLog(msg: string) {
        const timestampedMsg = `[${new Date().toISOString()}] ${msg}\n`;
        try {
            await fs.promises.appendFile(this.logFile, timestampedMsg);
        } catch {
            console.debug(`[gemini-rotator] ${msg}`);
        }
    }

    private async showToast(message: string, variant: "info" | "warning" | "success" | "error" = "info", duration?: number) {
        try {
            await this.client.tui.showToast({
                body: { message, variant, duration },
            });
        } catch {
            // TUI may not be available
        }
    }

    private sleep(ms: number, signal?: AbortSignal) {
        return new Promise<void>((resolve, reject) => {
            if (signal?.aborted) return reject(new Error('Aborted'));
            const timer = setTimeout(resolve, ms);
            signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('Aborted'));
            });
        });
    }

    public async fetch(reqInfo: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let urlObj: URL;
        if (typeof reqInfo === 'string') {
            urlObj = new URL(reqInfo);
        } else if (reqInfo instanceof URL) {
            urlObj = new URL(reqInfo.toString());
        } else if (reqInfo instanceof Request) {
            urlObj = new URL(reqInfo.url);
        } else {
            return this.originalFetch(reqInfo, init);
        }

        if (urlObj.hostname !== 'generativelanguage.googleapis.com') {
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

        const providedKey = requestHeaders.get('x-goog-api-key') || urlObj.searchParams.get('key') || requestHeaders.get('authorization') || '';

        let keysToUse = this.fallbackKeys;
        if (providedKey) {
            if (providedKey.includes(',')) {
                keysToUse = providedKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
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

        urlObj.searchParams.delete('key');
        const newUrlStr = urlObj.toString();

        await this.fileLog(`--- Intercepting Gemini Request: ${urlObj.pathname} ---`);

        keysToUse.forEach(k => {
            if (!this.keyStates.has(k)) {
                this.keyStates.set(k, { isValid: true, availableAt: 0 });
            }
        });

        while (true) {
            if (init?.signal?.aborted) {
                await this.fileLog(`Request aborted by user.`);
                throw new Error('Aborted');
            }

            let validKeys = keysToUse.filter(k => {
                const state = this.keyStates.get(k);
                return state && state.isValid !== false;
            });

            if (validKeys.length === 0) {
                await this.fileLog(`All keys marked as invalid!`);
                this.showToast(`All provided Gemini keys are invalid!`, "error", 10000);
                throw new Error('All provided Gemini keys are invalid');
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
            const activeKeyMasked = activeKey.length > 15 ? activeKey.substring(0, 8) + "..." : (activeKey.startsWith('ya29.') ? "OAuth Token" : activeKey);

            notifyKeyUpdate({
                index: keysToUse.indexOf(activeKey) + 1,
                maskedKey: activeKeyMasked,
                total: keysToUse.length
            });

            if (activeState.availableAt > now) {
                const sleepMs = activeState.availableAt - now;
                await this.fileLog(`All keys exhausted. Sleeping ${sleepMs}ms until ${activeKeyMasked} available.`);
                this.showToast(`All keys on cooldown. Waiting ${Math.ceil(sleepMs / 1000)}s...`, "warning", sleepMs);
                try {
                    await this.sleep(sleepMs, init?.signal ?? undefined);
                } catch (e) {
                    throw e;
                }
            }

            const fetchHeaders = new Headers(requestHeaders);
            if (activeKey.startsWith('Bearer ') || activeKey.startsWith('ya29.')) {
                fetchHeaders.set('Authorization', activeKey.startsWith('Bearer ') ? activeKey : `Bearer ${activeKey}`);
                fetchHeaders.delete('x-goog-api-key');
            } else {
                fetchHeaders.set('x-goog-api-key', activeKey);
                fetchHeaders.delete('Authorization');
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
                    signal: clonedReq.signal
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
            } else if (!response.ok && (response.status === 403 || response.status === 400 || response.status === 503)) {
                const cloned = response.clone();
                try {
                    const errorData = await cloned.json() as any;
                    const msg = errorData?.error?.message?.toLowerCase() || '';
                    const firstDetail = errorData?.error?.details?.[0];
                    const reason = (typeof firstDetail === 'object' ? firstDetail?.reason?.toLowerCase() : '') || '';
                    const errorStatus = errorData?.error?.status?.toLowerCase() || '';

                    await this.fileLog(`Error: msg="${msg}", reason="${reason}", status="${errorStatus}"`);

                    if (msg.includes('api key not valid') || reason.includes('api_key_invalid')) {
                        isInvalid = true;
                        shouldRotate = true;
                    } else if (
                        msg.includes('quota') || msg.includes('rate limit') || 
                        reason.includes('rate_limit') || reason.includes('quota_exceeded') ||
                        errorStatus === 'resource_exhausted' || errorStatus === 'unavailable'
                    ) {
                        shouldRotate = true;
                        const retryAfter = response.headers.get('retry-after');
                        if (retryAfter) {
                            const parsed = parseInt(retryAfter, 10);
                            if (!isNaN(parsed)) delayMs = parsed * 1000;
                        } else {
                            const afterMatch = msg.match(/reset after\s+([0-9.]+)(s|m|h)/i);
                            if (afterMatch) {
                                const val = parseFloat(afterMatch[1]);
                                const unit = afterMatch[2].toLowerCase();
                                if (unit === 's') delayMs = val * 1000;
                                if (unit === 'm') delayMs = val * 60 * 1000;
                                if (unit === 'h') delayMs = val * 3600 * 1000;
                            }
                        }
                    }
                } catch (e) {}
            }

            if (isInvalid) {
                activeState.isValid = false;
                this.showToast(`Key (${activeKeyMasked}) is invalid.`, "error", 5000);
                continue;
            }

            if (shouldRotate) {
                activeState.availableAt = Date.now() + delayMs;
                this.showToast(`Rotating from ${activeKeyMasked} (Cooldown: ${Math.ceil(delayMs/1000)}s)`, "warning", 3000);
                continue;
            }

            return response;
        }
    }

    public patch() {
        (globalThis as any).fetch = this.fetch.bind(this);
    }

    public unpatch() {
        globalThis.fetch = this.originalFetch;
    }
}

let rotator: GeminiRotator | null = null;

export const id = "gemini-key-rotator";
export const server: Plugin = async ({ client }, options) => {
    if (rotator) {
        rotator.unpatch();
    }
    rotator = new GeminiRotator(client, options);
    rotator.patch();
    return {};
};
