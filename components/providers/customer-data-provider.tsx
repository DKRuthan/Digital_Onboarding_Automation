"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type {
  ActionQueueItem,
  ActionWorkflowStatus,
  Customer,
  DashboardStats,
  EditableAutomationRule,
  EmailTemplate,
  ImportedContact,
  SendLog,
  SendLogStatus,
  SendLogMode,
  WorkflowSummary,
} from "@/lib/types";
import { customers as demoCustomers, sendLogs as demoSendLogs } from "@/lib/mock-data";
import {
  buildActionQueue,
  computeDashboardStats,
} from "@/lib/automation-rules";
import {
  cloneDefaultAutomationRules,
  clearStoredAutomationRules,
  loadStoredAutomationRules,
  normalizeAutomationRule,
  saveStoredAutomationRules,
} from "@/lib/automation-rules-storage";
import {
  countRuleCustomerMatches,
  duplicateAutomationRule,
  testAutomationRule,
  validateAutomationRuleShape,
} from "@/lib/automation-rule-engine";
import {
  cloneDefaultEmailTemplatesFromStorage,
  clearStoredEmailTemplates,
  loadStoredEmailTemplates,
  normalizeEmailTemplate,
  saveStoredEmailTemplates,
} from "@/lib/email-templates-storage";
import {
  cloneDefaultEmailSequencesFromStorage,
  clearStoredEmailSequences,
  loadStoredEmailSequences,
  normalizeEmailSequence,
  saveStoredEmailSequences,
} from "@/lib/email-sequences-storage";
import {
  duplicateEmailSequence,
  validateEmailSequence,
} from "@/lib/email-sequence-definitions";
import type { EditableEmailSequence } from "@/lib/email-sequence-definitions";
import {
  buildEnrollmentRecord,
  getEnrollmentsForContactEmail,
} from "@/lib/email-sequence-enrollment";
import {
  clearStoredSequenceEnrollments,
  loadStoredSequenceEnrollments,
  saveStoredSequenceEnrollments,
} from "@/lib/email-sequence-enrollments-storage";
import type { SequenceEnrollment, StepCompletionSource } from "@/lib/email-sequence-types";
import type { RecipientType } from "@/lib/types";
import {
  completeEnrollmentStep as advanceEnrollmentCompleteStep,
  finalizeEnrollmentManually,
  moveEnrollmentToNextStep,
  moveEnrollmentToStep as advanceEnrollmentToStep,
  skipEnrollmentStep as advanceEnrollmentSkipStep,
} from "@/lib/email-sequence-progression";
import { duplicateEmailTemplate } from "@/lib/email-template-engine";
import type { RuleTestMatch } from "@/lib/types";
import {
  buildEnrichedActionQueue,
  computeWorkflowSummary,
  isCompletedInternalSendStatus,
  resetWorkflowStatusForItem,
} from "@/lib/action-workflow";
import { buildSequenceActionQueueItems } from "@/lib/email-sequence-queue";
import type { ValidationResult } from "@/lib/upload-validation";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import {
  buildSimulatedCommunicationLog,
  isDuplicateSimulatedLog,
} from "@/lib/communication-logs/simulated-log";
import { partitionSimulatedLogEligibility } from "@/lib/communication-logs/simulated-log-eligibility";
import {
  clearLocalActiveImport,
  loadLocalActiveImport,
  rebuildValidationResultFromStored,
  saveLocalActiveImport,
  type LocalActiveImportSummary,
} from "@/lib/local-import-persistence";

type DataSource = "demo" | "upload";

interface WorkflowLogInput {
  customer_name: string;
  issue: string;
  action: string;
  recipient: string;
  template: string;
  status: SendLogStatus;
  note?: string;
  error?: string;
  send_mode?: SendLogMode;
  enrollment_id?: string;
  contact_email?: string;
  sequence_key?: string;
  sequence_name?: string;
  sequence_step_number?: number;
  conflict_status?: string;
  conflict_reason?: string;
  contact_role?: string;
  sequence_step_name?: string;
}

type EnrollmentProgressResult =
  | { ok: true; enrollment: SequenceEnrollment }
  | { ok: false; error: string };

export type ApplyUploadedDataPayload = {
  customers: Customer[];
  importedContacts: ImportedContact[];
  sourceFilename?: string | null;
  validationSummary?: LocalActiveImportSummary | null;
};

