
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// ======== Config ========
const BASE_URL   = __ENV.BASE_URL   || 'http://localhost:8080';
const DATA_FILE  = __ENV.DATA_FILE  || '../data/voters.csv';
const TIMEOUT_MS = Number(__ENV.TIMEOUT_MS || 2000);
const SCENARIO   = (__ENV.SCENARIO || 'baseline').toLowerCase();
const SLEEP_MS   = Number(__ENV.SLEEP_MS   || 0);

// Custom metrics
const registerDuration = new Trend('register_duration');
const registerFailed   = new Rate('register_failed');

// Datos CSV – cargados una sola vez en memoria compartida
const voters = new SharedArray('voters', function () {
  const text  = open(DATA_FILE);
  const lines = text.trim().split(/\r?\n/).slice(1); // skip header
  return lines.map(l => {
    const parts = l.replace(/"/g, '').split(',');
    const [documentId, fullName, age, gender, cityCode, address, phone, email] = parts.map(x => x.trim());
    return { documentId, fullName, age: Number(age), gender, cityCode, address, phone, email };
  });
});

// ======== Escenarios ========
const scenarios = {
  baseline: {
    executor: 'constant-vus',
    vus: Number(__ENV.VU_BASE || 50),
    duration: '10m',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m',  target: Number(__ENV.VU_BASE || 50)   },
      { duration: '10m', target: Number(__ENV.VU_PEAK || 200)  },
      { duration: '20m', target: Number(__ENV.VU_PEAK || 200)  },
      { duration: '5m',  target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '5m',  target: Number(__ENV.VU_BASE || 200)  },
      { duration: '10m', target: Number(__ENV.VU_PEAK || 600)  },
      { duration: '5m',  target: 0 },
    ],
    gracefulRampDown: '30s',
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 50  },
      { duration: '2m', target: 300 },
      { duration: '3m', target: 50  },
      { duration: '2m', target: 0   },
    ],
    gracefulRampDown: '30s',
  },
  soak: {
    executor: 'constant-vus',
    vus: Number(__ENV.VU_SOAK || 120),
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

export const options = {
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    register_failed:   ['rate<0.01'],
    register_duration: ['p(95)<300', 'p(99)<800'],
  },
  discardResponseBodies: false,
  insecureSkipTLSVerify: true,
  noConnectionReuse: false,
  userAgent: 'k6-registrar-votante/1.0',
  scenarios: { run: scenarios[SCENARIO] || scenarios['baseline'] },
};

// ======== Helper ========
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildUniqueId(documentId) {
  // Evita colisiones entre VUs: prefijo VU + iteración
  return `${__VU}${String(__ITER).padStart(6, '0')}`;
}

// ======== Test Function ========
export default function () {
  const v = pickOne(voters);

  // Mapeamos voters.csv al DTO que acepta POST /register
  // (misma estructura que PersonDTO: name, id, age, gender, alive)
  const payload = JSON.stringify({
    name:   v.fullName,
    id:     Number(buildUniqueId(v.documentId)),
    age:    v.age,
    gender: mapGender(v.gender),
    alive:  true,
  });

  const params = {
    headers: {
      'Content-Type':    'application/json',
      'Idempotency-Key': `${__VU}-${__ITER}`,
    },
    timeout: `${TIMEOUT_MS}ms`,
    tags:    { endpoint: '/register', scenario: SCENARIO, dataset: 'voters' },
  };

  const res = http.post(`${BASE_URL}/register`, payload, params);

  registerDuration.add(res.timings.duration);

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'body VALID': (r) => String(r.body || '').trim().toUpperCase().includes('VALID'),
  });

  registerFailed.add(!ok);

  if (SLEEP_MS > 0) sleep(SLEEP_MS / 1000.0);
}

function mapGender(code) {
  const map = { M: 'MALE', F: 'FEMALE', O: 'MALE', m: 'MALE', f: 'FEMALE', o: 'MALE' };
  return map[code] || 'MALE';
}

export function handleSummary(data) {
  return { [`perf/results/voter-summary-${SCENARIO}.json`]: JSON.stringify(data, null, 2) };
}
