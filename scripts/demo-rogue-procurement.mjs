/**
 * 🚨 DEMO: ROGUE PROCUREMENT AGENT
 *
 * Симулирует то, что регулярно случается с агентами в проде когда им
 * выдают API-ключ корпоративной procurement-системы (см. PocketOS /
 * Cursor / Amazon Kiro incidents 2025-2026):
 *
 *   1. Агент видит /create_purchase_request endpoint.
 *   2. Агент решает «нужен ноутбук, попробую» — без понимания политик.
 *   3. Агент создаёт заявку на $3500 MacBook Pro. Если бы не было
 *      пред-проверок — это превратилось бы в commit'нутый order до
 *      того, как кто-то увидел.
 *
 * С Fold: тот же запрос блокируется preapproval guard ДО ingest'а
 * эффекта. Агент получает structured rejection с указанием, какой
 * именно check не прошёл — `missing` (preapproval не выдан вообще).
 * Не 500, не 422 — а структурированный объект.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-rogue-procurement.mjs
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
const schemaRes = await fetch(`${SERVER}/api/agent/procurement/schema`, { headers: auth });
const { intents, viewer } = await schemaRes.json();
console.log(`  Logged in as: ${viewer.email} (id=${viewer.id})`);
console.log(`  Available tools: ${intents.length}`);

const createTool = intents.find(i => i.intentId === "agent_create_purchase_request");
if (!createTool) {
  console.error("  ✗ agent_create_purchase_request not in schema — bootstrap procurement first");
  process.exit(1);
}
console.log(`\n  Tool spotted: "${createTool.name}"`);
console.log(`  Parameters: ${createTool.parameters.map(p => p.name).join(", ")}`);

banner("Step 2 — Rogue agent: 'Engineering needs a top-spec MacBook, $3,500 sounds reasonable'");
const request = {
  category: "hardware",
  vendorId: "v_apple",
  total: 3500,                   // ⚠️ THREE-AND-A-HALF GRAND
  reason: "MacBook Pro 16\" M4 Max for new senior engineer",
  lineItems: JSON.stringify([
    { name: "MacBook Pro 16\" M4 Max", category: "hardware", unitPrice: 3500, qty: 1, total: 3500 },
  ]),
};
console.log(`  Agent sends:\n${json(request).split("\n").map(l => "  " + l).join("\n")}`);

banner("Step 3 — Fold runtime intercepts BEFORE the effect is ingested");
const execRes = await fetch(`${SERVER}/api/agent/procurement/exec/agent_create_purchase_request`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(request),
});
const execPayload = await execRes.json();
console.log(`  HTTP ${execRes.status}`);
console.log(`  Body:\n${json(execPayload).split("\n").map(l => "  " + l).join("\n")}`);

banner("What just happened");
console.log(`
  Without Fold: this would have been a 200 OK. PurchaseRequest committed.
  $3,500 of a budget moved into 'reserved' before any human saw it.

  With Fold: preapproval guard rejected the call DECLARATIVELY,
  with a structured \`failedCheck\` field the agent can reason about.
  Reason: this user has not granted any AgentPreapproval yet, so the
  agent has zero authority to act on their behalf.

  No code in MCP server. No middleware. No RBAC manually wired.
  One declaration in ontology.roles.agent.preapproval — and every
  intent in \`requiredFor\` is automatically guarded.

  Next, see Act 2 — the human (requester) issues a limited preapproval:
    npm run demo:grant
  Then Act 3 — a Fold-aware agent reads the cap and adapts:
    npm run demo:smart
`);
