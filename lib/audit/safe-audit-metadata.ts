import { createHash } from "node:crypto";

/** Maximum serialized metadata size after sanitization. */
export const AUDIT_METADATA_MAX_BYTES = 4096;

const DEFAULT_STRING_MAX_LENGTH = 512;

const SENSITIVE_KEY_PATTERN =
  /^(api[_-]?key|token|secret|password|authorization|cookie|clerk|sendgrid|database_url|clerk_secret_key|sendgrid_api_key)$/i;

const BODY_LIKE_KEY_PATTERN =
  /^(body|html|template_html|email_body|csv_content|file_content|raw_payload|upload_rows|customers)$/i;

export function truncateAuditString(
  value: string,
  maxLength = DEFAULT_STRING_MAX_LENGTH,
): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

export function hashAuditValue(value: string): string {
  const salt = process.env.AUDIT_HASH_SALT?.trim() ?? "";
  return createHash("sha256")
    .update(salt)
    .update(":")
    .update(value)
    .digest("hex");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 8) return "[truncated:depth]";

  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (value.length > DEFAULT_STRING_MAX_LENGTH) {
      return truncateAuditString(value);
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (isPlainObject(value)) {
    return redactSensitiveKeys(value, depth + 1);
  }

  return String(value);
}

export function redactSensitiveKeys(
  obj: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[redacted]";
      continue;
    }

    if (BODY_LIKE_KEY_PATTERN.test(key)) {
      if (typeof value === "string") {
        out[key] = `[redacted:${value.length} chars]`;
      } else if (Array.isArray(value)) {
        out[key] = `[redacted:array:${value.length}]`;
      } else {
        out[key] = "[redacted]";
      }
      continue;
    }

    out[key] = sanitizeValue(value, depth);
  }

  return out;
}

function trimMetadataToSize(metadata: Record<string, unknown>): Record<string, unknown> {
  let serialized = JSON.stringify(metadata);
  if (Buffer.byteLength(serialized, "utf8") <= AUDIT_METADATA_MAX_BYTES) {
    return metadata;
  }

  const trimmed: Record<string, unknown> = {
    ...metadata,
    _audit_truncated: true,
  };

  delete trimmed.details;
  delete trimmed.context;
  delete trimmed.extra;

  serialized = JSON.stringify(trimmed);
  if (Buffer.byteLength(serialized, "utf8") <= AUDIT_METADATA_MAX_BYTES) {
    return trimmed;
  }

  return {
    _audit_truncated: true,
    _audit_note: "metadata exceeded size cap",
    action_summary: truncateAuditString(String(metadata.action_summary ?? ""), 256),
  };
}

/**
 * Sanitizes audit metadata: redacts secrets, strips large bodies, caps JSON size.
 * Never throws on invalid or circular input.
 */
export function safeAuditMetadata(
  metadata: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  try {
    const base = metadata ?? {};
    const redacted = redactSensitiveKeys(base);
    return trimMetadataToSize(redacted);
  } catch {
    return { _audit_error: "metadata_sanitization_failed" };
  }
}
