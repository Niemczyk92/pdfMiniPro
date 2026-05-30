// =====================================================================
// =====================  CROP / MARGINS  ==============================
// =====================================================================
// Crop state: { [pageNum]: { top, right, bottom, left, trim } } in PDF points.
// "trim: true" sets MediaBox too (visually trims). "false" sets only CropBox.
let pageCrops = {};

function openCropModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  // Populate existing-crops summary
  const keys = Object.keys(pageCrops);
  const ex = document.getElementById('cropExisting');
  if (keys.length) {
    ex.textContent = `Currently cropping ${keys.length} page${keys.length === 1 ? '' : 's'}: ${keys.sort((a, b) => +a - +b).join(', ')}`;
  } else {
    ex.textContent = 'No crops applied yet.';
  }
  document.getElementById('cropRange').value = 'all';
  document.getElementById('cropModal').classList.add('show');
}
function closeCropModal() {
  document.getElementById('cropModal').classList.remove('show');
}
function applyCropFromModal() {
  const rangeStr = document.getElementById('cropRange').value || 'all';
  const top = parseFloat(document.getElementById('cropTop').value) || 0;
  const right = parseFloat(document.getElementById('cropRight').value) || 0;
  const bottom = parseFloat(document.getElementById('cropBottom').value) || 0;
  const left = parseFloat(document.getElementById('cropLeft').value) || 0;
  const trim = document.getElementById('cropTrim').checked;
  const pages = parsePageRange(rangeStr, pdfJsDoc.numPages);
  if (!pages.length) {
    showToast('No pages match the range.', 'warn');
    return;
  }
  for (const pn of pages) {
    pageCrops[pn] = { top, right, bottom, left, trim };
  }
  pushHistory('crop');
  closeCropModal();
  renderCropOverlays();
  showToast(
    `Crop set on ${pages.length} page${pages.length === 1 ? '' : 's'}. ${trim ? 'Will trim on Save.' : 'CropBox set; content outside will be hidden by viewers.'}`,
    'success'
  );
}
function clearAllCrops() {
  if (!Object.keys(pageCrops).length) {
    showToast('No crops to clear.', 'info');
    return;
  }
  if (!confirm('Clear all crop settings?')) return;
  pageCrops = {};
  pushHistory('crop-clear');
  closeCropModal();
  renderCropOverlays();
  showToast('All crops cleared.', 'success');
}

// Visualise the crop area as dimmed margins on each page wrapper so the user can
// see exactly what will be cropped on save. Re-renders when pages re-layout.
function renderCropOverlays() {
  // Remove any existing overlays
  document.querySelectorAll('.crop-overlay').forEach((o) => o.remove());
  if (!pdfJsDoc) return;
  const keys = Object.keys(pageCrops);
  if (!keys.length) return;
  let rendered = 0;
  const skipped = [];
  for (const pn of keys) {
    const c = pageCrops[pn];
    // Use querySelectorAll + filter for robustness (works even with stale duplicates)
    const wrapper = Array.from(document.querySelectorAll('.page-wrapper')).find(
      (w) => String(w.dataset.pageNum) === String(pn)
    );
    if (!wrapper) {
      skipped.push(pn + ' (no wrapper)');
      continue;
    }
    const scale = parseFloat(wrapper.dataset.scale);
    if (!scale || isNaN(scale)) {
      skipped.push(pn + ' (bad scale)');
      continue;
    }
    // Page is rendered in CSS pixels = pts * RENDER_SCALE. Margins in modal are in points.
    const tPx = c.top * scale;
    const rPx = c.right * scale;
    const bPx = c.bottom * scale;
    const lPx = c.left * scale;
    const overlay = document.createElement('div');
    overlay.className = 'crop-overlay' + (c.trim ? ' crop-trim' : '');
    overlay.dataset.pageNum = pn;
    overlay.innerHTML = `
      <div class="crop-mask crop-mask-top"    style="height:${tPx}px"></div>
      <div class="crop-mask crop-mask-right"  style="width:${rPx}px"></div>
      <div class="crop-mask crop-mask-bottom" style="height:${bPx}px"></div>
      <div class="crop-mask crop-mask-left"   style="width:${lPx}px"></div>
      <div class="crop-frame" style="left:${lPx}px;top:${tPx}px;right:${rPx}px;bottom:${bPx}px"></div>
      <div class="crop-badge">crop · ${c.trim ? 'trim' : 'cropbox'}</div>
    `;
    wrapper.appendChild(overlay);
    rendered++;
  }
  dbg('[crop] rendered overlays on', rendered, 'page(s);', 'configured for', keys.length, 'page(s)');
  if (skipped.length) console.warn('[crop] skipped:', skipped.join(', '));
}
// Wrap the existing renderPages so crops survive page reloads
if (typeof window._origRenderPagesForCrop === 'undefined') {
  window._origRenderPagesForCrop = renderPages;
  renderPages = async function () {
    await window._origRenderPagesForCrop.apply(this, arguments);
    renderCropOverlays();
  };
}
document.getElementById('cropBtn').addEventListener('click', openCropModal);
document.getElementById('cropClose').addEventListener('click', closeCropModal);
document.getElementById('cropCancel').addEventListener('click', closeCropModal);
document.getElementById('cropApply').addEventListener('click', applyCropFromModal);
document.getElementById('cropClear').addEventListener('click', clearAllCrops);
document.getElementById('cropModal').addEventListener('click', (e) => {
  if (e.target.id === 'cropModal') closeCropModal();
});

