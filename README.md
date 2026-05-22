# opencode-gemini-rotator

[![CI](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/ci.yml/badge.svg)](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/codeql.yml/badge.svg)](https://github.com/jianlingzhong/opencode-gemini-rotator/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/opencode-gemini-rotator.svg)](https://www.npmjs.com/package/opencode-gemini-rotator)
[![npm downloads](https://img.shields.io/npm/dm/opencode-gemini-rotator.svg)](https://www.npmjs.com/package/opencode-gemini-rotator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/opencode-gemini-rotator.svg)](https://nodejs.org)

> **Stop hitting Gemini rate limits.** An [OpenCode](https://opencode.ai)
> plugin that transparently rotates a pool of Google Gemini API keys when
> requests get rate-limited (HTTP 429) or quota-exhausted (HTTP 403/503
> `RESOURCE_EXHAUSTED`). Drop in, configure your keys, forget about quotas.

## Table of contents

- [Why](#why)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Debugging](#debugging)
- [Development](#development)
- [FAQ](#faq)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Why

[OpenCode](https://opencode.ai) uses your Gemini API key for every request.
When you hit your per-key per-minute quota, OpenCode stalls. This plugin
maintains a small pool of keys and rotates to the next healthy one
automatically — your session keeps moving without you doing anything.

## Features

- **Pool of keys** — pass keys as an array, comma-separated string, or via
  the `GEMINI_API_KEYS` environment variable.
- **Smart cooldowns** — exhausted keys are parked for a cooldown derived
  from the `Retry-After` header or the error message
  (e.g. `reset after 30s`); healthy keys are always preferred.
- **Permanent invalidation** — keys returning `API_KEY_INVALID` are removed
  from the rotation for the rest of the session.
- **Transparent interception** — monkey-patches `globalThis.fetch`, so the
  `@opencode-ai/sdk` and any other code Just Works without modification.
- **OAuth-aware** — `ya29.*` and `Bearer `-prefixed values are sent in the
  `Authorization` header; raw API keys go in `x-goog-api-key`.
- **TUI sidebar** — shows the active key index, masked value, and pool size
  in the OpenCode right-side panel, refreshed in real time.
- **Scoped impact** — only requests to `generativelanguage.googleapis.com`
  are touched; everything else passes straight through to the original
  `fetch`.
- **No secrets in logs** — keys are masked (`AIza…1234`) everywhere they
  surface.

## Installation

Requires **Node 18+** (or Bun) and OpenCode `1.4.3` or newer.

### Option A — npm (recommended)

Just add the package name to your OpenCode config; OpenCode auto-installs
npm plugins on startup using its bundled Bun. See the upstream
[plugin docs](https://opencode.ai/docs/plugins/#from-npm).

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["opencode-gemini-rotator"]
}
```

Then export your keys (or use the inline form below):

```bash
export GEMINI_API_KEYS="AIza...key1,AIza...key2,AIza...key3"
opencode
```

### Option B — Local plugin (clone & build)

```bash
git clone https://github.com/jianlingzhong/opencode-gemini-rotator.git
cd opencode-gemini-rotator
bun install
bun run build
```

Then point OpenCode at the absolute path:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": ["/absolute/path/to/opencode-gemini-rotator"]
}
```

## Configuration

OpenCode loads plugins via its config file
(`~/.config/opencode/opencode.json` or project-local
`.opencode/opencode.json`).

### Inline keys (per-plugin options)

When you want to keep keys in the config file (instead of an env var),
use the tuple form `[name, options]`:

```json
{
    "$schema": "https://opencode.ai/config.json",
    "plugin": [
        [
            "opencode-gemini-rotator",
            {
                "keys": ["AIza...your-first-key", "AIza...your-second-key"]
            }
        ]
    ]
}
```

Replace `"opencode-gemini-rotator"` with an absolute path if you're
running from a local clone.

### Plugin options

| Option    | Type                 | Default                               | Description                                         |
| --------- | -------------------- | ------------------------------------- | --------------------------------------------------- |
| `keys`    | `string[] \| string` | `process.env.GEMINI_API_KEYS`         | Pool of API keys.                                   |
| `logFile` | `string` (path)      | _none_ (logging off unless `DEBUG=1`) | When set, debug telemetry is appended to this file. |

## How it works

1. **Init.** Each configured key is registered as healthy
   (`isValid: true, availableAt: 0`).
2. **Intercept.** The plugin hooks `globalThis.fetch`. Requests to hosts
   other than `generativelanguage.googleapis.com` pass through unchanged.
3. **Key selection.** Any key already present on the inbound request
   (header or `?key=` query param) is added to the candidate pool so
   OpenCode's native credentials remain in play.
4. **Header normalization.** Keys starting with `ya29.` or `Bearer ` are
   placed in the `Authorization` header; everything else goes in
   `x-goog-api-key`. The `?key=` query param is stripped from the URL.
5. **Failure & rotation.**
    - `429` → cooldown 60 s, rotate.
    - `403`/`503` with `RESOURCE_EXHAUSTED` or quota text → cooldown
      derived from `Retry-After` header or error message
      (e.g. `reset after 30s`), rotate.
    - `400` with `API_KEY_INVALID` → mark the key invalid for the session,
      rotate.
    - Anything else → response is returned to the caller untouched.
6. **All-on-cooldown.** If every key is parked, the rotator sleeps until
   the earliest `availableAt`, then retries.
7. **Toast notification.** Each rotation pops a transient warning in the
   OpenCode TUI.

## Debugging

File logging is **opt-in**. Enable it by either:

```bash
export OPENCODE_GEMINI_DEBUG=1
```

…or by passing `logFile` in the plugin options:

```json
["/path/to/opencode-gemini-rotator", { "keys": ["AIza..."], "logFile": "/tmp/gemini-rotator.log" }]
```

Then tail the log:

```bash
tail -f /tmp/gemini-rotator-debug.log
```

The TUI sidebar widget writes a small status JSON to
`$TMPDIR/gemini-rotator-status.json` so it can poll cross-process state;
this file is harmless and contains only the current key index, masked
value, and pool size.

## Development

```bash
bun install
bun run test           # 21 unit tests
bun run test:coverage  # v8 coverage report
bun run typecheck      # tsc --noEmit
bun run format         # prettier --write .
bun run format:check   # prettier --check .
bun run build          # produce ./dist
```

CI runs typecheck, format check, tests, and build on every push and PR
across Ubuntu and macOS.

## FAQ

**Does this proxy my prompts somewhere?**
No. Requests still go directly to `generativelanguage.googleapis.com`.
The plugin only swaps the auth header and retries on failure.

**Will it work with the OAuth flow / `ya29.` tokens?**
Yes. OAuth bearer tokens are detected and sent in the `Authorization`
header. They count as one entry in the pool.

**What happens if all keys are exhausted?**
The plugin sleeps until the earliest key's cooldown expires, then retries
— unless the caller aborts the request (`AbortSignal`), in which case the
promise rejects with `Aborted`.

**Does it touch non-Gemini requests?**
No. Anything not addressed to `generativelanguage.googleapis.com` is
passed straight through to the original `fetch`.

**Does it cache or persist anything across sessions?**
No. All state (cooldowns, invalid-key flags) is in-memory and resets when
OpenCode restarts.

## Security

Please **do not** commit real API keys to any branch. If you discover a
vulnerability, see [SECURITY.md](./SECURITY.md) for the private
disclosure process.

## Contributing

Bug reports, doc fixes, and PRs are welcome. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, and
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for expected behavior.

## License

[MIT](./LICENSE) © Jianling Zhong
