// =====================================================================
// =====================  FORM FILL — AcroForm  ========================
// =====================================================================
let acroFormFields = []; // [{ field, type, fieldName, rect, pageNum, el, options }]
let pdfLibDocForForm = null; // shared pdf-lib doc used both for detection AND for save
let formDetectedToastShown = false;

// Feature-detect field type — robust to pdf-lib's minified class names.
// Verified against pdf-lib 1.17.1 in Node: only PDFDropdown has isEditable(),
// only PDFRadioGroup has isOff(), only PDFOptionList lacks isEditable.
function detectFieldType(field) {
  if (!field) return null;
  if (typeof field.getText === 'function' && typeof field.setText === 'function') return 'text';
  if (typeof field.isChecked === 'function' && typeof field.check === 'function') return 'checkbox';
  if (typeof field.getOptions === 'function' && typeof field.select === 'function') {
    if (typeof field.isOff === 'function') return 'radio';
    if (typeof field.isEditable === 'function') return 'dropdown';
    return 'optionlist';
  }
  return null;
}

// Form detection via pdf.js — much more permissive than pdf-lib for XFA forms
// (e.g. USCIS / government PDFs). pdf.js reads /Annots reliably, and we save via
// pdfJsDoc.saveDocument() which knows how to write XFA datasets too.
async function detectFormFields() {
  acroFormFields.forEach((f) => {
    try {
      f.el?.remove();
    } catch (_) {}
  });
  acroFormFields = [];
  pdfLibDocForForm = null;
  _formViewportCache = new Map();
  if (!pdfJsDoc) return;
  try {
    let mappedCount = 0;
    for (let pi = 1; pi <= pdfJsDoc.numPages; pi++) {
      const page = await pdfJsDoc.getPage(pi);
      const anns = await page.getAnnotations();
      const widgets = anns.filter((a) => a.subtype === 'Widget');
      for (const w of widgets) {
        if (!w.rect || w.rect.length < 4) continue;
        // Skip barcode / signature / button-only (push button) widgets
        if (w.fieldType === 'Sig') continue;
        if (w.fieldName && /BarCode/i.test(w.fieldName)) continue;
        // Decode field type
        let type = null;
        if (w.fieldType === 'Tx') type = 'text';
        else if (w.fieldType === 'Btn') {
          // Btn → checkbox unless radio (checkBox=false, radioButton=true)
          if (w.radioButton) type = 'radio';
          else if (w.pushButton)
            continue; // skip push buttons
          else type = 'checkbox';
        } else if (w.fieldType === 'Ch') {
          type = w.combo ? 'dropdown' : 'optionlist';
        } else {
          continue;
        }
        // pdf.js rect is [x1, y1, x2, y2] in PDF coords (origin bottom-left)
        const rx1 = Math.min(w.rect[0], w.rect[2]);
        const ry1 = Math.min(w.rect[1], w.rect[3]);
        const rw = Math.abs(w.rect[2] - w.rect[0]);
        const rh = Math.abs(w.rect[3] - w.rect[1]);
        const ff = {
          annotId: w.id, // pdf.js annotation id like "1234R"
          fieldName: w.fieldName || w.id,
          type,
          rect: { x: rx1, y: ry1, width: rw, height: rh },
          pageNum: pi,
          options: w.options
            ? w.options.map((o) => (typeof o === 'string' ? o : (o.exportValue ?? o.displayValue ?? '')))
            : null,
          optionDisplays: w.options
            ? w.options.map((o) => (typeof o === 'string' ? o : (o.displayValue ?? o.exportValue ?? '')))
            : null,
          value: w.fieldValue ?? '',
          multiline: w.multiLine === true,
          readOnly: w.readOnly === true || (w.fieldFlags & 1) !== 0,
          exportValue: w.exportValue,
        };
        acroFormFields.push(ff);
        mappedCount++;
      }
    }
    dbg('[form] detected', mappedCount, 'widget(s) via pdf.js');
    if (acroFormFields.length) {
      renderFormFieldOverlays();
      if (!formDetectedToastShown) {
        formDetectedToastShown = true;
        showToast(
          `📋 Detected ${acroFormFields.length} form field${acroFormFields.length === 1 ? '' : 's'} — fill them, then save.`,
          'success'
        );
      }
    }
  } catch (e) {
    console.warn('[form] detection failed:', e);
  }
}

