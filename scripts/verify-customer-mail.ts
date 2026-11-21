import assert from "node:assert/strict";
import { buildEnrichedActionQueue } from "../lib/action-workflow";
import { DEFAULT_AUTOMATION_RULES } from "../lib/automation-rule-definitions";
import { DEFAULT_EMAIL_TEMPLATES } from "../lib/email-template-definitions";
import { customers, sendLogs } from "../lib/mock-data";
import { customerMailRequestId, reviewCustomerMail } from "../lib/customer-mail-action";
import { checkContactSequencePreviewConflict } from "../lib/email-sequence-conflicts";
import { displayLogSource, displayLogDeliveryStatus } from "../lib/communication-log-display";
import type { ActionQueueItem, Customer, ImportedContact, SendLog } from "../lib/types";

async function verify() {
  const to = "recipient@mailhost.dev";
  const customer: Customer = {
    ...customers[0], invite_status: "Pending", invite_sent_date: "2020-01-01",
    admin_email: to, last_email_sent_date: "", emails_sent_count: 0,
  };
  const generated = buildEnrichedActionQueue([customer], {}, DEFAULT_AUTOMATION_RULES)
    .find(row => row.template === "invite-reminder");
  assert.ok(generated);
  const item: ActionQueueItem = { ...generated, workflow_status: "Approved" };
  const contact: ImportedContact = {
    customer_id: customer.customer_id, contact_email: to, contact_role: "Admin", do_not_contact: false,
  };
  const context = {
    customer, dataSource: "upload" as const, contacts: [contact], templates: DEFAULT_EMAIL_TEMPLATES, logs: [],
  };
  assert.equal(reviewCustomerMail(item, context).draft?.to, to);
  assert.match(reviewCustomerMail(item, context).draft!.subject, new RegExp(customer.customer_name));
  assert.ok(reviewCustomerMail(item, { ...context, dataSource: "demo" }).reason);
  assert.ok(reviewCustomerMail(generated, context).reason);
  assert.ok(reviewCustomerMail({ ...item, channel: "internal_alert" }, context).reason);
  assert.ok(reviewCustomerMail({ ...item, recipient_type: "CSM" }, context).reason);
  assert.ok(reviewCustomerMail({ ...item, schedule_status: "scheduled" }, context).reason);
  assert.ok(reviewCustomerMail({ ...item, conflict_status: "blocked_by_cooldown" }, context).reason);
  assert.ok(reviewCustomerMail({ ...item, contact_email: "different@mailhost.dev" }, context).reason);
  assert.ok(reviewCustomerMail(item, { ...context, contacts: [{ ...contact, customer_id: "other" }] }).reason);
  assert.ok(reviewCustomerMail(item, { ...context, contacts: [{ ...contact, contact_role: "User" }] }).reason);
  assert.ok(reviewCustomerMail(item, { ...context, contacts: [] }).reason);
  assert.match(reviewCustomerMail(item, { ...context, contacts: [
    contact, { ...contact, contact_email: to.toUpperCase(), customer_id: "other", do_not_contact: true },
  ] }).reason!, /Do Not Contact/);

  for (const address of ["person@site.example.com", "person@example.net", "person@site.test"]) {
    const result = reviewCustomerMail({ ...item, recipient: address, contact_email: address }, {
      ...context, contacts: [{ ...contact, contact_email: address }],
    });
    assert.ok(result.reason);
  }
  const template = DEFAULT_EMAIL_TEMPLATES.find(entry => entry.key === item.template)!;
  for (const invalid of [
    { ...template, status: "draft" as const }, { ...template, type: "internal_alert" as const },
    { ...template, body: "{{unknown}}" }, { ...template, body: "Join at {{academy_link}}" },
  ]) assert.ok(reviewCustomerMail(item, { ...context, templates: [invalid] }).reason);

  const acceptance: SendLog = {
    ...sendLogs[0], status: "Accepted by SendGrid", recipient: to, template: item.template, date: new Date().toISOString(),
    send_mode: "live", provider: "sendgrid",
  };
  assert.ok(reviewCustomerMail(item, { ...context, logs: [acceptance] }).reason);
  assert.equal(displayLogSource(acceptance), "Trigger");
  assert.equal(displayLogDeliveryStatus(acceptance), "Accepted");
  const conflictInput = {
    contact_email: to, account_id: customer.customer_id, sequence_key: "sequence",
    template_key: item.template, contact_role: "Admin" as const, is_internal_alert: false,
    customer, enrollments: [],
  };
  assert.equal(checkContactSequencePreviewConflict({ ...conflictInput, send_logs: [acceptance] }).conflict_status, "blocked_by_same_template");
  assert.equal(checkContactSequencePreviewConflict({
    ...conflictInput, send_logs: [{ ...acceptance, status: "Previewed" }, { ...acceptance, status: "Approved" }],
  }).conflict_status, "clear");

  const id = await customerMailRequestId(item, to);
  assert.match(id, /^[a-f\d]{8}-[a-f\d]{4}-8[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  assert.equal(await customerMailRequestId({ ...item, timing_type: "immediate", scheduled_for: new Date().toISOString() }, to.toUpperCase()), id);
  assert.notEqual(await customerMailRequestId({ ...item, id: "another action" }, to), id);
  assert.notEqual(await customerMailRequestId(item, "second@mailhost.dev"), id);
  console.log("Customer queue eligibility, rendering, activity and idempotency checks passed.");
}

void verify().catch(error => { console.error(error); process.exitCode = 1; });
