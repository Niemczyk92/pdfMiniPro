// ===== Brush picker bar + per-brush cursor =====
// Reflect defaultBrush / defaultColor / defaultStroke into the visible bar.
function _syncBrushBar() {
  document
    .querySelectorAll('.brush-pick')
    .forEach((b) => b.classList.toggle('active', b.dataset.brush === defaultBrush));
  document
    .querySelectorAll('.brush-bar .bb-swatch')
    .forEach((s) =>
      s.classList.toggle(
        'active',
        (s.dataset.bcolor || '').toLowerCase() === (defaultColor || '').toLowerCase()
      )
    );
  const cc = document.getElementById('brushCustomColor');
  if (cc) cc.value = defaultColor;
  const bw = document.getElementById('brushWidth');
  if (bw) bw.value = String(defaultStroke);
  const bv = document.getElementById('brushWidthVal');
  if (bv) bv.textContent = String(defaultStroke);
}
// SVG cursor that looks like the brush will paint: a circle the size of the
// effective stroke, in the current colour, with the brush's opacity. Highlighter
// is translucent; pen/marker are solid. The crosshair in the middle marks the
// exact draw point.
// Each brush gets a visually distinct cursor so the user can tell at a glance
// which tool is active — not just a colour swatch. The hotspot is always at the
// point where the stroke will start (the chisel tip / pencil tip / dot centre).
function _drawBrushCursorUri() {
  const brush = defaultBrush || 'pen';
  const col = defaultColor || '#000000';
  const w = Math.max(1, Math.min(20, defaultStroke || 2));
  let svg, hx, hy, size;
  if (brush === 'highlighter') {
    // Chisel: an angled translucent rectangle (like a real highlighter tip).
    size = 30;
    hx = 4;
    hy = 6;
    svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
      `<g transform='rotate(-28 4 6)'>` +
      `<rect x='2' y='2' width='24' height='8' fill='${col}' fill-opacity='0.5' stroke='white' stroke-width='1'/>` +
      `</g>` +
      `<line x1='${hx - 3}' y1='${hy}' x2='${hx + 3}' y2='${hy}' stroke='white' stroke-width='1'/>` +
      `<line x1='${hx}' y1='${hy - 3}' x2='${hx}' y2='${hy + 3}' stroke='white' stroke-width='1'/></svg>`;
  } else if (brush === 'pencil') {
    // Slim angled tip pointing down-left.
    size = 20;
    hx = 3;
    hy = 17;
    svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
      `<polygon points='3,17 6,14 17,3 14,0 12,2 0,14' fill='${col}' fill-opacity='0.9' stroke='white' stroke-width='0.8'/>` +
      `<circle cx='${hx}' cy='${hy}' r='1.4' fill='white'/></svg>`;
  } else if (brush === 'marker') {
    // Solid fat dot — the chunky bold cousin of the pen.
    const r = Math.max(5, Math.min(14, w + 4));
    size = Math.ceil(r * 2) + 6;
    hx = size / 2;
    hy = size / 2;
    svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
      `<circle cx='${hx}' cy='${hy}' r='${r}' fill='${col}' stroke='white' stroke-width='1.5'/>` +
      `<line x1='${hx - 3}' y1='${hy}' x2='${hx + 3}' y2='${hy}' stroke='white' stroke-width='1'/>` +
      `<line x1='${hx}' y1='${hy - 3}' x2='${hx}' y2='${hy + 3}' stroke='white' stroke-width='1'/></svg>`;
  } else {
    // Pen: precise small dot + thin crosshair.
    const r = Math.max(2, Math.min(6, w / 2 + 1));
    size = Math.ceil(r * 2) + 10;
    hx = size / 2;
    hy = size / 2;
    svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
      `<circle cx='${hx}' cy='${hy}' r='${r}' fill='${col}' stroke='white' stroke-width='1'/>` +
      `<line x1='${hx - 5}' y1='${hy}' x2='${hx + 5}' y2='${hy}' stroke='white' stroke-width='1'/>` +
      `<line x1='${hx}' y1='${hy - 5}' x2='${hx}' y2='${hy + 5}' stroke='white' stroke-width='1'/></svg>`;
  }
  // Base64-encode the SVG — utf8 + encodeURIComponent occasionally produces
  // a URI Chromium silently rejects, falling back to the CSS crosshair (which
  // is why "cursor doesn't change per brush" even though the inline style is
  // set). Base64 avoids that entirely.
  return `url("data:image/svg+xml;base64,${btoa(svg)}") ${Math.round(hx)} ${Math.round(hy)}, crosshair`;
}
function _updateDrawCursor() {
  const wantCursor = currentTool === 'draw';
  const cur = wantCursor ? _drawBrushCursorUri() : '';
  document.querySelectorAll('.overlay').forEach((o) => {
    o.style.cursor = cur;
  });
  // Apply the brush cursor inside the WHOLE overlay — text spans and previously
  // drawn annotations are children of .overlay and would otherwise show their
  // own move/text cursor in draw mode, making it look like "the cursor doesn't
  // change for the tool".
  let s = document.getElementById('drawCursorStyle');
  if (!s) {
    s = document.createElement('style');
    s.id = 'drawCursorStyle';
    document.head.appendChild(s);
  }
  s.textContent = wantCursor
    ? `body.draw-mode .overlay, body.draw-mode .overlay * { cursor: ${cur} !important; }`
    : '';
}
(function () {
  document.querySelectorAll('.brush-pick').forEach((b) => {
    b.addEventListener('click', () => {
      defaultBrush = b.dataset.brush || 'pen';
      _syncBrushBar();
      _updateDrawCursor();
    });
  });
  document.querySelectorAll('.brush-bar .bb-swatch').forEach((s) => {
    s.addEventListener('click', () => {
      defaultColor = s.dataset.bcolor || '#000000';
      const dc = document.getElementById('defaultColor');
      if (dc) dc.value = defaultColor;
      _syncBrushBar();
      _updateDrawCursor();
    });
  });
  const cc = document.getElementById('brushCustomColor');
  if (cc)
    cc.addEventListener('input', (e) => {
      defaultColor = e.target.value;
      const dc = document.getElementById('defaultColor');
      if (dc) dc.value = defaultColor;
      _syncBrushBar();
      _updateDrawCursor();
    });
  const bw = document.getElementById('brushWidth');
  if (bw)
    bw.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      if (v >= 1 && v <= 20) {
        defaultStroke = v;
        _syncBrushBar();
        _updateDrawCursor();
      }
    });
})();

