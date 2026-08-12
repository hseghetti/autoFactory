import { join } from "node:path";
import chalk from "chalk";
import { StateManager, buildGraph } from "@autofactory/core";

export async function startCommand(targetDir: string): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));
  const initialState = await stateManager.load();

  console.log(chalk.cyan(`Starting graph from status=${initialState.status}...`));

  const graph = buildGraph({ projectRoot: targetDir });
  const finalState = await graph.invoke(initialState);

  await stateManager.save(finalState);
  reportFinalStatus(finalState.status);
}

export function reportFinalStatus(status: string): void {
  const color = status === "DONE" ? chalk.green : status === "FAILED" ? chalk.red : chalk.yellow;
  console.log(color(`\nGraph run ended with status: ${status}`));
}
