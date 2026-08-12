import { access, mkdir, writeFile } from "node:fs/promises";
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

async function exists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

export async function initCommand(targetDir: string): Promise<void> {
  const factoryDir = join(targetDir, ".factory");
  await mkdir(factoryDir, { recursive: true });

  const files: Array<[string, string]> = [
    [join(factoryDir, "BRIEF.md"), BRIEF_TEMPLATE],
    [join(factoryDir, "PLAN.md"), PLAN_TEMPLATE],
    [join(factoryDir, "STATE.json"), `${JSON.stringify(INITIAL_STATE, null, 2)}\n`],
  ];

  for (const [path, content] of files) {
    if (await exists(path)) {
      console.log(chalk.yellow(`skip   ${path} (already exists)`));
      continue;
    }
    await writeFile(path, content, "utf-8");
    console.log(chalk.green(`create ${path}`));
  }
}
