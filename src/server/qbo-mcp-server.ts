import { FastMCP } from "@missionsquad/fastmcp";

const SERVER_NAME = "QuickBooks Online MCP Server";
const SERVER_VERSION = "0.1.0" as const;

export class QuickbooksMCPServer {
  private static instance: FastMCP | null = null;

  private constructor() {}

  public static GetServer(): FastMCP {
    if (QuickbooksMCPServer.instance === null) {
      QuickbooksMCPServer.instance = new FastMCP({
        name: SERVER_NAME,
        version: SERVER_VERSION,
      });
    }
    return QuickbooksMCPServer.instance;
  }
}
