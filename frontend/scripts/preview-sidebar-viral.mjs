// Fully isolated visual fixture: never proxies to a real backend or upstream.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = { id: 'newapi', recommended: false, series: '验收模型', displayPrice: '0 积分 / 次（¥0）', price: { yuan: 0, unit: '次' }, defaults: {}, enums: {}, capabilities: [], mode: [] };
const row = (name, type, extra = {}) => ({ ...base, modelName: name, value: name, name, label: name, type, ...extra });
export const readyModels = [
  row('fixture-vision', 'text', { capabilities: ['vision'] }),
  row('fixture-image-single', 'image', { mode: ['singleImage'], referenceLimits: { images: 1 } }),
  row('fixture-image-multi', 'image', { mode: ['multiReference'], referenceLimits: { images: 4 } }),
  row('fixture-video', 'video', { mode: ['singleImage'], enums: { duration: [5, 10], resolution: ['720p'], aspect_ratio: ['9:16', '16:9'] } }),
];
const limitedModels = [row('fixture-text', 'text'), row('fixture-image', 'image', { mode: ['text'] }), row('fixture-video', 'video', { mode: ['singleImage'] })];
export async function startSidebarViralFixture() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith('/api/')) {
      requests.push({ method: req.method, path: url.pathname });
      const referer = new URL(req.headers.referer || '/', 'http://127.0.0.1');
      const mode = referer.searchParams.get('case') || 'limited';
      if (req.method === 'POST' && url.pathname === '/api/modelSelect/getModelList') {
        if (mode === 'failure') return json(502, { message: 'Fixture catalog temporarily unavailable' });
        return json(200, { code: 200, data: mode === 'ready' ? readyModels : limitedModels });
      }
      if (req.method === 'POST' && url.pathname === '/api/model-catalog/quote') return json(200, { code: 200, data: { yuan: 0, points: 0, pointsPerYuan: 10, estimated: true, note: 'Fixture-only quote' } });
      if (req.method !== 'GET') return json(405, { message: 'Fixture blocks all writes and model calls' });
      if (url.pathname === '/api/login/self') return json(200, { code: 200, data: { id: 1, name: '界面验收', role: 'user', balance: 10206.89, display_id: '923800' } });
      if (url.pathname === '/api/auth/me') return json(200, { user: { id: 1 } });
      if (url.pathname === '/api/team') return json(200, { data: { role: 'none' } });
      if (url.pathname === '/api/config') return json(200, { chat_models: [], image_models: [], video_models: [] });
      if (url.pathname === '/api/skills') return json(200, { data: { items: [], installedIds: [] } });
      if (url.pathname.startsWith('/api/notices')) return json(200, { data: { items: [], unread: 0 } });
      return json(200, { code: 200, data: [] });
    }
    if (req.method !== 'GET') return json(405, {});
    if (url.pathname === '/__mobile') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!doctype html><body style="margin:0;background:#ddd"><iframe title="手机验收" src="/?case=${url.searchParams.get('case') || 'ready'}#/viral-replicate" style="width:390px;height:844px;border:0"></iframe>`);
    }
    if (url.pathname === '/__short') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!doctype html><body style="margin:0;background:#ddd"><iframe title="短视口验收" src="/?case=limited#/viral-replicate" style="width:1100px;height:620px;border:0"></iframe>`);
    }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root)) return json(403, {});
    try {
      let body = await readFile(file);
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
      if (file === path.join(root, 'index.html')) body = Buffer.from(body.toString().replace('<head>', `<head><script>localStorage.setItem('token','fixture-only-invalid-token');localStorage.setItem('userId','1');localStorage.setItem('username','界面验收');localStorage.setItem('xoi.platform-welcome.v1:1','done');</script>`));
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body);
    } catch { json(404, {}); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise(resolve => server.close(resolve)) };
}
