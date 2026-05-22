import { z } from "zod";
import type { ContentResult, Context, TextContent, ImageContent } from "@missionsquad/fastmcp";

export type ToolHandlerResult =
  | string
  | ContentResult
  | TextContent
  | ImageContent;

export type ToolHandlerArgs<T extends z.ZodType<any, any>> = {
  params: z.infer<T>;
};

export type ToolHandler<T extends z.ZodType<any, any>> = (
  args: ToolHandlerArgs<T>,
  context: Context<undefined>
) => Promise<ToolHandlerResult> | ToolHandlerResult;

export interface ToolDefinition<T extends z.ZodType<any, any>> {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler<T>;
}
