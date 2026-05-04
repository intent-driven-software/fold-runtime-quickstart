# Fold Runtime — Quickstart

[![npm version](https://img.shields.io/npm/v/@intent-driven/mcp-server.svg?label=%40intent-driven%2Fmcp-server)](https://www.npmjs.com/package/@intent-driven/mcp-server)
[![idf-mcp CI](https://github.com/DubovskiyIM/idf-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/DubovskiyIM/idf-mcp/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Stop giving AI agents API keys. Give them a domain.**

This repo is a 5-minute demo: real Claude / GPT / Gemini agent talking to
a real declarative IDF domain. No mocks. No code-generated boilerplate.
You'll watch one agent **try to wire $50,000** to a wallet — and another
agent, in the same domain, **decline to**, all the way down to a structured
JSON-RPC rejection that the LLM can actually reason about.

> **75-second video walkthrough** *(link added at v1.0.0 launch)*

---

## The 60-second story

In April 2026 a Cursor-driven agent connected to a staging environment,
hit a credential mismatch, decided to "tidy up" by deleting a Railway
volume, found an API token with blanket scope, and **wiped a production
database plus all backups in 9 seconds**. The agent's own post-mortem:

> *"I violated every principle I was given. I didn't verify. I didn't
> understand what I was doing before doing it."*
> — the Cursor / Claude Opus 4.6 agent, [The Register, Apr 2026](https://www.theregister.com/2026/04/27/cursoropus_agent_snuffs_out_pocketos/)

This wasn't an alignment failure. The model did exactly what an agent
in front of a raw API does. **The system never told it what it was
allowed to do, why it shouldn't, or what would happen if it tried.**

Fold is the layer that does. One declarative IDF artifact — entities,
intents, roles, invariants, irreversibility points, preapproval guards —
becomes a runtime that:

- exposes every legal action as a typed MCP tool
- attaches the **why** to every tool description (preconditions,
  invariants likely to fail, point-of-no-return warnings)
- **intercepts** illegal actions before any effect lands in storage
- replies with **structured rejections** the LLM can read and adapt to

This repo demonstrates that on the real `invest` domain — 14 entities,
61 intents, 5 invariants, real preapproval guard with `maxOrderAmount`,
`dailyLimit`, `allowedAssetTypes`, expiry, daily-sum aggregation.

---

## Prerequisites

```bash
# 1. Clone the IDF host (the runtime)
git clone https://github.com/DubovskiyIM/idf
cd idf
npm install
npm run server      # → http://localhost:3001
```

```bash
# 2. Clone this quickstart and install
git clone https://github.com/DubovskiyIM/fold-runtime-quickstart
cd fold-runtime-quickstart
npm install
```

```bash
# 3. Bootstrap the invest domain into your running host
IDF_REPO=$HOME/WebstormProjects/idf npm run bootstrap
# → ✓ bootstrapped: domain=invest
#     entities: 14 · intents: 61 · invariants: 5
#     agent-callable: 6 intents
#     preapproval-required: agent_execute_preapproved_order
```

---

## Demo: Rogue agent vs Smart agent

### Act 1 — Rogue agent tries to move $50,000

```bash
npm run demo:rogue
```

Output (truncated to the punchline):

```
━━━ Step 2 — Rogue agent: 'Hmm, $50,000 BTC long, sounds reasonable' ━━━
  {
    "portfolioId": "p_demo",
    "assetId": "BTC",
    "α": "long",
    "quantity": 0.5,
    "price": 100000,
    "total": 50000,
    "assetType": "crypto"
  }

━━━ Step 3 — Fold runtime intercepts BEFORE the effect is ingested ━━━
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

The rejection is **structured**: `reason="no_preapproval"`, exact entity
name (`AgentPreapproval`), exact owner field (`userId`), the agent's own
`viewerId`. No string parsing. No "Internal Server Error." The next
move for any sane agent: stop, ask the human for a preapproval, retry.

### Act 2 — Investor grants a limited preapproval

```bash
npm run demo:grant
```

A human (acting as the `investor` role) issues:
- `maxOrderAmount: $1,000`
- `dailyLimit: $5,000`
- `allowedAssetTypes: crypto, stocks`
- `expiresAt: +7 days`

That's one effect in Φ. No new endpoint. No middleware change. The
intent `delegate_to_agent` is part of the same artifact the agent
reads — and from this moment, the preapproval guard has a row to
evaluate against.

### Act 3 — Smart agent reads the limit, scales down, executes

```bash
npm run demo:smart
```

```
━━━ Step 1 — Agent reads its own preapproval BEFORE acting ━━━
  Found preapproval (id=pa_moq8vyx1):
    active:           true
    maxOrderAmount:   $1000
    dailyLimit:       $5000
    allowedAssets:    crypto,stocks
    expires:          2026-05-10T20:50:35.268Z

━━━ Step 2 — Agent reasons: 'I want to long BTC. What's safe?' ━━━
  Desired:  0.5 BTC × $100000 = $50000
  Cap:      maxOrderAmount = $1000
  Decision: scale down to 0.009500 BTC = $950.00
  Plan:     execute scaled order, then escalate the remainder to human

━━━ Step 3 — Execute the safe portion ━━━
  HTTP 200
  { "status": "confirmed", "effects": [{ "alpha": "add", "target": "transactions", ... }] }
```

The agent didn't bump into a wall. **It read the wall, walked around it,
and did exactly what was permitted.** None of this is special agent code.
The agent reads `ontology.roles.agent.preapproval` the same way it reads
tool descriptions — through a declarative artifact authored once and
consumed by every reader.

---

## Connect this to Claude Desktop

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
        "IDF_ONTOLOGY_PATH": "/Users/YOU/WebstormProjects/idf/src/domains/invest"
      }
    }
  }
}
```

Restart Claude Desktop. In the **Tools** menu, all 6 agent-callable
intents will appear. Each tool description carries:

- `intent.description` — what the action is
- `Creates: <Entity>` — what gets added
- `⚠️ Irreversible action` — point-of-no-return warning where applicable
- `May fail on (domain invariants)` — relevant integrity rules

Inspect what Claude actually sees:

```bash
npm run show-description
```

---

## What you just used (in 200 lines of declarative IDF)

The `invest` domain — running here in full — declares:

```
14 entities         User, Portfolio, Position, Asset, Transaction,
                    Goal, RiskProfile, Recommendation, Alert,
                    Watchlist, MarketSignal, Assignment,
                    AgentPreapproval, Rule
4 roles             investor (owner), advisor (m2m via Assignment),
                    agent (JWT + preapproval), observer (read-only)
5 invariants        2 referential, 1 transition, 1 cardinality,
                    1 expression
6 agent intents     including agent_execute_preapproved_order
                    guarded by 7-check preapproval (active /
                    notExpired / maxAmount / 2× csvInclude /
                    dailySum)
```

**No agent-specific code was written.** The agent surface is derived
from the same artifact the UI is derived from. Add a new role tomorrow
— it shows up in the agent's MCP tools the next bootstrap.

---

## How is this different from…

|  | LangChain / CrewAI / Mastra | Permit.io / Cerbos / Okta | Lakera / NeMo Guardrails | **Fold** |
|---|---|---|---|---|
| Defines what the agent can call | ✓ | | | |
| Defines who the agent is (identity) | | ✓ | | |
| Filters what the agent says (output) | | | ✓ | |
| **Defines what the agent can do in your business and why** | | | | ✓ |

Fold doesn't replace those layers. It is the **missing one**: the
domain layer that turns role + invariant + irreversibility + preapproval
into a runtime contract the agent reads through MCP — and into structured
rejections when it tries to break the contract.

---

## Where to go next

- **Source of truth:** [github.com/DubovskiyIM/idf](https://github.com/DubovskiyIM/idf) — the host runtime + 17 reference domains
- **MCP server package:** [github.com/DubovskiyIM/idf-mcp](https://github.com/DubovskiyIM/idf-mcp) — `@intent-driven/mcp-server` on npm
- **Build your own domain:** [`docs/ontology-authoring-checklist.md`](https://github.com/DubovskiyIM/idf-sdk/blob/main/docs/ontology-authoring-checklist.md) in `idf-sdk`
- **Format spec:** [`docs/manifesto-v2.md`](https://github.com/DubovskiyIM/idf/blob/main/docs/manifesto-v2.md) — IDF as a data type

---

## License

MIT. See [LICENSE](LICENSE).
