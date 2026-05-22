# opencode-gemini-rotator

[![CI](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/ci.yml/badge.svg)](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [OpenCode](https://opencode.ai) plugin that transparently rotates across
multiple Google **Gemini API keys**. When a request hits a rate-limit (HTTP
429) or quota error (HTTP 403/503 `RESOURCE_EXHAUSTED`), the plugin clones the
request, swaps in the next healthy key, and retries — all without the calling
code knowing anything happened.

## Features

- **Multiple key pool** — pass keys as an array, comma-separated string, or
  via the `GEMINI_API_KEYS` environment variable.
- **Smart cooldowns** — exhausted keys are parked for a cooldown period
  (parsed from the API's `Retry-After` header or error message when possible).
- **Permanent invalidation** — keys returning `API_KEY_INVALID` are removed
  from rotation for the rest of the session.
- **Transparent interception** — monkey-patches `globalThis.fetch`, so the
  `@opencode-ai/sdk` and any other library code Just Works.
- **OAuth-aware** — `ya29.` tokens (or any `Bearer ` prefix) are sent in the
  `Authorization` header; raw API keys go in `x-goog-api-key`.
- **TUI sidebar** — shows the active key index, masked value, and pool size
  in the OpenCode right-side panel, refreshed in real time.
- **Scoped impact** — only requests to `generativelanguage.googleapis.com`
  are touched; everything else passes straight through.

## Installation

### Option A — Local plugin (clone & build)

```bash
git clone https://github.com/jianlingzhong/opencode-gemini-rotator.git
cd opencode-gemini-rotator
bun install
bun run build
```

Then point your OpenCode config (e.g. `~/.config/opencode/opencode.json`)
at the absolute path:

```json
{
  "plugin": [
    ["/absolute/path/to/opencode-gemini-rotator", {
      "keys": [
        "AIza...your-first-key",
        "AIza...your-second-key"
      ]
    }]
  ]
}
```

### Option B — Environment variable (no keys in config)

```json
{
  "plugin": [
    "/absolute/path/to/opencode-gemini-rotator"
  ]
}
```

```bash
export GEMINI_API_KEYS="AIza...key1,AIza...key2,AIza...key3"
opencode
```

## How it works

1. **Init.** On startup, the plugin records each key as "healthy" with
   `availableAt: 0`.
2. **Intercept.** It hooks `globalThis.fetch`. Requests to hosts other than
   `generativelanguage.googleapis.com` are passed through unchanged.
3. **Key selection.** Any key/token already present on the inbound request
   (header or `?key=` query param) is added to the candidate pool, so
   OpenCode's native credentials remain in play.
4. **Header normalization.** Keys starting with `ya29.` or `Bearer ` are
   placed in the `Authorization` header; everything else goes in
   `x-goog-api-key`. The `?key=` query param is stripped.
5. **Failure & rotation.**
   - `429` → cooldown 60 s, rotate.
   - `403`/`503` with `RESOURCE_EXHAUSTED` or quota text → cooldown derived
     from `Retry-After` header or error message (`reset after 30s`), rotate.
   - `400` with `API_KEY_INVALID` → mark the key invalid for the session,
     rotate.
   - Anything else → response is returned to the caller untouched.
6. **Toast notification.** Each rotation pops a transient warning in the
   OpenCode TUI.

## Debugging

File logging is **opt-in**. Enable it by either:

```bash
export OPENCODE_GEMINI_DEBUG=1
```

…or by passing `logFile` in the plugin options:

```json
[["/path/to/opencode-gemini-rotator", { "keys": [...], "logFile": "/tmp/gemini-rotator.log" }]]
```

Then tail the log:

```bash
tail -f /tmp/gemini-rotator-debug.log
```

## Development

```bash
bun install
bun run test           # unit tests
bun run test:coverage  # with coverage report
bun run typecheck      # tsc --noEmit
bun run build          # produces ./dist
```

## Security

Please do not commit real API keys to any branch. If you find a vulnerability,
see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
