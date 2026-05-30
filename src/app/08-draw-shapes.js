// === DROPDOWNS ===
function closeAllDropdowns() {
  document
    .querySelectorAll('.dropdown.open, .dropdown-submenu.open')
    .forEach((d) => d.classList.remove('open'));
}
function toggleDropdown(id, e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const dd = document.getElementById(id);
  const wasOpen = dd.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) dd.classList.add('open');
}
document.querySelectorAll('[data-shape]').forEach((item) => {
  item.addEventListener('click', () => {
    currentShape = item.dataset.shape;
    setTool('shape');
    closeAllDropdowns && closeAllDropdowns();
    if (typeof bumpUsage === 'function') bumpUsage('shape:' + currentShape);
  });
});

// Shapes submenu — click toggles open state (CSS :hover handles mouse users,
// this gives keyboard / touch users an explicit way to open it too).
const _shapesSubTrigger = document.getElementById('shapesSubmenuTrigger');
if (_shapesSubTrigger) {
  _shapesSubTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('shapesSubmenu').classList.toggle('open');
  });
}

// === Toolbar v2 — new dropdown triggers + menu item proxies ===
['addDropdown', 'moreDropdown', 'saveMenu'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  const trigger = el.querySelector('.btn, .split-caret');
  if (trigger) trigger.addEventListener('click', (e) => toggleDropdown(id, e));
});
// Also: save split-button has TWO children — the primary triggers saveBtn, caret triggers menu
const _saveCaret = document.getElementById('saveMenuBtn');
if (_saveCaret) {
  _saveCaret.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown('saveMenu', e);
  });
}

// "Add" menu items with data-act="tool:xxx" → activate that tool
document.querySelectorAll('#addDropdown .dropdown-item[data-act]').forEach((item) => {
  item.addEventListener('click', (e) => {
    const act = item.dataset.act;
    closeAllDropdowns();
    if (act && act.startsWith('tool:')) {
      const tool = act.slice(5);
      if (tool === 'edit-pdf' && pdfJsDoc && pdfTotalTextItems === 0) {
        showImageOnlyPdfNotice();
        return;
      }
      setTool(tool);
    }
  });
});

// Menu-item proxies → click the hidden original button so existing handlers fire
function _proxy(menuId, originalId) {
  const m = document.getElementById(menuId);
  const o = document.getElementById(originalId);
  if (m && o) {
    m.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllDropdowns();
      o.click();
    });
  }
}
_proxy('stampsBtnMenu', 'stampsBtn');
_proxy('signatureBtnMenu', 'signatureBtn');
// Certified (PAdES-B-B) signing — opens the cert modal
// (function () {
//   const b = document.getElementById('digitalSigBtnMenu');
//   if (b) b.addEventListener('click', () => {
//     closeAllDropdowns && closeAllDropdowns();
//     openCertSignModal();
//   });
// })();
_proxy('pageSetupBtnMenu', 'pageSetupBtn');
_proxy('templatesBtnMenu', 'templatesBtn');
_proxy('bookmarksBtnMenu', 'bookmarksBtn');
_proxy('cropBtnMenu', 'cropBtn');
_proxy('findBtnMenu', 'findBtn');
(function () {
  const b = document.getElementById('passwordBtnMenu');
  if (b)
    b.addEventListener('click', () => {
      closeAllDropdowns && closeAllDropdowns();
      openPasswordModal();
    });
})();
// Export as… → call openExportModal directly. The old "_proxy → exportBtn.click()"
// path was unreliable because exportBtn lives in <div hidden> and some browsers
// drop programmatic clicks on display:none descendants. Direct call is simpler
// and matches the sanitizeBtnMenu / regexRedactBtnMenu / shareBtnMenu pattern.
(function () {
  const b = document.getElementById('exportBtnMenu');
  if (b)
    b.addEventListener('click', (e) => {
      e.preventDefault();
      closeAllDropdowns && closeAllDropdowns();
      if (typeof openExportModal === 'function') openExportModal();
    });
})();
_proxy('printBtnMenu', 'printBtn');
_proxy('clearBtnMenu', 'clearBtn');

// OCR menu trigger → call runOcrOnDocument directly
const _ocrMenuBtn = document.getElementById('ocrBtnMenu');
if (_ocrMenuBtn) {
  _ocrMenuBtn.addEventListener('click', () => {
    closeAllDropdowns();
    if (typeof runOcrOnDocument === 'function') runOcrOnDocument();
    else showToast('OCR engine not ready yet.', 'warn');
  });
}

// Save split button caret depends on saveBtn enable state too
function _syncSplitCaret() {
  const sb = document.getElementById('saveBtn');
  const sc = document.getElementById('saveMenuBtn');
  if (sb && sc) sc.disabled = sb.disabled;
}
// Run sync after every load (saveBtn.disabled gets flipped in loadPDF / loadPDFFromBytes)
['DOMContentLoaded', 'load'].forEach((ev) => window.addEventListener(ev, _syncSplitCaret));
// Use MutationObserver to keep them in lock-step
(function () {
  const sb = document.getElementById('saveBtn');
  if (!sb || !window.MutationObserver) return;
  new MutationObserver(_syncSplitCaret).observe(sb, { attributes: true, attributeFilter: ['disabled'] });
})();

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) closeAllDropdowns();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDropdowns();
});

