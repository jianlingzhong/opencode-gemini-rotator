# Contributing to opencode-gemini-rotator

Thanks for your interest in improving this plugin! Contributions of all
sizes are welcome — bug reports, doc fixes, tests, and new features.

## Getting set up

We use [Bun](https://bun.sh) for development. (npm/pnpm users can
substitute equivalent commands but the build script depends on
`bun build`.)

```bash
git clone https://github.com/jianlingzhong/opencode-gemini-rotator.git
cd opencode-gemini-rotator
bun install
```

## Development loop

```bash
bun run test           # unit + property-based tests
bun run test:watch     # re-run on file changes
bun run test:coverage  # v8 coverage report
bun run typecheck      # tsc --noEmit
bun run format         # prettier --write .
bun run format:check   # prettier --check .
bun run build          # produce ./dist
```

All source lives in `src/`:

- `src/server.ts` — core rotator + `globalThis.fetch` interceptor
- `src/tui.tsx` — SolidJS sidebar widget
- `src/index.ts` — re-exports for the OpenCode plugin loader
- `src/shared.ts` — types shared between server and TUI
- `src/server.test.ts` — unit tests for the rotator class and helpers
- `src/properties.test.ts` — property-based tests (`fast-check`) for pure functions
- `src/verify.test.ts` — integration smoke test for the `server` factory

## Code-quality standards

- **Strict types.** Avoid `any`. `tsconfig.json` enables `strict: true`,
  `noImplicitOverride`, and `noFallthroughCasesInSwitch`.
- **Formatting.** Run `bun run format` before committing. CI enforces
  `format:check`.
- **No synchronous I/O on the network path.** Use `fs.promises`.
- **No secrets in tests.** Use obvious fakes (e.g. `FAKE_KEY_1`,
  `ya29.test-token`). The `.gitallowed` file whitelists known-safe
  patterns for secret scanners.
- **Tests required.** Any new feature or bug fix should include a test
  in `src/server.test.ts` (or a sibling `*.test.ts` file).
- **Mask all key output.** Pipe any user-facing key strings through
  `maskKey()` from `src/server.ts`.

## Commit messages

Use conventional-commit-style prefixes when possible:

```text
feat: add support for X
fix: handle Y edge case in rotation
docs: clarify Z in README
chore: bump deps
test: cover the W branch
refactor: extract V helper
```

## Submitting a PR

1. Create a branch off `main`.
2. Make your change with tests.
3. Run `bun run format && bun run typecheck && bun run test`.
4. Update `CHANGELOG.md` under `## [Unreleased]`.
5. Push and open a PR using the provided template.
6. CI must be green before merge.

## Releasing (maintainers only)

Releases are automated by `.github/workflows/release.yml`:

1. Bump `version` in `package.json`.
2. Move the `[Unreleased]` block in `CHANGELOG.md` under a new version
   heading.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. CI will typecheck/test/build, verify the tag matches `package.json`,
   publish to npm with provenance, and create a GitHub Release with
   auto-generated notes.

Requires the `NPM_TOKEN` repository secret.

## Reporting bugs

Open an issue using the bug-report template. Include:

- OpenCode version (`opencode --version`)
- Plugin version (from `package.json` or `npm ls`)
- Node / Bun version
- OS
- The relevant portion of `opencode.json` (with keys redacted)
- A minimal repro and the observed vs expected behavior
- Optional: contents of `/tmp/gemini-rotator-debug.log` after running
  with `OPENCODE_GEMINI_DEBUG=1` (redact any real keys)