// Cache viewports per page (rebuilt on PDF load) so widget rendering is fast
let _formViewportCache = new Map();
async function _viewportForPage(pageNum) {
  const cached = _formViewportCache.get(pageNum);
  if (cached) return cached;
  if (!pdfJsDoc) return null;
  try {
    const page = await pdfJsDoc.getPage(pageNum);
    // The rendered page is at RENDER_SCALE in CSS pixels. Use the same rotation as
    // displayed (defaults to page.rotate from /Rotate). convertToViewportRectangle
    // handles axis-aligned rotation maths for free.
    const viewport = page.getViewport({ scale: RENDER_SCALE, rotation: page.rotate || 0 });
    _formViewportCache.set(pageNum, viewport);
    return viewport;
  } catch (e) {
    console.warn('[form] viewport fetch failed for page', pageNum, e);
    return null;
  }
}
async function renderFormFieldOverlays() {
  // Remove any previously-rendered widgets first (in case of re-render)
  document.querySelectorAll('.form-field, .form-checkbox').forEach((el) => el.remove());
  // Group by page so we only fetch viewport once per page
  for (const ff of acroFormFields) {
    const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ff.pageNum}"]`);
    if (!wrapper) {
      console.warn('[form] missing wrapper for page', ff.pageNum);
      continue;
    }
    const overlay = wrapper.querySelector('.overlay');
    if (!overlay) {
      console.warn('[form] missing overlay for page', ff.pageNum);
      continue;
    }
    const viewport = await _viewportForPage(ff.pageNum);
    if (!viewport) continue;
    // Convert PDF rect (origin BL, Y up) to viewport rect (origin TL, Y down)
    // taking rotation into account. convertToViewportRectangle returns the rect
    // possibly with corners swapped depending on rotation; normaliseRect picks
    // [x_min, y_min, x_max, y_max] so we can compute width/height safely.
    const pdfRect = [ff.rect.x, ff.rect.y, ff.rect.x + ff.rect.width, ff.rect.y + ff.rect.height];
    const vRect = viewport.convertToViewportRectangle(pdfRect);
    const [x1, y1, x2, y2] = pdfjsLib.Util.normalizeRect(vRect);
    const x = x1,
      yTop = y1,
      w = x2 - x1,
      h = y2 - y1;
    // Skip widgets with degenerate bounds
    if (w < 4 || h < 4) {
      console.warn('[form] tiny widget skipped:', ff.fieldName, w, h);
      continue;
    }
    let el;
    if (ff.type === 'text') {
      el = document.createElement(ff.multiline ? 'textarea' : 'input');
      if (!ff.multiline) el.type = 'text';
      el.value = ff.value != null ? String(ff.value) : '';
      if (ff.readOnly) el.readOnly = true;
      // Pick a font size that matches the field height: target ~58% of h,
      // clamped to a reasonable range for body text.
      const fs = Math.max(8, Math.min(28, Math.round(h * 0.58)));
      el.style.fontSize = fs + 'px';
      el.style.lineHeight = Math.max(h - 2, fs) + 'px';
      // Multiline fields shouldn't force single-line height
      if (ff.multiline) {
        el.style.lineHeight = '1.25';
        el.style.padding = '3px 4px';
      } else {
        el.style.padding = '0 4px';
      }
      el.className = 'form-field';
    } else if (ff.type === 'checkbox' || ff.type === 'radio') {
      // Custom checkbox component so the OS-native size doesn't get stretched.
      // The <label> is the positioned box; the input is invisible but interactive,
      // and the .checkmark span renders a properly-sized tick / dot.
      const label = document.createElement('label');
      label.className = 'form-checkbox' + (ff.type === 'radio' ? ' is-radio' : '');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked =
        ff.type === 'radio'
          ? ff.value === ff.exportValue
          : ff.value && ff.value !== 'Off' && ff.value !== false;
      if (ff.readOnly) input.disabled = true;
      if (ff.type === 'radio') input.dataset.exportValue = ff.exportValue || '';
      const mark = document.createElement('span');
      mark.className = 'checkmark';
      label.appendChild(input);
      label.appendChild(mark);
      el = label;
      // Stash the actual input on the field record so applyFormValuesToBytes finds it
      ff.input = input;
    } else if (ff.type === 'dropdown' || ff.type === 'optionlist') {
      el = document.createElement('select');
      const opts = ff.options || [];
      const labels = ff.optionDisplays || opts;
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '— choose —';
      el.appendChild(blank);
      for (let i = 0; i < opts.length; i++) {
        const o = document.createElement('option');
        o.value = opts[i];
        o.textContent = labels[i] || opts[i];
        el.appendChild(o);
      }
      if (ff.value) {
        try {
          el.value = Array.isArray(ff.value) ? ff.value[0] : ff.value;
        } catch (_) {}
      }
      if (ff.readOnly) el.disabled = true;
      const fs = Math.max(9, Math.min(18, Math.round(h * 0.55)));
      el.style.fontSize = fs + 'px';
      el.className = 'form-field';
    } else {
      continue;
    }
    el.style.left = x + 'px';
    el.style.top = yTop + 'px';
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.title = ff.fieldName;
    el.dataset.fieldName = ff.fieldName;
    overlay.appendChild(el);
    ff.el = el;
  }
  dbg(
    '[form] rendered',
    acroFormFields.filter((f) => f.el).length,
    'of',
    acroFormFields.length,
    'widget overlays'
  );
}

