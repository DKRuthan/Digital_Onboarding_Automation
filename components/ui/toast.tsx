"use client";

import { cn } from "@/lib/utils";

type ToastVariant = "info" | "success" | "warning";

const variants: Record<ToastVariant, string> = {
  info: "border-indigo-200 bg-indigo-50 text-indigo-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
}

export function Toast({ message, variant = "info", onDismiss }: ToastProps) {
  if (!message) return null;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        variants[variant],
      )}
      role="status"
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
