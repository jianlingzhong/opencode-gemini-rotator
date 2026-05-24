# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0](https://github.com/jianlingzhong/opencode-gemini-rotator/compare/v1.0.0...v1.1.0) (2026-05-24)


### Features

* file-based IPC for TUI sidebar cross-process state ([5cdaa61](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/5cdaa61e523088491a7cefd2ed3687ebbf7ca2ef))
* hide TUI sidebar when no Gemini activity is detected ([346873e](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/346873e97537c26867b5140f9dcaecffc46550aa))
* initial implementation of opencode-gemini-rotator plugin ([f7000f7](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/f7000f77ebcd7b6a4809a51cc0110e79c65a6c2e))
* real-time TUI sidebar status using SolidJS and OpenTUI slots ([177f6af](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/177f6af5cec64851e3cf005a178c07c53a5908a6))


### Bug Fixes

* drop stryker JSDoc type import; defer codeql/scorecard to dispatch-only ([02ead5c](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/02ead5c59a1b66947f47160385b8a44db58e88f3))
* wrap conditional SolidJS Show in a persistent box element ([16ff883](https://github.com/jianlingzhong/opencode-gemini-rotator/commit/16ff8836f993c9006f0ceaed7b22ae55c091b903))

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
