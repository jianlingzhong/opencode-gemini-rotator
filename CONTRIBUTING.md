# Contributing to opencode-gemini-rotator

Thanks for your interest in improving this plugin! Contributions of all sizes
are welcome — bug reports, doc fixes, tests, and new features.

## Getting set up

Use [Bun](https://bun.sh) (recommended) or npm.

```bash
git clone https://github.com/jianlingzhong/opencode-gemini-rotator.git
cd opencode-gemini-rotator
bun install
```

## Development loop

```bash
bun run test         # run all unit tests
bun run test:watch   # re-run on file changes
bun run typecheck    # strict TS check, no emit
bun run build        # produce ./dist
```

All source lives in `src/`. The entry points are:

- `src/server.ts` — the core rotator + `globalThis.fetch` interceptor
- `src/tui.tsx`   — the SolidJS sidebar widget
- `src/index.ts`  — re-exports for the OpenCode plugin loader
- `src/shared.ts` — types shared between server and TUI

## Code-quality standards

- **Strict types.** Avoid `any`. The TS config has `strict: true`.
- **No synchronous I/O on the network path.** Use `fs.promises`.
- **No secrets in tests.** Use obvious fakes (e.g. `FAKE_KEY_1`,
  `ya29.test-token`). The `.gitallowed` file whitelists known-safe patterns.
- **Tests required.** Any new feature or bug fix should include a test in
  `src/server.test.ts` (or a sibling `*.test.ts` file).

## Submitting a PR

1. Create a branch off `main`.
2. Make your change with tests.
3. Run `bun run typecheck && bun run test`.
4. Push and open a PR. Describe *what* changed and *why*.
5. CI must be green before merge.

## Reporting bugs

Open an issue with:
- OpenCode version (`opencode --version`)
- Node/Bun version
- The relevant portion of `~/.config/opencode/opencode.json` (redacted)
- A minimal repro and the observed vs expected behavior
