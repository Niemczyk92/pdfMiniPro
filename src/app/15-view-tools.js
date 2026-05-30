// =====================================================================
// =====================  UX POLISH FEATURES  ==========================
// =====================================================================

// --- Keyboard nudge: arrow keys move selected annotations ---
document.addEventListener('keydown', (e) => {
  const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const d = ARROWS[e.key];
  if (!d) return;
  const ce = document.activeElement?.isContentEditable;
  const inp = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
  if (ce || inp) return;
  if (!selectedSet || !selectedSet.size) return;
  e.preventDefault();
  const step = e.shiftKey ? 10 : 1;
  const dx = d[0] * step,
    dy = d[1] * step;
  for (const a of selectedSet) {
    if (a.locked) continue;
    const snap = snapshotPos(a);
    applyMoveDelta(a, snap, dx, dy);
  }
  if (selected) positionPropsPanel(selected);
  pushHistory('nudge');
});

// ===== View tools: ruler · grid · measurement units =====
// Units are derived from the PDF's real geometry. The overlay is rendered at
// RENDER_SCALE (px = pt·4/3), so 1 overlay px == 1 CSS px == 1 "px" unit, and
// pt/in/mm/cm follow from there. Grid + ruler live inside the (zoom-scaled)
// overlay, so they stay aligned to page coordinates without re-rendering on zoom.
let viewUnit = 'mm',
  showRuler = false,
  showGrid = false;
