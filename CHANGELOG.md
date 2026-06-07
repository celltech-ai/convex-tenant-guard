# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Fail closed when `tenantId` is nullish. A nullish tenant id (e.g. auth that
  resolved to `undefined`) no longer matches a row whose tenant field is also
  nullish. Affects `belongsToTenant`, `assertTenant`, `getInTenant`,
  `filterByTenant`, and `assertSameTenant`.

### Added
- GitHub Actions CI (typecheck, build, test) on push and pull request.

## [0.1.0] - 2026-06-07

### Added
- Initial release: `getInTenant`, `assertTenant`, `belongsToTenant`,
  `filterByTenant`, `assertSameTenant`, and `createTenantGuard`.
- `TenantScopeError` with `code` (`NOT_FOUND` | `WRONG_TENANT`) and `field`,
  plus the `isTenantScopeError` type guard. Default message is intentionally
  identical across codes to avoid resource enumeration.
- ESM + CJS builds with TypeScript declarations. Zero runtime dependencies.

[Unreleased]: https://github.com/celltech-ai/convex-tenant-guard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/celltech-ai/convex-tenant-guard/releases/tag/v0.1.0
