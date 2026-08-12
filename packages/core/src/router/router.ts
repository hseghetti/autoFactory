import type { FactoryState } from "../graph/state.js";

export type EngineChoice = "cloud" | "local";

export type RoutedNodeType = "plan" | "architect" | "heal";

/**
 * Dynamic Model Router: decides cloud vs. local per node type. Planning and
 * self-healing loops run on local Ollama/OpenCode models (zero API cost);
 * architecture/high-reasoning steps run on the cloud engine (Claude Code CLI).
 */
export function selectEngine(nodeType: RoutedNodeType, _state: FactoryState): EngineChoice {
  switch (nodeType) {
    case "architect":
      return "cloud";
    case "plan":
    case "heal":
      return "local";
  }
}
