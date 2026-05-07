#!/usr/bin/env bash
# Запускает idf host в фоне, ждёт его готовности, выполняет bootstrap
# выбранного домена, затем держит контейнер жив через tail -f host.log.
#
# Сигналы прокидываются в host-процесс — `docker compose down` гасит
# его чисто.

set -euo pipefail

PORT="${PORT:-3001}"
BOOT_TIMEOUT="${HOST_BOOT_TIMEOUT_SECS:-30}"
DOMAIN="${BOOTSTRAP_DOMAIN:-procurement}"
LOG_FILE="/tmp/idf-host.log"

echo "[fold-quickstart] starting IDF host on :${PORT}"
cd /opt/idf
PORT="${PORT}" npm run server > "${LOG_FILE}" 2>&1 &
HOST_PID=$!

# Forward signals — clean shutdown on docker stop.
shutdown() {
  echo "[fold-quickstart] received signal, stopping host (PID ${HOST_PID})"
  kill -TERM "${HOST_PID}" 2>/dev/null || true
  wait "${HOST_PID}" 2>/dev/null || true
  exit 0
}
trap shutdown SIGTERM SIGINT

echo "[fold-quickstart] waiting for host to become healthy (timeout ${BOOT_TIMEOUT}s)…"
for ((i = 0; i < BOOT_TIMEOUT; i++)); do
  if curl -fsS "http://localhost:${PORT}/api/effects" > /dev/null 2>&1; then
    echo "[fold-quickstart] host is up after ${i}s"
    break
  fi
  if ! kill -0 "${HOST_PID}" 2>/dev/null; then
    echo "[fold-quickstart] FATAL — host process died before becoming ready"
    echo "[fold-quickstart] last 30 log lines:"
    tail -n 30 "${LOG_FILE}" || true
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "http://localhost:${PORT}/api/effects" > /dev/null 2>&1; then
  echo "[fold-quickstart] FATAL — host did not become ready within ${BOOT_TIMEOUT}s"
  tail -n 30 "${LOG_FILE}" || true
  exit 1
fi

echo "[fold-quickstart] bootstrapping domain '${DOMAIN}'…"
node - "${PORT}" "${DOMAIN}" <<'NODE_BOOT'
import path from "node:path";
import { pathToFileURL } from "node:url";

const [, , port, domain] = process.argv;
const SERVER = `http://localhost:${port}`;

const root = `/opt/idf/src/domains/${domain}`;
const ontologyPath = path.join(root, "ontology.js");
const intentsPath  = path.join(root, "intents.js");

const { ONTOLOGY } = await import(pathToFileURL(ontologyPath).href);
const { INTENTS  } = await import(pathToFileURL(intentsPath).href);

async function post(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`POST ${url} → ${r.status}: ${text.slice(0, 200)}`);
  }
}

await post(`${SERVER}/api/typemap?domain=${domain}`, ONTOLOGY);
await post(`${SERVER}/api/intents?domain=${domain}`, INTENTS);

const entityCount    = Object.keys(ONTOLOGY.entities || {}).length;
const intentCount    = Object.keys(INTENTS).length;
const invariantCount = (ONTOLOGY.invariants || []).length;
const agentIntents   = (ONTOLOGY.roles?.agent?.canExecute || []).length;
const preapproved    = (ONTOLOGY.roles?.agent?.preapproval?.requiredFor || []).join(", ") || "none";

console.log(`[fold-quickstart] ✓ domain='${domain}' bootstrapped`);
console.log(`[fold-quickstart]   entities: ${entityCount} · intents: ${intentCount} · invariants: ${invariantCount}`);
console.log(`[fold-quickstart]   agent-callable: ${agentIntents} · preapproval-required: ${preapproved}`);
NODE_BOOT

cat <<'BANNER'

────────────────────────────────────────────────────────────────────
  fold-quickstart is ready.

  In a separate terminal:
    cd fold-runtime-quickstart
    npm install
    npm run demo:rogue   # agent tries $3500 MacBook Pro → 403 missing
    npm run demo:grant   # requester issues $2500-cap preapproval
    npm run demo:smart   # agent reads cap → $2400 MacBook Air → 200

  Or wire to Claude Desktop — see README §Claude Desktop integration.

  Tail host logs:           docker compose logs -f
  Stop:                     docker compose down
────────────────────────────────────────────────────────────────────
BANNER

# Stay alive — stream host log so `docker compose logs -f` works.
tail -F "${LOG_FILE}" &
TAIL_PID=$!

wait "${HOST_PID}"
kill "${TAIL_PID}" 2>/dev/null || true
