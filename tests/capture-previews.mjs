// Refreshes the README screenshots in docs/assets from the bundled sample:
// node tests/capture-previews.mjs <server URL>
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.argv[2];
if (!url) { console.error('Usage: node tests/capture-previews.mjs <server URL>'); process.exit(1); }
const base = resolve(import.meta.dirname, '..');
const profile = resolve(base, '.qa', `previews-${Date.now()}`);
await mkdir(profile, { recursive: true });
const executable = process.env.SPRITE_TEST_BROWSER || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const browser = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, url], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms));
let ws, counter = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++counter; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })).result.value;
const until = async (expression, label) => {
  for (let i = 0; i < 600; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Timeout waiting for ${label}`);
};
const setValue = (id, value, event = 'input') => evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))`);
const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const shoot = async name => {
  await evaluate('document.querySelector("#toast").hidden=true;document.activeElement.blur();window.scrollTo(0,0)');
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(resolve(base, 'docs/assets', name), Buffer.from(shot.data, 'base64'));
  console.log(`Wrote ${name}`);
};
const ready = 'document.querySelector("#cancel-button").hidden && !document.querySelector("#extract-button").disabled';
try {
  let port, target;
  for (let i = 0; i < 100 && !port; i++) { try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
  for (let i = 0; i < 100 && !target; i++) { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith(url)); if (!target) await delay(100); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data), p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await until('document.documentElement.dataset.ready === "true"', 'app initialization');
  await click('load-sample'); await delay(200);
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 8`, 'sample extraction');
  await click('next-frame'); await click('next-frame');
  for (const lang of ['ko', 'ja', 'en']) { await setValue('language-select', lang, 'change'); await shoot(`editor-${lang}.png`); }
  await click('view-sheet');
  await shoot('sheet-en.png');
} finally {
  ws?.close(); browser.kill();
  await delay(200); await rm(profile, { recursive: true, force: true }).catch(() => {});
}