interface CustomerDataContextValue {
  isCustomerDataHydrated: boolean;
  customers: Customer[];
  importedContacts: ImportedContact[];
  dataSource: DataSource;
  automationRules: EditableAutomationRule[];
  emailTemplates: EmailTemplate[];
  emailSequences: EditableEmailSequence[];
  stats: DashboardStats;
  actionQueue: ActionQueueItem[];
  workflowSummary: WorkflowSummary;
  lastValidation: ValidationResult | null;
  setLastValidation: (result: ValidationResult | null) => void;
  applyUploadedCustomers: (payload: ApplyUploadedDataPayload) => void;
  restoreDemoData: () => void;
  runAutomations: () => number;
  saveAutomationRule: (rule: EditableAutomationRule) => void;
  duplicateAutomationRuleById: (ruleId: string) => void;
  toggleAutomationRuleActive: (ruleId: string) => void;
  resetAutomationRulesToDefaults: () => void;
  saveEmailTemplate: (template: EmailTemplate) => void;
  duplicateEmailTemplateById: (templateId: string) => void;
  approveEmailTemplateById: (templateId: string) => void;
  archiveEmailTemplateById: (templateId: string) => void;
  resetEmailTemplatesToDefaults: () => void;
  saveEmailSequence: (sequence: EditableEmailSequence) => void;
  duplicateEmailSequenceById: (sequenceId: string) => void;
  approveEmailSequenceById: (
    sequenceId: string,
  ) => { ok: true } | { ok: false; errors: string[] };
  archiveEmailSequenceById: (sequenceId: string) => void;
  resetEmailSequencesToDefaults: () => void;
  sequenceEnrollments: SequenceEnrollment[];
  createEnrollment: (params: {
    customerId: string;
    sequenceKey: string;
    contactRole: RecipientType;
  }) => { ok: true; enrollment: SequenceEnrollment } | { ok: false; error: string };
  pauseEnrollment: (enrollmentId: string) => void;
  resumeEnrollment: (enrollmentId: string) => void;
  cancelEnrollment: (enrollmentId: string) => void;
  exitEnrollment: (enrollmentId: string, exitReason?: string) => void;
  resetEnrollments: () => void;
  getEnrollmentById: (enrollmentId: string) => SequenceEnrollment | undefined;
  getEnrollmentsForContact: (contactEmail: string) => SequenceEnrollment[];
  completeEnrollmentStep: (
    enrollmentId: string,
    options?: {
      completion_source?: StepCompletionSource;
      notes?: string;
    },
  ) => EnrollmentProgressResult;
  skipEnrollmentStep: (
    enrollmentId: string,
    reason?: string,
  ) => EnrollmentProgressResult;
  moveEnrollmentToNextStep: (
    enrollmentId: string,
    notes?: string,
  ) => EnrollmentProgressResult;
  moveEnrollmentToStep: (
    enrollmentId: string,
    stepNumber: number,
  ) => EnrollmentProgressResult;
  completeEnrollment: (enrollmentId: string) => EnrollmentProgressResult;
  getEmailTemplateByKey: (key: string) => EmailTemplate | undefined;
  getRuleMatchCount: (ruleId: string) => number;
  testAutomationRuleById: (ruleId: string) => RuleTestMatch[];
  sendLogs: SendLog[];
  updateWorkflowStatus: (
    actionIds: string[],
    status: ActionWorkflowStatus,
    note?: string,
    logRecipient?: string,
  ) => void;
  resetWorkflowStatus: (actionIds: string[]) => void;
  addWorkflowLog: (log: WorkflowLogInput) => void;
  logInternalSend: (
    item: ActionQueueItem,
    success: boolean,
    deliverTo?: string,
    error?: string,
    sendMode?: "dry_run" | "live",
    routingReason?: string,
  ) => void;
  createSimulatedCommunicationLogs: (
    items: ActionQueueItem[],
  ) => {
    createdCount: number;
    skippedDuplicateCount: number;
    blockedCount: number;
    createdLogs: SendLog[];
    blockedReasons: Array<{ itemId: string; reason: string }>;
  };
}

const CustomerDataContext = createContext<CustomerDataContextValue | null>(
  null,
);

