/**
 * convex-tenant-guard
 *
 * Tiny, zero-dependency helpers that enforce row-level multi-tenant isolation
 * in Convex (or any document store). One forgotten ownership check is all it
 * takes to hand customer A's data to customer B; these helpers make the check
 * impossible to forget by colocating "fetch" with "verify owner".
 *
 * @example
 * ```ts
 * import { getInTenant } from "convex-tenant-guard";
 *
 * export const getOrder = query({
 *   args: { orderId: v.id("orders") },
 *   handler: async (ctx, { orderId }) => {
 *     const shopId = await requireShop(ctx); // your auth → tenant id
 *     // Throws TenantScopeError if the order is missing OR owned by another shop.
 *     return await getInTenant(ctx.db, orderId, shopId, "shopId");
 *   },
 * });
 * ```
 */

import { TenantScopeError } from "./errors.js";

export { TenantScopeError, isTenantScopeError } from "./errors.js";
export type { TenantScopeFailure } from "./errors.js";

/** Any object that owns a tenant id under some string field. */
type TenantDoc = Record<string, unknown>;

/**
 * The single capability this library needs from a database: `get(id)` that
 * resolves to a document or `null`. Convex's `ctx.db` satisfies this
 * structurally, so you never pass anything extra.
 */
export interface TenantReader {
  get(id: never): Promise<TenantDoc | null>;
}

const DEFAULT_FIELD = "tenantId";

/**
 * Returns `true` if `doc` is non-null and its tenant field equals `tenantId`.
 * Acts as a type guard so the document is narrowed to non-null on the `true`
 * branch.
 */
export function belongsToTenant<T extends TenantDoc>(
  doc: T | null | undefined,
  tenantId: unknown,
  field: string = DEFAULT_FIELD,
): doc is T {
  return doc != null && doc[field] === tenantId;
}

/**
 * Assert that an already-fetched document exists and belongs to `tenantId`,
 * returning it (narrowed to non-null). Throws {@link TenantScopeError}
 * otherwise.
 *
 * Use this when you already have a document in hand (e.g. from a query result)
 * and want a one-liner that guarantees ownership before you act on it.
 */
export function assertTenant<T extends TenantDoc>(
  doc: T | null | undefined,
  tenantId: unknown,
  field: string = DEFAULT_FIELD,
): T {
  if (doc == null) {
    throw new TenantScopeError("NOT_FOUND", field);
  }
  if (doc[field] !== tenantId) {
    throw new TenantScopeError("WRONG_TENANT", field);
  }
  return doc;
}

/**
 * Fetch a document by id and assert it belongs to `tenantId` in one step.
 * Throws {@link TenantScopeError} if it is missing or owned by another tenant.
 *
 * This is the workhorse: it makes "load by id" and "verify owner" a single,
 * un-skippable operation.
 *
 * @typeParam T - the document shape (e.g. Convex `Doc<"orders">`).
 */
export async function getInTenant<T extends TenantDoc>(
  db: TenantReader,
  id: unknown,
  tenantId: unknown,
  field: string = DEFAULT_FIELD,
): Promise<T> {
  // `id` is widened to satisfy structural typing against Convex's branded ids.
  const doc = (await db.get(id as never)) as T | null;
  return assertTenant(doc, tenantId, field);
}

/**
 * Keep only the documents that belong to `tenantId`. A defense-in-depth filter
 * for results you fetched without a tenant-scoped index (you should still
 * prefer a `by_tenant` index — this is the belt to that index's braces).
 */
export function filterByTenant<T extends TenantDoc>(
  docs: readonly T[],
  tenantId: unknown,
  field: string = DEFAULT_FIELD,
): T[] {
  return docs.filter((doc) => doc[field] === tenantId);
}

/**
 * Assert that two documents share the same tenant. Useful when wiring one
 * record to another (e.g. attaching a `payment` to an `order`) to ensure a
 * caller can't bridge data across tenants.
 */
export function assertSameTenant(
  a: TenantDoc | null | undefined,
  b: TenantDoc | null | undefined,
  field: string = DEFAULT_FIELD,
): void {
  if (a == null || b == null) {
    throw new TenantScopeError("NOT_FOUND", field);
  }
  if (a[field] !== b[field]) {
    throw new TenantScopeError("WRONG_TENANT", field);
  }
}

/**
 * Bind every helper to one tenant field so you stop repeating `"shopId"` at
 * every call site. Create it once and export it across your Convex functions.
 *
 * @example
 * ```ts
 * // tenant.ts
 * export const tenant = createTenantGuard("shopId");
 *
 * // anywhere
 * const order = await tenant.get<Doc<"orders">>(ctx.db, orderId, shopId);
 * ```
 */
export function createTenantGuard(field: string = DEFAULT_FIELD) {
  return {
    /** The tenant field these helpers are bound to. */
    field,
    belongs<T extends TenantDoc>(doc: T | null | undefined, tenantId: unknown): doc is T {
      return belongsToTenant(doc, tenantId, field);
    },
    assert<T extends TenantDoc>(doc: T | null | undefined, tenantId: unknown): T {
      return assertTenant(doc, tenantId, field);
    },
    get<T extends TenantDoc>(db: TenantReader, id: unknown, tenantId: unknown): Promise<T> {
      return getInTenant<T>(db, id, tenantId, field);
    },
    filter<T extends TenantDoc>(docs: readonly T[], tenantId: unknown): T[] {
      return filterByTenant(docs, tenantId, field);
    },
    assertSame(a: TenantDoc | null | undefined, b: TenantDoc | null | undefined): void {
      return assertSameTenant(a, b, field);
    },
  };
}

/** A pre-bound guard for the default `"tenantId"` field. */
export type TenantGuard = ReturnType<typeof createTenantGuard>;
