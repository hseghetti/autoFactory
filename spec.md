
AutoFactory: AI-Native Graph Orchestrator for Autonomous Software Factories
A production-grade, open-source Graph Orchestration Layer (Level 3) designed to connect spec-driven methodologies (SpecKit), CLI execution engines (Claude Code CLI, OpenCode), and local tool-calling models (Hermes-Agent, Qwen 2.5 Coder) into a unified, self-healing software factory.

1. Architectural Positioning
   AutoFactory is not a copilot, code editor extension, or single CLI tool. It is the Graph Orchestrator (Level 3 Layer) that wires together specialized tools in the AI engineering ecosystem.

Plaintext
                     +-----------------------------------+
                     |     SPECIFICATION LAYER           |
                     |     SpecKit / SDD Contracts       |
                     +-----------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| GRAPH ORCHESTRATION LAYER (AutoFactory Core)                                      |
| Framework: Mastra / LangGraph.js                                                  |
| State Management | Conditional Routing | Parallel Fan-Out/Fan-In | Human Checkpoints|
+-----------------------------------------------------------------------------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
                  v                                         v
+------------------------------------+   +------------------------------------+
| EXECUTION ENGINE (Cloud)           |   | EXECUTION ENGINE (Local Edge)      |
| Engine: Claude Code CLI            |   | Engine: OpenCode + Ollama          |
| Model: Claude 3.7 Sonnet           |   | Model: Hermes-Agent / Qwen 2.5     |
| Role: High-level Architecture      |   | Role: Self-Healing & Test Loops    |
+------------------------------------+   +------------------------------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
                     +-----------------------------------+
                     | HARNESS & EVIDENCE LAYER          |
                     | .factory/ + Playwright / Jest     |
                     +-----------------------------------+
Ecosystem Complementarity
SpecKit / SDD: Defines the contract, rules, and acceptance criteria (.factory/PLAN.md).

Claude Code CLI: Handles high-reasoning tasks, complex refactoring, and initial code generation.

OpenCode + Hermes-Agent: Executes local tool-calling loops, test fixes, and lint repairs with zero API cost.

AutoFactory: Coordinates execution flow, manages persistent state across resets, handles parallel builds for Web (Next.js) & Mobile (Expo), and enforces Human-in-the-Loop checkpoints.

2. Monorepo Directory Structure
   Below is the repository structure for @autofactory/monorepo. Copy these files into your workspace to initialize the repository.

