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
   [ test ] <-------------------------+       (unit tests, e.g. `npm test`)
          |  fail (retries left)      |
          v                           |
   [ heal ] --------- OpenCode + local model attempts a fix
          |  (loops back to test) ----+
          |
          v  pass
   [ e2eTest ] --------------------------+    (`npm run test:e2e`, e.g. Maestro — skipped with
          |  fail (retries left)         |     a warning, not blocked, if no script exists)
          v                              |
   [ heal ] (same node/budget as above) -+
          |
          v  pass, or no test:e2e script found
   [ visualReview ] -- opt-in: Claude Code CLI reviews E2E screenshots vs UX_WIREFRAMES.md (advisory)
          |
          v
   [ securityCheck ] -- local model (Ollama) flags secrets/dangerous commands (advisory)
          |
          v
   [ deploy ] -- opt-in: runs $AUTOFACTORY_DEPLOY_COMMAND if set, else no-op
          |
          v
   [ finalize ]                          (or [ fail ] if retries exhausted)
```

Every node appends to `.factory/STATE.json`'s `logs`, so `autofactory status`
always tells you exactly where a run stopped and why.

## Observability

`autofactory start`/`resume` used to go silent for the entire duration of a
Claude Code CLI or Ollama call — no output until the whole graph finished, so
a slow run and a hung one looked identical. Every node now reports live:

```
▶ Starting graph run (resuming from AWAITING_APPROVAL)

- [architect] cloud-cli · claude-sonnet-5 — running (34.2s)     <- updates in place on a TTY
OK [architect] cloud-cli · claude-sonnet-5 — done in 41.8s  |  tokens 4200 in / 1100 out  |  cost $0.0341
  [architect] step finished in 41.8s
OK [inspect] local-http · qwen2.5-coder:32b — done in 6.1s  |  tokens 1500 in / 220 out  |  cost -
...
Run summary
  node       engine      model               duration  tokens             cost      
  architect  cloud-cli   claude-sonnet-5     41.8s     4200 in / 1100 out $0.0341   ok
  inspect    local-http  qwen2.5-coder:32b   6.1s      1500 in / 220 out  -         ok

  1 cloud call(s), 3 local call(s), total cloud cost $0.0341, wall time 68.9s
