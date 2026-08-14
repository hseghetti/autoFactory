import type { EngineKind } from "../graph/state.js";

export type { EngineKind };

export type FactoryEvent =
  | { type: "graph_start"; timestamp: string; resumingFrom: string }
  | { type: "graph_end"; timestamp: string; status: string; durationMs: number }
  | { type: "node_start"; node: string; timestamp: string }
  | { type: "node_end"; node: string; timestamp: string; durationMs: number }
  | { type: "engine_call_start"; node: string; engine: EngineKind; model: string; timestamp: string }
  | {
      type: "engine_call_end";
      node: string;
      engine: EngineKind;
      model: string;
      timestamp: string;
      durationMs: number;
      success: boolean;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
      error?: string;
    };

/**
 * Sink for live progress events emitted while the graph runs. Nodes call
 * this instead of talking to the console directly, so the same event
 * stream can drive a TTY reporter, a quiet/CI-friendly one, or (in tests)
 * a no-op.
 */
export interface Reporter {
  emit(event: FactoryEvent): void;
  /** Optional: start a live "still running" indicator; call the result to stop it. */
  startTicker?(node: string, engine: EngineKind, model: string): () => void;
  /** Optional: print an aggregated end-of-run summary. */
  printSummary?(): void;
}

export const NullReporter: Reporter = {
  emit() {
    // no-op
  },
};
