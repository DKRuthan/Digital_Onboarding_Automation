import {
  INTERNAL_SEND_API_DISABLED_ERROR,
  REDACTED_TEST_RECIPIENT,
  TEST_SEND_API_DISABLED_ERROR,
  assertPublicConfigRedacted,
  getPublicSendGridConfig,
  isEnvFlagEnabled,
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

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
): void {
  process.env = { ...savedEnv, ...overrides };
  try {
    fn();
  } finally {
    process.env = { ...savedEnv };
  }
}

console.log("A. Env flag helper defaults...");
assert(!isEnvFlagEnabled(undefined), "unset flag is disabled");
assert(!isEnvFlagEnabled(""), "empty flag is disabled");
assert(!isEnvFlagEnabled("false"), "false flag is disabled");
assert(isEnvFlagEnabled("TRUE"), "TRUE is enabled (case-insensitive)");
assert(isEnvFlagEnabled("true"), "true flag is enabled");
assert(isEnvFlagEnabled(" true "), "trimmed true is enabled");

console.log("B. Send route gates default disabled...");
withEnv(
  {
    INTERNAL_SEND_API_ENABLED: undefined,
    SENDGRID_TEST_SEND_ENABLED: undefined,
  },
  () => {
    assert(!isInternalSendApiEnabled(), "internal send API disabled when unset");
    assert(!isTestSendApiEnabled(), "test send API disabled when unset");
  },
);

withEnv(
  {
    INTERNAL_SEND_API_ENABLED: "false",
    SENDGRID_TEST_SEND_ENABLED: "0",
  },
  () => {
    assert(!isInternalSendApiEnabled(), "internal send API disabled when false");
    assert(!isTestSendApiEnabled(), "test send API disabled when not true");
  },
);

withEnv(
  {
    INTERNAL_SEND_API_ENABLED: "true",
    SENDGRID_TEST_SEND_ENABLED: "true",
  },
  () => {
    assert(isInternalSendApiEnabled(), "internal send API enabled when true");
    assert(isTestSendApiEnabled(), "test send API enabled when true");
  },
);

console.log("C. Public config shape is redacted...");
withEnv({}, () => {
  const config = getPublicSendGridConfig();
  assert(typeof config.configured === "boolean", "configured is boolean");
  assert(config.sendMode === "dry_run" || config.sendMode === "live", "sendMode valid");
  assert(config.customerSendsEnabled === false, "customerSendsEnabled is false");
  assert(typeof config.internalSendsEnabled === "boolean", "internalSendsEnabled boolean");
  assert(typeof config.testSendEnabled === "boolean", "testSendEnabled boolean");
  assert(Array.isArray(config.validationErrors), "validationErrors is array");

  assertPublicConfigRedacted(config as unknown as Record<string, unknown>);

  for (const key of ["damAlertEmail", "fromEmail", "internalEmailDomain"]) {
    assert(
      !(key in (config as object)),
      `public config must not include ${key}`,
    );
  }
});

console.log("D. Disabled error messages...");
assert(
  INTERNAL_SEND_API_DISABLED_ERROR === "Internal send API is disabled",
  "internal send disabled message",
);
assert(
  TEST_SEND_API_DISABLED_ERROR === "Test send API is disabled",
  "test send disabled message",
);

console.log("E. Test recipient redaction constant...");
assert(
  REDACTED_TEST_RECIPIENT === "[configured test inbox]",
  "redacted test recipient label",
);
assert(
  !REDACTED_TEST_RECIPIENT.includes("@"),
  "redacted test recipient must not look like an email",
);

console.log("OK: verify-api-security-gates passed");
