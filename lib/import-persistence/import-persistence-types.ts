import type { Customer, ImportedContact } from "@/lib/types";
import type { ValidationResult } from "@/lib/upload-validation";

export type ImportBatchStatus =
  | "validated"
  | "applied"
  | "failed"
  | "superseded";

export type ImportHeaderMode = "flat_row2" | "row2" | "legacy_single_row";

export type PersistedImportBatch = {
  id: string;
  workspace_id: string;
  status: ImportBatchStatus;
  header_mode: ImportHeaderMode;
  source_filename: string | null;
  uploaded_by: string | null;
  validation_passed: boolean;
  account_count: number;
  contact_count: number;
  blocker_count: number;
  warning_count: number;
  info_count: number;
  is_active: boolean;
  created_at: Date | string;
  validated_at: Date | string | null;
  applied_at: Date | string | null;
  superseded_at: Date | string | null;
};

export type PersistedCustomerAccount = {
  id: string;
  workspace_id: string;
  import_batch_id: string;
  account_id: string;
  account_name: string;
  plan: string | null;
  journey_stage: string | null;
  use_case: string | null;
  primary_icp: string | null;
  term_start_date: string | null;
  activation_start_date: string | null;
  activation_window_end_date: string | null;
  renewal_date: string | null;
  seats_purchased: number | null;
  search_seats_assigned: number | null;
  graph_browser_seats_assigned: number | null;
  graph_desktop_seats_assigned: number | null;
  search_active_users: number | null;
  graph_browser_active_users: number | null;
  graph_desktop_active_users: number | null;
  total_active_seats: number | null;
  total_sessions: number | null;
  onboarding_completed: boolean | null;
  onboarding_date: string | null;
  onboarding_age_days: number | null;
  near_threshold: boolean | null;
  active_users_7d: number | null;
  total_sessions_7d: number | null;
  active_users_15d: number | null;
  total_sessions_15d: number | null;
  active_users_30d: number | null;
  total_sessions_30d: number | null;
  active_users_100d: number | null;
  total_sessions_100d: number | null;
  invite_status: string | null;
  invite_sent_date: string | null;
  invite_accepted_date: string | null;
  notes: string | null;
  is_active: boolean;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type PersistedCustomerContact = {
  id: string;
  workspace_id: string;
  import_batch_id: string;
  account_id: string;
  contact_email: string;
  contact_name: string | null;
  contact_role: string | null;
  do_not_contact: boolean;
  source: "excel_import" | "demo" | "manual";
  is_active: boolean;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type PersistedImportValidationResult = {
  id: string;
  workspace_id: string;
  import_batch_id: string;
  passed: boolean;
  header_mode: ImportHeaderMode;
  format_label: string | null;
  account_count: number;
  contact_count: number;
  signal_count: number;
  blocker_count: number;
  warning_count: number;
  info_count: number;
  duplicate_contact_email_count: number;
  orphan_contact_count: number;
  orphan_signal_count: number;
  created_at: Date | string;
};

export type PersistedImportIssue = {
  severity: "blocker" | "warning" | "info";
  code: string;
  message: string;
  sheet_name: string | null;
  row_number: number | null;
  account_id: string | null;
  contact_email: string | null;
};

export type ImportBatchSummary = {
  id: string;
  workspaceId: string;
  status: ImportBatchStatus;
  headerMode: ImportHeaderMode;
  sourceFilename: string | null;
  uploadedBy: string | null;
  validationPassed: boolean;
  accountCount: number;
  contactCount: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  isActive: boolean;
  createdAt: string;
  appliedAt: string | null;
  supersededAt: string | null;
};

export type ActiveImportState = {
  batch: ImportBatchSummary;
  customers: Customer[];
  importedContacts: ImportedContact[];
  validationSummary: PersistedImportValidationResult | null;
};

export type ApplyImportPersistenceInput = {
  workspaceId: string;
  validationResult: ValidationResult;
  sourceFilename?: string;
  uploadedBy?: string | null;
  workspaceName?: string;
};

export type ApplyImportPersistenceResult =
  | {
      ok: true;
      importBatchId: string;
      customers: Customer[];
      importedContacts: ImportedContact[];
    }
  | {
      ok: false;
      code:
        | "PERSISTENCE_DISABLED"
        | "DATABASE_NOT_CONFIGURED"
        | "VALIDATION_NOT_PASSED"
        | "CONSTRAINT_VIOLATION"
        | "TRANSACTION_FAILED";
      message: string;
    };

export type SaveValidationInput = {
  workspaceId: string;
  validationResult: ValidationResult;
  sourceFilename?: string;
  uploadedBy?: string | null;
};

export type CreateImportBatchInput = {
  workspaceId: string;
  status: ImportBatchStatus;
  headerMode: ImportHeaderMode;
  sourceFilename?: string | null;
  uploadedBy?: string | null;
  validationPassed: boolean;
  accountCount: number;
  contactCount: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  isActive?: boolean;
  appliedAt?: boolean;
};

export type InsertCustomerAccountInput = {
  workspaceId: string;
  importBatchId: string;
  account: Omit<
    PersistedCustomerAccount,
    | "id"
    | "workspace_id"
    | "import_batch_id"
    | "is_active"
    | "first_seen_at"
    | "last_seen_at"
    | "created_at"
    | "updated_at"
  >;
};

export type InsertCustomerContactInput = {
  workspaceId: string;
  importBatchId: string;
  contact: {
    account_id: string;
    contact_email: string;
    contact_name?: string | null;
    contact_role?: string | null;
    do_not_contact: boolean;
    source?: "excel_import" | "demo" | "manual";
  };
};

export type SaveImportValidationResultInput = {
  workspaceId: string;
  importBatchId: string;
  passed: boolean;
  headerMode: ImportHeaderMode;
  formatLabel?: string | null;
  accountCount: number;
  contactCount: number;
  signalCount: number;
  blockerCount: number;
  warningCount: number;
  infoCount: number;
  duplicateContactEmailCount: number;
  orphanContactCount: number;
  orphanSignalCount: number;
};

export type SaveImportRowIssuesInput = {
  workspaceId: string;
  importBatchId: string;
  issues: PersistedImportIssue[];
};
