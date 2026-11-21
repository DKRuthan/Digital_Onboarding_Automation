import { handleEmailApi } from "@/lib/byok-sendgrid/index.mjs";
import { checkLocalRequest, localLaunch } from "@/lib/byok-sendgrid/local-session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unavailable(message) {
  return Response.json({ error: "email_unavailable", message }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}

async function emailRoute(request) {
  const launch = localLaunch(process.env);
  if (!launch) return unavailable("To connect your SendGrid account on this computer, start the application with npm run local.");

  const sessionResponse = await checkLocalRequest(request, launch);
  if (sessionResponse) return sessionResponse;
  try {
    const { openLocalEmailVault } = await import("@/lib/byok-sendgrid/local-db.mjs");
    const { db, vaultKey } = openLocalEmailVault();
    // Next normalizes numeric loopback hosts to localhost in request.url. The
    // actual Host was checked against the private launcher origin above.
    const path = new URL(request.url).pathname;
    const localRequest = new Request(launch.origin + path, request);
    return await handleEmailApi(localRequest, { userId: "local-owner", db, vaultKey });
  } catch {
    return unavailable("The local email vault is unavailable. Check access to the app data folder on this computer.");
  }
}

export { emailRoute as GET, emailRoute as POST, emailRoute as DELETE };