// Apply form values back into pdfBytes using pdf.js's annotationStorage + saveDocument.
// This works for both classic AcroForm and XFA dynamic forms (USCIS-style PDFs).
async function applyFormValuesToBytes() {
  if (!acroFormFields.length || !pdfJsDoc) return false;
  try {
    const store = pdfJsDoc.annotationStorage;
    let changed = 0;
    for (const ff of acroFormFields) {
      if (!ff.el || ff.readOnly) continue;
      let v;
      if (ff.type === 'text') v = ff.el.value || '';
      else if (ff.type === 'checkbox') {
        const ck = ff.input && ff.input.checked;
        v = ck ? ff.exportValue || true : false;
      } else if (ff.type === 'dropdown' || ff.type === 'optionlist') v = ff.el.value || '';
      else if (ff.type === 'radio') {
        if (!(ff.input && ff.input.checked)) continue;
        v = ff.exportValue || (ff.input && ff.input.dataset.exportValue) || '';
      } else continue;
      // Only call setValue when the value actually differs from what pdf.js
      // already has. saveDocument() on XFA / government PDFs can produce bytes
      // that pdf-lib refuses to re-parse, so we avoid invoking it when nothing
      // changed (the most common case when just clicking Pages or Save without
      // touching form widgets).
      const _norm = (x) => (x === true ? '1' : x === false || x == null || x === 'Off' ? '' : String(x));
      if (_norm(ff.value) === _norm(v)) continue;
      store.setValue(ff.annotId, { value: v });
      ff.value = v; // remember so next pass treats it as unchanged
      changed++;
    }
    if (!changed) return false; // nothing to bake; caller keeps original pdfBytes
    const newBytes = await pdfJsDoc.saveDocument();
    pdfBytes = newBytes;
    return true;
  } catch (e) {
    console.warn('[form] applyFormValuesToBytes failed:', e);
    showToast('Could not bake form values: ' + (e.message || e), 'warn');
    return false;
  }
}

// Hook into save: bake form values into pdfBytes BEFORE generatePdfBytes redraws annotations
const _origGeneratePdfBytes = generatePdfBytes;
generatePdfBytes = async function (saveOpts) {
  if (acroFormFields.length) {
    await applyFormValuesToBytes();
  }
  // Fast path: pure form fill (no user edits / crops / bookmarks) — avoid pdf-lib so
  // strict XFA / partially-broken government PDFs save correctly.
  const noDrawingNeeded =
    !annotations.length &&
    !Object.keys(pageCrops || {}).length &&
    !(sessionBookmarks && sessionBookmarks.length);
  if (acroFormFields.length && noDrawingNeeded) {
    return pdfBytes.slice(0);
  }
  return await _origGeneratePdfBytes(saveOpts);
};

// Detect form fields after each successful PDF load
const _origLoadPDF = loadPDF;
loadPDF = async function (file) {
  await _origLoadPDF(file);
  if (pdfJsDoc) {
    detectFormFields();
    sessionBookmarks = [];
    pageCrops = {};
    await loadOriginalOutline();
  }
};
const _origLoadPDFFromBytes = loadPDFFromBytes;
loadPDFFromBytes = async function (bytes, filename, opts) {
  await _origLoadPDFFromBytes(bytes, filename, opts);
  if (pdfJsDoc) {
    detectFormFields();
    // Don't clear sessionBookmarks/pageCrops on re-load (Organize Apply re-loads bytes mid-edit)
    await loadOriginalOutline();
  }
};

