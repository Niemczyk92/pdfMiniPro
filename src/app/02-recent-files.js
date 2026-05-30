// ===== Recent files (IndexedDB) — shown on the empty/start screen =====
// Reuses the draft IndexedDB store (openIDB / idbGet / idbPut) under its own key.
// Everything stays local; nothing is uploaded.
const RECENT_KEY = 'recentFiles';
const RECENT_MAX = 6;
function _captureFirstPageThumb() {
  try {
    const c = document.querySelector('.page-wrapper canvas');
    if (!c || !c.width) return '';
    const tw = 120,
      th = Math.max(1, Math.round(tw * (c.height / c.width)));
    const off = document.createElement('canvas');
    off.width = tw;
    off.height = th;
    off.getContext('2d').drawImage(c, 0, 0, tw, th);
    return off.toDataURL('image/jpeg', 0.6);
  } catch (_) {
    return '';
  }
}
async function recordRecentFile(origName) {
  if (!pdfBytes || !pdfJsDoc) return;
  const name = origName || (pdfFileName || 'document.pdf').replace(/-edited\.pdf$/i, '.pdf');
  const bytesU8 = pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes;
  if (bytesU8.byteLength > 25 * 1024 * 1024) return; // don't cache very large files
  const thumb = _captureFirstPageThumb();
  let list = [];
  try {
    list = (await idbGet(RECENT_KEY)) || [];
  } catch (_) {}
  list = list.filter((r) => !(r.name === name && r.size === bytesU8.byteLength));
  list.unshift({
    name,
    size: bytesU8.byteLength,
    bytes: bytesU8.slice(0),
    thumb,
    pages: pdfJsDoc.numPages,
    ts: Date.now(),
  });
  list = list.slice(0, RECENT_MAX);
  try {
    await idbPut(RECENT_KEY, list);
  } catch (_) {}
  renderRecentFiles();
}
async function renderRecentFiles() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  let wrap = document.getElementById('recentFilesWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'recentFilesWrap';
    wrap.style.cssText = 'margin-top:24px;width:100%;max-width:660px;';
    wrap.addEventListener('click', (e) => e.stopPropagation()); // don't open the file dialog
    dz.appendChild(wrap);
  }
  let list = [];
  try {
    list = (await idbGet(RECENT_KEY)) || [];
  } catch (_) {}
  if (!list.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = '';
  const head = document.createElement('div');
  head.style.cssText =
    'font-weight:700;font-size:13px;color:var(--muted);margin-bottom:10px;text-align:left;';
  head.textContent = window.t('recent.title', 'Recent files');
  wrap.appendChild(head);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;';
  list.forEach((r, i) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.style.cssText =
      'border:1px solid var(--border);background:var(--surface);border-radius:10px;padding:8px;cursor:pointer;width:128px;text-align:left;position:relative;';
    card.innerHTML =
      (r.thumb
        ? '<img src="' +
          r.thumb +
          '" style="width:100%;height:150px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--border);background:#fff;">'
        : '<div style="height:150px;display:grid;place-items:center;font-size:32px;border-radius:6px;background:var(--surface-2);">📄</div>') +
      '<div style="font-size:11px;font-weight:600;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' +
      escapeHtml(r.name) +
      '">' +
      escapeHtml(r.name) +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);">' +
      r.pages +
      ' ' +
      (r.pages === 1
        ? window.t('pages.one', 'page')
        : window
            .t('pages.many', 'pages')
            .replace('{n}', r.pages)
            .replace(/^\d+\s*/, '')) +
      '</div>';
    const del = document.createElement('span');
    del.textContent = '✕';
    del.title = window.t('recent.remove', 'Remove from list');
    del.style.cssText =
      'position:absolute;top:5px;right:6px;font-size:11px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:50%;width:18px;height:18px;line-height:16px;text-align:center;';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      let l = [];
      try {
        l = (await idbGet(RECENT_KEY)) || [];
      } catch (_) {}
      l.splice(i, 1);
      try {
        await idbPut(RECENT_KEY, l);
      } catch (_) {}
      renderRecentFiles();
    });
    card.appendChild(del);
    card.addEventListener('click', async () => {
      let l = [];
      try {
        l = (await idbGet(RECENT_KEY)) || [];
      } catch (_) {}
      const item = l[i];
      if (!item) return;
      const bytes = item.bytes instanceof Uint8Array ? item.bytes : new Uint8Array(item.bytes);
      loadPDF(new File([bytes], item.name, { type: 'application/pdf' }));
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
}
// Wrap loadPDF so every successful open is remembered (covers Open, drag-drop, recents).
const _origLoadPDF_recent = loadPDF;
loadPDF = async function (file) {
  await _origLoadPDF_recent(file);
  try {
    if (pdfJsDoc && pdfBytes) await recordRecentFile(file && file.name);
  } catch (e) {
    console.warn('[recent]', e);
  }
};
// Populate the recents grid on the start screen.
setTimeout(() => {
  try {
    renderRecentFiles();
  } catch (_) {}
}, 400);

async function renderPages() {
  const container = document.getElementById('pages');
  container.innerHTML = '';
  pdfTotalTextItems = 0;
  // === MOBILE auto-fit reset DISABLED v1.34 — see commented block where
  // fitToViewportWidthIfNeeded is defined. _userZoomed is now an unused
  // stub but we keep the assignment to make the disabled intent explicit.
  _userZoomed = false;
  // High-resolution rendering: canvas pixels at 2× display so high-DPI screens stay crisp,
  // but CSS dimensions stay at RENDER_SCALE so layout/coords don't change.
  const dpr = window.devicePixelRatio || 1;
  const pixelMul = Math.max(2, Math.min(3, dpr * 1.5));
  for (let i = 1; i <= pdfJsDoc.numPages; i++) {
    const page = await pdfJsDoc.getPage(i);
    const dispViewport = page.getViewport({ scale: RENDER_SCALE });
    const pixViewport = page.getViewport({ scale: RENDER_SCALE * pixelMul });
    const baseW = dispViewport.width,
      baseH = dispViewport.height;
    const pixW = Math.round(pixViewport.width),
      pixH = Math.round(pixViewport.height);

    const block = document.createElement('div');
    block.className = 'page-block';
    block.style.animationDelay = i * 30 + 'ms';
    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = 'Page ' + i + ' of ' + pdfJsDoc.numPages;
    block.appendChild(label);

    const shell = document.createElement('div');
    shell.className = 'page-zoom-shell';
    shell.style.width = baseW * currentZoom + 'px';
    shell.style.height = baseH * currentZoom + 'px';

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.pageNum = i;
    wrapper.dataset.scale = RENDER_SCALE;
    wrapper.dataset.baseW = baseW;
    wrapper.dataset.baseH = baseH;
    wrapper.dataset.pdfRotation = String(page.rotate || 0);
    wrapper.style.width = baseW + 'px';
    wrapper.style.height = baseH + 'px';
    wrapper.style.transform = `scale(${currentZoom})`;

    const canvas = document.createElement('canvas');
    canvas.width = pixW;
    canvas.height = pixH;
    canvas.style.width = baseW + 'px';
    canvas.style.height = baseH + 'px';
    wrapper.appendChild(canvas);

    const overlay = document.createElement('div');
    overlay.className = 'overlay' + (currentTool === 'text' ? ' text-cursor' : '');
    overlay.style.width = baseW + 'px';
    overlay.style.height = baseH + 'px';
    wrapper.appendChild(overlay);

    shell.appendChild(wrapper);
    block.appendChild(shell);
    container.appendChild(block);
    // willReadFrequently: getImageData is later called on this canvas by
    // grabImageMarker / edgeHasInk. Setting the flag at creation avoids the
    // Chrome "Multiple readback operations…" perf warning.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    await page.render({ canvasContext: ctx, viewport: pixViewport }).promise;
    setupOverlay(overlay, i);
    // Pro: build a clickable text layer for in-place editing
    if (!window._textLayerPromises) window._textLayerPromises = [];
    window._textLayerPromises.push(
      buildPdfTextLayer(overlay, page, dispViewport, i).catch((e) => console.warn('text layer error:', e))
    );
  }
  // === MOBILE auto-fit DISABLED v1.34 — scheduleFitToViewport is now a
  // no-op stub. The call is left here so re-enabling the feature later
  // only needs to restore the body of scheduleFitToViewport. The "use a
  // desktop browser" notice handles the narrow-viewport case for now.
  try {
    scheduleFitToViewport();
  } catch (_) {}
  // Once all text layers finish, warn user if the PDF appears to be a scan
  const pending = window._textLayerPromises || [];
  window._textLayerPromises = [];
  Promise.all(pending).then(() => {
    if (pdfJsDoc && pdfTotalTextItems === 0 && !_isBlankPdf) {
      setTimeout(() => {
        showToast(
          window.t(
            'toast.scanHeadsUp',
            "Heads up: this PDF has no editable text — it looks like a scan or image-only PDF. Edit PDF can't change text that isn't there. Use 'Add Text' to overlay new text on top."
          ),
          'warn'
        );
      }, 300);
    }
  });
}

// Build a clickable text overlay so user can click any existing PDF text to edit it.
async function buildPdfTextLayer(overlay, pdfPage, viewport, pageNum) {
  let textContent;
  try {
    textContent = await pdfPage.getTextContent();
  } catch (e) {
    console.warn('getTextContent:', e);
    return;
  }
  // Remove any prior text layer (re-renders during organize / zoom)
  const old = overlay.querySelector('.pdf-text-layer');
  if (old) old.remove();

  const layer = document.createElement('div');
  layer.className = 'pdf-text-layer';
  layer.style.width = viewport.width + 'px';
  layer.style.height = viewport.height + 'px';

  let itemsAdded = 0;
  // viewport rotation flag — for rotated viewports the bounding box math is
  // direction-dependent; we use magnitude formulas that work for any angle.
  const vpRot = (((viewport.rotation || 0) % 360) + 360) % 360;
  const isRotated = vpRot !== 0;
  for (const item of textContent.items) {
    if (!item.str || !item.str.trim()) continue;
    // Final transform = viewport.transform · item.transform
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    // tx is [a, b, c, d, e, f]. The font height is the magnitude of the
    // Y-basis vector (sqrt(c² + d²)) which works for ANY rotation — using
    // just Math.abs(tx[3]) yields 0 on 90°/270° rotated viewports and would
    // make the editable region collapse to nothing.
    const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
    // Pick the visual top-left of the text bounding box (still approximate
    // for arbitrary angles, but the right axis-aligned bbox corner for the
    // common 0°/90°/180°/270° page rotations).
    let x, yTop;
    if (vpRot === 90) {
      x = tx[4];
      yTop = tx[5];
    } else if (vpRot === 180) {
      x = tx[4] - 0;
      yTop = tx[5] - fontHeight;
    } else if (vpRot === 270) {
      x = tx[4] - fontHeight;
      yTop = tx[5];
    } else {
      x = tx[4];
      yTop = tx[5] - fontHeight;
    }
    // Width: magnitude of the X-basis after viewport transform, normalised
    // against item.transform's X-basis (= font size in PDF units).
    const txXMag = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const itemXMag =
      Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]) || 1;
    const widthPx = (item.width || 0) * (txXMag / itemXMag);
    if (fontHeight < 4 || widthPx < 4) continue; // skip near-invisible items
    itemsAdded++;

    // Look up the actual font name (e.g. "Helvetica", "Helvetica-Bold")
    let actualFont = item.fontName || '';
    try {
      if (pdfPage.commonObjs.has(item.fontName)) {
        const f = pdfPage.commonObjs.get(item.fontName);
        if (f && f.name) actualFont = f.name;
      }
    } catch (_) {}

    const span = document.createElement('div');
    span.className = 'pdf-text-item';
    span.style.left = x + 'px';
    span.style.top = yTop + 'px';
    span.style.width = widthPx + 'px';
    span.style.height = fontHeight * 1.2 + 'px';
    span.title = item.str;
    span.dataset.text = item.str;
    span.dataset.fontHeight = String(fontHeight);
    span.dataset.fontName = actualFont;
    span.dataset.x = String(x);
    span.dataset.y = String(yTop);
    span.dataset.w = String(widthPx);
    span.dataset.h = String(fontHeight * 1.2);
    span.dataset.pageNum = String(pageNum);
    span.addEventListener('click', (e) => {
      // Single click only converts in explicit Edit-PDF mode. In Select mode
      // a click on text does nothing (user can still double-click to edit,
      // or press E / Edit Text to enter edit mode first). Restored on user
      // request — auto-converting text on Select-mode single click felt
      // too aggressive in normal browsing of the PDF.
      if (currentTool !== 'edit-pdf') return;
      e.stopPropagation();
      // Shift+click in Edit-PDF mode = REAL stream-level delete (no whiteout).
      // pdf-lib walks the page's content stream on save, finds the matching
      // Tj/TJ glyph run and removes the operator; following same-line text
      // reflows left by the deleted width. Falls back to whiteout if the run
      // can't be matched (CID fonts, complex layouts).
      if (e.shiftKey) {
        markPdfTextForDeletion(overlay, span);
        return;
      }
      editOriginalPdfText(overlay, span);
    });
    layer.appendChild(span);
  }
  overlay.appendChild(layer);
  pdfTotalTextItems += itemsAdded;
}

