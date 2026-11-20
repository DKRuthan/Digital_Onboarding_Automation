/**
 * Client-side UI audit ingestion helper (Phase J-6D).
 *
 * UI audit events are non-authoritative until Phase I moves mutations server-side.
 * The server stamps actor identity — do not send identity fields in the request body.
 */

import type { AuditResult } from "@/lib/audit/audit-types";

export type ClientAuditEvent = {
  action: string;
  targetType: string;
  targetId?: string;
  result?: AuditResult;
  metadata?: Record<string, unknown>;
};

/**
 * Posts a UI-origin audit event to `/api/audit-events`.
 * Non-blocking: never throws; failures are swallowed (dev console.warn only).
 */
export function recordClientAuditEvent(event: ClientAuditEvent): void {
  void postClientAuditEvent(event);
}

async function postClientAuditEvent(event: ClientAuditEvent): Promise<void> {
  try {
    const response = await fetch("/api/audit-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        result: event.result ?? "success",
        metadata: event.metadata,
      }),
    });

    if (!response.ok && process.env.NODE_ENV === "development") {
      const text = await response.text().catch(() => "");
      console.warn(
        `[audit] UI audit ingestion failed (${response.status}): ${text}`,
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[audit] UI audit ingestion error:", error);
    }
  }
}
