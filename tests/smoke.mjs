// PDF Mini Editor — Playwright smoke tests
// =========================================
// Self-contained: generates its own test PDF (no external/confidential files),
// drives the live app, and asserts the behaviours that regressed in the past
// (edit-PDF sizing/position/coverage, the bound cover, save, autosave, recents,
// auto-outline, measure). Run against a locally served copy of the app.
//
//   npm i -D playwright && npx playwright install chromium
//   # serve the app (XAMPP, or: npx serve .) then:
//   node tests/smoke.mjs                       # default http://localhost/pdfMiniPro/index.html
//   APP_URL=http://localhost:3000/index.html node tests/smoke.mjs
//
// Exit code 0 = all passed, 1 = at least one failure.

import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost/pdfMiniPro/index.html';

let passed = 0, failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (detail ? '  → ' + JSON.stringify(detail) : '')); }
};

// Build a small multi-page-ish test PDF in-memory (headings + body + a line that
// ends before a bold run, mirroring the real-world edit-PDF case).
async function makeTestPdf(browser) {
  const page = await browser.newPage();
  await page.setContent(`<html><head><title>Smoke Test Document</title></head>
    <body style="margin:64px;font-family:Arial,Helvetica,sans-serif;font-size:12pt;color:#222;line-height:1.5;">
    <h1 style="color:#7a0019;font-size:22pt;">1. Overview</h1><hr>
    <p>The complete creation script is in <b>Appendix A</b> and stored on SharePoint for reference.</p>
    <p>This paragraph exists so the document has ordinary body text to compare heading sizes against, and to give the editor something to work with.</p>
    <h1 style="color:#7a0019;font-size:22pt;">2. Affected Tables</h1><hr>
    <p>The following tables are covered by the fix and are listed here as plain body copy.</p>
    <div style="page-break-before:always"></div>
    <h1 style="color:#7a0019;font-size:22pt;">3. Second Page</h1><hr>
    <p>Page two exists so the cross-page copy/paste test has somewhere to paste.</p>`);
  const buffer = await page.pdf({ format: 'Letter', printBackground: true });
  await page.close();
  return buffer;
}

