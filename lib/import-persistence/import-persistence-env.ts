import { getDefaultWorkspaceId } from "@/lib/audit/audit-env";
import { isEnvFlagEnabled } from "@/lib/auth/session";

/** True when IMPORT_PERSISTENCE_ENABLED is explicitly "true". Default false. */
export function isImportPersistenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnvFlagEnabled(env.IMPORT_PERSISTENCE_ENABLED);
}

export function isImportPersistenceDatabaseConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

/** True when import persistence reads/writes would attempt DB access. */
export function shouldPersistImport(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isImportPersistenceEnabled(env) &&
    isImportPersistenceDatabaseConfigured(env)
  );
}

/**
 * Workspace scope for import rows — from server env only, never client-supplied.
 */
export function getDefaultImportWorkspaceId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return getDefaultWorkspaceId(env);
}

export type ImportPersistenceConfig = {
  enabled: boolean;
  databaseConfigured: boolean;
  shouldPersist: boolean;
  workspaceId: string;
};

export function getImportPersistenceConfig(
  env: NodeJS.ProcessEnv = process.env,
): ImportPersistenceConfig {
  const enabled = isImportPersistenceEnabled(env);
  const databaseConfigured = isImportPersistenceDatabaseConfigured(env);
  return {
    enabled,
    databaseConfigured,
    shouldPersist: enabled && databaseConfigured,
    workspaceId: getDefaultImportWorkspaceId(env),
  };
}