// Detect family / bold / italic from a PDF font name
// Improved PDF-font classifier: handles common embedded names like ArialMT,
// TimesNewRomanPSMT, LiberationSans, etc.
function classifyPdfFontName(name) {
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let family = 'Helvetica';
  // Order matters: more specific patterns first
  if (
    /times|tmrm|tmsr|romanserif|garamond|cambria|georgia|baskerville|caslon|palatino|minion|book|notoserif|liberationserif|dejavuserif/.test(
      n
    )
  )
    family = 'Times-Roman';
  else if (
    /courier|cour|consolas|menlo|monaco|monospace|inconsolata|robotomono|sourcecodepro|liberationmono|dejavusansmono/.test(
      n
    )
  )
    family = 'Courier';
  // else: default Helvetica (catches arial, helvetica, calibri, segoe, verdana, opensans, roboto, notosans, liberationsans, …)
  const bold = /bold|black|heavy|800|900|extrabold|demibold|semibold/.test(n);
  const italic = /italic|oblique|slanted/.test(n);
  return { family, bold, italic };
}

// Approximate ascent-to-em ratios for the standard PDF fonts we render with
// (used so the replacement text's baseline lands exactly on the original baseline).
const PDF_FONT_ASCENT = { Helvetica: 0.78, 'Times-Roman': 0.72, Courier: 0.63 };

