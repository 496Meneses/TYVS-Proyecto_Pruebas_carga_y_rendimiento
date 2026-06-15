
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

/**
 * =========================
 * Configuración por entorno
 * =========================
 */
const BASE_URL   = __ENV.BASE_URL  || 'http://localhost:8080';
const DATA_FILE  = __ENV.DATA_FILE || null;
const SCENARIO   = (__ENV.SCENARIO || 'baseline').toLowerCase();
const TIMEOUT_MS = Number(__ENV.TIMEOUT_MS || 2000);
const SLEEP_MS   = Number(__ENV.SLEEP_MS   || 0);

/**
 * =========================
 * Métricas personalizadas
 * =========================
 */
const registerDuration = new Trend('register_duration');   // duración de /register
const registerFailed   = new Rate('register_failed');      // check fallido
const statusCount      = new Counter('status_count');      // contador por código HTTP

/**
 * =========================
 * Carga de dataset (CSV)
 * =========================
 * Intenta en orden:
 *   1. __ENV.DATA_FILE (si se definió)
 *   2. 'perf/data/persons.csv'  (desde raíz del repo)
 *   3. '../data/persons.csv'    (desde perf/scripts/)
 */
function tryOpen(path) {
  try { return open(path); } catch (_) { return null; }
}

const persons = new SharedArray('persons', function () {
  let csvText = null;
  if (DATA_FILE) {
    csvText = tryOpen(DATA_FILE);
    if (!csvText) throw new Error(`No se pudo abrir DATA_FILE='${DATA_FILE}'.`);
  } else {
    csvText = tryOpen('perf/data/persons.csv') || tryOpen('../data/persons.csv');
    if (!csvText) throw new Error('No se encontró persons.csv. Usa __ENV.DATA_FILE o ejecuta desde la raíz del repo.');
  }
  const lines = csvText.trim().split(/\r?\n/);
  lines.shift(); // descartar cabecera
  return lines.map((l) => {
    const parts = l.replace(/"/g, '').split(',');
    const [id, name, age, gender, alive] = parts.map((x) => String(x).trim());
    return { id: Number(id), name, age: Number(age), gender, alive: alive.toLowerCase() === 'true' };
  });
});

/**
 * =========================
 * SLOs y Thresholds
 * =========================
 *  SLO-01: p95 < 300 ms
 *  SLO-02: p99 < 800 ms
 *  SLO-03: error rate < 1%
 */
const THRESHOLDS = {
  http_req_failed:                   ['rate<0.01'],
  'http_req_duration{status:200}':   ['p(95)<300', 'p(99)<800'],
  register_failed:                   ['rate<0.01'],
};

/**
 * =========================
 * Escenarios disponibles
 * =========================
 */
const ALL_SCENARIOS = {
  baseline: {
    executor: 'constant-vus',
    vus: 20,
    duration: '5m',
    gracefulStop: '30s',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m',  target: 200 },
      { duration: '10m', target: 200 },
      { duration: '2m',  target: 0   },
    ],
    gracefulRampDown: '30s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 200,
    stages: [
      { duration: '5m', target: 600 },
      { duration: '3m', target: 600 },
      { duration: '2m', target: 0   },
    ],
    gracefulRampDown: '30s',
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 50,
    stages: [
      { duration: '1m', target: 300 },
      { duration: '2m', target: 50  },
      { duration: '1m', target: 0   },
    ],
    gracefulRampDown: '30s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 100,
    duration: '2h',
    gracefulStop: '1m',
  },
  regression: {
    executor: 'constant-vus',
    vus: 20,
    duration: '5m',
    gracefulStop: '30s',
  },
};

function buildOptions() {
  const chosen = ALL_SCENARIOS[SCENARIO];
  if (!chosen) console.warn(`SCENARIO='${SCENARIO}' no reconocido. Usando 'baseline'.`);
  return {
    thresholds: THRESHOLDS,
    scenarios: { run: chosen || ALL_SCENARIOS['baseline'] },
    discardResponseBodies: false,
    noConnectionReuse: false,
  };
}

export const options = buildOptions();

/**
 * =========================
 * Generación de ID único
 * =========================
 */
function buildUniqueId() {
  // 1M IDs por VU → soporta 600 VUs × 1M = 600M < Integer.MAX_VALUE (2.147B)
  return ((__VU - 1) * 1000000) + (__ITER % 999999) + 1;
}

function nextPayload() {
  const p = persons[Math.floor(Math.random() * persons.length)];
  return JSON.stringify({
    name:   p.name,
    id:     buildUniqueId(),
    age:    p.age,
    gender: p.gender,
    alive:  p.alive,
  });
}

/**
 * =========================
 * Iteración principal
 * =========================
 */
export default function () {
  const payload = nextPayload();
  const params  = {
    headers: { 'Content-Type': 'application/json' },
    timeout: `${TIMEOUT_MS}ms`,
    tags:    { endpoint: '/register', scenario: SCENARIO },
  };

  const res = http.post(`${BASE_URL}/register`, payload, params);

  registerDuration.add(res.timings.duration, params.tags);
  statusCount.add(1, { status: String(res.status) });

  const bodyText = String(res.body || '').trim().toUpperCase();
  const ok = check(res, {
    'status 200':  (r) => r.status === 200,
    'body VALID':  (_) => bodyText.includes('VALID'),
  });

  registerFailed.add(!ok);

  if (!ok && (__ITER % 1000 === 0)) {
    console.error(`[ERR][${SCENARIO}] status=${res.status} body='${String(res.body).slice(0, 160)}'`);
  }

  if (SLEEP_MS > 0) sleep(SLEEP_MS / 1000.0);
}

/**
 * =========================
 * Resumen de salida
 * =========================
 */
export function handleSummary(data) {
  const path = `perf/results/summary-${SCENARIO || 'baseline'}.json`;
  return { [path]: JSON.stringify(data, null, 2) };
}
