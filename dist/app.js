import { t, applyLanguage, initialLanguage } from './i18n.js';
import { clamp, keyPixels, sharedCrop, makeZip, crc32, suggestDuplicates, applyDuplicatePlan } from './core.js';

const $ = id => document.getElementById(id);
const video = $('source-video');
const preview = $('preview-canvas');
const state = {
  loaded: false, busy: false, cancelled: false, frames: [], selected: 0,
  playing: false, seam: false, lastTick: 0, name: '', sourceURL: null,
  width: 0, height: 0, crop: null, picking: false, extraction: null, pendingPreset: null, appliedKey: null,
  view: 'animation', candidates: [], duplicateUndo: null, duplicateApplied: [], duplicateUndoApplied: [], pair: null, compareTick: 0,
};
const numeric = (id, low, high, fallback) => {
  const n = Number.parseFloat($(id).value);
  return clamp(Number.isFinite(n) ? n : fallback, low, high);
};
const frameCount = () => Math.round(numeric('frame-count', 2, 64, 12));
const cellSize = () => Number($('cell-size').value);
const fps = () => numeric('playback-fps', 0.5, 60, 12);
const included = () => state.frames.filter(f => f.included);
const durationMs = () => included().reduce((sum, f) => sum + (f.hold || 1) * 1000 / fps(), 0);
const basename = () => (state.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '_') || 'sprite').slice(0, 90);
const keySettings = () => ({ enabled: $('key-enabled').checked, color: $('key-color').value, tolerance: Number($('tolerance').value), softness: Number($('softness').value), despill: Number($('despill').value) });
const nextPaint = () => new Promise(resolve => requestAnimationFrame(resolve));
let keyTimer, toastTimer;

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function report(text, percent = null) {
  $('progress-text').textContent = text;
  $('progress').hidden = percent === null;
  $('progress').value = percent ?? 0;
  $('progress-percent').textContent = percent === null ? '' : `${Math.round(percent)}%`;
}
function stopPlayback() {
  state.playing = false; state.seam = false; state.pair = null;
  $('preview-play').textContent = t("m046"); $('preview-play').setAttribute('aria-label', t("m097"));
  $('compare-seam').textContent = t("m055");
}
function updateAvailability() {
  const ready = state.loaded && !state.busy, has = state.frames.length > 0;
  document.querySelectorAll('.sidebar input, .sidebar select, .sidebar button').forEach(el => { el.disabled = state.busy; });
  $('extract-button').disabled = !ready;
  $('cancel-button').disabled = false;
  ['source-play', 'source-scrub', 'set-start', 'set-end', 'pick-color', 'one-second', 'full-range'].forEach(id => { $(id).disabled = !ready; });
  ['preview-play', 'export-sheet', 'export-zip'].forEach(id => { $(id).disabled = state.busy || included().length === 0; });
  ['select-all', 'offset-x', 'offset-y', 'reset-offset', 'previous-frame', 'next-frame', 'analyze-duplicates'].forEach(id => { $(id).disabled = state.busy || !has; });
  $('reset-settings').disabled = state.busy;
  $('language-select').disabled = state.busy;
  $('apply-duplicates').disabled = state.busy || !state.candidates.length;
  $('undo-duplicates').disabled = state.busy || !state.duplicateUndo;
  $('duplicate-threshold').disabled = state.busy;
  $('compare-seam').disabled = state.busy || included().length < 2;
  document.querySelectorAll('.frame-tile input, .frame-tile button, .duplicate-list button').forEach(el => { el.disabled = state.busy; });
  ['cell-size', 'columns', 'crop-content', 'playback-fps', 'loop'].forEach(id => { $(id).disabled = state.busy; });
  $('project-status').textContent = state.busy ? t("m104") : has ? t("m105", included().length) : ready ? t("m106") : t("m107");
}
function setBusy(value, cancellable = false) {
  state.busy = value;
  $('cancel-button').hidden = !value || !cancellable;
  if (value) { stopPlayback(); video.pause(); }
  updateAvailability();
}
function cancelled() { if (state.cancelled) throw new Error(t("m108")); }
function canvas(width, height = width) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
function updateSourceTime() {
  $('source-scrub').value = video.currentTime || 0;
  $('source-time').textContent = `${(video.currentTime || 0).toFixed(2)} / ${(Number.isFinite(video.duration) ? video.duration : 0).toFixed(2)}`;
}

function waitForMedia(eventName, action, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(eventName, success); video.removeEventListener('error', fail); };
    const success = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error(t("m109"))); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(t("m110"))); }, timeout);
    video.addEventListener(eventName, success, { once: true }); video.addEventListener('error', fail, { once: true });
    try { action(); } catch (error) { cleanup(); reject(error); }
  });
}
async function seek(time) {
  const t = clamp(time, 0, Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - t) > 0.0001 || video.readyState < 2) {
    await waitForMedia('seeked', () => { video.currentTime = t; });
  }
  await nextPaint();
}
async function loadVideo(url, name, { objectURL = false } = {}) {
  if (state.busy) { if (objectURL) URL.revokeObjectURL(url); return; }
  clearTimeout(keyTimer); keyTimer = null; state.pendingPreset = null; setPicking(false); setBusy(true);
  state.loaded = false; state.frames = []; state.extraction = null; state.name = name; state.duplicateUndo = null; state.duplicateApplied = []; state.duplicateUndoApplied = []; clearCandidates();
  state.width = 0; state.height = 0; state.crop = null;
  renderStrip(); renderPreview(); $('stale-warning').hidden = true; $('source-empty').hidden = false;
  $('file-info').hidden = true; $('source-dimensions').textContent = '—';
  report(t("m111", name));
  const previousURL = state.sourceURL; state.sourceURL = objectURL ? url : null;
  try {
    await waitForMedia('loadeddata', () => { video.src = url; video.load(); });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error(t("m112"));
    state.loaded = true;
    $('source-empty').hidden = true; $('file-info').hidden = false;
    $('file-name').textContent = name;
    $('document-name').textContent = name;
    $('file-meta').textContent = `${video.videoWidth} × ${video.videoHeight} · ${video.duration.toFixed(2)} s`;
    $('source-dimensions').textContent = `${video.videoWidth} × ${video.videoHeight}`;
    $('start-time').value = 0; $('end-time').value = Math.min(1, video.duration).toFixed(3);
    $('start-time').max = video.duration; $('end-time').max = video.duration;
    $('source-scrub').max = video.duration; updateSourceTime();
    report(t("m113"));
  } catch (error) {
    report(error.message); toast(error.message);
    $('source-empty').textContent = t("m114");
  } finally {
    if (previousURL) URL.revokeObjectURL(previousURL);
    setBusy(false);
  }
}

