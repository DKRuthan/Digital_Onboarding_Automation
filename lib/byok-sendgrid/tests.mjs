import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleEmailApi } from "./index.mjs";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const origin = "https://onboarding.test";
const fromEmail = "team@onboarding-mail.test-suite.net";
const to = "recipient@customer-mail.test-suite.net";

function fixture(t, { senders = [fromEmail], scopes = ["mail.send"], discoveryStatus = 200 } = {}) {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  sql.exec(schema);
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      const bound = (...args) => ({
        bind: bound,
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
      });
      return bound();
    },
  };
  const key = ["SG", randomBytes(16).toString("base64url"), randomBytes(32).toString("base64url")].join(".");
  const vaultKey = randomBytes(32).toString("base64");
  const calls = [];
  const state = { send: async () => new Response(null, { status: 202 }) };
  async function fetcher(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api.sendgrid.com");
    assert.equal(request.headers.get("Authorization"), "Bearer " + key);
    calls.push({ path: url.pathname, body: request.body ? await request.json() : null });
    if (url.pathname === "/v3/scopes") return Response.json({ scopes });
    if (url.pathname === "/v3/verified_senders") {
      if (discoveryStatus !== 200) return new Response(null, { status: discoveryStatus });
      const results = senders.map((from_email, i) => ({ id: i + 1, from_email, verified: true }));
      return Response.json({ results });
    }
    if (url.pathname === "/v3/mail/send") return state.send();
    throw new Error("Unexpected mock provider endpoint");
  }
  async function call(method, route, body, { userId = "visitor-1", source = origin, secret = vaultKey } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (source !== null) headers.Origin = source;
    const req = new Request(origin + "/api/email/" + route, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handleEmailApi(req, { db, userId, vaultKey: secret }, fetcher);
    return { status: res.status, body: await res.json() };
  }
  function add(extra = {}) {
    return call("POST", "connections", { key, label: "Onboarding", ...extra });
  }
  async function create() {
    const res = await add();
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.connection.id;
  }
  function message(id, extra = {}) {
    return { connectionId: id, requestId: randomUUID(), to, subject: "Welcome", text: "Your access is ready.", ...extra };
  }
  const deliveries = () => calls.filter(({ path }) => path === "/v3/mail/send");
  return { key, sql, calls, call, add, create, message, deliveries, state };
}

test("saving discovers a verified sender; listing only returns connection metadata", async t => {
  const f = fixture(t);
  const id = await f.create();
  const res = await f.call("GET", "connections");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.connections, [{ id, label: "Onboarding", fromEmail }]);
  assert.equal(f.deliveries().length, 0);
  for (const { name } of f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    const rows = f.sql.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all();
    assert.ok(!JSON.stringify(rows).includes(f.key), "database must not retain the raw key");
  }
});

test("restricted sender discovery asks for a verified From address and accepts the supplied address", async t => {
  const f = fixture(t, { discoveryStatus: 403 });
  const res = await f.add();
  assert.equal(res.status, 422);
  assert.equal(res.body.error, "sender_required");
  assert.equal((await f.call("GET", "connections")).body.connections.length, 0);
  assert.equal((await f.add({ fromEmail })).status, 201);
});

test("several verified senders are offered for selection; missing Mail Send is rejected", async t => {
  const choices = [fromEmail, "second@onboarding-mail.test-suite.net"];
  const f = fixture(t, { senders: choices });
  const res = await f.add();
  assert.equal(res.body.error, "sender_required");
  assert.deepEqual(res.body.senders.toSorted(), choices.toSorted());
  const restricted = fixture(t, { scopes: ["stats.read"] });
  assert.ok((await restricted.add()).status >= 400);
  assert.equal((await restricted.call("GET", "connections")).body.connections.length, 0);
});

test("anonymous callers and foreign origins cannot change connections or send email", async t => {
  const f = fixture(t);
  const body = { key: f.key, label: "test" };
  assert.equal((await f.call("GET", "connections", undefined, { userId: null })).status, 401);
  assert.ok((await f.call("POST", "connections", body, { source: "https://other.test" })).status >= 400);
  assert.ok((await f.call("POST", "connections", body, { source: null })).status >= 400);
  assert.equal(f.calls.length, 0);
});

