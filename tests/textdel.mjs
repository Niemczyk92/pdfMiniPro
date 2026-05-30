// Content-aware real stream text deletion:
//  A) simple-font SUBSTRING surgery — delete one word from a multi-word Tj, the
//     rest of the line stays and closes up; clicked word truly gone from stream.
//  B) safety on a real (CID) PDF — deleting a sub-word of a one-operator line must
//     NOT over-delete or remove the wrong text (falls back to whiteout cleanly).
import { chromium } from 'playwright';
import fs from 'fs';

const APP_URL = process.env.APP_URL || 'http://localhost/pdfMiniPro/index.html';
const browser = await chromium.launch({ headless: true });
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (d ? '  → ' + JSON.stringify(d) : ''))); };

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console error]', m.text()); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.addInitScript(() => { try { localStorage.setItem('pdfMini.onboardedVersion', '99.0'); } catch (_) {} });
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.modal-overlay,.onboard-overlay,#onboardModal').forEach(m => m.remove()));
  return page;
}

// ---------- A) simple-font substring surgery ----------
{
  const page = await newPage();
  // build a fixture with pdf-lib (loaded in-page as PDFLib): one Tj "ONE TWO THREE"
  await page.evaluate(async () => {
    const { PDFDocument, StandardFonts } = PDFLib;
    const d = await PDFDocument.create();
    const pg = d.addPage([400, 200]);
    const f = await d.embedFont(StandardFonts.Helvetica);
    pg.drawText('ONE TWO THREE', { x: 40, y: 150, size: 24, font: f });
    const bytes = await d.save();
    await loadPDF(new File([bytes], 'fix.pdf', { type: 'application/pdf' }));
  });
  await page.waitForSelector('.page-wrapper .overlay', { timeout: 15000 });
  await page.waitForTimeout(500);

  const res = await page.evaluate(async () => {
    try { setTool('edit-pdf'); } catch (_) {}
    // find the span covering the line, reuse its geometry but target sub-word "TWO"
    const span = [...document.querySelectorAll('.pdf-text-item')].find(e => /TWO/.test(e.dataset.text || ''));
    if (!span) return { err: 'no span' };
    const ds = span.dataset;
    annotations.push({
      type: 'text-delete', pageNum: parseInt(ds.pageNum), x: parseFloat(ds.x), y: parseFloat(ds.y),
      width: parseFloat(ds.w), height: parseFloat(ds.h), fontHeight: parseFloat(ds.fontHeight) || parseFloat(ds.h),
      sourceText: 'TWO', _spanId: 'test'
    });
    const bytes = await generatePdfBytes();
    const consumed = annotations.filter(a => a.type === 'text-delete').map(a => !!a._consumedByStreamDelete);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const tc = await (await doc.getPage(1)).getTextContent();
    const full = tc.items.map(i => i.str).join('');
    return { full, consumed, spanText: ds.text };
  });
  ok('A: clicked span found', !res.err, res);
  ok('A: surgery handled by stream edit', (res.consumed || []).every(Boolean), res);
  ok('A: "TWO" removed from stream', res.full && !/TWO/.test(res.full), res);
  ok('A: "ONE" and "THREE" kept', res.full && /ONE/.test(res.full) && /THREE/.test(res.full), res);
  await page.context().close();
}

// ---------- B) safety on real CID pdf (001.pdf) ----------
const PDF = 'C:/xampp/htdocs/pdfMiniPro/001.pdf';
if (fs.existsSync(PDF)) {
  const page = await newPage();
  await page.setInputFiles('#fileInput', { name: '001.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(PDF) });
  await page.waitForSelector('.page-wrapper .overlay', { timeout: 20000 });
  await page.waitForTimeout(800);

  const res = await page.evaluate(async () => {
    try { setTool('edit-pdf'); } catch (_) {}
    const before = {};
    const collect = async (bytes) => {
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      let s = '';
      for (let p = 1; p <= doc.numPages; p++) s += ' ' + (await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' ');
      return s;
    };
    // baseline text (no edits)
    const beforeBytes = await generatePdfBytes();
    const beforeText = await collect(beforeBytes);
    // delete "Faktura" by real shift-click
    const el = [...document.querySelectorAll('.pdf-text-item')].find(e => (e.dataset.text || '') === 'Faktura');
    if (!el) return { err: 'no Faktura span' };
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    const afterBytes = await generatePdfBytes();
    const afterText = await collect(afterBytes);
    const consumed = annotations.filter(a => a.type === 'text-delete').map(a => !!a._consumedByStreamDelete);
    // sample of OTHER words that must survive (no over-deletion)
    const others = ['Daňový', 'doklad', 'Prodávající', '4017643451'];
    const survived = others.filter(w => afterText.includes(w));
    return { consumed, others, survived, hadDelAnn: annotations.some(a => a.type === 'text-delete') };
  });
  ok('B: Faktura delete created an annotation', res.hadDelAnn, res);
  ok('B: no over-deletion — all other sampled words intact', res.survived && res.survived.length === res.others.length, res);
  // CID line → not stream-consumed (whiteout cover); that is the SAFE, supported outcome
  ok('B: CID line falls back safely (whiteout, not wrong-op removal)', (res.consumed || []).every(c => c === false), res);
  await page.context().close();
} else {
  console.log('  (skip B: 001.pdf not present)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail ? 1 : 0);
