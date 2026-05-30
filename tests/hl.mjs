// Highlighter parity: edit vs exported-print, over white AND over dark text,
// with overlapping separate strokes. Writes both PNGs for visual comparison.
import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'http://localhost/pdfMiniPro/index.html';
const browser = await chromium.launch({ headless: true });

async function makeTestPdf() {
  const p = await browser.newPage();
  await p.setContent('<html><body style="margin:0;background:#fff;font:bold 26px/1.4 Arial;color:#000;padding:40px">' +
    '<div>BLACK TEXT UNDER HIGHLIGHT AAAAA</div>' +
    '<div>SECOND LINE OF DARK TEXT BBBBB</div>' +
    '<div style="height:40px"></div>' +
    '<div style="background:#111;color:#fff;padding:14px">DARK BAR REGION CCCCC</div>' +
    '</body></html>');
  const buf = await p.pdf({ width: '600px', height: '800px', printBackground: true });
  await p.close();
  return buf;
}
const pdfBuffer = await makeTestPdf();

const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[' + m.type() + ']', m.text()); });
page.on('dialog', d => d.dismiss().catch(() => {}));

await page.addInitScript(() => { try { localStorage.setItem('pdfMini.onboardedVersion', '99.0'); } catch (_) {} });
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m => m.remove()));
await page.setInputFiles('#fileInput', { name: 't.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
await page.waitForSelector('.page-wrapper .overlay', { timeout: 15000 });
await page.waitForTimeout(500);

// probe pdf-lib blendMode support
const probe = await page.evaluate(() => ({
  hasBlendMode: !!(window.PDFLib && PDFLib.BlendMode),
  modes: window.PDFLib && PDFLib.BlendMode ? Object.keys(PDFLib.BlendMode) : []
}));
console.log('[probe] PDFLib.BlendMode =', JSON.stringify(probe));

await page.evaluate(() => {
  const overlay = document.querySelector('.overlay[data-page-num="1"]') || document.querySelector('.overlay');
  const mkHL = (pts, color) => {
    const c = document.createElement('div'); c.className = 'annotation draw-annotation'; overlay.appendChild(c);
    const ann = { type: 'draw', pageNum: 1, points: pts, color, strokeWidth: 6, brush: 'highlighter', bbox: { x: 0, y: 0, w: 1, h: 1 }, el: c };
    annotations.push(ann); renderDrawAnnotation(ann);
  };
  // horizontal sweep over the first (black) text line
  mkHL([{ x: 50, y: 60 }, { x: 520, y: 60 }], '#ffd400');
  // over the dark bar
  mkHL([{ x: 50, y: 250 }, { x: 520, y: 250 }], '#ffd400');
  // two OVERLAPPING separate strokes over white area (should darken where they cross on screen)
  mkHL([{ x: 120, y: 360 }, { x: 460, y: 420 }], '#7CFC00');
  mkHL([{ x: 120, y: 420 }, { x: 460, y: 360 }], '#7CFC00');
  if (typeof deselect === 'function') deselect();
});
await page.waitForTimeout(400);

const wrapper = await page.$('.page-wrapper');
await wrapper.screenshot({ path: 'tests/hl_edit.png' });

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
fs.writeFileSync('tests/hl_print.png', Buffer.from(printDataUrl.split(',')[1], 'base64'));
console.log('wrote tests/hl_edit.png and tests/hl_print.png');
await browser.close();
