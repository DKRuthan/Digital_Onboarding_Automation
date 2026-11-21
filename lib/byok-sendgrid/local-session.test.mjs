import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { checkLocalRequest, localLaunch } from "./local-session.mjs";

const origin = "http://127.0.0.1:3100";
const host = new URL(origin).host;
const launch = localLaunch({
  ONBOARDING_LOCAL_ORIGIN: origin,
  ONBOARDING_BOOTSTRAP_TOKEN: randomBytes(32).toString("base64url"),
  ONBOARDING_SESSION_TOKEN: randomBytes(32).toString("base64url"),
});
const url = "http://localhost:3100/api/email/local-session";
const exchange = (token, from = origin) => new Request(url, {
  method: "POST", body: token,
  headers: { host, origin: from, "content-type": "text/plain", "content-length": String(token.length) },
});

test("only the local launcher with a fresh token pair can start a vault session", () => {
  assert.equal(localLaunch({}), null);
  assert.equal(localLaunch({ONBOARDING_LOCAL_ORIGIN: "http://127.0.0.1:3100"}), null);
  assert.equal(localLaunch({
    ONBOARDING_LOCAL_ORIGIN: "https://company.example",
    ONBOARDING_BOOTSTRAP_TOKEN: launch.bootstrap,
    ONBOARDING_SESSION_TOKEN: launch.session,
  }), null);
});

test("bootstrap survives Next's localhost URL normalization and rejects cross-origin attempts", async () => {
  const page = await checkLocalRequest(new Request(url, { headers: { host } }), launch);
  assert.equal(page.status, 200);
  assert.equal((await page.text()).includes(launch.bootstrap), false);
  assert.equal((await checkLocalRequest(exchange(launch.bootstrap, "https://other.example"), launch)).status, 403);
  assert.equal((await checkLocalRequest(exchange(launch.session), launch)).status, 403);
  const ok = await checkLocalRequest(exchange(launch.bootstrap), launch);
  assert.equal(ok.status, 204);
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const headers = { host, cookie: cookie.split(";")[0] };
  const list = "http://localhost:3100/api/email/connections";
  assert.equal(await checkLocalRequest(new Request(list, { headers }), launch), null);
  assert.equal((await checkLocalRequest(new Request(list, { headers: { ...headers, host: "other.example" } }), launch)).status, 403);
  assert.equal((await checkLocalRequest(new Request(list, { headers: { host, "x-forwarded-for": "127.0.0.1" } }), launch)).status, 401);
});
