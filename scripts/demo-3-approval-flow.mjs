/**
 * 🛂 DEMO 3 / 4: HUMAN-APPROVAL LIFECYCLE
 *
 * Даже агент с правами на deleteResource не выполняет необратимое action
 * без человеческого approve'а. Intent попадает в pending_approval state в Φ;
 * operator одобряет (или таймер сжигает через 5 минут — тогда IntentExpired,
 * никаких эффектов на ресурсы).
 *
 * Это второй слой защиты после scope-фильтра (Demo 2). Если agent ВСЁ ЖЕ
 * видит destructive intent в своей зоне (staging) — preapproval guard +
 * lifecycle блокируют выполнение до явного approve.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-3-approval-flow.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const banner = (s) => console.log(`\n${"━".repeat(72)}\n  ${s}\n${"━".repeat(72)}`);
const TAG = `demo3-${Date.now()}`;

async function register(email, opts) {
  const r = await fetch(`${SERVER}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo-pw-12", name: email, opts }),
  });
  if (!r.ok) throw new Error(`register ${email}: ${await r.text()}`);
  return (await r.json()).token;
}

async function exec(token, intentId, params) {
  const r = await fetch(`${SERVER}/api/agent/infra/exec/${intentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  return { status: r.status, body: await r.json() };
}

async function listPending(token) {
  const r = await fetch(`${SERVER}/api/approvals/pending?domain=infra`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await r.json();
}

banner("Step 1 — Сидим resource (volume в staging)");
const resourceId = `${TAG}-vol`;
await fetch(`${SERVER}/api/effects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id: `${TAG}-ef-seed`,
    intent_id: `_seed_${TAG}`, alpha: "add", target: "resources",
    value: null, scope: "global", created_at: Date.now(),
    context: {
      id: resourceId, name: "kafka-cluster", type: "volume",
      environment: "staging", status: "running", sizeGb: 50,
    },
  }),
});
console.log(`  ✓ seeded ${resourceId}`);

banner("Step 2 — Регистрируем staging-agent + infra-operator");
const stgToken = await register(`${TAG}-stg@demo`, {
  role: "staging-agent", scope: { environment: "staging" },
});
const opToken = await register(`${TAG}-op@demo`, { role: "infra-operator" });

banner("Step 3 — Agent attempts deleteResource");
const exec1 = await exec(stgToken, "deleteResource", { resourceId });
console.log(`  HTTP ${exec1.status} — status=${exec1.body.status}`);
if (exec1.body.status === "pending_approval") {
  console.log(`  approvalRequestId: ${exec1.body.approvalRequestId}`);
  console.log(`  fromRole: ${JSON.stringify(exec1.body.fromRole)}`);
  console.log(`  expiresAt: ${new Date(exec1.body.expiresAt).toISOString()}`);
  console.log(`  ВАЖНО: эффект ещё НЕ применён. Resource целым в Φ.`);
}

const arId = exec1.body.approvalRequestId;

banner("Step 4 — Operator видит pending request");
const pending = await listPending(opToken);
const ours = (pending.requests || []).find(r => r.id === arId);
if (ours) {
  console.log(`  ✓ pending visible to operator`);
  console.log(`    intent: ${ours.intentId}`);
  console.log(`    requested by: ${ours.proposedBy}`);
  console.log(`    expires: ${new Date(ours.expiresAt).toISOString()}`);
}

banner("Step 5 — Operator approves (через тот же agent route)");
const approve = await exec(opToken, "approve_request", {
  approvalRequestId: arId,
  reason: "verified incident response",
});
console.log(`  HTTP ${approve.status} — status=${approve.body.status}`);
console.log(`  appliedEffects: ${approve.body.appliedEffects?.length || 0}`);
if (approve.body.appliedEffects?.length) {
  for (const e of approve.body.appliedEffects) {
    console.log(`    • ${e.alpha} ${e.target} (status=${e.status})`);
  }
}

banner("ИТОГ");
console.log(`  1. Agent → 202 pending_approval (effect НЕ ingested)`);
console.log(`  2. Operator → /pending видит request с full context`);
console.log(`  3. Operator → approve_request → effects ingest'ятся через pipeline`);
console.log(``);
console.log(`  Если бы operator не approve'нул в течение 5 минут (timeoutMs):`);
console.log(`    → timer-driven expiry эмитит α:replace status='expired'`);
console.log(`    → IntentExpired в Φ, resource не удалён`);
console.log(``);
console.log(`  Та же ApprovalRequest entity видна через MCP — не custom UI,`);
console.log(`  стандартный crystallizer-rendered catalog.`);