// ===== Form-field designer =====
// Drag-to-create a rectangle that becomes a real AcroForm field (text input or
// checkbox) in the saved PDF via pdf-lib's form API. Pick the subtype in the
// floating .field-bar (shown only in field-mode). Field name + default value
// can be tweaked in the side props panel after drawing.
let _fieldCounter = 0;
let currentFieldType = 'text';
(function () {
  document.querySelectorAll('.field-bar [data-fieldsub]').forEach((b) => {
    b.addEventListener('click', () => {
      currentFieldType = b.dataset.fieldsub || 'text';
      document
        .querySelectorAll('.field-bar [data-fieldsub]')
        .forEach((x) => x.classList.toggle('active', x === b));
    });
  });
  const first = document.querySelector('.field-bar [data-fieldsub="text"]');
  if (first) first.classList.add('active');
})();
function startField(overlay, pageNum, x0, y0, pointerId) {
  const el = document.createElement('div');
  el.className = 'annotation field-annotation';
  overlay.appendChild(el);
  // Sensible per-subtype defaults so newly dragged fields render and save
  // meaningfully even before the user touches the props panel.
  let defaultVal = '';
  if (currentFieldType === 'check') defaultVal = 'unchecked';
  else if (currentFieldType === 'toggle') defaultVal = 'off';
  else if (currentFieldType === 'button') defaultVal = 'Print';
  const ann = {
    type: 'field',
    subtype: currentFieldType,
    pageNum,
    x: x0,
    y: y0,
    width: 0,
    height: 0,
    fieldName: 'field_' + ++_fieldCounter,
    defaultValue: defaultVal,
    options:
      currentFieldType === 'dropdown' || currentFieldType === 'combobox' || currentFieldType === 'multiselect'
        ? ['Option 1', 'Option 2', 'Option 3']
        : undefined,
    fontSize: 12,
    el,
  };
  if (currentFieldType === 'button') ann.actionKind = 'print';
  if (currentFieldType === 'signature') ann.sigKind = 'simple';
  if (currentFieldType === 'date') ann.dateFormat = 'yyyy-mm-dd';
  if (currentFieldType === 'number') ann.numberFormat = 'plain';
  annotations.push(ann);
  renderFieldAnnotation(ann);
  try {
    overlay.setPointerCapture(pointerId);
  } catch (_) {}
  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const rect = overlay.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / currentZoom;
    const y = (ev.clientY - rect.top) / currentZoom;
    ann.x = Math.min(x0, x);
    ann.y = Math.min(y0, y);
    ann.width = Math.abs(x - x0);
    ann.height = Math.abs(y - y0);
    renderFieldAnnotation(ann);
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    overlay.removeEventListener('pointermove', onMove);
    overlay.removeEventListener('pointerup', onUp);
    overlay.removeEventListener('pointercancel', onUp);
    try {
      overlay.releasePointerCapture(pointerId);
    } catch (_) {}
    if (ann.width < 8 || ann.height < 8) {
      el.remove();
      const i = annotations.indexOf(ann);
      if (i >= 0) annotations.splice(i, 1);
      updateAnnotCount();
      return;
    }
    enableTextDrag(el, ann); // reuse: same el.style.left/top model
    _addFieldHandles(el, ann);
    _wireFieldQuickEdit(el, ann);
    updateAnnotCount();
    pushHistory('field-add');
    // Stay in field mode so the user can keep adding fields.
  };
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
}
const _FIELD_SUB_LABELS = {
  text: 'TXT',
  multiline: '¶',
  number: '#',
  date: 'DATE',
  check: 'CHK',
  dropdown: '▾',
  combobox: '▽',
  multiselect: '☰',
  toggle: '⇆',
  signature: '✒',
  button: '▶',
};

