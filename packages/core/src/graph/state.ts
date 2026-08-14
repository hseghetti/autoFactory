import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const CheckpointsSchema = z.object({
  plan_approved: z.boolean(),
  tests_passed: z.boolean(),
  // .default(false): added after STATE.json files already existed on disk
  // for in-progress projects — StateManager.load() parses those files
  // as-is, and a required field missing from old JSON would throw instead
  // of just picking up the sensible default.
  e2e_passed: z.boolean().default(false),
  security_approved: z.boolean(),
  deployed: z.boolean().default(false),
});

export const EngineKindSchema = z.enum(["cloud-cli", "local-cli", "local-http", "process"]);

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  node: z.string(),
  message: z.string(),
  // Observability metadata, populated for entries that represent an engine
  // call or subprocess run (see packages/core/src/observability). Absent on
  // plain informational log lines (checkpoints, routing decisions, etc).
  engine: EngineKindSchema.optional(),
  model: z.string().optional(),
  durationMs: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  costUsd: z.number().optional(),
  success: z.boolean().optional(),
});

export const FactoryStatusSchema = z.enum([
  "IDLE",
  "PLANNING",
  "AWAITING_APPROVAL",
  "ARCHITECTING",
  "TESTING",
  "HEALING",
  "DONE",
  "FAILED",
]);

export const TriageActionSchema = z.enum(["heal", "architect", "fail"]);

export const FactoryStateZod = z.object({
  current_step: z.number(),
  status: FactoryStatusSchema,
  active_target: z.string(),
  active_branch: z.string(),
  max_retries: z.number(),
  retry_count: z.number(),
  checkpoints: CheckpointsSchema,
  logs: z.array(LogEntrySchema),
  // Set by triageNode after a test/e2eTest failure, consumed by the graph's
  // conditional edge (routing) and by architectNode/healNode (prompt
  // content). Not a checkpoint — it's a routing hint, not a pass/fail gate.
  triage_action: TriageActionSchema.optional(),
  triage_instructions: z.string().optional(),
});

// Graph-typed state, built from the same field definitions used to
// validate .factory/STATE.json on disk (see packages/core/src/harness).
export const FactoryGraphState = new StateSchema(FactoryStateZod.shape);

export type FactoryState = z.infer<typeof FactoryStateZod>;
export type Checkpoints = z.infer<typeof CheckpointsSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type EngineKind = z.infer<typeof EngineKindSchema>;
export type FactoryStatus = z.infer<typeof FactoryStatusSchema>;
export type TriageAction = z.infer<typeof TriageActionSchema>;

export const INITIAL_STATE: FactoryState = {
  current_step: 1,
  status: "IDLE",
  active_target: "web",
  active_branch: "main",
  max_retries: 3,
  retry_count: 0,
  checkpoints: {
    plan_approved: false,
    tests_passed: false,
    e2e_passed: false,
    security_approved: false,
    deployed: false,
  },
  logs: [],
};
