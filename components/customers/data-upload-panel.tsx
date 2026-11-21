"use client";

import { useRef, useState } from "react";
import { useCan } from "@/components/auth/permissions-provider";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { downloadExcelImportTemplate } from "@/lib/import-templates";
import {
  detectImportFormatFromFile,
  type ImportFormatResult,
} from "@/lib/import-format-detection";
import { validateTargetMultisheetFile } from "@/lib/import-multisheet-validation";
import {
  parseUploadFile,
  validateCustomerRows,
  type ValidationResult,
} from "@/lib/upload-validation";
import { MultisheetImportPreview } from "./multisheet-import-preview";
import { UploadedDataQualityPreview } from "./data-quality-review-panel";
import type { ImportFormat } from "@/lib/import-format-detection";
import type { SequenceEnrollment } from "@/lib/email-sequence-types";
import { gateByPermission } from "@/lib/auth/permission-ui";
import { recordClientAuditEvent } from "@/lib/audit/client-audit";
import { buildExcelImportAuditMetadata } from "@/lib/audit/excel-import-audit";
import { buildLocalImportValidationSummary } from "@/lib/local-import-persistence";

type ToastVariant = "info" | "success" | "warning";

export function DataUploadPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    customers,
    importedContacts,
    dataSource,
    applyUploadedCustomers,
    restoreDemoData,
    runAutomations,
    setLastValidation,
    lastValidation,
    sequenceEnrollments,
  } = useCustomerData();

  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(
    null,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<ImportFormatResult | null>(
    null,
  );
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showValidationPreview, setShowValidationPreview] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const canUpload = useCan("upload_customer_data");
  const uploadGate = gateByPermission(canUpload, "upload_customer_data");

  function showToast(message: string, variant: ToastVariant = "info") {
    setToast({ message, variant });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx") {
      showToast(
        "Please upload an Excel workbook (.xlsx). Download the Excel Import Template if needed.",
        "warning",
      );
      return;
    }

    try {
      const formatResult = await detectImportFormatFromFile(file);
      setImportFormat(formatResult);
      setFileName(file.name);
      setUploadedFile(file);
      setValidation(null);
      setLastValidation(null);
      setShowValidationPreview(false);

      if (formatResult.format === "option_a") {
        const rows = await parseUploadFile(file);
        setParsedRows(rows);
        showToast(
          `File uploaded: ${file.name} (${rows.length} rows). ${formatResult.label}.`,
          "info",
        );
      } else if (formatResult.format === "option_c") {
        setParsedRows(null);
        showToast(
          `${file.name}: ${formatResult.message}`,
          "info",
        );
      } else {
        setParsedRows(null);
        setUploadedFile(null);
        showToast(`${file.name}: ${formatResult.label}.`, "warning");
      }
    } catch {
      setImportFormat(null);
      setParsedRows(null);
      setUploadedFile(null);
      setFileName(null);
      showToast("Failed to parse file. Check the format and try again.", "warning");
    }

    e.target.value = "";
  }

  async function handleValidate() {
    if (importFormat?.format === "invalid") {
      showToast("Import format not recognized. Use the Excel Import Template.", "warning");
      return;
    }

    if (importFormat?.format === "option_c") {
      if (!uploadedFile) {
        showToast("Upload an Excel workbook first.", "warning");
        return;
      }

      try {
        const result = await validateTargetMultisheetFile(uploadedFile);
        setValidation(result);
        setLastValidation(result);
        setShowValidationPreview(true);

        if (result.passed) {
          showToast(
            `Validation passed: ${result.validRows} account(s) ready to apply.`,
            "success",
          );
        } else {
          showToast("Workbook validation failed.", "warning");
        }
        recordClientAuditEvent({
          action: "data.excel_import.validate",
          targetType: "customer_import",
          result: result.passed ? "success" : "blocked",
          metadata: buildExcelImportAuditMetadata(result),
        });
      } catch {
        showToast("Failed to validate Excel workbook.", "warning");
      }
      return;
    }

    if (!parsedRows || parsedRows.length === 0) {
      showToast("Upload a file first.", "warning");
      return;
    }

    const result = validateCustomerRows(parsedRows);
    setValidation(result);
    setLastValidation(result);
    setShowValidationPreview(true);

    if (result.passed) {
      showToast(
        `Validation passed: ${result.validRows} rows ready to apply.`,
        "success",
      );
    } else {
      showToast(
        `Validation failed: ${result.errorRows} row(s) with errors.`,
        "warning",
      );
    }
    recordClientAuditEvent({
      action: "data.upload.validate",
      targetType: "customer_import",
      result: result.passed ? "success" : "blocked",
      metadata: {
        import_format: "option_a",
        row_count: result.totalRows,
        valid_rows: result.validRows,
        error_rows: result.errorRows,
      },
    });
  }

  function handleApply() {
    if (!validation?.passed || validation.customers.length === 0) {
      showToast("Validate data successfully before applying.", "warning");
      return;
    }

    const importedContacts = validation.importedContacts ?? [];
    applyUploadedCustomers({
      customers: validation.customers,
      importedContacts,
      sourceFilename: fileName,
      validationSummary: buildLocalImportValidationSummary(validation),
    });

    const auditAction =
      importFormat?.format === "option_c"
        ? "data.excel_import.apply"
        : "data.upload.apply";
    const auditMetadata =
      importFormat?.format === "option_c"
        ? buildExcelImportAuditMetadata(validation)
        : {
            customer_count: validation.customers.length,
            import_format: importFormat?.format ?? "unknown",
          };

    recordClientAuditEvent({
      action: auditAction,
      targetType: "customer_import",
      metadata: auditMetadata,
    });

    const contactNote =
      importedContacts.length > 0
        ? ` and ${importedContacts.length} contact(s)`
        : "";
    showToast(
      `Applied ${validation.customers.length} customer(s)${contactNote}. Session data replaced — no emails sent.`,
      "success",
    );
    setValidation(null);
    setShowValidationPreview(false);
  }

  function handleRestoreDemo() {
    restoreDemoData();
    recordClientAuditEvent({
      action: "data.demo.use",
      targetType: "customer_data",
    });
    setParsedRows(null);
    setFileName(null);
    setImportFormat(null);
    setUploadedFile(null);
    setValidation(null);
    setShowValidationPreview(false);
    showToast("Demo data and local demo configuration restored.", "info");
  }

  const canValidate =
    (importFormat?.format === "option_a" && Boolean(parsedRows?.length)) ||
    (importFormat?.format === "option_c" && Boolean(uploadedFile));

  function handleRunAutomations() {
    const count = runAutomations();
    recordClientAuditEvent({
      action: "queue.refresh",
      targetType: "action_queue",
      metadata: { reviewable_count: count },
    });
    showToast(
      `Action Queue refreshed: ${count} reviewable action(s).`,
      "success",
    );
  }

  const displayValidation = validation ?? lastValidation;
  const showAppliedSummary = dataSource === "upload" && !showValidationPreview;

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Data Import</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Upload an Excel workbook to replace session data. Currently showing{" "}
              <span className="font-medium text-slate-700">
                {dataSource === "demo" ? "demo data" : "uploaded data"}
              </span>
              {fileName ? ` · Last file: ${fileName}` : ""}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={uploadGate.disabled}
            title={uploadGate.title}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Excel Workbook
          </Button>
          <Button
            variant="outline"
            disabled={uploadGate.disabled}
            title={uploadGate.title}
            onClick={handleRestoreDemo}
          >
            Use Demo Data
          </Button>
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={uploadGate.disabled || !canValidate}
            title={
              uploadGate.title ??
              (!canValidate ? "Upload a file first" : undefined)
            }
          >
            Validate Data
          </Button>
          <Button
            variant="outline"
            disabled={uploadGate.disabled}
            title={uploadGate.title}
            onClick={handleRunAutomations}
          >
            Refresh Action Queue
          </Button>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Import Template</h3>
          <p className="mt-1 text-sm text-slate-600">
            Upload one Excel workbook with a Journey Import sheet. Row 1 is for readable labels; Row 2 contains system keys used by the app; Row 3 onward contains data. One row represents one account-contact relationship. Account ID can repeat for multiple contacts, but contact email must be unique. Re-uploading replaces the current session data.
          </p>
          <div className="mt-3">
            <Button variant="outline" onClick={downloadExcelImportTemplate}>
              Download Excel Import Template
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            No emails are sent during import. Refresh Action Queue remains
            manual. Legacy multi-sheet and legacy CSV formats still work as
            fallback.
          </p>
        </div>

        <p className="text-sm text-amber-800">
          Use Demo Data resets demo customers and local demo configuration for a
          clean walkthrough — including activity triggers, email templates, email
          sequences, enrollments, and workflow logs. Review before using in a
          live demo.
        </p>

        <p className="text-sm text-slate-600">
          Refreshes trigger and sequence-derived actions from the current customer
          data. Nothing sends automatically.
        </p>

        {importFormat && fileName ? (
          <ImportFormatNotice result={importFormat} />
        ) : null}

        {toast && (
          <Toast
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        )}

        {showAppliedSummary ? (
          <ImportAppliedSummary
            accountCount={customers.length}
            contactCount={importedContacts.length}
            fileName={fileName}
            onShowValidationDetails={() => setShowValidationPreview(true)}
            hasValidationDetails={Boolean(displayValidation)}
          />
        ) : null}

        {showValidationPreview &&
          displayValidation &&
          (importFormat?.format === "option_a" ||
            importFormat?.format === "option_c") && (
          <ValidationResults
            result={displayValidation}
            importFormat={importFormat?.format}
            onApply={handleApply}
            enrollments={sequenceEnrollments ?? []}
            applyGate={uploadGate}
            onCollapse={
              dataSource === "upload"
                ? () => setShowValidationPreview(false)
                : undefined
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function ImportFormatNotice({ result }: { result: ImportFormatResult }) {
  const tone =
    result.format === "option_c"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : result.format === "option_a"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-red-200 bg-red-50 text-red-900";

  const headline =
    result.format === "option_c"
      ? result.headerMode === "flat_row2"
        ? "Detected: Flat Row 2 workbook"
        : result.headerMode === "row2"
          ? "Detected: Row 2 Excel workbook"
          : result.headerMode === "legacy_single_row"
            ? "Detected: Legacy single-row workbook"
            : "Detected: Excel workbook"
      : result.format === "option_a"
        ? "Detected: Legacy CSV layout"
        : "Workbook not recognized";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <p className="font-medium">{headline}</p>
      <p className="mt-1">{result.message}</p>
      {result.sheetNames.length > 0 ? (
        <p className="mt-2 text-xs opacity-80">
          Sheets: {result.sheetNames.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ImportAppliedSummary({
  accountCount,
  contactCount,
  fileName,
  onShowValidationDetails,
  hasValidationDetails,
}: {
  accountCount: number;
  contactCount: number;
  fileName: string | null;
  onShowValidationDetails: () => void;
  hasValidationDetails: boolean;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
      <p className="font-semibold text-emerald-900">Import applied ✓</p>
      <ul className="mt-2 space-y-1 text-sm text-emerald-950">
        <li>
          <span className="font-medium">Accounts:</span> {accountCount}
        </li>
        <li>
          <span className="font-medium">Contacts:</span> {contactCount}
        </li>
        <li>
          <span className="font-medium">Data source:</span> Uploaded import
        </li>
        <li>
          <span className="font-medium">Persistence:</span> Local browser
        </li>
        <li>
          <span className="font-medium">Emails:</span> None sent during import
        </li>
        {fileName ? (
          <li>
            <span className="font-medium">File:</span> {fileName}
          </li>
        ) : null}
      </ul>
      {hasValidationDetails ? (
        <button
          type="button"
          className="mt-3 text-sm font-medium text-emerald-800 underline hover:text-emerald-950"
          onClick={onShowValidationDetails}
        >
          View validation details
        </button>
      ) : null}
    </div>
  );
}

function ValidationResults({
  result,
  importFormat,
  onApply,
  enrollments,
  applyGate,
  onCollapse,
}: {
  result: ValidationResult;
  importFormat?: ImportFormat;
  onApply: () => void;
  enrollments: SequenceEnrollment[];
  applyGate: { disabled: boolean; title?: string };
  onCollapse?: () => void;
}) {
  const passed = result.passed;
  const isOptionC = importFormat === "option_c";

  return (
    <div
      className={`rounded-lg border p-4 ${
        passed
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3
            className={`font-semibold ${
              passed ? "text-emerald-900" : "text-red-900"
            }`}
          >
            {passed ? "Validation passed" : "Validation failed"}
          </h3>
          {!isOptionC ? (
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total rows" value={result.totalRows} />
              <Stat label="Valid rows" value={result.validRows} />
              <Stat label="Rows with errors" value={result.errorRows} />
              <Stat label="Invalid emails" value={result.invalidEmails} />
              <Stat label="Invalid dates" value={result.invalidDates} />
              <Stat label="Invalid numbers" value={result.invalidNumbers} />
            </div>
          ) : null}
        </div>
        {passed ? (
          <div className="shrink-0">
            <Button
              variant="primary"
              disabled={applyGate.disabled}
              title={applyGate.title}
              onClick={onApply}
            >
              Apply Uploaded Data
            </Button>
            <p className="mt-2 max-w-xs text-xs text-slate-600">
              Apply Uploaded Data replaces the current session customer data. It
              does not send emails and does not change SendGrid.
            </p>
            {onCollapse ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-slate-600 underline hover:text-slate-800"
                onClick={onCollapse}
              >
                Hide validation details
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isOptionC ? <MultisheetImportPreview result={result} /> : null}

      {passed && result.customers.length > 0 ? (
        <UploadedDataQualityPreview
          customers={result.customers}
          enrollments={enrollments}
        />
      ) : null}

      {!isOptionC && result.importNotes && result.importNotes.length > 0 ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-sm font-medium text-slate-800">Import notes</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {result.importNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {!isOptionC &&
      result.importWarnings &&
      result.importWarnings.length > 0 ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-950">
            Rollup warnings ({result.importWarnings.length})
          </p>
          <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-sm text-amber-900">
            {result.importWarnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                [{warning.code}] {warning.message}
                {warning.customer_id ? ` (${warning.customer_id})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.missingColumns.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-red-900">Missing columns</p>
          <p className="mt-1 text-sm text-red-800">
            {result.missingColumns.join(", ")}
          </p>
        </div>
      )}

      {result.duplicateCustomerIds.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-red-900">
            Duplicate customer IDs
          </p>
          <p className="mt-1 text-sm text-red-800">
            {result.duplicateCustomerIds.join(", ")}
          </p>
        </div>
      )}

      {result.rowErrors.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-red-900">Row errors</p>
          <div className="max-h-64 overflow-auto rounded-lg border border-red-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-800">
                    Row
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-800">
                    Field
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-800">
                    Issue
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-red-800">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {result.rowErrors.map((err, i) => (
                  <tr key={`${err.row}-${err.field}-${i}`}>
                    <td className="px-3 py-2 text-slate-700">{err.row}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">
                      {err.field}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{err.issue}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-slate-500">
                      {err.value || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