test("connection ownership covers list, send and delete", async t => {
  const f = fixture(t);
  const id = await f.create();
  const stranger = { userId: "visitor-2" };
  assert.deepEqual((await f.call("GET", "connections", undefined, stranger)).body.connections, []);
  assert.ok((await f.call("POST", "send", f.message(id), stranger)).status >= 400);
  assert.ok((await f.call("DELETE", "connections/" + id, undefined, stranger)).status >= 400);
  assert.equal(f.deliveries().length, 0);
  assert.equal((await f.call("GET", "connections")).body.connections.length, 1);
  assert.equal((await f.call("DELETE", "connections/" + id)).status, 200);
  assert.deepEqual((await f.call("GET", "connections")).body.connections, []);
});

test("approved email dispatch is idempotent; reusing its ID for different content fails", async t => {
  const f = fixture(t);
  const msg = f.message(await f.create());
  const res = await f.call("POST", "send", msg);
  assert.equal(res.status, 202, JSON.stringify(res.body));
  assert.equal(res.body.status, "accepted");
  assert.equal((await f.call("POST", "send", msg)).body.status, "accepted");
  assert.equal((await f.call("POST", "send", { ...msg, text: "Revised" })).status, 409);
  const sent = f.deliveries();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.from.email, fromEmail);
  assert.equal(sent[0].body.personalizations[0].to[0].email, to);
  assert.deepEqual(sent[0].body.content, [{ type: "text/plain", value: msg.text }]);
});

test("ambiguous network failures cannot dispatch the same message twice", async t => {
  const f = fixture(t);
  f.state.send = async () => { throw new Error("mock network failure"); };
  const msg = f.message(await f.create());
  const first = await f.call("POST", "send", msg);
  assert.equal(first.status, 503);
  assert.equal(first.body.error, "delivery_unknown");
  const again = await f.call("POST", "send", msg);
  assert.equal(again.body.error, "delivery_unknown");
  assert.equal(f.deliveries().length, 1);
});

test("invalid and example recipients and malformed parameters never trigger provider delivery", async t => {
  const f = fixture(t);
  const id = await f.create();
  for (const recipient of ["one@example.com", "team@customer-001.example.com", "one@somewhere.test", "not-an-address", "one@domain.net\r\nBcc: injected@domain.net"]) {
    assert.ok((await f.call("POST", "send", f.message(id, { to: recipient }))).status >= 400);
  }
  for (const bad of [{ requestId: "" }, { subject: "" }, { text: "" }]) {
    assert.ok((await f.call("POST", "send", f.message(id, bad))).status >= 400);
  }
  assert.equal(f.deliveries().length, 0);
});

test("a user's hourly send budget limits fresh requests", async t => {
  const f = fixture(t);
  const id = await f.create();
  for (let i = 0; i < 20; i++) assert.equal((await f.call("POST", "send", f.message(id))).status, 202);
  assert.equal((await f.call("POST", "send", f.message(id))).status, 429);
  assert.equal(f.deliveries().length, 20);
});

test("concurrent requests reserve a message before contacting SendGrid", async t => {
  const f = fixture(t);
  const msg = f.message(await f.create());
  let signalStarted;
  let finishDelivery;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const waiting = new Promise(resolve => { finishDelivery = resolve; });
  f.state.send = async () => {
    signalStarted();
    await waiting;
    return new Response(null, { status: 202 });
  };
  const first = f.call("POST", "send", msg);
  await Promise.race([started, first.then(result => { throw new Error("Send never reached provider: " + result.status); })]);
  try {
    const other = await f.call("POST", "send", msg);
    assert.equal(other.status, 409);
    assert.equal(other.body.error, "sending");
  } finally {
    finishDelivery();
  }
  assert.equal((await first).status, 202);
  assert.equal(f.deliveries().length, 1);
});

test("SendGrid's 5xx outcome is not falsely reported as sent; retry is suppressed", async t => {
  const f = fixture(t);
  f.state.send = async () => Response.json({ errors: [{ message: "provider detail" }] }, { status: 503 });
  const msg = f.message(await f.create());
  assert.equal((await f.call("POST", "send", msg)).body.error, "delivery_unknown");
  assert.equal((await f.call("POST", "send", msg)).body.error, "delivery_unknown");
  assert.equal(f.deliveries().length, 1);
});

test("keys encrypted under a different vault key cannot be used to send", async t => {
  const f = fixture(t);
  const id = await f.create();
  const differentKey = randomBytes(32).toString("base64");
  const res = await f.call("POST", "send", f.message(id), { secret: differentKey });
  assert.ok(res.status >= 400);
  assert.equal(f.deliveries().length, 0);
  assert.ok(!JSON.stringify(res.body).includes(f.key));
});

