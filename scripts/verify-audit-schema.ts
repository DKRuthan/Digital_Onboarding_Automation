import { readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_PATH = join(
  process.cwd(),
  "db/migrations/001_create_audit_logs.sql",
);

const REQUIRED_COLUMNS = [
  "id",
  "workspace_id",
  "actor_user_id",
  "actor_role",
  "action",
  "target_type",
  "target_id",
  "result",
  "metadata_json",
  "source",
  "severity",
  "auth_required",
  "permission",
  "send_mode",
  "request_id",
  "ip_hash",
  "user_agent",
  "created_at",
];

const REQUIRED_INDEXES = [
  "audit_logs_workspace_created_idx",
  "audit_logs_action_created_idx",
  "audit_logs_actor_created_idx",
  "audit_logs_request_id_idx",
];

const FORBIDDEN_COLUMNS = [
  "email_body",
  "template_html",
  "csv_content",
  "customer_payload",
  "upload_rows",
];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function main(): void {
  console.log("A. SQL migration file exists...");
  let sql: string;
  try {
    sql = readFileSync(SCHEMA_PATH, "utf8");
  } catch {
    assert(false, `missing ${SCHEMA_PATH}`);
    return;
  }

  console.log("B. audit_logs table defined...");
  assert(/CREATE TABLE IF NOT EXISTS audit_logs/i.test(sql), "audit_logs table");

  console.log("C. Required columns present...");
  for (const column of REQUIRED_COLUMNS) {
    assert(
      new RegExp(`\\b${column}\\b`, "i").test(sql),
      `column ${column}`,
    );
  }

  console.log("D. Required indexes present...");
  for (const indexName of REQUIRED_INDEXES) {
    assert(sql.includes(indexName), `index ${indexName}`);
  }

  console.log("E. No forbidden payload columns...");
  for (const column of FORBIDDEN_COLUMNS) {
    assert(!new RegExp(`\\b${column}\\b`, "i").test(sql), `forbidden ${column}`);
  }

  console.log("F. No app UPDATE/DELETE helper SQL...");
  assert(!/UPDATE\s+audit_logs/i.test(sql), "no UPDATE audit_logs");
  assert(!/DELETE\s+FROM\s+audit_logs/i.test(sql), "no DELETE audit_logs");

  console.log("G. Append-only convention documented...");
  assert(/append-only/i.test(sql), "append-only comment");

  console.log("OK: verify-audit-schema passed");
}

main();
