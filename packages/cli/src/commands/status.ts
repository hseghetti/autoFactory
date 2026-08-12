import { join } from "node:path";
import chalk from "chalk";
import { StateManager } from "@autofactory/core";

export async function statusCommand(targetDir: string): Promise<void> {
  const stateManager = new StateManager(join(targetDir, ".factory", "STATE.json"));
  const state = await stateManager.load();

  console.log(chalk.bold("AutoFactory status"));
  console.log(`  status:        ${state.status}`);
  console.log(`  active_target: ${state.active_target}`);
  console.log(`  current_step:  ${state.current_step}`);
  console.log(`  retry_count:   ${state.retry_count}/${state.max_retries}`);
  console.log(`  checkpoints:   ${JSON.stringify(state.checkpoints)}`);
  console.log(`  logs:          ${state.logs.length} entries`);

  if (state.logs.length > 0) {
    const last = state.logs[state.logs.length - 1];
    console.log(`  last log:      [${last.node}] ${last.message}`);
  }
}
