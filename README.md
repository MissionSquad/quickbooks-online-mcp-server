# @missionsquad/mcp-quickbooks

<div align="center">

**Mission Squad MCP server for QuickBooks Online with hidden secret injection**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tools](https://img.shields.io/badge/Tools-144-green.svg)](#available-tools)
[![Entities](https://img.shields.io/badge/Entities-29-orange.svg)](#entities)
[![Reports](https://img.shields.io/badge/Reports-11-purple.svg)](#reports)

[Quick Start](#quick-start) | [Mission Squad Hidden Secrets](#mission-squad-hidden-secrets) | [Available Tools](#available-tools) | [Authentication](#authentication) | [Documentation](#documentation)

</div>

---

## Overview

This MCP server provides complete QuickBooks Online API integration for Mission Squad, Claude Code, and any other MCP-compatible host. It includes full CRUD operations for 29 entity types and 11 financial reports.

QuickBooks credentials are delivered to each tool call through Mission Squad's hidden secret injection contract: they are stored per user in `mcp-api`, injected into the outbound MCP arguments immediately before execution, and read at runtime via `context.extraArgs`. They never appear in any tool schema, tool description, or prompt the LLM sees. Local standalone use is still supported through `QUICKBOOKS_*` environment variables as a fallback.

### Key Features

- **144 Total Tools** - Complete coverage of QuickBooks Online API
- **29 Entity Types** - Full CRUD operations (Create, Read, Update, Delete, Search)
- **11 Financial Reports** - Balance Sheet, P&L, Cash Flow, and more
- **OAuth 2.0 Authentication** - Secure token-based authentication
- **TypeScript** - Full type safety with Zod validation
- **Tested** - Jest test suite with ESM support

> Runs as a stdio MCP subprocess. On Mission Squad it is a shared process that serves many users concurrently, with each call resolving credentials from the per-user hidden-secret store. Locally it runs as a single-user process backed by `QUICKBOOKS_*` env vars.

---

## Quick Start

### Installation

```bash
git clone https://github.com/missionsquad/mcp-quickbooks.git
cd mcp-quickbooks
npm install
npm run build
```

### Run on Mission Squad

Register the server in `mcp-api` with the secret metadata in [Mission Squad Hidden Secrets](#mission-squad-hidden-secrets). The process starts before any user has configured secrets — credentials are resolved per tool call from `context.extraArgs`, with a `UserError` returned to the client if any required secret is missing.

### Run locally

Copy `.env.example` to `.env`, fill in your QuickBooks app credentials, and complete the OAuth handshake once:

```bash
cp .env.example .env
npm run auth        # opens a browser for sandbox OAuth, writes tokens back to .env
```

Then point any MCP client at the built entry point:

```json
{
  "mcpServers": {
    "quickbooks": {
      "command": "node",
      "args": ["path/to/mcp-quickbooks/dist/index.js"],
      "env": {
        "QUICKBOOKS_CLIENT_ID": "your_client_id",
        "QUICKBOOKS_CLIENT_SECRET": "your_client_secret",
        "QUICKBOOKS_REFRESH_TOKEN": "your_refresh_token",
        "QUICKBOOKS_REALM_ID": "your_realm_id",
        "QUICKBOOKS_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

The env block is only used by the local fallback path. On Mission Squad it can stay empty.

---

## Mission Squad Hidden Secrets

The server declares the following hidden secret names. They are injected into every tool call via `context.extraArgs` and are never present in the tool schema sent to the LLM.

| `secretName` | Required | Purpose |
|---|---|---|
| `clientId` | yes | Intuit app client ID |
| `clientSecret` | yes | Intuit app client secret |
| `refreshToken` | yes | OAuth 2.0 refresh token for the user's QuickBooks Online company |
| `realmId` | yes | QuickBooks Online company (realm) ID |
| `environment` | no (defaults to `sandbox`) | `sandbox` or `production` |

Suggested `mcp-api` server registration payload:

```json
{
  "name": "mcp-quickbooks",
  "transportType": "stdio",
  "command": "node",
  "args": ["/opt/mcp-quickbooks/dist/index.js"],
  "secretNames": [
    "clientId",
    "clientSecret",
    "refreshToken",
    "realmId",
    "environment"
  ],
  "secretFields": [
    {
      "name": "clientId",
      "label": "Intuit app client ID",
      "description": "Client ID from the Intuit Developer Portal app's Keys & Credentials page.",
      "required": true,
      "inputType": "password"
    },
    {
      "name": "clientSecret",
      "label": "Intuit app client secret",
      "description": "Client secret from the Intuit Developer Portal app's Keys & Credentials page.",
      "required": true,
      "inputType": "password"
    },
    {
      "name": "refreshToken",
      "label": "QuickBooks refresh token",
      "description": "OAuth 2.0 refresh token for the QuickBooks Online company. Obtain it by running the local `npm run auth` flow once.",
      "required": true,
      "inputType": "password"
    },
    {
      "name": "realmId",
      "label": "QuickBooks realm (company) ID",
      "description": "Numeric company ID returned by the OAuth handshake.",
      "required": true,
      "inputType": "password"
    },
    {
      "name": "environment",
      "label": "QuickBooks environment",
      "description": "Either \"sandbox\" or \"production\". Defaults to \"sandbox\" if omitted.",
      "required": false,
      "inputType": "password"
    }
  ],
  "enabled": true
}
```

### Precedence

For each field, the server resolves the value in this order:

1. Hidden per-call extra arg from `context.extraArgs`.
2. Local environment fallback (`QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_REFRESH_TOKEN`, `QUICKBOOKS_REALM_ID`, `QUICKBOOKS_ENVIRONMENT`).
3. A `UserError` is returned to the caller listing the missing fields.

### Refresh-token rotation note

Intuit rotates QuickBooks refresh tokens periodically (typically every ~24 hours). When that happens the rotated token is held in the per-credential client cache for the lifetime of the server process; previously-issued refresh tokens remain valid for 24 hours after rotation per Intuit's policy. After a long Mission Squad-hosted run, update the stored `refreshToken` secret if the original 100-day lifetime is approaching expiry — the server logs a warning to stderr when fewer than 14 days remain.

---

## Available Tools

### Entities

Complete CRUD operations are available for all entity types:

| Entity | Create | Get | Update | Delete | Search |
|--------|:------:|:---:|:------:|:------:|:------:|
| **Customer** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Invoice** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Estimate** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bill** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vendor** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Employee** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Account** | ✅ | ✅ | ✅ | - | ✅ |
| **Item** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Journal Entry** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Bill Payment** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Purchase** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Payment** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Sales Receipt** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Credit Memo** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Refund Receipt** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Purchase Order** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vendor Credit** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Deposit** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Transfer** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Time Activity** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Class** | ✅ | ✅ | ✅ | - | ✅ |
| **Department** | ✅ | ✅ | ✅ | - | ✅ |
| **Term** | ✅ | ✅ | ✅ | - | ✅ |
| **Payment Method** | ✅ | ✅ | ✅ | - | ✅ |
| **Tax Code** | - | ✅ | - | - | ✅ |
| **Tax Rate** | - | ✅ | - | - | ✅ |
| **Tax Agency** | - | ✅ | - | - | ✅ |
| **Company Info** | - | ✅ | ✅ | - | - |
| **Attachable** | ✅ | ✅ | ✅ | ✅ | ✅ |

### Reports

| Report | Tool Name | Description |
|--------|-----------|-------------|
| **Balance Sheet** | `get_balance_sheet` | Assets, liabilities, and equity snapshot |
| **Profit & Loss** | `get_profit_and_loss` | Income and expenses over a period |
| **Cash Flow** | `get_cash_flow` | Cash inflows and outflows |
| **Trial Balance** | `get_trial_balance` | Debit and credit balances |
| **General Ledger** | `get_general_ledger` | Complete transaction history |
| **Customer Sales** | `get_customer_sales` | Sales by customer |
| **Aged Receivables** | `get_aged_receivables` | Outstanding customer invoices |
| **Aged Receivables Detail** | `get_aged_receivables_detail` | Detailed aging breakdown |
| **Customer Balance** | `get_customer_balance` | Current customer balances |
| **Aged Payables** | `get_aged_payables` | Outstanding vendor bills |
| **Vendor Expenses** | `get_vendor_expenses` | Expenses by vendor |

---

## Tool Reference

<details>
<summary><strong>Customer Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_customer` | Create a new customer |
| `get_customer` | Get customer by ID |
| `update_customer` | Update customer details |
| `delete_customer` | Delete a customer |
| `search_customers` | Search customers with filters |

</details>

<details>
<summary><strong>Invoice Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_invoice` | Create a new invoice |
| `get_invoice` | Get invoice by ID |
| `update_invoice` | Update invoice details |
| `delete_invoice` | Delete/void an invoice |
| `search_invoices` | Search invoices with filters |

</details>

<details>
<summary><strong>Payment Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_payment` | Record a customer payment |
| `get_payment` | Get payment by ID |
| `update_payment` | Update payment details |
| `delete_payment` | Void a payment |
| `search_payments` | Search payments with filters |

</details>

<details>
<summary><strong>Bill & Vendor Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_bill` | Create a new bill |
| `get_bill` | Get bill by ID |
| `update_bill` | Update bill details |
| `delete_bill` | Delete a bill |
| `search_bills` | Search bills with filters |
| `create_vendor` | Create a new vendor |
| `get_vendor` | Get vendor by ID |
| `update_vendor` | Update vendor details |
| `delete_vendor` | Delete a vendor |
| `search_vendors` | Search vendors with filters |
| `create_bill_payment` | Create a bill payment |
| `get_bill_payment` | Get bill payment by ID |
| `update_bill_payment` | Update bill payment |
| `delete_bill_payment` | Delete a bill payment |
| `search_bill_payments` | Search bill payments |

</details>

<details>
<summary><strong>Sales Receipt & Credit Memo Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_sales_receipt` | Create a sales receipt |
| `get_sales_receipt` | Get sales receipt by ID |
| `update_sales_receipt` | Update sales receipt |
| `delete_sales_receipt` | Void a sales receipt |
| `search_sales_receipts` | Search sales receipts |
| `create_credit_memo` | Create a credit memo |
| `get_credit_memo` | Get credit memo by ID |
| `update_credit_memo` | Update credit memo |
| `delete_credit_memo` | Void a credit memo |
| `search_credit_memos` | Search credit memos |
| `create_refund_receipt` | Create a refund receipt |
| `get_refund_receipt` | Get refund receipt by ID |
| `update_refund_receipt` | Update refund receipt |
| `delete_refund_receipt` | Void a refund receipt |
| `search_refund_receipts` | Search refund receipts |

</details>

<details>
<summary><strong>Banking Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_deposit` | Create a bank deposit |
| `get_deposit` | Get deposit by ID |
| `update_deposit` | Update deposit details |
| `delete_deposit` | Delete a deposit |
| `search_deposits` | Search deposits |
| `create_transfer` | Create an account transfer |
| `get_transfer` | Get transfer by ID |
| `update_transfer` | Update transfer details |
| `delete_transfer` | Delete a transfer |
| `search_transfers` | Search transfers |

</details>

<details>
<summary><strong>Purchase Order & Vendor Credit Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_purchase_order` | Create a purchase order |
| `get_purchase_order` | Get purchase order by ID |
| `update_purchase_order` | Update purchase order |
| `delete_purchase_order` | Delete a purchase order |
| `search_purchase_orders` | Search purchase orders |
| `create_vendor_credit` | Create a vendor credit |
| `get_vendor_credit` | Get vendor credit by ID |
| `update_vendor_credit` | Update vendor credit |
| `delete_vendor_credit` | Delete a vendor credit |
| `search_vendor_credits` | Search vendor credits |

</details>

<details>
<summary><strong>Time Tracking Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_time_activity` | Create a time activity |
| `get_time_activity` | Get time activity by ID |
| `update_time_activity` | Update time activity |
| `delete_time_activity` | Delete a time activity |
| `search_time_activities` | Search time activities |

</details>

<details>
<summary><strong>Classification Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_class` | Create a class |
| `get_class` | Get class by ID |
| `update_class` | Update class details |
| `search_classes` | Search classes |
| `create_department` | Create a department |
| `get_department` | Get department by ID |
| `update_department` | Update department |
| `search_departments` | Search departments |

</details>

<details>
<summary><strong>Settings Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `create_term` | Create a payment term |
| `get_term` | Get term by ID |
| `update_term` | Update term details |
| `search_terms` | Search terms |
| `create_payment_method` | Create a payment method |
| `get_payment_method` | Get payment method by ID |
| `update_payment_method` | Update payment method |
| `search_payment_methods` | Search payment methods |

</details>

<details>
<summary><strong>Tax Tools</strong></summary>

| Tool | Description |
|------|-------------|
| `get_tax_code` | Get tax code by ID |
| `search_tax_codes` | Search tax codes |
| `get_tax_rate` | Get tax rate by ID |
| `search_tax_rates` | Search tax rates |
| `get_tax_agency` | Get tax agency by ID |
| `search_tax_agencies` | Search tax agencies |

</details>

<details>
<summary><strong>Company & Attachments</strong></summary>

| Tool | Description |
|------|-------------|
| `get_company_info` | Get company information |
| `update_company_info` | Update company info |
| `create_attachable` | Create an attachment |
| `get_attachable` | Get attachment by ID |
| `update_attachable` | Update attachment |
| `delete_attachable` | Delete an attachment |
| `search_attachables` | Search attachments |

</details>

---

## Authentication

This server uses OAuth 2.0 to authenticate to a QuickBooks Online company. You'll set up an app on the [Intuit Developer Portal](https://developer.intuit.com/) and connect it to either a **sandbox** (for development) or your **production** QBO company.

### Important: Sandbox vs Production

| Mode | When to use | Redirect URI accepted | Setup difficulty |
|------|-------------|------------------------|------------------|
| **Sandbox** | Development, testing, demos | `http://localhost:8000/callback` works | Easy |
| **Production** | Real company data | Localhost **rejected** — must be a public HTTPS URL | Harder (see below) |

If you only want to read your own company's data, you still need to set up an app — Intuit does not offer per-user API keys. There is no shortcut around the OAuth + app-creation flow.

### Sandbox Setup (recommended for first run)

1. Go to the [Intuit Developer Portal](https://developer.intuit.com/) and create a new app
2. Open the app → **Settings** (left sidebar) → **Redirect URIs** → add: `http://localhost:8000/callback`
3. Get your **Client ID** and **Client Secret** from the app's **Keys & Credentials** page (Development keys)
4. Create or use a sandbox company under the **Sandbox** top-level menu item in the dev portal
5. Set `QUICKBOOKS_ENVIRONMENT=sandbox` in your `.env`
6. Run `npm run auth` to complete the OAuth handshake — your browser will open, you sign in to the sandbox company, tokens are saved to `.env`

### Production Setup

The Intuit Developer Portal **rejects `http://localhost` redirect URIs in production mode** — every contributor hits this. Two known workarounds:

1. **ngrok tunnel (most common):** run `ngrok http 8000`, then on your Intuit app go to **Settings → Redirect URIs** and add the generated `https://<id>.ngrok-free.app/callback` URL. Use that URL for the OAuth handshake, then revert to localhost afterwards.
2. **Deploy a small public callback handler** (e.g., on a VPS or serverless function) that captures the auth code and hands it back to your local setup. More involved; only needed if you can't use ngrok.

After completing the production OAuth handshake, the refresh token is what matters — once it's in `.env`, you no longer need the public redirect URL for day-to-day use. Refresh tokens auto-rotate; the server persists the new token on each refresh.

### Once you have tokens

```env
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REFRESH_TOKEN=your_refresh_token
QUICKBOOKS_REALM_ID=your_realm_id
QUICKBOOKS_ENVIRONMENT=sandbox  # or 'production'
```

### Common pitfalls

- **`.env` loaded from the wrong directory.** The server resolves `.env` relative to the compiled module, not your shell's CWD. If you launch via Claude Desktop, this matters — make sure you're on current `main`.
- **Redirect URI mismatch.** The URI you register in the Intuit portal must match **exactly** — protocol, host, port, path. `http://localhost:8000/callback` .

---

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

The test suite includes **396 tests** with **100% code coverage** across all metrics (statements, branches, functions, lines).

### Project Structure

```
src/
├── clients/          # QuickBooks API client
├── handlers/         # Business logic handlers (87 files)
├── tools/           # MCP tool definitions
├── helpers/         # Utility functions
├── types/           # TypeScript types
└── index.ts         # Server entry point

tests/
├── unit/            # Unit tests (396 tests)
│   ├── handlers/    # Handler tests (15 test files)
│   └── helpers/     # Helper tests
└── mocks/           # Test mocks

docs/
├── ARCHITECTURE.md  # System architecture & design patterns
├── TESTING.md       # Testing guide & patterns
└── plans/           # Development plans
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](CHANGELOG.md) | Version history and all changes |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, patterns, and design decisions |
| [docs/TESTING.md](docs/TESTING.md) | Testing strategy, ESM patterns, and coverage guide |

---

## Error Handling

If you encounter connection errors:

1. Verify all environment variables are set correctly
2. Check that tokens are valid and not expired
3. Ensure the QuickBooks app has the correct redirect URIs
4. For sandbox testing, use `QUICKBOOKS_ENVIRONMENT=sandbox`

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Based on [Intuit's QuickBooks Online MCP Server](https://github.com/intuit/quickbooks-online-mcp-server)
- Built with the [Model Context Protocol](https://modelcontextprotocol.io/)
