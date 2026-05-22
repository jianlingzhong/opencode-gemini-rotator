# Support

Thanks for using `opencode-gemini-rotator`. Here's the fastest path
to an answer depending on what you need.

## "How do I do X?" / general usage questions

Use **GitHub Discussions** for questions, design discussions, and
suggestions:

<https://github.com/jianlingzhong/opencode-gemini-rotator/discussions>

Examples that belong here:

- "How do I configure rotation cooldowns?"
- "Will this work with `<some other OpenCode setup>`?"
- "What's the recommended pool size for free-tier Gemini keys?"

## "I think it's broken" / bugs and regressions

Use **GitHub Issues**:

<https://github.com/jianlingzhong/opencode-gemini-rotator/issues/new/choose>

Pick the **Bug report** template. Please include:

- OpenCode version (`opencode --version`)
- Plugin version (from `package.json` or `npm ls`)
- Node / Bun version
- OS
- Minimal reproducer
- The relevant slice of `opencode.json` (redact your real keys)
- Optionally: the debug log after running with
  `OPENCODE_GEMINI_DEBUG=1` (redact any real keys)

## "I have an idea for a new feature"

Use the **Feature request** template under
[New Issue](https://github.com/jianlingzhong/opencode-gemini-rotator/issues/new/choose).
Describe the problem you're trying to solve first; specific solution
ideas are welcome but optional.

## "I think I found a security issue"

**Do not open a public issue.** Use one of the private channels in
[SECURITY.md](./SECURITY.md):

1. GitHub Security Advisory (preferred):
   <https://github.com/jianlingzhong/opencode-gemini-rotator/security/advisories/new>
2. Email: <jianlingzh@gmail.com>

## Maintenance & response

This is a single-maintainer project. Best-effort response times:

- Security advisories: within 5 business days
- Bug reports: within 2 weeks
- Feature requests / discussions: when possible; community PRs welcome

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before sending a PR.