```

On a non-TTY stream (piped output, CI logs) the in-place spinner is replaced
by periodic "still running" heartbeat lines instead, so it never looks stuck
there either.

This isn't just console decoration — every one of those numbers is also
written to `.factory/STATE.json`'s `logs` (engine, model, duration, token
counts, cost where the engine exposes it) as each node finishes, not just
once at the very end. That means:

- `autofactory status [--dir <path>]` shows the last 10 log entries with
  that same engine/model/duration/token detail, plus a running total of
  cloud vs. local calls and cloud cost — useful after a run finishes, or
  from a second terminal while one is in progress.
- `autofactory status --watch` polls every 2s and reprints on change, so you
  can watch a run from a different terminal (or after backgrounding it)
  without staring at the process that's actually running the graph.
- If the process is killed or crashes mid-run, `STATE.json` reflects the
  last node that actually completed instead of whatever was there before
  the run started.

What's actually captured per engine:

- **Claude Code CLI** (`cloud-cli`): duration, input/output tokens, and cost
  in USD, parsed from its `--output-format json` response.
- **Ollama** (`local-http`, used by `plan`/`inspect`/`securityCheck`):
  duration and input/output tokens, parsed from `/api/generate`'s response.
- **OpenCode** (`local-cli`, used by `heal`): only duration. OpenCode's
  `--format json` emits a raw event stream rather than a single JSON object
  (see `packages/core/src/router/engines/opencode.ts`), so token/cost figures
  aren't reliably parseable today and are left blank rather than guessed.
- **`npm test`** (`process`): duration and pass/fail only.

## E2E, visual review & deploy (optional)

Unit tests alone don't tell you a UI actually works, looks right, or that
the project is deployable. Three more stages run after `test` passes —
each degrades gracefully rather than forcing every project to adopt them:

- **`e2eTest`**: runs `$AUTOFACTORY_E2E_TEST_COMMAND` (default
  `npm run test:e2e`). Real failures feed into the same retry-bounded
  `heal` loop as unit tests (shared `retry_count`/`max_retries` budget —
  there's no separate counter for E2E). A **missing** `test:e2e` script is
  *not* treated as a failure — `heal` can't invent an E2E setup from
  nothing — it's logged as a loud warning instead, so a run can still
  finish while making it obvious E2E was never actually validated.

  We chose **Maestro** over Detox for mobile E2E: no native build required
  to run against Expo Go/a dev client, and it has documented first-class
  Expo support. `architectNode` is instructed to write flows under
  `.maestro/` and wire them to the `test:e2e` script, using
  `UX_WIREFRAMES.md` as the source of truth for expected screens. AutoFactory
  itself never calls `maestro` directly or manages a simulator/emulator —
  that's entirely the target project's `test:e2e` script's job, same as
  the existing `test` harness never assumed a framework. Install Maestro
  with `curl -fsSL "https://get.maestro.mobile.dev" | bash` (needs Java 17+
  and an already-running simulator/emulator).

- **`visualReview`** (opt-in — set `AUTOFACTORY_ENABLE_VISUAL_REVIEW`):
  looks for screenshots in `.factory/e2e-artifacts/` (the convention
  `architectNode` is told to use for Maestro's `takeScreenshot`) and asks
  Claude Code CLI to review them against `UX_WIREFRAMES.md` for usability/
  layout/styling issues. This runs on the **cloud** model, not a local one
  — none of the local Ollama models this project uses (qwen2.5-coder) are
  multimodal, and a real image-based usability review needs vision. That's
  real per-run cloud cost, hence opt-in. Like `inspect`/`securityCheck`,
  it's advisory only — automated design judgment is inherently fuzzy, and
  this doesn't pretend otherwise by blocking the run over it.

- **`deploy`** (opt-in — set `AUTOFACTORY_DEPLOY_COMMAND`): runs whatever
  command you configure (e.g.
  `AUTOFACTORY_DEPLOY_COMMAND="eas build --platform all --non-interactive --profile preview"`)
  after `securityCheck`. AutoFactory has no built-in knowledge of EAS,
  Vercel, or any other target — same "you own the command" pattern as the
  test harness. A deploy failure is logged and reflected in
  `checkpoints.deployed`, but doesn't trigger `heal` or block `finalize` —
  credential/infra problems aren't something a code-fixing loop can solve.

None of this is required: with no `test:e2e` script and neither opt-in
variable set, a run behaves exactly as before (three quick log lines
saying so, nothing blocks).

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

Either works: the `architect` step only passes Claude Code's `--bare` flag
(faster, skips hooks/LSP/CLAUDE.md discovery) when `ANTHROPIC_API_KEY` is
set, because `--bare` ignores the OAuth session `claude login` creates — it
strictly reads `ANTHROPIC_API_KEY`/`apiKeyHelper`. Without an API key it
falls back to a normal `claude -p` call, which does read the OAuth session.

### 3. Point it at a project and describe what to build

AutoFactory operates on a **target project directory** — the one that has
(or will have) a `.factory/` folder and a test suite it can run. By default
that's the current working directory; every CLI command also accepts
`--dir <path>` to target a different project.

```bash
node packages/cli/dist/index.js init --dir ../my-app --target mobile   # scaffolds .factory/ there
```

`--target` matters: it's written to `active_target` in `STATE.json`, and
`architectNode` puts it verbatim into the prompt it sends Claude Code CLI
("Implement the following execution plan for target `<active_target>`").
It defaults to `web` (via `$AUTOFACTORY_TARGET`, then that hardcoded
fallback) — if your plan describes a mobile/Expo app and you leave the
default, architect is being told to build the wrong stack, and a careful
implementation will stop and ask for clarification instead of guessing,
which looks like a silent no-op in a non-interactive run. Pass whatever
string makes sense for the project (`web`, `mobile`, `api`, ...) — it's
just interpolated into that instruction, not validated against anything.

`init` also runs `git init` in the target directory if it isn't a git repo
yet, so `inspect`/`securityCheck`'s `git diff --stat`-based review has
something to look at (it's silently a no-op, not an error, in a non-git
directory).

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
| `autofactory init [--dir <path>] [--force] [--target <name>] [--max-retries <n>]` | Scaffolds `.factory/{BRIEF.md,UX_WIREFRAMES.md,PLAN.md,STATE.json}` in the target project if they don't already exist, and `git init`s it if needed. `--force` deletes and regenerates existing files, after an interactive confirmation (this discards any in-progress plan/approvals/run state). `--target`/`--max-retries` set `active_target`/`max_retries` in the generated `STATE.json` (fall back to `$AUTOFACTORY_TARGET`/`$AUTOFACTORY_MAX_RETRIES`, then `web`/`3`); they're only applied when `STATE.json` is actually (re)written. |
| `autofactory start [--dir <path>] [--revalidate]` | Loads `STATE.json` and runs the graph forward from wherever it left off. If `status` is `DONE`, this is an **idempotent no-op** by default (repeated calls don't redo `plan`/`architect`, which cost real time/money) — pass `--revalidate` to explicitly re-run `test`→`e2eTest`→`visualReview`→`securityCheck`→`deploy`→`finalize` (e.g. after a pipeline upgrade added new stages) without touching plan/architect. |
| `autofactory resume [--dir <path>] [--revalidate]` | Only useful when `status` is `AWAITING_APPROVAL` (prompts you to approve the plan, then continues) or, with `--revalidate`, when `status` is `DONE` (same behavior as `start --revalidate`). |
| `autofactory status [--dir <path>] [--watch]` | Prints status, checkpoints, retry count, usage totals, and the last 10 log entries (engine/model/duration/tokens/cost). `--watch` polls every 2s and reprints on change. |

(`npm run factory:init/start/resume/status` are shortcuts for the same
commands against the repo root.)

## Current status

The graph, router, and CLI are wired up and functional — they make real
calls to Ollama/Claude Code CLI/OpenCode, persist real state, and have
completed a real end-to-end run against a from-scratch mobile project.
Still, treat this as a working starting point to build on, not a polished
tool. In particular:

- The graph handles a single `active_target` per run — there is no parallel
  Web/Mobile fan-out/fan-in yet, despite the project structure hinting at
  multiple targets. Adding it means branching the graph per target and
  fanning back in before `finalize`.
- Error recovery is intentionally minimal (retry-bounded self-healing, no
  backoff/circuit-breaking) and the MCP testing connector exposes a single
  `run_tests` tool — both likely need hardening for real use.
- E2E/visual review/deploy (see above) are all best-effort and gracefully
  skippable, not hard guarantees — a `DONE` run doesn't necessarily mean
  E2E ran (if `test:e2e` was never set up) or that anything got deployed
  (if `AUTOFACTORY_DEPLOY_COMMAND` was never set). Check
  `checkpoints.e2e_passed`/`deployed` via `autofactory status`, don't
  assume `DONE` covers everything.
- Resume granularity is coarse: `status` only distinguishes
  `AWAITING_APPROVAL`/`HEALING`/`TESTING`/`DONE`/etc., not "which of
  test/e2eTest/visualReview/securityCheck/deploy already ran." A crash
  between `test` and `finalize` resumes by re-running `test` onward from
  the top, not from the exact node that was interrupted — safe (those
  steps are side-effect-light and reasonably idempotent, `deploy` aside)
  but not free. `start --revalidate`/`resume --revalidate` are the one
  explicit, safe way to re-enter that chain on a `DONE` project without
  redoing `plan`/`architect`.

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
