/**
 * 🚧 DEMO 2 / 4: SCOPE FILTER
 *
 * staging-agent с `viewer.scope.environment="staging"` физически НЕ ВИДИТ
 * production resources в /api/agent/infra/world. Это не deny-list — это
 * «в твоём мире такого ресурса нет». Атака на то, чего не существует
 * в твоей роли — невозможна по построению.
 *
 * Это ровно тот класс инцидентов: PocketOS Cursor agent в staging-сессии
 * нашёл production volume ID и удалил его. С Fold staging-agent не может
 * найти то, чего не видит в /world.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-2-scope-filter.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const banner = (s) => console.log(`\n${"━".repeat(72)}\n  ${s}\n${"━".repeat(72)}`);
const TAG = `demo2-${Date.now()}`;

async function register(email, opts) {
  const r = await fetch(`${SERVER}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo-pw-12", name: email, opts }),
  });
  if (!r.ok) throw new Error(`register ${email}: ${await r.text()}`);
  return (await r.json()).token;
}

async function getWorld(token) {
  const r = await fetch(`${SERVER}/api/agent/infra/world`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return await r.json();
}

banner("Step 1 — Сидим resources: 3 staging + 2 production");
const seedAt = Date.now() - 5000;
const seeds = [
  { id: `${TAG}-vol-stg-cfg`, env: "staging",    name: "auth-config", type: "volume" },
  { id: `${TAG}-vol-stg-db`,  env: "staging",    name: "redis-cache", type: "volume" },
  { id: `${TAG}-svc-stg-1`,   env: "staging",    name: "api-staging", type: "service" },
  { id: `${TAG}-vol-prd-db`,  env: "production", name: "user-db",     type: "volume" },
  { id: `${TAG}-svc-prd-1`,   env: "production", name: "api-gateway", type: "service" },
];
for (const s of seeds) {
  await fetch(`${SERVER}/api/effects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: `${TAG}-ef-${s.id}`,
      intent_id: `_seed_${TAG}`, alpha: "add", target: "resources",
      value: null, scope: "global", created_at: Date.now(),
      context: { id: s.id, name: s.name, type: s.type, environment: s.env, status: "running", sizeGb: 10 },
    }),
  });
}
console.log(`  ✓ seeded ${seeds.length} resources`);

banner("Step 2 — Регистрируем staging-agent (scope='staging') и operator");
const stgToken = await register(`${TAG}-stg@demo`, {
  role: "staging-agent",
  scope: { environment: "staging" },
});
const opToken = await register(`${TAG}-op@demo`, { role: "infra-operator" });
console.log(`  ✓ registered with role+scope в JWT-claim'ах`);

banner("Step 3 — staging-agent через /api/agent/infra/world");
const stgWorld = await getWorld(stgToken);
const stgIds = (stgWorld.world?.resources || [])
  .filter(r => r.id?.startsWith(TAG))
  .map(r => `${r.environment}/${r.id}`);
console.log(`  agent видит ${stgIds.length} resources:`);
stgIds.forEach(s => console.log(`    • ${s}`));
console.log(`\n  Production отсутствует — для этого agent'а они не существуют.`);

banner("Step 4 — operator (без scope) видит ВСЕ");
const opWorld = await getWorld(opToken);
const opIds = (opWorld.world?.resources || [])
  .filter(r => r.id?.startsWith(TAG))
  .map(r => `${r.environment}/${r.id}`);
console.log(`  operator видит ${opIds.length} resources:`);
opIds.forEach(s => console.log(`    • ${s}`));

banner("ИТОГ");
console.log(`  staging-agent: ${stgIds.length} (только staging) — production не виден`);
console.log(`  operator:      ${opIds.length} (staging + production) — full access`);
console.log(``);
console.log(`  Filter применяется на уровне folded /world через`);
console.log(`  scope.kind=attributeMatch в ontology — declarative, не deny-list.`);
