import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { shouldPersistImport } from "@/lib/import-persistence/import-persistence-env";

export type ImportPersistenceSql = NeonQueryFunction<false, false>;

let cachedSql: ImportPersistenceSql | null = null;
let cachedDatabaseUrl: string | null = null;

/**
 * Returns a Neon SQL client when import persistence is enabled and DATABASE_URL is set.
 * Never expose the connection string to client bundles.
 * Does not connect until the returned function is invoked.
 */
export function getImportPersistenceSql(): ImportPersistenceSql | null {
  if (!shouldPersistImport()) {
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

/** True when persistence flag and DATABASE_URL are both configured. */
export function isImportPersistenceConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return shouldPersistImport(env);
}

/** Clears cached client (tests only). */
export function resetImportPersistenceSqlCacheForTests(): void {
  cachedSql = null;
  cachedDatabaseUrl = null;
}

export class ImportPersistenceUnavailableError extends Error {
  readonly code = "PERSISTENCE_DISABLED" as const;

  constructor(message = "Import persistence is disabled or DATABASE_URL is not configured") {
    super(message);
    this.name = "ImportPersistenceUnavailableError";
  }
}

/** For write paths — throws when persistence is not available. */
export function requireImportPersistenceSql(): ImportPersistenceSql {
  const sql = getImportPersistenceSql();
  if (!sql) {
    throw new ImportPersistenceUnavailableError();
  }
  return sql;
}
