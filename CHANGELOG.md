# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-05-22

Initial release.

### Features

- Transparent `globalThis.fetch` interceptor scoped to
  `generativelanguage.googleapis.com`.
- Multi-key pool from inline config, comma-separated string, or
  `GEMINI_API_KEYS` environment variable.
- Smart cooldown derived from `Retry-After` header or `reset after Xs`
  error message; healthy keys are always preferred.
- Permanent invalidation for `API_KEY_INVALID` responses (per session).
- OAuth-aware header routing: `ya29.*` / `Bearer`-prefixed values go
  in `Authorization`; raw API keys go in `x-goog-api-key`.
- Real-time TUI sidebar showing active key index, masked value, and
  pool size.
- Opt-in debug logging via `OPENCODE_GEMINI_DEBUG=1` or the `logFile`
  plugin option.
- `zod`-validated plugin options at the trust boundary.
- Consistent key masking (`prefix…suffix`) across logs, toasts, and
  the sidebar.
