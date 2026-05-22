import { UserError } from "@missionsquad/fastmcp";

export type QuickbooksEnvironment = "sandbox" | "production";

export interface QuickbooksConfigDefaults {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  realmId?: string;
  environment?: string;
  redirectUri?: string;
}

export interface ResolvedQuickbooksConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  realmId: string;
  environment: QuickbooksEnvironment;
  redirectUri: string;
}

export const QUICKBOOKS_SECRET_NAMES = [
  "clientId",
  "clientSecret",
  "refreshToken",
  "realmId",
  "environment",
] as const;

function readHiddenString(
  extraArgs: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = extraArgs?.[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new UserError(
      `Hidden argument "${key}" must be a string when provided.`
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new UserError(
      `Hidden argument "${key}" must be a non-empty string when provided.`
    );
  }

  return trimmed;
}

function normalizeEnvironment(value: string): QuickbooksEnvironment {
  const lowered = value.trim().toLowerCase();
  if (lowered === "sandbox" || lowered === "production") {
    return lowered;
  }
  throw new UserError(
    `QuickBooks "environment" must be "sandbox" or "production", got "${value}".`
  );
}

/**
 * Resolve the QuickBooks runtime configuration for one tool call.
 *
 * Precedence per Mission Squad contract:
 *   1. Hidden per-call extra arg from `context.extraArgs`
 *   2. Local environment-variable fallback (defaults arg)
 *   3. UserError surfaced to the caller
 *
 * `redirectUri` is only meaningful for the interactive local OAuth flow
 * (`auth-server.ts`) and is not part of the hidden-secret contract; it is
 * read from env defaults so MissionSquad-hosted invocations don't need it.
 */
export function resolveQuickbooksConfig(
  extraArgs: Record<string, unknown> | undefined,
  defaults: QuickbooksConfigDefaults
): ResolvedQuickbooksConfig {
  const clientId =
    readHiddenString(extraArgs, "clientId") ?? defaults.clientId;
  const clientSecret =
    readHiddenString(extraArgs, "clientSecret") ?? defaults.clientSecret;
  const refreshToken =
    readHiddenString(extraArgs, "refreshToken") ?? defaults.refreshToken;
  const realmId =
    readHiddenString(extraArgs, "realmId") ?? defaults.realmId;
  const environmentRaw =
    readHiddenString(extraArgs, "environment") ??
    defaults.environment ??
    "sandbox";

  const missing: string[] = [];
  if (!clientId) missing.push("clientId");
  if (!clientSecret) missing.push("clientSecret");
  if (!refreshToken) missing.push("refreshToken");
  if (!realmId) missing.push("realmId");

  if (missing.length > 0) {
    throw new UserError(
      `Missing required QuickBooks credentials: ${missing.join(", ")}. ` +
        `Configure these as hidden secrets on the Mission Squad server, ` +
        `or set the corresponding QUICKBOOKS_* environment variables for local standalone use.`
    );
  }

  const environment = normalizeEnvironment(environmentRaw);
  const redirectUri =
    defaults.redirectUri && defaults.redirectUri.trim().length > 0
      ? defaults.redirectUri.trim()
      : "http://localhost:8000/callback";

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    realmId: realmId!,
    environment,
    redirectUri,
  };
}

/**
 * Build the `defaults` object from `process.env`. Kept in one place so the
 * env-var fallback rules are obvious at a glance and easy to remove later.
 */
export function readQuickbooksDefaultsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): QuickbooksConfigDefaults {
  return {
    clientId: env.QUICKBOOKS_CLIENT_ID,
    clientSecret: env.QUICKBOOKS_CLIENT_SECRET,
    refreshToken: env.QUICKBOOKS_REFRESH_TOKEN,
    realmId: env.QUICKBOOKS_REALM_ID,
    environment: env.QUICKBOOKS_ENVIRONMENT,
    redirectUri: env.QUICKBOOKS_REDIRECT_URI,
  };
}
