# AutoFactory

**AI-Native Graph Orchestrator for Autonomous Software Factories**

## Why AutoFactory exists

AI coding agents come in two flavors, and each has a problem on its own:

- **Cloud agents** (Claude Code CLI) are strong at architecture and complex
  reasoning, but every token costs money — using them for the whole loop,
  including trivial test/lint fixes, burns budget fast.
- **Local agents** (OpenCode + Ollama) are free and private, but weaker —
  fine for grinding through a failing test suite, not for making
  architectural decisions.

Used ad hoc, neither approach gives you a **repeatable, auditable pipeline**:
there's no persistent state across runs, no place to pause for human sign-off
before code gets written, and no single place that decides which engine
should handle which step.

**AutoFactory solves that** by sitting above both engines as a graph
orchestrator: it reads a spec, drafts a plan with a cheap local model, stops
and waits for your approval, hands the approved plan to the cloud engine for
implementation, runs your tests, and — if they fail — loops a local engine
against the failures for free instead of re-invoking the cloud model. Every
step and decision is persisted to `.factory/STATE.json`, so a run can be
killed and resumed without losing progress.

## What it is (and isn't)

AutoFactory is not a copilot, code editor extension, or a replacement for
Claude Code CLI / OpenCode. It's the **coordination layer** above them — the
thing that decides *when* each engine runs, *what* it's given to work with,
and *where* a human needs to approve before it continues.

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
| State Management | Conditional Routing | Retry-Bounded Healing Loop | Human Checkpoints|
+-----------------------------------------------------------------------------------+
                                       |
                  +--------------------+--------------------+
                  |                                         |
                  v                                         v
+------------------------------------+   +------------------------------------+
| EXECUTION ENGINE (Cloud)            |   | EXECUTION ENGINE (Local Edge)       |
| Engine: Claude Code CLI             |   | Engine: OpenCode + Ollama           |
| Role: High-level Architecture       |   | Role: Planning, Inspection &        |
|                                      |   | Self-Healing                        |
+------------------------------------+   +------------------------------------+
                  |                                         |
                  +--------------------+--------------------+
                                       |
                                       v
                     +-----------------------------------+
                     | HARNESS & EVIDENCE LAYER            |
                     | .factory/ + your test command        |
                     | (npm test by default)                |
                     +-----------------------------------+
```

**Ecosystem complementarity**

- **Specification layer (SpecKit / SDD-style)**: this repo does not depend on
  or invoke the SpecKit CLI — `.factory/BRIEF.md` and `.factory/PLAN.md` are
  our own plain-Markdown format. The diagram's top layer represents the
  *methodology* they follow (spec-driven contracts and acceptance criteria
  before code gets written), not an integrated tool. Swapping in real
  SpecKit output as the input to `planNode` is a natural extension, not
  something wired up today.
- **Claude Code CLI**: handles high-reasoning tasks, complex refactoring, and initial code generation.
- **Local Ollama models**: `deepseek-r1:14b` drafts the plan (from `BRIEF.md` and, if present, `UX_WIREFRAMES.md`), and `qwen2.5-coder:32b` handles two advisory passes — inspecting the architect's diff before testing, and reviewing it for secrets/dangerous commands after tests pass — both called directly over Ollama's HTTP API.
- **OpenCode + `hermes3:8b`**: executes local tool-calling loops for test fixes and lint repairs with zero API cost.
- **AutoFactory**: coordinates execution flow, manages persistent state across resets, and enforces Human-in-the-Loop checkpoints.

## How a run actually flows

```
   .factory/BRIEF.md
          |
          v
   [ plan ]  --------- local model (Ollama) drafts .factory/PLAN.md
          |
          v
   [ human checkpoint ] --------- STOPS here until you approve the plan
          |  (factory:resume)
          v
   [ architect ] -------- Claude Code CLI implements the plan
          |
          v
   [ inspect ] --------- local model (Ollama) reviews the diff before testing
          |
          v
   [ test ] <-------------------------+
          |  fail (retries left)      |
          v                           |
   [ heal ] --------- OpenCode + local model attempts a fix
          |  (loops back to test) ----+
          |
          v  pass
   [ securityCheck ] -- local model (Ollama) flags secrets/dangerous commands (advisory)
          |
          v
   [ finalize ]                          (or [ fail ] if retries exhausted)
