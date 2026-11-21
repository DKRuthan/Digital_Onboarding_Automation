"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmailApiError, emailRequest, useEmailConnections, useSenderTest, type EmailConnection } from "@/lib/email-connections-client";

const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-indigo-500";
const link = "font-medium text-indigo-700 hover:underline";
const panel = "space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6";

function explain(reason: unknown) {
  return reason instanceof EmailApiError ? reason.message : "Could not reach the email service. Check your connection and try again.";
}

export function EmailSettings() {
  const { connections, selected, select, loading, error, reload } = useEmailConnections();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [removeId, setRemoveId] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const operation = useRef(false);
  const sendTestToSender = useSenderTest();

  async function perform(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    setFailure("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setFailure(explain(reason));
      if (reason instanceof EmailApiError && (reason.status === 401 || reason.code === "workspace_changed")) await reload();
    } finally {
      operation.current = false;
      setPending(false);
    }
  }

  async function sendTest(connection: EmailConnection) {
    await perform(async () => {
      await sendTestToSender(connection, "Journey Control Center connection test",
        "You requested this test from Email Settings in Journey Control Center.");
      setNotice(`SendGrid accepted the test email to ${connection.fromEmail}.`);
    });
  }

  async function remove(connection: EmailConnection) {
    await perform(async () => {
      await emailRequest(`/api/email/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" });
      setRemoveId("");
      setNotice(`Removed ${connection.label}.`);
      await reload();
    });
  }

  return (
    <>
      <PageHeader title="Email Settings" description="Connect your Twilio SendGrid account to send approved onboarding emails." />
      <div className="max-w-3xl space-y-5 p-6 lg:p-8">
        {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {failure && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
        {loading ? <p role="status" className="text-sm text-slate-600">Loading email connections…</p> :
          error ? <section className={panel}>
            {error.status === 401 ? <>
              <h2 className="text-lg font-semibold">Sign in to connect your email account</h2>
              <p className="text-sm text-slate-600">{error.message}</p>
              {error.signInPath && <a href={error.signInPath} target="_top" className={link}>Sign in</a>}
            </> : <>
              <p role="alert" className="text-sm text-red-800">{error.message}</p>
              {error.code === "workspace_changed"
                ? <Button onClick={() => window.location.reload()}>Reload page</Button>
                : <Button onClick={() => void reload()}>Try again</Button>}
            </>}
          </section> : <>
            {selected && <section className={panel}>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">SendGrid connections</h2>
                <p className="mt-1 text-sm text-slate-600">Choose the sender to use when reviewing a customer email.</p>
              </div>
              <label className="block text-sm font-medium text-slate-700">Active connection
                <select className={field} value={selected.id} disabled={pending} onChange={(event) => {
                  select(event.target.value); setRemoveId(""); setNotice(""); setFailure("");
                }}>
                  {connections.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.fromEmail}</option>)}
                </select>
              </label>
              <p className="break-words text-sm text-slate-600">Test recipient: <strong>{selected.fromEmail}</strong></p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending} onClick={() => void sendTest(selected)}>Send test to this address</Button>
                <Button disabled={pending} onClick={() => {setAdding(true); setRemoveId("");}}>Add another key</Button>
                <Button variant="ghost" disabled={pending} onClick={() => setRemoveId(selected.id)}>Remove connection</Button>
              </div>
              {removeId === selected.id && <div className="space-y-3 rounded-lg bg-slate-50 p-3 text-sm">
                <p>Remove the saved key for <strong>{selected.label}</strong> from this app? You can revoke the key itself in SendGrid.</p>
                <div className="flex gap-2">
                  <Button variant="danger" disabled={pending} onClick={() => void remove(selected)}>Remove saved key</Button>
                  <Button variant="ghost" disabled={pending} onClick={() => setRemoveId("")}>Cancel</Button>
                </div>
              </div>}
              <Link href="/action-queue/" className={link}>Review the action queue</Link>
            </section>}
            {(!selected || adding) && <AddConnection
              canCancel={Boolean(selected)} onCancel={() => setAdding(false)}
              onExpired={() => void reload()}
              onAdded={async (connection) => {
                select(connection.id); setAdding(false); setFailure("");
                setNotice(`Connected ${connection.label} as ${connection.fromEmail}.`);
                await reload(); select(connection.id);
              }}
            />}
          </>}
      </div>
    </>
  );
}

function AddConnection({ canCancel, onCancel, onAdded, onExpired }: {
  canCancel: boolean; onCancel: () => void;
  onAdded: (connection: EmailConnection) => Promise<void>; onExpired: () => void;
}) {
  const [senders, setSenders] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const keyInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    submitting.current = true;
    setSaving(true); setError("");
    try {
      const data = await emailRequest<{ connection: EmailConnection }>("/api/email/connections", {
        method: "POST", body: JSON.stringify({
          label: String(fields.get("label") || "").trim() || "My SendGrid",
          key: String(fields.get("sendgrid-key") || "").trim(),
          fromEmail: String(fields.get("fromEmail") || "").trim() || undefined,
        }),
      });
      form.reset();
      await onAdded(data.connection);
    } catch (reason) {
      if (reason instanceof EmailApiError && reason.code === "sender_required") {
        setSenders(reason.senders);
      } else {
        if (keyInput.current) keyInput.current.value = "";
        setError(explain(reason));
      }
      if (reason instanceof EmailApiError && (reason.status === 401 || reason.code === "workspace_changed")) onExpired();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className={panel}>
    <div>
      <h2 className="text-lg font-semibold text-slate-900">Add a SendGrid API key</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        In your <a href="https://app.sendgrid.com/" target="_blank" rel="noreferrer" className={link}>Twilio SendGrid account</a>,{" "}
        <a href="https://app.sendgrid.com/settings/sender_auth" target="_blank" rel="noreferrer" className={link}>verify a sender</a> and{" "}
        <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noreferrer" className={link}>create a key</a> with Mail Send access.
      </p>
    </div>
    <label className="block text-sm font-medium text-slate-700">API key
      <input name="sendgrid-key" ref={keyInput} className={field} type="password" placeholder="SG.…" autoComplete="off"
        autoCapitalize="none" spellCheck={false} required disabled={saving}
        onChange={() => { if (senders) setSenders(null); setError(""); }} />
    </label>
    <label className="block text-sm font-medium text-slate-700">Connection name <span className="font-normal text-slate-500">(optional)</span>
      <input name="label" className={field} placeholder="My SendGrid" maxLength={64} disabled={saving} />
    </label>
    {senders && <label className="block text-sm font-medium text-slate-700">Verified sender address
      {senders.length ? <select name="fromEmail" className={field} defaultValue="" required disabled={saving}>
        <option value="" disabled>Choose a verified sender</option>
        {senders.map((sender) => <option key={sender} value={sender}>{sender}</option>)}
      </select> : <input type="email" name="fromEmail" className={field} placeholder="Your verified sender email" required disabled={saving} />}
      <span className="mt-1 block text-sm font-normal text-slate-600">Use an address verified in SendGrid or an address on your authenticated domain.</span>
    </label>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" variant="primary" disabled={saving}>{saving ? "Connecting…" : "Connect SendGrid"}</Button>
      {canCancel && <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>}
    </div>
  </form>;
}
