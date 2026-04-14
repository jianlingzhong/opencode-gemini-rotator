import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiRotator } from './index';

describe('GeminiRotator', () => {
    let rotator: GeminiRotator;
    const mockClient = {
        tui: {
            showToast: vi.fn().mockResolvedValue({})
        }
    };

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
        rotator = new GeminiRotator(mockClient, { keys: ['key1', 'key2'] });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should passthrough non-gemini requests', async () => {
        const originalFetch = globalThis.fetch;
        const response = new Response('ok', { status: 200 });
        vi.mocked(originalFetch).mockResolvedValue(response);

        const res = await rotator.fetch('https://example.com');
        
        expect(res).toBe(response);
        expect(originalFetch).toHaveBeenCalledWith('https://example.com', undefined);
    });

    it('should use x-goog-api-key for standard keys', async () => {
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response('ok', { status: 200 }));

        await rotator.fetch('https://generativelanguage.googleapis.com/v1/models?key=originalKey');
        
        const call = vi.mocked(originalFetch).mock.calls[0];
        const headers = call[1]?.headers as Headers;
        expect(headers.get('x-goog-api-key')).toBe('key1');
        expect(headers.has('Authorization')).toBe(false);
    });

    it('should use Authorization header for ya29. tokens', async () => {
        rotator = new GeminiRotator(mockClient, { keys: ['ya29.test-token'] });
        const originalFetch = globalThis.fetch;
        vi.mocked(originalFetch).mockResolvedValue(new Response('ok', { status: 200 }));

        await rotator.fetch('https://generativelanguage.googleapis.com/v1/models');
        
        const call = vi.mocked(originalFetch).mock.calls[0];
        const headers = call[1]?.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer ya29.test-token');
        expect(headers.has('x-goog-api-key')).toBe(false);
    });

    it('should rotate to the next key on 429 error', async () => {
        const originalFetch = globalThis.fetch;
        
        // First call fails with 429, second succeeds
        vi.mocked(originalFetch)
            .mockResolvedValueOnce(new Response('rate limit', { status: 429 }))
            .mockResolvedValueOnce(new Response('success', { status: 200 }));

        const res = await rotator.fetch('https://generativelanguage.googleapis.com/v1/models?key=key1');
        
        expect(res.status).toBe(200);
        expect(originalFetch).toHaveBeenCalledTimes(2);
        
        // Verify second call used key2
        const secondCallHeaders = vi.mocked(originalFetch).mock.calls[1][1]?.headers as Headers;
        expect(secondCallHeaders.get('x-goog-api-key')).toBe('key2');
    });
});
