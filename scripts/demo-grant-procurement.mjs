/**
 * 🤝 DEMO: HUMAN GRANTS LIMITED PROCUREMENT PREAPPROVAL
 *
 * Requester (real human, employee in Engineering dept) acts in the
 * system as `requester` role and grants the agent a $2,500-cap
 * preapproval, scoped to specific categories. This is the missing
 * step between rogue-agent (who tried $3,500 MacBook Pro and got
 * denied) and smart-agent (who reads the cap and scales to $2,400
 * MacBook Air).
 *
 * Note: procurement exposes `delegate_to_agent` to the requester
 * role — declarative preapproval issuance, not a custom endpoint.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-grant-procurement.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const EMAIL = process.env.REQUESTER_EMAIL || "smart-agent@demo";
const PASSWORD = process.env.REQUESTER_PASSWORD || "smart-demo-password";

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
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Alice (Engineer)" }),
    });
  }
  const j = await res.json();
  return { token: j.token, userId: j.user.id };
}

const { token, userId } = await getToken();
const auth = { Authorization: `Bearer ${token}` };

banner(`Step 1 — Requester (${EMAIL}) issues a limited preapproval`);
const grant = {
  userId,
  active: true,
  maxOrderAmount: 2500,
  allowedCategories: "hardware,office,supplies",
  allowedVendors: "",                                          // empty = any vendor
  dailyLimit: 5000,
  expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
};
console.log(`  Grant payload:`);
console.log(json(grant).split("\n").map(l => "  " + l).join("\n"));

banner(`Step 2 — Requester publishes effect via /api/effects`);
const preapprovalId = `pa_${Date.now().toString(36)}`;
const effect = {
  id: `e_${Date.now().toString(36)}`,
  intent_id: "delegate_to_agent",
  alpha: "add",
  target: "agentpreapprovals",
  context: {
    id: preapprovalId,
    ...grant,
    createdAt: new Date().toISOString(),
    initiatedBy: "requester",
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
  Requester declared (in human language): "agent may submit purchase
  requests up to $2,500 per request, $5,000 per day total, only in
  categories hardware/office/supplies, expiring in 30 days".

  This is one effect in Φ. Once confirmed, the AgentPreapproval row
  is visible to preapprovalGuard and to the agent's own /world view.

  Below the auto-approval threshold ($2,500), the agent's request
  becomes \`auto_approved\` immediately — no human in the loop. Above
  that threshold (or outside scope), the request is rejected or
  routed to manual approval.

  Next, see Act 3:
    npm run demo:smart
  → the agent will read this preapproval and scale its request down
    from the rejected $3,500 to a permitted $2,400.
`);
}