// AFNumber_Keystroke / AFNumber_Format argument tuples for the formats we
// expose in the UI. Argument order is: nDec, sepStyle, negStyle, currStyle,
// strCurrency, bCurrencyPrepend. We only vary nDec / currency / prepend.
function _numberFormatArgs(fmt) {
  switch (fmt) {
    case 'USD':
      return "2, 0, 0, 0, '$ ', true";
    case 'EUR':
      return "2, 0, 0, 0, ' €', false";
    case 'CZK':
      return "2, 0, 0, 0, ' Kč', false";
    case 'GBP':
      return "2, 0, 0, 0, '£ ', true";
    case 'percent':
      return "2, 0, 0, 0, '%', false";
    case 'integer':
      return "0, 0, 0, 0, '', false";
    default:
      return "2, 0, 0, 0, '', false"; // plain
  }
}

// Write /DA on a pdf-lib field's acroField dict at the desired font size, and
// also stamp it onto every widget the field has spawned via addToPage. We do
// this AFTER addToPage / setText so pdf-lib's auto-fit doesn't overwrite us.
function _writeFieldDA(f, fs) {
  try {
    const PDFName = PDFLib.PDFName;
    const PDFString = PDFLib.PDFString;
    const daStr = `0 0 0 rg /Helv ${fs} Tf`;
    f.acroField.dict.set(PDFName.of('DA'), PDFString.of(daStr));
    // Also widgets — some viewers read DA from the widget annotation rather
    // than walking up to the field.
    try {
      const widgets = f.acroField.getWidgets ? f.acroField.getWidgets() : [];
      for (const w of widgets) {
        try {
          w.dict.set(PDFName.of('DA'), PDFString.of(daStr));
        } catch (_) {}
      }
    } catch (_) {}
  } catch (e) {
    console.warn('[form] _writeFieldDA failed:', e && e.message);
  }
}

