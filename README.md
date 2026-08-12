# AutoFactory

**AI-Native Graph Orchestrator for Autonomous Software Factories**

A production-grade, open-source Graph Orchestration Layer (Level 3) that
connects spec-driven methodologies (SpecKit), CLI execution engines (Claude
Code CLI, OpenCode), and local tool-calling models (Hermes / Qwen 2.5 Coder)
into a unified, self-healing software factory.

## 1. Architectural Positioning

AutoFactory is not a copilot, code editor extension, or single CLI tool. It
is the **Graph Orchestrator** (Level 3 layer) that wires together
specialized tools in the AI engineering ecosystem.

```
                     +-----------------------------------+
                     |     SPECIFICATION LAYER            |
                     |     SpecKit / SDD Contracts         |
                     +-----------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
| GRAPH ORCHESTRATION LAYER (AutoFactory Core)                                       |
| Framework: LangGraph.js                                                            |
| State Management | Conditional Routing | Parallel Fan-Out/Fan-In | Human Checkpoints|
+-----------------------------------------------------------------------------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
                  v                                         v
+------------------------------------+   +------------------------------------+
| EXECUTION ENGINE (Cloud)            |   | EXECUTION ENGINE (Local Edge)       |
| Engine: Claude Code CLI             |   | Engine: OpenCode + Ollama           |
| Role: High-level Architecture       |   | Role: Self-Healing & Test Loops     |
+------------------------------------+   +------------------------------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
                     +-----------------------------------+
                     | HARNESS & EVIDENCE LAYER            |
                     | .factory/ + Playwright / Jest        |
                     +-----------------------------------+
```

**Ecosystem complementarity**

- **SpecKit / SDD**: defines the contract, rules, and acceptance criteria (`.factory/PLAN.md`).
- **Claude Code CLI**: handles high-reasoning tasks, complex refactoring, and initial code generation.
- **OpenCode + local Ollama models**: executes local tool-calling loops, test fixes, and lint repairs with zero API cost.
- **AutoFactory**: coordinates execution flow, manages persistent state across resets, and enforces Human-in-the-Loop checkpoints.

## 2. Monorepo Structure

```
autofactory/
├── .factory/
│   ├── BRIEF.md               # User requirements & acceptance criteria
│   ├── PLAN.md                # Atomized tasks & test contracts
│   └── STATE.json             # Graph state engine & checkpoint manager
├── packages/
│   ├── core/                  # Graph orchestration engine (LangGraph.js)
│   │   └── src/{graph,router,harness}
│   ├── cli/                   # Developer terminal controller (init/start/resume/status)
│   └── mcp-servers/
│       └── testing-mcp/       # MCP server exposing a `run_tests` tool
├── scripts/
│   └── setup-local.sh         # macOS/Linux one-command environment installer
├── .env.example
├── package.json
└── LICENSE
```

## 3. Quickstart

### Step 1 — Clone & install dependencies

```bash
git clone https://github.com/YOUR_USERNAME/autofactory.git
cd autofactory
npm run setup   # installs system deps, CLIs, and pulls local models (see caveats below)
npm install
npm run build
```

### Step 2 — Configure environment variables

```bash
cp .env.example .env
claude login   # or set ANTHROPIC_API_KEY in .env
```

### Step 3 — Run the orchestrator

```bash
npm run factory:init     # scaffolds .factory/ in the current project, if missing
npm run factory:start
```

The orchestrator will:

1. Read `.factory/BRIEF.md`.
2. Invoke a local model via Ollama to validate UX and generate `.factory/PLAN.md`.
3. Pause at the human checkpoint for your approval (`npm run factory:resume` to continue).
4. Invoke Claude Code CLI for cloud architecture/code generation.
5. Run the target's test suite, and divert failures to OpenCode + a local model for zero-cost self-healing loops (bounded by `AUTOFACTORY_MAX_RETRIES`).

## 4. Hardware & platform caveats

`scripts/setup-local.sh` is written for **macOS (Apple Silicon, 64GB RAM
recommended)** and depends on Homebrew. It pulls three local models via
Ollama (`qwen2.5-coder:32b`, `hermes3:36b`, `deepseek-r1:14b`), which
together require tens of GB of disk space and are not intended to run
concurrently — the router selects one model per task type. On Linux, install
the equivalent packages manually (`git`, `gh`, `jq`, `ollama`, a container
runtime) before running the script; the Homebrew-specific steps will not
work out of the box.

OpenCode's Ollama provider is not a CLI flag — it must be configured once in
`~/.config/opencode/opencode.json` (see [OpenCode providers docs](https://opencode.ai/docs/providers/)).

## 5. License

Distributed under the MIT License. See [LICENSE](./LICENSE) for details.
