import { execa } from "execa";

export interface ClaudeCodeResult {
  success: boolean;
  output: string;
  costUsd?: number;
  error?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

interface ClaudeCodeJsonResult {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
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
  const args = ["-p"];

  // --bare restricts auth to ANTHROPIC_API_KEY/apiKeyHelper and never reads
  // the OAuth session created by `claude login` (see `claude --help`). Only
  // use it when an API key is actually configured, so the documented
  // `claude login` path (no ANTHROPIC_API_KEY) keeps working.
  if (process.env.ANTHROPIC_API_KEY) {
    args.push("--bare");
  }

  args.push(
    "--model",
    params.model ?? process.env.AUTOFACTORY_ARCHITECT_MODEL ?? "claude-sonnet-5",
    "--permission-mode",
    "acceptEdits",
    "--output-format",
    "json",
  );

  if (params.allowedTools) {
    args.push("--allowedTools", params.allowedTools);
  }

  args.push(params.prompt);

  try {
    const { stdout, stderr, exitCode } = await execa("claude", args, {
      cwd: params.cwd,
      reject: false,
    });

    if (exitCode !== 0) {
      // Claude Code CLI reports failures (auth errors, API errors) as JSON
      // on stdout with is_error:true — not on stderr — so parse it first
      // and only fall back to raw output if that JSON isn't there.
      const parsedError = tryParseJson(stdout);
      const detail = parsedError?.result || stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
      return { success: false, output: stdout, error: `claude failed: ${detail}` };
    }

    const parsed = JSON.parse(stdout) as ClaudeCodeJsonResult;
    return {
      success: true,
      output: parsed.result ?? stdout,
      costUsd: parsed.total_cost_usd,
      durationMs: parsed.duration_ms,
      tokensIn: parsed.usage?.input_tokens,
      tokensOut: parsed.usage?.output_tokens,
    };
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

function tryParseJson(raw: string): ClaudeCodeJsonResult | undefined {
  try {
    return JSON.parse(raw) as ClaudeCodeJsonResult;
  } catch {
    return undefined;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
