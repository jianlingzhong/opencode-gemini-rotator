# Security Policy

## Supported versions

The latest minor release published to npm is the only version that
receives security fixes.

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < latest | :x:                |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of these private channels instead:

1. **GitHub Security Advisory** (preferred): open a draft at
   <https://github.com/jianlingzhong/opencode-gemini-rotator/security/advisories/new>.
2. **Email** the maintainer: **<jianlingzh@gmail.com>**.

Please include:

- A clear description of the issue and its impact.
- Steps to reproduce, including a minimal proof of concept if possible.
- The affected version (from `package.json` or `npm ls`).
- Any suggested mitigation or patch.

You should receive an acknowledgment within 5 business days. Disclosure
timing will be coordinated with you based on severity and patch
readiness.

## Scope

This plugin handles Google Gemini API keys and proxies the OpenCode
`fetch` calls to `generativelanguage.googleapis.com`. Of particular
interest:

- API-key leakage via logs, error messages, toasts, or the sidebar.
- Bypass of the per-key cooldown logic that could lead to unintended
  request amplification or DoS against the upstream API.
- Any path that could redirect or exfiltrate request bodies to a host
  other than `generativelanguage.googleapis.com`.
- Prototype pollution or arbitrary code execution via untrusted config
  values.

## Out of scope

- Vulnerabilities in OpenCode itself — please report those upstream at
  <https://github.com/anomalyco/opencode>.
- Vulnerabilities in transitive npm dependencies — please report those
  to the dependency maintainer. This project will bump versions after
  upstream releases a fix.
- Issues that require an attacker to already have local file-system
  access (e.g. modifying `opencode.json`).

## Handling secrets

- Never paste real API keys into issues, PRs, tests, commits, or logs.
- The repo's `.gitallowed` lists known-safe test patterns; anything
  else triggering secret-scanning should be assumed real.
- GitHub Push Protection and CodeQL run on every push and PR.