const RULER_STRIP = 14; // overlay px
const _UNIT_STEPS = {
  mm: { major: 50, minor: 10 },
  cm: { major: 5, minor: 1 },
  in: { major: 1, minor: 0.25 },
  px: { major: 100, minor: 20 },
  pt: { major: 72, minor: 18 },
};
const _GRID_UNIT = { mm: 10, cm: 1, in: 0.5, px: 50, pt: 36 };
function _pxToUnit(px, unit) {
  const pt = px / RENDER_SCALE;
  switch (unit) {
    case 'px':
      return px;
    case 'pt':
      return pt;
    case 'in':
      return pt / 72;
    case 'cm':
      return (pt * 2.54) / 72;
    case 'mm':
    default:
      return (pt * 25.4) / 72;
  }
}
function _unitToPx(val, unit) {
  switch (unit) {
    case 'px':
      return val;
    case 'pt':
      return val * RENDER_SCALE;
    case 'in':
      return val * 72 * RENDER_SCALE;
    case 'cm':
      return (val / 2.54) * 72 * RENDER_SCALE;
    case 'mm':
    default:
      return (val / 25.4) * 72 * RENDER_SCALE;
  }
}
function _buildRulerSvg(w, h) {
  const st = _UNIT_STEPS[viewUnit] || _UNIT_STEPS.mm;
  const minorPx = _unitToPx(st.minor, viewUnit);
  const perMajor = Math.max(1, Math.round(st.major / st.minor));
  const dec = viewUnit === 'in' ? 1 : 0;
  let t = '';
  if (minorPx >= 2) {
    for (let k = 0, x = 0; x <= w + 0.5; k++, x = k * minorPx) {
      const major = k % perMajor === 0;
      t += `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${major ? RULER_STRIP : RULER_STRIP * 0.5}" stroke="#64748b" stroke-width="0.5"/>`;
      if (major && x > 1)
        t += `<text x="${(x + 1.5).toFixed(1)}" y="${RULER_STRIP - 4}" font-size="7" fill="#334155" font-family="monospace">${_pxToUnit(x, viewUnit).toFixed(dec)}</text>`;
    }
    for (let k = 0, y = 0; y <= h + 0.5; k++, y = k * minorPx) {
      const major = k % perMajor === 0;
      t += `<line x1="0" y1="${y.toFixed(1)}" x2="${major ? RULER_STRIP : RULER_STRIP * 0.5}" y2="${y.toFixed(1)}" stroke="#64748b" stroke-width="0.5"/>`;
      if (major && y > 1)
        t += `<text x="${RULER_STRIP - 3}" y="${(y - 2).toFixed(1)}" font-size="7" fill="#334155" font-family="monospace" text-anchor="end" transform="rotate(-90 ${RULER_STRIP - 3} ${(y - 2).toFixed(1)})">${_pxToUnit(y, viewUnit).toFixed(dec)}</text>`;
    }
  }
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;overflow:visible">` +
    `<rect x="0" y="0" width="${w}" height="${RULER_STRIP}" fill="rgba(248,250,252,0.92)"/>` +
    `<rect x="0" y="0" width="${RULER_STRIP}" height="${h}" fill="rgba(248,250,252,0.92)"/>` +
    `<rect x="0" y="0" width="${RULER_STRIP}" height="${RULER_STRIP}" fill="rgba(226,232,240,0.95)"/>` +
    t +
    `</svg>`
  );
}
function updateViewOverlays() {
  document.querySelectorAll('.page-wrapper').forEach((wrapper) => {
    const overlay = wrapper.querySelector('.overlay');
    if (!overlay) return;
    const w = parseFloat(wrapper.dataset.baseW) || overlay.offsetWidth || 0;
    const h = parseFloat(wrapper.dataset.baseH) || overlay.offsetHeight || 0;
    let g = overlay.querySelector('.grid-layer');
    if (showGrid) {
      if (!g) {
        g = document.createElement('div');
        g.className = 'grid-layer';
        g.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
        overlay.insertBefore(g, overlay.firstChild);
      }
      const step = _unitToPx(_GRID_UNIT[viewUnit] || _GRID_UNIT.mm, viewUnit);
      g.style.backgroundImage =
        'linear-gradient(to right, rgba(37,99,235,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.16) 1px, transparent 1px)';
      g.style.backgroundSize = step + 'px ' + step + 'px';
    } else if (g) {
      g.remove();
    }
    let r = overlay.querySelector('.ruler-layer');
    if (showRuler) {
      if (!r) {
        r = document.createElement('div');
        r.className = 'ruler-layer';
        r.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;';
        overlay.appendChild(r);
      }
      r.innerHTML = _buildRulerSvg(w, h);
    } else if (r) {
      r.remove();
    }
  });
}
function _syncViewButtons() {
  const set = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!on);
  };
  set('rulerToggle', showRuler);
  set('gridToggle', showGrid);
  set('measureToggle', measureMode);
}
(function () {
  const rb = document.getElementById('rulerToggle'),
    gb = document.getElementById('gridToggle'),
    mb = document.getElementById('measureToggle'),
    us = document.getElementById('unitSelect');
  if (rb)
    rb.addEventListener('click', () => {
      showRuler = !showRuler;
      updateViewOverlays();
      _syncViewButtons();
    });
  if (gb)
    gb.addEventListener('click', () => {
      showGrid = !showGrid;
      updateViewOverlays();
      _syncViewButtons();
    });
  if (mb)
    mb.addEventListener('click', () => {
      setMeasureMode(!measureMode);
    });
  if (us)
    us.addEventListener('change', (e) => {
      viewUnit = e.target.value;
      updateViewOverlays();
    });
})();
// Re-apply grid/ruler after any (re)render — renderPages rebuilds the overlays.
if (typeof renderPages === 'function') {
  const _origRenderPages_view = renderPages;
  renderPages = async function () {
    const out = await _origRenderPages_view.apply(this, arguments);
    try {
      if (showGrid || showRuler) updateViewOverlays();
    } catch (_) {}
    try {
      if (typeof _updateDrawCursor === 'function') _updateDrawCursor();
    } catch (_) {}
    return out;
  };
}

