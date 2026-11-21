import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-indigo-100 text-indigo-800",
  muted: "bg-slate-50 text-slate-500",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function inviteStatusVariant(
  status: string,
): BadgeVariant {
  switch (status) {
    case "Accepted":
      return "success";
    case "Pending":
      return "warning";
    case "Expired":
      return "danger";
    default:
      return "default";
  }
}

export function automationStatusVariant(
  status: string,
): BadgeVariant {
  switch (status) {
    case "Ready":
      return "info";
    case "Pending Review":
      return "warning";
    case "Sent":
      return "success";
    case "Skipped":
      return "muted";
    default:
      return "default";
  }
}

export function workflowStatusVariant(
  status: string,
): BadgeVariant {
  switch (status) {
    case "Needs Review":
      return "warning";
    case "Previewed":
      return "info";
    case "Test Sent":
      return "info";
    case "Approved":
      return "success";
    case "Skipped":
      return "muted";
    case "Blocked":
      return "danger";
    case "Dry Run Complete":
      return "warning";
    case "Accepted by SendGrid":
    case "Live Internal Alert Sent":
      return "success";
    default:
      return "default";
  }
}

export function logStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "Delivered":
      return "success";
    case "Failed":
    case "Bounced":
    case "Internal Send Failed":
      return "danger";
    case "Queued":
      return "warning";
    case "Test Sent":
      return "info";
    case "Previewed":
      return "info";
    case "Approved":
      return "success";
    case "Skipped":
      return "muted";
    case "Dry Run Complete":
      return "warning";
    case "Accepted by SendGrid":
    case "Live Internal Alert Sent":
      return "success";
    case "Simulated Sent":
      return "warning";
    default:
      return "default";
  }
}

export function sendLogModeVariant(
  mode: string,
): BadgeVariant {
  switch (mode) {
    case "demo":
      return "muted";
    case "test":
      return "info";
    case "dry_run":
      return "warning";
    case "live":
      return "success";
    case "logged_only":
      return "warning";
    default:
      return "default";
  }
}

export function sendLogModeLabel(mode: string): string {
  switch (mode) {
    case "demo":
      return "Demo";
    case "test":
      return "Test";
    case "dry_run":
      return "Dry Run";
    case "live":
      return "Live";
    case "logged_only":
      return "Logged Only";
    default:
      return "—";
  }
}

export function scheduleStatusVariant(
  status: string,
): BadgeVariant {
  switch (status) {
    case "due_now":
      return "success";
    case "scheduled":
      return "info";
    case "not_due":
      return "muted";
    default:
      return "default";
  }
}