// === SVG HELPERS ===
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS_SVG, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// === FREE DRAWING ===
function startDraw(overlay, pageNum, x0, y0, pointerId) {
  const container = document.createElement('div');
  container.className = 'annotation draw-annotation';
  overlay.appendChild(container);

  const ann = {
    type: 'draw',
    pageNum,
    points: [{ x: x0, y: y0 }],
    color: defaultColor,
    strokeWidth: defaultStroke,
    brush: defaultBrush,
    bbox: { x: x0, y: y0, w: 1, h: 1 },
    el: container,
  };
  annotations.push(ann);
  renderDrawAnnotation(ann);

  try {
    overlay.setPointerCapture(pointerId);
  } catch (e) {}

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const rect = overlay.getBoundingClientRect();
    let cx = ev.clientX,
      cy = ev.clientY;
    // Snap to the reading ruler's guide line while it's on — draw a straight
    // stroke/marking along the ruler like using a physical straightedge.
    const rl = typeof window._readingRulerLine === 'function' ? window._readingRulerLine() : null;
    if (rl) {
      const a = (rl.angleDeg * Math.PI) / 180,
        dxr = Math.cos(a),
        dyr = Math.sin(a);
      const t = (cx - rl.cx) * dxr + (cy - rl.cy) * dyr; // project onto the line
      const fx = rl.cx + t * dxr,
        fy = rl.cy + t * dyr; // foot of perpendicular
      if (Math.hypot(cx - fx, cy - fy) <= 30) {
        cx = fx;
        cy = fy;
      } // 30px snap zone
    }
    const x = (cx - rect.left) / currentZoom;
    const y = (cy - rect.top) / currentZoom;
    const last = ann.points[ann.points.length - 1];
    const dx = x - last.x,
      dy = y - last.y;
    if (dx * dx + dy * dy < 1) return;
    ann.points.push({ x, y });
    renderDrawAnnotation(ann);
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    overlay.removeEventListener('pointermove', onMove);
    overlay.removeEventListener('pointerup', onUp);
    overlay.removeEventListener('pointercancel', onUp);
    try {
      overlay.releasePointerCapture(pointerId);
    } catch (er) {}
    if (ann.points.length < 2) {
      container.remove();
      const i = annotations.indexOf(ann);
      if (i >= 0) annotations.splice(i, 1);
      updateAnnotCount();
      return;
    }
    enableDrawInteractions(container, ann);
    updateAnnotCount();
    pushHistory('draw');
    rememberLastDrawTool();
    // Stay in Draw mode so the user can keep drawing (e.g. highlight several
    // passages in a row) until they explicitly switch to Select.
  };
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
}

function computeBBox(points, pad) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    w: Math.ceil(maxX - minX + pad * 2),
    h: Math.ceil(maxY - minY + pad * 2),
  };
}

function renderDrawAnnotation(ann) {
  const bs = _brushStyle(ann);
  const pad = bs.width / 2 + 4; // wide brushes (highlighter) need a roomier bbox
  const bbox = computeBBox(ann.points, pad);
  ann.bbox = bbox;
  ann.el.style.left = bbox.x + 'px';
  ann.el.style.top = bbox.y + 'px';
  ann.el.style.width = bbox.w + 'px';
  ann.el.style.height = bbox.h + 'px';
  // Highlighter multiplies with the page beneath so it tints rather than covers.
  ann.el.style.mixBlendMode = bs.blend === 'multiply' ? 'multiply' : '';

  const pts = ann.points.map((p) => p.x - bbox.x + ',' + (p.y - bbox.y)).join(' ');
  const svg = svgEl('svg', {
    width: bbox.w,
    height: bbox.h,
    viewBox: `0 0 ${bbox.w} ${bbox.h}`,
  });
  const hit = svgEl('polyline', {
    points: pts,
    fill: 'none',
    stroke: 'transparent',
    'stroke-width': Math.max(bs.width, 14),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  hit.classList.add('hit');
  svg.appendChild(hit);
  const line = svgEl('polyline', {
    points: pts,
    fill: 'none',
    stroke: ann.color,
    'stroke-width': bs.width,
    'stroke-opacity': bs.opacity,
    'stroke-linecap': bs.cap,
    'stroke-linejoin': 'round',
  });
  svg.appendChild(line);

  ann.el.replaceChildren(svg);
  ann.svg = svg;
}

function enableDrawInteractions(container, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    snap = null,
    moved = false;
  container.addEventListener('pointerdown', (e) => {
    if (currentTool === 'draw' || currentTool === 'shape') return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    dragging = true;
    moved = false;
    downX = e.clientX;
    downY = e.clientY;
    snap = ann.points.map((p) => ({ x: p.x, y: p.y }));
    try {
      container.setPointerCapture(e.pointerId);
    } catch (er) {}
  });
  container.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - downX) / currentZoom;
    const dy = (e.clientY - downY) / currentZoom;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    ann.points = snap.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    renderDrawAnnotation(ann);
    if (selected === ann) positionPropsPanel(ann);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      container.releasePointerCapture(e.pointerId);
    } catch (er) {}
    if (!moved) select(ann);
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);
}

