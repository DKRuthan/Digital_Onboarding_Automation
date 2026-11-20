import type { Customer } from "./types";

export interface CustomerRisk {
  id: string;
  label: string;
  severity: "high" | "medium";
}

export function getCustomerRisks(customer: Customer): CustomerRisk[] {
  const risks: CustomerRisk[] = [];

  if (customer.invite_status === "Pending") {
    risks.push({ id: "pending-invite", label: "Pending invite", severity: "medium" });
  }

  if (customer.usage_sessions === 0 && customer.days_since_start >= 7) {
    risks.push({ id: "no-usage", label: "No usage", severity: "high" });
  } else if (customer.usage_threshold_percent < 30) {
    risks.push({
      id: "low-usage",
      label: `Low usage (${customer.usage_threshold_percent}%)`,
      severity: "high",
    });
  }

  if (customer.seat_assignment_percent < 50) {
    risks.push({
      id: "low-seats",
      label: `Low seat assignment (${customer.seat_assignment_percent}%)`,
      severity: "medium",
    });
  }

  if (
    customer.days_to_renewal <= 90 &&
    customer.usage_threshold_percent < 50
  ) {
    risks.push({
      id: "renewal-risk",
      label: `Renewal risk (${customer.days_to_renewal} days left)`,
      severity: "high",
    });
  }

  return risks;
}