// Required (Ff bit 2), Tooltip (/TU), tab order ( /TI on widget — supported by
// some viewers; primary tab order is the spatial /Annots order set on save).
function _applyFieldExtras(f, ann, sub, doc, fs) {
  try {
    const PDFName = PDFLib.PDFName;
    const PDFString = PDFLib.PDFString;
    const dict = f.acroField.dict;
    // Required flag — Ff bit 2 (value 2). Preserve any existing flags.
    if (ann.required) {
      try {
        const cur = dict.get(PDFName.of('Ff'));
        const curN = cur && typeof cur.asNumber === 'function' ? cur.asNumber() : 0;
        dict.set(PDFName.of('Ff'), PDFLib.PDFNumber.of(curN | 2));
      } catch (_) {}
    }
    // Tooltip = /TU (alternate field name shown as tooltip in viewers).
    if (ann.tooltip) {
      try {
        dict.set(PDFName.of('TU'), PDFString.of(String(ann.tooltip)));
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[form] _applyFieldExtras failed:', e && e.message);
  }
}

// Action button → Named action (/Print, /ResetForm) or JS submitForm w/ mailto.
function _attachButtonAction(f, ann, doc) {
  try {
    const PDFName = PDFLib.PDFName;
    const PDFString = PDFLib.PDFString;
    const ctx = doc.context;
    const kind = ann.actionKind || 'print';
    let actionDict;
    if (kind === 'print') {
      actionDict = ctx.obj({ Type: PDFName.of('Action'), S: PDFName.of('Named'), N: PDFName.of('Print') });
    } else if (kind === 'clear') {
      actionDict = ctx.obj({ Type: PDFName.of('Action'), S: PDFName.of('ResetForm') });
    } else if (kind === 'submit') {
      const mailto = ann.submitTo
        ? `mailto:${ann.submitTo}?subject=${encodeURIComponent(ann.submitSubject || 'Form submission')}`
        : 'mailto:?subject=Form%20submission';
      const fAct = ctx.obj({ FS: PDFName.of('URL'), F: PDFString.of(mailto) });
      actionDict = ctx.obj({
        Type: PDFName.of('Action'),
        S: PDFName.of('SubmitForm'),
        F: fAct,
        Flags: PDFLib.PDFNumber.of(0),
      });
    } else if (kind === 'save') {
      actionDict = ctx.obj({ Type: PDFName.of('Action'), S: PDFName.of('Named'), N: PDFName.of('Save') });
    } else {
      return;
    }
    // Set on the widget annotation (where /A lives for push buttons), with /AA
    // U fallback so it fires on mouse-up.
    try {
      const widgets = f.acroField.getWidgets ? f.acroField.getWidgets() : [];
      for (const w of widgets) {
        try {
          w.dict.set(PDFName.of('A'), actionDict);
        } catch (_) {}
      }
    } catch (_) {}
    try {
      f.acroField.dict.set(PDFName.of('A'), actionDict);
    } catch (_) {}
  } catch (e) {
    console.warn('[form] _attachButtonAction failed:', e && e.message);
  }
}

function renderFieldAnnotation(ann) {
  const el = ann.el;
  el.style.left = ann.x + 'px';
  el.style.top = ann.y + 'px';
  el.style.width = Math.max(8, ann.width) + 'px';
  el.style.height = Math.max(8, ann.height) + 'px';
  el.style.transform = ann.rotation ? `rotate(${ann.rotation}deg)` : '';
  const sub = ann.subtype || 'text';
  el.dataset.sub = sub;
  const escName = escapeHtml(ann.fieldName || '');
  const escVal = escapeHtml(String(ann.defaultValue || ''));
  // Keep the visible content inside a child so re-renders don't wipe the
  // resize/rotate handles (which are direct children of el).
  let c = el.querySelector(':scope > .fa-content');
  if (!c) {
    c = document.createElement('div');
    c.className = 'fa-content';
    c.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;padding:2px 6px;gap:6px;pointer-events:none;box-sizing:border-box;font-size:11px;color:inherit;overflow:hidden;';
    el.insertBefore(c, el.firstChild);
  }
  if (sub === 'check') {
    c.innerHTML = `<span class="fa-type" style="margin:auto">${ann.defaultValue === 'checked' ? '☑' : '☐'}</span>`;
  } else if (sub === 'toggle') {
    const on = ann.defaultValue === 'on' || ann.defaultValue === true || ann.defaultValue === 'true';
    c.innerHTML = `<span class="fa-val">${on ? '● ON' : '○ OFF'}</span>`;
  } else if (sub === 'button') {
    const label =
      ann.defaultValue ||
      (ann.actionKind === 'submit'
        ? 'Submit'
        : ann.actionKind === 'clear'
          ? 'Clear'
          : ann.actionKind === 'save'
            ? 'Save'
            : 'Print');
    const kindIcon =
      ann.actionKind === 'submit'
        ? '📧'
        : ann.actionKind === 'clear'
          ? '⟲'
          : ann.actionKind === 'save'
            ? '💾'
            : '🖨';
    c.innerHTML = `<span class="fa-type">${kindIcon}</span><span class="fa-val">${escapeHtml(label)}</span>`;
  } else if (sub === 'signature') {
    const note = ann.sigKind === 'certified' ? 'Bank-ID / PAdES ✓' : 'Sign here';
    c.innerHTML = `<span class="fa-type">${_FIELD_SUB_LABELS.signature}</span><span class="fa-name">${escName || note}</span>`;
  } else if (sub === 'dropdown' || sub === 'combobox' || sub === 'multiselect') {
    const opts = Array.isArray(ann.options) ? ann.options : [];
    const preview = opts[0] || ann.defaultValue || '';
    c.innerHTML =
      `<span class="fa-type">${_FIELD_SUB_LABELS[sub]}</span><span class="fa-name">${escName}</span>` +
      (preview
        ? `<span class="fa-val">${escapeHtml(preview)}${opts.length > 1 ? ' +' + (opts.length - 1) : ''}</span>`
        : '');
  } else {
    c.innerHTML =
      `<span class="fa-type">${_FIELD_SUB_LABELS[sub] || 'TXT'}</span><span class="fa-name">${escName}</span>` +
      (escVal ? `<span class="fa-val">${escVal}</span>` : '');
  }
}
function recreateFieldAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation field-annotation';
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  renderFieldAnnotation(ann);
  enableTextDrag(el, ann);
  _addFieldHandles(el, ann);
  _wireFieldQuickEdit(el, ann);
  return ann;
}

// Double-click a field → jump straight to the most relevant editor in the
// props panel. For date that's the calendar picker; for everything else, the
// default-value / label control. Without this, users have to hunt around in
// the side panel for the right input every time.
function _wireFieldQuickEdit(el, ann) {
  el.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof selectAnnotation === 'function') {
      try {
        selectAnnotation(ann);
      } catch (_) {}
    }
    setTimeout(() => {
      const panel = document.getElementById('propsPanel');
      if (!panel) return;
      // Find the first text-like input in the panel and focus it. Date inputs
      // popping their native calendar on focus is what we're after for dates.
      let inp = panel.querySelector('input[type="date"]');
      if (!inp)
        inp = panel.querySelector(
          'input[type="text"], input[type="email"], input[type="number"], textarea, select'
        );
      if (inp) {
        inp.focus();
        if (inp.showPicker) {
          try {
            inp.showPicker();
          } catch (_) {}
        }
        if (inp.select) {
          try {
            inp.select();
          } catch (_) {}
        }
      }
    }, 50);
  });
}
// 4 corner resize handles + 1 rotation puck — so a form field can be tweaked
// after creation just like an image. (pdf-lib's addToPage accepts a rotation
// option, so saved fields preserve the angle in any PDF viewer.)
function _addFieldHandles(el, ann) {
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const h = document.createElement('div');
    h.className = 'img-handle ' + corner;
    // Visibility controlled by CSS via .field-annotation.selected — inline
    // opacity:1 here kept handles visible after deselect, which made it look
    // like the selection could never be cleared (see 016.jpg).
    el.appendChild(h);
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        h.setPointerCapture(e.pointerId);
      } catch (_) {}
      const sX = e.clientX,
        sY = e.clientY;
      const sw = ann.width,
        sh = ann.height,
        sx = ann.x,
        sy = ann.y;
      const onMove = (ev) => {
        const dx = (ev.clientX - sX) / currentZoom;
        const dy = (ev.clientY - sY) / currentZoom;
        let nx = sx,
          ny = sy,
          nw = sw,
          nh = sh;
        if (corner.includes('e')) nw = Math.max(20, sw + dx);
        if (corner.includes('w')) {
          nw = Math.max(20, sw - dx);
          nx = sx + (sw - nw);
        }
        if (corner.includes('s')) nh = Math.max(14, sh + dy);
        if (corner.includes('n')) {
          nh = Math.max(14, sh - dy);
          ny = sy + (sh - nh);
        }
        // Resize snap — like Canva: snap width / height to match neighbouring
        // objects' dimensions for a clean modern layout.
        const RTH = 8;
        for (const t of annotations) {
          if (t === ann || t.pageNum !== ann.pageNum) continue;
          if (selectedSet && selectedSet.has(t) && selectedSet.has(ann)) continue;
          const tb = annBoundingBox(t);
          if (!tb) continue;
          if (Math.abs(nw - tb.w) < RTH) {
            const wDelta = tb.w - nw;
            nw = tb.w;
            if (corner.includes('w')) nx -= wDelta; // anchor opposite edge
          }
          if (Math.abs(nh - tb.h) < RTH) {
            const hDelta = tb.h - nh;
            nh = tb.h;
            if (corner.includes('n')) ny -= hDelta;
          }
        }
        ann.x = nx;
        ann.y = ny;
        ann.width = nw;
        ann.height = nh;
        renderFieldAnnotation(ann);
        if (selected === ann) positionPropsPanel(ann);
        // Live distance guides during resize too.
        const overlay = ann.el && ann.el.parentElement;
        if (typeof showDistanceGuides === 'function' && overlay) {
          hideAlignmentGuides();
          showDistanceGuides(overlay, ann, nx, ny, nw, nh);
        }
      };
      const onUp = (ev) => {
        h.removeEventListener('pointermove', onMove);
        h.removeEventListener('pointerup', onUp);
        try {
          h.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        hideAlignmentGuides();
        pushHistory('field-resize');
      };
      h.addEventListener('pointermove', onMove);
      h.addEventListener('pointerup', onUp);
    });
  });
  const rot = document.createElement('div');
  rot.className = 'rot-handle';
  rot.title = 'Drag to rotate';
  el.appendChild(rot);
  rot.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      rot.setPointerCapture(e.pointerId);
    } catch (_) {}
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    const onMove = (ev) => {
      let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      ann.rotation = Math.round((a + 360) % 360);
      el.style.transform = `rotate(${ann.rotation}deg)`;
      if (selected === ann) positionPropsPanel(ann);
    };
    const onUp = (ev) => {
      rot.removeEventListener('pointermove', onMove);
      rot.removeEventListener('pointerup', onUp);
      try {
        rot.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      pushHistory('field-rotate');
    };
    rot.addEventListener('pointermove', onMove);
    rot.addEventListener('pointerup', onUp);
  });
}

