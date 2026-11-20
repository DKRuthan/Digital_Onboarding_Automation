import { cloneDefaultAutomationRules } from "../lib/automation-rules-storage";
import { buildEnrichedActionQueue } from "../lib/action-workflow";
import { customers as demoCustomers, sendLogs as demoSendLogs } from "../lib/mock-data";
import { buildReportsSnapshot } from "../lib/reports-snapshot";
import { buildReportsSnapshotCsv } from "../lib/reports-export";
import { cloneDefaultEmailSequencesFromStorage } from "../lib/email-sequences-storage";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function findMetricValue(
  rows: string[][],
  section: string,
  metric: string,
): string | undefined {
  const match = rows.find(
    (row) => row[0] === section && row[1] === metric,
  );
  return match?.[2];
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
const beforeQueueJson = JSON.stringify(actionQueue);

const snapshot = buildReportsSnapshot({
  customers: demoCustomers,
  actionQueue,
  sendLogs: demoSendLogs,
  emailSequences,
  enrollments: [],
  rules,
  lastValidation: null,
});

const csv = buildReportsSnapshotCsv(snapshot);
const lines = csv.split("\n").filter((line) => line.length > 0);

assert(lines.length > 1, "CSV should contain header and data rows");

const header = parseCsvLine(lines[0]);
assert(
  header.join(",") === "section,metric,value,detail",
  `unexpected header: ${header.join(",")}`,
);

const dataRows = lines.slice(1).map(parseCsvLine);

assert(
  dataRows.some((row) => row[0] === "Executive Overview"),
  "CSV should contain Executive Overview rows",
);
assert(
  findMetricValue(dataRows, "Executive Overview", "total_accounts") === "13",
  "expected total_accounts = 13",
);
assert(
  findMetricValue(dataRows, "Executive Overview", "total_contacts") === "18",
  "expected total_contacts = 18",
);
assert(
  findMetricValue(dataRows, "Account Context", "low_usage_accounts") === "8",
  "expected low_usage_accounts = 8",
);
assert(
  dataRows.some((row) => row[0] === "Data Gaps" && row[1] === "gap"),
  "CSV should contain Data Gaps rows",
);
assert(
  dataRows.some(
    (row) =>
      row[0] === "Data Gaps" &&
      row[1] === "gap" &&
      row[2].includes("Signals"),
  ),
  "expected Signals data gap row",
);

assert(
  JSON.stringify(demoCustomers) === beforeCustomersJson,
  "customers array was mutated",
);
assert(
  JSON.stringify(demoSendLogs) === beforeLogsJson,
  "sendLogs array was mutated",
);
assert(
  JSON.stringify(actionQueue) === beforeQueueJson,
  "actionQueue array was mutated",
);

console.log("OK: reports export verification passed");
console.log(`  csv_rows=${dataRows.length}`);
console.log(
  `  total_accounts=${findMetricValue(dataRows, "Executive Overview", "total_accounts")}, total_contacts=${findMetricValue(dataRows, "Executive Overview", "total_contacts")}`,
);
console.log(
  `  low_usage_accounts=${findMetricValue(dataRows, "Account Context", "low_usage_accounts")}, data_gaps=${dataRows.filter((row) => row[0] === "Data Gaps" && row[1] === "gap").length}`,
);
