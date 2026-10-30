// Data-URL-only browser regression: no application/server/provider requests.
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { transform } = require('sucrase');
const source = await readFile(new URL('../console/src/one-stop/studio/media-page.tsx', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('async function compositeMask('), source.indexOf('async function shrinkImage('));
assert.ok(fn.includes('compositeMask'));
const compiled = transform(fn, { transforms: ['typescript'] }).code;
const script = `${compiled}
(async () => {
  const original = document.createElement('canvas'); original.width = 100; original.height = 100;
  const oc = original.getContext('2d'); oc.fillStyle = '#0000ff'; oc.fillRect(0, 0, 100, 100);
  const mask = document.createElement('canvas'); mask.width = 100; mask.height = 100;
  const mc = mask.getContext('2d'); mc.fillStyle = '#000'; mc.fillRect(0, 0, 50, 100);
  const result = await compositeMask(original.toDataURL(), mask.toDataURL());
  const i = new Image(); await new Promise((resolve, reject) => { i.onload = resolve; i.onerror = reject; i.src = result; });
  oc.drawImage(i, 0, 0);
  const keep = Array.from(oc.getImageData(20, 50, 1, 1).data);
  const edit = Array.from(oc.getImageData(80, 50, 1, 1).data);
  const passed = keep[0] < 25 && keep[2] > 220 && edit[0] > 100 && edit[2] < 210;
  document.body.textContent = JSON.stringify({ passed, keep, edit, externalRequests: 0 });
})().catch(error => { document.body.textContent = JSON.stringify({ passed: false, error: error.message }); });`;
const profile = await mkdtemp(join(tmpdir(), 'xoi-mask-test-'));
try {
  const html = '<html><body>pending</body><script>' + script + '</script></html>';
  const output = execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--no-first-run',
    '--user-data-dir=' + profile, '--virtual-time-budget=5000', '--dump-dom', 'data:text/html,' + encodeURIComponent(html),
  ], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
  const match = output.match(/<body>(\{[^<]+\})<\/body>/);
  assert.ok(match, output.slice(0, 300));
  const result = JSON.parse(match[1]); assert.equal(result.passed, true, JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally { await rm(profile, { recursive: true, force: true }); }
