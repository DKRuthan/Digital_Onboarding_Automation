"use client";

import { useEffect, useState } from "react";
import {
  emptyPublicSendGridConfig,
  fetchInternalSendConfig,
  type PublicSendGridConfig,
} from "@/lib/internal-send-config-client";

/** Stable skeleton — same DOM shape as the loaded panel for hydration safety. */
export function SendGridConfigPlaceholder() {
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-3 text-xs">
      <p className="font-medium text-slate-300">SendGrid: …</p>
      <ul className="mt-2 space-y-1 text-slate-500">
        <li>
          Internal send mode:{" "}
          <span className="text-slate-300">…</span>
        </li>
        <li className="text-slate-400">
          Internal send API: …
        </li>
        <li className="text-slate-400">Customer sends: disabled</li>
      </ul>
      <p className="mt-2 text-slate-500">
        Configured ≠ enabled. Customer sends remain disabled.
      </p>
    </div>
  );
}

export function SendGridConfigPanel() {
  const [config, setConfig] = useState<PublicSendGridConfig | null>(null);

  useEffect(() => {
    fetchInternalSendConfig()
      .then(setConfig)
      .catch(() =>
        setConfig(
          emptyPublicSendGridConfig(["Unable to load SendGrid configuration"]),
        ),
      );
  }, []);

  if (!config) {
    return <SendGridConfigPlaceholder />;
  }

  return (
    <div className="rounded-lg bg-slate-900 px-3 py-3 text-xs">
      <p className="font-medium text-slate-300">
        SendGrid: {config.configured ? "configured" : "missing config"}
      </p>
      {config.configured ? (
        <p className="mt-1 text-slate-500">
          Configured ≠ enabled. Customer sends remain disabled.
        </p>
      ) : null}
      <ul className="mt-2 space-y-1 text-slate-500">
        <li>
          Internal send mode:{" "}
          <span className="text-slate-300">
            {config.sendMode === "live" ? "live" : "dry_run"}
          </span>
        </li>
        <li className="text-slate-400">
          Internal send API:{" "}
          {config.internalSendsEnabled ? "enabled" : "disabled (env gate)"}
        </li>
        <li className="text-slate-400">
          Test send API:{" "}
          {config.testSendEnabled ? "enabled" : "disabled (env gate)"}
        </li>
        <li className="text-slate-400">Customer sends: disabled</li>
      </ul>
      {!config.configured && config.validationErrors.length > 0 && (
        <p className="mt-2 text-amber-400/90">
          {config.validationErrors[0]}
        </p>
      )}
    </div>
  );
}
