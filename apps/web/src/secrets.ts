import { loadSecrets } from "@nanomail/secrets";

/**
 * Declarative manifest of every secret the backend needs at runtime. This is
 * the single source of truth: the {@link AppSecrets} type, the keys fetched
 * from secret-party, and validation are all derived from it. To add a secret,
 * add one entry here — nothing else.
 *
 * All values are fetched from a self-hosted secret-party instance
 * (https://github.com/0916dhkim/secret-party). secret-party is required; there
 * is no plaintext-environment fallback.
 */
const SECRETS = {
  DATABASE_URL: {
    description: "CockroachDB connection string (Postgres-wire compatible)",
    validate: (value) =>
      /^postgres(ql)?:\/\/.+/.test(value)
        ? null
        : "must be a postgres:// connection string",
  },
  INGEST_SECRET: {
    description:
      "Shared bearer token the email worker presents to /api/ingest",
    validate: (value) =>
      value.length >= 16 ? null : "must be at least 16 characters",
  },
  AWS_ACCESS_KEY_ID: {
    description: "AWS IAM access key ID for SES sending",
    validate: (value) =>
      /^AKIA[0-9A-Z]{16}$/.test(value) ? null : "must be a 20-char AKIA access key ID",
  },
  AWS_SECRET_ACCESS_KEY: {
    description: "AWS IAM secret access key for SES sending",
    validate: (value) =>
      value.length >= 30 ? null : "must be at least 30 characters",
  },
  AWS_REGION: {
    description: "AWS region where the SES sending identity is verified",
    validate: (value) =>
      /^[a-z]{2}-[a-z]+-\d+$/.test(value) ? null : "must be an AWS region like us-east-1",
  },
} satisfies Record<string, SecretSpec>;

/** Returns an error message describing why `value` is invalid, or null if ok. */
type Validate = (value: string) => string | null;

interface SecretSpec {
  /** Human-readable explanation, surfaced in error messages. */
  description: string;
  /** Optional value-level check applied after the secret is resolved. */
  validate?: Validate;
}

type SecretKey = keyof typeof SECRETS;

export type AppSecrets = Record<SecretKey, string>;

const KEYS = Object.keys(SECRETS) as SecretKey[];

/**
 * Validate a bag of raw values against the manifest, collecting every problem
 * before throwing so the operator sees all of them at once.
 */
function parse(values: Partial<Record<SecretKey, string | undefined>>): AppSecrets {
  const result = {} as AppSecrets;
  const problems: string[] = [];

  for (const key of KEYS) {
    const spec = SECRETS[key];
    const value = values[key];

    if (value == null || value === "") {
      problems.push(`${key}: missing — ${spec.description}`);
      continue;
    }

    const error = spec.validate?.(value);
    if (error) {
      problems.push(`${key}: ${error}`);
      continue;
    }

    result[key] = value;
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid secret configuration:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nFix these values in the secret-party environment.`,
    );
  }

  return result;
}

async function resolveSecrets(): Promise<AppSecrets> {
  const baseUrl = process.env.SECRETS_BASE_URL;
  const environmentId = process.env.SECRETS_ENVIRONMENT_ID;
  const privateKeyBase64 = process.env.SECRETS_PRIVATE_KEY;

  if (!baseUrl || !environmentId || !privateKeyBase64) {
    throw new Error(
      "secret-party is not configured. Set SECRETS_BASE_URL, " +
        "SECRETS_ENVIRONMENT_ID, and SECRETS_PRIVATE_KEY.",
    );
  }

  // Every value is fetched from secret-party. The private key never leaves this
  // process: the DEK is unwrapped locally and each value is decrypted
  // client-side (see @nanomail/secrets).
  const fetched = await loadSecrets({
    baseUrl,
    environmentId,
    privateKeyBase64,
    keys: KEYS,
  });
  return parse(fetched);
}

let cached: Promise<AppSecrets> | null = null;

/**
 * Resolve the backend's secrets once and cache the result for the lifetime of
 * the process. A failed load is not cached, so the next caller will retry
 * (e.g. if secret-party was briefly unreachable at startup).
 */
export function getSecrets(): Promise<AppSecrets> {
  if (!cached) {
    cached = resolveSecrets().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}
