import { timingSafeEqual } from "node:crypto";

const TOKEN = /^[a-zA-Z0-9_-]{43}$/;
const SESSION_COOKIE = "journey_local_session";
const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function sameToken(value, expected) {
  return typeof value === "string" && TOKEN.test(value) && TOKEN.test(expected)
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function localLaunch(env) {
  const origin = env.ONBOARDING_LOCAL_ORIGIN;
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(origin ?? "")
    || !TOKEN.test(env.ONBOARDING_BOOTSTRAP_TOKEN ?? "") || !TOKEN.test(env.ONBOARDING_SESSION_TOKEN ?? "")) return null;
  return { origin, bootstrap: env.ONBOARDING_BOOTSTRAP_TOKEN, session: env.ONBOARDING_SESSION_TOKEN };
}

function unavailable(status = 403) {
  return Response.json({
    error: "local_session_required",
    message: "Open the private startup link printed by npm run local on this computer.",
  }, { status, headers: noStore });
}

// The launcher binds Next to loopback and prints a random bootstrap credential.
// The fragment is consumed in the browser; it never appears in an HTTP URL.
const bootstrapPage = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Open Journey Control</title>
<body><p id="message">Opening Journey Control…</p><script>
const token = location.hash.slice(1);
history.replaceState(null, "", location.pathname);
fetch(location.pathname, {method:"POST", headers:{"Content-Type":"text/plain"}, body:token})
.then(r => { if (!r.ok) throw new Error(); location.replace("/"); })
.catch(() => { document.getElementById("message").textContent = "Open the private startup link printed by npm run local on this computer."; });
</script></body></html>`;

export async function checkLocalRequest(request, launch) {
  const expected = new URL(launch.origin);
  if (request.headers.get("host") !== expected.host) return unavailable();

  if (new URL(request.url).pathname === "/api/email/local-session") {
    if (request.method === "GET") {
      return new Response(bootstrapPage, { headers: { ...noStore, "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
      } });
    }
    if (request.method !== "POST" || request.headers.get("origin") !== launch.origin ||
        request.headers.get("content-type")?.split(";")[0] !== "text/plain" ||
        Number(request.headers.get("content-length")) !== 43) return unavailable();
    if (!sameToken(await request.text(), launch.bootstrap)) return unavailable();
    return new Response(null, { status: 204, headers: {
      ...noStore, "Set-Cookie": SESSION_COOKIE + "=" + launch.session + "; Path=/api/email; HttpOnly; SameSite=Strict",
    } });
  }

  const cookie = (request.headers.get("cookie") || "").split(";").map(p => p.trim())
    .find(p => p.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  return sameToken(cookie, launch.session) ? null : unavailable(401);
}
