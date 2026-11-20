"use client";

import { useEffect, useState } from "react";
import { fetchInternalSendConfig } from "@/lib/internal-send-config-client";
import { useHydrated } from "@/lib/use-hydrated";
import { DemoPersistenceCallout } from "./demo-persistence-callout";

export function DemoBanner({
  authStatusNote,
}: {
  authStatusNote?: React.ReactNode;
}) {
  const mounted = useHydrated();
  const [internalSendMode, setInternalSendMode] = useState<string | null>(null);

  useEffect(() => {
    if (!mounted) return;
    fetchInternalSendConfig()
      .then((config) =>
        setInternalSendMode(config.sendMode === "live" ? "live" : "dry_run"),
      )
      .catch(() => setInternalSendMode("dry_run"));
  }, [mounted]);

  return (
    <div
      role="status"
      className="border-b border-slate-200 bg-slate-100 px-4 py-2.5 text-center text-sm text-slate-600 lg:px-8"
    >
      <p>
        Controlled local prototype — not production. No customer emails are
        sent. Send APIs are gated by default. Applied Journey Import data
        persists in this browser; workflow progress and communication logs are
        session-only.
      </p>
      <DemoPersistenceCallout compact />
      {authStatusNote ? <div className="mt-1.5">{authStatusNote}</div> : null}
      <p className="mt-1.5 text-xs font-medium text-slate-700 lg:hidden">
        Send safety: Customer sends disabled · Internal send mode:{" "}
        {mounted ? (internalSendMode ?? "dry_run") : "…"}
      </p>
    </div>
  );
}
