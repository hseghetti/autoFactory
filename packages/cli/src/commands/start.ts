import { join } from "node:path";
import chalk from "chalk";
import { ConsoleReporter, StateManager, buildGraph } from "@autofactory/core";
import { runGraph } from "./run-graph.js";

export async function startCommand(targetDir: string, options: { revalidate?: boolean } = {}): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));
  let initialState = await stateManager.load();

  if (initialState.status === "DONE") {
    if (!options.revalidate) {
      // Idempotent by default: re-running `start` against an already-DONE
      // project must not silently redo `plan`/`architect` (real cost, real
      // time) just because START's routing has no dedicated case for DONE.
      console.log(
        chalk.yellow(
          "Already DONE — nothing to do. Pass --revalidate to re-run test/e2e/security/deploy " +
            "(e.g. after adding a new pipeline stage) without touching plan/architect.",
        ),
      );
      return;
    }
    console.log(chalk.cyan("Revalidating from `test` onward — plan/architect are left untouched.\n"));
    initialState = { ...initialState, status: "TESTING" };
    await stateManager.save(initialState);
  }

  const reporter = new ConsoleReporter();
  const graph = buildGraph({ projectRoot: targetDir, reporter });
  const finalState = await runGraph(graph, initialState, stateManager, reporter);

  reportFinalStatus(finalState.status);
}

export function reportFinalStatus(status: string): void {
  const color = status === "DONE" ? chalk.green : status === "FAILED" ? chalk.red : chalk.yellow;
  console.log(color(`\nGraph run ended with status: ${status}`));
}