test("connection limits and duplicate names leave existing connections intact", async t => {
  const f = fixture(t);
  assert.equal((await f.add()).status, 201);
  assert.ok((await f.add({ label: "ONBOARDING" })).status >= 400);
  for (let i = 1; i < 10; i++) assert.equal((await f.add({ label: "Workspace " + i })).status, 201);
  assert.ok((await f.add({ label: "Extra" })).status >= 400);
  const { body } = await f.call("GET", "connections");
  assert.equal(body.connections.length, 10);
  assert.ok(!JSON.stringify(body).includes(f.key));
});

test("a visitor's budget for new key validations caps outbound provider calls", async t => {
  const f = fixture(t, { scopes: ["stats.read"] });
  for (let i = 0; i < 12; i++) assert.ok((await f.add()).status >= 400);
  const before = f.calls.length;
  assert.equal((await f.add()).status, 429);
  assert.equal(f.calls.length, before);
});

for (const status of [400, 401, 403, 429]) {
  test(`after SendGrid returns ${status}, an explicit corrected send using the original request ID can succeed`, async t => {
    const f = fixture(t);
    const original = f.message(await f.create());
    f.state.send = async () => new Response(null, { status });
    const rejected = await f.call("POST", "send", original);
    assert.equal(rejected.body.error, status === 429 ? "provider_rate_limited" : "provider_rejected");
    if (status === 429) assert.equal(rejected.status, 429);
    const replacement = await f.add({ label: "Updated connection" });
    assert.equal(replacement.status, 201);
    const corrected = { ...original, connectionId: replacement.body.connection.id, subject: "Corrected notice" };
    f.state.send = async () => new Response(null, { status: 202 });
    assert.equal((await f.call("POST", "send", corrected)).status, 202);
    assert.equal((await f.call("POST", "send", corrected)).status, 202);
    assert.equal((await f.call("POST", "send", original)).status, 409);
    assert.equal(f.deliveries().length, 2);
    assert.equal(f.deliveries()[1].body.subject, corrected.subject);
  });
}

test("parallel corrections after a rejection make only one additional provider submission", async t => {
  const f = fixture(t);
  const msg = f.message(await f.create());
  f.state.send = async () => new Response(null, { status: 403 });
  assert.equal((await f.call("POST", "send", msg)).body.error, "provider_rejected");
  const corrected = { ...msg, subject: "Resend after correcting provider settings" };
  const pending = Promise.withResolvers();
  const reachedProvider = Promise.withResolvers();
  f.state.send = async () => {
    reachedProvider.resolve();
    await pending.promise;
    return new Response(null, { status: 202 });
  };
  const first = f.call("POST", "send", corrected);
  await Promise.race([
    reachedProvider.promise,
    first.then(res => { throw new Error("Retry ended before contacting provider: " + res.status); }),
  ]);
  try {
    const second = await f.call("POST", "send", corrected);
    assert.equal(second.status, 409);
    assert.equal(second.body.error, "sending");
  } finally {
    pending.resolve();
  }
  assert.equal((await first).status, 202);
  assert.equal(f.deliveries().length, 2);
});

test("provider timeout status suppresses all retries on the same ID, including changed content", async t => {
  const f = fixture(t);
  const msg = f.message(await f.create());
  f.state.send = async () => new Response(null, { status: 408 });
  assert.equal((await f.call("POST", "send", msg)).body.error, "delivery_unknown");
  f.state.send = async () => new Response(null, { status: 202 });
  assert.equal((await f.call("POST", "send", msg)).body.error, "delivery_unknown");
  assert.ok((await f.call("POST", "send", { ...msg, subject: "Changed subject" })).status >= 400);
  assert.equal(f.deliveries().length, 1);
});

test("repeated rejected send attempts consume the visitor's hourly quota", async t => {
  const f = fixture(t);
  const msg = f.message(await f.create());
  f.state.send = async () => new Response(null, { status: 400 });
  for (let i = 0; i < 20; i++) {
    assert.equal((await f.call("POST", "send", msg)).body.error, "provider_rejected");
  }
  assert.equal(f.deliveries().length, 20);
  assert.equal((await f.call("POST", "send", msg)).body.error, "rate_limited");
  assert.equal(f.deliveries().length, 20);
});
