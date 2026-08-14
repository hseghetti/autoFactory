import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import chalk from "chalk";
import { execa } from "execa";
import { INITIAL_STATE } from "@autofactory/core";

const BRIEF_TEMPLATE = `# Product Brief & Acceptance Criteria

## 1. Executive Overview

- **Project Name:** [e.g., Cross-Platform AI Task Dashboard]
- **Target Platforms:** Web (Next.js + Tailwind) & Mobile (Expo + React Native)

## 2. Core Functional Requirements

- [ ] User Authentication & Workspace Creation
- [ ] Real-time Data Sync between Web and Mobile
- [ ] Offline-first persistence

## 3. UX & Interface Contracts

- Design System: Tailwind UI / NativeWind
- Component Hierarchy specified in \`.factory/UX_WIREFRAMES.md\`
`;

const PLAN_TEMPLATE = `# Execution Plan & Test Contracts

> Generated and updated by \`planNode\`. Do not edit manually while the
> orchestrator is running — your changes may be overwritten on the next
> planning pass.
`;

const UX_WIREFRAMES_TEMPLATE = `# UX Wireframes & Component Hierarchy

> Optional. If present, \`planNode\` includes this file's contents alongside
> \`BRIEF.md\` when drafting \`.factory/PLAN.md\`. Leave it empty (or delete it)
> for projects with no UI surface to describe.

- Component Hierarchy: [describe screens/components and their nesting]
- Key interaction flows: [describe]
`;

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

function parseIntEnv(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function initCommand(
  targetDir: string,
  options: { force?: boolean; target?: string; maxRetries?: number } = {},
): Promise<void> {
  const factoryDir = join(targetDir, ".factory");
  await mkdir(factoryDir, { recursive: true });

  // active_target drives what architectNode tells Claude Code CLI to build
  // ("Implement the following execution plan for target \"<active_target>\"").
  // Getting this wrong (e.g. leaving the "web" default for a mobile-only
  // project) makes the plan and the instructed target contradict each
  // other, which is exactly the kind of thing a careful architect pass
  // will stop and ask about instead of guessing.
  const target = options.target ?? process.env.AUTOFACTORY_TARGET ?? INITIAL_STATE.active_target;
  const maxRetries = options.maxRetries ?? parseIntEnv(process.env.AUTOFACTORY_MAX_RETRIES) ?? INITIAL_STATE.max_retries;
  const initialState = { ...INITIAL_STATE, active_target: target, max_retries: maxRetries };

  const files: Array<[string, string]> = [
    [join(factoryDir, "BRIEF.md"), BRIEF_TEMPLATE],
    [join(factoryDir, "PLAN.md"), PLAN_TEMPLATE],
    [join(factoryDir, "UX_WIREFRAMES.md"), UX_WIREFRAMES_TEMPLATE],
    [join(factoryDir, "STATE.json"), `${JSON.stringify(initialState, null, 2)}\n`],
  ];

  if (options.force) {
    const existingPaths: string[] = [];
    for (const [path] of files) {
      if (await exists(path)) existingPaths.push(path);
    }

    if (existingPaths.length > 0) {
      console.log(chalk.red(`This will DELETE and regenerate ${existingPaths.length} existing file(s):`));
      for (const path of existingPaths) console.log(chalk.red(`  - ${path}`));

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question("Any in-progress plan, approvals, or run state will be lost. Continue? (y/N) ");
      rl.close();

      if (answer.trim().toLowerCase() !== "y") {
        console.log(chalk.yellow("Aborted. No files were changed."));
        return;
      }

      for (const path of existingPaths) await rm(path, { force: true });
    }
  }

  const statePath = join(factoryDir, "STATE.json");

  for (const [path, content] of files) {
    if (!options.force && (await exists(path))) {
      const note = path === statePath && options.target ? ` (--target ${target} NOT applied — re-run with --force)` : "";
      console.log(chalk.yellow(`skip   ${path} (already exists)${note}`));
      continue;
    }
    await writeFile(path, content, "utf-8");
    console.log(chalk.green(`create ${path}`));
  }

  const gitDir = join(targetDir, ".git");
  if (!(await exists(gitDir))) {
    // inspectNode/securityCheckNode review `git diff --stat`, which is
    // silently empty (not an error) when the target isn't a git repo at
    // all — that made those advisory checks useless on a brand-new
    // project. `git init` is safe/idempotent, so just do it.
    const result = await execa("git", ["init"], { cwd: targetDir, reject: false });
    if (result.exitCode === 0) {
      console.log(chalk.green(`create ${gitDir} (git init)`));
    } else {
      console.log(chalk.yellow(`skip   git init failed: ${result.stderr || result.exitCode}`));
    }
  }
}
