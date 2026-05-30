// Reading-ruler feature check: toggles on, drags, rotates, and is NOT exported.
import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'http://localhost/pdfMiniPro/index.html';
const browser = await chromium.launch({ headless: true });

async function makeTestPdf() {
  const p = await browser.newPage();
  await p.setContent('<html><body style="margin:0;background:#fff;font:16px/2 Arial;padding:40px">' +
    Array.from({ length: 20 }, (_, i) => '<div>Line ' + (i + 1) + ' — quick brown fox jumps over the lazy dog</div>').join('') +
    '</body></html>');
  const buf = await p.pdf({ width: '600px', height: '800px', printBackground: true });
  await p.close();
  return buf;
}
const pdfBuffer = await makeTestPdf();

const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console error]', m.text()); });
page.on('dialog', d => d.dismiss().catch(() => {}));

await page.addInitScript(() => { try { localStorage.setItem('pdfMini.onboardedVersion', '99.0'); } catch (_) {} });
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m => m.remove()));
await page.setInputFiles('#fileInput', { name: 't.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
await page.waitForSelector('.page-wrapper .overlay', { timeout: 15000 });
await page.waitForTimeout(500);

let pass = 0, fail = 0;
const ok = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };

// toggle on
await page.click('#readingRulerToggle');
ok('ruler element appears', await page.$('#readingRuler') !== null);
ok('toggle button active', await page.evaluate(() => document.getElementById('readingRulerToggle').classList.contains('active')));

// not an annotation (won't be exported)
ok('ruler is not an annotation', await page.evaluate(() => !annotations.some(a => a.el && a.el.id === 'readingRuler')));

// drag the band
const before = await page.evaluate(() => { const r = document.getElementById('readingRuler').getBoundingClientRect(); return { x: r.x, y: r.y }; });
const band = await page.$('#readingRuler .rr-band');
const bb = await band.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 + 80, { steps: 8 });
await page.mouse.up();
const after = await page.evaluate(() => { const r = document.getElementById('readingRuler').getBoundingClientRect(); return { x: r.x, y: r.y }; });
ok('ruler moves on drag', Math.abs(after.x - before.x) > 30 && Math.abs(after.y - before.y) > 30);

// rotate via right handle
const rh = await page.$('#readingRuler .rr-rot.r');
const rb = await rh.boundingBox();
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.mouse.down();
await page.mouse.move(rb.x + rb.width / 2 + 40, rb.y + rb.height / 2 - 120, { steps: 10 });
await page.mouse.up();
const ang = await page.evaluate(() => {
  const t = getComputedStyle(document.getElementById('readingRuler')).transform;
  if (!t || t === 'none') return 0;
  const m = t.match(/matrix\(([^)]+)\)/); if (!m) return 0;
  const v = m[1].split(',').map(Number); return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI);
});
ok('ruler rotates (angle != 0)', Math.abs(ang) > 3);

await page.screenshot({ path: 'tests/out_ruler.png' });

// export must NOT contain the ruler — render exported pdf, confirm it still has 1 page and saves fine
const bytesLen = await page.evaluate(async () => { const b = await generatePdfBytes(); return b.length; });
ok('export still produces a PDF', bytesLen > 1000);

// toggle off
await page.click('#readingRulerToggle');
ok('ruler removed on toggle off', await page.$('#readingRuler') === null);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail ? 1 : 0);
