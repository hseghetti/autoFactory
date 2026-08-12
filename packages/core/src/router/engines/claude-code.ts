import { execa } from "execa";

export interface ClaudeCodeResult {
  success: boolean;
  output: string;
  costUsd?: number;
  error?: string;
}

interface ClaudeCodeJsonResult {
  result?: string;
  total_cost_usd?: number;
}

/**
 * Invokes the Claude Code CLI in headless mode (`-p`) for high-reasoning
 * architecture/code-generation tasks. Requires `claude` on PATH and either
 * ANTHROPIC_API_KEY or a prior `claude login`.
 */
export async function callClaudeCode(params: {
  prompt: string;
  cwd: string;
  model?: string;
  allowedTools?: string;
}): Promise<ClaudeCodeResult> {
  const args = [
    "-p",
    "--bare",
    "--model",
    params.model ?? process.env.AUTOFACTORY_ARCHITECT_MODEL ?? "claude-sonnet-5",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "json",
  ];

  if (params.allowedTools) {
    args.push("--allowedTools", params.allowedTools);
  }

  args.push(params.prompt);

  try {
    const { stdout, exitCode } = await execa("claude", args, {
      cwd: params.cwd,
      reject: false,
    });

    if (exitCode !== 0) {
      return { success: false, output: stdout, error: `claude exited with code ${exitCode}` };
    }

    const parsed = JSON.parse(stdout) as ClaudeCodeJsonResult;
    return { success: true, output: parsed.result ?? stdout, costUsd: parsed.total_cost_usd };
  } catch (error) {
    if (isEnoent(error)) {
      return {
        success: false,
        output: "",
        error: "Claude Code CLI not found on PATH. Install with `npm install -g @anthropic-ai/claude-code`.",
      };
    }
    return { success: false, output: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