let worker, workerID = 0, workerFailed = false;
const workerJobs = new Map();
function getWorker() {
  if (!worker && !workerFailed) {
    try {
      worker = new Worker(new URL('./key-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const job = workerJobs.get(data.id);
        if (!job) return;
        workerJobs.delete(data.id); clearTimeout(job.timer);
        data.error ? job.reject(new Error(data.error)) : job.resolve(data);
      };
      worker.onerror = () => {
        workerFailed = true; worker.terminate(); worker = null;
        for (const job of workerJobs.values()) { clearTimeout(job.timer); job.reject(new Error(t("m115"))); }
        workerJobs.clear();
      };
    } catch { workerFailed = true; }
  }
  return worker;
}
async function processFrame(raw, settings) {
  const activeWorker = getWorker();
  const bytes = raw.data.slice();
  let result;
  if (activeWorker) {
    result = await new Promise((resolve, reject) => {
      const id = ++workerID;
      const timer = setTimeout(() => { workerJobs.delete(id); reject(new Error(t("m116"))); }, 30000);
      workerJobs.set(id, { resolve, reject, timer });
      activeWorker.postMessage({ id, width: raw.width, height: raw.height, settings, buffer: bytes.buffer }, [bytes.buffer]);
    });
  } else {
    await nextPaint(); result = { ...keyPixels(bytes, raw.width, raw.height, settings), buffer: bytes.buffer };
  }
  const keyed = canvas(raw.width, raw.height);
  keyed.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.buffer), raw.width, raw.height), 0, 0);
  return { keyed, bounds: result.bounds, visible: result.visible };
}

async function extractFrames() {
  if (!state.loaded || state.busy) return;
  clearTimeout(keyTimer); keyTimer = null;
  const start = numeric('start-time', 0, video.duration, 0);
  const end = numeric('end-time', 0, video.duration, video.duration);
  const count = frameCount();
  if (end - start < 0.04) { toast(t("m117")); return; }
  const limit = Number($('resolution').value);
  const scale = Math.min(1, limit / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale)), height = Math.max(1, Math.round(video.videoHeight * scale));
  if (width * height * count > 40 * 1024 * 1024) { toast(t("m118")); return; }
  $('start-time').value = start; $('end-time').value = end; $('frame-count').value = count;
  const settings = keySettings(), fresh = [], surface = canvas(width, height), ctx = surface.getContext('2d', { willReadFrequently: true });
  const originalTime = video.currentTime;
  state.cancelled = false; setPicking(false); setBusy(true, true);
  try {
    for (let i = 0; i < count; i++) {
      cancelled();
      // End-exclusive sampling avoids exporting a duplicated loop endpoint.
      const time = start + (end - start) * i / count;
      report(t("m119", i + 1, count), i / count * 100);
      await seek(time); cancelled();
      ctx.drawImage(video, 0, 0, width, height);
      const raw = ctx.getImageData(0, 0, width, height);
      const processed = await processFrame(raw, settings); cancelled();
      fresh.push({ raw, ...processed, time, included: true, x: 0, y: 0, hold: 1, rawHash: crc32(raw.data) });
      const p = preview.getContext('2d'); p.clearRect(0, 0, preview.width, preview.height);
      const s = Math.min(preview.width / width, preview.height / height);
      p.drawImage(processed.keyed, (preview.width - width * s) / 2, (preview.height - height * s) / 2, width * s, height * s);
      $('result-empty').hidden = true; $('preview-frame-label').hidden = false;
      $('preview-frame-label').textContent = t("m120", i + 1, count);
    }
    state.frames = fresh; state.width = width; state.height = height; state.selected = 0; state.appliedKey = settings; state.duplicateUndo = null; state.duplicateApplied = []; state.duplicateUndoApplied = []; clearCandidates();
    state.extraction = { start, end, count, processingWidth: width, processingHeight: height };
    $('playback-fps').value = clamp(count / (end - start), 0.5, 60).toFixed(2);
    if (state.pendingPreset) {
      const preset = state.pendingPreset;
      if (preset.frames?.length === fresh.length) fresh.forEach((f, i) => {
        f.included = preset.frames[i].included !== false;
        f.x = clamp(Number(preset.frames[i].x) || 0, -1024, 1024);
        f.y = clamp(Number(preset.frames[i].y) || 0, -1024, 1024);
        f.hold = clamp(Number(preset.frames[i].hold) || 1, 1, 64);
      });
      if (preset.settings?.fps) $('playback-fps').value = clamp(Number(preset.settings.fps), 0.5, 60);
      state.pendingPreset = null;
    }
    $('stale-warning').hidden = true; refreshCrop(); renderStrip();
    report(t("m121", count), 100);
  } catch (error) {
    report(error.message); toast(error.message);
  } finally {
    try { await seek(originalTime); } catch { /* Keep extracted results if restore fails. */ }
    setBusy(false); renderPreview(); updateSummary(); analyzeDuplicates();
  }
}

