# Fold Runtime — Quickstart

[![npm version](https://img.shields.io/npm/v/@intent-driven/mcp-server.svg?label=%40intent-driven%2Fmcp-server)](https://www.npmjs.com/package/@intent-driven/mcp-server)
[![idf-mcp CI](https://github.com/intent-driven-software/idf-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/intent-driven-software/idf-mcp/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Stop giving AI agents API keys. Give them a domain.**

Two-command quickstart: real Claude / GPT / Gemini agent talking to a real
declarative IDF domain. No mocks. No code-generated boilerplate. You'll
watch one agent **try to wire $50,000** to a wallet — and another agent,
in the same domain, **decline to**, all the way down to a structured
JSON-RPC rejection that the LLM can actually reason about.

→ Landing & full narrative: **[fold.intent-design.tech](https://fold.intent-design.tech)**
→ MCP-server source: **[@intent-driven/mcp-server](https://github.com/intent-driven-software/idf-mcp)**

### 70-second walkthrough

[![Watch the demo on Loom](https://cdn.loom.com/sessions/thumbnails/2ca4a40e3b9245feb86a74a998e42cb8-with-play.gif)](https://www.loom.com/share/2ca4a40e3b9245feb86a74a998e42cb8)

→ **[Watch on Loom →](https://www.loom.com/share/2ca4a40e3b9245feb86a74a998e42cb8)**
&nbsp;&nbsp;Three real scripts. Real HTTP. Verbatim terminal output.

---

## Why this exists

On April 25 2026 a Cursor agent powered by Claude Opus 4.6, working on a
credential mismatch in PocketOS staging, found an unrelated API token,
decided to delete a Railway volume to fix things, and wiped the production
database **and all volume-level backups** in 9 seconds. The agent's own
post-mortem:

> *"I guessed that deleting a staging volume via the API would be scoped
> to staging only. I didn't verify. I didn't check if the volume ID was
> shared across environments."*

30-hour outage. PocketOS rolled back to a 3-month-old backup.
([The Register](https://www.theregister.com/2026/04/27/cursoropus_agent_snuffs_out_pocketos/) ·
[FastCompany](https://www.fastcompany.com/91533544/cursor-claude-ai-agent-deleted-software-company-pocket-os-database-jer-crane) ·
[OECD AI Incident #6153](https://oecd.ai/en/incidents/2026-04-27-6153))

That's not an alignment failure. The system never told the agent what
was allowed, why it shouldn't, or what would happen if it tried. Existing
MCP servers don't either — tool descriptions carry endpoint shape and
not much else. The agent learns by colliding with 500s.

This repo runs the proof in three scripts against a live IDF runtime.

**Who this is for.** You're the engineer at a 5–30-person team putting
an AI agent into production this quarter — on top of a real backend,
with real customers, real SOC2 review on the horizon. You don't want a
guardrail layer that reviews after the fact. You want the system itself
to refuse the wrong action — before the call, with a structured reason
the agent can read.

**How it plugs in.** Fold is a sibling service over an HTTP API the
runtime exposes from your IDF artifact — not middleware in your existing
app, not codegen at runtime. Your current backend stays where it is; the
IDF artifact *describes* the agent-facing surface, and the runtime serves
it on its own port. The MCP server is a stdio adapter Claude Desktop /
Cursor / Zed connect to.

---

## Quickstart — 2 commands

### Prerequisites

- **Docker Desktop** (or `docker compose` on Linux)
- **Node.js 20+** (for the demo scripts only — the runtime itself runs in Docker)

That's it. You do **not** need to clone the IDF host separately, install
its dependencies, set absolute paths, or remember which terminal is
which. The Docker image bundles the host and bootstraps the `invest`
demo domain on first start.

### Run

```bash
git clone https://github.com/intent-driven-software/fold-runtime-quickstart
cd fold-runtime-quickstart

# Terminal 1 — start the runtime (first run takes ~3 min to build the image)
docker compose up

# Terminal 2 — run the demo
npm install
npm run demo:rogue   # Act 1: agent tries $50,000 — gets HTTP 403 with structured rejection
npm run demo:grant   # Act 2: investor issues $1,000-cap preapproval (one declarative effect)
npm run demo:smart   # Act 3: agent reads the cap, scales the order, executes 200 OK
```

When you're done: <kbd>Ctrl-C</kbd> in terminal 1, then `docker compose down`.

---

## What just happened

### Act 1 — `npm run demo:rogue`

Agent submits a $50,000 BTC long without preapproval. The runtime
intercepts **before** any effect lands in storage:

```
HTTP 403
{
  "error": "preapproval_denied",
  "intentId": "agent_execute_preapproved_order",
  "reason": "no_preapproval",
  "details": {
    "entity": "AgentPreapproval",
    "ownerField": "userId",
    "viewerId": "user_5f57c252"
  }
}
```

Structured. Not a 500. Not a string. The next move for any sane agent:
stop, ask the human for a preapproval, retry.

### Act 2 — `npm run demo:grant`

A human (acting as the `investor` role) issues:

- `maxOrderAmount: $1,000`
- `dailyLimit: $5,000`
- `allowedAssetTypes: crypto, stocks`
- `expiresAt: +7 days`

That's one effect in Φ. No new endpoint. No middleware change. The
intent `delegate_to_agent` is part of the same artifact the agent
reads — and from this moment, the preapproval guard has a row to
evaluate against.

### Act 3 — `npm run demo:smart`

```
Found preapproval (id=pa_…):
  active:           true
  maxOrderAmount:   $1000
  dailyLimit:       $5000

Desired:  0.5 BTC × $100000 = $50000
Cap:      maxOrderAmount = $1000
Decision: scale down to 0.0095 BTC = $950.00

HTTP 200
{ "status": "confirmed", ... }
```

The agent didn't bump into a wall. **It read the wall, walked around
it, and did exactly what was permitted.** No special agent code. The
agent reads `ontology.roles.agent.preapproval` the same way it reads
tool descriptions — through a declarative artifact authored once and
consumed by every reader.

---

## Connect this to Claude Desktop

Once `docker compose up` is running, point Claude Desktop at the
already-bootstrapped invest domain.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "invest": {
      "command": "npx",
      "args": ["-y", "@intent-driven/mcp-server"],
      "env": {
        "IDF_SERVER": "http://localhost:3001",
        "IDF_DOMAIN": "invest",
        "IDF_BOOTSTRAP": "0"
      }
    }
  }
}
```

Note `IDF_BOOTSTRAP=0` — the Docker container already bootstrapped the
domain, so the MCP server can skip that step (no `IDF_ONTOLOGY_PATH`
needed). Restart Claude Desktop. In the **Tools** menu, all 6
agent-callable intents will appear, each tool description carrying:

- `intent.description` — what the action is
- `Creates: <Entity>` — what gets added
- `⚠️ Irreversible action` — point-of-no-return warning where applicable
- `May fail on (domain invariants)` — relevant integrity rules

Inspect what Claude actually sees:

```bash
npm run show-description
```

---

## Troubleshooting

### Port 3001 is already in use

Another process or container is bound to 3001. Pick a different host port:

```bash
HOST_PORT=3199 docker compose up
IDF_SERVER=http://localhost:3199 npm run demo:rogue
IDF_SERVER=http://localhost:3199 npm run demo:grant
IDF_SERVER=http://localhost:3199 npm run demo:smart
```

To find the offender: `lsof -i :3001` or `docker ps --format '{{.Names}} {{.Ports}}'`.

### `docker compose up` builds for a long time

First run only — the image clones the IDF host and runs `npm install`
inside the container (3-5 min on a typical macbook). Subsequent runs
use the cached image and start in ~5 sec.

To pin to a specific upstream commit:

```bash
docker compose build --build-arg IDF_REF=<sha-or-tag>
```

### Demo scripts fail with `ECONNREFUSED 127.0.0.1:3001`

The container isn't ready yet, or port forwarding didn't take. Check:

```bash
docker compose ps               # STATUS should be "Up (healthy)"
docker compose logs --tail=20   # look for "fold-quickstart is ready"
curl http://localhost:3001/api/effects   # should return JSON
```

If `docker compose ps` says `Up (healthy)` but `curl` fails, restart
Docker Desktop — this is a known macOS quirk when many containers run
simultaneously.

### `bootstrap` step inside the container fails

Tail the container log for the exact error:

```bash
docker compose logs idf-host
```

Most common cause: the upstream `idf` repo changed its on-disk layout
and `/opt/idf/src/domains/invest/{ontology,intents}.js` no longer
exists. Pin to a known-good commit (see above) and report the issue.

### Claude Desktop doesn't show the tools

1. Make sure `docker compose up` is running (the runtime needs to be
   reachable on `localhost:3001`).
2. Quit Claude Desktop **completely** (⌘Q, not just close window) and
   relaunch — config is read at startup only.
3. Check Claude Desktop logs:
   `~/Library/Logs/Claude/mcp-server-invest.log`
4. Verify the MCP server can reach the runtime:
   `npx -y @intent-driven/mcp-server --domain=invest --no-bootstrap`
   (should connect, fetch schema, exit).

### Want to run without Docker (advanced)

If you'd rather drive the host yourself (e.g. for development against
your own ontologies), see `legacy/no-docker.md` for the original
multi-step flow. Not recommended unless you're already familiar with
the IDF host.

---

## What's in this repo

```
Dockerfile              # Single-image build: clones IDF host + bootstrap
docker-compose.yml      # One service, one port, one healthcheck
docker/entrypoint.sh    # Boots host, bootstraps domain, prints next-step banner
scripts/
  demo-rogue-agent.mjs  # Act 1 — $50K rejected with structured 403
  demo-grant-preapproval.mjs   # Act 2 — investor delegates with $1K cap
  demo-smart-agent.mjs  # Act 3 — agent reads cap, scales, executes
  show-description.mjs  # Print verbatim agent-facing tool descriptions
claude_desktop_config.example.json
```

That's it. ~120 lines of scripts + ~60 lines of Docker plumbing → a
working, agent-ready domain runtime with structured rejections,
preapproval guards, and irreversibility primitives.

---

## Author your own domain (separate path)

This quickstart runs a pre-built domain (`invest`). If you want to
declare **your own** entities / intents / invariants and have Fold serve
them, that's a different project — the IDF SDK.

### How long does it take?

Three reference points from the public IDF host runtime:

| Domain      | Shape                                                          | Time                                |
|-------------|----------------------------------------------------------------|-------------------------------------|
| `invest`    | 14 entities · 61 intents · 5 invariants · ~600 lines           | a weekend, hand-written             |
| `gravitino` | 253 entities (Apache catalog OpenAPI) · 120 intents            | imported in <1h, enriched in 2 days |
| `workflow`  | 9 entities · 47 intents · timer queue · cascade rules          | a day                               |

The speed comes from importers — you don't write 253 entities by hand.

### Tooling

- [`@intent-driven/cli`](https://www.npmjs.com/package/@intent-driven/cli):
  - `idf init` — bootstrap an empty domain
  - `idf import postgres` — reads your live schema, generates entity baseline
  - `idf import openapi` — reads your API spec, generates intents and references (this is the 253-entity path)
  - `idf import prisma` — same for ORM-driven backends
  - `idf enrich` — LLM pass to fill labels, field roles, suggested preapproval predicates
- [`docs/ontology-authoring-checklist.md`](https://github.com/DubovskiyIM/idf-sdk/blob/main/docs/ontology-authoring-checklist.md) — 12-point checklist for first ontology
- [Why a runtime layer](https://fold.intent-design.tech/paper/why-runtime-layer/) — ~1800-word essay on the agent-safety class question this answers

The quickstart deliberately doesn't cover authoring — start there if
you want to ship Fold for your own product.

---

## Where to go next

- **Source of truth:** [github.com/DubovskiyIM/idf](https://github.com/DubovskiyIM/idf) — host runtime + 17 reference domains
- **MCP server package:** [github.com/intent-driven-software/idf-mcp](https://github.com/intent-driven-software/idf-mcp) — `@intent-driven/mcp-server` on npm
- **Landing:** [fold.intent-design.tech](https://fold.intent-design.tech)

---

## License

MIT. See [LICENSE](LICENSE).
