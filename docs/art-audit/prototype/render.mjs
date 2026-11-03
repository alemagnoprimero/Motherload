// Render the technique prototype with headless Chromium.
// Usage: node render.mjs [jobs=all|name,name] [perf=N]
// Serves this folder on a free local port; never touches the game repository.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from '../../../node_modules/playwright-core/index.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'out');
await mkdir(OUT, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const ONLY = (args.jobs || 'all').split(',');
const PERF = +(args.perf || 0);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const body = await readFile(join(HERE, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const jobs = [];
for (const [vw, vh, tag] of [[1440, 900, '1440x900'], [393, 851, '393x851']])
  for (const scene of ['surface', 'shaft', 'cavern']) jobs.push({ name: `proto-${scene}-${tag}@2`, q: { scene, vw, vh, dpr: 2 } });
jobs.push({ name: 'proto-cavern-gamecam-1440x900@2', q: { scene: 'cavern', vw: 1440, vh: 900, dpr: 2, camera: 'game' } });
for (const scene of ['shaft', 'cavern']) jobs.push({ name: `test-scrambled-${scene}-1440x900`, q: { scene, vw: 1440, vh: 900, dpr: 2, scramble: 1 } });
jobs.push({ name: 'proto-perf-cavern-ls8-1440x900@2', q: { scene: 'cavern', vw: 1440, vh: 900, dpr: 2, ls: 8 } });
jobs.push({ name: 'proto-shaft-conceptzoom-1440x900@2', q: { scene: 'shaft', vw: 1440, vh: 900, dpr: 2, tilecss: 90 } });
jobs.push({ name: 'proto-cavern-conceptzoom-1440x900@2', q: { scene: 'cavern', vw: 1440, vh: 900, dpr: 2, tilecss: 90 } });
for (const scene of ['surface', 'shaft', 'cavern']) {
  jobs.push({ name: `debug-air-${scene}-1440x900`, q: { scene, vw: 1440, vh: 900, dpr: 2, debug: 'air' } });
  jobs.push({ name: `debug-regions-${scene}-1440x900`, q: { scene, vw: 1440, vh: 900, dpr: 2, debug: 'regions' } });
  jobs.push({ name: `debug-albedo-${scene}-1440x900`, q: { scene, vw: 1440, vh: 900, dpr: 2, debug: 'albedo' } });
  jobs.push({ name: `debug-light-${scene}-1440x900`, q: { scene, vw: 1440, vh: 900, dpr: 2, debug: 'light' } });
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const report = {};
try { Object.assign(report, JSON.parse(await readFile(join(OUT, 'render-report.json'), 'utf8'))); } catch {}
for (const job of jobs) {
  if (!ONLY.includes('all') && !ONLY.includes(job.name)) continue;
  const q = { ...job.q, ...(PERF && job.name.startsWith('proto-') ? { perf: PERF } : {}) };
  const page = await browser.newPage({ viewport: { width: q.vw, height: q.vh }, deviceScaleFactor: q.dpr });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const t0 = Date.now();
  await page.goto(BASE + 'index.html?' + new URLSearchParams(q), { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__proto && window.__proto.ready, null, { timeout: 240000 });
  const info = await page.evaluate(() => window.__proto);
  const data = await page.evaluate(() => document.getElementById('view').toDataURL('image/png'));
  await writeFile(join(OUT, job.name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  delete info.params;
  const prev = report[job.name];
  if (!PERF && prev && prev.perf && Object.keys(prev.perf).length) info.perf = prev.perf; // keep the last probe
  report[job.name] = { ...info, wall_ms: Date.now() - t0, errors: errs };
  console.log(job.name, info.error ? 'ERROR ' + info.error : `tile ${info.tile} bake ${info.timing?.bakeTotal} ms`, JSON.stringify(info.perf || {}), errs.slice(0, 3).join(' | '));
  await page.close();
}
await writeFile(join(OUT, 'render-report.json'), JSON.stringify(report, null, 1));
await browser.close();
server.close();
