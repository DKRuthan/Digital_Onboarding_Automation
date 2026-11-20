import type { PublicSendGridConfig } from "./sendgrid-env";

export type { PublicSendGridConfig };

export async function fetchInternalSendConfig(): Promise<PublicSendGridConfig> {
  const res = await fetch("/api/internal-send-config");
  if (!res.ok) {
    throw new Error("Failed to load SendGrid configuration");
  }
  return res.json() as Promise<PublicSendGridConfig>;
}

/** Fallback when config fetch fails — matches redacted public shape. */
export function emptyPublicSendGridConfig(
  validationErrors: string[],
): PublicSendGridConfig {
  return {
    configured: false,
    validationErrors,
    sendMode: "dry_run",
    customerSendsEnabled: false,
    internalSendsEnabled: false,
    testSendEnabled: false,
  };
}
