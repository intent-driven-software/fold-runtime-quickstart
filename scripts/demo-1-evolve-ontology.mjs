/**
 * 🧬 DEMO 1 / 4: ONTOLOGY EVOLUTION
 *
 * Author меняет описание домена (добавляет поле). Все 4 материализации
 * (UI / agent / voice / document) видят новое поле автоматически. Diff
 * показывает что именно изменилось — на уровне field, не байт.
 *
 * Это иллюстрирует свойство IDF: ontology — данные, не код. Изменение
 * описания эквивалентно изменению product-поведения, без коммита-деплоя.
 *
 * Usage:
 *   IDF_SERVER=http://localhost:3001 node scripts/demo-1-evolve-ontology.mjs
 */

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const banner = (s) => console.log(`\n${"━".repeat(72)}\n  ${s}\n${"━".repeat(72)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ONTOLOGY_V1 = {
  domain: "infra",
  entities: {
    Resource: {
      ownerField: null,
      fields: {
        id:          { type: "text" },
        name:        { type: "text" },
        type:        { type: "select", options: ["volume", "service", "database"] },
        environment: { type: "select", options: ["staging", "production"] },
        status:      { type: "select", options: ["running", "stopped", "deleted"] },
        sizeGb:      { type: "number" },
      },
    },
  },
  roles: {
    "infra-operator": {
      base: "admin",
      visibleFields: { Resource: ["id", "name", "type", "environment", "status", "sizeGb"] },
      canExecute: ["deleteResource", "restartResource", "scaleResource", "viewResource"],
    },
    "staging-agent": {
      base: "agent",
      visibleFields: { Resource: ["id", "name", "type", "environment", "status"] },
      canExecute: ["deleteResource", "restartResource", "scaleResource", "viewResource"],
      scope: {
        Resource: { kind: "attributeMatch", viewerField: "scope.environment", entityField: "environment" },
      },
    },
  },
};

// V2 = V1 + `tags` field on Resource. Реалистично: добавили labeling.
const ONTOLOGY_V2 = JSON.parse(JSON.stringify(ONTOLOGY_V1));
ONTOLOGY_V2.entities.Resource.fields.tags = { type: "text", label: "Tags" };

banner("Step 1 — Author публикует Resource ontology (V1)");
const t1Before = Date.now();
const v1 = await fetch(`${SERVER}/api/typemap?domain=infra`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(ONTOLOGY_V1),
}).then(r => r.json());
console.log(`  ontology version: ${v1.ontologyVersion?.id || "(reused)"}`);
console.log(`  Resource fields: id, name, type, environment, status, sizeGb`);

await sleep(1500);

banner("Step 2 — Автор добавил поле 'tags' через studio (или прямой POST)");
const v2 = await fetch(`${SERVER}/api/typemap?domain=infra`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(ONTOLOGY_V2),
}).then(r => r.json());
console.log(`  ontology version: ${v2.ontologyVersion?.id || "(unchanged)"}`);
const t1After = Date.now();

banner("Step 3 — diff показывает что именно изменилось");
const diffUrl =
  `${SERVER}/api/state/diff` +
  `?from=${encodeURIComponent(new Date(t1Before).toISOString())}` +
  `&to=${encodeURIComponent(new Date(t1After).toISOString())}` +
  `&domain=infra&withOntology=1`;
const diff = await fetch(diffUrl).then(r => r.json());

if (diff.ontologyDiff) {
  const summary = diff.ontologyDiff.summary;
  console.log(`  ontologyDiff.summary.totalChanges: ${summary.totalChanges}`);
  for (const e of diff.ontologyDiff.entities.modified || []) {
    console.log(`  ~ entity '${e.name}':`);
    for (const c of e.changes) {
      console.log(`      ${c.kind} field '${c.field}': ${JSON.stringify(c.spec || c.after)}`);
    }
  }
  for (const e of diff.ontologyDiff.entities.added || []) {
    console.log(`  + entity added: ${e.name}`);
  }
}

banner("Step 4 — что увидят 4 материализации одновременно?");
console.log(`  • Pixels (UI):     форма получает text-input для 'tags'`);
console.log(`  • Agent (MCP):     /api/agent/infra/schema показывает tags в parameters`);
console.log(`  • Document:        /api/document/infra/ResourceList добавляет колонку`);
console.log(`  • Voice:           /api/voice/infra/ResourceDetail упоминает tags`);
console.log(``);
console.log(`  Это происходит без re-deploy'а. Ontology — данные, не код.`);
