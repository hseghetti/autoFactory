import type { buildGraph, ConsoleReporter, FactoryState, StateManager } from "@autofactory/core";

/**
 * Runs the compiled graph via `.stream(..., { streamMode: "values" })`
 * instead of `.invoke()`, persisting `.factory/STATE.json` after every node
 * instead of only once at the end. This is what makes `autofactory status`
 * (run from another terminal) reflect real progress instead of going stale
 * for the whole duration of a run, and means a killed/crashed process still
 * leaves behind the state of the last node that actually finished.
 */
export async function runGraph(
  graph: ReturnType<typeof buildGraph>,
  initialState: FactoryState,
  stateManager: StateManager,
  reporter: ConsoleReporter,
): Promise<FactoryState> {
  const startedAt = Date.now();
  reporter.emit({ type: "graph_start", timestamp: new Date().toISOString(), resumingFrom: initialState.status });

  let finalState = initialState;
  for await (const stateChunk of await graph.stream(initialState, { streamMode: "values" })) {
    finalState = stateChunk as FactoryState;
    await stateManager.save(finalState);
  }

  reporter.emit({
    type: "graph_end",
    timestamp: new Date().toISOString(),
    status: finalState.status,
    durationMs: Date.now() - startedAt,
  });
  reporter.printSummary();

  return finalState;
}