export function CustomerDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCustomerDataHydrated, setIsCustomerDataHydrated] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("demo");
  const [automationRules, setAutomationRules] = useState<EditableAutomationRule[]>(
    () => cloneDefaultAutomationRules(),
  );
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(() =>
    cloneDefaultEmailTemplatesFromStorage(),
  );
  const [emailSequences, setEmailSequences] = useState<EditableEmailSequence[]>(
    () => cloneDefaultEmailSequencesFromStorage(),
  );
  const [sequenceEnrollments, setSequenceEnrollments] = useState<
    SequenceEnrollment[]
  >([]);
  const [lastValidation, setLastValidation] =
    useState<ValidationResult | null>(null);
  const [sendLogs, setSendLogs] = useState<SendLog[]>(demoSendLogs);
  const [workflowStatuses, setWorkflowStatuses] = useState<
    Record<string, ActionWorkflowStatus>
  >({});

  useLayoutEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydration bootstrap from localStorage */
    const storedImport = loadLocalActiveImport();
    if (storedImport) {
      setCustomers(storedImport.customers);
      setImportedContacts(storedImport.importedContacts);
      setDataSource("upload");
      const rebuilt = rebuildValidationResultFromStored(storedImport);
      if (rebuilt) setLastValidation(rebuilt);
    } else {
      setCustomers(demoCustomers);
      setImportedContacts([]);
      setDataSource("demo");
    }
    setIsCustomerDataHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const storedRules = loadStoredAutomationRules();
    if (storedRules) {
      const timer = window.setTimeout(() => {
        setAutomationRules(storedRules);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const storedTemplates = loadStoredEmailTemplates();
    if (!storedTemplates) return;

    const timer = window.setTimeout(() => {
      setEmailTemplates(storedTemplates);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const storedSequences = loadStoredEmailSequences();
    if (!storedSequences) return;

    const timer = window.setTimeout(() => {
      setEmailSequences(storedSequences);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const storedEnrollments = loadStoredSequenceEnrollments();
    if (storedEnrollments === null) return;

    const timer = window.setTimeout(() => {
      setSequenceEnrollments(storedEnrollments);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    saveStoredAutomationRules(automationRules);
  }, [automationRules]);

  useEffect(() => {
    saveStoredEmailTemplates(emailTemplates);
  }, [emailTemplates]);

  useEffect(() => {
    saveStoredEmailSequences(emailSequences);
  }, [emailSequences]);

  useEffect(() => {
    saveStoredSequenceEnrollments(sequenceEnrollments);
  }, [sequenceEnrollments]);

  const sequenceQueueContext = useMemo(
    () => ({
      sequences: emailSequences,
      enrollments: sequenceEnrollments,
      sendLogs,
    }),
    [emailSequences, sequenceEnrollments, sendLogs],
  );

  const stats = useMemo(() => {
    const base = computeDashboardStats(customers, automationRules);
    const sequenceCount = buildSequenceActionQueueItems({
      ...sequenceQueueContext,
      customers,
    }).length;
    return {
      ...base,
      actionsInQueue: base.actionsInQueue + sequenceCount,
    };
  }, [customers, automationRules, sequenceQueueContext]);

  const actionQueue = useMemo(
    () =>
      buildEnrichedActionQueue(
        customers,
        workflowStatuses,
        automationRules,
        sequenceQueueContext,
      ),
    [customers, workflowStatuses, automationRules, sequenceQueueContext],
  );
  const workflowSummary = useMemo(
    () => computeWorkflowSummary(actionQueue),
    [actionQueue],
  );

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.customer_id, c])),
    [customers],
  );

  const addWorkflowLog = useCallback((log: WorkflowLogInput) => {
    const entry: SendLog = {
      id: `LOG-WF-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString(),
      customer_name: log.customer_name,
      issue: log.issue,
      action: log.action,
      recipient: log.recipient,
      template: log.template,
      status: log.status,
      note: log.note ?? "",
      error: log.error ?? "",
      send_mode: log.send_mode ?? "",
      enrollment_id: log.enrollment_id,
      contact_email: log.contact_email,
      contact_role: log.contact_role,
      sequence_key: log.sequence_key,
      sequence_name: log.sequence_name,
      sequence_step_number: log.sequence_step_number,
      sequence_step_name: log.sequence_step_name,
      conflict_status: log.conflict_status as SendLog["conflict_status"],
      conflict_reason: log.conflict_reason,
    };
    setSendLogs((prev) => [entry, ...prev]);
  }, []);

  const logInternalSend = useCallback(
    (
      item: ActionQueueItem,
      success: boolean,
      deliverTo?: string,
      error?: string,
      sendMode?: "dry_run" | "live",
      routingReason?: string,
    ) => {
      addWorkflowLog({
        customer_name: item.customer_name,
        issue: item.issue,
        action: item.recommended_action,
        recipient: deliverTo ?? item.recipient,
        template: item.template,
        status: success
          ? sendMode === "live"
            ? "Live Internal Alert Sent"
            : "Dry Run Complete"
          : "Internal Send Failed",
        send_mode: sendMode,
        note: success
          ? sendMode === "live"
            ? `Live internal alert sent to ${deliverTo ?? item.recipient}${routingReason ? ` (${routingReason})` : ""}`
            : "Dry run completed. No email was sent."
          : "Internal send attempt failed",
        error: error ?? "",
        enrollment_id: item.enrollment_id,
        contact_email: item.contact_email,
        contact_role: item.recipient_type,
        sequence_key: item.sequence_key,
        sequence_name: item.sequence_name,
        sequence_step_number: item.sequence_step_number,
        sequence_step_name: item.sequence_step_name,
        conflict_status: item.conflict_status,
        conflict_reason: item.conflict_reason ?? undefined,
      });
    },
    [addWorkflowLog],
  );

  const createSimulatedCommunicationLogs = useCallback(
    (items: ActionQueueItem[]) => {
      const context = {
        customers,
        emailTemplates,
        automationRules,
      };
      const { eligible, blocked } = partitionSimulatedLogEligibility(
        items,
        context,
      );

      const createdLogs: SendLog[] = [];
      let skippedDuplicateCount = 0;
      const working = [...sendLogs];

      for (const entry of eligible) {
        const customer = customers.find(
          (c) => c.customer_id === entry.item.customer_id,
        );
        if (!customer) continue;

        const candidate = buildSimulatedCommunicationLog({
          item: entry.item,
          customer,
          subject: entry.subject,
          templateId: entry.templateId,
          triggerName: entry.triggerName,
        });

        if (isDuplicateSimulatedLog(working, candidate)) {
          skippedDuplicateCount += 1;
          continue;
        }

        working.unshift(candidate);
        createdLogs.push(candidate);
      }

      if (createdLogs.length > 0) {
        setSendLogs(working);
      }

      const result = {
        createdCount: createdLogs.length,
        skippedDuplicateCount,
        blockedCount: blocked.length,
        createdLogs,
        blockedReasons: blocked.map((entry) => ({
          itemId: entry.item.id,
          reason: entry.reason,
        })),
      };

      if (
        result.createdCount > 0 ||
        result.skippedDuplicateCount > 0 ||
        result.blockedCount > 0
      ) {
        recordClientAuditEvent({
          action: "send.simulated_log.created",
          targetType: "communication_log",
          metadata: {
            count_created: result.createdCount,
            count_skipped_duplicate: result.skippedDuplicateCount,
            count_blocked: result.blockedCount,
            send_mode: "logged_only",
          },
        });
      }

      return result;
    },
    [sendLogs, customers, emailTemplates, automationRules],
  );

  const updateWorkflowStatus = useCallback(
    (
      actionIds: string[],
      status: ActionWorkflowStatus,
      note?: string,
      logRecipient?: string,
    ) => {
      setWorkflowStatuses((prev) => {
        const next = { ...prev };
        for (const id of actionIds) next[id] = status;
        return next;
      });

      if (isCompletedInternalSendStatus(status)) return;

      const nextStatuses = { ...workflowStatuses };
      for (const id of actionIds) nextStatuses[id] = status;
      const queue = buildEnrichedActionQueue(
        customers,
        nextStatuses,
        automationRules,
        sequenceQueueContext,
      );

      for (const id of actionIds) {
        const item = queue.find((a) => a.id === id);
        if (!item) continue;
        if (status === "Test Sent") {
          addWorkflowLog({
            customer_name: item.customer_name,
            issue: item.issue,
            action: item.recommended_action,
            recipient: logRecipient ?? item.recipient,
            template: item.template,
            status: "Test Sent",
            send_mode: "test",
            note: "Test email sent to SENDGRID_TEST_TO_EMAIL, not to the customer.",
          });
          continue;
        }
        if (
          status === "Previewed" ||
          status === "Approved" ||
          status === "Skipped"
        ) {
          addWorkflowLog({
            customer_name: item.customer_name,
            issue: item.issue,
            action: item.recommended_action,
            recipient: logRecipient ?? item.recipient,
            template: item.template,
            status,
            note: note ?? `Workflow status changed to ${status}`,
          });
        }
      }
    },
    [customers, workflowStatuses, automationRules, sequenceQueueContext, addWorkflowLog],
  );

  const resetWorkflowStatus = useCallback(
    (actionIds: string[]) => {
      setWorkflowStatuses((prev) => {
        const next = { ...prev };
        for (const id of actionIds) {
          const item = actionQueue.find((a) => a.id === id);
          const customer = item
            ? customerMap.get(item.customer_id)
            : undefined;
          next[id] = customer
            ? resetWorkflowStatusForItem(id, customer)
            : "Needs Review";
        }
        return next;
      });
    },
    [actionQueue, customerMap],
  );

  const applyUploadedCustomers = useCallback((payload: ApplyUploadedDataPayload) => {
    setCustomers(payload.customers);
    setImportedContacts(payload.importedContacts);
    setDataSource("upload");
    setWorkflowStatuses({});
    saveLocalActiveImport({
      customers: payload.customers,
      importedContacts: payload.importedContacts,
      sourceFilename: payload.sourceFilename,
      validationSummary: payload.validationSummary,
    });
  }, []);

  const resetAutomationRulesToDefaults = useCallback(() => {
    setAutomationRules(cloneDefaultAutomationRules());
    clearStoredAutomationRules();
  }, []);

  const resetEmailTemplatesToDefaults = useCallback(() => {
    setEmailTemplates(cloneDefaultEmailTemplatesFromStorage());
    clearStoredEmailTemplates();
  }, []);

  const saveAutomationRule = useCallback((rule: EditableAutomationRule) => {
    const normalized = normalizeAutomationRule(rule);
    const shapeErrors = validateAutomationRuleShape(normalized);
    if (shapeErrors.length > 0) {
      console.warn(
        "saveAutomationRule rejected invalid rule shape:",
        shapeErrors.join("; "),
      );
      return;
    }
    setAutomationRules((prev) => {
      const index = prev.findIndex((r) => r.id === normalized.id);
      if (index === -1) return [...prev, normalized];
      const next = [...prev];
      next[index] = normalized;
      return next;
    });
  }, []);

  const duplicateAutomationRuleById = useCallback((ruleId: string) => {
    setAutomationRules((prev) => {
      const source = prev.find((r) => r.id === ruleId);
      if (!source) return prev;
      return [...prev, duplicateAutomationRule(source, prev)];
    });
  }, []);

  const toggleAutomationRuleActive = useCallback((ruleId: string) => {
    setAutomationRules((prev) =>
      prev.map((rule) =>
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule,
      ),
    );
  }, []);

  const getRuleMatchCount = useCallback(
    (ruleId: string) => {
      const rule = automationRules.find((r) => r.id === ruleId);
      if (!rule) return 0;
      return countRuleCustomerMatches(rule, customers);
    },
    [automationRules, customers],
  );

  const saveEmailTemplate = useCallback((template: EmailTemplate) => {
    const normalized = normalizeEmailTemplate({
      ...template,
      updated_at: new Date().toISOString(),
      variables_used: template.variables_used,
    });
    setEmailTemplates((prev) => {
      const index = prev.findIndex((entry) => entry.id === normalized.id);
      if (index === -1) return [...prev, normalized];
      const next = [...prev];
      next[index] = {
        ...normalized,
        version: prev[index].version + 1,
        latest_change_note: normalized.latest_change_note,
        created_at: prev[index].created_at,
      };
      return next;
    });
  }, []);

  const duplicateEmailTemplateById = useCallback((templateId: string) => {
    setEmailTemplates((prev) => {
      const source = prev.find((template) => template.id === templateId);
      if (!source) return prev;
      return [...prev, duplicateEmailTemplate(source, prev)];
    });
  }, []);

  const approveEmailTemplateById = useCallback((templateId: string) => {
    setEmailTemplates((prev) =>
      prev.map((template) =>
        template.id === templateId
          ? {
              ...template,
              status: "approved",
              updated_at: new Date().toISOString(),
            }
          : template,
      ),
    );
  }, []);

  const archiveEmailTemplateById = useCallback((templateId: string) => {
    setEmailTemplates((prev) =>
      prev.map((template) =>
        template.id === templateId
          ? {
              ...template,
              status: "archived",
              updated_at: new Date().toISOString(),
            }
          : template,
      ),
    );
  }, []);

  const resetEmailSequencesToDefaults = useCallback(() => {
    setEmailSequences(cloneDefaultEmailSequencesFromStorage());
    clearStoredEmailSequences();
  }, []);

  const saveEmailSequence = useCallback((sequence: EditableEmailSequence) => {
    const normalized = normalizeEmailSequence(sequence);
    setEmailSequences((prev) => {
      const index = prev.findIndex((entry) => entry.id === normalized.id);
      if (index === -1) return [...prev, normalized];
      const next = [...prev];
      next[index] = {
        ...normalized,
        version: prev[index].version + 1,
        latest_change_note: normalized.latest_change_note,
        created_at: prev[index].created_at,
      };
      return next;
    });
  }, []);

  const duplicateEmailSequenceById = useCallback((sequenceId: string) => {
    setEmailSequences((prev) => {
      const source = prev.find((entry) => entry.id === sequenceId);
      if (!source) return prev;
      return [...prev, duplicateEmailSequence(source, prev)];
    });
  }, []);

  const approveEmailSequenceById = useCallback(
    (sequenceId: string): { ok: true } | { ok: false; errors: string[] } => {
      const sequence = emailSequences.find((entry) => entry.id === sequenceId);
      if (!sequence) {
        return { ok: false, errors: ["Sequence not found."] };
      }

      const validationErrors = validateEmailSequence(
        sequence,
        emailSequences,
        emailTemplates,
      );
      if (validationErrors.length > 0) {
        return { ok: false, errors: validationErrors };
      }

      setEmailSequences((prev) =>
        prev.map((entry) =>
          entry.id === sequenceId
            ? {
                ...entry,
                status: "approved",
                updated_at: new Date().toISOString(),
              }
            : entry,
        ),
      );
      return { ok: true };
    },
    [emailSequences, emailTemplates],
  );

  const archiveEmailSequenceById = useCallback((sequenceId: string) => {
    setEmailSequences((prev) =>
      prev.map((entry) =>
        entry.id === sequenceId
          ? {
              ...entry,
              status: "archived",
              updated_at: new Date().toISOString(),
            }
          : entry,
      ),
    );
  }, []);

  const createEnrollment = useCallback(
    (params: {
      customerId: string;
      sequenceKey: string;
      contactRole: RecipientType;
    }) => {
      const customer = customers.find(
        (entry) => entry.customer_id === params.customerId,
      );
      const sequence = emailSequences.find(
        (entry) => entry.key === params.sequenceKey,
      );
      if (!customer || !sequence) {
        return { ok: false as const, error: "Customer or sequence not found." };
      }

      const result = buildEnrollmentRecord({
        customer,
        sequence,
        contactRole: params.contactRole,
        existingEnrollments: sequenceEnrollments,
      });
      if (!result.ok) {
        return { ok: false as const, error: result.error };
      }

      setSequenceEnrollments((prev) => [...prev, result.enrollment]);
      return { ok: true as const, enrollment: result.enrollment };
    },
    [customers, emailSequences, sequenceEnrollments],
  );

  const pauseEnrollment = useCallback((enrollmentId: string) => {
    setSequenceEnrollments((prev) =>
      prev.map((entry) =>
        entry.id === enrollmentId && entry.enrollment_status === "active"
          ? { ...entry, enrollment_status: "paused" }
          : entry,
      ),
    );
  }, []);

  const resumeEnrollment = useCallback((enrollmentId: string) => {
    setSequenceEnrollments((prev) =>
      prev.map((entry) =>
        entry.id === enrollmentId && entry.enrollment_status === "paused"
          ? { ...entry, enrollment_status: "active" }
          : entry,
      ),
    );
  }, []);

  const cancelEnrollment = useCallback((enrollmentId: string) => {
    setSequenceEnrollments((prev) =>
      prev.map((entry) =>
        entry.id === enrollmentId &&
        (entry.enrollment_status === "active" ||
          entry.enrollment_status === "paused")
          ? {
              ...entry,
              enrollment_status: "cancelled",
              exit_reason: "Cancelled by user",
            }
          : entry,
      ),
    );
  }, []);

  const exitEnrollment = useCallback(
    (enrollmentId: string, exitReason = "Exited by user") => {
      setSequenceEnrollments((prev) =>
        prev.map((entry) =>
          entry.id === enrollmentId &&
          (entry.enrollment_status === "active" ||
            entry.enrollment_status === "paused")
            ? {
                ...entry,
                enrollment_status: "exited",
                exit_reason: exitReason,
              }
            : entry,
        ),
      );
    },
    [],
  );

  const resetEnrollments = useCallback(() => {
    setSequenceEnrollments([]);
    clearStoredSequenceEnrollments();
  }, []);

  const restoreDemoData = useCallback(() => {
    clearLocalActiveImport();
    setCustomers(demoCustomers);
    setImportedContacts([]);
    setDataSource("demo");
    setLastValidation(null);
    setWorkflowStatuses({});
    setSendLogs(demoSendLogs);
    resetAutomationRulesToDefaults();
    resetEmailTemplatesToDefaults();
    resetEmailSequencesToDefaults();
    resetEnrollments();
  }, [
    resetAutomationRulesToDefaults,
    resetEmailTemplatesToDefaults,
    resetEmailSequencesToDefaults,
    resetEnrollments,
  ]);

  const getEnrollmentById = useCallback(
    (enrollmentId: string) =>
      sequenceEnrollments.find((entry) => entry.id === enrollmentId),
    [sequenceEnrollments],
  );

  const getEnrollmentsForContact = useCallback(
    (contactEmail: string) =>
      getEnrollmentsForContactEmail(sequenceEnrollments, contactEmail),
    [sequenceEnrollments],
  );

  const resolveEnrollmentForProgress = useCallback(
    (
      enrollmentId: string,
    ):
      | { ok: false; error: string }
      | {
          ok: true;
          enrollment: SequenceEnrollment;
          sequence: EditableEmailSequence;
        } => {
      const enrollment = sequenceEnrollments.find(
        (entry) => entry.id === enrollmentId,
      );
      if (!enrollment) {
        return { ok: false, error: "Enrollment not found." };
      }
      const sequence = emailSequences.find(
        (entry) => entry.key === enrollment.sequence_key,
      );
      if (!sequence) {
        return { ok: false, error: "Sequence definition not found." };
      }
      return { ok: true, enrollment, sequence };
    },
    [sequenceEnrollments, emailSequences],
  );

  const applyEnrollmentUpdate = useCallback(
    (enrollmentId: string, updated: SequenceEnrollment) => {
      setSequenceEnrollments((prev) =>
        prev.map((entry) => (entry.id === enrollmentId ? updated : entry)),
      );
    },
    [],
  );

  const completeEnrollmentStep = useCallback(
    (
      enrollmentId: string,
      options?: {
        completion_source?: StepCompletionSource;
        notes?: string;
      },
    ): EnrollmentProgressResult => {
      const resolved = resolveEnrollmentForProgress(enrollmentId);
      if (!resolved.ok) return resolved;
      const result = advanceEnrollmentCompleteStep(
        resolved.enrollment,
        resolved.sequence,
        options,
      );
      if (!result.ok) return result;
      applyEnrollmentUpdate(enrollmentId, result.enrollment);
      return result;
    },
    [resolveEnrollmentForProgress, applyEnrollmentUpdate],
  );

  const skipEnrollmentStep = useCallback(
    (enrollmentId: string, reason?: string): EnrollmentProgressResult => {
      const resolved = resolveEnrollmentForProgress(enrollmentId);
      if (!resolved.ok) return resolved;
      const result = advanceEnrollmentSkipStep(
        resolved.enrollment,
        resolved.sequence,
        reason,
      );
      if (!result.ok) return result;
      applyEnrollmentUpdate(enrollmentId, result.enrollment);
      return result;
    },
    [resolveEnrollmentForProgress, applyEnrollmentUpdate],
  );

  const moveEnrollmentToNextStepHandler = useCallback(
    (enrollmentId: string, notes?: string): EnrollmentProgressResult => {
      const resolved = resolveEnrollmentForProgress(enrollmentId);
      if (!resolved.ok) return resolved;
      const result = moveEnrollmentToNextStep(
        resolved.enrollment,
        resolved.sequence,
        notes,
      );
      if (!result.ok) return result;
      applyEnrollmentUpdate(enrollmentId, result.enrollment);
      return result;
    },
    [resolveEnrollmentForProgress, applyEnrollmentUpdate],
  );

  const moveEnrollmentToStep = useCallback(
    (enrollmentId: string, stepNumber: number): EnrollmentProgressResult => {
      const resolved = resolveEnrollmentForProgress(enrollmentId);
      if (!resolved.ok) return resolved;
      const result = advanceEnrollmentToStep(
        resolved.enrollment,
        resolved.sequence,
        stepNumber,
      );
      if (!result.ok) return result;
      applyEnrollmentUpdate(enrollmentId, result.enrollment);
      return result;
    },
    [resolveEnrollmentForProgress, applyEnrollmentUpdate],
  );

  const completeEnrollment = useCallback(
    (enrollmentId: string): EnrollmentProgressResult => {
      const resolved = resolveEnrollmentForProgress(enrollmentId);
      if (!resolved.ok) return resolved;
      const result = finalizeEnrollmentManually(resolved.enrollment);
      if (!result.ok) return result;
      applyEnrollmentUpdate(enrollmentId, result.enrollment);
      return result;
    },
    [resolveEnrollmentForProgress, applyEnrollmentUpdate],
  );

  const getEmailTemplateByKey = useCallback(
    (key: string) => emailTemplates.find((template) => template.key === key),
    [emailTemplates],
  );

  const testAutomationRuleById = useCallback(
    (ruleId: string) => {
      const rule = automationRules.find((r) => r.id === ruleId);
      if (!rule) return [];
      return testAutomationRule(rule, customers);
    },
    [automationRules, customers],
  );

  const runAutomations = useCallback(() => {
    return buildActionQueue(customers, automationRules).length;
  }, [customers, automationRules]);

  const value = useMemo(
    () => ({
      isCustomerDataHydrated,
      customers,
      importedContacts,
      dataSource,
      automationRules,
      emailTemplates,
      emailSequences,
      stats,
      actionQueue,
      workflowSummary,
      lastValidation,
      setLastValidation,
      applyUploadedCustomers,
      restoreDemoData,
      runAutomations,
      saveAutomationRule,
      duplicateAutomationRuleById,
      toggleAutomationRuleActive,
      resetAutomationRulesToDefaults,
      saveEmailTemplate,
      duplicateEmailTemplateById,
      approveEmailTemplateById,
      archiveEmailTemplateById,
      resetEmailTemplatesToDefaults,
      saveEmailSequence,
      duplicateEmailSequenceById,
      approveEmailSequenceById,
      archiveEmailSequenceById,
      resetEmailSequencesToDefaults,
      sequenceEnrollments,
      createEnrollment,
      pauseEnrollment,
      resumeEnrollment,
      cancelEnrollment,
      exitEnrollment,
      resetEnrollments,
      getEnrollmentById,
      getEnrollmentsForContact,
      completeEnrollmentStep,
      skipEnrollmentStep,
      moveEnrollmentToNextStep: moveEnrollmentToNextStepHandler,
      moveEnrollmentToStep,
      completeEnrollment,
      getEmailTemplateByKey,
      getRuleMatchCount,
      testAutomationRuleById,
      sendLogs,
      updateWorkflowStatus,
      resetWorkflowStatus,
      addWorkflowLog,
      logInternalSend,
      createSimulatedCommunicationLogs,
    }),
    [
      isCustomerDataHydrated,
      customers,
      importedContacts,
      dataSource,
      automationRules,
      emailTemplates,
      emailSequences,
      stats,
      actionQueue,
      workflowSummary,
      lastValidation,
      applyUploadedCustomers,
      restoreDemoData,
      runAutomations,
      saveAutomationRule,
      duplicateAutomationRuleById,
      toggleAutomationRuleActive,
      resetAutomationRulesToDefaults,
      saveEmailTemplate,
      duplicateEmailTemplateById,
      approveEmailTemplateById,
      archiveEmailTemplateById,
      resetEmailTemplatesToDefaults,
      saveEmailSequence,
      duplicateEmailSequenceById,
      approveEmailSequenceById,
      archiveEmailSequenceById,
      resetEmailSequencesToDefaults,
      sequenceEnrollments,
      createEnrollment,
      pauseEnrollment,
      resumeEnrollment,
      cancelEnrollment,
      exitEnrollment,
      resetEnrollments,
      getEnrollmentById,
      getEnrollmentsForContact,
      completeEnrollmentStep,
      skipEnrollmentStep,
      moveEnrollmentToNextStepHandler,
      moveEnrollmentToStep,
      completeEnrollment,
      getEmailTemplateByKey,
      getRuleMatchCount,
      testAutomationRuleById,
      sendLogs,
      updateWorkflowStatus,
      resetWorkflowStatus,
      addWorkflowLog,
      logInternalSend,
      createSimulatedCommunicationLogs,
    ],
  );

  return (
    <CustomerDataContext.Provider value={value}>
      {children}
    </CustomerDataContext.Provider>
  );
}

export function useCustomerData() {
  const context = useContext(CustomerDataContext);
  if (!context) {
    throw new Error("useCustomerData must be used within CustomerDataProvider");
  }
  return context;
}
