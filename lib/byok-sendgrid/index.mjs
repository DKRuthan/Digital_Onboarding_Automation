import { d1Store } from "./d1-store.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apiKey = /^SG\.[A-Za-z0-9_-]{16,64}\.[A-Za-z0-9_-]{32,128}$/;
const control = /[\u0000-\u001f\u007f]/u;
const address = /^[a-z\d!#$%&'*+/=?^_`{|}~.-]+@(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i;
const reservedDomain = /(?:^|\.)(?:example\.(?:com|net|org)|example|localhost|test|invalid)$/i;
const hour = 3600000;
const bodyLimit = 65536;

function reply(body, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie, Authorization",
  } });
}

class MailError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.response = reply({ error: code, message, ...extra }, status);
  }
}
function fail(status, code, message, extra) {
  throw new MailError(status, code, message, extra);
}
function unavailable() {
  fail(503, "email_unavailable", "The email service is temporarily unavailable.");
}
function uncertain() {
  fail(503, "delivery_unknown", "Delivery could not be confirmed. Check SendGrid Email Activity before attempting another send.");
}

function validMailbox(email) {
  if (typeof email !== "string" || email.length > 254 || !address.test(email)) return false;
  const [local, domain] = email.split("@");
  return local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") &&
    !local.includes("..") && !reservedDomain.test(domain);
}

async function readInput(request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    fail(415, "json_required", "Use a JSON request body.");
  }
  const tooLarge = () => fail(413, "too_large", "This email request is too large.");
  if (Number(request.headers.get("Content-Length")) > bodyLimit) tooLarge();
  const reader = request.body?.getReader();
  if (!reader) fail(400, "invalid_body", "Enter the required fields.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > bodyLimit) {
        await reader.cancel();
        tooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let input;
  try { input = JSON.parse(decoder.decode(bytes)); } catch { /* handled below */ }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail(400, "invalid_body", "The request must contain a JSON object.");
  }
  return input;
}

