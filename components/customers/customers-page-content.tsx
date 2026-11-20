"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataUploadPanel } from "@/components/customers/data-upload-panel";
import { CustomerTable } from "@/components/customers/customer-table";
import { ContactsTable } from "@/components/customers/contacts-table";
import { DataQualityReviewPanel } from "@/components/customers/data-quality-review-panel";
import { useCustomerData } from "@/components/providers/customer-data-provider";
import { CustomerDataLoadingShell } from "@/components/ui/customer-data-loading-shell";

type CustomerDataTab = "accounts" | "contacts";

export function CustomersPageContent() {
  const { customers, sequenceEnrollments, isCustomerDataHydrated } =
    useCustomerData();
  const [activeTab, setActiveTab] = useState<CustomerDataTab>("accounts");

  return (
    <>
      <PageHeader
        title="Customer Data"
        description="Browse accounts and derived contacts with tags, data quality review, and filters."
      />
      <div className="p-6 lg:p-8">
        <DataUploadPanel />
        {!isCustomerDataHydrated ? (
          <div className="mt-6">
            <CustomerDataLoadingShell />
          </div>
        ) : (
          <>
        <DataQualityReviewPanel
          customers={customers}
          enrollments={sequenceEnrollments ?? []}
        />

        <div className="mb-4 flex gap-6 border-b border-slate-200">
          <button
            type="button"
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === "accounts"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("accounts")}
          >
            Accounts
          </button>
          <button
            type="button"
            className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
              activeTab === "contacts"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("contacts")}
          >
            Contacts / Emails
          </button>
        </div>

        {activeTab === "accounts" ? (
          <CustomerTable customers={customers} />
        ) : (
          <ContactsTable customers={customers} />
        )}
          </>
        )}
      </div>
    </>
  );
}
