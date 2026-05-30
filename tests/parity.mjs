// Parity check: edit-mode rendering vs exported-PDF rendering.
// Injects a self-crossing translucent brush stroke (where alpha-stacking shows)
// plus a rounded text stamp, screenshots the editor, then renders the EXPORTED
// pdf via pdf.js and writes both PNGs for visual comparison.
import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'http://localhost/pdfMiniPro/index.html';

const browser = await chromium.launch({ headless: true });

async function makeTestPdf() {
  const p = await browser.newPage();
  await p.setContent('<html><body style="margin:0;background:#fff;"></body></html>');
  const buf = await p.pdf({ width: '600px', height: '800px', printBackground: true });
  await p.close();
  return buf;
}
const pdfBuffer = await makeTestPdf();

const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('console', m => { const t = m.type(); if (t === 'error' || t === 'warning') console.log('[page ' + t + ']', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('dialog', d => d.dismiss().catch(() => {}));

await page.addInitScript(() => { try { localStorage.setItem('pdfMini.onboardedVersion', '99.0'); } catch (_) {} });
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m => m.remove()));
await page.evaluate(() => { try { indexedDB.deleteDatabase('pdfMiniProDrafts'); } catch (_) {} });
await page.setInputFiles('#fileInput', { name: 't.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
await page.waitForSelector('.page-wrapper .overlay', { timeout: 15000 });
await page.waitForTimeout(600);

await page.evaluate(() => {
  const overlay = document.querySelector('.overlay[data-page-num="1"]') || document.querySelector('.overlay');

  // self-crossing translucent stroke (asterisk through a centre) — every crossing
  // is where per-segment export used to stack alpha into a dark blob.
  const mkStar = (cx, cy, R, color, w, brush) => {
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6;
      pts.push({ x: cx, y: cy });
      pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    const container = document.createElement('div');
    container.className = 'annotation draw-annotation';
    overlay.appendChild(container);
    const ann = { type: 'draw', pageNum: 1, points: pts, color, strokeWidth: w, brush, bbox: { x: 0, y: 0, w: 1, h: 1 }, el: container };
    annotations.push(ann);
    renderDrawAnnotation(ann);
  };
  mkStar(220, 230, 150, '#2563eb', 12, 'pencil');   // translucent (0.8) blue
  mkStar(430, 250, 90, '#6b7280', 16, 'marker');    // 0.95 gray, thick

  // rounded text stamp with a solid border + double spaces (whitespace collapse)
  createStampAnnotation({ pageNum: 1, x: 110, y: 520, overlay },
    { text: 'PAID  •  2024', borderStyle: 'solid', borderColor: '#cc0000', bgColor: '#ffe9e9', borderRadius: 16, borderWidth: 3, textColor: '#cc0000' });
  // explicit multi-line stamp (dashed default) — must stay 2 lines in BOTH
  createStampAnnotation({ pageNum: 1, x: 360, y: 520, overlay },
    { text: 'APPROVED\nby K.N.', borderStyle: 'dashed', borderColor: '#1565c0', borderRadius: 10, borderWidth: 2, textColor: '#1565c0' });

  if (typeof deselect === 'function') deselect();
});
await page.waitForTimeout(400);

const wrapper = await page.$('.page-wrapper');
await wrapper.screenshot({ path: 'tests/out_edit.png' });

const printDataUrl = await page.evaluate(async () => {
  const bytes = await generatePdfBytes();
  const w = document.querySelector('.page-wrapper');
  const rect = w.getBoundingClientRect();
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pg = await doc.getPage(1);
  const vp1 = pg.getViewport({ scale: 1 });
  const scale = (rect.width * 2) / vp1.width;
  const vp = pg.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas.toDataURL('image/png');
});
fs.writeFileSync('tests/out_print.png', Buffer.from(printDataUrl.split(',')[1], 'base64'));

console.log('wrote tests/out_edit.png and tests/out_print.png');
await browser.close();
