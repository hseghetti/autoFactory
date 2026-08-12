import { END, START, StateGraph } from "@langchain/langgraph";
import { createNodes, type FactoryContext } from "./nodes.js";
import { FactoryGraphState, type FactoryState } from "./state.js";

/**
 * Builds the AutoFactory StateGraph. STATE.json (loaded/saved by
 * StateManager, outside the graph) is the source of truth for resume: the
 * entry router inspects `status` to decide where a run picks back up,
 * instead of relying on LangGraph's own checkpointer/interrupt machinery.
 */
export function buildGraph(ctx: FactoryContext) {
  const nodes = createNodes(ctx);

  return new StateGraph(FactoryGraphState)
    .addNode("plan", nodes.planNode)
    .addNode("humanCheckpoint", nodes.humanCheckpointNode)
    .addNode("architect", nodes.architectNode)
    .addNode("inspect", nodes.inspectNode)
    .addNode("test", nodes.testNode)
    .addNode("heal", nodes.healNode)
    .addNode("finalize", nodes.finalizeNode)
    .addNode("fail", nodes.failNode)
    .addConditionalEdges(START, (state: FactoryState) => {
      switch (state.status) {
        case "AWAITING_APPROVAL":
          return "humanCheckpoint";
        case "HEALING":
          return "heal";
        case "TESTING":
          return "test";
        default:
          return "plan";
      }
    })
    .addEdge("plan", "humanCheckpoint")
    .addConditionalEdges("humanCheckpoint", (state: FactoryState) =>
      state.checkpoints.plan_approved ? "architect" : END,
    )
    .addEdge("architect", "inspect")
    .addEdge("inspect", "test")
    .addConditionalEdges("test", (state: FactoryState) => {
      if (state.checkpoints.tests_passed) return "finalize";
      if (state.retry_count >= state.max_retries) return "fail";
      return "heal";
    })
    .addEdge("heal", "test")
    .addEdge("finalize", END)
    .addEdge("fail", END)
    .compile();
}
