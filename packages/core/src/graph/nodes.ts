import { execa } from "execa";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NullReporter, type EngineKind, type Reporter } from "../observability/reporter.js";
import { callClaudeCode } from "../router/engines/claude-code.js";
import { callOllama } from "../router/engines/ollama.js";
import { callOpenCode } from "../router/engines/opencode.js";
import type { FactoryState } from "./state.js";

export interface FactoryContext {
  /** Root of the target project the graph operates on. */
  projectRoot: string;
  /** Sink for live progress events. Defaults to a silent no-op reporter. */
  reporter?: Reporter;
}

interface UsageInfo {
  engine?: EngineKind;
  model?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  success?: boolean;
}

function withLog(state: FactoryState, node: string, message: string, usage?: UsageInfo): FactoryState["logs"] {
  return [...state.logs, { timestamp: new Date().toISOString(), node, message, ...usage }];
}

async function withNodeTiming(
  reporter: Reporter,
  node: string,
  fn: () => Promise<Partial<FactoryState>>,
): Promise<Partial<FactoryState>> {
  reporter.emit({ type: "node_start", node, timestamp: new Date().toISOString() });
  const startedAt = Date.now();
  const result = await fn();
  reporter.emit({ type: "node_end", node, timestamp: new Date().toISOString(), durationMs: Date.now() - startedAt });
  return result;
}

const MAX_DIFF_CHARS = 6000;

/**
 * Diff of everything changed in the working tree, for the advisory
 * inspect/securityCheck passes. Two things make plain `git diff --stat`
 * unreliable here: (1) newly created files are untracked, and `git diff`
 * never shows untracked files at all — `-A -N` (intent-to-add) marks their
 * paths without staging real content, so they show up as additions; (2) a
 * security review that only sees `--stat` (filenames + line counts) can
 * never actually spot a hardcoded secret, since it never sees any code —
 * so this returns the real diff body, capped to fit a local model's
 * context window, not just the stat summary.
 */
