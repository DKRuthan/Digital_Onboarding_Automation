"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ActionQueueTable } from "@/components/action-queue/action-queue-table";
import { useCustomerData } from "@/components/providers/customer-data-provider";

export function ActionQueuePageContent() {
  const { actionQueue } = useCustomerData();

  return (
    <>
      <PageHeader
        title="Action Queue"
        description={`${actionQueue.length} reviewable actions in the review workbench (activity triggers + active sequence enrollments). Review and approve before any send.`}
      />
      <div className="p-6 lg:p-8">
        <ActionQueueTable items={actionQueue} />
      </div>
    </>
  );
}
