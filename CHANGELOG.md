# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.5] - 2026-05-22

### Changed

- Prepared the project for public open-source release.
- **BREAKING (debug only):** file-based debug logging is now **opt-in**.
  Enable via `OPENCODE_GEMINI_DEBUG=1` or by passing `logFile` in the
  plugin options. Previously, the server always logged to
  `/tmp/gemini-rotator-debug.log` and the TUI sidebar always logged to
  `/tmp/gemini-rotator-{tui,config}.log` on every render.
- Strict-typed the public surface (`RotatorOptions`, `ToastClient`,
  `GeminiErrorBody`) and removed `any` casts from the core path.
- Extracted `maskKey()` helper; key display in logs/toasts/sidebar now
  uses a consistent `prefix…suffix` format (e.g. `AIza…1234`) and
  always labels OAuth tokens.
- TUI sidebar no longer carries dead `setSessionModel` state.
- `prepublishOnly` now runs `typecheck && test && build`.

### Added

- 21 unit tests (up from 5), covering routing, header normalization,
  multi-source key parsing (array/string/env), env-var fallback,
  empty-key filtering, `?key=` stripping, 429/403/400 rotation,
  permanent `API_KEY_INVALID` handling, pass-through for non-rotatable
  errors, abort handling, `patch`/`unpatch`, and the `maskKey` helper.
- `vitest.config.ts` with v8 coverage; ~80% coverage on `src/server.ts`.
- `_resetForTesting()` helper so the singleton in `src/server.ts` can
  cleanly restore `globalThis.fetch` between test files.
- `SECURITY.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `.npmignore`,
  `.prettierrc`, `.prettierignore`, `.editorconfig`.
- GitHub bells & whistles:
    - issue templates (bug, feature) and PR template
    - `CODEOWNERS`
    - `dependabot.yml` (weekly npm + monthly actions)
    - `release.yml` workflow (tag push → npm publish with provenance)
    - `codeql.yml` workflow (free static security analysis)
    - CI matrix on Ubuntu + macOS with format check
- `prettier` formatter, with `format` / `format:check` npm scripts.
- Stricter `tsconfig.json` (`noImplicitOverride`,
  `noFallthroughCasesInSwitch`).
- Expanded `keywords` in `package.json` for npm SEO.

### Removed

- The tracked `.opencode/` developer-runtime directory (now in
  `.gitignore`). It previously contained the maintainer's absolute
  filesystem path.
- The tracked `dist/` build artifacts; they are now produced at
  install/publish time.
- The root-level `verify.ts` script (replaced by the proper Vitest
  integration test in `src/verify.test.ts`).

### Security

- File logging defaults to **off** so the plugin no longer writes
  request metadata to `/tmp` without explicit consent.
- Re-authored all historical commits under the maintainer's public
  identity (previously: a bot account).

## [1.0.4] - 2026-04-18

Initial implementation milestone, including the TUI sidebar and the
file-based IPC between the server-side rotator and the sidebar widget.