async function rekey() {
  if (!state.frames.length || state.busy) return;
  setBusy(true, true); state.cancelled = false;
  const settings = keySettings(), updated = [];
  try {
    for (let i = 0; i < state.frames.length; i++) {
      cancelled(); report(t("m122", i + 1, state.frames.length), i / state.frames.length * 100);
      updated.push(await processFrame(state.frames[i].raw, settings));
    }
    cancelled();
    updated.forEach((data, i) => Object.assign(state.frames[i], data)); state.appliedKey = settings;
    clearCandidates(); refreshCrop(); renderStrip();
    report(t("m123"), 100);
  } catch (error) {
    if (state.appliedKey) {
      $('key-enabled').checked = state.appliedKey.enabled; $('key-color').value = state.appliedKey.color;
      for (const id of ['tolerance', 'softness', 'despill']) { $(id).value = state.appliedKey[id]; $(`${id}-value`).value = $(id).value; }
      $('color-value').textContent = $('key-color').value.toUpperCase();
    }
    report(error.message); toast(error.message);
  }
  finally { setBusy(false); renderPreview(); updateSummary(); analyzeDuplicates(); }
}
function scheduleKey() {
  for (const id of ['tolerance', 'softness', 'despill']) $(`${id}-value`).value = $(id).value;
  $('color-value').textContent = $('key-color').value.toUpperCase();
  clearTimeout(keyTimer); keyTimer = setTimeout(() => { keyTimer = null; rekey(); }, 200);
}
function refreshCrop() { state.crop = sharedCrop(state.frames, state.width, state.height, $('crop-content').checked); }
function paintFrame(ctx, frame, size, originX = 0, originY = 0) {
  if (!frame || !state.crop) return;
  const b = state.crop, scale = Math.min(size / b.w, size / b.h), ratio = size / cellSize();
  ctx.save(); ctx.beginPath(); ctx.rect(originX, originY, size, size); ctx.clip();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frame.keyed, b.x, b.y, b.w, b.h,
    originX + (size - b.w * scale) / 2 + frame.x * ratio,
    originY + (size - b.h * scale) / 2 + frame.y * ratio, b.w * scale, b.h * scale);
  ctx.restore();
}
function outputCanvas(frame) { const c = canvas(cellSize()); paintFrame(c.getContext('2d'), frame, cellSize()); return c; }
function setView(view) {
  state.view = view;
  if (view === 'sheet') stopPlayback();
  for (const mode of ['animation', 'sheet']) {
    $(`view-${mode}`).classList.toggle('active', mode === view);
    $(`view-${mode}`).setAttribute('aria-pressed', String(mode === view));
  }
  renderPreview();
}
function renderPreview() {
  if (state.view === 'sheet') { renderSheetPreview(); return; }
  if (preview.width !== 512 || preview.height !== 512) { preview.width = 512; preview.height = 512; }
  const ctx = preview.getContext('2d'); ctx.clearRect(0, 0, preview.width, preview.height);
  const frame = state.frames[state.selected];
  $('result-empty').hidden = !!frame; $('preview-frame-label').hidden = !frame;
  if (!frame) return;
  if ($('onion-skin').checked && state.selected > 0 && !state.playing) {
    const previous = outputCanvas(state.frames[state.selected - 1]), p = previous.getContext('2d');
    p.globalCompositeOperation = 'source-in'; p.fillStyle = '#df8e8e'; p.fillRect(0, 0, previous.width, previous.height);
    ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(previous, 0, 0, 512, 512); ctx.restore();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(outputCanvas(frame), 0, 0, 512, 512);
  if ($('show-guides').checked) {
    ctx.save(); ctx.strokeStyle = '#828fff70'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(preview.width / 2, 0); ctx.lineTo(preview.width / 2, preview.height);
    ctx.moveTo(0, preview.height * 0.9); ctx.lineTo(preview.width, preview.height * 0.9); ctx.stroke(); ctx.restore();
  }
  $('preview-frame-label').textContent = `${state.playing ? t("m124") : t("m125")} · ${String(state.selected + 1).padStart(2, '0')} / ${state.frames.length} · ${frame.time.toFixed(3)}s${frame.included ? '' : t("m126")}${frame.hold > 1 ? t("m127", frame.hold) : ''}`;
}
function renderSheetPreview() {
  const frames = included(), columns = Math.min(frames.length || 1, Math.round(numeric('columns', 1, 16, 4))), rows = Math.max(1, Math.ceil(frames.length / columns));
  const smallCell = Math.min(192, Math.floor(1024 / Math.max(columns, rows)));
  preview.width = columns * smallCell; preview.height = rows * smallCell;
  const ctx = preview.getContext('2d');
  $('result-empty').hidden = !!frames.length; $('preview-frame-label').hidden = !frames.length;
  frames.forEach((frame, i) => {
    const x = i % columns * smallCell, y = Math.floor(i / columns) * smallCell;
    ctx.drawImage(outputCanvas(frame), x, y, smallCell, smallCell);
    ctx.strokeStyle = '#9996'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, smallCell - 1, smallCell - 1);
    ctx.fillStyle = '#222c'; ctx.fillRect(x + 3, y + 3, 24, 15);
    ctx.fillStyle = '#eee'; ctx.font = '10px Consolas, monospace'; ctx.fillText(String(state.frames.indexOf(frame) + 1).padStart(2, '0'), x + 7, y + 14);
  });
  $('preview-frame-label').textContent = t("m128", columns, rows, columns * cellSize(), rows * cellSize());
}
function selectFrame(index, pause = true) {
  if (state.busy) return;
  if (pause) { stopPlayback(); if (state.view === 'sheet') setView('animation'); }
  state.selected = clamp(index, 0, state.frames.length - 1);
  document.querySelectorAll('.frame-tile').forEach((tile, i) => {
    tile.classList.toggle('selected', i === state.selected);
    tile.querySelector('button').setAttribute('aria-pressed', String(i === state.selected));
  });
  const f = state.frames[state.selected];
  if (f) {
    if (pause && state.loaded) { video.pause(); video.currentTime = f.time; }
    $('selected-label').textContent = t("m129", String(state.selected + 1).padStart(2, '0'), f.time.toFixed(3));
    $('offset-x').value = f.x; $('offset-y').value = f.y;
  }
  renderPreview();
}
function renderStrip() {
  const strip = $('frame-strip'); strip.replaceChildren();
  if (!state.frames.length) {
    const empty = document.createElement('div'); empty.className = 'frames-empty'; empty.textContent = t("m056"); strip.append(empty);
    $('selected-label').textContent = t("m057"); updateSummary(); return;
  }
  state.frames.forEach((frame, i) => {
    const tile = document.createElement('div'); tile.className = `frame-tile${i === state.selected ? ' selected' : ''}${frame.included ? '' : ' excluded'}`;
    const button = document.createElement('button'); button.className = 'checker'; button.setAttribute('aria-label', t("m130", i + 1, frame.time.toFixed(3))); button.setAttribute('aria-pressed', String(i === state.selected));
    tile.dataset.rawHash = frame.rawHash;
    const thumb = canvas(144); thumb.getContext('2d').drawImage(outputCanvas(frame), 0, 0, 144, 144); button.append(thumb); button.addEventListener('click', () => selectFrame(i));
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = frame.included; checkbox.setAttribute('aria-label', t("m131", i + 1));
    checkbox.addEventListener('change', () => { if (state.busy) return; stopPlayback(); frame.included = checkbox.checked; tile.classList.toggle('excluded', !frame.included); updateSummary(); analyzeDuplicates(); });
    const caption = document.createElement('div'); caption.className = 'frame-caption';
    const number = document.createElement('span'); number.textContent = String(i + 1).padStart(2, '0');
    const time = document.createElement('span'); time.textContent = `${frame.time.toFixed(2)}s${frame.hold > 1 ? ` ×${frame.hold}` : ''}`; caption.append(number, time);
    tile.append(button, checkbox, caption); strip.append(tile);
  });
  // Selection text is also refreshed while a job is finishing.
  const f = state.frames[state.selected];
  if (f) { $('selected-label').textContent = t("m129", String(state.selected + 1).padStart(2, '0'), f.time.toFixed(3)); $('offset-x').value = f.x; $('offset-y').value = f.y; }
  updateSummary();
  markCandidates();
}
function frameClipped(frame) {
  if (!frame.bounds || !state.crop) return false;
  const c = state.crop, b = frame.bounds, size = cellSize(), s = Math.min(size / c.w, size / c.h);
  const left = (size - c.w * s) / 2 + (b.x - c.x) * s + frame.x;
  const top = (size - c.h * s) / 2 + (b.y - c.y) * s + frame.y;
  return left < -0.5 || top < -0.5 || left + b.w * s > size + 0.5 || top + b.h * s > size + 0.5;
}
function updateSummary() {
  const frames = included(), n = frames.length, cols = Math.min(n || 1, Math.round(numeric('columns', 1, 16, 4))), rows = Math.ceil(n / cols);
  $('frame-total').textContent = `${n} / ${state.frames.length}`;
  $('export-summary').textContent = n ? t("m132", n, cellSize(), cols * cellSize(), rows * cellSize(), (durationMs() / 1000).toFixed(2)) : t("m067");
  $('pixel-size-label').textContent = `${cellSize()} × ${cellSize()} px`;
  if (state.extraction) {
    const e = state.extraction, unique = countUniqueSources();
    $('extraction-diagnostics').textContent = t("m133", e.start.toFixed(3), e.end.toFixed(3), ((e.end - e.start) / e.count).toFixed(3), unique, state.frames.length);
    const sparse = e.count / (e.end - e.start) < 8;
    $('sampling-warning').hidden = !sparse && unique === state.frames.length;
    $('sampling-warning').textContent = sparse ? t("m134", (e.count / (e.end - e.start)).toFixed(1)) : t("m135", state.frames.length - unique);
  } else { $('sampling-warning').hidden = true; $('extraction-diagnostics').textContent = t("m052"); }
  const warnings = [];
  if (state.frames.length && !n) warnings.push(t("m136"));
  const empty = frames.filter(f => !f.bounds).length;
  if (empty) warnings.push(t("m137", empty));
  const clipped = frames.filter(frameClipped).length;
  if (clipped) warnings.push(t("m138", clipped));
  if (n && n < state.frames.length) warnings.push(frames.some(f => f.hold > 1) ? t("m139") : t("m140"));
  $('frame-warning').hidden = !warnings.length; $('frame-warning').textContent = warnings.join(' ');
}