// ===== Reading ruler — a movable, rotatable straightedge over the document =====
// Purely an on-screen reading aid (like laying a physical ruler on paper to keep
// your eye on a line). It is a single viewport-fixed element, NOT an annotation,
// so it is never serialized and never exported/printed. Drag the band to move it,
// drag the round handle at either end to rotate, double-click to snap level.
(function () {
  const btn = document.getElementById('readingRulerToggle');
  if (!btn) return;
  let el = null,
    angle = 0;
  const center = { x: 0, y: 0 };
  let width = 680;
  const HEIGHT = 44;

  // one-time styles (cursors / hover) — geometry stays inline so it can be live-updated
  if (!document.getElementById('readingRulerCss')) {
    const s = document.createElement('style');
    s.id = 'readingRulerCss';
    s.textContent =
      '#readingRuler{position:fixed;z-index:6000;touch-action:none;will-change:transform;}' +
      // In drawing/marking modes the ruler must NOT eat pointer events — otherwise
      // you can't draw along it. It stays visible as a guide and strokes snap to it;
      // switch to Select to move/rotate it.
      'body.draw-mode #readingRuler,body.shape-mode #readingRuler,body.highlight-mode #readingRuler,body.underline-mode #readingRuler,body.strike-mode #readingRuler{pointer-events:none;}' +
      '#readingRuler .rr-band{position:absolute;inset:0;border-radius:6px;cursor:grab;' +
      'background:linear-gradient(180deg,rgba(255,196,0,0.10),rgba(255,196,0,0.22) 50%,rgba(255,196,0,0.10));' +
      'border-top:1px solid rgba(180,120,0,0.35);border-bottom:1px solid rgba(180,120,0,0.35);' +
      'box-shadow:0 1px 4px rgba(0,0,0,0.12);}' +
      '#readingRuler.dragging .rr-band{cursor:grabbing;}' +
      '#readingRuler .rr-line{position:absolute;left:0;right:0;top:50%;height:0;' +
      'border-top:2px solid rgba(214,40,40,0.85);pointer-events:none;}' +
      '#readingRuler .rr-ticks{position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;opacity:0.5;}' +
      '#readingRuler .rr-rot{position:absolute;top:50%;width:22px;height:22px;margin-top:-11px;border-radius:50%;' +
      'background:#fff;border:2px solid rgba(214,40,40,0.85);cursor:crosshair;display:flex;align-items:center;' +
      'justify-content:center;font-size:12px;color:#d62828;box-shadow:0 1px 3px rgba(0,0,0,0.2);}' +
      '#readingRuler .rr-rot.l{left:-11px;}#readingRuler .rr-rot.r{right:-11px;}';
    document.head.appendChild(s);
  }

  function apply() {
    if (!el) return;
    el.style.width = width + 'px';
    el.style.height = HEIGHT + 'px';
    el.style.left = center.x - width / 2 + 'px';
    el.style.top = center.y - HEIGHT / 2 + 'px';
    el.style.transform = 'rotate(' + angle + 'deg)';
  }
  function buildTicks() {
    let t = '';
    for (let x = 0; x <= width; x += 20) {
      const major = x % 100 === 0;
      t +=
        '<line x1="' +
        x +
        '" y1="0" x2="' +
        x +
        '" y2="' +
        (major ? 10 : 6) +
        '" stroke="#9a6b00" stroke-width="1"/>';
      t +=
        '<line x1="' +
        x +
        '" y1="' +
        HEIGHT +
        '" x2="' +
        x +
        '" y2="' +
        (HEIGHT - (major ? 10 : 6)) +
        '" stroke="#9a6b00" stroke-width="1"/>';
    }
    return (
      '<svg class="rr-ticks" viewBox="0 0 ' +
      width +
      ' ' +
      HEIGHT +
      '" preserveAspectRatio="none" width="' +
      width +
      '" height="' +
      HEIGHT +
      '">' +
      t +
      '</svg>'
    );
  }
  function show() {
    const vw = window.innerWidth,
      vh = window.innerHeight;
    width = Math.max(360, Math.min(900, Math.round(vw * 0.6)));
    center.x = vw / 2;
    center.y = Math.round(vh * 0.45);
    angle = 0;
    el = document.createElement('div');
    el.id = 'readingRuler';
    el.innerHTML =
      buildTicks() +
      '<div class="rr-band"></div><div class="rr-line"></div>' +
      '<div class="rr-rot l" title="Drag to rotate">⟲</div>' +
      '<div class="rr-rot r" title="Drag to rotate">⟳</div>';
    document.body.appendChild(el);
    apply();
    wireDrag();
    btn.classList.add('active');
  }
  function hide() {
    if (el) {
      el.remove();
      el = null;
    }
    btn.classList.remove('active');
  }
  function wireDrag() {
    const band = el.querySelector('.rr-band');
    // move
    band.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      const sx = e.clientX,
        sy = e.clientY,
        cx0 = center.x,
        cy0 = center.y;
      el.classList.add('dragging');
      band.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        center.x = cx0 + (ev.clientX - sx);
        center.y = cy0 + (ev.clientY - sy);
        apply();
      };
      const up = (ev) => {
        el.classList.remove('dragging');
        band.releasePointerCapture(e.pointerId);
        band.removeEventListener('pointermove', mv);
        band.removeEventListener('pointerup', up);
      };
      band.addEventListener('pointermove', mv);
      band.addEventListener('pointerup', up);
    });
    // double-click to snap back to level
    band.addEventListener('dblclick', () => {
      angle = 0;
      apply();
    });
    // rotate (either handle) — angle from centre to pointer
    el.querySelectorAll('.rr-rot').forEach((h) => {
      h.addEventListener('pointerdown', (e) => {
        if (e.button) return;
        e.preventDefault();
        e.stopPropagation();
        h.setPointerCapture(e.pointerId);
        const mv = (ev) => {
          let a = (Math.atan2(ev.clientY - center.y, ev.clientX - center.x) * 180) / Math.PI;
          if (h.classList.contains('l')) a += 180; // left handle points the other way
          if (ev.shiftKey) a = Math.round(a / 15) * 15; // Shift = 15° snaps
          angle = a;
          apply();
        };
        const up = (ev) => {
          h.releasePointerCapture(e.pointerId);
          h.removeEventListener('pointermove', mv);
          h.removeEventListener('pointerup', up);
        };
        h.addEventListener('pointermove', mv);
        h.addEventListener('pointerup', up);
      });
    });
  }
  btn.addEventListener('click', () => {
    el ? hide() : show();
  });
  // Esc hides it when active
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el) hide();
  });
  // Expose the guide line (viewport coords) so free-draw can snap strokes to it.
  window._readingRulerLine = () => (el ? { cx: center.x, cy: center.y, angleDeg: angle } : null);
})();

