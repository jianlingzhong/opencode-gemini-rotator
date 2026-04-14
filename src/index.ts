import { type PluginModule, type Plugin } from "@opencode-ai/plugin";
import fs from 'fs';

export const server: Plugin = async ({ client }, options) => {
    const logFile = '/tmp/gemini-rotator-debug.log';
    const fileLog = (msg: string) => {
        try {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
        } catch (e) {}
    };

    fileLog("Plugin initialized/reloaded.");

    let fallbackKeys: string[] = [];
    if (options?.keys && Array.isArray(options.keys)) {
        fallbackKeys = options.keys as string[];
    } else if (typeof options?.keys === 'string') {
        fallbackKeys = (options.keys as string).split(',').map((k: string) => k.trim());
    } else if (process.env.GEMINI_API_KEYS) {
        fallbackKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim());
    }
    
    fallbackKeys = fallbackKeys.filter(k => k.length > 0);

    const showToast = async (message: string, variant: "info" | "warning" | "success" | "error" = "info", duration?: number) => {
        try {
            await client.tui.showToast({
                body: { message, variant, duration },
            });
        } catch {
            // TUI may not be available, silently ignore to prevent breaking the terminal UI layout
        }
    };

    const sleep = (ms: number, signal?: AbortSignal) => new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('Aborted'));
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
        });
    });

    if (!(globalThis as any).__geminiRotatorPatched) {
        (globalThis as any).__geminiRotatorPatched = true;
        (globalThis as any).__geminiKeyStates = new Map<string, { isValid: boolean, availableAt: number }>();
        (globalThis as any).__geminiCurrentIndex = 0;

        const originalFetch = globalThis.fetch;
        
        const customFetch = async (reqInfo: any, init?: any): Promise<any> => {
            let urlObj: URL;
            if (typeof reqInfo === 'string') {
                urlObj = new URL(reqInfo);
            } else if (reqInfo instanceof URL) {
                urlObj = new URL(reqInfo.toString());
            } else if (reqInfo instanceof Request) {
                urlObj = new URL(reqInfo.url);
            } else {
                return originalFetch(reqInfo, init);
            }

            const isGemini = urlObj.hostname === 'generativelanguage.googleapis.com';
            
            if (!isGemini) {
                return originalFetch(reqInfo, init);
            }

            let requestHeaders = new Headers(init?.headers);
            let isRequestObj = reqInfo instanceof Request;
            
            if (isRequestObj) {
                (reqInfo as Request).headers.forEach((value: string, key: string) => {
                    requestHeaders.set(key, value);
                });
            }

            let providedKey = requestHeaders.get('x-goog-api-key') || urlObj.searchParams.get('key') || requestHeaders.get('authorization') || '';
            
            let keysToUse = fallbackKeys;
            if (providedKey) {
                if (providedKey.includes(',')) {
                    keysToUse = providedKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
                } else {
                    if (fallbackKeys.length > 0) {
                        keysToUse = [...fallbackKeys];
                        if (!keysToUse.includes(providedKey)) {
                            keysToUse.push(providedKey); 
                        }
                    } else {
                        keysToUse = [providedKey];
                    }
                }
            }

            if (keysToUse.length === 0) {
                return originalFetch(reqInfo, init);
            }

            urlObj.searchParams.delete('key');
            
            const newUrlStr = urlObj.toString();
            const keyStates = (globalThis as any).__geminiKeyStates as Map<string, { isValid: boolean, availableAt: number }>;

            fileLog(`--- Intercepting Gemini Request: ${urlObj.pathname} ---`);
            fileLog(`Initial pool size: ${keysToUse.length}`);
            
            // Initialize states for any new keys
            keysToUse.forEach(k => {
                if (!keyStates.has(k)) {
                    keyStates.set(k, { isValid: true, availableAt: 0 });
                }
            });

            let attempts = 0;
            // We'll loop infinitely, but we can cap total attempts if we really want to.
            // Since we sleep when keys are exhausted, an infinite loop is fine until user aborts.
            while (true) {
                // Check for abort
                if (init?.signal?.aborted) {
                    fileLog(`Request aborted by user.`);
                    throw new Error('Aborted');
                }

                let validKeys = keysToUse.filter(k => {
                    const state = keyStates.get(k);
                    return state && state.isValid !== false;
                });

                if (validKeys.length === 0) {
                    fileLog(`All keys have been marked as invalid! Breaking loop.`);
                    showToast(`All provided Gemini keys are invalid!`, "error", 10000);
                    // Just try the first one and let it fail naturally to return the error to the app
                    validKeys = keysToUse;
                }

                // Sort keys by availableAt time ascending. 
                // The key that is available soonest will be at index 0.
                
                const now = Date.now();
                validKeys.sort((a, b) => {
                    const stateA = keyStates.get(a)!;
                    const stateB = keyStates.get(b)!;
                    const isAvailableA = stateA.availableAt <= now;
                    const isAvailableB = stateB.availableAt <= now;
                    
                    if (isAvailableA && isAvailableB) {
                        // Both are healthy/available! Prioritize based on their original order (Primary first)
                        return keysToUse.indexOf(a) - keysToUse.indexOf(b);
                    } else if (isAvailableA) {
                        return -1; // A is available, B is on cooldown. A goes first.
                    } else if (isAvailableB) {
                        return 1;  // B is available, A is on cooldown. B goes first.
                    } else {
                        // Both are on cooldown! Sort by which one unlocks soonest.
                        return stateA.availableAt - stateB.availableAt;
                    }
                });

                const activeKey = validKeys[0];
                const activeState = keyStates.get(activeKey) || { isValid: false, availableAt: 0 };
                const activeKeyMasked = activeKey.length > 15 ? activeKey.substring(0, 8) + "..." : "OAUTH_TOKEN";

                if (activeState.availableAt > now) {
                    const sleepMs = activeState.availableAt - now;
                    fileLog(`All valid keys are exhausted. Sleeping for ${sleepMs}ms until ${activeKeyMasked} is available.`);
                    showToast(`All keys on cooldown. Waiting ${Math.ceil(sleepMs / 1000)}s for the next available key...`, "warning", sleepMs);
                    try {
                        await sleep(sleepMs, init?.signal);
                    } catch (e) {
                        throw e; // Aborted
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
                
                let fetchInput: any;
                let fetchInit: any;

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
                    fetchInit = init;
                } else {
                    fetchInput = newUrlStr;
                    fetchInit = {
                        ...init,
                        headers: fetchHeaders
                    };
                }

                let response: any;
                try {
                    fileLog(`Trying key (${activeKeyMasked})`);
                    response = await originalFetch(fetchInput, fetchInit);
                    fileLog(`Response Status: ${response.status}`);
                } catch (error) {
                    fileLog(`Fetch threw an error: ${error}`);
                    throw error;
                }
                
                let shouldRotate = false;
                let isInvalid = false;
                let delayMs = 10000; // Default 10 seconds penalty
                
                if (response.status === 429) {
                    shouldRotate = true;
                    fileLog(`Rate limited (429).`);
                    delayMs = 60000; // Rate limits usually require a minute
                } else if (!response.ok && (response.status === 403 || response.status === 400 || response.status === 503)) {
                    const cloned = response.clone();
                    try {
                        const errorData: any = await cloned.json();
                        const msg = errorData?.error?.message?.toLowerCase() || '';
                        const reason = errorData?.error?.details?.[0]?.reason?.toLowerCase() || '';
                        const errorStatus = errorData?.error?.status?.toLowerCase() || '';
                        
                        fileLog(`Parsed error: msg="${msg}", reason="${reason}", status="${errorStatus}"`);

                        if (msg.includes('api key not valid') || reason.includes('api_key_invalid')) {
                            isInvalid = true;
                            shouldRotate = true;
                            fileLog(`Key is INVALID.`);
                        } else if (
                            msg.includes('quota') || 
                            msg.includes('rate limit') || 
                            reason.includes('rate_limit') ||
                            reason.includes('quota_exceeded') ||
                            errorStatus === 'resource_exhausted' ||
                            errorStatus === 'unavailable'
                        ) {
                            shouldRotate = true;
                            fileLog(`Quota exhausted/Resource exhausted.`);
                            
                            // Try to extract delay from header
                            const retryAfter = response.headers.get('retry-after');
                            if (retryAfter) {
                                const parsed = parseInt(retryAfter, 10);
                                if (!isNaN(parsed) && parsed > 0) {
                                    delayMs = parsed * 1000;
                                }
                            } else {
                                // Try to extract from error message e.g., "reset after 30s" or "reset after 1h"
                                const afterMatch = msg.match(/reset after\s+([0-9.]+)(s|m|h)/i);
                                if (afterMatch) {
                                    const val = parseFloat(afterMatch[1]);
                                    const unit = afterMatch[2].toLowerCase();
                                    if (unit === 's') delayMs = val * 1000;
                                    if (unit === 'm') delayMs = val * 60 * 1000;
                                    if (unit === 'h') delayMs = val * 3600 * 1000;
                                } else {
                                    // Look for retryDelay in details
                                    if (errorData?.error?.details) {
                                        for (const detail of errorData.error.details) {
                                            if (detail['@type']?.includes('RetryInfo') && detail.retryDelay) {
                                                const match = detail.retryDelay.match(/(\d+)(?:\.\d+)?s/);
                                                if (match) delayMs = parseInt(match[1], 10) * 1000;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        fileLog(`Could not parse JSON error response: ${e}`);
                    }
                }

                if (isInvalid) {
                    activeState.isValid = false;
                    showToast(`API Key (${activeKeyMasked}) is invalid. Removing from rotation.`, "error", 5000);
                    continue;
                }

                if (shouldRotate) {
                    // Apply cooldown to this key
                    activeState.availableAt = Date.now() + delayMs;
                    
                    const statusMsg = response.status === 429 ? "Rate limited" : "Quota exhausted";
                    showToast(`${statusMsg} on key ${activeKeyMasked}. Cooldown: ${Math.ceil(delayMs/1000)}s. Rotating...`, "warning", 3000);
                    fileLog(`Key put on cooldown for ${delayMs}ms. Will rotate to next best key.`);
                    attempts++;
                    continue;
                }

                fileLog(`Success or non-retryable error. Breaking loop and returning response.`);
                return response;
            }

            return originalFetch(reqInfo, init);
        };


        globalThis.fetch = Object.assign(customFetch, originalFetch);
    }

    return {};
};

export default {
    id: "gemini-key-rotator",
    server
} satisfies PluginModule;
