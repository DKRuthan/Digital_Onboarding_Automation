export interface SendTestEmailPayload {
  customer_name: string;
  issue: string;
  recommended_action: string;
  intended_recipient: string;
  template_name: string;
  subject: string;
  body: string;
}

export interface SendTestEmailResponse {
  success: boolean;
  testRecipient?: string;
  subject?: string;
  error?: string;
}

export function isSendTestPayloadComplete(
  payload: Partial<SendTestEmailPayload>,
): payload is SendTestEmailPayload {
  return Boolean(
    payload.customer_name?.trim() &&
      payload.issue?.trim() &&
      payload.recommended_action?.trim() &&
      payload.intended_recipient?.trim() &&
      payload.template_name?.trim() &&
      payload.subject?.trim() &&
      payload.body?.trim(),
  );
}

export async function requestSendTestEmail(
  payload: SendTestEmailPayload,
): Promise<SendTestEmailResponse> {
  const res = await fetch("/api/send-test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as SendTestEmailResponse;
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to send test email");
  }
  return data;
}
