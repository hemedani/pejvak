/**
 * Plan codes that other modules need without importing the entitlement layer.
 *
 * Kept in their own file so `bootstrap` (which runs before the server) and the
 * entitlement resolver can share the two names without importing each other.
 */
export const FREE_PLAN_CODE = "free";
export const PRO_PLAN_CODE = "pro";
