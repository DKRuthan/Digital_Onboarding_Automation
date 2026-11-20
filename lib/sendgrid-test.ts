import sgMail from "@sendgrid/mail";

export interface SendTestEmailInput {
  customer_name: string;
  issue: string;
  recommended_action: string;
  intended_recipient: string;
  template_name: string;
  subject: string;
  body: string;
}

export interface SendTestEmailResult {
  success: true;
  testRecipient: string;
  subject: string;
}

/**
 * TEST MODE ONLY — sends to SENDGRID_TEST_TO_EMAIL, never to the intended recipient.
 *
 * To enable real customer sends later:
 * 1. Add approval workflow (e.g. require automation_status === "Approved")
 * 2. Create POST /api/send-email that uses item.recipient / customer emails
 * 3. Gate behind auth and audit logging
 * 4. Remove the test-only recipient override below
 */
export async function sendTestEmailViaSendGrid(
  input: SendTestEmailInput,
): Promise<SendTestEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const testToEmail = process.env.SENDGRID_TEST_TO_EMAIL;

  if (!apiKey || !fromEmail || !testToEmail) {
    throw new Error(
      "SendGrid is not configured. Set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, and SENDGRID_TEST_TO_EMAIL.",
    );
  }

  sgMail.setApiKey(apiKey);

  const subject = input.subject.startsWith("[TEST]")
    ? input.subject
    : `[TEST] ${input.subject}`;

  const contextHeader = [
    "——— TEST MODE ———",
    "This email was sent to the configured test inbox only.",
    `Intended recipient: ${input.intended_recipient}`,
    `Customer: ${input.customer_name}`,
    `Issue: ${input.issue}`,
    `Recommended action: ${input.recommended_action}`,
    `Template: ${input.template_name}`,
    "",
    "——— MESSAGE PREVIEW ———",
    "",
  ].join("\n");

  const text = `${contextHeader}${input.body}`;

  // SAFETY: always use test recipient — never input.intended_recipient
  await sgMail.send({
    to: testToEmail,
    from: fromEmail,
    subject,
    text,
  });

  return { success: true, testRecipient: testToEmail, subject };
}
