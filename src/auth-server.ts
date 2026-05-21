#!/usr/bin/env node
/**
 * QuickBooks OAuth Authentication Server
 *
 * Local CLI that runs the OAuth 2.0 handshake interactively and writes the
 * resulting tokens to `.env`. Used for standalone (non-MissionSquad) usage,
 * where `process.env` is the source of truth for QuickBooks credentials.
 *
 * Usage: npm run auth
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { QuickbooksClient } from "./clients/quickbooks-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

process.on("uncaughtException", (err) => {
  console.error("[auth-server] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[auth-server] unhandledRejection:", reason);
});

async function main(): Promise<void> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET must be set in .env to run the OAuth flow."
    );
    process.exit(1);
  }

  const environmentRaw = (
    process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox"
  ).toLowerCase();
  if (environmentRaw !== "sandbox" && environmentRaw !== "production") {
    console.error(
      `QUICKBOOKS_ENVIRONMENT must be "sandbox" or "production" (got "${environmentRaw}").`
    );
    process.exit(1);
  }

  const redirectUri =
    process.env.QUICKBOOKS_REDIRECT_URI ?? "http://localhost:8000/callback";

  const client = new QuickbooksClient({
    clientId,
    clientSecret,
    refreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN ?? "",
    realmId: process.env.QUICKBOOKS_REALM_ID ?? "",
    environment: environmentRaw,
    redirectUri,
    interactive: true,
  });

  console.log("QuickBooks OAuth Authentication");
  console.log("================================\n");
  console.log("Starting OAuth flow...");
  console.log(
    "A browser window will open for you to authorize the application.\n"
  );

  try {
    await client.authenticate();
    console.log("\nSuccessfully authenticated with QuickBooks.");
    console.log("Tokens have been saved to your .env file.");
    process.exit(0);
  } catch (error) {
    console.error("\nAuthentication failed:", error);
    console.error("\nPlease check:");
    console.error("1. QUICKBOOKS_CLIENT_ID is set correctly in .env");
    console.error("2. QUICKBOOKS_CLIENT_SECRET is set correctly in .env");
    console.error(
      "3. The redirect URI is registered for the app in the Intuit developer portal"
    );
    process.exit(1);
  }
}

main();
