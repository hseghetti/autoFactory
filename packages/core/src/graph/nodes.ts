import { execa } from "execa";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { callClaudeCode } from "../router/engines/claude-code.js";
import { callOllama } from "../router/engines/ollama.js";
import { callOpenCode } from "../router/engines/opencode.js";
import type { FactoryState } from "./state.js";

export interface FactoryContext {
  /** Root of the target project the graph operates on. */
  projectRoot: string;
}

function withLog(state: FactoryState, node: string, message: string): FactoryState["logs"] {
  return [...state.logs, { timestamp: new Date().toISOString(), node, message }];
}

export function createNodes(ctx: FactoryContext) {
  const briefPath = join(ctx.projectRoot, ".factory", "BRIEF.md");
  const planPath = join(ctx.projectRoot, ".factory", "PLAN.md");

  async function planNode(state: FactoryState): Promise<Partial<FactoryState>> {
    const brief = await readFile(briefPath, "utf-8").catch(() => "");
    const model = process.env.AUTOFACTORY_PLAN_MODEL ?? "deepseek-r1:14b";

    const result = await callOllama({
      model,
      prompt:
        "You are a software delivery planner. Based on this product brief, write an " +
        "atomized execution plan in Markdown with numbered tasks, each including " +
        `Target, Spec, and Test Contract.\n\nBRIEF:\n${brief}`,
    });

    if (result.success && result.text.trim()) {
      await writeFile(planPath, result.text, "utf-8");
    }

    return {
      status: "AWAITING_APPROVAL",
      logs: withLog(
        state,
        "planNode",
        result.success ? `Generated plan draft via ${model}.` : `Planning failed: ${result.error}`,
      ),
    };
  }

  async function humanCheckpointNode(state: FactoryState): Promise<Partial<FactoryState>> {
    if (state.checkpoints.plan_approved) {
      return { logs: withLog(state, "humanCheckpointNode", "Plan already approved, continuing to architect.") };
    }
    return {
      status: "AWAITING_APPROVAL",
      logs: withLog(
        state,
        "humanCheckpointNode",
        "Paused for human approval. Review .factory/PLAN.md, then run `factory:resume`.",
      ),
    };
  }

  async function architectNode(state: FactoryState): Promise<Partial<FactoryState>> {
    const plan = await readFile(planPath, "utf-8").catch(() => "");

    const result = await callClaudeCode({
      cwd: ctx.projectRoot,
      prompt:
        `Implement the following execution plan for target "${state.active_target}". ` +
        `Follow each task's Spec and satisfy its Test Contract.\n\n${plan}`,
      allowedTools: "Read,Edit,Write,Bash(npm *),Bash(git *)",
    });

    return {
      status: "TESTING",
      logs: withLog(
        state,
        "architectNode",
        result.success ? "Claude Code CLI completed the architecture pass." : `Claude Code CLI failed: ${result.error}`,
      ),
    };
  }

  async function testNode(state: FactoryState): Promise<Partial<FactoryState>> {
    try {
      const { exitCode, stdout, stderr } = await execa("npm", ["test"], {
        cwd: ctx.projectRoot,
        reject: false,
      });
      const passed = exitCode === 0;

      return {
        status: passed ? "DONE" : "HEALING",
        checkpoints: { ...state.checkpoints, tests_passed: passed },
        logs: withLog(
          state,
          "testNode",
          (passed ? "Tests passed." : `Tests failed (exit ${exitCode}): ${stderr || stdout}`).slice(0, 2000),
        ),
      };
    } catch (error) {
      return {
        status: "HEALING",
        logs: withLog(state, "testNode", `Could not run tests: ${error instanceof Error ? error.message : error}`),
      };
    }
  }

  async function healNode(state: FactoryState): Promise<Partial<FactoryState>> {
    const model = process.env.AUTOFACTORY_HEAL_MODEL ?? "hermes3:36b";
    const nextRetryCount = state.retry_count + 1;

    const result = await callOpenCode({
      cwd: ctx.projectRoot,
      model: `ollama/${model}`,
      prompt: "The test suite is failing. Inspect the failing tests and source, then fix the code so all tests pass.",
    });

    return {
      retry_count: nextRetryCount,
      status: "TESTING",
      logs: withLog(
        state,
        "healNode",
        result.success
          ? `OpenCode self-heal attempt ${nextRetryCount} completed.`
          : `Self-heal attempt ${nextRetryCount} failed: ${result.error}`,
      ),
    };
  }

  async function finalizeNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return {
      status: "DONE",
      logs: withLog(state, "finalizeNode", "Graph run finished successfully."),
    };
  }

  async function failNode(state: FactoryState): Promise<Partial<FactoryState>> {
    return {
      status: "FAILED",
      logs: withLog(
        state,
        "failNode",
        `Exceeded max_retries (${state.max_retries}); manual intervention required.`,
      ),
    };
  }

  return { planNode, humanCheckpointNode, architectNode, testNode, healNode, finalizeNode, failNode };
}
