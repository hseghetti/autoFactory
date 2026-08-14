import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";
import chalk from "chalk";
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

export async function initCommand(targetDir: string, options: { force?: boolean } = {}): Promise<void> {
  const factoryDir = join(targetDir, ".factory");
  await mkdir(factoryDir, { recursive: true });

  const files: Array<[string, string]> = [
    [join(factoryDir, "BRIEF.md"), BRIEF_TEMPLATE],
    [join(factoryDir, "PLAN.md"), PLAN_TEMPLATE],
    [join(factoryDir, "UX_WIREFRAMES.md"), UX_WIREFRAMES_TEMPLATE],
    [join(factoryDir, "STATE.json"), `${JSON.stringify(INITIAL_STATE, null, 2)}\n`],
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

  for (const [path, content] of files) {
    if (!options.force && (await exists(path))) {
      console.log(chalk.yellow(`skip   ${path} (already exists)`));
      continue;
    }
    await writeFile(path, content, "utf-8");
    console.log(chalk.green(`create ${path}`));
  }
}
