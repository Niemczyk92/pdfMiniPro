// =====================  OCR via Tesseract.js  ========================
// =====================================================================
const TESSERACT_CDN = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
let _ocrCancel = false;
let _ocrWorker = null;

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Tesseract from CDN. Need internet on first run.'));
    document.head.appendChild(s);
  });
  if (!window.Tesseract) throw new Error('Tesseract did not initialise.');
  return window.Tesseract;
}

function setOcrStatus(text) {
  const el = document.getElementById('ocrStatus');
  if (el) el.textContent = text;
}
function setOcrProgress(pct) {
  const bar = document.getElementById('ocrProgressBar');
  if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function openOcrModal() {
  _ocrCancel = false;
  document.getElementById('ocrModal').classList.add('show');
  setOcrStatus('Loading Tesseract OCR engine…');
  setOcrProgress(2);
}
function closeOcrModal() {
  document.getElementById('ocrModal').classList.remove('show');
}

async function runOcrOnDocument() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const lang = document.getElementById('ocrLang').value || 'eng';
  openOcrModal();
  try {
    setOcrStatus(window.t('ocr.loadingEngine', 'Loading Tesseract OCR engine…'));
    await loadTesseract();
    if (_ocrCancel) throw new Error('Cancelled');
    setOcrStatus(
      window.t('ocr.loadingLang', 'Loading "{lang}" language data (first run only)…').replace('{lang}', lang)
    );
    // Tesseract v5: createWorker handles language loading internally
    _ocrWorker = await window.Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (m && m.status) {
          setOcrStatus(
            window
              .t('ocr.progress', '{status} — {pct}%')
              .replace('{status}', m.status)
              .replace('{pct}', Math.round((m.progress || 0) * 100))
          );
        }
      },
    });
    if (_ocrCancel) throw new Error('Cancelled');

    let totalAdded = 0;
    const pageCount = pdfJsDoc.numPages;
    for (let i = 1; i <= pageCount; i++) {
      if (_ocrCancel) throw new Error('Cancelled');
      const basePct = ((i - 1) / pageCount) * 100;
      setOcrStatus(
        window.t('ocr.pageOf', 'OCR page {i} of {total}…').replace('{i}', i).replace('{total}', pageCount)
      );
      setOcrProgress(basePct + 2);
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${i}"]`);
      if (!wrapper) continue;
      const canvas = wrapper.querySelector('canvas');
      if (!canvas) continue;
      const overlay = wrapper.querySelector('.overlay');
      if (!overlay) continue;
      // Run OCR on the page canvas. Tesseract.js v5 dropped top-level
      // result.data.lines / result.data.words — they now live nested inside
      // result.data.blocks[].paragraphs[].lines[].words[]. We pass the
      // output options explicitly so blocks are populated, then flatten.
      const result = await _ocrWorker.recognize(canvas, {}, { blocks: true });
      if (_ocrCancel) throw new Error('Cancelled');
      // Expose the raw OCR result for debugging — `window._lastOcrResult.data`
      // in DevTools tells you whether Tesseract returned `blocks`, `lines`,
      // `words`, or only `text` for this build, which is what the line-
      // extraction below is going to pick up.
      if (i === 1) window._lastOcrResult = result;
      // Compute scale: canvas is at RENDER_SCALE * pixelMul; overlay coords use RENDER_SCALE
      const baseW = parseFloat(wrapper.dataset.baseW);
      const canvasToDesign = baseW / canvas.width; // scale factor: canvas pixel → design pixel
      // Prefer LINE data: it gives us a consistent line height + baseline per line, which makes
      // the font-size estimate and replacement positioning far more accurate than per-word boxes.
      let lines = [];
      if (result.data.lines && result.data.lines.length) {
        // Tesseract v4 / older v5 — top-level lines
        lines = result.data.lines;
      } else if (result.data.blocks && result.data.blocks.length) {
        // Tesseract v5 — flatten blocks → paragraphs → lines
        for (const blk of result.data.blocks) {
          for (const para of blk.paragraphs || []) {
            for (const ln of para.lines || []) lines.push(ln);
          }
        }
      }
      if (!lines.length && result.data.words && result.data.words.length) {
        // Last-resort fallback: words only, no line grouping. Group by Y.
        const ws = result.data.words
          .slice()
          .sort((a, b) => ((a.bbox && a.bbox.y0) || 0) - ((b.bbox && b.bbox.y0) || 0));
        const grouped = [];
        let cur = null;
        for (const w of ws) {
          const y = (w.bbox && w.bbox.y0) || 0;
          const h = ((w.bbox && w.bbox.y1) || 0) - y;
          if (!cur || Math.abs(y - cur._y0) > h * 0.5) {
            cur = {
              bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
              baseline: null,
              words: [w],
              _y0: y,
            };
            grouped.push(cur);
          } else {
            cur.words.push(w);
            cur.bbox.x0 = Math.min(cur.bbox.x0, w.bbox.x0);
            cur.bbox.x1 = Math.max(cur.bbox.x1, w.bbox.x1);
            cur.bbox.y1 = Math.max(cur.bbox.y1, w.bbox.y1);
          }
        }
        lines = grouped;
      }
      const added = injectOcrLines(overlay, lines, canvasToDesign, i);
      totalAdded += added;
      // Drop image markers that were placed by buildPdfImageLayer before OCR
      // ran — otherwise a page-sized purple frame still covers the OCR text
      // and the user can only grab the page as an image (issue #014).
      try {
        const entry = window._ocrCache && window._ocrCache[i];
        if (entry) _stripImageMarkersForOcr(overlay, entry);
      } catch (e) {
        console.warn('[ocr strip-img]', e);
      }
      setOcrProgress((i / pageCount) * 100);
    }
    await _ocrWorker.terminate();
    _ocrWorker = null;
    pdfTotalTextItems += totalAdded;
    closeOcrModal();
    // Hide the OCR banner once we have text
    const banner = document.getElementById('ocrBanner');
    if (banner) banner.style.display = 'none';
    if (totalAdded > 0) {
      showToast(
        window
          .t('toast.ocrFinished', 'OCR finished — found {n} words. Double-click any text to edit.')
          .replace('{n}', totalAdded),
        'success'
      );
    } else {
      showToast(window.t('toast.ocrEmpty', 'OCR finished but no readable text was found.'), 'warn');
    }
  } catch (e) {
    if (_ocrWorker) {
      try {
        await _ocrWorker.terminate();
      } catch (_) {}
      _ocrWorker = null;
    }
    closeOcrModal();
    if (e && /cancel/i.test(String(e.message))) {
      showToast(window.t('toast.ocrCancelled', 'OCR cancelled.'), 'warn');
    } else {
      console.error('[OCR]', e);
      showToast(window.t('toast.ocrFailed', 'OCR failed:') + ' ' + (e.message || e), 'error');
    }
  }
}

