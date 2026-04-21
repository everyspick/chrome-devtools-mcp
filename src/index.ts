#!/usr/bin/env node
/**
 * Chrome DevTools MCP Server
 * 
 * A Model Context Protocol (MCP) server that provides Chrome DevTools
 * capabilities to AI assistants, enabling browser automation, debugging,
 * and web inspection through a standardized interface.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromeDevToolsClient } from './chrome-client.js';
import { tools } from './tools/index.js';

/** Default Chrome debugging port */
const DEFAULT_DEBUG_PORT = 9222;

/** Default Chrome debugging host */
const DEFAULT_DEBUG_HOST = 'localhost';

async function main(): Promise<void> {
  const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? String(DEFAULT_DEBUG_PORT), 10);
  const debugHost = process.env.CHROME_DEBUG_HOST ?? DEFAULT_DEBUG_HOST;

  const chromeClient = new ChromeDevToolsClient({
    host: debugHost,
    port: debugPort,
  });

  const server = new Server(
    {
      name: 'chrome-devtools-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolDefinitions: Tool[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return { tools: toolDefinitions };
  });

  // Register tool execution handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const result = await tool.execute(chromeClient, args ?? {});
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool '${name}': ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup info to stderr (stdout is reserved for MCP protocol)
  process.stderr.write(
    `Chrome DevTools MCP server started. Connecting to Chrome at ${debugHost}:${debugPort}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
