import type { InternalSendPayload } from "./internal-send";
import type { InternalSendMode } from "./sendgrid-env";

export interface InternalSendResponse {
  success: boolean;
  deliverTo?: string;
  subject?: string;
  routingReason?: string;
  sendMode?: InternalSendMode;
  dryRun?: boolean;
  error?: string;
}

export async function requestInternalSend(
  payload: InternalSendPayload,
): Promise<InternalSendResponse> {
  const res = await fetch("/api/send-approved-internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as InternalSendResponse;
  if (!res.ok) {
    throw new Error(data.error ?? "Internal send failed");
  }
  return data;
}