// Pull a baseline Y (in canvas px) out of Tesseract's line.baseline (handles both array + segment forms)
function tesseractLineBaselineY(line) {
  const b = line && line.baseline;
  if (!b) return null;
  // Some versions: [slope, intercept]
  if (Array.isArray(b) && b.length >= 2) return b[1];
  // Some versions: {x0, y0, x1, y1}
  if (typeof b === 'object' && (b.y0 !== undefined || b.y1 !== undefined)) {
    const y0 = b.y0 || b.y1 || 0;
    const y1 = b.y1 || b.y0 || 0;
    return (y0 + y1) / 2;
  }
  return null;
}

// Cache of OCR-injected words per page. buildPdfTextLayer wipes
// .pdf-text-layer on every re-render (zoom, organize, save) — without this
// cache the OCR spans would vanish and Edit-PDF / Export-to-TXT would lose
// the OCR text. _reapplyOcrCache(pageNum) rehydrates the spans after each
// rebuild and is invoked from a wrapper around buildPdfTextLayer below.
window._ocrCache = window._ocrCache || {};
function injectOcrLines(overlay, lines, scale, pageNum) {
  const layer =
    overlay.querySelector('.pdf-text-layer') ||
    (function () {
      const l = document.createElement('div');
      l.className = 'pdf-text-layer';
      l.style.width = overlay.style.width;
      l.style.height = overlay.style.height;
      overlay.appendChild(l);
      return l;
    })();
  let added = 0;
  // Persist the raw words for this page so we can re-inject after a re-render.
  const cacheEntry = { words: [] };
  // Telemetry: counts every reason a line/word is dropped so the user can
  // tell (via DevTools) why OCR returned text but no clickable spans appeared.
  const dropStats = { lines: 0, noWords: 0, noBbox: 0, lineSmall: 0, wordSmall: 0, wordLowConf: 0 };
  // Pass 1: gather line metrics so we can pick a consistent font-size per line and use the
  // line baseline for every word in that line.
  for (const line of lines) {
    dropStats.lines++;
    let words = line && line.words ? line.words : [];
    if (!words.length) {
      dropStats.noWords++;
      continue;
    }
    // Line bbox in canvas px → design px. If Tesseract didn't give us a
    // line.bbox, synthesize one from the union of the word bboxes — this
    // happens in v5 when the result is flattened from blocks.
    let lbX0, lbY0, lbX1, lbY1;
    if (line.bbox && line.bbox.x0 != null) {
      lbX0 = line.bbox.x0 || 0;
      lbY0 = line.bbox.y0 || 0;
      lbX1 = line.bbox.x1 || 0;
      lbY1 = line.bbox.y1 || 0;
    } else {
      lbX0 = Infinity;
      lbY0 = Infinity;
      lbX1 = -Infinity;
      lbY1 = -Infinity;
      for (const w of words) {
        const b = w.bbox || {};
        if (b.x0 != null) lbX0 = Math.min(lbX0, b.x0);
        if (b.y0 != null) lbY0 = Math.min(lbY0, b.y0);
        if (b.x1 != null) lbX1 = Math.max(lbX1, b.x1);
        if (b.y1 != null) lbY1 = Math.max(lbY1, b.y1);
      }
      if (!isFinite(lbX0)) {
        dropStats.noBbox++;
        continue;
      }
    }
    const lineH_canvas = Math.max(0, lbY1 - lbY0);
    if (lineH_canvas <= 0) {
      dropStats.lineSmall++;
      continue;
    }
    // Estimate font size: line bbox includes ascenders + descenders → ≈ 1.15 × fontSize.
    // Clamp the upper end so an oversized OCR detection (zoomed-in scan with a single
    // large heading) doesn't poison downstream Edit-PDF / Find-Replace with a 300-pt body
    // text height — those flows then drop new annotations at the same massive size.
    let fontSize_design = (lineH_canvas / 1.15) * scale;
    // Lowered from 6 → 3 so OCR on small-print scans (form fields, footers)
    // still produces clickable spans.
    if (!isFinite(fontSize_design) || fontSize_design < 3) {
      dropStats.lineSmall++;
      continue;
    }
    if (fontSize_design > 96) fontSize_design = 96;
    // Baseline of the line — prefer Tesseract's, fall back to "~85% down the line bbox"
    const blCanvas = tesseractLineBaselineY(line);
    const baselineY_design = (blCanvas !== null ? blCanvas : lbY0 + lineH_canvas * 0.85) * scale;
    // Visible glyph top in design px (cap top)
    const ascentRatio = 0.78;
    const glyphTop_design = baselineY_design - ascentRatio * fontSize_design;
    const glyphBottom_design = baselineY_design + (1 - ascentRatio) * fontSize_design;
    const heightPx_design = Math.max(8, glyphBottom_design - glyphTop_design);
    // Pass 2 (inline): emit one span per word with the LINE's font size + baseline
    for (const w of words) {
      if (!w.text || !w.text.trim()) continue;
      // Lowered confidence floor 35 → 10. Tesseract over-prunes confidence
      // on small-font scans; let near-everything through and rely on the
      // visual hover state to show users what's clickable.
      if (w.confidence !== undefined && w.confidence < 10) {
        dropStats.wordLowConf++;
        continue;
      }
      const wb = w.bbox || {};
      const x = (wb.x0 || 0) * scale;
      const widthPx = ((wb.x1 || 0) - (wb.x0 || 0)) * scale;
      // Lowered min width 4 → 1.5 so single-character words ("a", "I", "1")
      // still get spans.
      if (widthPx < 1.5) {
        dropStats.wordSmall++;
        continue;
      }
      const span = document.createElement('div');
      span.className = 'pdf-text-item';
      span.style.left = x + 'px';
      span.style.top = glyphTop_design + 'px';
      span.style.width = widthPx + 'px';
      span.style.height = heightPx_design + 'px';
      span.title = w.text;
      span.dataset.text = w.text;
      span.dataset.fontHeight = String(fontSize_design);
      // Map to Helvetica in classifyPdfFontName (Tesseract doesn't preserve the original font)
      span.dataset.fontName = 'OCR-Helvetica';
      // Persist the exact baseline so editOriginalPdfText can place replacement glyphs on top
      span.dataset.baselineY = String(baselineY_design);
      span.dataset.x = String(x);
      span.dataset.y = String(glyphTop_design);
      span.dataset.w = String(widthPx);
      span.dataset.h = String(heightPx_design);
      span.dataset.pageNum = String(pageNum);
      span.dataset.ocr = '1'; // marks this as an OCR span (vs pdf.js text)
      span.addEventListener('click', (e) => {
        if (currentTool !== 'edit-pdf') return;
        e.stopPropagation();
        // For OCR text, grab the whole LINE (or PARAGRAPH on Alt+click) so
        // the user gets a useful editable block instead of one word per
        // span. Falls back to single-word edit if grouping returns nothing.
        const lineSpans = e.altKey
          ? findParagraphSpansFromSeed(overlay, span)
          : findLineSpansFromSeed(overlay, span);
        if (lineSpans && lineSpans.length > 1) {
          editParagraphFromSpans(overlay, lineSpans);
        } else {
          editOriginalPdfText(overlay, span);
        }
      });
      layer.appendChild(span);
      added++;
      cacheEntry.words.push({
        text: w.text,
        x,
        y: glyphTop_design,
        w: widthPx,
        h: heightPx_design,
        fontHeight: fontSize_design,
        baselineY: baselineY_design,
      });
    }
  }
  if (cacheEntry.words.length) window._ocrCache[pageNum] = cacheEntry;
  // Telemetry for debugging when OCR text doesn't appear clickable. Open
  // DevTools console and inspect window._ocrDebug[pageNum] after running OCR.
  window._ocrDebug = window._ocrDebug || {};
  window._ocrDebug[pageNum] = { added, dropStats, lineCount: lines.length };
  if (!added)
    console.warn('[OCR] page', pageNum, '→ 0 clickable spans. Stats:', dropStats, 'lines in:', lines.length);
  return added;
}

