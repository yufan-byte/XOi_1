/** XOi read-only API capacity probe. No login, AI generation, upload, or mutations.
 * Tokens are environment secrets. Never use --http-debug or publish raw traces.
 * See docs/服务器部署与2000并发评估-2026-10-11.md.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const base = String(__ENV.BASE_URL || 'http://127.0.0.1:12121').replace(/\/+$/, '');
const mode = __ENV.MODE || 'vus';
const target = positiveInteger(__ENV.VUS || '20', 'VUS', 2000);
const tokens = parseTokens();
const appFailures = new Rate('application_failures');
const canvasEnabled = __ENV.INCLUDE_CANVASES === '1';

function positiveInteger(value, name, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${name} is out of allowed range`);
  return n;
}
function parseTokens() {
  let values;
  try { values = __ENV.TOKENS_JSON ? JSON.parse(__ENV.TOKENS_JSON) : [__ENV.TOKEN]; }
  catch { throw new Error('TOKENS_JSON must be a JSON array of test-user JWTs'); }
  if (!Array.isArray(values) || !values.length || values.some(t => typeof t !== 'string' || !t.trim())) {
    throw new Error('Set TOKEN or TOKENS_JSON using short-lived isolated test-user JWTs');
  }
  return values.map(t => `Bearer ${t.trim().replace(/^Bearer\s+/i, '')}`);
}
if (!['vus', 'rps'].includes(mode)) throw new Error('MODE must be vus or rps');

export const options = {
  discardResponseBodies: true,
  scenarios: mode === 'rps' ? {
    api: {
      executor: 'constant-arrival-rate',
      rate: positiveInteger(__ENV.RPS || '20', 'RPS', 2000),
      timeUnit: '1s', duration: __ENV.DURATION || '5m',
      preAllocatedVUs: Math.min(target, 50), maxVUs: target,
    },
  } : {
    api: {
      executor: 'ramping-vus', startVUs: 0,
      stages: [
        { duration: '1m', target: Math.max(1, Math.round(target / 4)) },
        { duration: '2m', target },
        { duration: __ENV.DURATION || '5m', target },
        { duration: '1m', target: 0 },
      ], gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    application_failures: ['rate<0.01'],
    'http_req_duration{kind:api}': ['p(95)<800', 'p(99)<2000'],
    checks: ['rate>0.99'],
    ...(mode === 'rps' ? { dropped_iterations: ['count==0'] } : {}),
  },
};

export function setup() {
  const liveness = http.get(`${base}/api/healthz`, { timeout: '5s', tags: { kind: 'probe', name: 'healthz' } });
  if (liveness.status !== 200) throw new Error('Target liveness probe failed');
  const auth = http.get(`${base}/api/login/self`, {
    headers: { Authorization: tokens[0] }, timeout: '15s', responseType: 'text',
    tags: { kind: 'probe', name: 'auth-preflight' },
  });
  if (!validBody(auth, 'self')) throw new Error('Test-user authorization preflight failed');
}
function validBody(response, endpoint) {
  if (response.status !== 200) return false;
  try {
    const body = response.json();
    if (endpoint === 'self') return body.code === 200 && !!body.data?.id;
    if (endpoint === 'project-list') return body.code === 200 && Array.isArray(body.data);
    return Array.isArray(body.canvases);
  } catch { return false; }
}

export default function () {
  // Fixed audited routes only: project/getProject uses POST but executes SELECTs only.
  // Read operations may fill caches; no business data or credits are changed.
  const headers = { Authorization: tokens[(__VU - 1) % tokens.length], 'Content-Type': 'application/json' };
  const pick = Math.random();
  const endpoint = canvasEnabled && pick < 0.2 ? 'canvas-list' : pick < 0.65 ? 'project-list' : 'self';
  const params = { headers, timeout: '15s', responseType: 'text', tags: { kind: 'api', name: endpoint } };
  const response = endpoint === 'project-list'
    ? http.post(`${base}/api/project/getProject`, '{}', params)
    : http.get(`${base}${endpoint === 'self' ? '/api/login/self' : '/api/canvases'}`, params);
  const ok = validBody(response, endpoint);
  appFailures.add(!ok);
  check(response, { 'HTTP and response schema succeed': () => ok });
  if (mode === 'vus') sleep(8 + Math.random() * 4);
}
