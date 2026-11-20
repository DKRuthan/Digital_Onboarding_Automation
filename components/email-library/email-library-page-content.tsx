"use client";

import { useState } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import type { EmailTemplate } from "@/lib/types";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { renderEmailTemplate } from "@/lib/email-template-engine";
import {
  isSendTestPayloadComplete,
  requestSendTestEmail,
} from "@/lib/send-test-email-client";
import { cloneEmailTemplate, createEmptyEmailTemplate, formatSenderDisplay } from "@/lib/email-template-definitions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportEmailTemplatesJson } from "@/lib/session-export";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import { formatDateTime } from "@/lib/utils";
import { EmailTemplateEditModal } from "./email-template-edit-modal";
import { EmailTemplatePreviewModal } from "./email-template-preview-modal";

function statusVariant(status: EmailTemplate["status"]) {
  switch (status) {
    case "approved":
      return "success" as const;
    case "archived":
      return "muted" as const;
    default:
      return "warning" as const;
  }
}

export function EmailLibraryPageContent() {
  const {
    emailTemplates,
    customers,
    saveEmailTemplate,
    duplicateEmailTemplateById,
    approveEmailTemplateById,
    archiveEmailTemplateById,
    resetEmailTemplatesToDefaults,
    addWorkflowLog,
  } = useCustomerData();

  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);

  const approvedCount = emailTemplates.filter((t) => t.status === "approved").length;
  const canEdit = useCan("edit_templates");
  const canSendTest = useCan("send_test_email");
  const canExport = useCan("export_reports");
  const editGate = gateByPermission(canEdit, "edit_templates");
  const sendTestGate = gateByPermission(canSendTest, "send_test_email");
  const exportGate = gateByPermission(canExport, "export_reports");

  function handleResetToDefaults() {
    if (
      window.confirm(
        "Reset all email templates to the default 7 templates? This clears locally saved template changes in this browser.",
      )
    ) {
      resetEmailTemplatesToDefaults();
      recordClientAuditEvent({
        action: "template.reset_defaults",
        targetType: "email_template",
      });
    }
  }

  function handleCreate() {
    setCreating(true);
    setEditTemplate(createEmptyEmailTemplate());
  }

  function handleDuplicateTemplate(templateId: string, templateKey: string) {
    duplicateEmailTemplateById(templateId);
    recordClientAuditEvent({
      action: "template.duplicate",
      targetType: "email_template",
      targetId: templateId,
      metadata: { template_name: templateKey },
    });
  }

  function handleApproveTemplate(templateId: string, templateKey: string) {
    approveEmailTemplateById(templateId);
    recordClientAuditEvent({
      action: "template.approve",
      targetType: "email_template",
      targetId: templateId,
      metadata: { template_name: templateKey },
    });
  }

  function handleArchiveTemplate(templateId: string, templateKey: string) {
    archiveEmailTemplateById(templateId);
    recordClientAuditEvent({
      action: "template.unapprove",
      targetType: "email_template",
      targetId: templateId,
      metadata: { template_name: templateKey },
    });
  }

  async function handleSendTest(template: EmailTemplate) {
    const customer = customers[0];
    if (!customer) return;

    const confirmed = window.confirm(
      "Send a test email for this template? It will go only to SENDGRID_TEST_TO_EMAIL, not to any customer email.",
    );
    if (!confirmed) return;

    recordClientAuditEvent({
      action: "send.test.ui_click",
      targetType: "email_template",
      targetId: template.id,
      metadata: { template_name: template.key },
    });

    const preview = renderEmailTemplate(template, customer);
    const payload = {
      customer_name: customer.customer_name,
      issue: "Email Templates template test",
      recommended_action: `Test template: ${template.name}`,
      intended_recipient: customer.admin_email,
      template_name: template.key,
      subject: preview.subject,
      body: preview.body,
    };

    if (!isSendTestPayloadComplete(payload)) return;

    setSendingTestId(template.id);
    try {
      const result = await requestSendTestEmail(payload);
      addWorkflowLog({
        customer_name: customer.customer_name,
        issue: "Template test send",
        action: `Test send: ${template.name}`,
        recipient: result.testRecipient ?? "SENDGRID_TEST_TO_EMAIL",
        template: template.key,
        status: "Test Sent",
        send_mode: "test",
        note: "Test email sent to SENDGRID_TEST_TO_EMAIL from Email Templates.",
      });
    } finally {
      setSendingTestId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Email Templates"
        description="Create, approve, and manage email templates used by Activity Triggers and Email Sequences. Templates are saved locally in this browser."
      />

      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-6 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <p className="text-sm text-slate-600">
          {approvedCount} of {emailTemplates.length} templates approved ·
          Editing templates does not send emails · Test sends go only to
          SENDGRID_TEST_TO_EMAIL.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={exportGate.disabled}
            title={exportGate.title}
            onClick={() => exportEmailTemplatesJson(emailTemplates)}
          >
            Export JSON
          </Button>
          <Button
            variant="outline"
            disabled={editGate.disabled}
            title={editGate.title}
            onClick={handleResetToDefaults}
          >
            Reset to default templates
          </Button>
          <Button
            variant="primary"
            disabled={editGate.disabled}
            title={editGate.title}
            onClick={handleCreate}
          >
            New template
          </Button>
        </div>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3 lg:p-8">
        {emailTemplates.map((template) => (
          <Card
            key={template.id}
            className={template.status === "archived" ? "opacity-75" : ""}
          >
            <CardContent className="flex flex-col gap-4 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {template.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {template.description || "No description"}
                  </p>
                </div>
                <Badge variant={statusVariant(template.status)}>
                  {template.status}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div>
                  <dt className="font-medium text-slate-400">Key</dt>
                  <dd>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                      {template.key}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Audience</dt>
                  <dd className="text-slate-700">{template.audience}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Type</dt>
                  <dd className="text-slate-700">{template.type}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Sender</dt>
                  <dd className="text-slate-700">{formatSenderDisplay(template)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Version</dt>
                  <dd className="text-slate-700">v{template.version}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Last updated</dt>
                  <dd className="text-slate-700">
                    {formatDateTime(template.updated_at)}
                  </dd>
                </div>
                {template.latest_change_note && (
                  <div className="col-span-2">
                    <dt className="font-medium text-slate-400">
                      Latest change note
                    </dt>
                    <dd className="text-slate-700">{template.latest_change_note}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button
                  variant="outline"
                  disabled={editGate.disabled}
                  title={editGate.title}
                  onClick={() => {
                    setCreating(false);
                    setEditTemplate(cloneEmailTemplate(template));
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={editGate.disabled}
                  title={editGate.title}
                  onClick={() => handleDuplicateTemplate(template.id, template.key)}
                >
                  Duplicate
                </Button>
                {template.status !== "approved" && (
                  <Button
                    variant="outline"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleApproveTemplate(template.id, template.key)}
                  >
                    Approve
                  </Button>
                )}
                {template.status !== "archived" && (
                  <Button
                    variant="outline"
                    disabled={editGate.disabled}
                    title={editGate.title}
                    onClick={() => handleArchiveTemplate(template.id, template.key)}
                  >
                    Archive
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setPreviewTemplate(template)}
                >
                  Preview
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    sendTestGate.disabled || sendingTestId === template.id
                  }
                  title={sendTestGate.title}
                  onClick={() => handleSendTest(template)}
                >
                  {sendingTestId === template.id ? "Sending…" : "Send Test"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <EmailTemplateEditModal
        open={editTemplate !== null}
        template={editTemplate}
        allTemplates={emailTemplates}
        isNew={creating}
        onClose={() => {
          setEditTemplate(null);
          setCreating(false);
        }}
        onSave={(template) => {
          saveEmailTemplate(template);
          recordClientAuditEvent({
            action: creating ? "template.create" : "template.edit",
            targetType: "email_template",
            targetId: template.id,
            metadata: { template_name: template.key },
          });
          setEditTemplate(null);
          setCreating(false);
        }}
      />

      <EmailTemplatePreviewModal
        open={previewTemplate !== null}
        template={previewTemplate}
        customers={customers}
        onClose={() => setPreviewTemplate(null)}
        onTestSent={(template, testRecipient) => {
          addWorkflowLog({
            customer_name: "Email Templates test",
            issue: "Template test send",
            action: `Test send: ${template.name}`,
            recipient: testRecipient,
            template: template.key,
            status: "Test Sent",
            send_mode: "test",
            note: "Test email sent to SENDGRID_TEST_TO_EMAIL from Email Templates.",
          });
        }}
      />
    </>
  );
}
