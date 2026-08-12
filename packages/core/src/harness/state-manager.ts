import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { FactoryStateZod, INITIAL_STATE, type Checkpoints, type FactoryState, type LogEntry } from "../graph/state.js";

/**
 * Single source of truth for reading/writing .factory/STATE.json — the
 * "Graph State Engine & Checkpoint Manager" described in the spec. Nodes
 * return partial state updates to LangGraph; the CLI commands load the
 * initial state from disk and persist the graph's final state back here.
 */
export class StateManager {
  constructor(private readonly statePath: string) {}

  async load(): Promise<FactoryState> {
    try {
      const raw = await readFile(this.statePath, "utf-8");
      return FactoryStateZod.parse(JSON.parse(raw));
    } catch (error) {
      if (isEnoent(error)) {
        await this.save(INITIAL_STATE);
        return INITIAL_STATE;
      }
      throw error;
    }
  }

  async save(state: FactoryState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  }

  async appendLog(state: FactoryState, node: string, message: string): Promise<FactoryState> {
    const entry: LogEntry = { timestamp: new Date().toISOString(), node, message };
    const next: FactoryState = { ...state, logs: [...state.logs, entry] };
    await this.save(next);
    return next;
  }

  async setCheckpoint(state: FactoryState, checkpoint: keyof Checkpoints, value: boolean): Promise<FactoryState> {
    const next: FactoryState = { ...state, checkpoints: { ...state.checkpoints, [checkpoint]: value } };
    await this.save(next);
    return next;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