// =====================================================================
// ===============  FIND & REPLACE (PRO)  ==============================
// =====================================================================
let findMatches = [];
let findIndex = -1;

function openFindModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('findModal').classList.add('show');
  setTimeout(() => document.getElementById('findInput').focus(), 60);
}
function closeFindModal() {
  document.getElementById('findModal').classList.remove('show');
  clearFindHighlight();
}
function clearFindHighlight() {
  document
    .querySelectorAll('.find-match-highlight')
    .forEach((el) => el.classList.remove('find-match-highlight'));
}
function buildFindRegex(needle, caseSensitive, wholeWord) {
  if (!needle) return null;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
}
function gatherFindMatches() {
  const needle = document.getElementById('findInput').value;
  const caseSensitive = document.getElementById('findCase').checked;
  const wholeWord = document.getElementById('findWhole').checked;
  findMatches = [];
  findIndex = -1;
  if (!needle) return;
  const re = buildFindRegex(needle, caseSensitive, wholeWord);
  if (!re) return;
  // 1) PDF text items (original document text)
  document.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)').forEach((span) => {
    const text = span.dataset.text || '';
    if (re.test(text)) findMatches.push({ kind: 'pdf', span, text });
  });
  // 2) User text annotations
  for (const ann of annotations) {
    if (ann.type !== 'text') continue;
    const text = (ann.lines || []).map((l) => l.map((s) => s.text).join('')).join('\n');
    if (re.test(text)) findMatches.push({ kind: 'ann', ann, text });
  }
}
function showCurrentMatch() {
  clearFindHighlight();
  const status = document.getElementById('findStatus');
  if (!findMatches.length) {
    status.textContent = window.t('find.noMatch', 'No matches.');
    status.className = 'find-status none';
    return;
  }
  status.textContent = window
    .t('find.matchN', 'Match {n} of {total}')
    .replace('{n}', findIndex + 1)
    .replace('{total}', findMatches.length);
  status.className = 'find-status found';
  const m = findMatches[findIndex];
  const el = m.kind === 'pdf' ? m.span : m.ann.el;
  if (!el) return;
  el.classList.add('find-match-highlight');
  // Scroll into view (smooth)
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  } catch (_) {}
}
function findStart() {
  gatherFindMatches();
  if (findMatches.length) {
    findIndex = 0;
    showCurrentMatch();
  } else {
    showCurrentMatch();
  }
}
function findStepNext() {
  if (!findMatches.length) findStart();
  else {
    findIndex = (findIndex + 1) % findMatches.length;
    showCurrentMatch();
  }
}
function findStepPrev() {
  if (!findMatches.length) findStart();
  else {
    findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
    showCurrentMatch();
  }
}

