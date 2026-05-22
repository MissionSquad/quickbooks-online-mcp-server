import { createQuickbooksBill } from "../handlers/create-quickbooks-bill.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "create-bill";
const toolDescription = "Create a bill in QuickBooks Online.";

const refSchema = z.object({
  value: z.string(),
  name: z.string().optional(),
});

const lineSchema = z.object({
  Amount: z.number(),
  DetailType: z.string(),
  Description: z.string().optional(),
  // Flat (legacy) — handler will auto-nest
  AccountRef: refSchema.optional(),
  // QBO-spec nested structure
  AccountBasedExpenseLineDetail: z.object({
    AccountRef: refSchema,
    BillableStatus: z.string().optional(),
    CustomerRef: refSchema.optional(),
    ClassRef: refSchema.optional(),
    TaxCodeRef: refSchema.optional(),
  }).optional(),
  ItemBasedExpenseLineDetail: z.object({
    ItemRef: refSchema,
    Qty: z.number().optional(),
    UnitPrice: z.number().optional(),
    BillableStatus: z.string().optional(),
    CustomerRef: refSchema.optional(),
  }).optional(),
}).passthrough();

// The "allow extra QBO fields" calls below are intentional and safe: they
// appear on the inner `bill` and `lineSchema` objects, never at the top
// level. Mission Squad hidden secrets are injected at the root of the tool
// arguments, so the wrapping `z.object({ params })` in RegisterTool routes
// them to extraArgs and strips them from `args` before this schema is parsed.
const toolSchema = z.object({
  bill: z.object({
    Line: z.array(lineSchema),
    VendorRef: refSchema,
    TxnDate: z.string().optional(),
    DueDate: z.string().optional(),
    DocNumber: z.string().optional(),
    PrivateNote: z.string().optional(),
    APAccountRef: refSchema.optional(),
    Balance: z.number().optional(),
    TotalAmt: z.number().optional(),
  }).passthrough(),
});

const toolHandler = async (args: { [x: string]: any }) => {
  const response = await createQuickbooksBill(args.params.bill);
  if (response.isError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error creating bill: ${response.error}`,
        },
      ],
    };
  }
  const bill = response.result;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(bill),
      }
    ],
  };
};

export const CreateBillTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};