# Security Policy

## Reporting a Vulnerability

If you believe you've found a security issue in `opencode-gemini-rotator`,
please **do not file a public GitHub issue**. Instead, email the maintainer
directly:

**jianlingzh@gmail.com**

Include:

- A description of the issue
- Steps to reproduce
- The affected version (`package.json` `version` field)
- Any suggested mitigation

You should receive an acknowledgment within 5 business days. Disclosure
timelines will be coordinated based on severity.

## Scope

This plugin handles Google Gemini API keys. Of particular interest:

- API key leakage via logs, error messages, or sidebar output
- Bypass of the per-key cooldown logic that could result in unintended
  request amplification
- Any path that could exfiltrate request bodies to unintended hosts

## Out of scope

- Vulnerabilities in OpenCode itself — please report those upstream.
- Vulnerabilities in transitive npm dependencies — please report those to
  the dependency maintainer (we'll bump versions after upstream releases a
  fix).

## Handling secrets

- Never paste real API keys into issues, PRs, tests, or logs.
- The repo's `.gitallowed` lists known-safe test patterns; anything else
  triggering secret-scanning should be assumed real.
