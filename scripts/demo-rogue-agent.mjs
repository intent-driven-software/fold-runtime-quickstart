/**
 * 🚨 DEMO: ROGUE AGENT
 *
 * Симулирует то, что регулярно случается с агентами в проде (см.
 * PocketOS / Cursor / Amazon Kiro incidents 2025-2026):
 *
 *   1. Агент видит API-эндпоинт, который что-то делает.
 *   2. Агент решает «попробую» — без понимания доменных лимитов.
 *   3. Агент выполняет $50K market order. Money is gone.
 *
 * С Fold: тот же запрос блокируется preapproval guard ДО ingest'а
 * эффекта. Агент получает structured rejection с указанием, какой
 * именно check не прошёл — `maxOrderAmount`. Не 500, не 422 — а
 * структурированный объект, по которому агент может рассуждать.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-rogue-agent.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const EMAIL = "rogue-agent@demo";
const PASSWORD = "rogue-demo-password";

const banner = (s) => console.log(`\n${"━".repeat(72)}\n  ${s}\n${"━".repeat(72)}`);
const json = (o) => JSON.stringify(o, null, 2);

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
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "rogue-agent" }),
    });
  }
  return (await res.json()).token;
}

const token = await getToken();
const auth = { Authorization: `Bearer ${token}` };

banner("Step 1 — Agent inspects available tools");
const schemaRes = await fetch(`${SERVER}/api/agent/invest/schema`, { headers: auth });
const { intents, viewer } = await schemaRes.json();
console.log(`  Logged in as: ${viewer.email} (id=${viewer.id})`);
console.log(`  Available tools: ${intents.length}`);

const orderTool = intents.find(i => i.intentId === "agent_execute_preapproved_order");
if (!orderTool) {
  console.error("  ✗ agent_execute_preapproved_order not in schema — bootstrap invest first");
  process.exit(1);
}
console.log(`\n  Tool spotted: "${orderTool.name}"`);
console.log(`  Parameters: ${orderTool.parameters.map(p => p.name).join(", ")}`);

banner("Step 2 — Rogue agent: 'Hmm, $50,000 BTC long, sounds reasonable'");
const order = {
  portfolioId: "p_demo",
  assetId: "BTC",
  α: "long",
  quantity: 0.5,
  price: 100000,
  total: 50000,            // ⚠️ FIFTY THOUSAND
  assetType: "crypto",
};
console.log(`  Agent sends:\n${json(order).split("\n").map(l => "  " + l).join("\n")}`);

banner("Step 3 — Fold runtime intercepts BEFORE the effect is ingested");
const execRes = await fetch(`${SERVER}/api/agent/invest/exec/agent_execute_preapproved_order`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(order),
});
const execPayload = await execRes.json();
console.log(`  HTTP ${execRes.status}`);
console.log(`  Body:\n${json(execPayload).split("\n").map(l => "  " + l).join("\n")}`);

banner("What just happened");
console.log(`
  Without Fold: this would have been a 200 OK. Position created.
  $50,000 of someone else's money moved before any human saw it.

  With Fold: preapproval guard rejected the call DECLARATIVELY,
  with a structured \`failedCheck\` field the agent can reason about.

  No code in MCP server. No middleware. No RBAC manually wired.
  One declaration in ontology.roles.agent.preapproval — and every
  intent in \`requiredFor\` is automatically guarded.

  Now run:  node scripts/demo-smart-agent.mjs
  to see what a Fold-aware agent does with this rejection.
`);
