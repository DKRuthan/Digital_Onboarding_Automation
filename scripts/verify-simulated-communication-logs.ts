import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customers as demoCustomers } from "../lib/mock-data";
import {
  buildSimulatedCommunicationLog,
  buildSimulatedLogIdempotencyKey,
  isDuplicateSimulatedLog,
  SIMULATED_LOG_DELIVERY_STATUS,
  SIMULATED_LOG_PROVIDER,
  SIMULATED_LOG_SEND_MODE,
  SIMULATED_LOG_STATUS,
} from "../lib/communication-logs/simulated-log";
import { evaluateSimulatedLogEligibility } from "../lib/communication-logs/simulated-log-eligibility";
import { buildEnrichedActionQueue } from "../lib/action-workflow";
import { cloneDefaultAutomationRules } from "../lib/automation-rules-storage";
import { cloneDefaultEmailSequencesFromStorage } from "../lib/email-sequences-storage";
import { cloneDefaultEmailTemplatesFromStorage } from "../lib/email-templates-storage";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import {
  getUiAuditPermission,
  isAllowedUiAuditAction,
} from "../lib/audit/ui-audit-events";
import type { ActionQueueItem } from "../lib/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const ROOT = join(import.meta.dirname ?? __dirname, "..");

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function main(): void {
  console.log("1. Simulated log helper module...");
  const helperSource = readFile("lib/communication-logs/simulated-log.ts");
  assert(
    helperSource.includes("buildSimulatedCommunicationLog"),
    "buildSimulatedCommunicationLog exists",
  );
  assert(
    helperSource.includes("buildSimulatedLogIdempotencyKey"),
    "buildSimulatedLogIdempotencyKey exists",
  );
  assert(
    helperSource.includes("isDuplicateSimulatedLog"),
    "isDuplicateSimulatedLog exists",
  );
  assert(
    !helperSource.includes("sendgrid") && !helperSource.includes("SendGrid"),
    "helper must not import SendGrid",
  );
  assert(
    !helperSource.includes("/api/send"),
    "helper must not call send APIs",
  );

  console.log("2. Status, mode, delivery, provider constants...");
  assert(SIMULATED_LOG_STATUS === "Simulated Sent", "Simulated Sent status");
  assert(SIMULATED_LOG_SEND_MODE === "logged_only", "logged_only send mode");
  assert(
    SIMULATED_LOG_DELIVERY_STATUS === "Not Sent",
    "Not Sent delivery status",
  );
  assert(SIMULATED_LOG_PROVIDER === "none", "provider none");

  console.log("3. Idempotency + duplicate prevention...");
  const key = buildSimulatedLogIdempotencyKey({
    action_queue_item_id: "AQ-1",
    template_id: "tpl-1",
    template_key: "welcome",
    recipient_email: "user@example.com",
  });
  assert(key.includes("AQ-1"), "idempotency key includes action id");
  assert(key.includes("user@example.com"), "idempotency key includes recipient");

  const sampleItem = {
    id: "AQ-SIM-TEST",
    customer_id: demoCustomers[0].customer_id,
    customer_name: demoCustomers[0].customer_name,
    issue: "No Usage",
    recommended_action: "Getting Started Guide",
    recipient: demoCustomers[0].admin_email,
    template: "getting-started",
    automation_status: "Ready",
    rule_id: "no-usage",
    recipient_type: "Admin",
    scheduled_for: new Date().toISOString(),
    schedule_status: "due_now",
    timing_type: "immediate",
    timing_label: "Immediate",
    source: "rule",
    contact_email: demoCustomers[0].admin_email,
    workflow_status: "Approved",
    owner: demoCustomers[0].owner,
    duplicate_warning: null,
  } as ActionQueueItem;

  const log = buildSimulatedCommunicationLog({
    item: sampleItem,
    customer: demoCustomers[0],
    subject: "Test subject",
    templateId: "tpl-test",
    triggerName: "No Usage",
  });
  assert(log.status === "Simulated Sent", "built log has Simulated Sent");
  assert(log.send_mode === "logged_only", "built log has logged_only");
  assert(log.delivery_status === "Not Sent", "built log delivery Not Sent");
  assert(log.provider === "none", "built log provider none");
  assert(Boolean(log.idempotency_key), "built log has idempotency_key");
  assert(
    isDuplicateSimulatedLog([log], log),
    "duplicate detection works for same log",
  );

  console.log("4. Action Queue UI...");
  const queueSource = readFile(
    "components/action-queue/action-queue-table.tsx",
  );
  assert(
    queueSource.includes("Create Simulated Logs"),
    "Create Simulated Logs button exists",
  );
  assert(
    queueSource.includes("Send via SendGrid"),
    "Send via SendGrid button still exists",
  );
  assert(
    queueSource.includes("createSimulatedCommunicationLogs"),
    "queue calls provider simulated log method",
  );
  assert(
    !queueSource.includes("requestInternalSend") ||
      queueSource.includes("handleConfirmInternalSend"),
    "internal send remains separate path",
  );

  console.log("5. Communication Logs display...");
  const logsPage = readFile("components/send-logs/send-logs-page-content.tsx");
  assert(
    logsPage.includes("simulated") || logsPage.includes("displayLogDeliveryStatus"),
    "logs page references simulated delivery display",
  );
  assert(logsPage.includes("displayLogProvider"), "logs page shows provider");
  assert(
    logsPage.includes("displayLogDeliveryStatus"),
    "logs page shows delivery status",
  );

  const displaySource = readFile("lib/communication-log-display.ts");
  assert(
    displaySource.includes("displayLogProvider"),
    "displayLogProvider helper exists",
  );

  console.log("6. Reports simulated vs actual...");
  const rules = cloneDefaultAutomationRules();
  const emailSequences = cloneDefaultEmailSequencesFromStorage();
  const emailTemplates = cloneDefaultEmailTemplatesFromStorage();
  const actionQueue = buildEnrichedActionQueue(demoCustomers, {}, rules, {
    sequences: emailSequences,
    enrollments: [],
    sendLogs: [],
  });

  const snapshot = buildReportsSnapshot({
    customers: demoCustomers,
    actionQueue,
    sendLogs: [log],
    emailSequences,
    enrollments: [],
    rules,
    lastValidation: null,
  });
  assert(
    snapshot.communication.simulatedSentCount === 1,
    "reports count simulated sent",
  );
  assert(
    snapshot.communication.actualSentCount === 0,
    "demo/simulated logs do not count as actual sent",
  );
  assert(
    snapshot.communication.byTemplate["getting-started"] === 1,
    "reports by template includes simulated log",
  );

  console.log("7. UI audit allowlist...");
  assert(
    isAllowedUiAuditAction("send.simulated_log.created"),
    "send.simulated_log.created allowed",
  );
  assert(
    getUiAuditPermission("send.simulated_log.created") ===
      "approve_queue_actions",
    "simulated log audit maps to approve_queue_actions",
  );

  console.log("8. No customer send route / send API unchanged...");
  const appApiFiles = [
    "app/api/send-approved-internal/route.ts",
    "app/api/send-test-email/route.ts",
  ];
  for (const file of appApiFiles) {
    const source = readFile(file);
    assert(!source.includes("send-customer-email"), `${file} unchanged scope`);
  }
  assert(
    !readFile("app/api/send-approved-internal/route.ts").includes(
      "send-customer-email",
    ),
    "no customer send in internal route",
  );
  try {
    readFile("app/api/send-customer-email/route.ts");
    assert(false, "/api/send-customer-email must not exist");
  } catch {
    // expected — route does not exist
  }

  const sendgridEnv = readFile("lib/sendgrid-env.ts");
  assert(
    sendgridEnv.includes("INTERNAL_SEND_API_DISABLED_ERROR"),
    "SendGrid gates unchanged",
  );

  console.log("9. No automatic/background sending...");
  const repoScan = [
    readFile("components/providers/customer-data-provider.tsx"),
    readFile("lib/communication-logs/simulated-log.ts"),
  ].join("\n");
  assert(!repoScan.includes("cron"), "no cron in simulated path");
  assert(!repoScan.includes("setInterval"), "no background interval");

  console.log("10. Eligibility helper...");
  const eligibilitySource = readFile(
    "lib/communication-logs/simulated-log-eligibility.ts",
  );
  assert(
    eligibilitySource.includes("evaluateSimulatedLogEligibility"),
    "eligibility evaluator exists",
  );
  const blocked = evaluateSimulatedLogEligibility(
    { ...sampleItem, workflow_status: "Needs Review" },
    {
      customers: demoCustomers,
      emailTemplates,
      automationRules: rules,
    },
  );
  assert(!blocked.eligible, "non-approved item blocked");

  console.log("OK: simulated communication logs verification passed");
}

main();