let uniqueFrameSource, uniqueFrameCount = 0;
function countUniqueSources() {
  if (uniqueFrameSource === state.frames) return uniqueFrameCount;
  uniqueFrameSource = state.frames; uniqueFrameCount = 0;
  const buckets = new Map();
  for (const frame of state.frames) {
    const bucket = buckets.get(frame.rawHash) || [], bytes = frame.raw.data;
    const same = bucket.some(other => other.length === bytes.length && other.every((v, i) => v === bytes[i]));
    if (!same) { bucket.push(bytes); uniqueFrameCount++; }
    buckets.set(frame.rawHash, bucket);
  }
  return uniqueFrameCount;
}
function clearCandidates() {
  state.candidates = [];
  $('duplicate-list').replaceChildren();
  $('duplicate-summary').textContent = t("m064");
  document.querySelectorAll('.frame-tile.candidate').forEach(tile => tile.classList.remove('candidate'));
  document.querySelectorAll('.candidate-marker').forEach(el => el.remove());
  renderDuplicateHistory();
}
function renderDuplicateHistory() {
  const list = $('duplicate-applied-list'); list.replaceChildren();
  $('duplicate-history').hidden = !state.duplicateApplied.length;
  for (const c of state.duplicateApplied) {
    const button = document.createElement('button');
    const number = String(c.index + 1).padStart(2, '0'), kept = String(c.keep + 1).padStart(2, '0');
    button.textContent = state.frames[c.index]?.included ? t("m141", number) : t("m142", number, kept);
    button.title = t("m143", c.index + 1);
    button.addEventListener('click', () => selectFrame(c.index));
    button.disabled = state.busy; list.append(button);
  }
}
function markCandidates() {
  document.querySelectorAll('.candidate-marker').forEach(el => el.remove());
  document.querySelectorAll('.frame-tile').forEach((tile, index) => {
    const c = state.candidates.find(c => c.index === index);
    tile.classList.toggle('candidate', !!c);
    const applied = !state.frames[index]?.included && state.duplicateApplied.some(c => c.index === index);
    if (c || applied) { const mark = document.createElement('span'); mark.className = 'candidate-marker'; mark.textContent = c ? t("m059") : t("m144"); tile.append(mark); }
  });
}
function analyzeDuplicates() {
  if (state.busy || !state.frames.length) return;
  stopPlayback(); clearCandidates();
  const signatures = [];
  for (let index = 0; index < state.frames.length; index++) {
    const frame = state.frames[index]; if (!frame.included) continue;
    const c = canvas(64), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(outputCanvas(frame), 0, 0, 64, 64);
    signatures.push({ index, pixels: ctx.getImageData(0, 0, 64, 64).data });
  }
  const threshold = numeric('duplicate-threshold', 0, 8, 2);
  state.candidates = suggestDuplicates(signatures, threshold / 100);
  $('duplicate-summary').textContent = state.candidates.length
    ? t("m145", state.candidates.length, threshold)
    : t("m146", threshold);
  for (const c of state.candidates) {
    const button = document.createElement('button');
    button.textContent = t("m147", String(c.keep + 1).padStart(2, '0'), String(c.index + 1).padStart(2, '0'), (c.score * 100).toFixed(1));
    button.title = t("m148", (c.overall * 100).toFixed(2), (c.lower * 100).toFixed(2));
    button.addEventListener('click', () => {
      stopPlayback(); setView('animation'); selectFrame(c.keep);
      state.pair = [c.keep, c.index]; state.playing = true; state.lastTick = performance.now();
      $('preview-play').textContent = t("m149"); $('preview-play').setAttribute('aria-label', t("m150"));
      document.querySelectorAll('.duplicate-list button').forEach(b => b.classList.toggle('active', b === button));
    });
    $('duplicate-list').append(button);
  }
  markCandidates(); updateAvailability(); renderPreview();
}
function applyCandidates() {
  if (state.busy || !state.candidates.length) return;
  stopPlayback();
  const count = state.candidates.length;
  state.duplicateUndo = state.frames.map(f => ({ included: f.included, hold: f.hold || 1 }));
  state.duplicateUndoApplied = state.duplicateApplied.slice();
  state.duplicateApplied = [...state.duplicateApplied, ...state.candidates];
  const next = applyDuplicatePlan(state.frames, state.candidates);
  next.forEach((value, i) => Object.assign(state.frames[i], value));
  clearCandidates(); renderStrip();
  if (!state.frames[state.selected].included) state.selected = state.frames.indexOf(included()[0]);
  selectFrame(state.selected); updateAvailability();
  $('duplicate-summary').textContent = t("m151", count);
  toast(t("m152", count));
}
function undoCandidates() {
  if (!state.duplicateUndo || state.busy) return;
  stopPlayback(); state.duplicateUndo.forEach((v, i) => Object.assign(state.frames[i], v));
  state.duplicateUndo = null; state.duplicateApplied = state.duplicateUndoApplied; state.duplicateUndoApplied = []; renderDuplicateHistory(); renderStrip(); renderPreview(); analyzeDuplicates();
  toast(t("m153"));
}
async function resetSettings(overrides = {}) {
  if (state.busy) return;
  clearTimeout(keyTimer); keyTimer = null; stopPlayback(); setPicking(false);
  const defaults = { 'start-time': 0, 'end-time': state.loaded ? Math.min(1, video.duration) : 1, 'frame-count': 12, resolution: 1024, 'key-color': '#00ff00', tolerance: 30, softness: 8, despill: 75, 'cell-size': 256, columns: 4, 'playback-fps': 12, 'duplicate-threshold': 2, ...overrides };
  for (const [id, value] of Object.entries(defaults)) $(id).value = value;
  for (const id of ['key-enabled', 'crop-content', 'loop']) $(id).checked = true;
  $('show-guides').checked = false; $('onion-skin').checked = false;
  for (const id of ['tolerance', 'softness', 'despill']) $(`${id}-value`).value = $(id).value;
  $('color-value').textContent = '#00FF00';
  state.frames = []; state.extraction = null; state.selected = 0; state.pendingPreset = null; state.duplicateUndo = null; state.duplicateApplied = []; state.duplicateUndoApplied = []; state.crop = null;
  clearCandidates(); renderStrip(); setView('animation');
  $('frame-strip').classList.remove('horizontal'); $('toggle-grid').textContent = t("m053"); $('toggle-grid').setAttribute('aria-pressed', 'true');
  document.querySelector('[data-bg="checker"]').click();
  $('stale-warning').hidden = true; updateAvailability();
  if (state.loaded) await extractFrames();
  else report(t("m154"));
  toast(t("m155"));
}
function playbackTick(now) {
  if (state.playing && !state.busy) {
    const seq = included().map(f => state.frames.indexOf(f));
    const sequence = state.pair || (state.seam ? [seq[0], seq.at(-1)] : seq);
    let steps = 0;
    if (now - state.lastTick > 3000) state.lastTick = now;
    while (state.playing && sequence.length && steps++ < 128) {
      const interval = state.seam || state.pair ? 400 : (state.frames[state.selected]?.hold || 1) * 1000 / fps();
      if (now - state.lastTick < interval) break;
      state.lastTick += interval;
      const next = sequence.indexOf(state.selected) + 1;
      if (next >= sequence.length && !$('loop').checked && !state.seam && !state.pair) { selectFrame(sequence.at(-1), false); stopPlayback(); renderPreview(); }
      else selectFrame(sequence[next % sequence.length], false);
    }
  }
  requestAnimationFrame(playbackTick);
}
function play(seam = false) {
  if (state.busy || !included().length) return;
  if (state.playing && state.seam === seam) { stopPlayback(); renderPreview(); return; }
  stopPlayback(); state.seam = seam;
  setView('animation');
  selectFrame(state.frames.indexOf(included()[0]), false);
  state.playing = true; state.lastTick = performance.now();
  $('preview-play').textContent = t("m149"); $('preview-play').setAttribute('aria-label', t("m156"));
  if (seam) $('compare-seam').textContent = t("m157");
}