const browser = await chromium.launch({ headless: true });
const pdfBuffer = await makeTestPdf(browser);
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('dialog', d => d.dismiss().catch(() => {}));   // auto-dismiss draft-restore prompt

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  // start from a clean slate
  await page.evaluate(() => { try { indexedDB.deleteDatabase('pdfMiniProDrafts'); } catch (_) {} });
  await page.evaluate(() => document.querySelectorAll('.modal,.modal-overlay').forEach(m => { if (getComputedStyle(m).position === 'fixed') m.style.display = 'none'; }));

  console.log('\n[load]');
  await page.setInputFiles('#fileInput', { name: 'smoke-test.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
  await page.waitForFunction(() => document.querySelectorAll('.pdf-text-item').length > 5, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => setZoom(1));

  // ---- Edit existing PDF text: size, single line, cover, baseline ----
  console.log('[edit-pdf]');
  const edit = await page.evaluate(async () => {
    await document.fonts.ready;
    const span = Array.from(document.querySelectorAll('.pdf-text-item')).find(s => (s.dataset.text || '').includes('creation script'));
    if (!span) return { err: 'seed span not found' };
    const orig = { y: +span.dataset.y, h: +span.dataset.h, fh: +span.dataset.fontHeight, text: span.dataset.text };
    const ov = span.closest('.overlay'); setTool('edit-pdf');
    editOriginalPdfText(ov, span);
    await new Promise(r => setTimeout(r, 140));
    if (activeEditor) commitEditor(true);
    const ann = annotations.filter(a => a.type === 'text').slice(-1)[0];
    const wo = ann.sourceWhiteout;
    return {
      orig,
      committedText: ann.lines.map(l => l.map(s => s.text).join('')).join('\n'),
      fontSize: ann.fontSize,
      oneLine: ann.el.offsetHeight <= ann.fontSize * 1.4,
      coverTop: wo.y, coverBottom: wo.y + wo.height,
      coverPE: getComputedStyle(wo.el).pointerEvents,
      bound: wo.ownerText === ann
    };
  });
  ok('edit seed found', !edit.err, edit);
  if (!edit.err) {
    ok('text preserved (no lost spaces)', edit.committedText === edit.orig.text, edit.committedText);
    ok('font size not inflated', Math.abs(edit.fontSize - edit.orig.fh) < 0.5, { got: edit.fontSize, orig: edit.orig.fh });
    ok('stays on one line', edit.oneLine, edit);
    ok('cover hides original top+bottom', edit.coverTop <= edit.orig.y && edit.coverBottom >= edit.orig.y + edit.orig.h, edit);
    ok('cover bound + non-selectable', edit.bound && edit.coverPE === 'none', edit);
  }

  // ---- Bound cover travels on nudge, removed on delete ----
  console.log('[bound cover]');
  const bound = await page.evaluate(async () => {
    const ann = annotations.filter(a => a.type === 'text').slice(-1)[0];
    select(ann);
    const x0 = ann.x, wx0 = ann.sourceWhiteout.x;
    const key = (k, sh) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!sh, bubbles: true }));
    key('ArrowRight'); key('ArrowRight', true);  // +1 +10 = +11
    const moved = { dx: +(ann.x - x0).toFixed(1), coverDx: +(ann.sourceWhiteout.x - wx0).toFixed(1) };
    const n0 = annotations.length;
    removeAnnotation(ann);
    return { moved, deletedBoth: (n0 - annotations.length) === 2 };
  });
  ok('nudge moves text by 11px', bound.moved.dx === 11, bound.moved);
  ok('cover follows nudge', bound.moved.coverDx === 11, bound.moved);
  ok('delete removes text + cover', bound.deletedBoth, bound);

  // ---- Save pipeline produces a valid PDF ----
  console.log('[save]');
  const save = await page.evaluate(async () => {
    // re-create an edit so there's something to flatten
    const span = Array.from(document.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)')).find(s => (s.dataset.text || '').includes('Overview'));
    if (span) { setTool('edit-pdf'); editOriginalPdfText(span.closest('.overlay'), span); await new Promise(r => setTimeout(r, 140)); if (activeEditor) commitEditor(true); }
    const bytes = await generatePdfBytes();
    return { len: bytes.length, header: new TextDecoder().decode(bytes.slice(0, 5)) };
  });
  ok('save returns a valid PDF', save.header === '%PDF-' && save.len > 1000, save);

  // ---- Serialization round-trips (covers the ownerText skip) ----
  console.log('[serialize]');
  const ser = await page.evaluate(() => {
    try { const snap = snapshotAnnotations(); JSON.stringify(snap); return { okSnap: true, n: snap.length }; }
    catch (e) { return { okSnap: false, err: String(e && e.message || e) }; }
  });
  ok('snapshotAnnotations serializes cleanly', ser.okSnap, ser);

  // ---- Autosave draft written ----
  console.log('[autosave]');
  await page.waitForTimeout(1800);
  const draft = await page.evaluate(async () => { const d = await idbGet('current'); return { exists: !!d, anns: !!(d && d.annotations && d.annotations.length), bytes: !!(d && d.bytes) }; });
  ok('autosave wrote a draft', draft.exists && draft.bytes, draft);

  // ---- Recent files recorded ----
  console.log('[recent files]');
  const recent = await page.evaluate(async () => { const l = (await idbGet('recentFiles')) || []; return { count: l.length, name: l[0] && l[0].name, thumb: !!(l[0] && l[0].thumb) }; });
  ok('recent file recorded with thumbnail', recent.count >= 1 && recent.thumb, recent);

  // ---- Auto-outline from headings ----
  console.log('[auto-outline]');
  const outline = await page.evaluate(() => {
    const before = sessionBookmarks.length;
    autoDetectHeadings();
    return { added: sessionBookmarks.length - before, titles: sessionBookmarks.map(b => b.title) };
  });
  ok('auto-outline detects headings', outline.added >= 2, outline);
  ok('auto-outline finds the section titles', outline.titles.some(t => /Overview/.test(t)) && outline.titles.some(t => /Affected Tables/.test(t)), outline.titles);

  // ---- Measure tool (in mm) ----
  console.log('[measure]');
  await page.evaluate(() => { setZoom(1); const u = document.getElementById('unitSelect'); u.value = 'mm'; u.dispatchEvent(new Event('change', { bubbles: true })); setMeasureMode(true); });
  const orect = await page.evaluate(() => { const r = document.querySelector('.overlay').getBoundingClientRect(); return { left: r.left, top: r.top }; });
  const mx = orect.left + 120, my = orect.top + 160;
  await page.mouse.move(mx, my); await page.mouse.down(); await page.mouse.move(mx + 96, my, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(120);
  const meas = await page.evaluate(() => { const l = document.querySelector('.measure-layer div:nth-child(2)'); return l ? l.textContent : null; });
  ok('measure: 96px ≈ 25.4 mm (1 inch)', meas === '25.4 mm', { got: meas });
  await page.evaluate(() => setMeasureMode(false));  // measure mode would swallow later clicks/drags

  // ---- Cut (Ctrl+X) + paste at last-click position, cross-page ----
  console.log('[clipboard]');
  const cut = await page.evaluate(async () => {
    const span = Array.from(document.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)')).find(s => (s.dataset.text || '').includes('script'))
              || document.querySelector('.pdf-text-item:not(.pdf-text-item-consumed)');
    setTool('edit-pdf'); editOriginalPdfText(span.closest('.overlay'), span);
    await new Promise(r => setTimeout(r, 140)); if (activeEditor) commitEditor(true);
    const ann = annotations.filter(a => a.type === 'text').slice(-1)[0]; select(ann);
    const before = annotations.filter(a => a.type === 'text').length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
    return { clip: pdfMiniClipboard.length, removed: before - annotations.filter(a => a.type === 'text').length };
  });
  ok('cut fills clipboard + removes object', cut.clip >= 1 && cut.removed >= 1, cut);
  const pasteRes = await page.evaluate(() => { setTool('select'); const w = document.querySelector('.page-wrapper[data-page-num="2"]'); if (w) w.scrollIntoView({ block: 'center' }); return !!w; });
  if (pasteRes) {
    const r2 = await page.evaluate(() => { const o = document.querySelector('.page-wrapper[data-page-num="2"] .overlay').getBoundingClientRect(); return { x: o.left + o.width * 0.5, y: o.top + o.height * 0.82 }; });
    await page.mouse.click(r2.x, r2.y);
    await page.waitForTimeout(100);
    const paste = await page.evaluate(() => {
      const lp = lastClickPos ? { page: lastClickPos.pageNum, x: +lastClickPos.x.toFixed(1) } : null;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      const t = annotations.filter(a => a.type === 'text'); const last = t[t.length - 1];
      return { lp, page: last && last.pageNum, x: last && +last.x.toFixed(1) };
    });
    ok('paste lands on the clicked page', paste.page === 2, paste);
    ok('paste lands at the click point', paste.lp && Math.abs(paste.x - paste.lp.x) < 5, paste);
  }

  // ---- Free-draw brush style (highlighter) ----
  console.log('[brush]');
  await page.evaluate(() => { setZoom(1); window.scrollTo(0, 0); const m = document.querySelector('main'); if (m) m.scrollTo(0, 0); const s = document.getElementById('defaultBrush'); s.value = 'highlighter'; s.dispatchEvent(new Event('change', { bubbles: true })); setTool('draw'); });
  const brect = await page.evaluate(() => { const r = document.querySelector('.overlay').getBoundingClientRect(); return { left: r.left, top: r.top }; });
  await page.mouse.move(brect.left + 140, brect.top + 220); await page.mouse.down();
  await page.mouse.move(brect.left + 260, brect.top + 226, { steps: 6 }); await page.mouse.move(brect.left + 360, brect.top + 250, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(120);
  const brush = await page.evaluate(() => { const d = annotations.filter(a => a.type === 'draw').slice(-1)[0]; if (!d) return { err: 'no stroke' }; const line = d.el.querySelector('polyline:not(.hit)'); return { brush: d.brush, opacity: line.getAttribute('stroke-opacity'), cap: line.getAttribute('stroke-linecap'), blend: d.el.style.mixBlendMode }; });
  ok('highlighter brush renders translucent + multiply', brush.brush === 'highlighter' && brush.opacity === '0.4' && brush.blend === 'multiply', brush);

  // ---- PDF metadata view ----
  console.log('[metadata]');
  await page.evaluate(() => openStatsModal());
  await page.waitForTimeout(1200);
  const meta = await page.evaluate(() => {
    const g = id => { const el = document.getElementById(id); if (!el) return ''; return ('value' in el ? el.value : el.textContent) || ''; };
    return { title: g('metaTitle'), producer: g('metaProducer'), created: g('metaCreated') };
  });
  ok('metadata shows title + producer', meta.title && meta.title !== '—' && meta.producer && meta.producer !== '—', meta);

  // ---- View tools: ruler + grid + unit ----
  console.log('[view]');
  const view = await page.evaluate(() => {
    setZoom(1);
    document.getElementById('gridToggle').click();
    document.getElementById('rulerToggle').click();
    const ov = document.querySelector('.overlay');
    return {
      grid: !!ov.querySelector('.grid-layer'),
      gridSize: (ov.querySelector('.grid-layer') || {}).style && ov.querySelector('.grid-layer').style.backgroundSize,
      ruler: !!(ov.querySelector('.ruler-layer') && ov.querySelector('.ruler-layer').querySelector('svg')),
      rulerActive: document.getElementById('rulerToggle').classList.contains('active')
    };
  });
  ok('grid overlay appears', view.grid && /px/.test(view.gridSize || ''), view);
  ok('ruler overlay appears', view.ruler && view.rulerActive, view);

  // ---- Sticky free-draw + quick "resume" tool ----
  console.log('[sticky draw]');
  await page.evaluate(() => { setZoom(1); window.scrollTo(0, 0); const m = document.querySelector('main'); if (m) m.scrollTo(0, 0); const s = document.getElementById('defaultBrush'); s.value = 'marker'; s.dispatchEvent(new Event('change', { bubbles: true })); setTool('draw'); });
  const drect = await page.evaluate(() => { const r = document.querySelector('.overlay').getBoundingClientRect(); return { left: r.left, top: r.top }; });
  for (const y of [430, 470]) {
    await page.mouse.move(drect.left + 120, drect.top + y); await page.mouse.down();
    await page.mouse.move(drect.left + 250, drect.top + y + 5, { steps: 5 }); await page.mouse.move(drect.left + 350, drect.top + y + 12, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(70);
  }
  const sticky = await page.evaluate(() => ({ count: annotations.filter(a => a.type === 'draw').length, tool: currentTool, last: getLastDrawTool() }));
  ok('draw tool stays active for multiple strokes', sticky.count >= 2 && sticky.tool === 'draw', sticky);
  ok('last-used draw tool remembered', sticky.last && sticky.last.brush === 'marker', sticky.last);
  const q = await page.evaluate(() => { renderQuickPanel(); const f = document.querySelector('#quickPanelItems .qp-item'); return { shown: !document.getElementById('quickPanel').hidden, title: f && f.title }; });
  ok('quick panel pins the last draw tool', q.shown && /marker/i.test(q.title || ''), q);

  // ---- Form designer ----
  console.log('[form designer]');
  await page.evaluate(() => { setZoom(1); window.scrollTo(0, 0); const m = document.querySelector('main'); if (m) m.scrollTo(0, 0); setTool('field'); });
  const fr = await page.evaluate(() => { const r = document.querySelector('.overlay').getBoundingClientRect(); return { left: r.left, top: r.top }; });
  await page.mouse.move(fr.left + 150, fr.top + 280); await page.mouse.down(); await page.mouse.move(fr.left + 320, fr.top + 305, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(80);
  await page.evaluate(() => document.querySelector('.field-bar [data-fieldsub="check"]').click());
  await page.mouse.move(fr.left + 150, fr.top + 340); await page.mouse.down(); await page.mouse.move(fr.left + 175, fr.top + 365, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(80);
  const formChk = await page.evaluate(async () => {
    const fields = annotations.filter(a => a.type === 'field');
    const bytes = await generatePdfBytes();
    const re = await PDFDocument.load(bytes);
    const form = re.getForm();
    return { fieldAnns: fields.length, subs: fields.map(f => f.subtype), savedFieldCount: form.getFields().length };
  });
  ok('field designer creates two field annotations', formChk.fieldAnns >= 2 && formChk.subs.includes('text') && formChk.subs.includes('check'), formChk);
  ok('saved PDF carries the new AcroForm fields', formChk.savedFieldCount >= 2, formChk);

  // ---- No console errors throughout ----
  console.log('[console]');
  ok('no console errors', consoleErrors.length === 0, consoleErrors);

} catch (e) {
  failed++;
  console.log('  ✗ FATAL: ' + (e && e.stack || e));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
