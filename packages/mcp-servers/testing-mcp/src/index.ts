#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execa } from "execa";
import { z } from "zod";

const server = new McpServer({ name: "autofactory-testing-mcp", version: "0.1.0" });

server.registerTool(
  "run_tests",
  {
    title: "Run tests",
    description: "Runs the test command for a target project directory and returns pass/fail with output.",
    inputSchema: {
      cwd: z.string().describe("Absolute path to the project directory to test."),
      command: z.string().default("npm test").describe("Test command to run, e.g. \"npm test\"."),
    },
  },
  async ({ cwd, command }) => {
    const [bin, ...args] = command.split(" ");
    const { exitCode, stdout, stderr } = await execa(bin, args, { cwd, reject: false });
    const passed = exitCode === 0;

    return {
      content: [
        {
          type: "text",
          text: `${passed ? "PASS" : "FAIL"} (exit ${exitCode})\n\n${stdout}${stderr ? `\n\nstderr:\n${stderr}` : ""}`,
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("testing-mcp failed to start:", error);
  process.exit(1);
});
