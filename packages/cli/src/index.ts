#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { resumeCommand } from "./commands/resume.js";
import { startCommand } from "./commands/start.js";
import { statusCommand } from "./commands/status.js";

const program = new Command();

program.name("autofactory").description("AutoFactory graph orchestrator CLI").version("0.1.0");

program
  .command("init")
  .description("Scaffold .factory/ in the target project")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .option("-f, --force", "delete and regenerate existing .factory/ files (prompts for confirmation)", false)
  .option(
    "-t, --target <name>",
    "value written to active_target in STATE.json (what architect is told to build); falls back to $AUTOFACTORY_TARGET, then \"web\"",
  )
  .option(
    "-r, --max-retries <n>",
    "value written to max_retries in STATE.json; falls back to $AUTOFACTORY_MAX_RETRIES, then 3",
    (value: string) => Number.parseInt(value, 10),
  )
  .action(async (opts: { dir: string; force: boolean; target?: string; maxRetries?: number }) =>
    initCommand(opts.dir, { force: opts.force, target: opts.target, maxRetries: opts.maxRetries }),
  );

program
  .command("start")
  .description("Run the AutoFactory graph from its current state")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .option(
    "--revalidate",
    "if status is DONE, re-run test/e2e/security/deploy without touching plan/architect",
    false,
  )
  .action(async (opts: { dir: string; revalidate: boolean }) => startCommand(opts.dir, { revalidate: opts.revalidate }));

program
  .command("resume")
  .description("Resume a graph run paused at a human checkpoint")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .option(
    "--revalidate",
    "if status is DONE, re-run test/e2e/security/deploy without touching plan/architect",
    false,
  )
  .action(async (opts: { dir: string; revalidate: boolean }) => resumeCommand(opts.dir, { revalidate: opts.revalidate }));

program
  .command("status")
  .description("Print the current graph state")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .option("-w, --watch", "poll .factory/STATE.json every 2s and reprint on change", false)
  .action(async (opts: { dir: string; watch: boolean }) => statusCommand(opts.dir, { watch: opts.watch }));

await program.parseAsync(process.argv);
