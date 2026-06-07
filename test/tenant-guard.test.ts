import { describe, expect, it } from "vitest";
import {
  assertSameTenant,
  assertTenant,
  belongsToTenant,
  createTenantGuard,
  filterByTenant,
  getInTenant,
  isTenantScopeError,
  TenantScopeError,
  type TenantReader,
} from "../src/index.js";

type Order = { _id: string; tenantId: string; total: number };

const ORDER_A: Order = { _id: "o1", tenantId: "shop_a", total: 100 };
const ORDER_B: Order = { _id: "o2", tenantId: "shop_b", total: 200 };

/** Minimal in-memory stand-in for Convex's `ctx.db`. */
function fakeDb(docs: Record<string, Order>): TenantReader {
  return {
    get: (async (id: string) => docs[id] ?? null) as TenantReader["get"],
  };
}

describe("belongsToTenant", () => {
  it("is true only for matching tenant", () => {
    expect(belongsToTenant(ORDER_A, "shop_a")).toBe(true);
    expect(belongsToTenant(ORDER_A, "shop_b")).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(belongsToTenant(null, "shop_a")).toBe(false);
    expect(belongsToTenant(undefined, "shop_a")).toBe(false);
  });

  it("honours a custom field", () => {
    const row = { shopId: "shop_a" };
    expect(belongsToTenant(row, "shop_a", "shopId")).toBe(true);
    expect(belongsToTenant(row, "shop_a")).toBe(false); // wrong field
  });
});

describe("assertTenant", () => {
  it("returns the doc when owned", () => {
    expect(assertTenant(ORDER_A, "shop_a")).toBe(ORDER_A);
  });

  it("throws NOT_FOUND for null", () => {
    try {
      assertTenant(null, "shop_a");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(isTenantScopeError(err)).toBe(true);
      expect((err as TenantScopeError).code).toBe("NOT_FOUND");
    }
  });

  it("throws WRONG_TENANT for a different tenant", () => {
    try {
      assertTenant(ORDER_A, "shop_b");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TenantScopeError).code).toBe("WRONG_TENANT");
      expect((err as TenantScopeError).field).toBe("tenantId");
    }
  });

  it("uses an identical, non-leaky message for both failure codes", () => {
    const notFound = new TenantScopeError("NOT_FOUND", "tenantId");
    const wrong = new TenantScopeError("WRONG_TENANT", "tenantId");
    expect(notFound.message).toBe(wrong.message);
  });
});

describe("getInTenant", () => {
  const db = fakeDb({ o1: ORDER_A, o2: ORDER_B });

  it("returns the doc for the owning tenant", async () => {
    await expect(getInTenant<Order>(db, "o1", "shop_a")).resolves.toEqual(ORDER_A);
  });

  it("throws WRONG_TENANT when another tenant requests it", async () => {
    await expect(getInTenant<Order>(db, "o2", "shop_a")).rejects.toMatchObject({
      code: "WRONG_TENANT",
    });
  });

  it("throws NOT_FOUND for a missing id", async () => {
    await expect(getInTenant<Order>(db, "missing", "shop_a")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("filterByTenant", () => {
  it("keeps only the owning tenant's rows", () => {
    expect(filterByTenant([ORDER_A, ORDER_B], "shop_a")).toEqual([ORDER_A]);
  });
});

describe("assertSameTenant", () => {
  it("passes when both share a tenant", () => {
    const other: Order = { _id: "o3", tenantId: "shop_a", total: 5 };
    expect(() => assertSameTenant(ORDER_A, other)).not.toThrow();
  });

  it("throws across tenants", () => {
    expect(() => assertSameTenant(ORDER_A, ORDER_B)).toThrow(TenantScopeError);
  });
});

describe("createTenantGuard", () => {
  const tenant = createTenantGuard("shopId");
  type Shopped = { _id: string; shopId: string };
  const row: Shopped = { _id: "x", shopId: "shop_a" };
  const db: TenantReader = {
    get: (async () => row) as TenantReader["get"],
  };

  it("binds the field across every helper", async () => {
    expect(tenant.field).toBe("shopId");
    expect(tenant.belongs(row, "shop_a")).toBe(true);
    expect(tenant.assert(row, "shop_a")).toBe(row);
    await expect(tenant.get<Shopped>(db, "x", "shop_a")).resolves.toBe(row);
    expect(tenant.filter([row], "shop_b")).toEqual([]);
  });

  it("rejects the wrong tenant with the bound field on the error", () => {
    try {
      tenant.assert(row, "shop_b");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TenantScopeError).field).toBe("shopId");
    }
  });
});

describe("fail-closed on nullish tenantId", () => {
  // A row whose tenant field is also nullish must NOT be matched by a nullish
  // tenantId — otherwise `undefined === undefined` silently authorizes access.
  const orphan = { _id: "z", tenantId: undefined } as unknown as Order;

  it("belongsToTenant is false for a nullish tenantId", () => {
    expect(belongsToTenant(orphan, undefined)).toBe(false);
    expect(belongsToTenant(ORDER_A, null)).toBe(false);
  });

  it("assertTenant throws WRONG_TENANT for a nullish tenantId", () => {
    expect(() => assertTenant(orphan, undefined)).toThrow(TenantScopeError);
    try {
      assertTenant(ORDER_A, undefined);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as TenantScopeError).code).toBe("WRONG_TENANT");
    }
  });

  it("filterByTenant returns nothing for a nullish tenantId", () => {
    expect(filterByTenant([orphan, ORDER_A], undefined)).toEqual([]);
  });

  it("assertSameTenant throws when both share a nullish tenant", () => {
    const otherOrphan = { _id: "z2", tenantId: undefined } as unknown as Order;
    expect(() => assertSameTenant(orphan, otherOrphan)).toThrow(TenantScopeError);
  });
});
