/**
 * Печатает финальный MCP tool description для каждого agent-intent в
 * указанном домене — то, что увидит LLM-агент. Полезно для понимания,
 * какая семантика выводится автоматически из ONTOLOGY/INTENTS.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 IDF_DOMAIN=procurement \
 *     node scripts/show-description.mjs
 */

import { buildDescription } from "@intent-driven/mcp-server";

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const DOMAIN = process.env.IDF_DOMAIN || "procurement";
const EMAIL = process.env.IDF_AGENT_EMAIL || "quickstart@local";
const PASSWORD = process.env.IDF_AGENT_PASSWORD || "quickstart-password";

async function getToken() {
  let res = await fetch(`${SERVER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    res = await fetch(`${SERVER}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "quickstart" }),
    });
  }
  return (await res.json()).token;
}

const token = await getToken();
const res = await fetch(`${SERVER}/api/agent/${DOMAIN}/schema`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`schema fetch failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const { intents } = await res.json();

console.log(`\n=== Tool descriptions sent to LLM agent (domain=${DOMAIN}, ${intents.length} intents) ===\n`);
for (const intent of intents) {
  console.log(`\n────────────────────────────────────────`);
  console.log(`Tool: ${intent.intentId}`);
  console.log(`────────────────────────────────────────`);
  console.log(buildDescription(intent));
}