function setPicking(value) {
  state.picking = value; $('source-stage').classList.toggle('picking', value);
  $('pick-hint').hidden = !value; $('pick-color').setAttribute('aria-pressed', String(value));
  $('pick-color').textContent = value ? t("m158") : t("m025");
  if (value) video.pause();
}
$('source-stage').addEventListener('click', event => {
  if (!state.picking || state.busy || !state.loaded) return;
  const rect = video.getBoundingClientRect(), scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const x = Math.floor((event.clientX - rect.left - (rect.width - video.videoWidth * scale) / 2) / scale);
  const y = Math.floor((event.clientY - rect.top - (rect.height - video.videoHeight * scale) / 2) / scale);
  if (x < 0 || y < 0 || x >= video.videoWidth || y >= video.videoHeight) return;
  const c = canvas(1), ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, x, y, 1, 1, 0, 0, 1, 1);
  const rgb = ctx.getImageData(0, 0, 1, 1).data;
  $('key-color').value = '#' + [...rgb.slice(0, 3)].map(n => n.toString(16).padStart(2, '0')).join('');
  setPicking(false); scheduleKey(); toast(t("m159"));
});

function toBlob(c) { return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error(t("m160"))), 'image/png')); }
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function exportMetadata(frames, columns, rows) {
  const size = cellSize();
  return {
    format: 'js-spritebake', version: 2, image: `${basename()}-sheet.png`, source: state.name,
    sourceDimensions: { width: video.videoWidth, height: video.videoHeight }, extraction: state.extraction,
    key: state.appliedKey, commonCrop: state.crop, cellWidth: size, cellHeight: size,
    columns, rows, width: columns * size, height: rows * size,
    fps: fps(), loop: $('loop').checked, durationMs: durationMs(),
    timing: 'Use each frame durationMs. Merged duplicates hold the previous frame; manually excluded frames remove time.',
    frames: frames.map((f, i) => ({
      filename: `frames/${String(i + 1).padStart(3, '0')}.png`, sourceIndex: state.frames.indexOf(f), sourceTime: f.time,
      frame: { x: i % columns * size, y: Math.floor(i / columns) * size, w: size, h: size },
      durationMs: (f.hold || 1) * 1000 / fps(), hold: f.hold || 1, offset: { x: f.x, y: f.y }, pivot: { x: 0.5, y: 0.9 },
    })),
  };
}
async function exportSprites(zip) {
  if (state.busy || !included().length) return;
  // Flush pending slider changes before an export so pixels and metadata agree.
  if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; await rekey(); }
  if (state.busy) return;
  const frames = included(), columns = Math.min(frames.length, Math.round(numeric('columns', 1, 16, 4))), rows = Math.ceil(frames.length / columns), size = cellSize();
  if (columns * size > 16384 || rows * size > 16384 || columns * rows * size * size > 32 * 1024 * 1024) { toast(t("m161")); return; }
  setBusy(true); report(t("m162"), 0);
  try {
    await nextPaint(); const sheet = canvas(columns * size, rows * size), ctx = sheet.getContext('2d');
    frames.forEach((f, i) => paintFrame(ctx, f, size, i % columns * size, Math.floor(i / columns) * size));
    const sheetBlob = await toBlob(sheet), name = basename();
    if (zip) {
      const metadata = exportMetadata(frames, columns, rows);
      const files = [{ name: `${name}-sheet.png`, data: new Uint8Array(await sheetBlob.arrayBuffer()) }, { name: `${name}.json`, data: new TextEncoder().encode(JSON.stringify(metadata, null, 2)) }];
      for (let i = 0; i < frames.length; i++) {
        report(t("m163", i + 1, frames.length), (i + 1) / frames.length * 100);
        const png = await toBlob(outputCanvas(frames[i]));
        files.push({ name: `frames/${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await png.arrayBuffer()) });
        await nextPaint();
      }
      files.push({ name: `${name}-settings.json`, data: new TextEncoder().encode(JSON.stringify(presetData(), null, 2)) });
      download(makeZip(files), `${name}-sprites.zip`);
    } else download(sheetBlob, `${name}-sheet.png`);
    report(t("m164", zip ? 'ZIP' : t("m068")), 100);
    toast(zip ? t("m165") : t("m166"));
  } catch (error) { report(error.message); toast(error.message); }
  finally { setBusy(false); }
}

function presetData() {
  return {
    format: 'js-spritebake-preset', version: 1, source: state.name,
    settings: { start: Number($('start-time').value), end: Number($('end-time').value), count: frameCount(), resolution: Number($('resolution').value), ...keySettings(), cellSize: cellSize(), columns: Number($('columns').value), crop: $('crop-content').checked, fps: fps(), loop: $('loop').checked },
    frames: state.frames.map(f => ({ included: f.included, x: f.x, y: f.y, hold: f.hold || 1 })),
  };
}
async function readPreset(file) {
  try {
    if (!file || file.size > 1024 * 1024) throw new Error(t("m167"));
    const data = JSON.parse(await file.text());
    if (!['js-spritebake-preset', 'sprite-workshop-preset'].includes(data.format) || data.version !== 1 || !data.settings) throw new Error(t("m168"));
    const s = data.settings;
    const numbers = { 'start-time': [s.start, 0, state.loaded ? video.duration : 86400], 'end-time': [s.end, 0, state.loaded ? video.duration : 86400], 'frame-count': [s.count, 2, 64], tolerance: [s.tolerance, 1, 60], softness: [s.softness, 0, 20], despill: [s.despill, 0, 100], columns: [s.columns, 1, 16], 'playback-fps': [s.fps, 0.5, 60] };
    for (const [id, [value, low, high]] of Object.entries(numbers)) if (Number.isFinite(value)) $(id).value = clamp(value, low, high);
    if ([512, 1024, 2048].includes(s.resolution)) $('resolution').value = s.resolution;
    if ([128, 256, 512, 1024].includes(s.cellSize)) $('cell-size').value = s.cellSize;
    if (/^#[0-9a-f]{6}$/i.test(s.color)) $('key-color').value = s.color;
    $('key-enabled').checked = s.enabled !== false; $('crop-content').checked = s.crop !== false; $('loop').checked = s.loop !== false;
    if (data.frames && (!Array.isArray(data.frames) || data.frames.length > 64 || data.frames.some(f => !f || typeof f !== 'object'))) throw new Error(t("m169"));
    state.pendingPreset = data; stopPlayback(); scheduleKey(); refreshCrop(); renderStrip(); renderPreview();
    $('stale-warning').hidden = false;
    toast(data.source && data.source !== state.name ? t("m170", data.source) : t("m171"));
  } catch (error) { toast(t("m172", error.message)); }
}

$('file-input').addEventListener('change', event => {
  const file = event.target.files[0]; if (file) loadVideo(URL.createObjectURL(file), file.name, { objectURL: true }); event.target.value = '';
});
$('load-sample').addEventListener('click', async () => {
  if (state.busy) return;
  setBusy(true); report(t('sampleLoading'));
  try {
    // Use a complete local Blob so seeking also works on servers without byte ranges.
    const response = await fetch(new URL('./samples/walk-demo.mp4', import.meta.url));
    if (!response.ok) throw new Error(t('sampleFailed'));
    const blob = await response.blob();
    setBusy(false);
    await loadVideo(URL.createObjectURL(blob), 'walk-demo.mp4', { objectURL: true });
    // The bundled walk is one 8-pose cycle per second.
    if (state.loaded) { await resetSettings({ 'frame-count': 8 }); if (included().length) play(); }
  } catch { report(t('sampleFailed')); toast(t('sampleFailed')); }
  finally { setBusy(false); }
});
$('language-select').addEventListener('change', event => {
  applyLanguage(event.target.value);
  stopPlayback();
  renderStrip(); renderPreview(); renderDuplicateHistory(); updateAvailability();
  setPicking(state.picking);
  $('source-play').setAttribute('aria-label', video.paused ? t('m087') : t('m176'));
  $('toggle-grid').textContent = $('frame-strip').classList.contains('horizontal') ? t('m173') : t('m053');
});
$('reset-settings').addEventListener('click', () => resetSettings());
$('analyze-duplicates').addEventListener('click', analyzeDuplicates);
$('duplicate-threshold').addEventListener('change', analyzeDuplicates);
$('apply-duplicates').addEventListener('click', applyCandidates);
$('undo-duplicates').addEventListener('click', undoCandidates);
$('view-animation').addEventListener('click', () => setView('animation'));
$('view-sheet').addEventListener('click', () => setView('sheet'));
$('onion-skin').addEventListener('change', () => { stopPlayback(); setView('animation'); });
$('previous-frame').addEventListener('click', () => selectFrame((state.selected + state.frames.length - 1) % state.frames.length));
$('next-frame').addEventListener('click', () => selectFrame((state.selected + 1) % state.frames.length));
$('toggle-grid').addEventListener('click', () => {
  const horizontal = $('frame-strip').classList.toggle('horizontal');
  $('toggle-grid').textContent = horizontal ? t("m173") : t("m053");
  $('toggle-grid').setAttribute('aria-pressed', String(!horizontal));
});
$('one-second').addEventListener('click', () => {
  $('start-time').value = 0; $('end-time').value = Math.min(1, video.duration).toFixed(3); $('frame-count').value = 12;
  $('stale-warning').hidden = !state.frames.length;
});
$('full-range').addEventListener('click', () => { $('start-time').value = 0; $('end-time').value = video.duration.toFixed(3); $('stale-warning').hidden = !state.frames.length; });
preview.addEventListener('click', event => {
  if (state.view !== 'sheet' || state.busy || !included().length) return;
  const frames = included(), columns = Math.min(frames.length, Math.round(numeric('columns', 1, 16, 4))), rows = Math.ceil(frames.length / columns);
  const rect = preview.getBoundingClientRect();
  const col = Math.floor((event.clientX - rect.left) / rect.width * columns), row = Math.floor((event.clientY - rect.top) / rect.height * rows);
  const f = frames[row * columns + col]; if (f) selectFrame(state.frames.indexOf(f));
});
for (const event of ['dragenter', 'dragover']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.remove('dragging'); });
$('drop-zone').addEventListener('drop', e => {
  if (state.busy) { toast(t("m174")); return; }
  const file = e.dataTransfer.files[0]; if (file) loadVideo(URL.createObjectURL(file), file.name, { objectURL: true });
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
$('extract-button').addEventListener('click', extractFrames);
$('cancel-button').addEventListener('click', () => { state.cancelled = true; $('cancel-button').disabled = true; report(t("m175")); });
for (const id of ['start-time', 'end-time', 'frame-count', 'resolution']) $(id).addEventListener('input', () => { $('stale-warning').hidden = !state.frames.length; });
$('set-start').addEventListener('click', () => { $('start-time').value = video.currentTime.toFixed(3); $('stale-warning').hidden = !state.frames.length; });
$('set-end').addEventListener('click', () => { $('end-time').value = video.currentTime.toFixed(3); $('stale-warning').hidden = !state.frames.length; });
for (const id of ['key-enabled', 'key-color', 'tolerance', 'softness', 'despill']) $(id).addEventListener('input', scheduleKey);
$('pick-color').addEventListener('click', () => setPicking(!state.picking));
$('source-play').addEventListener('click', async () => { if (video.paused) { try { await video.play(); } catch (error) { toast(error.message); } } else video.pause(); });
video.addEventListener('play', () => { $('source-play').textContent = 'Ⅱ'; $('source-play').setAttribute('aria-label', t("m176")); });
video.addEventListener('pause', () => { $('source-play').textContent = '▶'; $('source-play').setAttribute('aria-label', t("m087")); });
video.addEventListener('timeupdate', updateSourceTime);
$('source-scrub').addEventListener('input', () => { video.pause(); video.currentTime = Number($('source-scrub').value); updateSourceTime(); });
$('preview-play').addEventListener('click', () => play());
$('compare-seam').addEventListener('click', () => play(true));
$('playback-fps').addEventListener('input', updateSummary);
$('show-guides').addEventListener('change', renderPreview);
document.querySelectorAll('[data-bg]').forEach(button => button.addEventListener('click', () => {
  $('result-stage').className = `result-stage ${button.dataset.bg}`;
  document.querySelectorAll('[data-bg]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
}));
$('select-all').addEventListener('click', () => { stopPlayback(); state.frames.forEach(f => { f.included = true; f.hold = 1; }); state.duplicateUndo = null; state.duplicateApplied = []; state.duplicateUndoApplied = []; clearCandidates(); renderStrip(); renderPreview(); analyzeDuplicates(); });
for (const id of ['offset-x', 'offset-y']) $(id).addEventListener('input', () => {
  if (state.busy || !state.frames.length) return;
  stopPlayback(); clearCandidates(); const frame = state.frames[state.selected];
  frame.x = numeric('offset-x', -1024, 1024, 0); frame.y = numeric('offset-y', -1024, 1024, 0);
  const thumb = $('frame-strip').children[state.selected].querySelector('canvas'), ctx = thumb.getContext('2d'); ctx.clearRect(0, 0, thumb.width, thumb.height); paintFrame(ctx, frame, thumb.width);
  renderPreview(); updateSummary(); analyzeDuplicates();
});
$('reset-offset').addEventListener('click', () => { if (!state.frames.length) return; stopPlayback(); state.frames[state.selected].x = 0; state.frames[state.selected].y = 0; renderStrip(); analyzeDuplicates(); });
for (const id of ['cell-size', 'columns', 'crop-content']) $(id).addEventListener('change', () => { refreshCrop(); renderStrip(); renderPreview(); updateSummary(); if (id !== 'columns') analyzeDuplicates(); else updateAvailability(); });
$('export-sheet').addEventListener('click', () => exportSprites(false));
$('export-zip').addEventListener('click', () => exportSprites(true));
$('save-preset').addEventListener('click', () => download(new Blob([JSON.stringify(presetData(), null, 2)], { type: 'application/json' }), `${basename()}-settings.json`));
$('load-preset').addEventListener('click', () => $('preset-input').click());
$('preset-input').addEventListener('change', event => { readPreset(event.target.files[0]); event.target.value = ''; });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('close-help').addEventListener('click', () => $('help-dialog').close());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setPicking(false);
  if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || $('help-dialog').open || state.busy) return;
  if (event.code === 'Space') { event.preventDefault(); play(); }
  if (state.frames.length && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); selectFrame((state.selected + (event.key === 'ArrowRight' ? 1 : state.frames.length - 1)) % state.frames.length); }
});
window.addEventListener('pagehide', () => { if (state.sourceURL) URL.revokeObjectURL(state.sourceURL); worker?.terminate(); });
requestAnimationFrame(playbackTick);
applyLanguage(initialLanguage(), { updateURL: false });
updateAvailability();
if (location.protocol === 'file:') {
  report(t("m177"));
} else {
  report(t("m050"));
}
document.documentElement.dataset.ready = 'true';
