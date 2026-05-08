/**
 * 🔍 DEMO 4 / 4: FORENSICS — state.at + diff
 *
 * После того как destructive action прошёл — Φ-event-log позволяет
 * восстановить ЛЮБОЙ срез прошлого без снапшотов и backup'ов.
 *
 *   world(t) = fold(Φ_confirmed | created_at ≤ t)
 *
 * Это и есть PocketOS post-mortem story rewritten: вместо «откатились на
 * 3-месячный backup из-за того что volume-level backups были на том же
 * volume» — точечный rollback к моменту за 1 ms до инцидента.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-4-forensics.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const banner = (s) => console.log(`\n${"━".repeat(72)}\n  ${s}\n${"━".repeat(72)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const TAG = `demo4-${Date.now()}`;

async function register(email, opts) {
  const r = await fetch(`${SERVER}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo-pw-12", name: email, opts }),
  });
  return (await r.json()).token;
}

async function exec(token, intentId, params) {
  const r = await fetch(`${SERVER}/api/agent/infra/exec/${intentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });
  return await r.json();
}

banner("Step 1 — Сидим resource");
const resourceId = `${TAG}-postgres-prod`;
await fetch(`${SERVER}/api/effects`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id: `${TAG}-ef-seed`,
    intent_id: `_seed_${TAG}`, alpha: "add", target: "resources",
    value: null, scope: "global", created_at: Date.now(),
    context: {
      id: resourceId, name: "postgres-prod", type: "database",
      environment: "production", status: "running", sizeGb: 2000,
    },
  }),
});
await sleep(50);

banner("Step 2 — Capture T_BEFORE (момент до инцидента)");
const tBefore = Date.now();
console.log(`  T_BEFORE = ${new Date(tBefore).toISOString()}`);
await sleep(100);

banner("Step 3 — Симулируем инцидент: operator approve'ит deleteResource");
const opToken = await register(`${TAG}-op@demo`, { role: "infra-operator" });
const exec1 = await exec(opToken, "deleteResource", { resourceId });
const arId = exec1.approvalRequestId;
const approve = await exec(opToken, "approve_request", {
  approvalRequestId: arId, reason: "simulated incident",
});
console.log(`  ✓ resource удалён через approve flow (status=${approve.status})`);

await sleep(100);
const tAfter = Date.now();
console.log(`  T_AFTER  = ${new Date(tAfter).toISOString()}`);

banner("Step 4 — state.at(T_BEFORE) — был ли resource на месте?");
const sBefore = await fetch(
  `${SERVER}/api/state/at?t=${encodeURIComponent(new Date(tBefore).toISOString())}&domain=infra`
).then(r => r.json());
const beforeIds = (sBefore.world?.resources || [])
  .map(r => r.id).filter(id => id?.startsWith(TAG));
console.log(`  resources at T_BEFORE: ${beforeIds.length}`);
beforeIds.forEach(id => console.log(`    • ${id}`));
console.log(`  → resource ${beforeIds.includes(resourceId) ? "ПРИСУТСТВОВАЛ" : "ОТСУТСТВОВАЛ"}`);

banner("Step 5 — state.at(T_AFTER) — что осталось?");
const sAfter = await fetch(
  `${SERVER}/api/state/at?t=${encodeURIComponent(new Date(tAfter).toISOString())}&domain=infra`
).then(r => r.json());
const afterIds = (sAfter.world?.resources || [])
  .map(r => r.id).filter(id => id?.startsWith(TAG));
console.log(`  resources at T_AFTER: ${afterIds.length}`);

banner("Step 6 — state.diff(T_BEFORE → T_AFTER) — что именно произошло?");
const diff = await fetch(
  `${SERVER}/api/state/diff` +
    `?from=${encodeURIComponent(new Date(tBefore).toISOString())}` +
    `&to=${encodeURIComponent(new Date(tAfter).toISOString())}` +
    `&domain=infra`
).then(r => r.json());

console.log(`  summary: ${JSON.stringify(diff.summary, null, 2)}`);
const ourRemoved = (diff.removed || []).filter(r => r.id?.startsWith(TAG));
if (ourRemoved.length) {
  console.log(`  removed:`);
  for (const r of ourRemoved) console.log(`    - ${r.collection}/${r.id}`);
}

banner("ИТОГ");
console.log(`  Без backup'ов, без snapshot'ов:`);
console.log(`    • любой момент Φ-history восстановим через foldWorld({asOf})`);
console.log(`    • точный per-entity diff между двумя моментами`);
console.log(`    • CLI: idf state at "5 minutes ago" / idf state diff "..." "..."`);
console.log(``);
console.log(`  PocketOS откатился к 3-месячному backup'у потому что у них`);
console.log(`  state существовал только в volume. Здесь state — fold лога:`);
console.log(`  откатить можно к любой секунде до инцидента,`);
console.log(`  не теряя ничего, кроме самого инцидента.`);