Plaintext
autofactory/
├── .factory/
│   ├── BRIEF.md               # User Requirements & UX Wireframes
│   ├── PLAN.md                # Atomized Tasks & Test Contracts
│   └── STATE.json             # Graph State Engine & Checkpoint Manager
├── packages/
│   ├── core/                  # Graph Orchestration Engine
│   │   ├── src/
│   │   │   ├── graph/         # StateGraph Nodes & Edges (LangGraph/Mastra)
│   │   │   ├── router/        # Dynamic Model Router (Cloud vs Local)
│   │   │   ├── harness/       # State File Persister & State Management
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cli/                   # Developer Terminal Controller
│   │   ├── src/
│   │   │   ├── commands/      # init, start, resume, status
│   │   │   └── index.ts
│   │   └── package.json
│   └── mcp-servers/           # Custom MCP Testing Connectors
│       └── testing-mcp/
├── scripts/
│   └── setup-local.sh         # macOS/Linux One-Command Environment Installer
├── .env.example
├── .gitignore
├── package.json               # Root Workspace Configuration
├── LICENSE                    # MIT License
└── README.md
3. Core Configuration Files
package.json (Root Workspace)
JSON
{
  "name": "autofactory-monorepo",
  "version": "0.1.0",
  "private": true,
  "description": "AI-Native Graph Orchestrator for Autonomous Software Factories",
  "license": "MIT",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "setup": "bash scripts/setup-local.sh",
    "build": "turbo run build",
    "dev": "turbo run dev",
    "factory:start": "node packages/cli/dist/index.js start",
    "factory:resume": "node packages/cli/dist/index.js resume",
    "test": "playwright test && jest"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "turbo": "^1.12.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
.factory/STATE.json (Initial Graph State)
JSON
{
  "current_step": 1,
  "max_retries": 3,
  "status": "IDLE",
  "active_target": "web",
  "active_branch": "main",
  "checkpoints": {
    "plan_approved": false,
    "tests_passed": false,
    "security_approved": false
  },
  "logs": []
}
.factory/BRIEF.md (Product Specification Template)
Markdown

# Product Brief & Acceptance Criteria

## 1. Executive Overview

- **Project Name:** [e.g., Cross-Platform AI Task Dashboard]
- **Target Platforms:** Web (Next.js + Tailwind) & Mobile (Expo + React Native)

## 2. Core Functional Requirements

- [ ] User Authentication & Workspace Creation
- [ ] Real-time Data Sync between Web and Mobile
- [ ] Offline-first persistence

## 3. UX & Interface Contracts

- Design System: Tailwind UI / NativeWind
- Component Hierarchy specified in `.factory/UX_WIREFRAMES.md`
  .factory/PLAN.md (Atomized Execution Blueprint)
  Markdown

# Execution Plan & Test Contracts

## Task [1]: Foundation Setup

- **Target:** Web & Mobile Shared Library
- **Spec:** Initialize Monorepo structure with shared TypeScript interfaces.
- **Test Contract:** `npm run test:types` must exit with code 0.

## Task [2]: Web Dashboard UI (Parallel Fan-Out)

- **Target:** `apps/web` (Next.js)
- **Spec:** Build task grid component using Tailwind CSS.
- **Test Contract:** `npx playwright test tests/dashboard.spec.ts` must pass.

## Task [3]: Mobile Screen Navigation (Parallel Fan-Out)

- **Target:** `apps/mobile` (Expo)
- **Spec:** Implement React Navigation stack for Task Overview.
- **Test Contract:** `npx jest __tests__/Navigation.test.js` must pass.

4. One-Command Setup Script: scripts/setup-local.sh
   Create this script to automatically prepare the developer environment on macOS (optimized for Apple Silicon / 64 GB RAM):

Bash
#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "🚀 AutoFactory Local Environment Setup (macOS / Linux)"
echo "=========================================================="

# 1. Check for Homebrew

if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew is required. Please install Homebrew first."
    exit 1
fi

# 2. Install Core System Dependencies

echo "--> Installing system binaries (git, jq, ollama, orbstack)..."
brew install git gh jq ollama orbstack || true

# 3. Check / Start OrbStack or Docker

if command -v orbstack &> /dev/null; then
    echo "--> Starting OrbStack..."
    orbstack start || true
fi

# 4. Install Global CLI Engines

echo "--> Installing CLI Execution Engines..."
npm install -g @anthropic-ai/claude-code
npm install -g opencode-ai

# 5. Start Ollama Service in Background

echo "--> Verifying Ollama service..."
if ! pgrep -x "ollama" > /dev/null; then
    ollama serve &
    sleep 3
fi

# 6. Pull Local AI Models for Hardware Execution (64GB RAM Optimized)

echo "--> Pulling Local Inference Models via Ollama..."

echo "   [1/3] Pulling Qwen 2.5 Coder 32B (Architecture & Inspection)..."
ollama pull qwen2.5-coder:32b

echo "   [2/3] Pulling Hermes 3 36B (Local Tool-Calling & Self-Healing)..."
ollama pull hermes3:36b

echo "   [3/3] Pulling DeepSeek-R1 14B (Reasoning & UX Briefs)..."
ollama pull deepseek-r1:14b

echo "=========================================================="
echo "✅ Environment Ready! Execute 'npm run factory:start' to run."
echo "=========================================================="
Make the script executable:

Bash
chmod +x scripts/setup-local.sh
5. Local Quickstart Guide
Follow these steps on your MacBook Pro to spin up the local factory instance:

Step 1: Clone & Install Dependencies
Bash

# Clone your repository

git clone https://github.com/YOUR_USERNAME/autofactory.git
cd autofactory

# Run the automated local environment setup

npm run setup
Step 2: Configure Environment Variables
Copy .env.example to .env:

Bash
CP .env.example .env
Add your Anthropic API Key or log in via Claude CLI:

Bash
claude login
Step 3: Run the Orchestrator
Bash

# Start the Graph Execution

npm run factory:start
The orchestrator will:

Read .factory/BRIEF.md.

Invoke deepseek-r1:14b locally to validate UX and generate .factory/PLAN.md.

Pause at the Human Checkpoint for your approval in VS Code.

Execute parallel Fan-Out builds using Claude Code CLI for cloud code generation.

Divert test failures to Hermes 3 / OpenCode for local, zero-cost self-healing loops until all assertions pass.

6. License
   Distributed under the MIT License. See LICENSE for more information.