// Measure how far below an annotation's top edge the first line's baseline appears in CSS.
// For from-pdf-edit annotations we use padding:0 + line-height:1, so this is the font's ascent.
function measureCssAscent(fontSize, family, bold, italic) {
  try {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const weight = bold ? '700' : '400';
    const style = italic ? 'italic' : 'normal';
    const cssFamily = TEXT_FONT_FAMILIES[family] || TEXT_FONT_FAMILIES.Helvetica;
    ctx.font = `${style} ${weight} ${fontSize}px ${cssFamily}`;
    const m = ctx.measureText('Mg');
    if (m && m.actualBoundingBoxAscent) return m.actualBoundingBoxAscent;
  } catch (_) {}
  return fontSize * (PDF_FONT_ASCENT[family] || 0.78);
}

// Sample the ink color AND background color inside a text bbox. Returns
// { ink: '#rrggbb', bg: '#rrggbb' } or null. Histograms colors in 32-step
// bins so anti-aliased edge pixels collapse together; takes the most-
// frequent bin as the background and the most-frequent OTHER-far-from-bg
// bin as the ink. Works for:
//   - dark text on light bg (most common)
//   - light text on colored bg (e.g. white on red ribbon)
//   - colored text on white bg
//   - colored text on colored bg
function _sampleTextColor(overlay, cssX, cssY, cssW, cssH) {
  try {
    const wrapper = overlay.closest('.page-wrapper');
    if (!wrapper) return null;
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) return null;
    const cssCanvasW = parseFloat(canvas.style.width) || canvas.width;
    const pixMul = canvas.width / cssCanvasW;
    const sx = Math.max(0, Math.floor(cssX * pixMul));
    const sy = Math.max(0, Math.floor(cssY * pixMul));
    const sw = Math.min(canvas.width - sx, Math.ceil(cssW * pixMul));
    const sh = Math.min(canvas.height - sy, Math.ceil(cssH * pixMul));
    if (sw < 2 || sh < 2) return null;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(sx, sy, sw, sh).data;
    const QUANT = 32;
    const hist = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      const r = Math.floor(data[i] / QUANT) * QUANT;
      const g = Math.floor(data[i + 1] / QUANT) * QUANT;
      const b = Math.floor(data[i + 2] / QUANT) * QUANT;
      const key = (r << 16) | (g << 8) | b;
      hist.set(key, (hist.get(key) || 0) + 1);
    }
    if (hist.size < 2) return null;
    const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
    const unpack = (k) => ({ r: (k >> 16) & 0xff, g: (k >> 8) & 0xff, b: k & 0xff });
    const bg = unpack(sorted[0][0]);
    // Find the most-frequent color that's perceptually FAR from bg — that's
    // the ink. Threshold 80 in RGB space ≈ "noticeably different".
    for (let i = 1; i < sorted.length; i++) {
      const c = unpack(sorted[i][0]);
      const dr = c.r - bg.r,
        dg = c.g - bg.g,
        db = c.b - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > 80) {
        const hex = (n) => n.toString(16).padStart(2, '0');
        return {
          ink: '#' + hex(c.r) + hex(c.g) + hex(c.b),
          bg: '#' + hex(bg.r) + hex(bg.g) + hex(bg.b),
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}
// Returns true when a sampled "bg" colour is essentially white (so we
// shouldn't try to preserve it on the whiteout — pure white is the default).
function _isNearWhite(hex) {
  if (!hex || hex[0] !== '#') return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r + g + b > 720; // same threshold used in sampling
}

// Mark a single pdf-text-item span for stream-level deletion (no whiteout
// is created — save-time stream rewrite removes the glyphs and shifts the
// rest of the line left). The span is visually struck through in red so the
// user sees what'll be removed before they hit Save.
function markPdfTextForDeletion(overlay, span) {
  if (span.classList.contains('pdf-text-item-consumed')) return;
  if (span.classList.contains('pdf-text-delete-marked')) {
    // toggle off
    span.classList.remove('pdf-text-delete-marked');
    const id = span.dataset._delId;
    if (id) {
      const idx = annotations.findIndex((a) => a.type === 'text-delete' && a._spanId === id);
      if (idx >= 0) {
        annotations.splice(idx, 1);
      }
    }
    updateAnnotCount();
    pushHistory('delete-text-unmark');
    return;
  }
  const pageNum = parseInt(span.dataset.pageNum);
  const x = parseFloat(span.dataset.x);
  const yTop = parseFloat(span.dataset.y);
  const w = parseFloat(span.dataset.w);
  const h = parseFloat(span.dataset.h);
  const text = span.dataset.text || '';
  const fontHeight = parseFloat(span.dataset.fontHeight) || h || 14;
  const id = 'del_' + Math.random().toString(36).slice(2, 9);
  span.classList.add('pdf-text-delete-marked');
  span.dataset._delId = id;
  annotations.push({
    type: 'text-delete',
    pageNum,
    x,
    y: yTop,
    width: w,
    height: h,
    fontHeight,
    sourceText: text,
    _spanId: id,
  });
  updateAnnotCount();
  pushHistory('delete-text-mark');
}

// Click handler — replace original text region with a whiteout + a precisely-placed editable text annotation
function editOriginalPdfText(overlay, span) {
  // Guard: a single span must only spawn one whiteout + text pair. A native
  // double-click fires `click` twice plus `dblclick` — without this guard the
  // first `click` consumes the span and the synthetic dblclick would still
  // resolve the same point via findPdfTextItemAtPoint to a stale rect.
  if (span.classList.contains('pdf-text-item-consumed')) return;
  if (span.style.display === 'none') return;
  const pageNum = parseInt(span.dataset.pageNum);
  const x = parseFloat(span.dataset.x);
  const yTop = parseFloat(span.dataset.y);
  const w = parseFloat(span.dataset.w);
  const h = parseFloat(span.dataset.h);
  const text = span.dataset.text || '';
  let fontHeight = parseFloat(span.dataset.fontHeight) || 14;
  // Defensive clamps: prevent absurd font sizes that would make the edit annotation
  // unusably huge if the buildPdfTextLayer math hits an edge case (e.g. rotated viewport).
  if (!isFinite(fontHeight) || fontHeight < 4) fontHeight = 14;
  if (fontHeight > 120) fontHeight = 14; // 120pt is the ceiling for any reasonable PDF body text
  // Heads-up: rotated pages produce edit annotations whose orientation may not match
  // the visible text. Warn once so user knows to use Add Text instead.
  try {
    const wrapper = overlay.closest('.page-wrapper');
    if (
      wrapper &&
      wrapper.dataset.pdfRotation &&
      wrapper.dataset.pdfRotation !== '0' &&
      !window._editRotatedWarned
    ) {
      window._editRotatedWarned = true;
      showToast(
        'This page has rotation baked in (' +
          wrapper.dataset.pdfRotation +
          '°). Edit PDF may not match the visible text orientation — Add Text often works better on rotated pages.',
        'warn'
      );
    }
  } catch (_) {}
  const fontName = span.dataset.fontName || '';
  const cls = classifyPdfFontName(fontName);

  // Sample the actual rendered text colour from the canvas so coloured text
  // (red invoice headers, blue links, etc.) keeps its colour after edit.
  // Fall back to black when the ink reads near-white — the whiteout below
  // is white, so white-ink would be invisible. The "white text on coloured
  // ribbon" case is rare and was making the common case look worse, so we
  // optimise for the common case.
  const sampled = _sampleTextColor(overlay, x, yTop, w, h);
  const textColor = sampled && !_isNearWhite(sampled.ink) ? sampled.ink : '#000000';

  // Prefer the precise baseline if the layer builder stored one (OCR does this).
  // For pdf.js-built spans we fall back to yTop + fontHeight which approximates baseline = bottom of bbox.
  const baselineDesignY = span.dataset.baselineY ? parseFloat(span.dataset.baselineY) : yTop + fontHeight;
  // Where the first glyph's top will land inside our rendered annotation
  // (with padding:0 + line-height:1 the baseline sits `ascent` below element.top).
  const cssAscent = measureCssAscent(fontHeight, cls.family, cls.bold, cls.italic);
  const annY = baselineDesignY - cssAscent;

  // 1) Whiteout the original region. We over-bleed slightly because the
  // pdf.js text layer rectangles tend to be tight against the glyph bounds
  // (especially top/bottom), so a 1-px anti-aliased edge of the original
  // letters can peek through if the bleed is too small. ~25 % of font height
  // top+bottom and ~5 % left/right covers every common embedded font.
  const bleedY = Math.max(2, fontHeight * 0.28);
  const bleedX = Math.max(2, fontHeight * 0.1);
  const whiteoutAnn = {
    type: 'whiteout',
    pageNum,
    x: x - bleedX,
    y: yTop - bleedY,
    width: w + bleedX * 2,
    height: h + bleedY * 2,
  };
  // Whiteout stays pure white — sampling the canvas bg gave subtly off-white
  // results (anti-aliasing around glyph edges, slight render compression)
  // that looked worse than a clean white block. The text-color sampling
  // above still captures the original ink colour correctly.
  whiteoutAnn.el = createWhiteoutEl(whiteoutAnn, overlay);
  annotations.push(whiteoutAnn);

  // 2) Build the editable text annotation (precise font + baseline)
  const el = document.createElement('div');
  el.className = 'annotation text-annotation from-pdf-edit';
  el.style.left = x + 'px';
  el.style.top = annY + 'px';
  el.style.fontSize = fontHeight + 'px';
  overlay.appendChild(el);
  const ann = {
    type: 'text',
    pageNum,
    x,
    y: annY,
    lines: [[{ text, color: textColor, bold: cls.bold, italic: cls.italic, underline: false }]],
    fontSize: fontHeight,
    fontFamily: cls.family,
    lineHeight: 1.0, // tight — baseline math relies on this
    align: 'left',
    noBackground: true, // background is the whiteout itself
    width: Math.max(40, w + 12),
    height: fontHeight * 1.1,
    el,
    sourceWhiteout: whiteoutAnn,
    fromPdfEdit: true,
    _origAscent: cssAscent,
    _origBaselineY: baselineDesignY,
  };
  annotations.push(ann);
  bindEditCover(whiteoutAnn, ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  updateAnnotCount();
  // Hide the source span so the user doesn't keep re-editing the same region
  span.style.display = 'none';
  span.classList.add('pdf-text-item-consumed');
  // Record history BEFORE opening the editor so Undo can wipe out a half-finished
  // edit (orphaned whiteout + text annotation) even if the user Escapes out.
  pushHistory('edit-pdf-text-begin');
  setTool('select');
  select(ann);
  setTimeout(() => openTextEditor(overlay, pageNum, ann.x, ann.y, ann), 50);
}

function createWhiteoutEl(ann, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation whiteout-annotation';
  el.style.left = ann.x + 'px';
  el.style.top = ann.y + 'px';
  el.style.width = ann.width + 'px';
  el.style.height = ann.height + 'px';
  // If a custom background color was sampled (light text on colored bg case),
  // use it instead of white so the underlying colored ribbon / shaded cell
  // is preserved when the new text is rendered.
  if (ann.bgColor) el.style.background = ann.bgColor;
  overlay.appendChild(el);
  enableWhiteoutInteractions(el, ann);
  return el;
}

// Bind an Edit-PDF cover (whiteout) to the replacement text so the pair behaves
// as ONE object: the cover is no longer independently clickable/selectable
// (pointer-events off → the user can't grab a stray "White-out"), it travels with
// the text on drag, and it's removed when the text is deleted (see enableTextDrag,
// removeAnnotation and the Delete-key handler). The whiteout stays in the
// annotations array so the save pipeline still flattens it under the new text.
function bindEditCover(whiteoutAnn, textAnn) {
  if (!whiteoutAnn || !textAnn) return;
  whiteoutAnn.ownerText = textAnn;
  if (whiteoutAnn.el) whiteoutAnn.el.style.pointerEvents = 'none';
}
function enableWhiteoutInteractions(el, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    startLeft = 0,
    startTop = 0,
    hasMoved = false;
  el.addEventListener('pointerdown', (e) => {
    if (currentTool === 'draw' || currentTool === 'shape' || currentTool === 'edit-pdf') return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    downX = e.clientX;
    downY = e.clientY;
    startLeft = ann.x;
    startTop = ann.y;
    hasMoved = false;
    dragging = true;
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - downX) / currentZoom;
    const dy = (e.clientY - downY) / currentZoom;
    if (!hasMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    hasMoved = true;
    ann.x = startLeft + dx;
    ann.y = startTop + dy;
    el.style.left = ann.x + 'px';
    el.style.top = ann.y + 'px';
    if (selected === ann) positionPropsPanel(ann);
  });
  const end = (e) => {
    if (!dragging) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (!hasMoved) select(ann);
    dragging = false;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function applyZoom() {
  // === MOBILE CODE DISABLED v1.34 ============================================
  // The mobile zoom cap below didn't work reliably (different bugs reported
  // in 020/021/033/etc.). Disabled while we ship a proper mobile experience
  // later. The block is kept commented for reference — re-enable once the
  // wider mobile rework is ready.
  // -------------------------------------------------------------------------
  // if (window.innerWidth < 760) {
  //   const probe = document.querySelector('.page-wrapper');
  //   const baseW = probe ? parseFloat(probe.dataset.baseW) : 0;
  //   if (baseW > 0) {
  //     const mainEl = document.querySelector('main');
  //     const s = mainEl ? getComputedStyle(mainEl) : null;
  //     const padL = s ? parseFloat(s.paddingLeft) || 0 : 0;
  //     const padR = s ? parseFloat(s.paddingRight) || 0 : 0;
  //     const available = Math.max(120, (mainEl ? mainEl.clientWidth : window.innerWidth) - padL - padR - 8);
  //     const maxZoom = available / baseW;
  //     if (currentZoom > maxZoom) currentZoom = maxZoom;
  //   }
  // }
  // ========================================================================
  document.querySelectorAll('.page-zoom-shell').forEach((shell) => {
    const wrapper = shell.querySelector('.page-wrapper');
    const baseW = parseFloat(wrapper.dataset.baseW),
      baseH = parseFloat(wrapper.dataset.baseH);
    shell.style.width = baseW * currentZoom + 'px';
    shell.style.height = baseH * currentZoom + 'px';
    wrapper.style.transform = `scale(${currentZoom})`;
  });
  document.getElementById('zoomReset').textContent = Math.round(currentZoom * 100) + '%';
  if (selected) positionPropsPanel(selected);
}
function setZoom(z) {
  currentZoom = Math.max(0.25, Math.min(3.0, z));
  applyZoom();
}

// === MOBILE FIT-TO-WIDTH DISABLED v1.34 ====================================
// Auto-fit-to-viewport / ResizeObserver / resize listener — all part of the
// mobile experience the user reported as broken. Kept commented for the
// next iteration; meanwhile we show a "please use desktop" notice when the
// viewport is mobile-sized (see _showMobileNotice() near the bottom).
// `_userZoomed` and `scheduleFitToViewport` are kept as no-op stubs so the
// rest of the code base — which calls them — doesn't need touching.
// ---------------------------------------------------------------------------
let _userZoomed = false;
function fitToViewportWidthIfNeeded(/* force */) {
  /* disabled */
}
function scheduleFitToViewport() {
  /* disabled */
}
// window.addEventListener('resize', () => {
//   if (!document.querySelector('.page-wrapper')) return;
//   scheduleFitToViewport();
// });
// if (window.ResizeObserver) {
//   const _bindFitObserver = () => {
//     const el = document.querySelector('main');
//     if (!el) return;
//     let lastW = el.clientWidth;
//     new ResizeObserver(() => {
//       const w = el.clientWidth;
//       if (w === lastW) return;
//       lastW = w;
//       if (!document.querySelector('.page-wrapper')) return;
//       fitToViewportWidthIfNeeded(false);
//     }).observe(el);
//   };
//   if (document.readyState === 'complete' || document.readyState === 'interactive') _bindFitObserver();
//   else window.addEventListener('DOMContentLoaded', _bindFitObserver);
// }
// ===========================================================================
function snapZoom(direction) {
  let idx = ZOOM_LEVELS.findIndex((z) => Math.abs(z - currentZoom) < 0.01);
  if (idx < 0) {
    if (direction > 0) idx = ZOOM_LEVELS.findIndex((z) => z > currentZoom);
    else {
      idx = -1;
      for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--)
        if (ZOOM_LEVELS[i] < currentZoom) {
          idx = i;
          break;
        }
    }
    if (idx < 0) return;
    setZoom(ZOOM_LEVELS[idx]);
  } else {
    setZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + direction))]);
  }
}
document.getElementById('zoomIn').addEventListener('click', () => {
  _userZoomed = true;
  snapZoom(+1);
});
document.getElementById('zoomOut').addEventListener('click', () => {
  _userZoomed = true;
  snapZoom(-1);
});
// Click on the % readout opens an inline input so the user can type any
// zoom value (25–300). Plain click without typing still goes to 100% via the
// Enter / blur fallback if the field is left untouched. We do NOT force a
// refit here — on desktop 100% should mean 100%, not "fill the viewport".
function openZoomInput() {
  const btn = document.getElementById('zoomReset');
  if (!btn || btn._zoomInputOpen) return;
  btn._zoomInputOpen = true;
  const prev = btn.textContent;
  const cur = Math.round(currentZoom * 100);
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '25';
  input.max = '300';
  input.step = '5';
  input.value = String(cur);
  input.style.cssText =
    'width:54px;height:26px;border:1px solid var(--accent);border-radius:6px;' +
    'padding:0 4px;font:inherit;font-family:"JetBrains Mono",monospace;font-size:13px;' +
    'text-align:center;background:var(--surface);color:var(--text);outline:none;';
  btn.textContent = '';
  btn.appendChild(input);
  setTimeout(() => {
    input.focus();
    input.select();
  }, 0);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    btn._zoomInputOpen = false;
    input.remove();
    btn.textContent = Math.round(currentZoom * 100) + '%';
  };
  const apply = () => {
    let v = parseFloat(input.value);
    if (!isFinite(v) || v < 25) v = 25;
    if (v > 300) v = 300;
    _userZoomed = true;
    setZoom(v / 100);
    restore();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      restore();
    }
  });
  input.addEventListener('blur', apply);
  // Don't let clicks inside the input bubble up to the document-level
  // click listeners (which would close modals, deselect annotations, etc.).
  input.addEventListener('click', (e) => e.stopPropagation());
}
document.getElementById('zoomReset').addEventListener('click', (e) => {
  // Modifier-click (Alt or Shift) is a quick "reset to 100%" shortcut. Plain
  // click opens the typed-value input.
  if (e.altKey || e.shiftKey) {
    _userZoomed = true; // honour the user's explicit choice; don't auto-refit
    setZoom(1.0);
    return;
  }
  openZoomInput();
});
document.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    if (!pdfJsDoc) return;
    e.preventDefault();
    _userZoomed = true;
    setZoom(e.deltaY < 0 ? currentZoom * 1.1 : currentZoom / 1.1);
  },
  { passive: false }
);
