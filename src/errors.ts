/**
 * Why a tenant-scope check failed.
 *
 * - `NOT_FOUND`    — the document did not exist (or `db.get` returned `null`).
 * - `WRONG_TENANT` — the document exists but belongs to a different tenant.
 *
 * Both are surfaced as the same {@link TenantScopeError} type, and the default
 * message is intentionally identical, so callers can map every failure to a
 * single `404` and avoid leaking which IDs exist (resource enumeration).
 * Read `error.code` when you genuinely need to tell the two apart in logs.
 */
export type TenantScopeFailure = "NOT_FOUND" | "WRONG_TENANT";

/** Thrown when a document is missing or owned by a different tenant. */
export class TenantScopeError extends Error {
  /** Machine-readable reason. See {@link TenantScopeFailure}. */
  readonly code: TenantScopeFailure;
  /** The document field that was checked (e.g. `"tenantId"`, `"shopId"`). */
  readonly field: string;

  constructor(code: TenantScopeFailure, field: string, message?: string) {
    // Default message is deliberately generic and identical for both codes
    // so it can't be used to probe which document IDs exist.
    super(message ?? "Resource not found or not accessible");
    this.name = "TenantScopeError";
    this.code = code;
    this.field = field;
    // Restore prototype chain for instanceof across compiled targets.
    Object.setPrototypeOf(this, TenantScopeError.prototype);
  }
}

/** Type guard — narrow an unknown error to {@link TenantScopeError}. */
export function isTenantScopeError(err: unknown): err is TenantScopeError {
  return err instanceof TenantScopeError;
}