// === CROP / RESIZE — normalize page to standard size ===
// All sizes in PDF points (72 pt = 1 inch; 25.4 mm = 1 inch).
const CROP_SIZE_PRESETS = {
  a4: { w: 595, h: 842 },
  a4l: { w: 842, h: 595 },
  a3: { w: 842, h: 1191 },
  a3l: { w: 1191, h: 842 },
  a5: { w: 420, h: 595 },
  a5l: { w: 595, h: 420 },
  letter: { w: 612, h: 792 },
  letterl: { w: 792, h: 612 },
  legal: { w: 612, h: 1008 },
  legall: { w: 1008, h: 612 },
  tabloid: { w: 792, h: 1224 },
  exec: { w: 522, h: 756 },
  p4x6: { w: 288, h: 432 },
  p5x7: { w: 360, h: 504 },
  p8x10: { w: 576, h: 720 },
  p10x15cm: { w: 283.5, h: 425.2 },
  p13x18cm: { w: 368.5, h: 510.2 },
  square: { w: 576, h: 576 },
  square10cm: { w: 283.5, h: 283.5 },
};

function _cropResolveTargetSize() {
  const preset = document.getElementById('cropSizePreset').value;
  if (!preset) return null;
  if (preset === 'custom') {
    let w = parseFloat(document.getElementById('cropCustomW').value);
    let h = parseFloat(document.getElementById('cropCustomH').value);
    const unit = document.getElementById('cropCustomUnit').value;
    if (!isFinite(w) || w <= 0 || !isFinite(h) || h <= 0) return null;
    if (unit === 'mm') {
      w *= 72 / 25.4;
      h *= 72 / 25.4;
    } else if (unit === 'in') {
      w *= 72;
      h *= 72;
    }
    return { w, h };
  }
  return CROP_SIZE_PRESETS[preset] || null;
}

function _cropHexToColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return rgb(1, 1, 1);
  return rgb(
    parseInt(m[1].slice(0, 2), 16) / 255,
    parseInt(m[1].slice(2, 4), 16) / 255,
    parseInt(m[1].slice(4, 6), 16) / 255
  );
}

// Preset dropdown toggles the custom row
document.getElementById('cropSizePreset').addEventListener('change', (e) => {
  document.getElementById('cropCustomSize').hidden = e.target.value !== 'custom';
});

document.getElementById('cropResizeBtn').addEventListener('click', applyCropResize);