function replaceMatch(m, replacement) {
  const needle = document.getElementById('findInput').value;
  const caseSensitive = document.getElementById('findCase').checked;
  const wholeWord = document.getElementById('findWhole').checked;
  const re = buildFindRegex(needle, caseSensitive, wholeWord);
  if (!re) return false;
  if (m.kind === 'ann') {
    // Replace inside each segment's text — preserves formatting on each segment
    for (const line of m.ann.lines) {
      for (const seg of line) {
        if (!seg.text) continue;
        const before = seg.text;
        seg.text = before.replace(new RegExp(re.source, re.flags), replacement);
      }
    }
    renderTextAnnotation(m.ann);
    return true;
  }
  // PDF text item — produce whiteout + new text annotation, same flow as Edit PDF
  const span = m.span;
  if (!span || !span.parentElement) return false;
  const newText = m.text.replace(new RegExp(re.source, re.flags), replacement);
  // Reuse Edit PDF infrastructure: editOriginalPdfText would open the editor;
  // we want to perform the substitution silently.
  performInlinePdfReplacement(span, newText);
  return true;
}
function performInlinePdfReplacement(span, newText) {
  const overlay = span.closest('.overlay');
  if (!overlay) return;
  const pageNum = parseInt(span.dataset.pageNum);
  const x = parseFloat(span.dataset.x);
  const yTop = parseFloat(span.dataset.y);
  const w = parseFloat(span.dataset.w);
  const h = parseFloat(span.dataset.h);
  let fontHeight = parseFloat(span.dataset.fontHeight) || 14;
  if (!isFinite(fontHeight) || fontHeight < 4) fontHeight = 14;
  if (fontHeight > 120) fontHeight = 14; // same defensive ceiling as Edit PDF
  const fontName = span.dataset.fontName || '';
  const cls = classifyPdfFontName(fontName);
  // Whiteout
  const bleed = Math.max(1, fontHeight * 0.08);
  const whiteoutAnn = {
    type: 'whiteout',
    pageNum,
    x: x - bleed,
    y: yTop - bleed,
    width: w + bleed * 2,
    height: h + bleed * 2,
  };
  whiteoutAnn.el = createWhiteoutEl(whiteoutAnn, overlay);
  annotations.push(whiteoutAnn);
  // New text annotation, matching style + position
  const baselineDesignY = yTop + fontHeight;
  const cssAscent = measureCssAscent(fontHeight, cls.family, cls.bold, cls.italic);
  const annY = baselineDesignY - cssAscent;
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
    lines: [[{ text: newText, color: '#000000', bold: cls.bold, italic: cls.italic, underline: false }]],
    fontSize: fontHeight,
    fontFamily: cls.family,
    lineHeight: 1.0,
    align: 'left',
    noBackground: true,
    width: Math.max(40, w + 12),
    height: fontHeight * 1.1,
    el,
    sourceWhiteout: whiteoutAnn,
    fromPdfEdit: true,
  };
  annotations.push(ann);
  bindEditCover(whiteoutAnn, ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  enableTextDrag(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  span.style.display = 'none';
  span.classList.add('pdf-text-item-consumed');
  updateAnnotCount();
}
function findReplaceOne() {
  if (findIndex < 0 || !findMatches[findIndex]) findStepNext();
  if (findIndex < 0 || !findMatches[findIndex]) return;
  const replacement = document.getElementById('replaceInput').value;
  const ok = replaceMatch(findMatches[findIndex], replacement);
  if (ok) {
    pushHistory('find-replace-one');
    // Move to next match (the current one is consumed/changed)
    findMatches.splice(findIndex, 1);
    if (findIndex >= findMatches.length) findIndex = 0;
    showCurrentMatch();
  }
}
function findReplaceAll() {
  if (!findMatches.length) findStart();
  if (!findMatches.length) return;
  const replacement = document.getElementById('replaceInput').value;
  let count = 0;
  // Snapshot the list (replacement modifies dataset on spans, may not re-match)
  const snapshot = findMatches.slice();
  for (const m of snapshot) {
    if (replaceMatch(m, replacement)) count++;
  }
  pushHistory('find-replace-all');
  findMatches = [];
  findIndex = -1;
  const status = document.getElementById('findStatus');
  const tplK = count === 1 ? 'find.replacedOne' : 'find.replacedMany';
  const msg = window
    .t(tplK, count === 1 ? 'Replaced {n} occurrence.' : 'Replaced {n} occurrences.')
    .replace('{n}', count);
  status.textContent = msg;
  status.className = 'find-status found';
  showToast(msg, 'success');
}

document.getElementById('findBtn').addEventListener('click', openFindModal);
document.getElementById('findClose').addEventListener('click', closeFindModal);
document.getElementById('findModal').addEventListener('click', (e) => {
  if (e.target.id === 'findModal') closeFindModal();
});
document.getElementById('findInput').addEventListener('input', () => {
  findStart();
});
document.getElementById('findInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) findStepPrev();
    else findStepNext();
  }
});
document.getElementById('replaceInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    findReplaceOne();
  }
});
document.getElementById('findNext').addEventListener('click', findStepNext);
document.getElementById('findPrev').addEventListener('click', findStepPrev);
document.getElementById('replaceOne').addEventListener('click', findReplaceOne);
document.getElementById('replaceAll').addEventListener('click', findReplaceAll);
// Bind keyboard: Ctrl+F → open Find (overrides browser find)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F') && !e.shiftKey) {
    if (document.activeElement?.isContentEditable) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (!pdfJsDoc) return;
    e.preventDefault();
    openFindModal();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
    if (document.activeElement?.isContentEditable) return;
    if (!pdfJsDoc) return;
    e.preventDefault();
    openFindModal();
  }
});

setContext('noFile');