// === SHAPES ===
const BBOX_SHAPES = [
  'rect',
  'ellipse',
  'triangle',
  'heart',
  'star',
  'lightning',
  'cloud',
  'check',
  'cross',
  'checklist',
  'calendar-month',
  'calendar-week',
];
const ENDPOINT_SHAPES = ['line', 'arrow', 'double-arrow'];
const FILLABLE_SHAPES = ['rect', 'ellipse', 'triangle', 'heart', 'star', 'lightning', 'cloud'];
const SHAPE_PATHS = {
  triangle: 'M 50 5 L 95 90 L 5 90 Z',
  heart: 'M 50 88 C 10 60 0 30 22 15 C 33 8 47 13 50 28 C 53 13 67 8 78 15 C 100 30 90 60 50 88 Z',
  star: 'M 50 5 L 61 38 L 95 38 L 68 57 L 78 90 L 50 71 L 22 90 L 32 57 L 5 38 L 39 38 Z',
  lightning: 'M 58 5 L 25 55 L 45 55 L 32 95 L 75 40 L 55 40 L 65 5 Z',
  cloud: 'M 27 75 C 7 75 7 47 28 47 C 30 28 56 24 64 40 C 78 28 96 36 94 55 C 105 56 104 75 90 75 Z',
};
const STROKE_PATHS = {
  check: 'M 8 50 L 38 78 L 92 18',
  cross: 'M 12 12 L 88 88 M 88 12 L 12 88',
};

function shapeAABB(ann) {
  const padBase = (ann.strokeWidth || 2) + 6;
  if (BBOX_SHAPES.includes(ann.shape)) {
    return {
      x: Math.floor(ann.x - padBase),
      y: Math.floor(ann.y - padBase),
      w: Math.ceil(ann.width + padBase * 2),
      h: Math.ceil(ann.height + padBase * 2),
    };
  }
  // endpoint shapes (line, arrow, double-arrow)
  const extra = ann.shape === 'arrow' || ann.shape === 'double-arrow' ? Math.max(8, ann.strokeWidth * 4) : 0;
  const pad = padBase + extra;
  const minX = Math.min(ann.x1, ann.x2),
    minY = Math.min(ann.y1, ann.y2);
  const maxX = Math.max(ann.x1, ann.x2),
    maxY = Math.max(ann.y1, ann.y2);
  return {
    x: Math.floor(minX - pad),
    y: Math.floor(minY - pad),
    w: Math.ceil(maxX - minX + pad * 2),
    h: Math.ceil(maxY - minY + pad * 2),
  };
}

// Scale a simple SVG path (M/L/C and Z commands) by independent x and y factors
// Build a rounded-rectangle SVG path in a TOP-LEFT-origin, y-DOWN box of W×H
// PDF units with corner radius r. Used so exported stamps keep the same rounded
// corners as their on-screen CSS box (border-radius) — page.drawRectangle only
// ever draws square corners, which is why print used to lose the rounding.
// Corners are cubic béziers (kappa) so the path stays M/L/C, which pdf-lib's
// drawSvgPath renders reliably (its arc support is shakier).
function roundRectSvgPath(W, H, r) {
  r = Math.max(0, Math.min(r, Math.min(W, H) / 2));
  const f = (n) => n.toFixed(3);
  if (r <= 0.01) return `M 0 0 L ${f(W)} 0 L ${f(W)} ${f(H)} L 0 ${f(H)} Z`;
  const k = r * 0.5522847498307936; // bézier circle constant
  return [
    `M ${f(r)} 0`,
    `L ${f(W - r)} 0`,
    `C ${f(W - r + k)} 0 ${f(W)} ${f(r - k)} ${f(W)} ${f(r)}`,
    `L ${f(W)} ${f(H - r)}`,
    `C ${f(W)} ${f(H - r + k)} ${f(W - r + k)} ${f(H)} ${f(W - r)} ${f(H)}`,
    `L ${f(r)} ${f(H)}`,
    `C ${f(r - k)} ${f(H)} 0 ${f(H - r + k)} 0 ${f(H - r)}`,
    `L 0 ${f(r)}`,
    `C 0 ${f(r - k)} ${f(r - k)} 0 ${f(r)} 0`,
    'Z',
  ].join(' ');
}
function scaleSvgPath(d, sx, sy) {
  return d.replace(/([MLCmlcZz])([^MLCZmlcz]*)/g, (match, cmd, args) => {
    if (cmd.toUpperCase() === 'Z') return cmd;
    const nums = args
      .trim()
      .split(/[,\s]+/)
      .filter((s) => s.length)
      .map(Number);
    const out = [];
    for (let i = 0; i < nums.length; i += 2) {
      out.push((nums[i] * sx).toFixed(2));
      out.push((nums[i + 1] * sy).toFixed(2));
    }
    return cmd + ' ' + out.join(' ');
  });
}

// Returns arrowhead wing endpoints for an arrow at (tipX, tipY) coming from (fromX, fromY)
function arrowheadWings(tipX, tipY, fromX, fromY, length) {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const ahAng = 0.45;
  return {
    w1: {
      x: tipX + length * Math.cos(angle + Math.PI - ahAng),
      y: tipY + length * Math.sin(angle + Math.PI - ahAng),
    },
    w2: {
      x: tipX + length * Math.cos(angle + Math.PI + ahAng),
      y: tipY + length * Math.sin(angle + Math.PI + ahAng),
    },
  };
}