// ===== Measure / ruler tool (press M) =====
// A transient on-screen ruler: drag on a page to measure. Distance is derived
// from the PDF's real geometry; the readout uses the unit chosen in the View bar.
// For scaled drawings (1:100…), double-click a measurement and type its real length.
let measureMode = false;
let measureCal = { factor: 1 };
let _measureState = null;
function setMeasureMode(on) {
  measureMode = !!on;
  document.querySelectorAll('.overlay').forEach((o) => (o.style.cursor = measureMode ? 'crosshair' : ''));
  if (!measureMode) {
    document.querySelectorAll('.measure-layer').forEach((l) => l.remove());
    _measureState = null;
  }
  if (typeof _syncViewButtons === 'function') _syncViewButtons();
  showToast(
    measureMode
      ? window.t(
          'measure.on',
          'Measure: drag on the page. Double-click a measurement to set its real length. Esc to exit.'
        )
      : window.t('measure.off', 'Measure mode off.'),
    'info'
  );
}
function _measFmt(px) {
  const val = _pxToUnit(px, viewUnit) * measureCal.factor;
  const dec = viewUnit === 'in' || viewUnit === 'cm' ? 2 : viewUnit === 'px' || viewUnit === 'pt' ? 0 : 1;
  return val.toFixed(dec) + ' ' + viewUnit;
}
function _measureLayer(overlay) {
  let l = overlay.querySelector('.measure-layer');
  if (!l) {
    l = document.createElement('div');
    l.className = 'measure-layer';
    l.style.cssText = 'position:absolute;inset:0;z-index:60;pointer-events:none;';
    overlay.appendChild(l);
  }
  return l;
}
function _measDraw(s, x1, y1) {
  const dx = x1 - s.x0,
    dy = y1 - s.y0;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  s.line.style.cssText =
    'position:absolute;height:0;border-top:2px solid #2563eb;transform-origin:0 0;left:' +
    s.x0 +
    'px;top:' +
    s.y0 +
    'px;width:' +
    len +
    'px;transform:rotate(' +
    ang +
    'deg);';
  s.label.style.left = (s.x0 + x1) / 2 + 'px';
  s.label.style.top = (s.y0 + y1) / 2 + 'px';
  s.label.textContent = _measFmt(len);
  s.len = len;
}
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!measureMode) return;
    const overlay = e.target.closest && e.target.closest('.overlay');
    if (!overlay) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom,
      y = (e.clientY - rect.top) / currentZoom;
    const layer = _measureLayer(overlay);
    layer.innerHTML = '';
    const line = document.createElement('div');
    const label = document.createElement('div');
    label.style.cssText =
      'position:absolute;background:#2563eb;color:#fff;font:600 11px/1.2 monospace;padding:2px 6px;border-radius:6px;transform:translate(-50%,-50%);white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);';
    layer.appendChild(line);
    layer.appendChild(label);
    _measureState = { overlay, x0: x, y0: y, line, label, len: 0 };
    _measDraw(_measureState, x, y);
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch (_) {}
  },
  true
);
document.addEventListener(
  'pointermove',
  (e) => {
    if (!measureMode || !_measureState) return;
    const rect = _measureState.overlay.getBoundingClientRect();
    _measDraw(_measureState, (e.clientX - rect.left) / currentZoom, (e.clientY - rect.top) / currentZoom);
  },
  true
);
document.addEventListener(
  'pointerup',
  (e) => {
    if (!measureMode || !_measureState) return;
    const s = _measureState;
    try {
      s.overlay.releasePointerCapture(e.pointerId);
    } catch (_) {}
    // Let the user calibrate by double-clicking the finished measurement label.
    s.label.style.pointerEvents = 'auto';
    s.label.style.cursor = 'pointer';
    s.label.title = window.t('measure.calibHint', 'Double-click to set this segment’s real length');
    s.label.ondblclick = (ev) => {
      ev.stopPropagation();
      const v = prompt(
        window
          .t('measure.prompt', 'Real length of this segment, in {u} (current: {cur}):')
          .replace('{u}', viewUnit)
          .replace('{cur}', _measFmt(s.len))
      );
      if (!v) return;
      const val = parseFloat(v.replace(',', '.'));
      if (!(val > 0)) return;
      const natural = _pxToUnit(s.len, viewUnit); // before factor
      measureCal.factor = val / natural;
      s.label.textContent = _measFmt(s.len);
      showToast(
        window.t('measure.calibrated', 'Scale calibrated — measurements now use this ratio.'),
        'success'
      );
    };
    _measureState = null;
  },
  true
);

