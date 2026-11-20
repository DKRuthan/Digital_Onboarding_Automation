"use client";

import { useMemo, useState } from "react";
import type { Customer, EmailTemplate } from "@/lib/types";
import { renderEmailTemplate } from "@/lib/email-template-engine";
import { formatSenderDisplay } from "@/lib/email-template-definitions";
import {
  isSendTestPayloadComplete,
  requestSendTestEmail,
} from "@/lib/send-test-email-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";

interface EmailTemplatePreviewModalProps {
  open: boolean;
  template: EmailTemplate | null;
  customers: Customer[];
  onClose: () => void;
  onTestSent: (template: EmailTemplate, testRecipient: string) => void;
}

function highlightUnresolved(text: string) {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, index) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-amber-100 px-1 text-amber-900"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

export function EmailTemplatePreviewModal({
  open,
  template,
  customers,
  onClose,
  onTestSent,
}: EmailTemplatePreviewModalProps) {
  const [customerId, setCustomerId] = useState(customers[0]?.customer_id ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customer = useMemo(
    () => customers.find((entry) => entry.customer_id === customerId) ?? customers[0],
    [customers, customerId],
  );

  if (!template) return null;

  const preview = customer
    ? renderEmailTemplate(template, customer)
    : {
        subject: template.subject,
        body: template.body,
        unresolvedVariables: [],
      };

  async function handleSendTest() {
    if (!customer) {
      setError("Select a demo customer to preview variables.");
      return;
    }

    const payload = {
      customer_name: customer.customer_name,
      issue: "Email Library template test",
      recommended_action: `Preview template: ${template!.name}`,
      intended_recipient: customer.admin_email,
      template_name: template!.key,
      subject: preview.subject,
      body: preview.body,
    };

    if (!isSendTestPayloadComplete(payload)) {
      setError("Subject and body are required for test send.");
      return;
    }

    setSending(true);
    setError(null);
    recordClientAuditEvent({
      action: "send.test.ui_click",
      targetType: "email_template",
      targetId: template!.id,
      metadata: { template_name: template!.key },
    });
    try {
      const result = await requestSendTestEmail(payload);
      if (result.testRecipient) {
        onTestSent(template!, result.testRecipient);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview: ${template.name}`}
      size="xl"
      footer={
        <>
          <Button variant="outline" disabled={sending} onClick={handleSendTest}>
            {sending ? "Sending…" : "Send Test"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Test email goes only to the configured test inbox
          (SENDGRID_TEST_TO_EMAIL) — not to customer, admin, or user emails.
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            Preview with demo customer
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={customer?.customer_id ?? ""}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.map((entry) => (
                <option key={entry.customer_id} value={entry.customer_id}>
                  {entry.customer_name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-500">Sender</p>
            <p className="mt-1 text-slate-800">{formatSenderDisplay(template)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Subject
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {highlightUnresolved(preview.subject)}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Body
          </p>
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {highlightUnresolved(preview.body)}
            </pre>
          </div>
        </div>

        {preview.unresolvedVariables.length > 0 && (
          <p className="text-sm text-amber-800">
            Unresolved variables: {preview.unresolvedVariables.join(", ")}
          </p>
        )}
      </div>
    </Modal>
  );
}
