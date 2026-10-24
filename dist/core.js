export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// A smooth alpha transition preserves antialiased outlines. Spill suppression
// only affects the dominant key channel near colors contaminated by that key.
export function keyPixels(bytes, width, height, settings) {
  const key = settings.color.match(/[a-f\d]{2}/gi).map(n => parseInt(n, 16));
  const tolerance = settings.tolerance / 100;
  const softness = settings.softness / 100;
  const spill = settings.despill / 100;
  const dominant = key.indexOf(Math.max(...key));
  const others = [0, 1, 2].filter(n => n !== dominant);
  const saturatedKey = key[dominant] - Math.max(key[others[0]], key[others[1]]) > 50;
  let minX = width, minY = height, maxX = -1, maxY = -1, visible = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    if (settings.enabled) {
      const r = bytes[i] - key[0], g = bytes[i + 1] - key[1], b = bytes[i + 2] - key[2];
      const distance = Math.sqrt(r * r + g * g + b * b) / 441.67295593;
      const t = softness ? clamp((distance - tolerance) / softness, 0, 1) : +(distance > tolerance);
      bytes[i + 3] = Math.round(bytes[i + 3] * t * t * (3 - 2 * t));
      if (spill && saturatedKey && bytes[i + 3]) {
        const cap = Math.max(bytes[i + others[0]], bytes[i + others[1]]);
        const excess = Math.max(0, bytes[i + dominant] - cap);
        const proximity = clamp((tolerance + softness + 0.3 - distance) / 0.3, 0, 1);
        bytes[i + dominant] -= Math.round(excess * spill * proximity);
      }
    }
    if (bytes[i + 3] > 16) {
      const pixel = i / 4, x = pixel % width, y = Math.floor(pixel / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y); visible++;
    }
  }
  return { bounds: visible ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null, visible };
}

export function sharedCrop(frames, width, height, crop) {
  const bounds = frames.map(f => f.bounds).filter(Boolean);
  if (!crop || !bounds.length) return { x: 0, y: 0, w: width, h: height };
  const left = Math.min(...bounds.map(b => b.x)), top = Math.min(...bounds.map(b => b.y));
  const right = Math.max(...bounds.map(b => b.x + b.w)), bottom = Math.max(...bounds.map(b => b.y + b.h));
  // This one rectangle is used for every frame, including crouching poses.
  const padding = Math.ceil(Math.max(right - left, bottom - top) * 0.07);
  const x = Math.max(0, left - padding), y = Math.max(0, top - padding);
  return { x, y, w: Math.min(width, right + padding) - x, h: Math.min(height, bottom + padding) - y };
}

// Compare premultiplied foreground colors in a shared coordinate system. Empty
// background must not drown out a moving foot or make two sprites look equal.
export function frameDifference(a, b, width, height) {
  let top = height, bottom = -1;
  for (let i = 3; i < a.length; i += 4) {
    if (Math.max(a[i], b[i]) > 16) {
      const y = Math.floor((i - 3) / 4 / width);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (bottom < 0) return { overall: 1, lower: 1, score: 1, empty: true };
  const lowerStart = top + (bottom - top) * 0.65;
  let total = 0, pixels = 0, lowerTotal = 0, lowerPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.max(a[i + 3], b[i + 3]) <= 16) continue;
    const aa = a[i + 3] / 255, ba = b[i + 3] / 255;
    const delta = (Math.abs(a[i] * aa - b[i] * ba) + Math.abs(a[i + 1] * aa - b[i + 1] * ba) + Math.abs(a[i + 2] * aa - b[i + 2] * ba) + Math.abs(a[i + 3] - b[i + 3])) / 1020;
    total += delta; pixels++;
    if (Math.floor(i / 4 / width) >= lowerStart) { lowerTotal += delta; lowerPixels++; }
  }
  const overall = total / pixels, lower = lowerPixels ? lowerTotal / lowerPixels : overall;
  return { overall, lower, score: Math.max(overall, lower), empty: false };
}

export function suggestDuplicates(signatures, threshold, width = 64, height = 64) {
  const candidates = [];
  if (!signatures.length) return candidates;
  let kept = signatures[0];
  for (const current of signatures.slice(1)) {
    const difference = frameDifference(kept.pixels, current.pixels, width, height);
    if (difference.score <= threshold && !difference.empty) {
      candidates.push({ index: current.index, keep: kept.index, ...difference });
    } else kept = current;
  }
  return candidates;
}

export function applyDuplicatePlan(frames, candidates) {
  const result = frames.map(f => ({ included: f.included, hold: f.hold || 1 }));
  for (const c of candidates) {
    if (result[c.index]?.included && result[c.keep]?.included && c.index !== c.keep) {
      result[c.keep].hold += result[c.index].hold;
      result[c.index].included = false;
      // A later manual re-include represents one frame, not a second held run.
      result[c.index].hold = 1;
    }
  }
  return result;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ZIP STORE keeps the app dependency-free. PNG data is already compressed.
export function makeZip(files) {
  const encoder = new TextEncoder(), chunks = [], central = [];
  let offset = 0, centralSize = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = file.data;
    const crc = crc32(data);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true); view.setUint16(12, 33, true);
    view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const entry = new Uint8Array(46 + name.length), ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true);
    ev.setUint16(8, 0x0800, true); ev.setUint16(14, 33, true);
    ev.setUint32(16, crc, true); ev.setUint32(20, data.length, true); ev.setUint32(24, data.length, true);
    ev.setUint16(28, name.length, true); ev.setUint32(42, offset, true); entry.set(name, 46);
    chunks.push(header, data); central.push(entry); offset += header.length + data.length; centralSize += entry.length;
  }
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
