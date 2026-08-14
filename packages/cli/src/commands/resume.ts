import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import chalk from "chalk";
import { ConsoleReporter, StateManager, buildGraph } from "@autofactory/core";
import { reportFinalStatus } from "./start.js";
import { runGraph } from "./run-graph.js";

export async function resumeCommand(targetDir: string): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));
  let state = await stateManager.load();

  if (state.status !== "AWAITING_APPROVAL") {
    console.log(chalk.yellow(`Nothing to resume (status=${state.status}).`));
    return;
  }

  if (!state.checkpoints.plan_approved) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Approve .factory/PLAN.md and continue? (y/N) ");
    rl.close();

    if (answer.trim().toLowerCase() !== "y") {
      console.log(chalk.yellow("Not approved. Run `factory:resume` again once ready."));
      return;
    }

    state = await stateManager.setCheckpoint(state, "plan_approved", true);
  }

  const reporter = new ConsoleReporter();
  const graph = buildGraph({ projectRoot: targetDir, reporter });
  const finalState = await runGraph(graph, state, stateManager, reporter);

  reportFinalStatus(finalState.status);
}