// --- Z-order: bring to front / send to back ---
function bringToFront(ann) {
  const overlay = ann.el && ann.el.parentElement;
  if (!overlay) return;
  const i = annotations.indexOf(ann);
  if (i < 0) return;
  annotations.splice(i, 1);
  annotations.push(ann);
  overlay.appendChild(ann.el); // moves to end of overlay (top of stack)
  pushHistory('z-front');
}
function sendToBack(ann) {
  const overlay = ann.el && ann.el.parentElement;
  if (!overlay) return;
  const i = annotations.indexOf(ann);
  if (i < 0) return;
  annotations.splice(i, 1);
  // Whiteouts must always be at the very bottom of annotations[] so they draw first in PDF;
  // we insert right after them.
  let insertAt = 0;
  while (insertAt < annotations.length && annotations[insertAt].type === 'whiteout') insertAt++;
  annotations.splice(insertAt, 0, ann);
  // DOM: move el to be the FIRST child of overlay (so other annotations paint on top)
  if (overlay.firstChild && overlay.firstChild !== ann.el) {
    overlay.insertBefore(ann.el, overlay.firstChild);
  }
  pushHistory('z-back');
}

// --- Locked objects: prevent drag/resize/rotate; click still selects so user can unlock ---
function setAnnotationLocked(ann, locked) {
  ann.locked = !!locked;
  if (ann.el) ann.el.classList.toggle('ann-locked', !!locked);
  pushHistory(locked ? 'lock' : 'unlock');
}

