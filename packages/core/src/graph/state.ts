import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const CheckpointsSchema = z.object({
  plan_approved: z.boolean(),
  tests_passed: z.boolean(),
  security_approved: z.boolean(),
});

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  node: z.string(),
  message: z.string(),
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

export const FactoryStateZod = z.object({
  current_step: z.number(),
  status: FactoryStatusSchema,
  active_target: z.string(),
  active_branch: z.string(),
  max_retries: z.number(),
  retry_count: z.number(),
  checkpoints: CheckpointsSchema,
  logs: z.array(LogEntrySchema),
});

// Graph-typed state, built from the same field definitions used to
// validate .factory/STATE.json on disk (see packages/core/src/harness).
export const FactoryGraphState = new StateSchema(FactoryStateZod.shape);

export type FactoryState = z.infer<typeof FactoryStateZod>;
export type Checkpoints = z.infer<typeof CheckpointsSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type FactoryStatus = z.infer<typeof FactoryStatusSchema>;

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
    security_approved: false,
  },
  logs: [],
};