// Brush presets for free-draw. Pen = solid; pencil = thin & faint; highlighter =
// wide, translucent, multiply-blended (tints the text under it); marker = thick.
function _brushStyle(ann) {
  const base = ann.strokeWidth || 2;
  switch (ann.brush) {
    case 'pencil':
      return { width: Math.max(1, base * 0.8), opacity: 0.8, cap: 'round', blend: 'normal' };
    case 'highlighter':
      return { width: Math.max(10, base * 4), opacity: 0.4, cap: 'round', blend: 'multiply' }; // round cap, not butt — butt caps on multi-segment polylines leave triangular seams at every joint (see 015.jpg)
    case 'marker':
      return { width: Math.max(4, base * 2), opacity: 0.95, cap: 'round', blend: 'normal' };
    case 'pen':
    default:
      return { width: base, opacity: 1, cap: 'round', blend: 'normal' };
  }
}

const fileInput = document.getElementById('fileInput'),
  dropzone = document.getElementById('dropzone');
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadPDF(e.target.files[0]);
});
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) loadPDF(f);
  else showToast(window.t('toast.dropPdf', 'Please drop a PDF file.'), 'error');
});

// Drop a PDF anywhere on the window to open it — works even when a document is
// already open (with an unsaved-edits guard). A full-window overlay gives a
// clear "release to open" target. Modal/image drop zones call stopPropagation,
// so they keep their own behaviour and never reach this document-level handler.
let _fileDropOverlay = null;
let _fileDragDepth = 0;
function _isFileDrag(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}
function _ensureFileDropOverlay() {
  if (_fileDropOverlay) return _fileDropOverlay;
  const el = document.createElement('div');
  el.id = 'fileDropOverlay';
  el.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;' +
    'background:rgba(37,99,235,0.12);backdrop-filter:blur(2px);pointer-events:none;';
  const card = document.createElement('div');
  card.style.cssText =
    'background:var(--surface,#fff);color:var(--text,#0f172a);border:2px dashed var(--accent,#2563eb);' +
    'border-radius:16px;padding:28px 40px;font-size:18px;font-weight:700;box-shadow:0 20px 60px rgba(0,0,0,0.25);';
  card.textContent = '📄  ' + window.t('drop.release', 'Release to open this PDF');
  el.appendChild(card);
  document.body.appendChild(el);
  _fileDropOverlay = el;
  return el;
}
document.addEventListener('dragenter', (e) => {
  if (!_isFileDrag(e)) return;
  _fileDragDepth++;
  _ensureFileDropOverlay().style.display = 'flex';
});
document.addEventListener('dragover', (e) => {
  if (_isFileDrag(e)) e.preventDefault();
});
document.addEventListener('dragleave', (e) => {
  if (!_isFileDrag(e)) return;
  _fileDragDepth = Math.max(0, _fileDragDepth - 1);
  if (_fileDragDepth === 0 && _fileDropOverlay) _fileDropOverlay.style.display = 'none';
});
document.addEventListener('drop', (e) => {
  if (!_isFileDrag(e)) return;
  e.preventDefault();
  _fileDragDepth = 0;
  if (_fileDropOverlay) _fileDropOverlay.style.display = 'none';
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast(window.t('toast.dropPdf', 'Please drop a PDF file.'), 'error');
    return;
  }
  if (
    pdfJsDoc &&
    annotations.length &&
    !confirm(
      window.t('drop.confirmReplace', 'Open this PDF? Unsaved edits to the current document will be lost.')
    )
  )
    return;
  loadPDF(f);
});