async function getWorkingDiff(projectRoot: string): Promise<string> {
  await execa("git", ["add", "-A", "-N"], { cwd: projectRoot, reject: false });

  const diff = await execa("git", ["diff"], { cwd: projectRoot, reject: false })
    .then((r) => r.stdout)
    .catch(() => "");

  if (!diff.trim()) return "(no changes detected in the working tree)";
  if (diff.length <= MAX_DIFF_CHARS) return diff;
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n... (diff truncated, ${diff.length - MAX_DIFF_CHARS} more characters)`;
}

interface EngineCallLike {
  success: boolean;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  error?: string;
}

/**
 * Wraps a single engine/subprocess call with start/end progress events and
 * a live "still running" ticker, so a slow call (Claude Code CLI, a local
 * Ollama model, `npm test`) is always visibly in-flight rather than silent.
 */
async function runEngineCall<T extends EngineCallLike>(
  reporter: Reporter,
  node: string,
  engine: EngineKind,
  model: string,
  fn: () => Promise<T>,
): Promise<T & { durationMs: number }> {
  reporter.emit({ type: "engine_call_start", node, engine, model, timestamp: new Date().toISOString() });
  const startedAt = Date.now();
  const stopTicker = reporter.startTicker?.(node, engine, model);

  const result = await fn();
  stopTicker?.();
  const durationMs = result.durationMs ?? Date.now() - startedAt;

  reporter.emit({
    type: "engine_call_end",
    node,
    engine,
    model,
    timestamp: new Date().toISOString(),
    durationMs,
    success: result.success,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    error: result.error,
  });

  return { ...result, durationMs };
}

export function createNodes(ctx: FactoryContext) {
  const briefPath = join(ctx.projectRoot, ".factory", "BRIEF.md");
  const planPath = join(ctx.projectRoot, ".factory", "PLAN.md");
  const uxWireframesPath = join(ctx.projectRoot, ".factory", "UX_WIREFRAMES.md");
  const reporter = ctx.reporter ?? NullReporter;

  async function planNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "plan", async () => {
      const brief = await readFile(briefPath, "utf-8").catch(() => "");
      const uxWireframes = await readFile(uxWireframesPath, "utf-8").catch(() => "");
      const model = process.env.AUTOFACTORY_PLAN_MODEL ?? "deepseek-r1:14b";

      const result = await runEngineCall(reporter, "plan", "local-http", model, () =>
        callOllama({
          model,
          prompt:
            "You are a software delivery planner. Based on this product brief, write an " +
            "atomized execution plan in Markdown with numbered tasks, each including " +
            `Target, Spec, and Test Contract.\n\nBRIEF:\n${brief}` +
            (uxWireframes.trim() ? `\n\nUX WIREFRAMES / COMPONENT HIERARCHY:\n${uxWireframes}` : ""),
        }),
      );

      if (result.success && result.text.trim()) {
        await writeFile(planPath, result.text, "utf-8");
      }

      return {
        status: "AWAITING_APPROVAL",
        logs: withLog(
          state,
          "plan",
          result.success ? `Generated plan draft via ${model}.` : `Planning failed: ${result.error}`,
          {
            engine: "local-http",
            model,
            durationMs: result.durationMs,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            success: result.success,
          },
        ),
      };
    });
  }

  async function humanCheckpointNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "humanCheckpoint", async () => {
      if (state.checkpoints.plan_approved) {
        return { logs: withLog(state, "humanCheckpoint", "Plan already approved, continuing to architect.") };
      }
      return {
        status: "AWAITING_APPROVAL",
        logs: withLog(
          state,
          "humanCheckpoint",
          "Paused for human approval. Review .factory/PLAN.md, then run `factory:resume`.",
        ),
      };
    });
  }

  async function architectNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "architect", async () => {
      const plan = await readFile(planPath, "utf-8").catch(() => "");
      const model = process.env.AUTOFACTORY_ARCHITECT_MODEL ?? "claude-sonnet-5";

      const result = await runEngineCall(reporter, "architect", "cloud-cli", model, () =>
        callClaudeCode({
          cwd: ctx.projectRoot,
          model,
          prompt:
            `Implement the following execution plan for target "${state.active_target}". ` +
            `Follow each task's Spec and satisfy its Test Contract.\n\n${plan}`,
          allowedTools: "Read,Edit,Write,Bash(npm *),Bash(git *)",
        }),
      );

      return {
        // A failed architecture pass means nothing changed in the target
        // project — running inspect/test/heal against it next would just
        // waste a heal loop "fixing" a project that was never touched.
        status: result.success ? "TESTING" : "FAILED",
        logs: withLog(
          state,
          "architect",
          result.success
            ? `Claude Code CLI response: ${result.output.trim().slice(0, 800)}`
            : `Claude Code CLI failed: ${result.error}`,
          {
            engine: "cloud-cli",
            model,
            durationMs: result.durationMs,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            costUsd: result.costUsd,
            success: result.success,
          },
        ),
      };
    });
  }

  async function inspectNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "inspect", async () => {
      const model = process.env.AUTOFACTORY_INSPECT_MODEL ?? "qwen2.5-coder:32b";
      const diff = await getWorkingDiff(ctx.projectRoot);

      const result = await runEngineCall(reporter, "inspect", "local-http", model, () =>
        callOllama({
          model,
          prompt:
            "You are a local code inspector that runs after an architecture pass and before the " +
            "test suite. Review this diff and flag anything obviously wrong (missing files, " +
            "unrelated changes, likely broken imports). Be brief — this is advisory, not " +
            `blocking.\n\nDIFF:\n${diff}`,
        }),
      );

      return {
        logs: withLog(
          state,
          "inspect",
          result.success
            ? `Inspection notes via ${model}: ${result.text.trim().slice(0, 500)}`
            : `Inspection skipped: ${result.error}`,
          {
            engine: "local-http",
            model,
            durationMs: result.durationMs,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            success: result.success,
          },
        ),
      };
    });
  }

  async function testNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "test", async () => {
      const testCommand = "npm test";

      const result = await runEngineCall(reporter, "test", "process", testCommand, async () => {
        try {
          const { exitCode, stdout, stderr } = await execa("npm", ["test"], {
            cwd: ctx.projectRoot,
            reject: false,
          });
          return { success: exitCode === 0, exitCode, stdout, stderr };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            stdout: "",
            stderr: "",
          };
        }
      });

      const passed = result.success;
      const message = passed
        ? "Tests passed."
        : result.error
          ? `Could not run tests: ${result.error}`
          : `Tests failed: ${result.stderr || result.stdout}`;

      return {
        status: passed ? "DONE" : "HEALING",
        checkpoints: { ...state.checkpoints, tests_passed: passed },
        logs: withLog(state, "test", message.slice(0, 2000), {
          engine: "process",
          model: testCommand,
          durationMs: result.durationMs,
          success: passed,
        }),
      };
    });
  }

  async function securityCheckNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "securityCheck", async () => {
      const model = process.env.AUTOFACTORY_SECURITY_MODEL ?? "qwen2.5-coder:32b";
      const diff = await getWorkingDiff(ctx.projectRoot);

      const result = await runEngineCall(reporter, "securityCheck", "local-http", model, () =>
        callOllama({
          model,
          prompt:
            "You are a local security reviewer that runs after tests pass and before a change is " +
            "finalized. Review this diff and flag anything that looks like a hardcoded secret, " +
            "credential, or an obviously dangerous command (e.g. unrestricted rm, curl|sh). " +
            `Be brief — this is advisory, not blocking.\n\nDIFF:\n${diff}`,
        }),
      );

      return {
        checkpoints: { ...state.checkpoints, security_approved: true },
        logs: withLog(
          state,
          "securityCheck",
          result.success
            ? `Security review notes via ${model}: ${result.text.trim().slice(0, 500)}`
            : `Security review skipped: ${result.error}`,
          {
            engine: "local-http",
            model,
            durationMs: result.durationMs,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            success: result.success,
          },
        ),
      };
    });
  }

  async function healNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "heal", async () => {
      const model = process.env.AUTOFACTORY_HEAL_MODEL ?? "hermes3:8b";
      const nextRetryCount = state.retry_count + 1;

      const result = await runEngineCall(reporter, "heal", "local-cli", model, () =>
        callOpenCode({
          cwd: ctx.projectRoot,
          model: `ollama/${model}`,
          prompt: "The test suite is failing. Inspect the failing tests and source, then fix the code so all tests pass.",
        }),
      );

      return {
        retry_count: nextRetryCount,
        status: "TESTING",
        logs: withLog(
          state,
          "heal",
          result.success
            ? `OpenCode self-heal attempt ${nextRetryCount} completed.`
            : `Self-heal attempt ${nextRetryCount} failed: ${result.error}`,
          { engine: "local-cli", model, durationMs: result.durationMs, success: result.success },
        ),
      };
    });
  }

  async function finalizeNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "finalize", async () => ({
      status: "DONE",
      logs: withLog(state, "finalize", "Graph run finished successfully."),
    }));
  }

  async function failNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return withNodeTiming(reporter, "fail", async () => {
      const reason =
        state.status === "FAILED"
          ? "architect step failed (see the preceding log entry)"
          : `exceeded max_retries (${state.max_retries})`;
      return {
        status: "FAILED",
        logs: withLog(state, "fail", `Graph run failed: ${reason}. Manual intervention required.`),
      };
    });
  }

  return {
    planNode,
    humanCheckpointNode,
    architectNode,
    inspectNode,
    testNode,
    securityCheckNode,
    healNode,
    finalizeNode,
    failNode,
  };
}
