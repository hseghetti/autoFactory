import { join } from "node:path";
import chalk from "chalk";
import { ConsoleReporter, StateManager, buildGraph } from "@autofactory/core";
import { runGraph } from "./run-graph.js";

export async function startCommand(targetDir: string): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));
  const initialState = await stateManager.load();

  const reporter = new ConsoleReporter();
  const graph = buildGraph({ projectRoot: targetDir, reporter });
  const finalState = await runGraph(graph, initialState, stateManager, reporter);

  reportFinalStatus(finalState.status);
}

export function reportFinalStatus(status: string): void {
  const color = status === "DONE" ? chalk.green : status === "FAILED" ? chalk.red : chalk.yellow;
  console.log(color(`\nGraph run ended with status: ${status}`));
}
