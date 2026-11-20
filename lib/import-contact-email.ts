/**
 * Normalize contact_email for import identity (trim + lowercase).
 * Empty/null input returns "" for validation to treat as missing.
 */
export function normalizeContactEmail(
  value: string | undefined | null,
): string {
  if (value === null || value === undefined) return "";
  return value.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContactEmail(value: string): boolean {
  const normalized = normalizeContactEmail(value);
  if (!normalized) return false;
  return EMAIL_RE.test(normalized);
}