async function loadPDF(file) {
  await workerReady;
  // Opening a real file → not a freshly-created blank, so the
  // "looks like a scan" banner should work normally if applicable.
  _isBlankPdf = false;
  try {
    let buf = await file.arrayBuffer();
    // Sniff .pdfenc header — if it's our own AES envelope, prompt for password and decrypt first.
    const sniff = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
    const magic = new TextDecoder().decode(sniff);
    if (magic === 'PDFMINIE' || /\.pdfenc$/i.test(file.name)) {
      try {
        buf = await _promptAndDecryptPdfenc(new Uint8Array(buf));
        if (!buf) return; // user cancelled
        // Drop the .pdfenc suffix from the displayed name
        file = new File([buf], file.name.replace(/\.pdfenc$/i, '.pdf'), { type: 'application/pdf' });
      } catch (e) {
        showToast("Couldn't decrypt this file: " + (e.message || e), 'error');
        return;
      }
    }
    pdfBytes = buf;
    pdfFileName = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    pdfJsDoc = await loadPdfJsDoc(buf.slice(0));
    annotations = [];
    selected = null;
    // Drop any metadata edits from the previous file — otherwise opening a new
    // PDF inherits the prior file's Title / Author / Subject / Keywords.
    window.sessionMetadata = null;
    // Clear OCR cache so OCR results from a previous PDF don't bleed into
    // this one (re-injected via _reapplyOcrCache on every page render).
    window._ocrCache = {};
    if (activeEditor) commitEditor(false);
    hidePropsPanel();
    document.getElementById('statusPages').textContent = pdfJsDoc.numPages;
    document.getElementById('fileInfo').textContent =
      file.name +
      ' · ' +
      window
        .t(
          pdfJsDoc.numPages === 1 ? 'pages.one' : 'pages.many',
          pdfJsDoc.numPages + ' page' + (pdfJsDoc.numPages === 1 ? '' : 's')
        )
        .replace('{n}', pdfJsDoc.numPages);
    await renderPages();
    dropzone.style.display = 'none';
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('printBtn').disabled = false;
    document.getElementById('organizeBtn').disabled = false;
    if (typeof _enableMainPdfTools === 'function') _enableMainPdfTools();
    document.getElementById('zoomBar').style.display = 'flex';
    updateAnnotCount();
    setContext(currentTool);
    if (typeof clearHistory === 'function') clearHistory();
  } catch (err) {
    console.error('[loadPDF]', err);
    const msg = err && err.message ? err.message : '';
    if (/password/i.test(msg))
      showToast(
        window.t('toast.passwordProtected', 'This PDF is password-protected. Please unlock it first.'),
        'error'
      );
    else if (/invalid/i.test(msg) || /corrupt/i.test(msg))
      showToast(window.t('toast.corruptPdf', 'This PDF appears to be corrupt or non-standard.'), 'error');
    else
      showToast(
        window.t('toast.openFail', 'Could not open this PDF:') +
          ' ' +
          (msg || window.t('toast.unknownErr', 'unknown error')),
        'error'
      );
  }
}
