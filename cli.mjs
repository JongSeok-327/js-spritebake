#!/usr/bin/env node
// Command-line front end. Runs the same browser pipeline as the editor in headless Chrome/Edge.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HELP = `JS SpriteBake CLI — video to transparent sprite sheet

Usage: node cli.mjs <video> [options]

Range
  --start <s>          Start time in seconds (default 0)
  --end <s>            End time in seconds, exclusive (default min(1, duration))
  --frames <n>         Frames to extract, 2–64 (default 12)
  --resolution <px>    Processing limit: 512 | 1024 | 2048 (default 1024)
Background
  --key-color <#hex>   Background color to remove (default #00ff00)
  --tolerance <n>      1–60 (default 30)
  --softness <n>       0–20 (default 8)
  --despill <n>        0–100 (default 75)
  --no-key             Keep the background
Output
  --cell <px>          Cell size: 128 | 256 | 512 | 1024 (default 256)
  --columns <n>        Sheet columns, 1–16 (default 4)
  --no-crop            Do not crop to the shared content bounds
  --fps <n>            Playback FPS written to JSON, 0.5–60 (default frames / range)
  --dedupe             Merge suggested adjacent duplicate frames
  --preset <file>      Settings JSON saved from the editor (flags override it)
  --format <zip|png>   ZIP (sheet, frames, JSON, settings) or sheet PNG (default zip)
  --out <dir>          Output directory (default current directory)
  --browser <path>     Chrome or Edge executable (or SPRITEBAKE_BROWSER)
  -h, --help           Show this help`;

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const delay = ms => new Promise(r => setTimeout(r, ms));
const fail = message => { throw Object.assign(new Error(message), { user: true }); };

function options() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      start: { type: 'string' }, end: { type: 'string' }, frames: { type: 'string' }, resolution: { type: 'string' },
      'key-color': { type: 'string' }, tolerance: { type: 'string' }, softness: { type: 'string' }, despill: { type: 'string' },
      'no-key': { type: 'boolean' }, cell: { type: 'string' }, columns: { type: 'string' }, 'no-crop': { type: 'boolean' },
      fps: { type: 'string' }, dedupe: { type: 'boolean' }, preset: { type: 'string' }, format: { type: 'string', default: 'zip' },
      out: { type: 'string', default: '.' }, browser: { type: 'string' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) { console.log(HELP); process.exit(values.help ? 0 : 1); }
  if (positionals.length > 1) fail('Pass one video file.');
  const number = (name, low, high, choices) => {
    if (values[name] === undefined) return undefined;
    const n = Number(values[name]);
    if (!Number.isFinite(n) || n < low || n > high || (choices && !choices.includes(n))) {
      fail(`--${name} must be ${choices ? choices.join(' | ') : `between ${low} and ${high}`}.`);
    }
    return n;
  };
  const o = {
    video: resolve(positionals[0]), out: resolve(values.out), format: values.format, dedupe: !!values.dedupe,
    preset: values.preset && resolve(values.preset), browser: values.browser || process.env.SPRITEBAKE_BROWSER,
    start: number('start', 0, 86400), end: number('end', 0, 86400), frames: number('frames', 2, 64),
    resolution: number('resolution', 0, Infinity, [512, 1024, 2048]), tolerance: number('tolerance', 1, 60),
    softness: number('softness', 0, 20), despill: number('despill', 0, 100), cell: number('cell', 0, Infinity, [128, 256, 512, 1024]),
    columns: number('columns', 1, 16), fps: number('fps', 0.5, 60), keyColor: values['key-color'],
    noKey: !!values['no-key'], noCrop: !!values['no-crop'],
  };
  if (!['zip', 'png'].includes(o.format)) fail('--format must be zip or png.');
  if (o.keyColor !== undefined && !/^#[0-9a-f]{6}$/i.test(o.keyColor)) fail('--key-color must look like #00ff00.');
  if (!existsSync(o.video)) fail(`Video not found: ${o.video}`);
  if (o.preset && !existsSync(o.preset)) fail(`Preset not found: ${o.preset}`);
  return o;
}

function findBrowser(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : fail(`Browser not found: ${explicit}`);
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .flatMap(base => [join(base, 'Google/Chrome/Application/chrome.exe'), join(base, 'Microsoft/Edge/Application/msedge.exe')]),
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  }[process.platform] || [];
  return candidates.find(existsSync) || fail('Chrome or Edge was not found. Install one or pass --browser <path>.');
}

// Serves only dist/ on loopback; the app needs http:// for module workers.
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    const path = resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!path.startsWith(dist + sep) || !types[extname(path)]) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { 'Content-Type': types[extname(path)] }).end(await readFile(path)); } catch { res.writeHead(404).end(); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

async function run(o) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}/`, url = `${origin}?lang=en`;
  const work = await mkdtemp(join(tmpdir(), 'spritebake-'));
  const downloads = join(work, 'downloads');
  const browser = spawn(findBrowser(o.browser), [
    '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${join(work, 'profile')}`, url,
  ], { windowsHide: true, stdio: 'ignore' });
  let ws, counter = 0;
  const pending = new Map();
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++counter; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Page script failed');
    return result.result.value;
  };
  const text = id => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
  const until = async (expression, label, timeout) => {
    for (const end = Date.now() + timeout; Date.now() < end; await delay(100)) if (await evaluate(expression)) return;
    fail(`Timed out ${label}: ${await text('progress-text')}`);
  };
  const set = (id, value, event = 'input') => evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)});
    el[el.type === 'checkbox' ? 'checked' : 'value'] = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`);
  const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  const upload = async (selector, file) => {
    // objectId stays valid for the element itself; DOM nodeIds can go stale after the first navigation.
    const { result } = await call('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)})` });
    await call('DOM.setFileInputFiles', { objectId: result.objectId, files: [file] });
  };
  // Sidebar inputs are disabled exactly while the app is busy; this does not depend on UI language.
  const idle = 'document.getElementById("cancel-button").hidden && !document.getElementById("frame-count").disabled';
  const frames = () => evaluate('document.querySelectorAll(".frame-tile:not(.excluded)").length');
  try {
    let port;
    for (let i = 0; i < 150 && !port; i++) { try { port = (await readFile(join(work, 'profile', 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { await delay(100); } }
    if (!port) fail('The browser did not start. Pass --browser <path> to choose Chrome or Edge.');
    let target;
    for (let i = 0; i < 100 && !target; i++) { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith(origin)); if (!target) await delay(100); }
    if (!target) fail('The editor page did not open.');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('message', e => {
      const msg = JSON.parse(e.data), p = msg.id && pending.get(msg.id);
      if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    });
    ws.addEventListener('close', () => { for (const p of pending.values()) p.reject(new Error('Browser closed')); pending.clear(); });
    await call('Runtime.enable'); await call('Page.enable');
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    await until('document.documentElement?.dataset.ready === "true"', 'opening the editor', 30000);

    await upload('#file-input', o.video);
    await delay(100);
    await until(idle, 'loading the video', 60000);
    if (await evaluate('document.getElementById("extract-button").disabled')) fail(`Could not read the video: ${await text('progress-text')}`);
    console.error(`Loaded ${basename(o.video)} (${await text('file-meta')})`);

    if (o.preset) {
      await upload('#preset-input', o.preset);
      await until('!document.getElementById("toast").hidden', 'reading the preset', 10000);
      if (await evaluate('document.getElementById("stale-warning").hidden')) fail(await text('toast'));
    }
    const fields = [['start-time', o.start], ['end-time', o.end], ['frame-count', o.frames], ['resolution', o.resolution, 'change'],
      ['key-color', o.keyColor], ['tolerance', o.tolerance], ['softness', o.softness], ['despill', o.despill], ['cell-size', o.cell, 'change'], ['columns', o.columns, 'change']];
    for (const [id, value, event] of fields) if (value !== undefined) await set(id, String(value), event);
    if (o.noKey) await set('key-enabled', false);
    if (o.noCrop) await set('crop-content', false, 'change');

    await evaluate('document.getElementById("toast").hidden = true');
    await click('extract-button');
    await delay(100);
    await until(idle, 'extracting frames', 15 * 60000);
    if (!await frames()) fail(`Extraction failed: ${await evaluate('document.getElementById("toast").hidden') ? await text('progress-text') : await text('toast')}`);
    if (o.fps !== undefined) await set('playback-fps', String(o.fps));
    if (o.dedupe) {
      await click('analyze-duplicates');
      if (!await evaluate('document.getElementById("apply-duplicates").disabled')) await click('apply-duplicates');
    }
    console.error(`Extracted ${await frames()} frames · ${await text('export-summary')}`);

    const suffix = o.format === 'zip' ? '-sprites.zip' : '-sheet.png';
    await click(o.format === 'zip' ? 'export-zip' : 'export-sheet');
    let name;
    for (let i = 0; i < 1200 && !name; i++) { name = (await readdir(downloads).catch(() => [])).find(n => n.endsWith(suffix)); if (!name) await delay(100); }
    if (!name) fail(`Export failed: ${await text('progress-text')}`);
    await mkdir(o.out, { recursive: true });
    const output = join(o.out, name);
    await copyFile(join(downloads, name), output);
    console.log(output);
  } finally {
    ws?.close(); browser.kill(); server.close();
    await delay(200);
    await rm(work, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

try {
  if (typeof WebSocket === 'undefined') fail('Node.js 22 or newer is required: https://nodejs.org/');
  await run(options());
} catch (error) {
  console.error(`spritebake: ${error.user || error.code?.startsWith?.('ERR_PARSE_ARGS') ? error.message : error.stack}`);
  process.exitCode = 1;
}
