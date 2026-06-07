# Contributing

Thanks for your interest in `convex-tenant-guard`. It's a small, focused
library, and the goal is to keep it that way: a handful of correct, well-tested
helpers with zero runtime dependencies.

## Development

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest
pnpm build       # tsup → dist (ESM + CJS + .d.ts)
```

All three must pass; CI runs the same steps on every push and pull request.

## Guidelines

- **Keep it dependency-free.** Runtime `dependencies` should stay empty.
- **Fail closed.** Any new helper that makes an access decision must deny on
  missing or nullish inputs, never default to "allowed". Add a test that proves
  it.
- **Add a test for every change.** Bug fixes start with a failing test that
  reproduces the issue.
- **Stay focused.** Scope is row-level tenant ownership for Convex-style
  document reads. Broader auth/RBAC concerns are out of scope by design.

## Reporting a security issue

If you believe you've found a way to bypass a tenant check, please open a
private security advisory on GitHub rather than a public issue.
