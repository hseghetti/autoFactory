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
  .action(async (opts: { dir: string; force: boolean }) => initCommand(opts.dir, { force: opts.force }));

program
  .command("start")
  .description("Run the AutoFactory graph from its current state")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .action(async (opts: { dir: string }) => startCommand(opts.dir));

program
  .command("resume")
  .description("Resume a graph run paused at a human checkpoint")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .action(async (opts: { dir: string }) => resumeCommand(opts.dir));

program
  .command("status")
  .description("Print the current graph state")
  .option("-d, --dir <path>", "target project directory", process.cwd())
  .option("-w, --watch", "poll .factory/STATE.json every 2s and reprint on change", false)
  .action(async (opts: { dir: string; watch: boolean }) => statusCommand(opts.dir, { watch: opts.watch }));

await program.parseAsync(process.argv);
