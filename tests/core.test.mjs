import test from 'node:test';
import assert from 'node:assert/strict';
import { keyPixels, sharedCrop, makeZip, crc32, frameDifference, suggestDuplicates, applyDuplicatePlan } from '../dist/core.js';

const settings = { enabled: true, color: '#00ff00', tolerance: 30, softness: 8, despill: 75 };

test('green background becomes transparent while character blue and outline remain', () => {
  const pixels = new Uint8ClampedArray([0,255,0,255, 40,115,210,255, 20,20,20,255]);
  const result = keyPixels(pixels, 3, 1, settings);
  assert.equal(pixels[3], 0);
  assert.equal(pixels[7], 255); assert.equal(pixels[11], 255);
  assert.deepEqual([...pixels.slice(4, 7)], [40,115,210]);
  assert.deepEqual(result.bounds, { x: 1, y: 0, w: 2, h: 1 });
});
test('soft edge retains partial alpha; disabled key preserves pixels exactly', () => {
  const pixels = new Uint8ClampedArray([85,170,85,255]);
  keyPixels(pixels, 1, 1, settings);
  assert.ok(pixels[3] > 0 && pixels[3] < 255);
  const unchanged = new Uint8ClampedArray([0,255,0,255, 80,90,100,180]);
  const copy = unchanged.slice(); keyPixels(unchanged, 2, 1, { ...settings, enabled: false });
  assert.deepEqual(unchanged, copy);
});
test('empty keyed frame has no bounds; common crop contains tall and crouching poses', () => {
  const green = new Uint8ClampedArray([0,255,0,255]);
  assert.equal(keyPixels(green, 1, 1, settings).bounds, null);
  const frames = [{bounds:{x:20,y:10,w:40,h:80}}, {bounds:{x:10,y:50,w:70,h:40}}, {bounds:null}];
  const crop = sharedCrop(frames, 100, 100, true);
  assert.ok(crop.x <= 10 && crop.y <= 10 && crop.x + crop.w >= 80 && crop.y + crop.h >= 90);
  assert.deepEqual(sharedCrop(frames, 100, 100, false), {x:0,y:0,w:100,h:100});
});
test('ZIP uses correct CRC and central offsets including Unicode filenames', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const data = new TextEncoder().encode('hello sprite');
  const zip = new Uint8Array(await makeZip([{name:'프레임.png',data}, {name:'atlas.json',data}]).arrayBuffer());
  const view = new DataView(zip.buffer), end = zip.length - 22;
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(6, true), 0x800);
  assert.equal(view.getUint32(14, true), crc32(data));
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const central = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(central + 42, true), 0);
});

test('foreground comparison ignores transparent RGB but detects moving feet', () => {
  const a = new Uint8ClampedArray(16*16*4), b = new Uint8ClampedArray(a.length);
  for (let y=2;y<14;y++) for (let x=4;x<12;x++) { const i=(y*16+x)*4; a.set([60,120,200,255],i); b.set([60,120,200,255],i); }
  b.set([255,50,10,0],0);
  assert.equal(frameDifference(a,b,16,16).score,0);
  for (let y=11;y<14;y++) for (let x=4;x<7;x++) b[(y*16+x)*4+3]=0;
  const d=frameDifference(a,b,16,16);
  assert.ok(d.lower > d.overall && d.score > .02);
  assert.equal(suggestDuplicates([{index:0,pixels:a},{index:1,pixels:b}],.02,16,16).length,0);
});
test('duplicate plan keeps recurring poses after intervening motion and preserves time', () => {
  const a = new Uint8ClampedArray([60,120,200,255]), b = new Uint8ClampedArray([200,50,50,255]);
  const candidates = suggestDuplicates([{index:0,pixels:a},{index:1,pixels:a},{index:2,pixels:b},{index:3,pixels:a}],.02,1,1);
  assert.deepEqual(candidates.map(c=>[c.keep,c.index]),[[0,1]]);
  const before = Array.from({length:4},()=>({included:true,hold:1}));
  const after = applyDuplicatePlan(before,candidates);
  assert.equal(after.filter(f=>f.included).length,3);
  assert.equal(after.filter(f=>f.included).reduce((s,f)=>s+f.hold,0),4);
  assert.equal(after[0].hold,2);
  assert.equal(before[0].hold,1);
  const blank = new Uint8ClampedArray(4);
  assert.equal(suggestDuplicates([{index:0,pixels:blank},{index:1,pixels:blank}],.08,1,1).length,0);
});
