#!/usr/bin/env node
// Capture the screenshots listed in shots.json from the running game with headless Chrome.
// Each entry opens <base>/<query> (the game's own ?shot= director stages the scene), waits for
// window.__shotReady, then saves a 1280x720 JPEG under screenshots/, lowering the quality until
// the file fits the 256 KiB limit. Talks to Chrome over the DevTools protocol; no dependencies.
//
//   node tools/shoot.mjs [--base http://localhost:8097] [--chrome <path>]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const BASE = args.base || 'http://localhost:8097';
const W = 1280, H = 720, LIMIT = 256 * 1024;
const CHROMES = [
  args.chrome,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CHROMES.find((p) => existsSync(p));
if (!chromePath) throw new Error('No Chrome/Edge found; pass --chrome <path>');

const shots = JSON.parse(readFileSync('shots.json', 'utf8'));
mkdirSync('screenshots', { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'hh-shoot-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function devtoolsTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* chrome still starting */ }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a page target');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { const { ok, fail } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? fail(new Error(msg.error.message)) : ok(msg.result); }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { const n = ++id; waiting.set(n, { ok, fail }); ws.send(JSON.stringify({ id: n, method, params })); });
  return new Promise((ok) => { ws.onopen = () => ok({ send, close: () => ws.close() }); });
}

async function waitReady(cdp, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await cdp.send('Runtime.evaluate', { expression: '!!window.__shotReady', returnByValue: true });
    if (r.result.value) return;
    await sleep(400);
  }
  throw new Error('scene never became ready');
}

try {
  const cdp = await connect(await devtoolsTarget());
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const shot of shots) {
    const url = BASE + '/' + shot.query.replace(/^\//, '');
    process.stdout.write(`${shot.name}  ${url} ... `);
    await cdp.send('Page.navigate', { url });
    await waitReady(cdp);
    await sleep(600); // let the frozen frame re-render once more
    let quality = 90, data;
    for (;;) {
      ({ data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false }));
      if (Buffer.byteLength(data, 'base64') <= LIMIT || quality <= 40) break;
      quality -= 5;
    }
    const buf = Buffer.from(data, 'base64');
    writeFileSync(join('screenshots', shot.name), buf);
    console.log(`${(buf.length / 1024).toFixed(0)} KiB @ q${quality}`);
  }
  cdp.close();
} finally {
  chrome.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile still locked */ }
}
