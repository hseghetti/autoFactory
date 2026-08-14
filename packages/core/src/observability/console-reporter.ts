import chalk from "chalk";
import type { EngineKind, FactoryEvent, Reporter } from "./reporter.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const SPINNER_INTERVAL_MS = 100;
const ESC = String.fromCharCode(27);
const CLEAR_LINE = `${ESC}[K`;

interface CallRecord {
  node: string;
  engine: EngineKind;
  model: string;
  durationMs: number;
  success: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(tokensIn?: number, tokensOut?: number): string {
  if (tokensIn === undefined && tokensOut === undefined) return "-";
  return `${tokensIn ?? "?"} in / ${tokensOut ?? "?"} out`;
}

function formatCost(costUsd?: number): string {
  return costUsd === undefined ? "-" : `$${costUsd.toFixed(4)}`;
}

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");
}

/**
 * Prints live progress to the terminal as the graph runs, so a multi-minute
 * engine call (Claude Code CLI, a local Ollama model, `npm test`) never
 * looks like it hung. On a TTY it renders an in-place elapsed-time spinner;
 * on a non-TTY stream (piped output, CI logs) it falls back to periodic
 * heartbeat lines instead of carriage-return redraws.
 */
export class ConsoleReporter implements Reporter {
  private readonly calls: CallRecord[] = [];
  private graphStartedAt = 0;

  emit(event: FactoryEvent): void {
    switch (event.type) {
      case "graph_start":
        this.graphStartedAt = Date.now();
        console.log(chalk.cyan(`\n▶ Starting graph run (resuming from ${event.resumingFrom})\n`));
        break;
      case "node_end":
        console.log(chalk.dim(`  [${event.node}] step finished in ${formatDuration(event.durationMs)}`));
        break;
      case "engine_call_end": {
        const icon = event.success ? chalk.green("OK") : chalk.red("FAIL");
        const label = event.success ? "done" : "failed";
        const parts = [
          `${icon} [${event.node}] ${event.engine} · ${event.model} — ${label} in ${formatDuration(event.durationMs)}`,
          `tokens ${formatTokens(event.tokensIn, event.tokensOut)}`,
          `cost ${formatCost(event.costUsd)}`,
        ];
        console.log(parts.join(chalk.dim("  |  ")));
        if (!event.success && event.error) {
          console.log(chalk.red(`    ${event.error}`));
        }
        this.calls.push({
          node: event.node,
          engine: event.engine,
          model: event.model,
          durationMs: event.durationMs,
          success: event.success,
          tokensIn: event.tokensIn,
          tokensOut: event.tokensOut,
          costUsd: event.costUsd,
        });
        break;
      }
      case "graph_end":
        console.log(chalk.cyan(`\n■ Graph run reached status=${event.status} in ${formatDuration(event.durationMs)}`));
        break;
      default:
        break;
    }
  }

  startTicker(node: string, engine: EngineKind, model: string): () => void {
    const startedAt = Date.now();
    const prefix = `[${node}] ${engine} · ${model}`;

    if (process.stdout.isTTY) {
      let frame = 0;
      const interval = setInterval(() => {
        const elapsed = formatDuration(Date.now() - startedAt);
        const spinnerChar = ["-", "\\", "|", "/"][frame % 4];
        frame += 1;
        process.stdout.write(`\r${CLEAR_LINE}${chalk.yellow(spinnerChar)} ${prefix} — running (${elapsed})`);
      }, SPINNER_INTERVAL_MS);

      return () => {
        clearInterval(interval);
        process.stdout.write(`\r${CLEAR_LINE}`);
      };
    }

    console.log(chalk.yellow(`... ${prefix} - starting`));
    const interval = setInterval(() => {
      console.log(chalk.yellow(`... ${prefix} - still running (${formatDuration(Date.now() - startedAt)})`));
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }

  printSummary(): void {
    if (this.calls.length === 0) return;

    console.log(chalk.bold("\nRun summary"));

    const rows = this.calls.map((c) => [
      c.node,
      c.engine,
      c.model,
      formatDuration(c.durationMs),
      formatTokens(c.tokensIn, c.tokensOut),
      formatCost(c.costUsd),
      c.success ? chalk.green("ok") : chalk.red("failed"),
    ]);
    const header = ["node", "engine", "model", "duration", "tokens", "cost", ""];
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => stripAnsi(r[i]).length)));

    const printRow = (cells: string[]) =>
      console.log("  " + cells.map((c, i) => c + " ".repeat(widths[i] - stripAnsi(c).length)).join("  "));

    printRow(header.map((h) => chalk.dim(h)));
    for (const row of rows) printRow(row);

    const totalCost = this.calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0);
    const cloudCalls = this.calls.filter((c) => c.engine === "cloud-cli").length;
    const localCalls = this.calls.filter((c) => c.engine !== "cloud-cli" && c.engine !== "process").length;
    const wallTime = this.graphStartedAt ? Date.now() - this.graphStartedAt : undefined;

    console.log(
      chalk.dim(
        `\n  ${cloudCalls} cloud call(s), ${localCalls} local call(s)` +
          (totalCost > 0 ? `, total cloud cost ${formatCost(totalCost)}` : "") +
          (wallTime !== undefined ? `, wall time ${formatDuration(wallTime)}` : ""),
      ),
    );
  }
}
