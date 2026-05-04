# Quickstart without Docker

This is the original flow before the Docker-based quickstart. Recommended
only if you're already developing against the IDF host (e.g. authoring
your own domains) and want to drive everything from your own Node setup.

For first-time evaluation, **use the Docker quickstart in the main
README** — it's faster and removes the path-juggling.

## Prerequisites

- Node.js 20+
- Two terminals
- ~2GB free disk for two repos + node_modules

## Steps

### 1. Clone and run the IDF host

```bash
git clone https://github.com/DubovskiyIM/idf ~/projects/idf
cd ~/projects/idf
npm install
npm run server   # → http://localhost:3001 — keep this running
```

### 2. Clone the quickstart and bootstrap the demo domain

In a second terminal:

```bash
git clone https://github.com/DubovskiyIM/fold-runtime-quickstart ~/projects/fold-runtime-quickstart
cd ~/projects/fold-runtime-quickstart
npm install
IDF_REPO=~/projects/idf npm run bootstrap   # POSTs ontology + intents to localhost:3001
```

`IDF_REPO` must point to the **absolute** path of your idf checkout
from step 1. The bootstrap script reads
`<IDF_REPO>/src/domains/invest/{ontology,intents}.js` and registers
them with the host.

### 3. Run the demo

```bash
npm run demo:rogue
npm run demo:grant
npm run demo:smart
```

### 4. Wire to Claude Desktop (optional)

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "invest": {
      "command": "npx",
      "args": ["-y", "@intent-driven/mcp-server"],
      "env": {
        "IDF_SERVER": "http://localhost:3001",
        "IDF_DOMAIN": "invest",
        "IDF_ONTOLOGY_PATH": "/Users/YOU/projects/idf/src/domains/invest"
      }
    }
  }
}
```

`IDF_ONTOLOGY_PATH` must be **absolute** — `~` and env vars are not
expanded by Claude Desktop. Replace `/Users/YOU/...` with your real
home path.

Restart Claude Desktop completely (⌘Q + relaunch — closing the window
isn't enough).

## Why we made the Docker version the default

This non-Docker flow has 8 steps, requires keeping two terminals
straight, and depends on absolute paths the user has to construct.
First-time evaluators were dropping out at the path-substitution step
in the Claude Desktop config. The Docker version is two commands and
no paths.

If you're reading this because the Docker version had a problem, please
[open an issue](https://github.com/DubovskiyIM/fold-runtime-quickstart/issues)
— we'd rather fix the Docker path than have people stuck on this one.
