# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Prepared the project for public release.
- File-based debug logging is now **opt-in** via `OPENCODE_GEMINI_DEBUG=1`
  or by passing `logFile` in the plugin options. Previously, the server
  always logged to `/tmp/gemini-rotator-debug.log`.
- TUI debug logging (`/tmp/gemini-rotator-tui.log`,
  `/tmp/gemini-rotator-config.log`) is now gated on the same env var.
- Strict-typed the public surface (`RotatorOptions`, `ToastClient`,
  `GeminiErrorBody`) and removed `any` casts from the core path.
- Removed the previously committed `dist/` build output from git;
  consumers should rely on `npm install` or `bun run build`.

### Added
- 18 unit tests (up from 5) covering routing, header normalization,
  multi-source key parsing, env-var fallback, 429/403/400 rotation,
  permanent invalidation, abort handling, and `patch`/`unpatch`.
- `SECURITY.md`, `CHANGELOG.md`, this file.
- `test:coverage` and `typecheck` npm scripts.

### Removed
- The tracked `.opencode/` developer-runtime directory (now in `.gitignore`).

## [1.0.4] - 2026-04-18

Initial implementation milestone, including the TUI sidebar and the
file-based IPC between the server-side rotator and the sidebar widget.