// =====================================================================
// =====================  NEW BLANK PDF  ===============================
// =====================================================================
// "New" button opens a small page-size picker, then builds a one-page
// PDFDocument in memory and loads it as if the user had just opened a
// file. Same Crop/Resize preset list so users can pick A4 / Letter /
// photo sizes / custom. Also exposed as "+ Blank page" inside Organize
// so users can append blank pages to an existing PDF.
function _newPdfResolveSize() {
  const sel = document.getElementById('newPdfSize').value;
  // Width/height inputs are the source of truth — whether we got here via
  // a preset (which auto-fills them) or via "Custom…" (user types them).
  let w = parseFloat(document.getElementById('newPdfCustomW').value);
  let h = parseFloat(document.getElementById('newPdfCustomH').value);
  const unit = document.getElementById('newPdfCustomUnit').value;
  if (!isFinite(w) || w <= 0 || !isFinite(h) || h <= 0) {
    // Fall back to preset if inputs are blank/invalid.
    return CROP_SIZE_PRESETS[sel] || null;
  }
  if (unit === 'mm') {
    w *= 72 / 25.4;
    h *= 72 / 25.4;
  } else if (unit === 'in') {
    w *= 72;
    h *= 72;
  }
  return { w, h };
}
// Reflect a preset's pt-dimensions in the visible W/H/Unit inputs so the
// user always SEES the size that'll be created — not just a hidden number.
// Picks the most readable unit for the preset (mm for ISO, in for US/photo).
function _newPdfSyncInputsFromPreset() {
  const sel = document.getElementById('newPdfSize').value;
  if (sel === 'custom') {
    // leave inputs alone — user is in custom-edit mode
    return;
  }
  const preset = CROP_SIZE_PRESETS[sel];
  if (!preset) return;
  // ISO sizes (a4/a3/a5) read nicer in mm; US + photo sizes in inches.
  const useMm = /^a\d/.test(sel) || /cm$/.test(sel);
  const unitEl = document.getElementById('newPdfCustomUnit');
  const wEl = document.getElementById('newPdfCustomW');
  const hEl = document.getElementById('newPdfCustomH');
  if (useMm) {
    unitEl.value = 'mm';
    wEl.value = ((preset.w * 25.4) / 72).toFixed(0);
    hEl.value = ((preset.h * 25.4) / 72).toFixed(0);
  } else {
    unitEl.value = 'in';
    wEl.value = (preset.w / 72).toFixed(2);
    hEl.value = (preset.h / 72).toFixed(2);
  }
}
function _newPdfUpdatePreview() {
  const size = _newPdfResolveSize();
  const el = document.getElementById('newPdfPreview');
  if (!size) {
    el.textContent = '';
    return;
  }
  const mmW = ((size.w * 25.4) / 72).toFixed(1);
  const mmH = ((size.h * 25.4) / 72).toFixed(1);
  const inW = (size.w / 72).toFixed(2);
  const inH = (size.h / 72).toFixed(2);
  el.textContent = `→ ${Math.round(size.w)} × ${Math.round(size.h)} pt   ·   ${mmW} × ${mmH} mm   ·   ${inW} × ${inH} in`;
}
// 'new'  → builds a fresh single-page PDF and loads it as the working doc.
// 'organize' → appends a blank page to the open Organize-Pages session.
let _newPdfMode = 'new';
function openNewPdfModal(mode) {
  _newPdfMode = mode === 'organize' ? 'organize' : 'new';
  document.getElementById('newPdfTitle').textContent =
    _newPdfMode === 'organize'
      ? window.t('newPdf.titleAdd', '📄 Add a blank page')
      : window.t('newPdf.title', '📄 New blank PDF');
  document.getElementById('newPdfCreate').textContent =
    _newPdfMode === 'organize'
      ? window.t('newPdf.addBlank', 'Add blank page')
      : window.t('newPdf.create', 'Create blank PDF');
  document.getElementById('newPdfModal').classList.add('show');
  // Sync the W/H/Unit inputs to the currently-selected preset so the user
  // sees real numbers (and can switch to "Custom…" to edit them).
  _newPdfSyncInputsFromPreset();
  _newPdfUpdatePreview();
}
function closeNewPdfModal() {
  document.getElementById('newPdfModal').classList.remove('show');
}
async function createBlankPdfFromForm() {
  const size = _newPdfResolveSize();
  if (!size) {
    showToast('Pick a page size.', 'warn');
    return;
  }
  const btn = document.getElementById('newPdfCreate');
  const origLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="icon">⏳</span> Working…';
  try {
    if (_newPdfMode === 'organize') {
      // Inject into the live Organize session instead of opening a new doc.
      const ok = await appendBlankPageToOrganize();
      if (ok) closeNewPdfModal();
      return;
    }
    const doc = await PDFDocument.create();
    doc.addPage([size.w, size.h]);
    const bytes = await doc.save();
    closeNewPdfModal();
    const filename = 'blank-' + Math.round(size.w) + 'x' + Math.round(size.h) + '.pdf';
    pdfFileName = filename;
    // Mark this load as a deliberately-blank document so renderPages
    // doesn't show the "looks like a scan / run OCR" banner + toast —
    // there's no text BY DESIGN, the user wants a fresh canvas.
    _isBlankPdf = true;
    await loadPDFFromBytes(bytes, filename);
    // Hide the banner immediately too, in case the deferred maybeShowOcrBanner
    // already fired before the flag took effect.
    const _b = document.getElementById('ocrBanner');
    if (_b) _b.style.display = 'none';
    showToast('New blank PDF · ' + Math.round(size.w) + '×' + Math.round(size.h) + ' pt.', 'success');
  } catch (e) {
    console.error('[new-pdf]', e);
    showToast('Could not create blank PDF: ' + (e.message || e), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origLabel;
  }
}
// Wire the New button + modal events
(function wireNewPdfModal() {
  const openBtn = document.getElementById('newPdfBtn');
  if (openBtn) openBtn.addEventListener('click', openNewPdfModal);
  const closeBtn = document.getElementById('newPdfClose');
  if (closeBtn) closeBtn.addEventListener('click', closeNewPdfModal);
  const cancelBtn = document.getElementById('newPdfCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeNewPdfModal);
  const create = document.getElementById('newPdfCreate');
  if (create) create.addEventListener('click', createBlankPdfFromForm);
  const sel = document.getElementById('newPdfSize');
  if (sel)
    sel.addEventListener('change', () => {
      // Preset change → fill the W/H inputs with that preset's dimensions in
      // a sensible unit (mm for ISO, in for US/photo). Was previously only
      // visible when "custom" was selected, so the user couldn't see the
      // numbers for any other preset (the bug 1.24's user reported).
      _newPdfSyncInputsFromPreset();
      _newPdfUpdatePreview();
    });
  // If the user edits the W / H / Unit fields manually, automatically
  // switch the preset dropdown to "Custom…" so what they see matches what
  // gets created.
  ['newPdfCustomW', 'newPdfCustomH', 'newPdfCustomUnit'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (sel && sel.value !== 'custom') sel.value = 'custom';
      _newPdfUpdatePreview();
    });
    el.addEventListener('change', () => {
      if (sel && sel.value !== 'custom') sel.value = 'custom';
      _newPdfUpdatePreview();
    });
  });
  const modal = document.getElementById('newPdfModal');
  if (modal)
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'newPdfModal') closeNewPdfModal();
    });
})();

