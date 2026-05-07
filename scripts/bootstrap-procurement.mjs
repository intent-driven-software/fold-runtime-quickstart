/**
 * Bootstrap real `procurement` domain в running IDF host. Загружает
 * ontology + intents из локального checkout idf-repo и регистрирует
 * через /api/typemap + /api/intents.
 *
 * Demo нарратив: corporate procurement с budget approval — каждая
 * компания знает «согласование закупки». Агент с preapproval может
 * автоматически создавать заявки до tier-1 порога ($2500), всё выше
 * блокируется guard'ом или маршрутизируется на manual approval.
 *
 * Usage:
 *   IDF_REPO=/path/to/idf IDF_SERVER=http://localhost:3001 \
 *     node scripts/bootstrap-procurement.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const IDF_REPO = process.env.IDF_REPO;
const DOMAIN = "procurement";

if (!IDF_REPO) {
  console.error("Set IDF_REPO=/absolute/path/to/idf checkout");
  console.error("  e.g.: IDF_REPO=$HOME/WebstormProjects/idf node scripts/bootstrap-procurement.mjs");
  process.exit(1);
}

const ontologyPath = path.join(IDF_REPO, "src/domains/procurement/ontology.js");
const intentsPath = path.join(IDF_REPO, "src/domains/procurement/intents.js");

const { ONTOLOGY } = await import(pathToFileURL(ontologyPath).href);
const { INTENTS } = await import(pathToFileURL(intentsPath).href);

const t = await fetch(`${SERVER}/api/typemap?domain=${DOMAIN}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(ONTOLOGY),
});
if (!t.ok) {
  console.error(`typemap failed: ${t.status} ${await t.text()}`);
  process.exit(1);
}

const i = await fetch(`${SERVER}/api/intents?domain=${DOMAIN}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(INTENTS),
});
if (!i.ok) {
  console.error(`intents failed: ${i.status} ${await i.text()}`);
  process.exit(1);
}

const intentCount = Object.keys(INTENTS).length;
const entityCount = Object.keys(ONTOLOGY.entities || {}).length;
const invariantCount = (ONTOLOGY.invariants || []).length;
const agentIntents = ONTOLOGY.roles?.agent?.canExecute || [];
const preapproved = ONTOLOGY.roles?.agent?.preapproval?.requiredFor || [];

console.log(`✓ bootstrapped: domain=${DOMAIN}`);
console.log(`  entities: ${entityCount} · intents: ${intentCount} · invariants: ${invariantCount}`);
console.log(`  agent-callable: ${agentIntents.length} intents`);
console.log(`  preapproval-required: ${preapproved.join(", ") || "none"}`);
console.log(`\nNext: add to Claude Desktop config (see README) and restart Claude.`);
