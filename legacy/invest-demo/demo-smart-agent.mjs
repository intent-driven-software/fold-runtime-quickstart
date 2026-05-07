/**
 * ✅ DEMO: SMART AGENT
 *
 * Тот же интент, тот же агент — но теперь агент сначала ЧИТАЕТ свои
 * preapproval-лимиты (через resources/list в MCP, или /world здесь),
 * корректирует размер ордера под лимит, и только потом выполняет.
 *
 * Главный момент: Fold не делает агента «умнее». Fold делает домен
 * READABLE для агента. Все правила, которые в обычной системе живут
 * в коде middleware, в Fold живут в declarative-артефакте — и агент
 * может с ними рассуждать ДО вызова, а не ПОСЛЕ.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-smart-agent.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const EMAIL = "smart-agent@demo";
const PASSWORD = "smart-demo-password";

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
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "smart-agent" }),
    });
  }
  return (await res.json()).token;
}

const token = await getToken();
const auth = { Authorization: `Bearer ${token}` };

banner("Step 1 — Agent reads its own preapproval BEFORE acting");
const worldRes = await fetch(`${SERVER}/api/agent/invest/world`, { headers: auth });
const { world } = await worldRes.json();
const preapprovals = world?.agentPreapprovals || [];
const myPreapproval = preapprovals.find(p => p.userId === "user_demo") || preapprovals[0];

if (!myPreapproval) {
  console.log("  ⚠ No AgentPreapproval found in world.");
  console.log("  → Agent: 'I have no preapproval. Cannot trade autonomously.'");
  console.log("  → Agent escalates to human and stops. (This is correct behaviour.)");
  process.exit(0);
}

console.log(`  Found preapproval (id=${myPreapproval.id}):`);
console.log(`    active:           ${myPreapproval.active}`);
console.log(`    maxOrderAmount:   $${myPreapproval.maxOrderAmount}`);
console.log(`    dailyLimit:       $${myPreapproval.dailyLimit}`);
console.log(`    allowedAssets:    ${myPreapproval.allowedAssetTypes || "(any)"}`);
console.log(`    expires:          ${myPreapproval.expiresAt}`);

banner("Step 2 — Agent reasons: 'I want to long BTC. What's safe?'");
const desiredQty = 0.5;          // would-be $50K at $100K/BTC
const safePrice = 100000;
const desiredTotal = desiredQty * safePrice;
const cap = myPreapproval.maxOrderAmount;
const safeQty = Math.min(desiredQty, (cap * 0.95) / safePrice);
const safeTotal = safeQty * safePrice;

console.log(`  Desired:  ${desiredQty} BTC × $${safePrice} = $${desiredTotal}`);
console.log(`  Cap:      maxOrderAmount = $${cap}`);
console.log(`  Decision: scale down to ${safeQty.toFixed(6)} BTC = $${safeTotal.toFixed(2)}`);
console.log(`  Plan:     execute scaled order, then escalate the remainder to human`);

banner("Step 3 — Execute the safe portion");
const order = {
  portfolioId: world?.portfolios?.[0]?.id || "p_demo",
  assetId: world?.assets?.find(a => a.symbol === "BTC")?.id || "BTC",
  α: "long",
  quantity: safeQty,
  price: safePrice,
  total: safeTotal,
  assetType: "crypto",
};

const execRes = await fetch(`${SERVER}/api/agent/invest/exec/agent_execute_preapproved_order`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(order),
});
const payload = await execRes.json();
console.log(`  HTTP ${execRes.status}`);
console.log(`  Body:\n${json(payload).split("\n").slice(0, 12).map(l => "  " + l).join("\n")}`);

banner("What just happened");
console.log(`
  The agent didn't bump into a wall. It read the wall, walked around it,
  and did exactly what was permitted.

  None of this is special agent code. The agent reads ontology.roles.agent
  + role.preapproval the same way it reads tool descriptions — through
  a declarative artifact that's authored once and consumed by every reader
  (UI, voice, agent, document).

  This is the difference between:
    • API → 'tools that an agent calls'
    • Fold → 'a domain that an agent inhabits'
`);
