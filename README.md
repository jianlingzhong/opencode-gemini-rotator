# OpenCode Gemini Key Rotator Plugin

This plugin for [OpenCode](https://opencode.ai) intercepts outbound requests to the Gemini API (`generativelanguage.googleapis.com`) and automatically handles rotation across multiple API keys. This is especially useful when encountering rate limits (HTTP 429) or quota errors (HTTP 403/503 Resource Exhausted).

## Features

- **Multiple API Key Support**: Provide an array or a comma-separated string of Gemini API keys.
- **Automatic Rotation**: Smoothly falls back to the next available key when a rate limit, quota exhaustion, or invalid key error is encountered.
- **Smart Cooldowns**: Tracks cooldown periods (e.g., 60 seconds for 429 errors or dynamically parsed delays) and prioritizes healthy keys automatically.
- **Transparent Execution**: Monkey-patches `globalThis.fetch` allowing the `@opencode-ai/sdk` to work without any underlying library changes.
- **Real-time Sidebar Status**: Displays the currently active key index, its masked value, and the total pool size in the OpenCode right-side panel.
- **Non-Destructive Integration**: Works flawlessly with your existing OpenCode native credentials (including OAuth `ya29.` tokens or Bearer tokens).

---

## Installation

This plugin is currently designed to be used locally via its absolute directory path.

Clone the repository to your machine and build it:

```bash
# Clone the repository (replace with your actual repository URL/path)
git clone <repository-url> opencode-gemini-rotator
cd opencode-gemini-rotator

# Install dependencies and build (using bun or npm)
bun install
bun run build
```

---

## Configuration

To enable the plugin, you must register its **absolute path** in your OpenCode configuration file (typically `opencode.json` or `~/.config/opencode/opencode.json`).

### Option A: Configuration File (Recommended)

You can pass an array of keys directly to the plugin's configuration block.

```json
{
  "plugin": [
    ["/absolute/path/to/opencode-gemini-rotator", {
      "keys": [
        "AIzaSyYourFirstRealBackupKeyHere...",
        "AIzaSyYourSecondRealBackupKeyHere..."
      ]
    }]
  ]
}
```

### Option B: Environment Variable

You can omit the keys from the configuration file and instead provide them via the `GEMINI_API_KEYS` environment variable. 

Update your config:

```json
{
  "plugin": [
    "/absolute/path/to/opencode-gemini-rotator"
  ]
}
```

Then export the environment variable before running OpenCode:

```bash
export GEMINI_API_KEYS="key1,key2,key3"
```

---

## How It Works Under The Hood

1. **Initialization:** On startup, the plugin initializes a cooldown state mapping for all your provided keys.
2. **Fetch Interception:** It transparently hooks into Node's `globalThis.fetch`. Only requests specifically hitting `generativelanguage.googleapis.com` are intercepted.
3. **Primary Key Inclusion:** It checks if a key or OAuth token was provided natively by OpenCode and securely incorporates it as the primary fallback key.
4. **Header Normalization:** If your fallback key is an OAuth Bearer token (`ya29.`), it places it in the `Authorization` header. Standard API keys are placed in the `x-goog-api-key` header.
5. **Failure & Rotation:** 
   - If an HTTP 429 (Rate Limit) or 403 (Quota Exceeded) is returned, the plugin marks that specific key as "exhausted" for a cooldown period (ranging from 10s up to a dynamically parsed duration). 
   - It seamlessly clones the request, switches to the next available healthy key, and transparently retries.
   - A Toast notification is displayed in the Terminal UI to alert you of the rotation.

## Debugging

If you are encountering issues, the plugin logs debug telemetry to `/tmp/gemini-rotator-debug.log`. You can inspect this file to see detailed request flows, header configurations, and rotation timings.

```bash
tail -f /tmp/gemini-rotator-debug.log
```

## License

MIT License.
