import { FastMCP } from "@missionsquad/fastmcp";
import { z } from "zod";

import { ToolDefinition } from "../types/tool-definition.js";
import { withQuickbooksFromContext } from "../clients/quickbooks-client.js";
import { QUICKBOOKS_SECRET_NAMES } from "./resolve-quickbooks-config.js";

/**
 * Bridge between the existing `ToolDefinition` shape (handlers expect
 * `{ params }` and resolve QuickBooks via the `quickbooksClient` proxy) and
 * FastMCP's `addTool` runtime contract.
 *
 * For each tool we:
 *  - Wrap the tool's zod schema in `z.object({ params })` to preserve the
 *    public input shape clients already use.
 *  - Resolve MissionSquad hidden secrets from `context.extraArgs` and bind a
 *    per-request QuickbooksClient via AsyncLocalStorage before the handler
 *    runs, so existing handlers can keep calling `quickbooksClient.*`
 *    without any per-handler changes.
 */
export function RegisterTool<T extends z.ZodType<any, any>>(
  server: FastMCP,
  toolDefinition: ToolDefinition<T>
): void {
  const wrappedSchema = z.object({ params: toolDefinition.schema });

  server.addTool({
    name: toolDefinition.name,
    description: toolDefinition.description,
    parameters: wrappedSchema,
    execute: async (args, context) => {
      // Defense-in-depth: the wrapping `z.object({ params })` already strips
      // unknown top-level keys, but explicitly deleting the known
      // hidden-secret names guarantees they cannot reach a handler even if a
      // future schema change ever opted into preserving unknown top-level keys.
      const safeArgs = { ...(args as Record<string, unknown>) };
      for (const key of QUICKBOOKS_SECRET_NAMES) {
        delete safeArgs[key];
      }

      return withQuickbooksFromContext(context.extraArgs, async () => {
        return toolDefinition.handler(
          safeArgs as { params: z.infer<T> },
          context
        );
      });
    },
  });
}
