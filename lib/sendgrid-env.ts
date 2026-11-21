export type InternalSendMode = "dry_run" | "live";

export const INTERNAL_SEND_API_DISABLED_ERROR = "Internal send API is disabled";
export const TEST_SEND_API_DISABLED_ERROR = "Test send API is disabled";
export const REDACTED_TEST_RECIPIENT = "[configured test inbox]";

/** Keys that must never appear in GET /api/internal-send-config. */
export const SENSITIVE_PUBLIC_CONFIG_KEYS = [
  "damAlertEmail",
  "fromEmail",
  "internalEmailDomain",
  "testRecipient",
] as const;

export interface PublicSendGridConfig {
  configured: boolean;
  sendMode: InternalSendMode;
  customerSendsEnabled: false;
  internalSendsEnabled: boolean;
  testSendEnabled: boolean;
  validationErrors: string[];
}

/** Env flag is enabled only when explicitly set to "true". */
export function isEnvFlagEnabled(raw?: string): boolean {
  return raw?.trim().toLowerCase() === "true";
}

export function isInternalSendApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnvFlagEnabled(env.INTERNAL_SEND_API_ENABLED);
}

export function isTestSendApiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isEnvFlagEnabled(env.SENDGRID_TEST_SEND_ENABLED);
}

export function assertPublicConfigRedacted(config: Record<string, unknown>): void {
  for (const key of SENSITIVE_PUBLIC_CONFIG_KEYS) {
    if (key in config) {
      throw new Error(`Public config must not include ${key}`);
    }
  }
}

export interface SendGridEnvConfig {
  apiKey: string;
  fromEmail: string;
  damAlertEmail: string;
  internalEmailDomain: string;
  sendMode: InternalSendMode;
}

export interface SendGridEnvValidation {
  valid: boolean;
  errors: string[];
  sendMode: InternalSendMode;
  damAlertEmail: string;
  internalEmailDomain: string;
  fromEmail: string;
  hasApiKey: boolean;
}

export function getInternalSendMode(
  raw = process.env.SENDGRID_INTERNAL_SEND_MODE,
): InternalSendMode {
  return raw?.trim().toLowerCase() === "live" ? "live" : "dry_run";
}

/** Validates required env vars for internal SendGrid alerts. Never returns the API key. */
export function validateSendGridEnv(): SendGridEnvValidation {
  const errors: string[] = [];
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim() ?? "";
  const damAlertEmail = process.env.SENDGRID_DAM_ALERT_EMAIL?.trim() ?? "";
  const internalEmailDomain =
    process.env.SENDGRID_INTERNAL_EMAIL_DOMAIN?.trim() ?? "";
  const sendMode = getInternalSendMode();

  if (!apiKey) errors.push("SENDGRID_API_KEY is missing or empty");
  if (!fromEmail) errors.push("SENDGRID_FROM_EMAIL is missing or empty");
  if (!damAlertEmail) errors.push("SENDGRID_DAM_ALERT_EMAIL is missing or empty");
  if (!internalEmailDomain) {
    errors.push("SENDGRID_INTERNAL_EMAIL_DOMAIN is missing or empty");
  } else if (!internalEmailDomain.startsWith("@")) {
    errors.push(
      "SENDGRID_INTERNAL_EMAIL_DOMAIN must start with @ (e.g. @team.example.com)",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    sendMode,
    damAlertEmail,
    internalEmailDomain: internalEmailDomain.toLowerCase(),
    fromEmail,
    hasApiKey: Boolean(apiKey),
  };
}

export function requireSendGridEnv(): SendGridEnvConfig {
  const validation = validateSendGridEnv();
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  return {
    apiKey: process.env.SENDGRID_API_KEY!.trim(),
    fromEmail: validation.fromEmail,
    damAlertEmail: validation.damAlertEmail,
    internalEmailDomain: validation.internalEmailDomain,
    sendMode: validation.sendMode,
  };
}

/** Safe config for client UI — status fields only; no routing emails or API key. */
export function getPublicSendGridConfig(): PublicSendGridConfig {
  const validation = validateSendGridEnv();
  return {
    configured: validation.valid,
    validationErrors: validation.errors,
    sendMode: validation.sendMode,
    customerSendsEnabled: false,
    internalSendsEnabled: isInternalSendApiEnabled(),
    testSendEnabled: isTestSendApiEnabled(),
  };
}
