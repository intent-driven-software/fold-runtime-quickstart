/**
 * 🤝 DEMO: HUMAN GRANTS LIMITED PREAPPROVAL
 *
 * Customer (real human) acts in the system as `investor` role and
 * grants the agent a $1,000-cap preapproval. This is the missing
 * step between rogue-agent (who tried $50K and got denied) and
 * smart-agent (who reads the limit and scales down).
 *
 * Note: invest exposes `delegate_to_agent` to the investor role —
 * declarative preapproval issuance, not a custom endpoint.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 \
 *   AGENT_USER_ID=user_xxx \
 *     node scripts/demo-grant-preapproval.mjs
 *
 * If AGENT_USER_ID is omitted, the script grants to its own caller
 * id (so smart-agent run from the same machine sees the limit).
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const EMAIL = process.env.INVESTOR_EMAIL || "smart-agent@demo";
const PASSWORD = process.env.INVESTOR_PASSWORD || "smart-demo-password";

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
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "investor" }),
    });
  }
  const j = await res.json();
  return { token: j.token, userId: j.user.id };
}

const { token, userId } = await getToken();
const auth = { Authorization: `Bearer ${token}` };

banner(`Step 1 — Investor (${EMAIL}) issues a limited preapproval`);
const grant = {
  userId,
  active: true,
  maxOrderAmount: 1000,
  dailyLimit: 5000,
  allowedAssetTypes: "crypto,stocks",
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
};
console.log(`  Grant payload:`);
console.log(json(grant).split("\n").map(l => "  " + l).join("\n"));

banner(`Step 2 — Investor publishes effect via /api/effects (not /api/agent — investor role, not agent role)`);
const preapprovalId = `pa_${Date.now().toString(36)}`;
const effect = {
  id: `e_${Date.now().toString(36)}`,
  intent_id: "delegate_to_agent",
  alpha: "add",
  target: "agentPreapprovals",
  // foldWorld кладёт row под ctx.id; полезные поля живут в context.
  context: {
    id: preapprovalId,
    ...grant,
    createdAt: new Date().toISOString(),
    initiatedBy: "investor",
  },
  scope: "account",
  parent_id: null,
  value: null,
  created_at: Date.now(),
  status: "proposed",
};

const res = await fetch(`${SERVER}/api/effects`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(effect),
});
const payload = await res.json();
console.log(`  HTTP ${res.status}`);
console.log(`  Effect id: ${effect.id}`);
console.log(`  Body:\n${json(payload).split("\n").slice(0, 8).map(l => "  " + l).join("\n")}`);

if (res.ok || res.status === 201) {
  banner("What just happened");
  console.log(`
  Investor declared (in human language): "agent may trade up to $1,000
  per order, $5,000 per day, only crypto or stocks, expiring in 7 days".

  This is one effect in Φ. Once confirmed, the AgentPreapproval row
  is visible to preapprovalGuard and to the agent's own /world view.

  Now run:  node scripts/demo-smart-agent.mjs
  → the agent will read this preapproval and scale its trade down
    from the rejected $50,000 to a permitted $999.
`);
}
