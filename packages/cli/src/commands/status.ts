import { join } from "node:path";
import chalk from "chalk";
import { StateManager, type FactoryState } from "@autofactory/core";

const POLL_INTERVAL_MS = 2000;

export async function statusCommand(targetDir: string, options: { watch?: boolean } = {}): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));

  if (options.watch) {
    await watchStatus(stateManager);
    return;
  }

  printStatus(await stateManager.load());
}

async function watchStatus(stateManager: StateManager): Promise<void> {
  console.log(chalk.dim("Watching .factory/STATE.json every 2s — Ctrl+C to stop.\n"));

  return new Promise((resolve) => {
    let lastLogCount = -1;

    const tick = async () => {
      const state = await stateManager.load();
      if (state.logs.length !== lastLogCount) {
        console.clear();
        console.log(chalk.dim("Watching .factory/STATE.json every 2s — Ctrl+C to stop.\n"));
        printStatus(state);
        lastLogCount = state.logs.length;
      }
      if (state.status === "DONE" || state.status === "FAILED") {
        clearInterval(interval);
        resolve();
      }
    };

    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
  });
}

function printStatus(state: FactoryState): void {
  const color = state.status === "DONE" ? chalk.green : state.status === "FAILED" ? chalk.red : chalk.yellow;

  console.log(chalk.bold("AutoFactory status"));
  console.log(`  status:        ${color(state.status)}`);
  console.log(`  active_target: ${state.active_target}`);
  console.log(`  current_step:  ${state.current_step}`);
  console.log(`  retry_count:   ${state.retry_count}/${state.max_retries}`);
  console.log(`  checkpoints:   ${JSON.stringify(state.checkpoints)}`);
  console.log(`  logs:          ${state.logs.length} entries`);

  const usageLogs = state.logs.filter((entry) => entry.engine !== undefined);
  if (usageLogs.length > 0) {
    const totalCost = usageLogs.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
    const cloudCalls = usageLogs.filter((entry) => entry.engine === "cloud-cli").length;
    const localCalls = usageLogs.filter((entry) => entry.engine === "local-http" || entry.engine === "local-cli").length;
    console.log(
      `  usage so far:  ${cloudCalls} cloud call(s), ${localCalls} local call(s)` +
        (totalCost > 0 ? `, cloud cost $${totalCost.toFixed(4)}` : ""),
    );
  }

  if (state.logs.length === 0) return;

  console.log(chalk.bold("\nRecent activity"));
  for (const entry of state.logs.slice(-10)) {
    const time = chalk.dim(entry.timestamp.slice(11, 19));
    const tag = entry.engine ? chalk.dim(` [${entry.engine}${entry.model ? ` · ${entry.model}` : ""}]`) : "";
    const duration = entry.durationMs !== undefined ? chalk.dim(` (${formatDuration(entry.durationMs)})`) : "";
    const outcome = entry.success === false ? chalk.red(" FAILED") : "";
    console.log(`  ${time} [${entry.node}]${tag}${duration}${outcome} ${entry.message.slice(0, 120)}`);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
