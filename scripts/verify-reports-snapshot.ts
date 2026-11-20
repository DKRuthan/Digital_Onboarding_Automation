import { cloneDefaultAutomationRules } from "../lib/automation-rules-storage";
import { buildEnrichedActionQueue } from "../lib/action-workflow";
import { customers as demoCustomers, sendLogs as demoSendLogs } from "../lib/mock-data";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { cloneDefaultEmailSequencesFromStorage } from "../lib/email-sequences-storage";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const rules = cloneDefaultAutomationRules();
const emailSequences = cloneDefaultEmailSequencesFromStorage();
const actionQueue = buildEnrichedActionQueue(
  demoCustomers,
  {},
  rules,
  {
    sequences: emailSequences,
    enrollments: [],
    sendLogs: demoSendLogs,
  },
);

const beforeCustomersJson = JSON.stringify(demoCustomers);
const beforeLogsJson = JSON.stringify(demoSendLogs);

const snapshot = buildReportsSnapshot({
  customers: demoCustomers,
  actionQueue,
  sendLogs: demoSendLogs,
  emailSequences,
  enrollments: [],
  rules,
  lastValidation: null,
});

assert(
  snapshot.executiveOverview.totalAccounts === 13,
  `expected 13 accounts, got ${snapshot.executiveOverview.totalAccounts}`,
);
assert(
  snapshot.executiveOverview.totalContacts === 18,
  `expected 18 contacts, got ${snapshot.executiveOverview.totalContacts}`,
);
assert(
  snapshot.accountContext.lowUsageAccounts === 8,
  `expected 8 low usage accounts, got ${snapshot.accountContext.lowUsageAccounts}`,
);
assert(
  snapshot.accountContext.renewalRiskAccounts === 3,
  `expected 3 renewal risk accounts, got ${snapshot.accountContext.renewalRiskAccounts}`,
);

assert(Boolean(snapshot.executiveOverview), "executiveOverview missing");
assert(Boolean(snapshot.importQuality), "importQuality missing");
assert(snapshot.importQuality.available === false, "importQuality should be unavailable without lastValidation");
assert(Boolean(snapshot.contactJourney), "contactJourney missing");
assert(Boolean(snapshot.actionQueue), "actionQueue missing");
assert(Boolean(snapshot.communication), "communication missing");
assert(Boolean(snapshot.sequences), "sequences missing");
assert(Boolean(snapshot.accountContext), "accountContext missing");

assert(snapshot.dataGaps.length >= 8, "expected non-empty dataGaps list");
assert(
  snapshot.dataGaps.some((gap) => gap.includes("Signals")),
  "expected Signals data gap",
);
assert(
  snapshot.dataGaps.some((gap) => gap.includes("session-only")),
  "expected session-only data gap",
);

assert(
  JSON.stringify(demoCustomers) === beforeCustomersJson,
  "customers array was mutated",
);
assert(
  JSON.stringify(demoSendLogs) === beforeLogsJson,
  "sendLogs array was mutated",
);

console.log("OK: reports snapshot verification passed");
console.log(
  `  accounts=${snapshot.executiveOverview.totalAccounts}, contacts=${snapshot.executiveOverview.totalContacts}`,
);
console.log(
  `  lowUsage=${snapshot.accountContext.lowUsageAccounts}, renewalRisk=${snapshot.accountContext.renewalRiskAccounts}`,
);
console.log(`  dataGaps=${snapshot.dataGaps.length}, importQuality.available=${snapshot.importQuality.available}`);