```

Every node appends to `.factory/STATE.json`'s `logs`, so `autofactory status`
always tells you exactly where a run stopped and why.

## Project structure

```
autofactory/
├── .factory/
│   ├── BRIEF.md               # You fill this in: what you want built
│   ├── UX_WIREFRAMES.md       # Optional: component hierarchy/interaction flows, read by plan
│   ├── PLAN.md                # Written by the plan node, reviewed by you
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

## Quickstart

### 1. Install dependencies

```bash
git clone https://github.com/YOUR_USERNAME/autofactory.git
cd autofactory
npm run setup   # installs system deps, CLIs, and pulls local models (see caveats below)
npm install
npm run build
```

### 2. Configure credentials

```bash
cp .env.example .env
claude login   # or set ANTHROPIC_API_KEY in .env
```

### 3. Point it at a project and describe what to build

AutoFactory operates on a **target project directory** — the one that has
(or will have) a `.factory/` folder and a test suite it can run. By default
that's the current working directory; every CLI command also accepts
`--dir <path>` to target a different project.

```bash
node packages/cli/dist/index.js init --dir ../my-app   # scaffolds .factory/ there
```

Edit `../my-app/.factory/BRIEF.md` with the actual requirements — the
shipped file is just a placeholder template. If the project has a UI, also
fill in `../my-app/.factory/UX_WIREFRAMES.md`; `planNode` folds it into the
plan prompt alongside `BRIEF.md` when it's non-empty.

### 4. Run the graph

```bash
node packages/cli/dist/index.js start --dir ../my-app
# review the generated ../my-app/.factory/PLAN.md, then:
node packages/cli/dist/index.js resume --dir ../my-app
```

If you're driving AutoFactory against its own repo (e.g. to try it out),
the `npm run factory:*` scripts default to the repo root, so you can skip
`--dir` and just run `npm run factory:start` / `npm run factory:resume`.

## CLI reference

`autofactory` is the package's `bin` name, but nothing in this repo installs
it globally yet — run these via `node packages/cli/dist/index.js <command>`
(as in the Quickstart above) unless you've linked it yourself
(`npm link` inside `packages/cli`).

| Command | What it does |
|---|---|
| `autofactory init [--dir <path>] [--force]` | Scaffolds `.factory/{BRIEF.md,UX_WIREFRAMES.md,PLAN.md,STATE.json}` in the target project if they don't already exist. `--force` deletes and regenerates any that do, after an interactive confirmation (this discards any in-progress plan/approvals/run state). |
| `autofactory start [--dir <path>]` | Loads `STATE.json` and runs the graph forward from wherever it left off. |
| `autofactory resume [--dir <path>]` | Only useful when `status` is `AWAITING_APPROVAL`; prompts you to approve the plan, then continues the run. |
| `autofactory status [--dir <path>]` | Prints the current status, checkpoints, retry count, and the most recent log entry. |

(`npm run factory:init/start/resume/status` are shortcuts for the same
commands against the repo root.)

## Current status

This is an early scaffold: the graph, router, and CLI are wired up and
functional (they make real calls to Ollama/Claude Code CLI/OpenCode and
persist real state), but it has not yet been run end-to-end against a
production project. Treat it as a working starting point to build on, not a
polished tool. In particular:

- The graph handles a single `active_target` per run — there is no parallel
  Web/Mobile fan-out/fan-in yet, despite the project structure hinting at
  multiple targets. Adding it means branching the graph per target and
  fanning back in before `finalize`.
- Error recovery is intentionally minimal (retry-bounded self-healing, no
  backoff/circuit-breaking) and the MCP testing connector exposes a single
  `run_tests` tool — both likely need hardening for real use.

## Hardware & platform caveats

`scripts/setup-local.sh` is written for **macOS (Apple Silicon, 64GB RAM
recommended)** and depends on Homebrew. It pulls three local models via
Ollama (`qwen2.5-coder:32b`, `hermes3:8b`, `deepseek-r1:14b`), which
together require tens of GB of disk space and are not intended to run
concurrently — the router selects one model per task type. On Linux, install
the equivalent packages manually (`git`, `gh`, `jq`, `ollama`, a container
runtime) before running the script; the Homebrew-specific steps will not
work out of the box.

OpenCode's Ollama provider is not a CLI flag — it must be configured once in
`~/.config/opencode/opencode.json` (see [OpenCode providers docs](https://opencode.ai/docs/providers/)).

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for details.
