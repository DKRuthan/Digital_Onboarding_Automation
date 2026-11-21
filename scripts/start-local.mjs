import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Install Node.js 24 or later, then run npm run local.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be between 1 and 65535.");
  process.exit(1);
}

const host = "127.0.0.1";
const origin = "http://" + host + ":" + port;
const bootstrap = randomBytes(32).toString("base64url");
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [
  require.resolve("next/dist/bin/next"), "dev", "--webpack",
  "--hostname", host, "--port", String(port),
], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    ONBOARDING_LOCAL_ORIGIN: origin,
    ONBOARDING_BOOTSTRAP_TOKEN: bootstrap,
    ONBOARDING_SESSION_TOKEN: randomBytes(32).toString("base64url"),
    AUTH_ENABLED: "false",
    INTERNAL_SEND_API_ENABLED: "false",
    SENDGRID_TEST_SEND_ENABLED: "false",
  },
});
console.log("\nOpen this private link on this computer to use your email connections:\n");
console.log(origin + "/api/email/local-session#" + bootstrap + "\n");

child.on("error", () => { console.error("Could not start Next.js. Run npm ci and try again."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
