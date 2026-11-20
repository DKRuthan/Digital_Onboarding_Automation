import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { isAuditEnabled } from "@/lib/audit/audit-env";

let cachedSql: NeonQueryFunction<false, false> | null = null;
let cachedDatabaseUrl: string | null = null;

/**
 * Returns a Neon SQL client when audit is enabled and DATABASE_URL is set.
 * Never expose the connection string to client bundles.
 */
export function getAuditSql(): NeonQueryFunction<false, false> | null {
  if (!isAuditEnabled()) {
    return null;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }

  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return cachedSql;
}

/** Clears cached client (tests only). */
export function resetAuditSqlCacheForTests(): void {
  cachedSql = null;
  cachedDatabaseUrl = null;
}
