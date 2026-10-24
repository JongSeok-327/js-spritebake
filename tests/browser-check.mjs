import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { get } from 'node:http';

const base = resolve(import.meta.dirname, '..');
const qa = resolve(base, '.qa');
const profile = resolve(qa, `chrome-${Date.now()}`);
const downloads = resolve(qa, `downloads-${Date.now()}`);
await mkdir(profile, { recursive: true }); await mkdir(downloads, { recursive: true });
const url = `${process.argv[2] || process.env.SPRITE_TEST_URL || 'http://127.0.0.1:8765'}/?lang=ko`;
// Drain HTTP/1.0 responses; avoid a Node 24 undici backpressure assertion.
assert.equal(await new Promise((resolve, reject) => {
  get(url, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); }).on('error', reject);
}), 200);
const executable = process.env.SPRITE_TEST_BROWSER || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const browser = spawn(executable, [
  '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, url,
], { windowsHide: true, stdio: 'ignore' });
let ws, counter = 0;
const pending = new Map(), exceptions = [], failures = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 1000);
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++counter;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 30000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const until = async (expression, label, timeout = 30000) => {
  const begin = Date.now();
  while (Date.now() - begin < timeout) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Timeout waiting for ${label}: ${await evaluate('document.querySelector("#progress-text").textContent')}`);
};
const setValue = (id, value, event = 'input') => evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));`);
const ready = 'document.querySelector("#cancel-button").hidden && !document.querySelector("#extract-button").disabled';
const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
async function upload(selector, file) {
  const doc = await call('DOM.getDocument');
  const input = await call('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
  await call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
}
async function waitDownload(suffix, directory = downloads) {
  for (let i = 0; i < 150; i++) { const names = await readdir(directory); const found = names.find(n => n.endsWith(suffix)); if (found) return resolve(directory, found); await delay(100); }
  throw new Error(`Download missing: ${suffix}`);
}
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; if (port) break; } catch {} await delay(100); }
  if (!port) throw new Error('Chrome debugging port unavailable');
  let target;
  for (let i = 0; i < 100; i++) { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find(t => t.type === 'page' && t.url.startsWith(url)); if (target) break; await delay(100); }
  if (!target) throw new Error('App tab unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data);
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails);
    if (msg.method === 'Network.loadingFailed' && !msg.params.canceled) failures.push(msg.params.errorText);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
  });
  ws.addEventListener('close', () => { for (const p of pending.values()) p.reject(new Error('Browser closed')); pending.clear(); });
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable');
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await until('document.documentElement?.dataset.ready === "true"', 'app initialization');
  assert.equal(await evaluate('document.querySelectorAll(".frame-tile").length'), 0);
  assert.equal(await evaluate('document.querySelector("#extract-button").disabled'), true);
  await click('load-sample');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 8`, 'bundled sample extraction');
  await delay(300); await click('preview-play');
  assert.equal(await evaluate('document.querySelector("#file-name").textContent'), 'walk-demo.mp4');
  assert.ok((await evaluate('document.querySelector("#extraction-diagnostics").textContent')).includes('8/8'));
  const sampleHashes = await evaluate('[...document.querySelectorAll(".frame-tile")].map(el=>el.dataset.rawHash)');
  await setValue('offset-x', 3);
  await evaluate('document.querySelector(".frame-tile input").click()');
  await evaluate('document.querySelector("#file-name").textContent="원본 영상";document.querySelector("#document-name").textContent="원본 영상"');
  for (const [lang, extract, help] of [['en','Extract frames','How to use'],['ja','フレーム抽出','使い方'],['ko','프레임 추출','사용 방법']]) {
    await setValue('language-select', lang, 'change');
    assert.equal(await evaluate('document.documentElement.lang'),lang);
    assert.equal(await evaluate('document.querySelector("#extract-button").textContent'),extract);
    assert.equal(await evaluate('document.querySelector("#help-dialog h2").textContent'),help);
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".frame-tile")].map(el=>el.dataset.rawHash)'),sampleHashes);
    assert.equal(await evaluate('document.querySelector("#offset-x").value'),'3');
    assert.equal(await evaluate('document.querySelectorAll(".frame-tile input:checked").length'),7);
    assert.equal(await evaluate('document.querySelector("#file-name").textContent'),'원본 영상');
    assert.equal(await evaluate('document.querySelector("#document-name").textContent'),'원본 영상');
    if(lang!=='ko') assert.equal(await evaluate('/[가-힣]/.test(document.body.innerText.replace("한국어", "").replaceAll("원본 영상", ""))'),false);
  }
  await evaluate('document.querySelector("#file-name").textContent="walk-demo.mp4";document.querySelector("#document-name").textContent="walk-demo.mp4"');
  await click('reset-settings'); await until(ready,'sample reset');
  await evaluate('document.querySelector("#toast").hidden=true;document.activeElement.blur()');
  for (const lang of ['ko','ja','en']) {
    await setValue('language-select',lang,'change');
    await evaluate('document.activeElement.blur()');
    const demoShot = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(resolve(qa,`editor-${lang}.png`),Buffer.from(demoShot.data,'base64'));
  }
  await click('view-sheet');
  const demoSheet = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(resolve(qa,'sheet-en.png'),Buffer.from(demoSheet.data,'base64'));
  await click('export-zip'); await waitDownload('walk-demo-sprites.zip'); await until(ready,'sample export');
  await setValue('language-select','ko','change');
  await click('view-animation');
  console.log('PASS bundled sample, complete UI translations and preserved edits across three languages');
  const generated = await evaluate(await readFile(resolve(base, 'tests/fixtures/generate-video.js'), 'utf8'));
  const fixture = await waitDownload(generated.filename);
  await upload('#file-input', fixture); await until(ready, 'procedural video load'); await click('extract-button');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 12`, 'initial extraction');
  assert.equal(await evaluate('document.querySelector("#file-name").textContent'), 'walk-test.webm');
  assert.equal(await evaluate('document.querySelector("#end-time").value'), '1');
  assert.ok((await evaluate('document.querySelector("#extraction-diagnostics").textContent')).includes('12/12'));
  console.log('PASS empty startup and procedural fixture extraction (12 distinct frames / first second)');
  const cli = spawnSync(process.execPath, [resolve(base, 'cli.mjs'), fixture, '--format', 'png', '--frames', '4', '--columns', '4', '--cell', '128', '--out', resolve(qa, 'cli')], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), resolve(qa, 'cli', 'walk-test-sheet.png'));
  console.log('PASS CLI renders the same fixture to a sheet PNG');
  await click('full-range'); await setValue('frame-count', 16); await click('extract-button');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 16`, 'full range diagnosis');
  assert.ok((await evaluate('document.querySelector("#extraction-diagnostics").textContent')).includes('16/16'));
  assert.ok((await evaluate('document.querySelector("#sampling-warning").textContent')).includes('초당'));
  console.log('PASS original full clip has 16 distinct decoded frames; sparse sampling warning');

  // Exercise an actual user-selected File/Blob URL, not only the bundled URL.
  await upload('#file-input', fixture);
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 0`, 'file upload');
  await setValue('start-time', 0.25); await setValue('end-time', 1.25);
  await setValue('frame-count', 12); await setValue('resolution', 512, 'change');
  await click('extract-button');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 12`, 'trimmed extraction');
  assert.equal(await evaluate('document.querySelector("#playback-fps").value'), '12.00');
  assert.equal(await evaluate('document.querySelector(".frame-caption span:last-child").textContent'), '0.25s');
  await evaluate('document.querySelector("#show-guides").checked=false');
  const alpha = await evaluate(`(()=>{const c=document.querySelector('#preview-canvas'),x=c.getContext('2d'),d=x.getImageData(0,0,c.width,c.height).data;let visible=0,transparent=0;for(let i=3;i<d.length;i+=4){if(d[i]>0)visible++;else transparent++;}return {visible,transparent,corner:d[3]};})()`);
  assert.equal(alpha.corner, 0); assert.ok(alpha.visible > 10000 && alpha.transparent > 10000);
  console.log('PASS local upload, trim, extraction timestamps and transparent pixels', alpha);

  const firstHash = await evaluate('document.querySelector("#preview-canvas").toDataURL()');
  await click('preview-play'); await delay(170);
  const secondHash = await evaluate('document.querySelector("#preview-canvas").toDataURL()');
  assert.notEqual(firstHash, secondHash);
  await click('preview-play');
  await evaluate('document.querySelectorAll(".frame-tile button")[1].click()');
  await until('Math.abs(document.querySelector("#source-video").currentTime - 1/3) < 0.002', 'selected source frame');
  await setValue('offset-x', 3); await setValue('offset-y', -2);
  await evaluate('document.querySelectorAll(".frame-tile input")[3].click()');
  assert.equal(await evaluate('document.querySelector("#frame-total").textContent'), '11 / 12');
  await click('compare-seam'); await delay(450);
  assert.ok((await evaluate('document.querySelector("#preview-frame-label").textContent')).includes('12 /'));
  await click('compare-seam');
  console.log('PASS animation playback, offsets, exclusion, seam comparison');

  // Background controls must actually change the exported pixel processing.
  await click('key-enabled'); await delay(250); await until(ready, 'disabled chroma key');
  assert.equal(await evaluate('document.querySelector("#preview-canvas").getContext("2d").getImageData(0,0,1,1).data[3]'), 255);
  await click('key-enabled'); await delay(250); await until(ready, 'enabled chroma key');
  await setValue('tolerance', 28); await delay(250); await until(ready, 'new key threshold');
  assert.equal(await evaluate('document.querySelector("#preview-canvas").getContext("2d").getImageData(0,0,1,1).data[3]'), 0);
  console.log('PASS background toggling and reprocessing');

  await setValue('start-time', 1); await setValue('end-time', 1);
  await click('extract-button');
  assert.ok((await evaluate('document.querySelector("#toast").textContent')).includes('최소'));
  await setValue('start-time', 0.25); await setValue('end-time', 1.25);
  await setValue('frame-count', 64);
  await evaluate('document.querySelector("#extract-button").click();document.querySelector("#cancel-button").click();');
  await until(ready, 'cancel extraction');
  assert.equal(await evaluate('document.querySelectorAll(".frame-tile").length'), 12);
  assert.ok((await evaluate('document.querySelector("#progress-text").textContent')).includes('취소'));
  await setValue('frame-count', 12);
  console.log('PASS invalid range and cancellation preserving existing frames');

  await click('export-sheet');
  const png = await waitDownload('-sheet.png'); await until(ready, 'PNG export');
  await click('export-zip');
  const zip = await waitDownload('walk-test-sprites.zip'); await until(ready, 'ZIP export');
  await click('save-preset'); const preset = await waitDownload('-settings.json');
  await setValue('tolerance', 20); await delay(250); await until(ready, 'temporary key setting');
  await upload('#preset-input', preset); await delay(300); await until(ready, 'preset loaded');
  assert.equal(await evaluate('document.querySelector("#tolerance").value'), '28');
  await click('extract-button'); await until(`${ready} && document.querySelectorAll('.frame-tile').length === 12`, 'preset re-extraction');
  assert.equal(await evaluate('document.querySelector("#frame-total").textContent'), '11 / 12');
  await evaluate('document.querySelectorAll(".frame-tile button")[1].click()');
  assert.equal(await evaluate('document.querySelector("#offset-x").value'), '3');
  assert.equal(await evaluate('document.querySelector("#offset-y").value'), '-2');
  console.log('PASS PNG/ZIP downloads and settings round-trip', { png, zip, preset });

  await click('next-frame');
  assert.ok((await evaluate('document.querySelector("#selected-label").textContent')).includes('03'));
  const plain = await evaluate('document.querySelector("#preview-canvas").toDataURL()');
  await click('onion-skin');
  assert.notEqual(await evaluate('document.querySelector("#preview-canvas").toDataURL()'), plain);
  await click('onion-skin'); await click('previous-frame');
  await click('view-sheet');
  assert.equal(await evaluate('document.querySelector("#view-sheet").getAttribute("aria-pressed")'), 'true');
  assert.ok((await evaluate('document.querySelector("#preview-frame-label").textContent')).includes('1024 × 768'));
  assert.deepEqual(await evaluate('({w:document.querySelector("#preview-canvas").width,h:document.querySelector("#preview-canvas").height})'), {w:768,h:576});
  await evaluate('document.querySelector("#toast").hidden=true;document.activeElement.blur()');
  const sheetShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(resolve(qa, 'preview-sheet.png'), Buffer.from(sheetShot.data, 'base64'));
  await click('view-animation');
  console.log('PASS frame stepping, onion skin and output sheet layout');

  await setValue('start-time', 0); await setValue('end-time', 0.25); await setValue('frame-count', 24);
  await setValue('duplicate-threshold', 0, 'change'); await click('extract-button');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 24`, 'dense duplicate extraction');
  const candidateCount = await evaluate('document.querySelectorAll(".duplicate-list button").length');
  assert.ok(candidateCount >= 10, `Expected actual repeated decoded frames, got ${candidateCount}`);
  await evaluate('document.querySelector("#duplicate-list button").click()');
  assert.equal(await evaluate('document.querySelectorAll("#duplicate-list button").length'), candidateCount);
  await click('preview-play');
  await evaluate('document.querySelectorAll(".frame-tile input")[23].click()');
  assert.ok(await evaluate('document.querySelectorAll("#duplicate-list button").length > 0'));
  assert.ok(!(await evaluate('document.querySelector("#duplicate-summary").textContent')).startsWith('이웃한'));
  await evaluate('document.querySelectorAll(".frame-tile input")[23].click()');
  assert.equal(await evaluate('document.querySelectorAll("#duplicate-list button").length'), candidateCount);
  console.log('PASS duplicate candidates remain when inspected and recalculate after inclusion changes');
  await setValue('playback-fps', 24);
  const durationBefore = await evaluate('document.querySelector("#export-summary").textContent.match(/· ([\\d.]+)초/)[1]');
  await click('apply-duplicates');
  const keptAfter = await evaluate('document.querySelectorAll(".frame-tile input:checked").length');
  assert.equal(keptAfter, 24 - candidateCount);
  assert.equal(await evaluate('document.querySelector("#export-summary").textContent.match(/· ([\\d.]+)초/)[1]'), durationBefore);
  assert.equal(await evaluate('document.querySelector("#undo-duplicates").disabled'), false);
  assert.equal(await evaluate('document.querySelector("#duplicate-history").hidden'), false);
  assert.equal(await evaluate('document.querySelectorAll("#duplicate-applied-list button").length'), candidateCount);
  await evaluate('document.querySelector("#duplicate-applied-list button").click()');
  assert.equal(await evaluate('document.querySelectorAll("#duplicate-applied-list button").length'), candidateCount);
  assert.ok((await evaluate('document.querySelector("#preview-frame-label").textContent')).includes('제외됨'));
  const held = await evaluate(`(()=>{let before=0;for(const [index,tile] of [...document.querySelectorAll('.frame-tile')].entries()){if(!tile.querySelector('input').checked)continue;const hold=Number(tile.querySelector('.frame-caption').textContent.match(/×(\\d+)/)?.[1]||1);if(hold>1)return {index,before,hold};before+=hold;}return null;})()`);
  assert.ok(held);
  await setValue('playback-fps', 6); await click('preview-play'); await delay((held.before + 1.5) * 1000 / 6);
  assert.ok((await evaluate('document.querySelector("#preview-frame-label").textContent')).includes(`${String(held.index+1).padStart(2,'0')} / 24`));
  await click('preview-play'); await setValue('playback-fps', 24);
  const duplicateDirectory = resolve(downloads, 'duplicates'); await mkdir(duplicateDirectory);
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: duplicateDirectory });
  await click('export-zip'); const duplicateZip = await waitDownload('-sprites.zip', duplicateDirectory); await until(ready, 'held-duration ZIP');
  await click('undo-duplicates');
  assert.equal(await evaluate('document.querySelectorAll(".frame-tile input:checked").length'), 24);
  assert.equal(await evaluate('document.querySelector("#duplicate-history").hidden'), true);
  console.log('PASS real decoded duplicate detection, proposal application, duration preservation and undo', {candidateCount,keptAfter,duplicateZip});

  await click('reset-settings');
  await until(`${ready} && document.querySelectorAll('.frame-tile').length === 12`, 'reset settings');
  const reset = await evaluate('({start:document.querySelector("#start-time").value,end:document.querySelector("#end-time").value,tolerance:document.querySelector("#tolerance").value,resolution:document.querySelector("#resolution").value,offset:document.querySelector("#offset-x").value,frames:document.querySelector("#frame-total").textContent,undo:document.querySelector("#undo-duplicates").disabled})');
  assert.deepEqual(reset,{start:'0',end:'1',tolerance:'30',resolution:'1024',offset:'0',frames:'12 / 12',undo:true});
  console.log('PASS reset settings, source retained, frame edits cleared');

  await evaluate('document.querySelector("[data-bg=checker]").click();document.querySelector("#toast").hidden=true;document.activeElement.blur();window.scrollTo(0,0)');
  const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(resolve(qa, 'preview.png'), Buffer.from(shot.data, 'base64'));
  const responsive = [];
  for (const lang of ['en','ja','ko']) {
  await setValue('language-select',lang,'change');
  for (const width of [1440,1024,768,390]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    const size = await evaluate('({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,controls:[...document.querySelectorAll(".preview-controls,.source-controls")].map(el=>({width:el.clientWidth,scroll:el.scrollWidth}))})');
    assert.ok(size.scroll <= size.width, `Viewport overflow: ${JSON.stringify(size)}`);
    assert.ok(size.controls.every(c=>c.scroll<=c.width+1), `Preview controls overflow: ${JSON.stringify(size)}`);
    responsive.push(size);
  }
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(200);
  const mobile = await evaluate('({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})');
  assert.ok(mobile.scroll <= mobile.width, `Mobile overflow: ${JSON.stringify(mobile)}`);
  const mobileShot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(resolve(qa, 'mobile.png'), Buffer.from(mobileShot.data, 'base64'));
  await writeFile(resolve(qa, 'browser-report.json'), JSON.stringify({ png, zip, preset, duplicateZip, candidateCount, keptAfter, reset, alpha, responsive, mobile, exceptions, failures }, null, 2));
  assert.deepEqual(exceptions, []); assert.deepEqual(failures, []);
  console.log('PASS responsive layout and no runtime/network failures', mobile);
} catch (error) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { console.error('PAGE STATE', await evaluate('({status:document.querySelector("#progress-text").textContent,frames:document.querySelectorAll(".frame-tile").length,toast:document.querySelector("#toast").textContent})'),exceptions); const shot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(resolve(qa, 'failure.png'), Buffer.from(shot.data, 'base64')); } catch {}
  }
  throw error;
} finally {
  clearInterval(keepAlive); ws?.close(); browser.kill();
}
