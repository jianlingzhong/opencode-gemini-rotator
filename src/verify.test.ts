import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { server } from './server.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Plugin Verification', () => {
    const logFile = path.join(os.tmpdir(), 'gemini-rotator-verify.log');
    const statusFile = path.join(os.tmpdir(), 'gemini-rotator-status.json');

    beforeEach(() => {
        fs.writeFileSync(logFile, '');
    });

    afterAll(() => {
        try {
            if (fs.existsSync(statusFile)) {
                fs.unlinkSync(statusFile);
            }
        } catch (e) {}
    });

    it('should intercept and log requests', async () => {
        console.log("\n1. Stubbing global fetch...");
        const originalFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: {
                message: "API key not valid. Please pass a valid API key.",
                status: "INVALID_ARGUMENT",
                details: [{ reason: "API_KEY_INVALID" }]
            }
        }), { status: 400 }));
        vi.stubGlobal('fetch', originalFetch);

        console.log("2. Initializing plugin with fake keys...");
        const mockClient = { 
            tui: { 
                showToast: vi.fn().mockResolvedValue({}) 
            } 
        };
        
        await server({ client: mockClient } as any, { 
            keys: ['FAKE_KEY_1', 'FAKE_KEY_2'],
            logFile: logFile
        });

        console.log("\n3. Making a fetch request to Gemini API...");
        try {
            const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: "Hello" }] }] })
            });
            console.log("Response Status:", res.status);
            // Wait for log file to be written
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.error("Fetch failed:", e);
        }

        console.log("\n4. Checking the debug log to verify interception and rotation...");
        if (fs.existsSync(logFile)) {
            const logContent = fs.readFileSync(logFile, 'utf-8');
            console.log(logContent);
            expect(logContent).toContain('Intercepting Gemini Request');
            expect(logContent).toContain('FAKE_KEY_1');
        } else {
            console.log("Log file not found!");
            throw new Error("Log file not found");
        }
    });
});
