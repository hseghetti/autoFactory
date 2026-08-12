import { execa } from "execa";

export interface OpenCodeResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Invokes the OpenCode CLI in headless mode (`run`) against a local model,
 * used for zero-cost self-healing loops (test/lint fixes). The Ollama
 * provider itself is configured once in ~/.config/opencode/opencode.json —
 * see README for that one-time setup step.
 *
 * OpenCode's `--format json` currently emits a raw event stream rather than
 * a single JSON object, so we surface stdout as-is instead of parsing it.
 */
export async function callOpenCode(params: {
  prompt: string;
  cwd: string;
  model?: string;
}): Promise<OpenCodeResult> {
  const args = ["run", "--format", "json", "--dir", params.cwd, "--auto"];

  if (params.model) {
    args.push("--model", params.model);
  }

  args.push(params.prompt);

  try {
    const { stdout, exitCode } = await execa("opencode", args, {
      cwd: params.cwd,
      reject: false,
    });

    if (exitCode !== 0) {
      return { success: false, output: stdout, error: `opencode exited with code ${exitCode}` };
    }

    return { success: true, output: stdout };
  } catch (error) {
    if (isEnoent(error)) {
      return {
        success: false,
        output: "",
        error: "OpenCode CLI not found on PATH. Install with `npm install -g opencode-ai`.",
      };
    }
    return { success: false, output: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