function renderShapeAnnotation(ann) {
  const bbox = shapeAABB(ann);
  ann.bbox = bbox;
  ann.el.style.left = bbox.x + 'px';
  ann.el.style.top = bbox.y + 'px';
  ann.el.style.width = bbox.w + 'px';
  ann.el.style.height = bbox.h + 'px';
  // Apply rotation around the shape's centre (the bbox is symmetric around the shape)
  if (ROTATABLE_SHAPES.includes(ann.shape)) {
    ann.el.style.transformOrigin = 'center center';
    ann.el.style.transform = `rotate(${ann.rotation || 0}deg)`;
  } else {
    ann.el.style.transform = '';
  }

  // Preserve existing handles, only replace SVG
  const oldSvg = ann.el.querySelector('svg');
  if (oldSvg) oldSvg.remove();

  const sw = ann.strokeWidth;
  const stroke = ann.stroke || '#000000';
  const fill = ann.fill || 'none';

  const svg = svgEl('svg', {
    width: bbox.w,
    height: bbox.h,
    viewBox: `0 0 ${bbox.w} ${bbox.h}`,
  });

  if (ann.shape === 'rect') {
    const rx = ann.x - bbox.x,
      ry = ann.y - bbox.y;
    const hit = svgEl('rect', {
      x: rx,
      y: ry,
      width: ann.width,
      height: ann.height,
      fill: 'transparent',
      stroke: 'transparent',
      'stroke-width': Math.max(sw, 14),
    });
    hit.classList.add(fill !== 'none' ? 'hit-fill' : 'hit');
    svg.appendChild(hit);
    const r = svgEl('rect', {
      x: rx,
      y: ry,
      width: ann.width,
      height: ann.height,
      fill,
      stroke,
      'stroke-width': sw,
    });
    svg.appendChild(r);
  } else if (ann.shape === 'ellipse') {
    const cx = ann.x - bbox.x + ann.width / 2;
    const cy = ann.y - bbox.y + ann.height / 2;
    const rx = ann.width / 2,
      ry = ann.height / 2;
    const hit = svgEl('ellipse', {
      cx,
      cy,
      rx,
      ry,
      fill: 'transparent',
      stroke: 'transparent',
      'stroke-width': Math.max(sw, 14),
    });
    hit.classList.add(fill !== 'none' ? 'hit-fill' : 'hit');
    svg.appendChild(hit);
    const e = svgEl('ellipse', { cx, cy, rx, ry, fill, stroke, 'stroke-width': sw });
    svg.appendChild(e);
  } else if (SHAPE_PATHS[ann.shape]) {
    // Path-based filled shape (triangle, heart, star, lightning, cloud)
    const offX = ann.x - bbox.x,
      offY = ann.y - bbox.y;
    const scaleX = ann.width / 100,
      scaleY = ann.height / 100;
    const g = svgEl('g', { transform: `translate(${offX} ${offY}) scale(${scaleX} ${scaleY})` });
    const hit = svgEl('path', {
      d: SHAPE_PATHS[ann.shape],
      fill: 'transparent',
      stroke: 'transparent',
      'stroke-width': Math.max(sw / Math.min(scaleX, scaleY), 14),
      'vector-effect': 'non-scaling-stroke',
    });
    hit.classList.add(fill !== 'none' ? 'hit-fill' : 'hit');
    g.appendChild(hit);
    const p = svgEl('path', {
      d: SHAPE_PATHS[ann.shape],
      fill,
      stroke,
      'stroke-width': sw,
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
    });
    g.appendChild(p);
    svg.appendChild(g);
  } else if (STROKE_PATHS[ann.shape]) {
    // Stroke-only shapes (check, cross)
    const offX = ann.x - bbox.x,
      offY = ann.y - bbox.y;
    const scaleX = ann.width / 100,
      scaleY = ann.height / 100;
    const g = svgEl('g', { transform: `translate(${offX} ${offY}) scale(${scaleX} ${scaleY})` });
    const hit = svgEl('path', {
      d: STROKE_PATHS[ann.shape],
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': Math.max(sw + 12, 16),
      'vector-effect': 'non-scaling-stroke',
    });
    hit.classList.add('hit');
    g.appendChild(hit);
    const p = svgEl('path', {
      d: STROKE_PATHS[ann.shape],
      fill: 'none',
      stroke,
      'stroke-width': sw,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
    });
    g.appendChild(p);
    svg.appendChild(g);
  } else if (ann.shape === 'checklist') {
    const offX = ann.x - bbox.x,
      offY = ann.y - bbox.y;
    const rows = ann.rows || 5;
    const rowH = ann.height / rows;
    const boxSize = Math.min(rowH * 0.6, ann.width * 0.08);
    const g = svgEl('g', { transform: `translate(${offX} ${offY})` });
    // hit area covering the bbox
    const hit = svgEl('rect', {
      x: 0,
      y: 0,
      width: ann.width,
      height: ann.height,
      fill: 'transparent',
      stroke: 'transparent',
    });
    hit.classList.add('hit-fill');
    g.appendChild(hit);
    for (let i = 0; i < rows; i++) {
      const cy = (i + 0.5) * rowH;
      const boxX = 4,
        boxY = cy - boxSize / 2;
      g.appendChild(
        svgEl('rect', {
          x: boxX,
          y: boxY,
          width: boxSize,
          height: boxSize,
          fill: 'none',
          stroke,
          'stroke-width': sw,
        })
      );
      const lineX1 = boxX + boxSize + 8;
      const lineX2 = ann.width - 8;
      g.appendChild(
        svgEl('line', {
          x1: lineX1,
          y1: cy + boxSize * 0.35,
          x2: lineX2,
          y2: cy + boxSize * 0.35,
          stroke,
          'stroke-width': Math.max(sw * 0.6, 1),
        })
      );
    }
    svg.appendChild(g);
  } else if (ann.shape === 'calendar-month') {
    drawCalendarMonth(svg, ann, bbox, stroke, sw);
  } else if (ann.shape === 'calendar-week') {
    drawCalendarWeek(svg, ann, bbox, stroke, sw);
  } else if (ann.shape === 'line' || ann.shape === 'arrow' || ann.shape === 'double-arrow') {
    const lx1 = ann.x1 - bbox.x,
      ly1 = ann.y1 - bbox.y;
    const lx2 = ann.x2 - bbox.x,
      ly2 = ann.y2 - bbox.y;
    const hit = svgEl('line', {
      x1: lx1,
      y1: ly1,
      x2: lx2,
      y2: ly2,
      stroke: 'transparent',
      'stroke-width': Math.max(sw, 14),
      'stroke-linecap': 'round',
    });
    hit.classList.add('hit');
    svg.appendChild(hit);
    const ln = svgEl('line', {
      x1: lx1,
      y1: ly1,
      x2: lx2,
      y2: ly2,
      stroke,
      'stroke-width': sw,
      'stroke-linecap': 'round',
    });
    svg.appendChild(ln);
    const ahLen = Math.max(10, sw * 4);
    if (ann.shape === 'arrow' || ann.shape === 'double-arrow') {
      const w = arrowheadWings(lx2, ly2, lx1, ly1, ahLen);
      const ah = svgEl('polyline', {
        points: `${w.w1.x},${w.w1.y} ${lx2},${ly2} ${w.w2.x},${w.w2.y}`,
        fill: 'none',
        stroke,
        'stroke-width': sw,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.appendChild(ah);
    }
    if (ann.shape === 'double-arrow') {
      const w = arrowheadWings(lx1, ly1, lx2, ly2, ahLen);
      const ah = svgEl('polyline', {
        points: `${w.w1.x},${w.w1.y} ${lx1},${ly1} ${w.w2.x},${w.w2.y}`,
        fill: 'none',
        stroke,
        'stroke-width': sw,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      svg.appendChild(ah);
    }
  }

  ann.el.insertBefore(svg, ann.el.firstChild);
  ann.svg = svg;
  ensureShapeHandles(ann);
  positionShapeHandles(ann);
}

function drawCalendarMonth(svg, ann, bbox, stroke, sw) {
  const offX = ann.x - bbox.x,
    offY = ann.y - bbox.y;
  const g = svgEl('g', { transform: `translate(${offX} ${offY})` });
  const W = ann.width,
    H = ann.height;
  const headerH = Math.min(H * 0.12, 24);
  const cols = 7,
    rows = 6;
  const cellW = W / cols,
    cellH = (H - headerH) / rows;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // hit area
  const hit = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', stroke: 'transparent' });
  hit.classList.add('hit-fill');
  g.appendChild(hit);
  // outer frame
  g.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'none', stroke, 'stroke-width': sw }));
  // header line
  g.appendChild(svgEl('line', { x1: 0, y1: headerH, x2: W, y2: headerH, stroke, 'stroke-width': sw }));
  // day labels
  const labelSize = Math.min(headerH * 0.55, cellW * 0.4);
  for (let i = 0; i < cols; i++) {
    const t = svgEl('text', {
      x: (i + 0.5) * cellW,
      y: headerH * 0.62,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: stroke,
      'font-size': labelSize,
      'font-family': 'Helvetica, Arial, sans-serif',
      'font-weight': '600',
    });
    t.textContent = days[i];
    g.appendChild(t);
  }
  // vertical lines
  for (let i = 1; i < cols; i++) {
    g.appendChild(
      svgEl('line', {
        x1: i * cellW,
        y1: 0,
        x2: i * cellW,
        y2: H,
        stroke,
        'stroke-width': Math.max(sw * 0.6, 0.5),
      })
    );
  }
  // horizontal lines
  for (let i = 1; i < rows; i++) {
    g.appendChild(
      svgEl('line', {
        x1: 0,
        y1: headerH + i * cellH,
        x2: W,
        y2: headerH + i * cellH,
        stroke,
        'stroke-width': Math.max(sw * 0.6, 0.5),
      })
    );
  }
  svg.appendChild(g);
}

// Returns a font size that makes `text` fit within `maxWidth` at given weight/family.
function fitTextSize(text, maxWidth, initialSize, fontFamily, fontWeight) {
  if (!text) return initialSize;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${fontWeight || 400} ${initialSize}px ${fontFamily || 'sans-serif'}`;
  const w = ctx.measureText(text).width;
  if (w <= maxWidth) return initialSize;
  return Math.max(8, initialSize * (maxWidth / w));
}

function drawCalendarWeek(svg, ann, bbox, stroke, sw) {
  // Vertical layout: Mon..Sun stacked as rows, each row has a day-name column on the
  // left and an empty note area on the right.
  const offX = ann.x - bbox.x,
    offY = ann.y - bbox.y;
  const g = svgEl('g', { transform: `translate(${offX} ${offY})` });
  const W = ann.width,
    H = ann.height;
  const rows = 7;
  const rowH = H / rows;
  // Day name column takes the smaller of 26% or 115px — generous so labels breathe
  const dayColW = Math.min(W * 0.26, 115);
  const dayPadX = 10; // horizontal padding inside day column
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const hit = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent', stroke: 'transparent' });
  hit.classList.add('hit-fill');
  g.appendChild(hit);
  // Outer frame
  g.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: 'none', stroke, 'stroke-width': sw }));
  // Vertical separator between day column and notes area
  g.appendChild(svgEl('line', { x1: dayColW, y1: 0, x2: dayColW, y2: H, stroke, 'stroke-width': sw }));
  // Day rows + day labels — find a size that fits the longest name ("Wednesday") with margin
  const sizeCap = Math.min(rowH * 0.42, 16);
  const labelSize = fitTextSize(
    'Wednesday',
    dayColW - dayPadX * 2,
    sizeCap,
    'Helvetica, Arial, sans-serif',
    700
  );
  for (let i = 0; i < rows; i++) {
    // Row separator (skip top edge)
    if (i > 0) {
      g.appendChild(
        svgEl('line', {
          x1: 0,
          y1: i * rowH,
          x2: W,
          y2: i * rowH,
          stroke,
          'stroke-width': Math.max(sw * 0.7, 0.6),
        })
      );
    }
    // Subtle alternating background for weekends
    if (i === 5 || i === 6) {
      g.appendChild(
        svgEl('rect', {
          x: 0,
          y: i * rowH,
          width: dayColW,
          height: rowH,
          fill: 'rgba(0,0,0,0.04)',
          stroke: 'none',
        })
      );
    }
    // Day label (left column, vertically centered)
    const t = svgEl('text', {
      x: dayColW / 2,
      y: i * rowH + rowH / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: stroke,
      'font-size': labelSize,
      'font-family': 'Helvetica, Arial, sans-serif',
      'font-weight': '700',
    });
    t.textContent = days[i];
    g.appendChild(t);
    // Light writing guides in the notes area
    const noteX1 = dayColW + 4,
      noteX2 = W - 4;
    const guides = 2;
    const guideStep = rowH / (guides + 1);
    for (let j = 1; j <= guides; j++) {
      g.appendChild(
        svgEl('line', {
          x1: noteX1,
          y1: i * rowH + j * guideStep,
          x2: noteX2,
          y2: i * rowH + j * guideStep,
          stroke,
          'stroke-width': Math.max(sw * 0.35, 0.4),
          'stroke-dasharray': '2 3',
          opacity: '0.5',
        })
      );
    }
  }
  svg.appendChild(g);
}

// Every bbox-based shape can be rotated. Lines/arrows use endpoint handles instead of rotation.
const ROTATABLE_SHAPES = [
  'rect',
  'ellipse',
  'triangle',
  'heart',
  'star',
  'lightning',
  'cloud',
  'check',
  'cross',
  'checklist',
  'calendar-month',
  'calendar-week',
];
function ensureShapeHandles(ann) {
  if (ann.el.querySelector('.shape-handle, .endpoint-handle')) return;
  if (BBOX_SHAPES.includes(ann.shape)) {
    ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
      const h = document.createElement('div');
      h.className = 'shape-handle ' + corner;
      h.dataset.corner = corner;
      ann.el.appendChild(h);
      attachShapeCornerResize(h, ann, corner);
    });
    if (ROTATABLE_SHAPES.includes(ann.shape)) {
      const rot = document.createElement('div');
      rot.className = 'rot-handle';
      rot.title = 'Drag to rotate';
      ann.el.appendChild(rot);
      attachRotateHandle(rot, ann, () => renderShapeAnnotation(ann));
    }
  } else {
    ['p1', 'p2'].forEach((key) => {
      const h = document.createElement('div');
      h.className = 'endpoint-handle';
      h.dataset.endpoint = key;
      ann.el.appendChild(h);
      attachShapeEndpoint(h, ann, key);
    });
  }
}

// Generic rotation handle behavior: drag around the annotation's visual centre.
function attachRotateHandle(handleEl, ann, onChange) {
  handleEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(ann);
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch (_) {}
    const rect = ann.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const onMove = (ev) => {
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = (a * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      if (deg < 0) deg += 360;
      ann.rotation = deg;
      if (onChange) onChange();
      if (selected === ann) positionPropsPanel(ann);
    };
    const onUp = (ev) => {
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      handleEl.removeEventListener('pointercancel', onUp);
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    };
    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
    handleEl.addEventListener('pointercancel', onUp);
  });
}

function positionShapeHandles(ann) {
  const bbox = ann.bbox;
  if (BBOX_SHAPES.includes(ann.shape)) {
    ann.el.querySelectorAll('.shape-handle').forEach((h) => {
      const corner = h.dataset.corner;
      let hx, hy;
      if (corner === 'nw') {
        hx = ann.x - bbox.x;
        hy = ann.y - bbox.y;
      } else if (corner === 'ne') {
        hx = ann.x - bbox.x + ann.width;
        hy = ann.y - bbox.y;
      } else if (corner === 'sw') {
        hx = ann.x - bbox.x;
        hy = ann.y - bbox.y + ann.height;
      } else {
        hx = ann.x - bbox.x + ann.width;
        hy = ann.y - bbox.y + ann.height;
      }
      h.style.left = hx + 'px';
      h.style.top = hy + 'px';
    });
  } else {
    ann.el.querySelectorAll('.endpoint-handle').forEach((h) => {
      const key = h.dataset.endpoint;
      const px = (key === 'p1' ? ann.x1 : ann.x2) - bbox.x;
      const py = (key === 'p1' ? ann.y1 : ann.y2) - bbox.y;
      h.style.left = px + 'px';
      h.style.top = py + 'px';
    });
  }
}

function attachShapeCornerResize(h, ann, corner) {
  h.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(ann);
    try {
      h.setPointerCapture(e.pointerId);
    } catch (er) {}
    const startX = e.clientX,
      startY = e.clientY;
    const sx = ann.x,
      sy = ann.y,
      sw = ann.width,
      sh = ann.height;
    const aspect = sw / sh;
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / currentZoom;
      const dy = (ev.clientY - startY) / currentZoom;
      let nx = sx,
        ny = sy,
        nw = sw,
        nh = sh;
      if (corner.includes('e')) nw = sw + dx;
      if (corner.includes('w')) {
        nw = sw - dx;
        nx = sx + dx;
      }
      if (corner.includes('s')) nh = sh + dy;
      if (corner.includes('n')) {
        nh = sh - dy;
        ny = sy + dy;
      }
      if (ev.shiftKey) {
        // Lock aspect
        const rW = nw / sw,
          rH = nh / sh;
        const r = Math.abs(rW - 1) > Math.abs(rH - 1) ? rW : rH;
        nw = sw * r;
        nh = (sw * r) / aspect;
        if (corner.includes('w')) nx = sx + sw - nw;
        if (corner.includes('n')) ny = sy + sh - nh;
      }
      if (nw < 8) {
        if (corner.includes('w')) nx -= 8 - nw;
        nw = 8;
      }
      if (nh < 8) {
        if (corner.includes('n')) ny -= 8 - nh;
        nh = 8;
      }
      ann.x = nx;
      ann.y = ny;
      ann.width = nw;
      ann.height = nh;
      renderShapeAnnotation(ann);
      if (selected === ann) positionPropsPanel(ann);
    };
    const onUp = (ev) => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onUp);
      try {
        h.releasePointerCapture(ev.pointerId);
      } catch (er) {}
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  });
}

function attachShapeEndpoint(h, ann, key) {
  h.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(ann);
    try {
      h.setPointerCapture(e.pointerId);
    } catch (er) {}
    const startX = e.clientX,
      startY = e.clientY;
    const sx = key === 'p1' ? ann.x1 : ann.x2;
    const sy = key === 'p1' ? ann.y1 : ann.y2;
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / currentZoom;
      const dy = (ev.clientY - startY) / currentZoom;
      if (key === 'p1') {
        ann.x1 = sx + dx;
        ann.y1 = sy + dy;
      } else {
        ann.x2 = sx + dx;
        ann.y2 = sy + dy;
      }
      renderShapeAnnotation(ann);
      if (selected === ann) positionPropsPanel(ann);
    };
    const onUp = (ev) => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onUp);
      try {
        h.releasePointerCapture(ev.pointerId);
      } catch (er) {}
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  });
}

function enableShapeMove(container, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    snap = null,
    moved = false;
  container.addEventListener('pointerdown', (e) => {
    if (currentTool === 'draw' || currentTool === 'shape') return;
    if (
      e.target.classList &&
      (e.target.classList.contains('shape-handle') || e.target.classList.contains('endpoint-handle'))
    )
      return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    dragging = true;
    moved = false;
    downX = e.clientX;
    downY = e.clientY;
    snap = { x: ann.x, y: ann.y, x1: ann.x1, y1: ann.y1, x2: ann.x2, y2: ann.y2 };
    try {
      container.setPointerCapture(e.pointerId);
    } catch (er) {}
  });
  container.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    let dx = (e.clientX - downX) / currentZoom;
    let dy = (e.clientY - downY) / currentZoom;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    if (BBOX_SHAPES.includes(ann.shape)) {
      const proposedX = snap.x + dx,
        proposedY = snap.y + dy;
      const snapped = snapPosition(ann, proposedX, proposedY, ann.width, ann.height);
      ann.x = snapped.x;
      ann.y = snapped.y;
    } else {
      ann.x1 = snap.x1 + dx;
      ann.y1 = snap.y1 + dy;
      ann.x2 = snap.x2 + dx;
      ann.y2 = snap.y2 + dy;
    }
    renderShapeAnnotation(ann);
    if (selected === ann) positionPropsPanel(ann);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      container.releasePointerCapture(e.pointerId);
    } catch (er) {}
    hideAlignmentGuides();
    if (!moved) select(ann);
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);
}

function startShape(overlay, pageNum, x0, y0, shapeType, pointerId) {
  const preview = document.createElement('div');
  preview.className = 'shape-preview';
  overlay.appendChild(preview);
  let p2 = { x: x0, y: y0 };

  const renderPreview = () => {
    const pad = defaultStroke + 4;
    const minX = Math.min(x0, p2.x),
      minY = Math.min(y0, p2.y);
    const maxX = Math.max(x0, p2.x),
      maxY = Math.max(y0, p2.y);
    const w = maxX - minX,
      h = maxY - minY;
    preview.style.left = minX - pad + 'px';
    preview.style.top = minY - pad + 'px';
    preview.style.width = w + pad * 2 + 'px';
    preview.style.height = h + pad * 2 + 'px';

    const svg = svgEl('svg', { width: w + pad * 2, height: h + pad * 2 });
    if (shapeType === 'rect') {
      svg.appendChild(
        svgEl('rect', {
          x: pad,
          y: pad,
          width: w,
          height: h,
          fill: 'none',
          stroke: defaultColor,
          'stroke-width': defaultStroke,
          'stroke-dasharray': '5 5',
        })
      );
    } else if (shapeType === 'ellipse') {
      svg.appendChild(
        svgEl('ellipse', {
          cx: pad + w / 2,
          cy: pad + h / 2,
          rx: w / 2,
          ry: h / 2,
          fill: 'none',
          stroke: defaultColor,
          'stroke-width': defaultStroke,
          'stroke-dasharray': '5 5',
        })
      );
    } else if (
      SHAPE_PATHS[shapeType] ||
      STROKE_PATHS[shapeType] ||
      shapeType === 'checklist' ||
      shapeType === 'calendar-month' ||
      shapeType === 'calendar-week'
    ) {
      // Bbox-based custom shape — show a dashed bounding box during draw
      svg.appendChild(
        svgEl('rect', {
          x: pad,
          y: pad,
          width: w,
          height: h,
          fill: 'none',
          stroke: defaultColor,
          'stroke-width': defaultStroke,
          'stroke-dasharray': '5 5',
        })
      );
    } else if (shapeType === 'line' || shapeType === 'arrow' || shapeType === 'double-arrow') {
      const lx1 = x0 - (minX - pad),
        ly1 = y0 - (minY - pad);
      const lx2 = p2.x - (minX - pad),
        ly2 = p2.y - (minY - pad);
      svg.appendChild(
        svgEl('line', {
          x1: lx1,
          y1: ly1,
          x2: lx2,
          y2: ly2,
          stroke: defaultColor,
          'stroke-width': defaultStroke,
          'stroke-dasharray': '5 5',
          'stroke-linecap': 'round',
        })
      );
    }
    preview.replaceChildren(svg);
  };

  renderPreview();
  try {
    overlay.setPointerCapture(pointerId);
  } catch (e) {}

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const rect = overlay.getBoundingClientRect();
    p2.x = (ev.clientX - rect.left) / currentZoom;
    p2.y = (ev.clientY - rect.top) / currentZoom;
    renderPreview();
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    overlay.removeEventListener('pointermove', onMove);
    overlay.removeEventListener('pointerup', onUp);
    overlay.removeEventListener('pointercancel', onUp);
    try {
      overlay.releasePointerCapture(pointerId);
    } catch (er) {}
    preview.remove();

    let dx = p2.x - x0,
      dy = p2.y - y0;
    // For single-glyph icons (check, cross, heart, star, lightning, cloud),
    // a tap = "drop at sensible default size" — don't require dragging out a bbox.
    const FAST_DEFAULT_SHAPES = ['check', 'cross', 'heart', 'star', 'lightning', 'cloud'];
    if (Math.abs(dx) + Math.abs(dy) < 6) {
      if (FAST_DEFAULT_SHAPES.includes(shapeType)) {
        dx = 48;
        dy = 48; // ~48×48 px default size
        p2 = { x: x0 + dx, y: y0 + dy };
      } else {
        return; // rect / ellipse / line still need a real drag
      }
    }

    let ann;
    if (BBOX_SHAPES.includes(shapeType)) {
      // Provide sane minimum dimensions for templates so they're usable on small clicks
      let w = Math.abs(dx),
        h = Math.abs(dy);
      if (shapeType === 'checklist') {
        w = Math.max(w, 180);
        h = Math.max(h, 150);
      }
      if (shapeType === 'calendar-month') {
        w = Math.max(w, 280);
        h = Math.max(h, 200);
      }
      if (shapeType === 'calendar-week') {
        w = Math.max(w, 320);
        h = Math.max(h, 340);
      }
      ann = {
        type: 'shape',
        shape: shapeType,
        pageNum,
        x: Math.min(x0, p2.x),
        y: Math.min(y0, p2.y),
        width: w,
        height: h,
        stroke: defaultColor,
        strokeWidth: defaultStroke,
        fill: null,
        lastFill: '#fde68a',
      };
    } else {
      ann = {
        type: 'shape',
        shape: shapeType,
        pageNum,
        x1: x0,
        y1: y0,
        x2: p2.x,
        y2: p2.y,
        stroke: defaultColor,
        strokeWidth: defaultStroke,
      };
    }
    const container = document.createElement('div');
    container.className = 'annotation shape-annotation';
    overlay.appendChild(container);
    ann.el = container;
    annotations.push(ann);
    renderShapeAnnotation(ann);
    enableShapeMove(container, ann);
    updateAnnotCount();
    // Auto-switch to Select so the user can immediately resize/recolor
    setTool('select');
    select(ann);
  };
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
}
