import {
  forbiddenResponse,
  isApiAuthRequired,
  requireApiPermission,
  requireApiSession,
  unauthorizedResponse,
} from "../lib/auth/api-auth";
import {
  isInternalSendApiEnabled,
  isTestSendApiEnabled,
} from "../lib/sendgrid-env";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const savedEnv = { ...process.env };

async function withEnvAsync(
  overrides: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  process.env = { ...savedEnv, ...overrides };
  try {
    await fn();
  } finally {
    process.env = { ...savedEnv };
  }
}

async function main(): Promise<void> {
  console.log("A. isApiAuthRequired when AUTH_ENABLED=false...");
  await withEnvAsync(
    {
      AUTH_ENABLED: "false",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      CLERK_SECRET_KEY: "sk_test_x",
    },
    () => {
      assert(!isApiAuthRequired(), "API auth not required when AUTH_ENABLED=false");
    },
  );

  console.log("B. isApiAuthRequired when AUTH_ENABLED=true and keys present...");
  await withEnvAsync(
    {
      AUTH_ENABLED: "true",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      CLERK_SECRET_KEY: "sk_test_x",
    },
    () => {
      assert(isApiAuthRequired(), "API auth required when enabled with Clerk keys");
    },
  );

  console.log("C. isApiAuthRequired false when keys missing...");
  await withEnvAsync(
    {
      AUTH_ENABLED: "true",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
    },
    () => {
      assert(!isApiAuthRequired(), "API auth not required without Clerk keys");
    },
  );

  console.log("D. unauthorizedResponse shape...");
  {
    const response = unauthorizedResponse();
    assert(response.status === 401, "unauthorized status is 401");
    const body = (await response.json()) as { success: boolean; error: string };
    assert(body.success === false, "success is false");
    assert(body.error === "Unauthorized", "error message is Unauthorized");
  }

  console.log("E. requireApiSession skips auth when disabled...");
  await withEnvAsync({ AUTH_ENABLED: "false" }, async () => {
    const result = await requireApiSession();
    assert(result.ok === true, "requireApiSession ok when auth disabled");
    if (result.ok) {
      assert(result.authRequired === false, "authRequired false when disabled");
      assert(result.userId === null, "userId null when disabled");
    }
  });

  console.log(
    "F. requireApiSession requires auth when enabled (no Clerk request context)...",
  );
  await withEnvAsync(
    {
      AUTH_ENABLED: "true",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
      CLERK_SECRET_KEY: "sk_test_x",
    },
    async () => {
      const result = await requireApiSession();
      assert(result.ok === false, "requireApiSession fails without session");
      if (!result.ok) {
        assert(result.response.status === 401, "missing session returns 401");
        const body = (await result.response.json()) as {
          success: boolean;
          error: string;
        };
        assert(body.success === false, "401 body success false");
        assert(body.error === "Unauthorized", "401 body error Unauthorized");
      }
    },
  );

  console.log("G. F-2B send gates unchanged when auth disabled...");
  await withEnvAsync(
    {
      AUTH_ENABLED: "false",
      INTERNAL_SEND_API_ENABLED: undefined,
      SENDGRID_TEST_SEND_ENABLED: undefined,
    },
    () => {
      assert(!isInternalSendApiEnabled(), "internal gate off when unset");
      assert(!isTestSendApiEnabled(), "test gate off when unset");
    },
  );

  console.log("H. forbiddenResponse shape...");
  {
    const response = forbiddenResponse();
    assert(response.status === 403, "forbidden status is 403");
    const body = (await response.json()) as { success: boolean; error: string };
    assert(body.success === false, "forbidden success false");
    assert(body.error === "Forbidden", "forbidden error Forbidden");
  }

  console.log("I. requireApiPermission skips RBAC when auth disabled...");
  await withEnvAsync({ AUTH_ENABLED: "false" }, async () => {
    const result = await requireApiPermission("send_test_email");
    assert(result.ok === true, "requireApiPermission ok when auth disabled");
    if (result.ok) {
      assert(result.authRequired === false, "authRequired false for RBAC off");
    }
  });

  console.log("OK: verify-api-auth-protection passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