// --- Object groups: annotations sharing the same groupId move together ---
let _groupCounter = 0;
function groupSelection() {
  _healSelection();
  if (selectedSet.size < 2) {
    showToast('Select at least 2 objects to group (Shift-click).', 'warn');
    return;
  }
  const id = 'g_' + Date.now() + '_' + ++_groupCounter;
  for (const a of selectedSet) {
    a.groupId = id;
    if (a.el) a.el.classList.add('ann-grouped');
  }
  pushHistory('group');
  showToast(`Grouped ${selectedSet.size} object${selectedSet.size === 1 ? '' : 's'}.`, 'success');
  buildPropsPanel(selected);
  positionPropsPanel(selected);
}
function ungroupSelection() {
  _healSelection();
  if (!selectedSet.size) return;
  const ids = new Set();
  for (const a of selectedSet) if (a.groupId) ids.add(a.groupId);
  if (!ids.size) {
    showToast('Selection is not grouped.', 'warn');
    return;
  }
  let n = 0;
  for (const a of annotations) {
    if (a.groupId && ids.has(a.groupId)) {
      delete a.groupId;
      if (a.el) a.el.classList.remove('ann-grouped');
      n++;
    }
  }
  pushHistory('ungroup');
  showToast(`Ungrouped ${n} object${n === 1 ? '' : 's'}.`, 'success');
  buildPropsPanel(selected);
  positionPropsPanel(selected);
}
// Expand selection: if a single annotation in a group is clicked, pull its peers in.
const _origSelect = select;
select = function (ann, opts) {
  const result = _origSelect(ann, opts);
  if (ann && ann.groupId && !(opts && opts.additive) && !(opts && opts.noGroupExpand)) {
    for (const peer of annotations) {
      if (peer !== ann && peer.groupId === ann.groupId) {
        selectedSet.add(peer);
        if (peer.el) peer.el.classList.add('selected');
      }
    }
    if (selectedSet.size > 1) buildPropsPanel(selected);
  }
  return result;
};
// Document-level lock guard — runs in capture phase BEFORE the per-annotation drag/handle
// listeners. Per-type drag handlers use a mix of pointerdown AND mousedown, so we must guard
// both event types. We stopImmediatePropagation but DO NOT preventDefault, so the browser
// still synthesises a click event → annotation gets selected for the props panel.
let _lockWarnAt = 0;
function _findLockedAnn(target) {
  if (!target || !target.closest) return null;
  const annEl = target.closest('.annotation');
  if (!annEl) return null;
  const ann = annotations.find((a) => a.el === annEl);
  return ann && ann.locked ? ann : null;
}
function _lockGuard(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const ann = _findLockedAnn(e.target);
  if (!ann) return;
  e.stopImmediatePropagation();
  // Only show the toast for handle interactions (where user expected the action),
  // but throttle to once per second so dragging across a locked object isn't spammy.
  const isHandle =
    e.target.classList &&
    (e.target.classList.contains('img-handle') ||
      e.target.classList.contains('rot-handle') ||
      e.target.classList.contains('shape-handle') ||
      e.target.classList.contains('endpoint-handle'));
  if (isHandle && Date.now() - _lockWarnAt > 800) {
    _lockWarnAt = Date.now();
    showToast('Object is locked. Unlock it first.', 'warn');
  }
}
document.addEventListener('pointerdown', _lockGuard, true);
document.addEventListener('mousedown', _lockGuard, true);
document.addEventListener('touchstart', _lockGuard, { capture: true, passive: false });
// Click still bubbles → select the locked annotation so user can unlock it
document.addEventListener(
  'click',
  (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const ann = _findLockedAnn(e.target);
    if (!ann) return;
    if (typeof select === 'function') select(ann);
  },
  true
);

// Belt-and-suspenders: applyMoveDelta also skips locked annotations.
const _origApplyMoveDelta = applyMoveDelta;
applyMoveDelta = function (a, snap, dx, dy) {
  if (a.locked) return;
  return _origApplyMoveDelta(a, snap, dx, dy);
};

// --- Recently used colours ---
const RECENT_COLORS_KEY = 'pdfMiniPro.recentColors.v1';
function getRecentColors() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_COLORS_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function rememberColor(hex) {
  if (!hex || !/^#[0-9a-f]{3,8}$/i.test(hex)) return;
  hex = hex.toLowerCase();
  let list = getRecentColors().filter((c) => c.toLowerCase() !== hex);
  list.unshift(hex);
  if (list.length > 8) list.length = 8;
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(list));
  } catch (_) {}
}
// Patch any global color input change to remember the colour
document.addEventListener(
  'input',
  (e) => {
    if (!e.target || e.target.type !== 'color') return;
    rememberColor(e.target.value);
  },
  true
);

