// Heap snapshot diff between play/exit cycles (investigation cited in docs/reports/performance).
// Usage: npm run build && npx vite preview --port 4174  (in another terminal), then: node scripts/heap-diff.mjs
// Prints the constructors whose retained object count grew between cycle 2 and cycle 8.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4174';
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');

async function snapshot() {
  for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage');
  let chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const snap = JSON.parse(chunks.join(''));
  const f = snap.snapshot.meta.node_fields;
  const types = snap.snapshot.meta.node_types[0];
  const nf = f.length;
  const iType = f.indexOf('type');
  const iName = f.indexOf('name');
  const iSize = f.indexOf('self_size');
  const counts = new Map();
  for (let i = 0; i < snap.nodes.length; i += nf) {
    const type = types[snap.nodes[i + iType]];
    if (type !== 'object' && type !== 'closure' && type !== 'array') continue;
    const name = `${type}:${snap.strings[snap.nodes[i + iName]]}`;
    const c = counts.get(name) ?? { n: 0, size: 0 };
    c.n += 1;
    c.size += snap.nodes[i + iSize];
    counts.set(name, c);
  }
  return counts;
}

async function cycle() {
  await page.evaluate(() => window.__pirate.setOverrides({ match: { duration: 180 }, spawn: { interval: 2 }, player: { maxHealth: 1e6 } }));
  await page.getByTestId('menu-play').click();
  await page.waitForFunction(() => window.__pirate?.isReady() === true);
  for (const k of ['KeyW', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.down(k);
  await page.waitForTimeout(5000);
  for (const k of ['KeyW', 'Space', 'KeyQ', 'KeyE']) await page.keyboard.up(k);
  await page.keyboard.press('Escape');
  await page.getByTestId('pause-exit').click();
  await page.getByTestId('menu-play').waitFor();
}

await page.goto(`${BASE}/?e2e&realtime&seed=7&mockLatency=0&audio=off`);
await page.getByTestId('menu-play').waitFor();
await cycle();
await cycle();
const a = await snapshot();
for (let i = 0; i < 6; i++) await cycle();
const b = await snapshot();

const rows = [];
for (const [name, cb] of b) {
  const ca = a.get(name) ?? { n: 0, size: 0 };
  if (cb.n - ca.n > 0) rows.push([name, ca.n, cb.n, cb.n - ca.n, cb.size - ca.size]);
}
rows.sort((x, y) => y[4] - x[4]);
console.log('constructor | after c2 | after c8 | +count | +bytes');
for (const r of rows.slice(0, 30)) console.log(r.join(' | '));
await browser.close();
