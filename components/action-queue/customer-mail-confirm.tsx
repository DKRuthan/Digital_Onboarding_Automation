"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ActionQueueItem } from "@/lib/types";
import { customerMailRequestId, type CustomerMailDraft } from "@/lib/customer-mail-action";
import { EmailApiError, emailRequest, useEmailConnections } from "@/lib/email-connections-client";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function CustomerMailConfirm({ item, draft, onClose, onAccepted }: {
  item: ActionQueueItem;
  draft: CustomerMailDraft;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const { selected, loading, error } = useEmailConnections();
  const { recordCustomerMailAccepted } = useCustomerData();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [consent, setConsent] = useState(false);

  async function submit() {
    if (!selected || !consent || uncertain || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setProblem("");
    try {
      const requestId = await customerMailRequestId(item, draft.to);
      const result = await emailRequest<{ status: string }>("/api/email/send", {
        method: "POST",
        body: JSON.stringify({ connectionId: selected.id, requestId, ...draft }),
      });
      if (result.status !== "accepted") throw new Error("Acceptance could not be confirmed. Check SendGrid Email Activity before retrying.");
      recordCustomerMailAccepted(item, draft, requestId);
      onAccepted();
    } catch (err) {
      setConsent(false);
      if (err instanceof EmailApiError) {
        setProblem(err.message);
        setUncertain(["delivery_unknown", "sending", "request_conflict"].includes(err.code));
      } else {
        setUncertain(true);
        setProblem("Acceptance could not be confirmed. Check SendGrid Email Activity.");
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  return (
    <Modal open title="Review customer email" onClose={() => { if (!busy.current) onClose(); }}
      footer={<>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" disabled={!selected || !consent || loading || Boolean(error) || submitting || uncertain} onClick={submit}>
          {submitting ? "Submitting…" : "Send this email"}
        </Button>
      </>}>
      <div className="space-y-4 text-sm">
        {loading ? <p>Loading email connection…</p> : error || !selected ? (
          <p>{error?.message ?? "Choose a SendGrid connection before sending."}{" "}
            <Link className="font-medium text-indigo-700 underline" href="/email-settings/">Email Settings</Link>
          </p>
        ) : <p><strong>From</strong> {selected.fromEmail} ({selected.label})</p>}
        <p><strong>To</strong> {draft.to}</p>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold text-slate-900">{draft.subject}</p>
          <p className="mt-3 whitespace-pre-wrap text-slate-700">{draft.text}</p>
        </div>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={consent} disabled={submitting || uncertain} onChange={event => setConsent(event.target.checked)} />
          I have permission to email this recipient.
        </label>
        {problem && <p role="alert" className="text-red-700">{problem}</p>}
      </div>
    </Modal>
  );
}