// --- Document statistics ---
function buildAnnotStats() {
  const byType = {};
  for (const a of annotations) {
    const key = a.type === 'shape' ? `shape:${a.shape}` : a.type;
    byType[key] = (byType[key] || 0) + 1;
  }
  return byType;
}
// PDF date strings look like "D:20260410120000+02'00'" — format to something readable.
function _fmtPdfDate(s) {
  if (!s) return '';
  const m = /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(String(s));
  if (!m) return String(s);
  const [, Y, Mo, D, H, Mi, S] = m;
  let out = Y + (Mo ? '-' + Mo : '') + (D ? '-' + D : '');
  if (H) out += ' ' + H + (Mi ? ':' + Mi : '') + (S ? ':' + S : '');
  return out;
}
async function openStatsModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const modal = document.getElementById('statsModal');
  const body = document.getElementById('statsBody');
  const sizeMB = pdfBytes ? ((pdfBytes.byteLength || pdfBytes.length || 0) / 1048576).toFixed(2) : '–';
  const stats = buildAnnotStats();
  const totalAnn = Object.values(stats).reduce((a, b) => a + b, 0);
  const totalTextItems = pdfTotalTextItems || 0;
  // Initial render with placeholders for async values
  const tt = (k, fb) => window.t(k, fb);
  const hasFormStr = acroFormFields.length
    ? acroFormFields.length + ' ' + tt('stats.fields', 'fields')
    : tt('stats.no', 'no');
  body.innerHTML = `
    <div class="stat-row"><span>${tt('stats.fileName', 'File name')}</span><strong>${pdfFileName || '—'}</strong></div>
    <div class="stat-row"><span>${tt('stats.fileSize', 'File size')}</span><strong>${sizeMB} MB</strong></div>
    <div class="stat-row"><span>${tt('stats.pages', 'Pages')}</span><strong>${pdfJsDoc.numPages}</strong></div>
    <div class="stat-row"><span>${tt('stats.pageSize', 'Page size (1st page)')}</span><strong id="statsDims">—</strong></div>
    <div class="stat-row"><span>${tt('stats.pdfVer', 'PDF version')}</span><strong id="statsVer">—</strong></div>
    <hr>
    <div class="stat-row" style="font-weight:700;color:var(--muted)"><span>${tt('stats.metaHead', 'PDF metadata')}</span><strong style="font-weight:500;font-size:11px;color:var(--muted)">${tt('stats.metaHint', '— editable; baked into the saved PDF')}</strong></div>
    <div class="stat-row"><span>${tt('stats.title', 'Title')}</span><input type="text" id="metaTitle" class="meta-input" placeholder="—"></div>
    <div class="stat-row"><span>${tt('stats.author', 'Author')}</span><input type="text" id="metaAuthor" class="meta-input" placeholder="—"></div>
    <div class="stat-row"><span>${tt('stats.subject', 'Subject')}</span><input type="text" id="metaSubject" class="meta-input" placeholder="—"></div>
    <div class="stat-row"><span>${tt('stats.keywords', 'Keywords')}</span><input type="text" id="metaKeywords" class="meta-input" placeholder="comma, separated"></div>
    <div class="stat-row"><span>${tt('stats.creator', 'Creator app')}</span><strong id="metaCreator">—</strong></div>
    <div class="stat-row"><span>${tt('stats.producer', 'Producer')}</span><strong id="metaProducer">—</strong></div>
    <div class="stat-row"><span>${tt('stats.created', 'Created')}</span><strong id="metaCreated">—</strong></div>
    <div class="stat-row"><span>${tt('stats.modified', 'Modified')}</span><strong id="metaModified">—</strong></div>
    <hr>
    <div class="stat-row"><span>${tt('stats.chars', 'Character count')}</span><strong id="statsChars">${tt('stats.scanning', 'scanning…')}</strong></div>
    <div class="stat-row"><span>${tt('stats.words', 'Word count')}</span><strong id="statsWords">${tt('stats.scanning', 'scanning…')}</strong></div>
    <div class="stat-row"><span>${tt('stats.textItems', 'Editable text items')}</span><strong>${totalTextItems}</strong></div>
    <div class="stat-row"><span>${tt('stats.fonts', 'Embedded fonts')}</span><strong id="statsFonts">${tt('stats.scanning', 'scanning…')}</strong></div>
    <div class="stat-row"><span>${tt('stats.hasForm', 'Has form fields')}</span><strong>${hasFormStr}</strong></div>
    <div class="stat-row"><span>${tt('stats.savedSigs', 'Saved signatures')}</span><strong>${(typeof getSavedSignatures === 'function' ? getSavedSignatures() : []).length}</strong></div>
    <div class="stat-row"><span>${tt('stats.customStamps', 'Custom stamps')}</span><strong>${(typeof loadCustomStamps === 'function' ? loadCustomStamps() : []).length}</strong></div>
    <hr>
    <div class="stat-row"><span>${tt('stats.yourAnn', 'Your annotations')}</span><strong>${totalAnn}</strong></div>
    ${Object.entries(stats)
      .map(
        ([k, v]) =>
          `<div class="stat-row indent"><span>${tt('stats.k.' + k, k)}</span><strong>${v}</strong></div>`
      )
      .join('')}
  `;
  modal.classList.add('show');
  // Async: page dims, metadata, chars, words, fonts
  try {
    const p1 = await pdfJsDoc.getPage(1);
    const v = p1.getViewport({ scale: 1 });
    const wmm = ((v.width / 72) * 25.4).toFixed(1);
    const hmm = ((v.height / 72) * 25.4).toFixed(1);
    const el = document.getElementById('statsDims');
    if (el) el.textContent = `${wmm} × ${hmm} mm  (${v.width.toFixed(0)} × ${v.height.toFixed(0)} pt)`;
  } catch (_) {}
  try {
    const meta = await pdfJsDoc.getMetadata();
    const info = (meta && meta.info) || {};
    const verEl = document.getElementById('statsVer');
    if (verEl) verEl.textContent = info.PDFFormatVersion || '—';
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val && String(val).trim() ? String(val) : '—';
    };
    const setInp = (id, val, override) => {
      const el = document.getElementById(id);
      if (!el) return;
      const eff = override != null ? override : val || '';
      el.value = eff;
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('input', () => {
        if (!window.sessionMetadata) window.sessionMetadata = {};
        const key = id.replace(/^meta/, '');
        const lc = key.charAt(0).toLowerCase() + key.slice(1);
        window.sessionMetadata[lc] = el.value;
      });
    };
    const sm = window.sessionMetadata || {};
    setInp('metaTitle', info.Title, sm.title);
    setInp('metaAuthor', info.Author, sm.author);
    setInp('metaSubject', info.Subject, sm.subject);
    setInp('metaKeywords', info.Keywords, sm.keywords);
    set('metaCreator', info.Creator);
    set('metaProducer', info.Producer);
    set('metaCreated', _fmtPdfDate(info.CreationDate));
    set('metaModified', _fmtPdfDate(info.ModDate));
  } catch (_) {}
  // Chars / words / fonts (could be slow — limit to first 50 pages for huge docs)
  try {
    const limit = Math.min(pdfJsDoc.numPages, 50);
    let chars = 0,
      words = 0;
    const fonts = new Set();
    for (let pi = 1; pi <= limit; pi++) {
      const page = await pdfJsDoc.getPage(pi);
      const tc = await page.getTextContent();
      for (const item of tc.items) {
        if (item.str) {
          chars += item.str.length;
          const w = item.str.trim().split(/\s+/).filter(Boolean).length;
          words += w;
        }
        if (item.fontName) fonts.add(item.fontName);
      }
      page.cleanup();
    }
    const sf = pdfJsDoc.numPages > limit ? '+' : '';
    const firstNote =
      pdfJsDoc.numPages > limit
        ? ' ' + window.t('stats.firstN', '(first {n} pages)').replace('{n}', limit)
        : '';
    const charsEl = document.getElementById('statsChars');
    if (charsEl) charsEl.textContent = chars.toLocaleString() + sf + firstNote;
    const wordsEl = document.getElementById('statsWords');
    if (wordsEl) wordsEl.textContent = words.toLocaleString() + sf;
    // Map internal font ids to actual font names via commonObjs
    const fontEl = document.getElementById('statsFonts');
    if (fontEl) {
      const labels = [];
      for (const id of fonts) {
        try {
          if (pdfJsDoc.commonObjs && pdfJsDoc.commonObjs.has(id)) {
            const f = pdfJsDoc.commonObjs.get(id);
            labels.push(f.name || id);
          } else {
            labels.push(id);
          }
        } catch (_) {
          labels.push(id);
        }
      }
      const uniq = [...new Set(labels)].filter(Boolean);
      fontEl.textContent = uniq.length ? uniq.join(', ') : window.t('stats.none', '(none)');
    }
  } catch (e) {
    console.warn('[stats] scan failed:', e);
    const el = document.getElementById('statsChars');
    if (el) el.textContent = 'scan failed';
  }
}
function closeStatsModal() {
  document.getElementById('statsModal').classList.remove('show');
}

