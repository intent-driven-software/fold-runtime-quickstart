/**
 * Bootstrap real `infra` domain (Railway-style infrastructure provider:
 * Resource × volume/service/database × staging/production) в running IDF host.
 * Минимальный testbed для Fold-демо «9 seconds. Why agents wipe databases».
 *
 * Demo нарратив (4 акта):
 *   1. Ontology evolution — author adds field, all 4 materializations rebuild
 *   2. Scope filter — staging-agent физически не видит production resources
 *   3. Human-approval — даже agent с правами не выполняет destructive action
 *      без человеческого approve'а (timer-driven 5-min expiry)
 *   4. Forensics — state.at + diff: any moment of Φ-history без backup'ов
 *
 * Это ровно тот класс инцидентов, который случился в PocketOS 25 апреля 2026.
 *
 * Usage:
 *   IDF_REPO=/path/to/idf IDF_SERVER=http://localhost:3001 \
 *     node scripts/bootstrap-infra.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER = process.env.IDF_SERVER || "http://localhost:3001";
const IDF_REPO = process.env.IDF_REPO;
const DOMAIN = "infra";

if (!IDF_REPO) {
  console.error("Set IDF_REPO=/absolute/path/to/idf checkout");
  console.error("  e.g.: IDF_REPO=$HOME/WebstormProjects/idf node scripts/bootstrap-infra.mjs");
  process.exit(1);
}

const ontologyPath = path.join(IDF_REPO, "src/domains/infra/ontology.js");
const intentsPath = path.join(IDF_REPO, "src/domains/infra/intents.js");

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
const typemapResp = await t.json();

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
const roles = Object.keys(ONTOLOGY.roles || {});

console.log(`✓ bootstrapped: domain=${DOMAIN}`);
console.log(`  entities: ${entityCount} · intents: ${intentCount} · invariants: ${invariantCount}`);
console.log(`  roles: ${roles.join(", ")}`);
console.log(`  ontology version: ${typemapResp.ontologyVersion?.id || "(reused)"}`);
console.log(`\nNext: run demos`);
console.log(`  npm run demo:1   # ontology evolution (Akt 1)`);
console.log(`  npm run demo:2   # scope filter (Akt 2)`);
console.log(`  npm run demo:3   # human-approval (Akt 3)`);
console.log(`  npm run demo:4   # forensics (Akt 4)`);
