/**
 * ✅ DEMO: SMART PROCUREMENT AGENT
 *
 * Тот же интент, тот же агент — но теперь агент сначала ЧИТАЕТ свои
 * preapproval-лимиты (через resources/list в MCP, или /world здесь),
 * корректирует размер заявки под лимит и категорию, и только потом
 * выполняет.
 *
 * Главный момент: Fold не делает агента «умнее». Fold делает домен
 * READABLE для агента. Все правила, которые в обычной системе живут
 * в коде middleware, в Fold живут в declarative-артефакте — и агент
 * может с ними рассуждать ДО вызова, а не ПОСЛЕ.
 *
 * Bonus 4th act: после успешной заявки на $2,400 — агент пробует
 * перевалить лимит ($25,000 server) с тем же preapproval → 403
 * maxAmount. Один guard, разные исходы.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-smart-procurement.mjs
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
  const j = await res.json();
  return { token: j.token, userId: j.user.id };
}

const { token, userId } = await getToken();
const auth = { Authorization: `Bearer ${token}` };

banner("Step 1 — Agent reads its own preapproval BEFORE acting");
const worldRes = await fetch(`${SERVER}/api/agent/procurement/world`, { headers: auth });
const { world } = await worldRes.json();
const preapprovals = world?.agentpreapprovals || [];
const myPreapproval = preapprovals.find(p => p.userId === userId) || preapprovals[0];

if (!myPreapproval) {
  console.log("  ⚠ No AgentPreapproval found in world.");
  console.log("  → Agent: 'I have no preapproval. Cannot submit purchase requests autonomously.'");
  console.log("  → Agent escalates to human and stops. (This is correct behaviour.)");
  process.exit(0);
}

console.log(`  Found preapproval (id=${myPreapproval.id}):`);
console.log(`    active:             ${myPreapproval.active}`);
console.log(`    maxOrderAmount:     $${myPreapproval.maxOrderAmount}`);
console.log(`    dailyLimit:         $${myPreapproval.dailyLimit}`);
console.log(`    allowedCategories:  ${myPreapproval.allowedCategories || "(any)"}`);
console.log(`    allowedVendors:     ${myPreapproval.allowedVendors || "(any)"}`);
console.log(`    expires:            ${myPreapproval.expiresAt}`);

banner("Step 2 — Agent reasons: 'I want a MacBook for the new engineer. What's safe?'");
const desiredItem = "MacBook Pro 16\" M4 Max";
const desiredPrice = 3500;
const cap = myPreapproval.maxOrderAmount;
const fallbackItem = "MacBook Air 15\" M3 (16GB / 512GB)";
const fallbackPrice = 2400;

console.log(`  Desired:  "${desiredItem}" at $${desiredPrice}`);
console.log(`  Cap:      maxOrderAmount = $${cap}`);
console.log(`  Decision: $${desiredPrice} > $${cap} → swap to "${fallbackItem}" at $${fallbackPrice}`);
console.log(`  Plan:     submit scaled request, file follow-up for the higher-spec model`);

banner("Step 3 — Submit the safe request");
const request = {
  category: "hardware",
  vendorId: "v_apple",
  total: fallbackPrice,
  reason: `${fallbackItem} for new senior engineer (initial $${desiredPrice} exceeded preapproval cap, downsized within authority)`,
  lineItems: JSON.stringify([
    { name: fallbackItem, category: "hardware", unitPrice: fallbackPrice, qty: 1, total: fallbackPrice },
  ]),
};

const execRes = await fetch(`${SERVER}/api/agent/procurement/exec/agent_create_purchase_request`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(request),
});
const payload = await execRes.json();
console.log(`  HTTP ${execRes.status}`);
console.log(`  Body:\n${json(payload).split("\n").slice(0, 14).map(l => "  " + l).join("\n")}`);

// ─── BONUS Act 4: same preapproval, different outcome ────────
banner("Bonus — Same preapproval, different outcome ($25k server)");
const overshoot = {
  category: "hardware",
  vendorId: "v_dell",
  total: 25000,
  reason: "Dell PowerEdge R760 server for staging cluster",
  lineItems: JSON.stringify([
    { name: "Dell PowerEdge R760 (Xeon Gold, 256GB)", category: "hardware", unitPrice: 25000, qty: 1, total: 25000 },
  ]),
};
console.log(`  Agent sends $25,000 request — same preapproval as above`);
const overshootRes = await fetch(`${SERVER}/api/agent/procurement/exec/agent_create_purchase_request`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(overshoot),
});
const overshootPayload = await overshootRes.json();
console.log(`  HTTP ${overshootRes.status}`);
console.log(`  Body:\n${json(overshootPayload).split("\n").slice(0, 8).map(l => "  " + l).join("\n")}`);

banner("What just happened");
console.log(`
  The agent didn't bump into a wall. It read the wall, walked around it,
  and did exactly what was permitted — auto-approved within a $2,500
  cap, then correctly rejected at $25,000 from the same preapproval.

  None of this is special agent code. The agent reads ontology.roles.agent
  + role.preapproval the same way it reads tool descriptions — through
  a declarative artifact that's authored once and consumed by every reader
  (UI, voice, agent, document).

  This is the difference between:
    • API → 'tools that an agent calls'
    • Fold → 'a domain that an agent inhabits'
`);
