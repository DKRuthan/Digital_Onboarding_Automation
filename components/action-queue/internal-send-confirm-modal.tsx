"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActionQueueItem, Customer, EmailTemplate } from "@/lib/types";
import { resolveInternalSendEmailContent } from "@/lib/email-templates";
import { composeInternalAlert } from "@/lib/internal-alert-content";
import {
  buildInternalSendPayload,
  getInternalRoutingPreview,
} from "@/lib/internal-send";
import {
  displayContactEmailLabel,
  displayDeliveryTarget,
  triggerSequenceLabel,
} from "@/lib/action-queue-display";
import {
  emptyPublicSendGridConfig,
  fetchInternalSendConfig,
  type PublicSendGridConfig,
} from "@/lib/internal-send-config-client";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCan } from "@/components/auth/permissions-provider";
import { gateByPermission } from "@/lib/auth/permission-ui";

interface InternalSendConfirmModalProps {
  open: boolean;
  items: ActionQueueItem[];
  customers: Customer[];
  emailTemplates: EmailTemplate[];
  sending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

interface ItemPreview {
  item: ActionQueueItem;
  customer: Customer;
  deliverToLabel: string;
  routingReason: string;
  subject: string;
  body: string;
  routingError?: string;
  templateError?: string;
}

export function InternalSendConfirmModal({
  open,
  items,
  customers,
  emailTemplates,
  sending,
  onClose,
  onConfirm,
}: InternalSendConfirmModalProps) {
  const canSendInternal = useCan("send_internal_alert");
  const sendInternalGate = gateByPermission(canSendInternal, "send_internal_alert");
  const [config, setConfig] = useState<PublicSendGridConfig | null>(null);
  const loadingConfig = open && config === null;

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.customer_id, c])),
    [customers],
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    fetchInternalSendConfig()
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(
            emptyPublicSendGridConfig(["Failed to load SendGrid configuration"]),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const previews: ItemPreview[] = useMemo(() => {
    if (!config) return [];

    return items
      .map((item) => {
        const customer = customerMap.get(item.customer_id);
        if (!customer) return null;

        const routing = getInternalRoutingPreview(item.recipient, customer);
        const emailContent = resolveInternalSendEmailContent(
          item,
          customer,
          emailTemplates,
        );

        if (!emailContent.ok) {
          return {
            item,
            customer,
            deliverToLabel: "—",
            routingReason: "",
            subject: "",
            body: "",
            templateError: emailContent.error,
          } satisfies ItemPreview;
        }

        const payload = buildInternalSendPayload(
          item,
          customer,
          emailContent.subject,
          emailContent.body,
        );

        if (!routing.valid) {
          return {
            item,
            customer,
            deliverToLabel: "—",
            routingReason: routing.error,
            subject: "",
            body: "",
            routingError: routing.error,
          } satisfies ItemPreview;
        }

        const composed = composeInternalAlert(
          payload,
          routing.deliverToLabel,
          routing.routingReason,
          config.sendMode,
        );

        return {
          item,
          customer,
          deliverToLabel: routing.deliverToLabel,
          routingReason: routing.routingReason,
          subject: composed.subject,
          body: composed.body,
        } satisfies ItemPreview;
      })
      .filter(Boolean) as ItemPreview[];
  }, [config, items, customerMap, emailTemplates]);

  const hasRoutingErrors = previews.some((p) => p.routingError);
  const hasTemplateErrors = previews.some((p) => p.templateError);
  const hasBlockingErrors = hasRoutingErrors || hasTemplateErrors;
  const apiDisabled = config !== null && !config.internalSendsEnabled;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Internal Send"
      size="xl"
      footer={
        <>
          <Button
            variant="primary"
            disabled={
              sendInternalGate.disabled ||
              sending ||
              loadingConfig ||
              !config?.configured ||
              !config?.internalSendsEnabled ||
              hasBlockingErrors
            }
            title={sendInternalGate.title}
            onClick={onConfirm}
          >
            {sending
              ? "Sending…"
              : config?.sendMode === "dry_run"
                ? "Confirm Dry Run"
                : "Confirm Live Send"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          These alerts go to the configured internal recipients.
        </div>

        {loadingConfig && (
          <p className="text-sm text-slate-500">Loading SendGrid configuration…</p>
        )}

        {config && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={config.sendMode === "live" ? "danger" : "warning"}>
              Mode: {config.sendMode === "live" ? "LIVE" : "DRY RUN"}
            </Badge>
            {!config.internalSendsEnabled && (
              <Badge variant="muted">Internal send API disabled</Badge>
            )}
            {!config.configured && (
              <span className="text-sm text-red-700">
                Configuration errors: {config.validationErrors.join("; ")}
              </span>
            )}
          </div>
        )}

        {apiDisabled && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Internal send API is disabled. Set{" "}
            <code className="text-xs">INTERNAL_SEND_API_ENABLED=true</code> on
            the server to enable approved internal sends.
          </div>
        )}

        {hasTemplateErrors && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            One or more actions use a missing, archived, or unapproved Email
            Library template. Approve the template or fix the automation rule
            before sending.
          </div>
        )}

        <p className="text-sm text-slate-700">
          Sending{" "}
          <span className="font-semibold">{items.length}</span> approved internal
          alert{items.length === 1 ? "" : "s"}.
          {config?.sendMode === "dry_run" &&
            " No emails will be delivered in dry-run mode."}
        </p>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {previews.map((preview) => (
            <div
              key={preview.item.id}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {displayContactEmailLabel(preview.item)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {preview.item.customer_name} · {preview.item.customer_id}
                  </p>
                  <p className="text-sm text-slate-600">
                    {triggerSequenceLabel(preview.item)}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">
                    {preview.item.id}
                  </p>
                </div>
                <Badge variant="info">{preview.item.recipient_type}</Badge>
              </div>

              {preview.templateError ? (
                <p className="text-sm text-red-700">{preview.templateError}</p>
              ) : preview.routingError ? (
                <p className="text-sm text-red-700">{preview.routingError}</p>
              ) : (
                <>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {displayDeliveryTarget(preview.item) ? (
                      <div>
                        <dt className="text-xs text-slate-500">
                          Delivery target
                        </dt>
                        <dd className="text-slate-800">
                          {displayDeliveryTarget(preview.item)}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs text-slate-500">Queue recipient</dt>
                      <dd className="text-slate-800">{preview.item.recipient}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        Resolved deliver-to
                      </dt>
                      <dd className="font-medium text-indigo-700">
                        {preview.deliverToLabel}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">Routing reason</dt>
                      <dd className="text-slate-700">{preview.routingReason}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Owner</dt>
                      <dd className="text-slate-800">{preview.customer.owner}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Next action</dt>
                      <dd className="text-slate-800">
                        {preview.item.recommended_action}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Alert preview
                    </p>
                    <p className="text-sm font-medium text-slate-900">
                      {preview.subject}
                    </p>
                    <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-3 font-sans text-xs leading-relaxed text-slate-700">
                      {preview.body}
                    </pre>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
