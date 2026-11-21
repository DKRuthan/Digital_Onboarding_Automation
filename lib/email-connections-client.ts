"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { workspaceStorage } from "./browser-workspace-storage";

export interface EmailConnection {
  id: string;
  label: string;
  fromEmail: string;
}

interface ErrorBody {
  error?: string;
  message?: string;
  senders?: string[];
  signInPath?: string | null;
}

export class EmailApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly senders: string[];
  readonly signInPath: string | null;

  constructor(status: number, body: ErrorBody) {
    super(body.message || "The email service is unavailable. Try again shortly.");
    this.status = status;
    this.code = body.error || "unavailable";
    this.senders = (body.senders || []).filter((sender) => typeof sender === "string");
    const path = body.signInPath;
    this.signInPath =
      path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
        ? path
        : null;
  }
}

export async function emailRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const workspace = typeof document === "undefined" ? undefined
    : document.querySelector<HTMLMetaElement>('meta[name="journey-storage-user"]')?.content;
  if (workspace) headers.set("X-Journey-Workspace", workspace);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new EmailApiError(response.status, body || {});
  return body as T;
}

const choiceKey = "journey.selected-email-connection";

function lastChoice() {
  try {
    return workspaceStorage.getItem(choiceKey) || "";
  } catch {
    return "";
  }
}

export function useEmailConnections() {
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EmailApiError | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    return emailRequest<{ connections: EmailConnection[] }>("/api/email/connections", { signal: controller.signal })
      .then(({ connections: saved }) => {
        if (controller.signal.aborted) return;
        setConnections(saved);
        setChoice(lastChoice());
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setConnections([]);
        setError(reason instanceof EmailApiError ? reason : new EmailApiError(0, {}));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();
    return () => inflight.current?.abort();
  }, [load]);

  async function reload() {
    setLoading(true);
    await load();
  }

  function select(id: string) {
    // Only the selected record ID is saved on this device. The server owns credentials.
    try {
      workspaceStorage.setItem(choiceKey, id);
    } catch {
      // Selection still works with browser storage disabled.
    }
    setChoice(id);
  }

  const selected = connections.find((entry) => entry.id === choice) || connections[0] || null;
  return { connections, selected, select, loading, error, reload };
}

/** Reuses the send ID after a network interruption while this review is open. */
export function useSenderTest() {
  const attempt = useRef<{ message: string; id: string } | null>(null);
  return async (connection: EmailConnection, subject: string, text: string) => {
    const message = JSON.stringify([connection.id, subject, text]);
    if (attempt.current?.message !== message) {
      attempt.current = { message, id: crypto.randomUUID() };
    }
    await emailRequest("/api/email/send", { method: "POST", body: JSON.stringify({
      connectionId: connection.id, requestId: attempt.current.id, test: true,
      to: connection.fromEmail, subject, text,
    }) });
    attempt.current = null;
  };
}