async function applyCropResize() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const size = _cropResolveTargetSize();
  if (!size) {
    showToast('Pick a target size from the dropdown.', 'warn');
    return;
  }
  const fit = (document.querySelector('input[name="cropFit"]:checked') || {}).value || 'fit';
  const rotate = parseInt(document.getElementById('cropRotate').value, 10) || 0;
  const bg = _cropHexToColor(document.getElementById('cropBg').value);
  const rangeStr = document.getElementById('cropRange').value || 'all';
  const targetPages = new Set(parsePageRange(rangeStr, pdfJsDoc.numPages));
  if (!targetPages.size) {
    showToast('No pages match the range.', 'warn');
    return;
  }

  const btn = document.getElementById('cropResizeBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="icon">⏳</span> Working…';
  try {
    // We KEEP the user's annotations editable across resize:
    //   1. Don't bake — use raw bytes as the source.
    //   2. Compute a per-page transform (rotation around page center, then
    //      scale + offset for fit/fill/stretch) in CSS-px units, in the same
    //      coordinate system the annotations are stored in.
    //   3. Apply the transform to each annotation on a target page in place.
    //   4. loadPDFFromBytes(..., { preserveAnnotations: true }) → annotations
    //      are re-attached to the new (resized) page overlays at their new
    //      coordinates so the user can keep dragging / editing them.
    let workingBytes = pdfBytes;
    const RS = RENDER_SCALE;

    // Capture each target page's PRE-rotation size in CSS px from the live
    // page-wrapper elements — that's the same coordinate space ann.x/y live in.
    const preRotSizeCss = {};
    document.querySelectorAll('.page-wrapper').forEach((w) => {
      const n = parseInt(w.dataset.pageNum, 10);
      const bw = parseFloat(w.dataset.baseW),
        bh = parseFloat(w.dataset.baseH);
      if (n && bw && bh) preRotSizeCss[n] = { w: bw, h: bh };
    });

    // 2) Pre-rotate source pages if requested (existing behavior).
    if (rotate !== 0) {
      const tmpDoc = await PDFDocument.load(workingBytes.slice(0), PDF_LOAD_OPTS);
      const total = tmpDoc.getPageCount();
      for (let i = 0; i < total; i++) {
        if (!targetPages.has(i + 1)) continue;
        const p = tmpDoc.getPage(i);
        const cur = (p.getRotation && p.getRotation().angle) || 0;
        p.setRotation(degrees((((cur + rotate) % 360) + 360) % 360));
      }
      workingBytes = await tmpDoc.save();
    }

    // 3) Embed source pages into the new document, capturing per-page transforms.
    const newDoc = await PDFDocument.create();
    const probe = await PDFDocument.load(workingBytes.slice(0), PDF_LOAD_OPTS);
    const total = probe.getPageCount();
    const embedded = await newDoc.embedPdf(
      workingBytes,
      Array.from({ length: total }, (_, i) => i)
    );

    // Per-page annotation transform in CSS-px coords.
    const annTransforms = {};

    for (let i = 0; i < total; i++) {
      const emb = embedded[i];
      const src = emb.size(); // post-rotation bounding box (PDF pt)
      const pageNum = i + 1;
      if (!targetPages.has(pageNum)) {
        const np = newDoc.addPage([src.width, src.height]);
        np.drawPage(emb, { x: 0, y: 0, width: src.width, height: src.height });
        annTransforms[pageNum] = null; // unchanged
        continue;
      }
      const tW = size.w,
        tH = size.h;
      const np = newDoc.addPage([tW, tH]);
      np.drawRectangle({ x: 0, y: 0, width: tW, height: tH, color: bg, borderWidth: 0 });

      let dW, dH;
      if (fit === 'stretch') {
        dW = tW;
        dH = tH;
      } else if (fit === 'fill') {
        const s = Math.max(tW / src.width, tH / src.height);
        dW = src.width * s;
        dH = src.height * s;
      } else /* fit */ {
        const s = Math.min(tW / src.width, tH / src.height);
        dW = src.width * s;
        dH = src.height * s;
      }

      const offsetX_pt = (tW - dW) / 2;
      const offsetY_pt = (tH - dH) / 2;
      np.drawPage(emb, { x: offsetX_pt, y: offsetY_pt, width: dW, height: dH });

      // Record transform for annotations on this page.
      // dW/dH are post-fit content size in pt; src.width/height is post-rotation.
      annTransforms[pageNum] = {
        rotate, // CSS degrees (0/90/180/270)
        preRotSize: preRotSizeCss[pageNum] || { w: src.width * RS, h: src.height * RS },
        postRotSize_pt: { w: src.width, h: src.height }, // post-rotation, pre-fit
        scaleX: dW / src.width, // fit/fill/stretch scale
        scaleY: dH / src.height,
        offsetX_css: offsetX_pt * RS,
        offsetY_css: offsetY_pt * RS,
      };
    }

    // 4) Apply transforms to annotations IN PLACE (CSS-px space).
    annotations.forEach((ann) => {
      const t = annTransforms[ann.pageNum];
      if (!t) return; // page not resized
      _applyResizeTransformToAnn(ann, t);
    });

    deselect();
    pageCrops = {}; // margin-crops were not applied here

    const out = await newDoc.save();
    closeCropModal();
    await loadPDFFromBytes(out, pdfFileName, { preserveAnnotations: true });
    showToast(
      `Resized ${targetPages.size} page${targetPages.size === 1 ? '' : 's'} to ${Math.round(size.w)}×${Math.round(size.h)} pt — annotations follow.`,
      'success'
    );
  } catch (e) {
    console.error('[crop-resize]', e);
    showToast('Resize failed: ' + (e.message || e), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

// Apply a Crop/Resize transform to a single annotation, in CSS-px units.
// Mutates `ann` in place. Transform order: rotate around page center → scale → offset.
function _applyResizeTransformToAnn(ann, t) {
  const RS = RENDER_SCALE;
  const preW = t.preRotSize.w,
    preH = t.preRotSize.h; // CSS px (pre-rotation)
  const postW = t.postRotSize_pt.w * RS,
    postH = t.postRotSize_pt.h * RS; // CSS px (post-rotation)

  // ----- Step 1: rotation around page center (in CSS px) -----
  if (t.rotate) {
    const cx0 = preW / 2,
      cy0 = preH / 2;
    const cx1 = postW / 2,
      cy1 = postH / 2;
    // CSS rotation: positive = CW visually. With Y-down screen coords,
    // CW around origin is: (x, y) → (cos·x - sin·y, sin·x + cos·y) with θ
    // measured in screen space — i.e. for 90° CW: (x, y) → (-y, x).
    const rad = (t.rotate * Math.PI) / 180;
    const cosT = Math.cos(rad),
      sinT = Math.sin(rad);
    const rotPoint = (x, y) => {
      const dx = x - cx0,
        dy = y - cy0;
      return { x: cx1 + (cosT * dx - sinT * dy), y: cy1 + (sinT * dx + cosT * dy) };
    };
    if (ann.points && Array.isArray(ann.points)) {
      ann.points = ann.points.map((p) => rotPoint(p.x, p.y));
    }
    if (ann.x1 !== undefined && ann.y1 !== undefined) {
      const p1 = rotPoint(ann.x1, ann.y1);
      ann.x1 = p1.x;
      ann.y1 = p1.y;
    }
    if (ann.x2 !== undefined && ann.y2 !== undefined) {
      const p2 = rotPoint(ann.x2, ann.y2);
      ann.x2 = p2.x;
      ann.y2 = p2.y;
    }
    // Position annotations are (x, y) top-left + width/height — rotate the
    // CENTER, then back-derive top-left from the (possibly swapped for 90°
    // / 270°) dimensions kept as-is. CSS rotation on the element handles
    // the visual orientation via the bumped `ann.rotation`.
    if (ann.x !== undefined && ann.y !== undefined) {
      const cx = ann.x + (ann.width || 0) / 2;
      const cy = ann.y + (ann.height || 0) / 2;
      const c = rotPoint(cx, cy);
      ann.x = c.x - (ann.width || 0) / 2;
      ann.y = c.y - (ann.height || 0) / 2;
    }
    ann.rotation = ((ann.rotation || 0) + t.rotate) % 360;
  }

  // ----- Step 2: scale + offset (fit / fill / stretch) -----
  if (ann.points && Array.isArray(ann.points)) {
    ann.points = ann.points.map((p) => ({
      x: p.x * t.scaleX + t.offsetX_css,
      y: p.y * t.scaleY + t.offsetY_css,
    }));
  }
  if (ann.x1 !== undefined) ann.x1 = ann.x1 * t.scaleX + t.offsetX_css;
  if (ann.y1 !== undefined) ann.y1 = ann.y1 * t.scaleY + t.offsetY_css;
  if (ann.x2 !== undefined) ann.x2 = ann.x2 * t.scaleX + t.offsetX_css;
  if (ann.y2 !== undefined) ann.y2 = ann.y2 * t.scaleY + t.offsetY_css;
  if (ann.x !== undefined && ann.y !== undefined) {
    ann.x = ann.x * t.scaleX + t.offsetX_css;
    ann.y = ann.y * t.scaleY + t.offsetY_css;
  }
  if (ann.width !== undefined) ann.width *= t.scaleX;
  if (ann.height !== undefined) ann.height *= t.scaleY;
  if (ann.fontSize) {
    ann.fontSize = Math.max(4, ann.fontSize * Math.min(t.scaleX, t.scaleY));
  }
  if (ann.strokeWidth) {
    ann.strokeWidth = Math.max(0.5, ann.strokeWidth * Math.min(t.scaleX, t.scaleY));
  }
}

