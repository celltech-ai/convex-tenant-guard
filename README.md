# convex-tenant-guard

[![CI](https://github.com/celltech-ai/convex-tenant-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/celltech-ai/convex-tenant-guard/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Tiny, zero-dependency helpers that enforce **row-level multi-tenant isolation** in [Convex](https://convex.dev).

In a multi-tenant SaaS, one forgotten ownership check is all it takes to return customer A's row to customer B. The usual culprit:

```ts
// semantically fine, catastrophically insecure:
const order = await ctx.db.get(orderId); // whose order? nobody checked.
return order;
```

`convex-tenant-guard` makes that mistake hard to make by **colocating "fetch" with "verify owner"** in a single call that throws if the row is missing _or_ owned by another tenant.

```ts
import { getInTenant } from "convex-tenant-guard";

const order = await getInTenant(ctx.db, orderId, shopId, "shopId");
// ✅ guaranteed: order exists AND order.shopId === shopId, or it throws.
```

- **Zero runtime dependencies.** ~1 KB. Works with `ctx.db` structurally — nothing to wire up.
- **Type-safe.** Generic over your document shape; pass `Doc<"orders">` and keep full inference.
- **Enumeration-safe by default.** "Not found" and "wrong tenant" throw the _same_ error with an _identical_ message, so attackers can't probe which ids exist. `error.code` tells _you_ the difference in logs.

## Install

```bash
npm i convex-tenant-guard
# or: pnpm add convex-tenant-guard
```

`convex` is an optional peer dependency — only used for types in your own code, never imported here.

## The problem it solves

Convex gives you `ctx.db.get(id)` and indexed queries, but **it does not know about your tenants.** Every read is your responsibility to scope. Teams usually scatter checks like this:

```ts
const ticket = await ctx.db.get(ticketId);
if (!ticket || ticket.shopId !== shopId) throw new Error("Not found");
```

…and the day someone forgets the `||` half, you have a cross-tenant data leak that no type checker will catch. This library turns that three-line ritual into one un-skippable call, and gives you a regression-test-friendly error type.

## API

All helpers take the tenant field name as the last argument (default `"tenantId"`).

### `getInTenant(db, id, tenantId, field?)`
Fetch by id **and** assert ownership in one step. Throws `TenantScopeError` if missing or owned by another tenant. This is the one you'll reach for most.

```ts
const order = await getInTenant<Doc<"orders">>(ctx.db, orderId, shopId, "shopId");
```

### `assertTenant(doc, tenantId, field?)`
You already have a document (say, from a query). Assert it's owned, get it back narrowed to non-null, or throw.

```ts
const [latest] = await ctx.db.query("invoices").withIndex(/* … */).take(1);
return assertTenant(latest, shopId, "shopId");
```

### `belongsToTenant(doc, tenantId, field?)`
A boolean type-guard for branching instead of throwing.

```ts
if (belongsToTenant(doc, shopId, "shopId")) {
  // doc is narrowed to non-null here
}
```

### `filterByTenant(docs, tenantId, field?)`
Defense-in-depth: keep only the owning tenant's rows from a list. (Prefer a `by_shop` index first — this is the belt to that index's braces.)

### `assertSameTenant(a, b, field?)`
Ensure two documents share a tenant before linking them (e.g. attaching a `payment` to an `order`), so a caller can't bridge records across tenants.

### `createTenantGuard(field?)`
Bind every helper to one field so you stop repeating `"shopId"` everywhere.

```ts
// tenant.ts
import { createTenantGuard } from "convex-tenant-guard";
export const tenant = createTenantGuard("shopId");

// anywhere
const order = await tenant.get<Doc<"orders">>(ctx.db, orderId, shopId);
const mine = tenant.filter(rows, shopId);
```

### Errors

`TenantScopeError` carries:
- `code`: `"NOT_FOUND" | "WRONG_TENANT"` — for your logs.
- `field`: the document field that was checked.

Map both codes to a single `404` at your boundary to avoid leaking which ids exist:

```ts
import { isTenantScopeError } from "convex-tenant-guard";

try {
  return await getInTenant(ctx.db, id, shopId, "shopId");
} catch (err) {
  if (isTenantScopeError(err)) throw new ConvexError("Not found"); // uniform 404
  throw err;
}
```

## Recommended pattern

1. Put `shopId` (or `tenantId`) **first** on every tenant-owned table and add a `by_shop` index.
2. Derive the tenant id from the **authenticated session**, never from client args.
3. Use a `by_shop` index for lists; use `getInTenant` for single-document reads.
4. Add a guard test that fails if a query reads a tenant table without scoping.

`convex-tenant-guard` covers step 3 and supports step 4 with a typed, assertable error.

## Fail-closed semantics

Every helper treats a **nullish `tenantId` as "no access"** rather than risking a `undefined === undefined` match against an orphaned row:

- `belongsToTenant` → `false`
- `assertTenant` / `getInTenant` → throw `WRONG_TENANT`
- `filterByTenant` → `[]`
- `assertSameTenant` → throws if both documents share a nullish tenant value

So if your auth ever resolves the tenant id to `undefined`, the request is denied, not silently authorized.

## License

MIT