const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function vault(raw) {
  if (!raw || typeof raw !== "string") unavailable();
  try {
    const key = fromBase64(raw);
    if (key.length === 32) return await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { /* unavailable */ }
  unavailable();
}

function gcm(owner, id, iv) {
  return { name: "AES-GCM", iv, additionalData: encoder.encode(JSON.stringify(["sendgrid:v1", owner, id])) };
}

async function seal(value, owner, id, vaultKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(gcm(owner, id, iv), vaultKey, encoder.encode(value));
  return [toBase64(iv), toBase64(sealed)].join(".");
}
async function unseal(row, owner, vaultKey) {
  const [iv, ciphertext] = row.encryptedKey.split(".").map(fromBase64);
  return decoder.decode(await crypto.subtle.decrypt(gcm(owner, row.id, iv), vaultKey, ciphertext));
}

// Only fixed SendGrid endpoints are used. Authorization must never be forwarded to a redirect target.
function provider(fetcher, path, key, body) {
  return fetcher("https://api.sendgrid.com/v3/" + path, {
    method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "Authorization": "Bearer " + key, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function budget(store, owner, kind, interval, limit) {
  const allowed = await store.consumeBudget(owner, kind, Math.floor(Date.now() / interval), limit);
  if (!allowed) fail(429, "rate_limited", "The request limit has been reached. Try again later.");
}

async function createConnection(input, owner, store, vaultKey, fetcher) {
  const { key, label = "Twilio SendGrid", fromEmail } = input;
  if (typeof key !== "string" || !apiKey.test(key)) fail(400, "invalid_key", "Enter a SendGrid API key beginning with SG.");
  if (typeof label !== "string" || !label.trim() || label.length > 80 || control.test(label)) {
    fail(400, "invalid_label", "Enter a connection name of 1–80 characters.");
  }
  if (fromEmail && !validMailbox(fromEmail)) fail(422, "invalid_sender", "Enter a verified sender email address.");
  await budget(store, owner, "connect_hour", hour, 12);
  const access = await provider(fetcher, "scopes", key);
  if (access.status === 401 || access.status === 403) fail(422, "key_rejected", "SendGrid did not accept this key. Check its value and permissions.");
  if (!access.ok) unavailable();
  const { scopes } = await access.json();
  if (!Array.isArray(scopes) || !scopes.includes("mail.send")) {
    fail(422, "mail_send_required", "Enable the Mail Send permission for this SendGrid API key.");
  }
  let sender = fromEmail;
  if (!sender) {
    const identities = await provider(fetcher, "verified_senders", key);
    let senders = [];
    if (identities.ok) {
      const { results = [] } = await identities.json();
      senders = [...new Set(results.filter(s => s.verified === true && !s.locked && validMailbox(s.from_email)).map(s => s.from_email))];
    } else if (identities.status !== 403 && identities.status !== 401) {
      unavailable();
    }
    if (senders.length !== 1) {
      fail(422, "sender_required", "Choose or enter a sender address verified in your SendGrid account.", { senders });
    }
    sender = senders[0];
  }
  // Domain-authenticated addresses are not all enumerated by the sender-identity endpoint.
  // SendGrid enforces the From identity when a message is submitted.
  const connection = { id: crypto.randomUUID(), label: label.trim(), fromEmail: sender };
  const encryptedKey = await seal(key, owner, connection.id, vaultKey);
  if (!await store.addConnection(owner, { ...connection, encryptedKey })) {
    fail(409, "connection_conflict", "Use a different connection name, or remove an unused connection if you already have ten.");
  }
  return reply({ connection }, 201);
}

function replay(row, digest) {
  if (!row) unavailable();
  if (row.digest !== digest) fail(409, "request_conflict", "This send ID already belongs to a different message.");
  if (row.status === "accepted") return reply({ status: "accepted" }, 202);
  if (row.status === "sending" && Date.now() - row.createdAt < 60000) {
    fail(409, "sending", "This message is being submitted. Check its status before trying again.");
  }
  if (row.status === "rejected") fail(422, "provider_rejected", "SendGrid declined this send. Check the API key, verified sender and recipient.");
  uncertain();
}

async function sendMessage(input, owner, store, vaultKey, fetcher) {
  const { requestId, connectionId, to, subject, text } = input;
  if (typeof requestId !== "string" || !uuid.test(requestId) ||
      typeof connectionId !== "string" || !uuid.test(connectionId)) {
    fail(400, "invalid_id", "Choose a connection and a valid send ID.");
  }
  if (!validMailbox(to)) fail(422, "invalid_recipient", "Choose one real recipient address. Demo addresses cannot receive mail.");
  if (typeof subject !== "string" || !subject.trim() || subject.length > 255 || control.test(subject) ||
      typeof text !== "string" || !text.trim() || text.length > 50000) {
    fail(400, "invalid_message", "Enter a subject (up to 255 characters) and a message (up to 50,000 characters).");
  }
  const test = input.test === true;
  const digest = toBase64(await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([connectionId, to, subject, text, test]))));
  const previous = await store.getDelivery(owner, requestId);
  if (previous && previous.status !== "rejected") return replay(previous, digest);

  const connection = await store.getConnection(owner, connectionId);
  if (!connection) fail(404, "connection_not_found", "This email connection is unavailable.");
  if (test && to.toLowerCase() !== connection.fromEmail.toLowerCase()) {
    fail(422, "invalid_test_recipient", "A test message can only be sent to the connection’s sender address.");
  }
  const key = await unseal(connection, owner, vaultKey);
  await budget(store, owner, "send_hour", hour, 20);
  await budget(store, owner, "send_day", 24 * hour, 100);
  // The timestamp doubles as an attempt version, even for retries in the same millisecond.
  // Only a definite rejection can be reopened. A concurrent request cannot supersede it twice.
  const startedAt = Math.max(Date.now(), (previous?.createdAt ?? 0) + 1);
  const reserved = previous
    ? await store.retryRejectedDelivery(owner, requestId, previous.createdAt, digest, startedAt)
    : await store.reserveDelivery(owner, requestId, digest, startedAt);
  if (!reserved) {
    return replay(await store.getDelivery(owner, requestId), digest);
  }

  let status = "unknown";
  let providerStatus;
  try {
    const result = await provider(fetcher, "mail/send", key, {
      from: { email: connection.fromEmail }, personalizations: [{ to: [{ email: to }] }],
      subject, content: [{ type: "text/plain", value: text }],
    });
    providerStatus = result.status;
    if (result.status === 202) status = "accepted";
    else if (result.status >= 400 && result.status < 500 && result.status !== 408) status = "rejected";
  } catch { /* A timed-out request may already have been accepted. */ }
  try { await store.recordDelivery(owner, requestId, status, startedAt); } catch { uncertain(); }
  if (status === "rejected") {
    if (providerStatus === 429) {
      fail(429, "provider_rate_limited", "SendGrid declined this attempt because its rate limit was reached. Wait, then confirm the send again.");
    }
    if (providerStatus === 401 || providerStatus === 403) {
      fail(422, "provider_rejected", "SendGrid rejected the key, its Mail Send permission or its sender identity. Select a working connection and confirm again.");
    }
    fail(422, "provider_rejected", "SendGrid declined the message. Check the sender, recipient and content before confirming again.");
  }
  return replay({ digest, status }, digest);
}

export async function handleEmailApi(request, { userId, db, store, vaultKey, signInPath = "/sign-in" }, fetcher = fetch) {
  try {
    if (!userId || typeof userId !== "string") fail(401, "sign_in_required", "Sign in to use your own email connections.", { signInPath });
    const url = new URL(request.url);
    if (request.method !== "GET" && request.headers.get("Origin") !== url.origin) {
      fail(403, "origin_rejected", "Use the email controls in this app.");
    }
    if (!store && !db) unavailable();
    const key = await vault(vaultKey);
    const repo = store ?? d1Store(db);
    const path = url.pathname.replace(/\/$/, "");
    if (path === "/api/email/connections") {
      if (request.method === "GET") return reply({ connections: await repo.listConnections(userId) });
      if (request.method === "POST") return await createConnection(await readInput(request), userId, repo, key, fetcher);
    }
    if (path === "/api/email/send" && request.method === "POST") {
      return await sendMessage(await readInput(request), userId, repo, key, fetcher);
    }
    const id = path.slice("/api/email/connections/".length);
    if (path.startsWith("/api/email/connections/") && uuid.test(id) && request.method === "DELETE") {
      if (!await repo.deleteConnection(userId, id)) fail(404, "connection_not_found", "This email connection is unavailable.");
      return reply({ deleted: true });
    }
    fail(404, "not_found", "Unknown email route or method.");
  } catch (err) {
    if (err instanceof MailError) return err.response;
    return reply({ error: "email_unavailable", message: "The email service is temporarily unavailable." }, 503);
  }
}
