// Records the editor walkthrough (sample → extract → background → sheet → ZIP) as PNG frames:
// node tests/capture-walkthrough.mjs <server URL> <lang>
// Frames land in .qa/walkthrough-<lang>/; tests/make-walkthrough-gif.py turns them into docs/assets/walkthrough-<lang>.gif.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [url, lang = 'en'] = process.argv.slice(2);
if (!url) { console.error('Usage: node tests/capture-walkthrough.mjs <server URL> <en|ko|ja>'); process.exit(1); }
const base = resolve(import.meta.dirname, '..');
const out = resolve(base, '.qa', `walkthrough-${lang}`);
const profile = resolve(base, '.qa', `walkthrough-profile-${Date.now()}`);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true }); await mkdir(profile, { recursive: true });
const executable = process.env.SPRITE_TEST_BROWSER || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const browser = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, `${url}/?lang=${lang}`], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, counter = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })).result.value;
const until = async (expression, label) => {
  for (let i = 0; i < 600; i++) { if (await evaluate(expression)) return; await delay(50); }
  throw new Error(`Timeout waiting for ${label}`);
};

// Frames are captured continuously; each records how long it stays on screen.
const W = 1280, H = 860, SCALE = 0.6;
let recording = false, index = 0;
const frames = [];
async function recorder() {
  while (recording) {
    const started = Date.now();
    // clip is in document coordinates, so follow the current scroll position.
    const y = await evaluate('window.scrollY');
    const shot = await call('Page.captureScreenshot', { format: 'png', clip: { x: 0, y, width: W, height: H, scale: SCALE } });
    const name = `${String(index++).padStart(4, '0')}.png`;
    await writeFile(resolve(out, name), Buffer.from(shot.data, 'base64'));
    frames.push({ name, at: started });
    await delay(Math.max(0, 90 - (Date.now() - started)));
  }
}

// A drawn cursor, since headless screenshots do not include the pointer.
const cursorSetup = `(() => {
  const c = document.createElement('div'); c.id = 'demo-cursor';
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-7 1.2 4 7.3-3 1.5-4-7.4L4 20z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '640px', top: '520px', zIndex: 99999, pointerEvents: 'none', transition: 'left .7s ease-in-out, top .7s ease-in-out' });
  const r = document.createElement('div'); r.id = 'demo-ripple';
  Object.assign(r.style, { position: 'fixed', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%', border: '2px solid #828fff', zIndex: 99998, pointerEvents: 'none', opacity: 0, transform: 'scale(.4)', transition: 'opacity .35s, transform .35s' });
  document.body.append(c, r);
})()`;
const point = selector => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, width: r.width }; })()`);
const moveTo = async (x, y) => { await evaluate(`Object.assign(document.getElementById('demo-cursor').style, { left: '${x}px', top: '${y}px' })`); await delay(800); };
const ripple = (x, y) => evaluate(`(() => { const r = document.getElementById('demo-ripple'); r.style.transition = 'none'; Object.assign(r.style, { left: '${x}px', top: '${y}px', opacity: 1, transform: 'scale(.4)' }); r.offsetWidth; r.style.transition = 'opacity .45s, transform .45s'; Object.assign(r.style, { opacity: 0, transform: 'scale(1.3)' }); })()`);
const clickOn = async selector => { const p = await point(selector); await moveTo(p.x, p.y); await ripple(p.x, p.y); await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
const slide = async (selector, from, to, min, max) => {
  const p = await point(selector), at = v => p.left + (v - min) / (max - min) * p.width;
  await moveTo(at(from), p.y);
  for (let step = 1; step <= 8; step++) {
    const v = Math.round(from + (to - from) * step / 8), x = at(v);
    await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${v}; el.dispatchEvent(new Event('input', { bubbles: true })); Object.assign(document.getElementById('demo-cursor').style, { transition: 'none', left: '${x}px' }); })()`);
    await delay(90);
  }
  await evaluate(`document.getElementById('demo-cursor').style.transition = 'left .7s ease-in-out, top .7s ease-in-out'`);
};
const idle = 'document.querySelector("#cancel-button").hidden && !document.querySelector("#frame-count").disabled';

try {
  let port, target;
  for (let i = 0; i < 100 && !port; i++) { try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
  for (let i = 0; i < 100 && !target; i++) { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith(url)); if (!target) await delay(100); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data), p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await call('Runtime.enable');
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: profile });
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await until('document.documentElement.dataset.ready === "true"', 'app initialization');
  await evaluate(cursorSetup);
  recording = true; const rec = recorder();
  await delay(1200);
  await clickOn('#load-sample');
  await delay(300); await until(`${idle} && document.querySelectorAll('.frame-tile').length === 8`, 'sample extraction');
  await delay(2600);
  for (const bg of ['light', 'dark', 'game', 'checker']) { await clickOn(`[data-bg=${bg}]`); await delay(700); }
  await slide('#tolerance', 30, 8, 1, 60); await delay(300);
  await until(idle, 'rekey'); await delay(1400);
  await slide('#tolerance', 8, 30, 1, 60); await delay(300);
  await until(idle, 'rekey'); await delay(900);
  await clickOn('#view-sheet'); await delay(2200);
  await evaluate(`document.querySelector('#export-zip').scrollIntoView({ behavior: 'smooth', block: 'center' })`); await delay(1000);
  await clickOn('#export-zip'); await delay(2500);
  recording = false; await rec;
  frames.forEach((f, i) => { f.ms = (frames[i + 1]?.at ?? f.at + 1500) - f.at; });
  await writeFile(resolve(out, 'frames.json'), JSON.stringify(frames.map(({ name, ms }) => ({ name, ms }))));
  console.log(`${frames.length} frames → ${out}`);
} finally {
  recording = false; ws?.close(); browser.kill();
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
