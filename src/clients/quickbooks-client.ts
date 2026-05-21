import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import QuickBooks from "node-quickbooks";
import OAuthClient from "intuit-oauth";
import open from "open";

import {
  readQuickbooksDefaultsFromEnv,
  resolveQuickbooksConfig,
  type ResolvedQuickbooksConfig,
} from "../helpers/resolve-quickbooks-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface QuickbooksClientOptions extends ResolvedQuickbooksConfig {
  /**
   * When true, the client may launch the local OAuth browser flow and write
   * rotated refresh tokens to `.env`. Reserved for the `auth-server.ts` CLI.
   * MissionSquad-hosted invocations must use `false` (the default).
   */
  interactive?: boolean;
}

/**
 * Per-credential QuickBooks client wrapper. Construct directly when running
 * the local OAuth bootstrap (`auth-server.ts`). For tool-call execution, use
 * {@link getQuickbooksClient} so that clients are cached per credential set
 * across many calls from the same MissionSquad user.
 */
export class QuickbooksClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private refreshToken: string;
  private realmId: string;
  private readonly environment: "sandbox" | "production";
  private readonly redirectUri: string;
  private readonly interactive: boolean;

  private accessToken?: string;
  private accessTokenExpiry?: Date;
  private quickbooksInstance?: QuickBooks;
  private readonly oauthClient: OAuthClient;
  private isAuthenticating: boolean = false;
  private refreshInFlight?: Promise<{
    access_token: string;
    expires_in: number;
  }>;

  constructor(options: QuickbooksClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken;
    this.realmId = options.realmId;
    this.environment = options.environment;
    this.redirectUri = options.redirectUri;
    this.interactive = options.interactive ?? false;
    this.oauthClient = new OAuthClient({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      environment: this.environment,
      redirectUri: this.redirectUri,
    });
  }

  /**
   * Ensure a valid access token + node-quickbooks instance exists, then return it.
   * In non-interactive (MissionSquad) mode this performs only a refresh-token
   * exchange — it never starts a browser-based OAuth flow.
   */
  async authenticate(): Promise<QuickBooks> {
    if (!this.refreshToken || !this.realmId) {
      if (!this.interactive) {
        throw new Error(
          "QuickBooks refresh_token and realm_id are required. Provide them as Mission Squad hidden secrets or QUICKBOOKS_REFRESH_TOKEN/QUICKBOOKS_REALM_ID env vars."
        );
      }
      await this.startOAuthFlow();
      if (!this.refreshToken || !this.realmId) {
        throw new Error("Failed to obtain required tokens from OAuth flow");
      }
    }

    const now = new Date();
    if (
      !this.accessToken ||
      !this.accessTokenExpiry ||
      this.accessTokenExpiry <= now
    ) {
      const tokenResponse = await this.refreshAccessToken();
      this.accessToken = tokenResponse.access_token;
    }

    this.quickbooksInstance = new QuickBooks(
      this.clientId,
      this.clientSecret,
      this.accessToken,
      false,
      this.realmId,
      this.environment === "sandbox",
      false,
      null,
      "2.0",
      this.refreshToken
    );

    return this.quickbooksInstance;
  }

  getQuickbooks(): QuickBooks {
    if (!this.quickbooksInstance) {
      throw new Error(
        "QuickBooks not authenticated. Call authenticate() first."
      );
    }
    return this.quickbooksInstance;
  }

  async refreshAccessToken(): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    if (!this.refreshToken) {
      if (!this.interactive) {
        throw new Error(
          "QuickBooks refresh_token is required for token refresh."
        );
      }
      await this.startOAuthFlow();
      if (!this.refreshToken) {
        throw new Error("Failed to obtain refresh token from OAuth flow");
      }
    }

    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const authResponse = await this.oauthClient.refreshUsingToken(
          this.refreshToken
        );

        const token = authResponse.token as unknown as {
          access_token: string;
          expires_in?: number;
          refresh_token?: string;
          x_refresh_token_expires_in?: number;
        };

        this.accessToken = token.access_token;
        const expiresIn = token.expires_in || 3600;
        this.accessTokenExpiry = new Date(Date.now() + expiresIn * 1000);

        const newRefreshToken = token.refresh_token;
        if (newRefreshToken && newRefreshToken !== this.refreshToken) {
          this.refreshToken = newRefreshToken;
          if (this.interactive) {
            try {
              this.saveTokensToEnv();
              console.error(
                "[qbo-client] Refresh token rotated and persisted to .env"
              );
            } catch (persistErr) {
              console.error(
                "[qbo-client] Failed to persist rotated refresh token:",
                persistErr
              );
            }
          }
        }

        const refreshExpiresIn = token.x_refresh_token_expires_in;
        if (
          typeof refreshExpiresIn === "number" &&
          refreshExpiresIn < 14 * 24 * 3600
        ) {
          const days = Math.round(refreshExpiresIn / 86400);
          console.error(
            `[qbo-client] WARNING: refresh token expires in ~${days} day(s). Re-run \`npm run auth\` (local) or update the Mission Squad secret before it expires.`
          );
        }

        return {
          access_token: this.accessToken!,
          expires_in: expiresIn,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to refresh Quickbooks token: ${message}`);
      } finally {
        this.refreshInFlight = undefined;
      }
    })();

    return this.refreshInFlight;
  }

  private async startOAuthFlow(): Promise<void> {
    if (!this.interactive) {
      throw new Error(
        "OAuth browser flow is only available in interactive (local CLI) mode."
      );
    }
    if (this.isAuthenticating) {
      return;
    }
    this.isAuthenticating = true;
    const port = 8000;

    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        console.log(`[auth-server] ${req.method} ${req.url}`);
        if (!req.url?.startsWith("/callback")) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end(
            "Not Found. Waiting for QuickBooks OAuth callback at /callback"
          );
          return;
        }

        try {
          const response = await this.oauthClient.createToken(req.url);
          const tokens = response.token;
          this.refreshToken = tokens.refresh_token;
          this.realmId = tokens.realmId;
          this.saveTokensToEnv();

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Connected to QuickBooks. You can close this window.</h2></body></html>"
          );

          setTimeout(() => {
            server.close();
            this.isAuthenticating = false;
            resolve();
          }, 1000);
        } catch (error) {
          console.error("Error during token creation:", error);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Error connecting to QuickBooks. See server console.");
          this.isAuthenticating = false;
          reject(error);
        }
      });

      server.listen(port, "::", async () => {
        const addr = server.address();
        console.log(
          `[auth-server] Listening on ${
            typeof addr === "string"
              ? addr
              : `${addr?.address}:${addr?.port}`
          }`
        );
        const authUri = this.oauthClient
          .authorizeUri({
            scope: [OAuthClient.scopes.Accounting as string],
            state: "testState",
          })
          .toString();

        console.log("\n=== QuickBooks Authorization ===");
        console.log("Open this URL in a browser to authorize:\n");
        console.log(authUri);
        console.log("\nWaiting for callback...\n");

        try {
          await open(authUri);
        } catch {
          // headless environment — user will open the URL manually
        }
      });

      server.on("error", (error) => {
        console.error("Server error:", error);
        this.isAuthenticating = false;
        reject(error);
      });
    });
  }

  private saveTokensToEnv(): void {
    const tokenPath = path.join(__dirname, "..", "..", ".env");
    const envContent = fs.existsSync(tokenPath)
      ? fs.readFileSync(tokenPath, "utf-8")
      : "";
    const envLines = envContent.split("\n");

    const updateEnvVar = (name: string, value: string) => {
      const index = envLines.findIndex((line) => line.startsWith(`${name}=`));
      if (index !== -1) {
        envLines[index] = `${name}=${value}`;
      } else {
        envLines.push(`${name}=${value}`);
      }
    };

    if (this.refreshToken)
      updateEnvVar("QUICKBOOKS_REFRESH_TOKEN", this.refreshToken);
    if (this.realmId) updateEnvVar("QUICKBOOKS_REALM_ID", this.realmId);

    const tmpPath = `${tokenPath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, envLines.join("\n"), { mode: 0o600 });
      fs.renameSync(tmpPath, tokenPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // best effort
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-config cache and AsyncLocalStorage backed proxy
//
// Handlers in this repository call `quickbooksClient.authenticate()` and
// `quickbooksClient.getQuickbooks()` directly. To keep those handlers
// untouched, we expose a module-level `quickbooksClient` proxy that resolves
// the active per-request client from AsyncLocalStorage. Each tool call enters
// a scope via `withQuickbooksFromContext`, which (1) resolves config from
// `context.extraArgs` + env fallback, (2) gets-or-creates a cached
// QuickbooksClient for that credential set, and (3) runs the handler inside
// the request scope.
// ---------------------------------------------------------------------------

const clientCache = new Map<string, QuickbooksClient>();

function hashConfig(config: ResolvedQuickbooksConfig): string {
  // redirectUri intentionally excluded — it is only used during interactive
  // OAuth and is not part of identity for token refresh.
  const material = [
    config.clientId,
    config.clientSecret,
    config.refreshToken,
    config.realmId,
    config.environment,
  ].join("\0");
  return createHash("sha256").update(material).digest("hex");
}

export function getQuickbooksClient(
  config: ResolvedQuickbooksConfig
): QuickbooksClient {
  const key = hashConfig(config);
  let client = clientCache.get(key);
  if (!client) {
    client = new QuickbooksClient({ ...config, interactive: false });
    clientCache.set(key, client);
  }
  return client;
}

interface RequestStore {
  client: QuickbooksClient;
}

const requestStore = new AsyncLocalStorage<RequestStore>();

function getActiveClient(): QuickbooksClient {
  const store = requestStore.getStore();
  if (!store) {
    throw new Error(
      "QuickBooks client is not bound to the current async context. " +
        "Handlers must be invoked from within a tool execute() that goes through withQuickbooksFromContext()."
    );
  }
  return store.client;
}

/**
 * Backward-compatible shim used by every handler in `src/handlers/`. Resolves
 * the active per-request {@link QuickbooksClient} from AsyncLocalStorage.
 */
export const quickbooksClient = {
  authenticate(): Promise<QuickBooks> {
    return getActiveClient().authenticate();
  },
  getQuickbooks(): QuickBooks {
    return getActiveClient().getQuickbooks();
  },
  refreshAccessToken(): Promise<{ access_token: string; expires_in: number }> {
    return getActiveClient().refreshAccessToken();
  },
};

/**
 * FastMCP-friendly entrypoint used by `RegisterTool`. Resolves credentials
 * from `context.extraArgs` (per MissionSquad hidden injection), reuses a
 * cached `QuickbooksClient` for those credentials, and runs the inner tool
 * handler inside an AsyncLocalStorage scope so that the handler chain can
 * use the `quickbooksClient` proxy unchanged.
 */
export async function withQuickbooksFromContext<T>(
  extraArgs: Record<string, unknown> | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const defaults = readQuickbooksDefaultsFromEnv();
  const resolved = resolveQuickbooksConfig(extraArgs, defaults);
  const client = getQuickbooksClient(resolved);
  return requestStore.run({ client }, fn);
}
