// A procedural test fixture, drawn specifically for JS SpriteBake. No external
// artwork, codecs, video assets or libraries are downloaded. Run in a browser.
(async () => {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const draw = n => {
    const phase = n * Math.PI / 12, x = 256 + Math.sin(phase) * 8, y = 240 + Math.sin(phase * 2) * 5;
    ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 512, 512);
    ctx.lineCap = 'round'; ctx.lineWidth = 21;
    ctx.strokeStyle = '#263854'; ctx.beginPath(); ctx.moveTo(x - 22, y + 61); ctx.lineTo(x - 25 + Math.sin(phase) * 27, y + 118); ctx.stroke();
    ctx.strokeStyle = '#6582a8'; ctx.beginPath(); ctx.moveTo(x + 22, y + 61); ctx.lineTo(x + 25 - Math.sin(phase) * 27, y + 118); ctx.stroke();
    ctx.fillStyle = '#548be5'; ctx.fillRect(x - 48, y - 5, 96, 82);
    ctx.fillStyle = '#263854'; ctx.beginPath(); ctx.arc(x, y - 43, 47, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9d0a5'; ctx.beginPath(); ctx.arc(x, y - 40, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263854'; ctx.fillRect(x - 21, y - 48, 7, 7); ctx.fillRect(x + 14, y - 48, 7, 7);
    ctx.strokeStyle = '#e9d0a5'; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(x - 48, y + 11); ctx.lineTo(x - 65, y + 55 + Math.sin(phase) * 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 48, y + 11); ctx.lineTo(x + 65, y + 55 - Math.sin(phase) * 17); ctx.stroke();
    ctx.fillStyle = '#263854'; ctx.fillRect(x - 44, y - 107, 88, 17);
    ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(`frame ${String(n).padStart(3, '0')}`, x - 37, y - 94);
  };
  draw(0);
  const stream = canvas.captureStream(24);
  const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('Browser cannot record the procedural WebM test fixture.');
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2000000 });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
  recorder.start();
  for (let n = 0; n < 126; n++) { draw(n); await new Promise(r => setTimeout(r, 1000 / 24)); }
  recorder.stop(); await done; stream.getTracks().forEach(t => t.stop());
  const blob = new Blob(chunks, { type: mimeType }), url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'walk-test.webm'; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { bytes: blob.size, filename: 'walk-test.webm' };
})()