// Re-inject cached OCR words into the page's text layer. Called after
// buildPdfTextLayer rebuilds the layer from pdf.js (which doesn't know
// about OCR results).
function _reapplyOcrCache(overlay, pageNum) {
  const entry = window._ocrCache && window._ocrCache[pageNum];
  if (!entry || !entry.words.length) return;
  // Strip image markers covering this OCR'd page — scanned PDFs trigger
  // pdf.js to report the whole page as one giant raster image, which
  // creates a page-sized purple .pdf-image-marker that captures clicks
  // and blocks the OCR text underneath. _stripImageMarkersForOcr() also
  // re-runs after buildPdfImageLayer (which is async fire-and-forget).
  _stripImageMarkersForOcr(overlay, entry);
  const layer =
    overlay.querySelector('.pdf-text-layer') ||
    (function () {
      const l = document.createElement('div');
      l.className = 'pdf-text-layer';
      l.style.width = overlay.style.width;
      l.style.height = overlay.style.height;
      overlay.appendChild(l);
      return l;
    })();
  for (const w of entry.words) {
    const span = document.createElement('div');
    span.className = 'pdf-text-item';
    span.style.left = w.x + 'px';
    span.style.top = w.y + 'px';
    span.style.width = w.w + 'px';
    span.style.height = w.h + 'px';
    span.title = w.text;
    span.dataset.text = w.text;
    span.dataset.fontHeight = String(w.fontHeight);
    span.dataset.fontName = 'OCR-Helvetica';
    span.dataset.baselineY = String(w.baselineY);
    span.dataset.x = String(w.x);
    span.dataset.y = String(w.y);
    span.dataset.w = String(w.w);
    span.dataset.h = String(w.h);
    span.dataset.pageNum = String(pageNum);
    span.dataset.ocr = '1';
    span.addEventListener('click', (e) => {
      if (currentTool !== 'edit-pdf') return;
      e.stopPropagation();
      const lineSpans = e.altKey
        ? findParagraphSpansFromSeed(overlay, span)
        : findLineSpansFromSeed(overlay, span);
      if (lineSpans && lineSpans.length > 1) {
        editParagraphFromSpans(overlay, lineSpans);
      } else {
        editOriginalPdfText(overlay, span);
      }
    });
    layer.appendChild(span);
  }
}
// Strip pdf-image-marker rectangles from a page that has OCR text. On a
// scanned PDF, pdf.js detects the entire page as one raster image, so
// buildPdfImageLayer drops a page-sized .pdf-image-marker on top — a
// dashed purple frame with pointer-events:auto (in Select mode) and
// dblclick → grabImageMarker. That marker eats the click before it can
// reach the OCR text span underneath, so the user "can only manipulate
// it like an image" instead of editing. Since OCR has already turned the
// page into text, the image markers are misleading here.
function _stripImageMarkersForOcr(overlay, entry) {
  // Image markers are intentionally KEPT on OCR'd pages so the user can
  // still grab images / dblclick the whole scan as one object in Select
  // mode. They're visually + functionally hidden only in Edit-PDF mode
  // via the body.edit-pdf-mode CSS rule below — so OCR text underneath
  // is clickable in that mode without losing image-grab elsewhere.
  // (Kept as a no-op hook in case we want page-specific filtering later.)
}
// Wrap buildPdfTextLayer so OCR results survive page re-renders.
(function () {
  if (typeof buildPdfTextLayer !== 'function') return;
  const _orig = buildPdfTextLayer;
  buildPdfTextLayer = async function (overlay, pdfPage, viewport, pageNum) {
    const r = await _orig(overlay, pdfPage, viewport, pageNum);
    try {
      _reapplyOcrCache(overlay, pageNum);
    } catch (e) {
      console.warn('[ocr reapply]', e);
    }
    return r;
  };
})();
// Wrap buildPdfImageLayer too — it's fire-and-forget after
// buildPdfTextLayer, so image markers land AFTER _reapplyOcrCache strips
// the old ones. Re-strip once the new markers are placed.
(function () {
  if (typeof buildPdfImageLayer !== 'function') return;
  const _orig = buildPdfImageLayer;
  buildPdfImageLayer = async function (overlay, pdfPage, viewport, pageNum) {
    const r = await _orig(overlay, pdfPage, viewport, pageNum);
    try {
      const entry = window._ocrCache && window._ocrCache[pageNum];
      if (entry) _stripImageMarkersForOcr(overlay, entry);
    } catch (e) {
      console.warn('[ocr strip-img]', e);
    }
    return r;
  };
})();

// Toggle OCR banner when no text items are present after load
function maybeShowOcrBanner() {
  const banner = document.getElementById('ocrBanner');
  if (!banner) return;
  // Hide the "looks like a scan" banner for blank documents the user just
  // created via "New" — emptiness is the intent, not a missing OCR pass.
  if (pdfJsDoc && pdfTotalTextItems === 0 && !_isBlankPdf) banner.style.display = '';
  else banner.style.display = 'none';
}
// Wrap renderPages so we re-evaluate banner visibility after layers are done
const _origCheckForBanner = (function () {
  // After buildPdfTextLayer promises resolve, the toast appears (already implemented).
  // We also show the banner so the user can act on it.
  let lastObservedDoc = null;
  setInterval(() => {
    if (pdfJsDoc !== lastObservedDoc) {
      lastObservedDoc = pdfJsDoc;
      // Defer to allow text-layer promises to settle
      setTimeout(maybeShowOcrBanner, 1200);
    }
  }, 600);
})();

document.getElementById('ocrRunBtn').addEventListener('click', runOcrOnDocument);
document.getElementById('ocrDismissBtn').addEventListener('click', () => {
  document.getElementById('ocrBanner').style.display = 'none';
});
document.getElementById('ocrCancelBtn').addEventListener('click', () => {
  _ocrCancel = true;
  setOcrStatus(window.t('ocr.cancelling', 'Cancelling — waiting for current page to finish…'));
});

