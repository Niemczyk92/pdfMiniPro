// ===== Multi-select: shift+click + group drag intercept (capture phase) =====
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (currentTool !== 'select') return;
    if (activeEditor) return;
    const annEl = e.target && e.target.closest ? e.target.closest('.annotation') : null;
    if (!annEl) return;
    // Skip when click is on a handle (resize/rotate) — those need their own behavior
    if (
      e.target.classList &&
      (e.target.classList.contains('img-handle') ||
        e.target.classList.contains('rot-handle') ||
        e.target.classList.contains('shape-handle') ||
        e.target.classList.contains('endpoint-handle'))
    )
      return;
    const ann = annotations.find((a) => a.el === annEl);
    if (!ann) return;
    if (e.shiftKey) {
      // Shift+click → toggle membership in selectedSet
      e.stopImmediatePropagation();
      e.preventDefault();
      toggleInSelection(ann);
      return;
    }
    // Plain click on an annotation that's part of a multi-selection → start group drag
    if (selectedSet.has(ann) && selectedSet.size > 1) {
      e.stopImmediatePropagation();
      e.preventDefault();
      startGroupDrag(e, ann);
    }
  },
  true
);

function snapshotPos(a) {
  let snap;
  if (a.type === 'draw') snap = { type: 'draw', points: a.points.map((p) => ({ x: p.x, y: p.y })) };
  else if (a.type === 'shape' && ENDPOINT_SHAPES.includes(a.shape))
    snap = { type: 'endpoints', x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 };
  else snap = { type: 'xy', x: a.x, y: a.y };
  // Remember the bound Edit-PDF cover's start so it travels with the text/image.
  if (a.sourceWhiteout) {
    snap.woX = a.sourceWhiteout.x;
    snap.woY = a.sourceWhiteout.y;
  }
  return snap;
}
function applyMoveDelta(a, snap, dx, dy) {
  if (snap.type === 'draw') {
    a.points = snap.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    renderDrawAnnotation(a);
  } else if (snap.type === 'endpoints') {
    a.x1 = snap.x1 + dx;
    a.y1 = snap.y1 + dy;
    a.x2 = snap.x2 + dx;
    a.y2 = snap.y2 + dy;
    renderShapeAnnotation(a);
  } else {
    a.x = snap.x + dx;
    a.y = snap.y + dy;
    if (a.type === 'shape') renderShapeAnnotation(a);
    else if (a.type === 'image') applyImgTransform(a);
    else if (a.type === 'stamp') {
      a.el.style.left = a.x + 'px';
      a.el.style.top = a.y + 'px';
    } else {
      a.el.style.left = a.x + 'px';
      a.el.style.top = a.y + 'px';
    }
  }
  // Carry the bound Edit-PDF cover (see bindEditCover) so the original stays hidden.
  if (a.sourceWhiteout && a.sourceWhiteout.el && snap.woX != null) {
    const wo = a.sourceWhiteout;
    wo.x = snap.woX + dx;
    wo.y = snap.woY + dy;
    wo.el.style.left = wo.x + 'px';
    wo.el.style.top = wo.y + 'px';
  }
}
function startGroupDrag(downEvt, lead) {
  const group = [...selectedSet];
  const snaps = group.map((a) => snapshotPos(a));
  const downX = downEvt.clientX,
    downY = downEvt.clientY;
  let moved = false;
  try {
    document.body.setPointerCapture(downEvt.pointerId);
  } catch (_) {}
  const onMove = (ev) => {
    const dx = (ev.clientX - downX) / currentZoom;
    const dy = (ev.clientY - downY) / currentZoom;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    group.forEach((a, i) => applyMoveDelta(a, snaps[i], dx, dy));
    if (selected) positionPropsPanel(selected);
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    if (moved) pushHistory('group-move');
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
}

// ===== Marquee (rubber-band) selection on empty overlay area in Select mode =====
function setupMarqueeSelect(overlay, pageNum) {
  let marquee = null,
    startX = 0,
    startY = 0;
  overlay.addEventListener('pointerdown', (e) => {
    if (currentTool !== 'select') return;
    // On touch, never start a marquee from a one-finger press on empty page — let
    // the browser pan/pinch-zoom the document instead (marquee stays mouse-only).
    if (e.pointerType === 'touch') return;
    if (e.target !== overlay) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (activeEditor) return;
    // Just committed a text editor on this same click — don't start a marquee,
    // its pointerup would deselect the new annotation.
    if (editorJustCommitted) return;
    e.preventDefault();
    const rect = overlay.getBoundingClientRect();
    startX = (e.clientX - rect.left) / currentZoom;
    startY = (e.clientY - rect.top) / currentZoom;
    marquee = document.createElement('div');
    marquee.className = 'marquee-rect';
    marquee.style.left = startX + 'px';
    marquee.style.top = startY + 'px';
    marquee.style.width = '0px';
    marquee.style.height = '0px';
    overlay.appendChild(marquee);
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch (_) {}
    let moved = false;
    const onMove = (ev) => {
      const x = (ev.clientX - rect.left) / currentZoom;
      const y = (ev.clientY - rect.top) / currentZoom;
      moved = moved || Math.abs(x - startX) + Math.abs(y - startY) > 3;
      marquee.style.left = Math.min(startX, x) + 'px';
      marquee.style.top = Math.min(startY, y) + 'px';
      marquee.style.width = Math.abs(x - startX) + 'px';
      marquee.style.height = Math.abs(y - startY) + 'px';
    };
    const onUp = (ev) => {
      overlay.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('pointerup', onUp);
      overlay.removeEventListener('pointercancel', onUp);
      try {
        overlay.releasePointerCapture(ev.pointerId);
      } catch (_) {}
      const endX = parseFloat(marquee.style.left) + parseFloat(marquee.style.width);
      const endY = parseFloat(marquee.style.top) + parseFloat(marquee.style.height);
      const minX = parseFloat(marquee.style.left),
        minY = parseFloat(marquee.style.top);
      marquee.remove();
      marquee = null;
      if (!moved) {
        // It was just a click — deselect (matches the existing doc-level handler)
        deselect();
        return;
      }
      // Pick all annotations on this page whose bbox intersects the marquee
      const ev_shift = ev.shiftKey;
      if (!ev_shift) clearSelection();
      for (const a of annotations) {
        if (a.pageNum !== pageNum) continue;
        const r = annBoundingBox(a);
        if (!r) continue;
        if (rectsIntersect({ x: minX, y: minY, w: endX - minX, h: endY - minY }, r)) {
          if (!selectedSet.has(a)) {
            selectedSet.add(a);
            if (a.el) a.el.classList.add('selected');
          }
        }
      }
      selected = selectedSet.size ? [...selectedSet][selectedSet.size - 1] : null;
      if (selected) {
        buildPropsPanel(selected);
        positionPropsPanel(selected);
      } else hidePropsPanel();
    };
    overlay.addEventListener('pointermove', onMove);
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('pointercancel', onUp);
  });
}
function annBoundingBox(a) {
  if (a.type === 'draw' || a.type === 'shape') {
    const b = a.bbox;
    if (!b) return null;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  }
  return { x: a.x, y: a.y, w: a.width || 0, h: a.height || 0 };
}
function rectsIntersect(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

// =====================================================================
// =================  ALIGNMENT GUIDES + SNAP  =========================
// =====================================================================
const SNAP_THRESHOLD = 5; // pixels in design space
let _snapEnabled = true;
function snapPosition(ann, proposedX, proposedY, w, h) {
  if (!_snapEnabled || !annotations.length) {
    hideAlignmentGuides();
    return { x: proposedX, y: proposedY };
  }
  const pageNum = ann.pageNum;
  // Candidate self-edges in order: left, centre, right  /  top, centre, bottom
  const myX = [proposedX, proposedX + w / 2, proposedX + w];
  const myY = [proposedY, proposedY + h / 2, proposedY + h];
  let bestX = null,
    bestY = null;
  // Add page-edge snap targets (the overlay element gives us page size)
  const overlay = ann.el && ann.el.parentElement;
  const pageEdgesX = [];
  const pageEdgesY = [];
  if (overlay) {
    const pw = overlay.offsetWidth,
      ph = overlay.offsetHeight;
    pageEdgesX.push(0, pw / 2, pw);
    pageEdgesY.push(0, ph / 2, ph);
  }
  // Compare against other annotations
  for (const t of annotations) {
    if (t === ann || t.pageNum !== pageNum) continue;
    // Skip if the same annotation is part of a multi-selection that's also moving
    if (selectedSet && selectedSet.has(t) && selectedSet.has(ann)) continue;
    const tb = annBoundingBox(t);
    if (!tb) continue;
    const txEdges = [tb.x, tb.x + tb.w / 2, tb.x + tb.w];
    const tyEdges = [tb.y, tb.y + tb.h / 2, tb.y + tb.h];
    for (let i = 0; i < 3; i++) {
      for (const tx of txEdges) {
        const d = Math.abs(myX[i] - tx);
        if (d < SNAP_THRESHOLD && (!bestX || d < bestX.distance)) {
          bestX = { sourceIdx: i, value: tx, distance: d };
        }
      }
      for (const ty of tyEdges) {
        const d = Math.abs(myY[i] - ty);
        if (d < SNAP_THRESHOLD && (!bestY || d < bestY.distance)) {
          bestY = { sourceIdx: i, value: ty, distance: d };
        }
      }
    }
  }
  // Page-edge targets (slightly stronger pull toward 0 / centre / right edge)
  for (let i = 0; i < 3; i++) {
    for (const tx of pageEdgesX) {
      const d = Math.abs(myX[i] - tx);
      if (d < SNAP_THRESHOLD && (!bestX || d < bestX.distance)) {
        bestX = { sourceIdx: i, value: tx, distance: d };
      }
    }
    for (const ty of pageEdgesY) {
      const d = Math.abs(myY[i] - ty);
      if (d < SNAP_THRESHOLD && (!bestY || d < bestY.distance)) {
        bestY = { sourceIdx: i, value: ty, distance: d };
      }
    }
  }
  // Equal-spacing detection: if there are 2+ other annotations on this row
  // (or column) at a regular gap, snap to the "next slot" so a third field
  // continues the pattern — modern-cool, like Figma's distribution guides.
  const myCY = proposedY + h / 2;
  const myCX = proposedX + w / 2;
  const rowMates = [];
  const colMates = [];
  for (const t of annotations) {
    if (t === ann || t.pageNum !== pageNum) continue;
    if (selectedSet && selectedSet.has(t) && selectedSet.has(ann)) continue;
    const tb = annBoundingBox(t);
    if (!tb) continue;
    if (Math.abs(tb.y + tb.h / 2 - myCY) < 14) rowMates.push(tb);
    if (Math.abs(tb.x + tb.w / 2 - myCX) < 14) colMates.push(tb);
  }
  rowMates.sort((a, b) => a.x - b.x);
  colMates.sort((a, b) => a.y - b.y);
  // Wider threshold for the equal-spacing snap than for plain edge alignment —
  // edge snap only needs pixel precision, but lining up a third field at the
  // "same gap as the other two" is rarely pixel-accurate by hand.
  const EQUAL_THRESHOLD = SNAP_THRESHOLD * 3;
  let equalGap = 0;
  for (let i = 0; i + 1 < rowMates.length; i++) {
    const A = rowMates[i],
      B = rowMates[i + 1];
    const gap = B.x - (A.x + A.w);
    if (gap <= 0) continue;
    const after = B.x + B.w + gap; // continue the pattern to the right
    const before = A.x - gap - w; // continue to the left
    [after, before].forEach((target) => {
      const d = Math.abs(proposedX - target);
      if (d < EQUAL_THRESHOLD && (!bestX || d < bestX.distance)) {
        bestX = { sourceIdx: 0, value: target, distance: d, equal: true };
        equalGap = gap;
      }
    });
  }
  for (let i = 0; i + 1 < colMates.length; i++) {
    const A = colMates[i],
      B = colMates[i + 1];
    const gap = B.y - (A.y + A.h);
    if (gap <= 0) continue;
    const after = B.y + B.h + gap;
    const before = A.y - gap - h;
    [after, before].forEach((target) => {
      const d = Math.abs(proposedY - target);
      if (d < EQUAL_THRESHOLD && (!bestY || d < bestY.distance)) {
        bestY = { sourceIdx: 0, value: target, distance: d, equal: true };
        equalGap = gap;
      }
    });
  }
  // Apply snap deltas
  let resultX = proposedX,
    resultY = proposedY;
  if (bestX) {
    const off = bestX.sourceIdx === 0 ? 0 : bestX.sourceIdx === 1 ? w / 2 : w;
    resultX = bestX.value - off;
  }
  if (bestY) {
    const off = bestY.sourceIdx === 0 ? 0 : bestY.sourceIdx === 1 ? h / 2 : h;
    resultY = bestY.value - off;
  }
  // Draw guides in the overlay — edge/equal alignment + Figma-style distance
  // bubbles to the nearest neighbour in each direction.
  showAlignmentGuides(overlay, bestX, bestY);
  if (overlay) showDistanceGuides(overlay, ann, resultX, resultY, w, h);
  return { x: resultX, y: resultY };
}
function showAlignmentGuides(overlay, snapX, snapY) {
  hideAlignmentGuides();
  if (!overlay) return;
  if (snapX) {
    const v = document.createElement('div');
    v.className = 'align-guide vertical' + (snapX.equal ? ' equal' : '');
    v.style.left = snapX.value + 'px';
    overlay.appendChild(v);
  }
  if (snapY) {
    const h = document.createElement('div');
    h.className = 'align-guide horizontal' + (snapY.equal ? ' equal' : '');
    h.style.top = snapY.value + 'px';
    overlay.appendChild(h);
  }
}
function hideAlignmentGuides() {
  document
    .querySelectorAll('.align-guide, .spacing-guide, .spacing-guide-label')
    .forEach((el) => el.remove());
}

// ===== Figma-style spacing/distance guides between the dragged object and
// the nearest neighbour in each direction. The pink line + label shows the
// gap value in the active view unit (mm / cm / in / px / pt). =====
let _showSpacingGuides = (() => {
  try {
    const v = localStorage.getItem('pdfMiniPro.spacingGuides');
    return v === null ? true : v === '1';
  } catch (_) {
    return true;
  }
})();
function _formatSpacingPx(px) {
  const v = typeof _pxToUnit === 'function' && typeof viewUnit !== 'undefined' ? _pxToUnit(px, viewUnit) : px;
  const u = typeof viewUnit !== 'undefined' ? viewUnit : 'px';
  const dec = u === 'in' ? 2 : u === 'cm' ? 1 : 0;
  return v.toFixed(dec) + ' ' + u;
}
function showDistanceGuides(overlay, ann, x, y, w, h) {
  if (!_showSpacingGuides || !overlay) return;
  const pageNum = ann.pageNum;
  let above = null,
    below = null,
    left = null,
    right = null;
  for (const t of annotations) {
    if (t === ann || t.pageNum !== pageNum) continue;
    if (selectedSet && selectedSet.has(t) && selectedSet.has(ann)) continue;
    const tb = annBoundingBox(t);
    if (!tb) continue;
    const xOverlap = Math.min(x + w, tb.x + tb.w) - Math.max(x, tb.x);
    if (xOverlap > 4) {
      const dyAbove = y - (tb.y + tb.h);
      const dyBelow = tb.y - (y + h);
      if (dyAbove > 0 && (!above || dyAbove < above.d)) above = { tb, d: dyAbove };
      if (dyBelow > 0 && (!below || dyBelow < below.d)) below = { tb, d: dyBelow };
    }
    const yOverlap = Math.min(y + h, tb.y + tb.h) - Math.max(y, tb.y);
    if (yOverlap > 4) {
      const dxLeft = x - (tb.x + tb.w);
      const dxRight = tb.x - (x + w);
      if (dxLeft > 0 && (!left || dxLeft < left.d)) left = { tb, d: dxLeft };
      if (dxRight > 0 && (!right || dxRight < right.d)) right = { tb, d: dxRight };
    }
  }
  const drawSpacing = (fromX, fromY, toX, toY) => {
    const isV = fromX === toX;
    const line = document.createElement('div');
    line.className = 'spacing-guide ' + (isV ? 'vertical' : 'horizontal');
    line.style.left = Math.min(fromX, toX) + 'px';
    line.style.top = Math.min(fromY, toY) + 'px';
    if (isV) line.style.height = Math.abs(toY - fromY) + 'px';
    else line.style.width = Math.abs(toX - fromX) + 'px';
    overlay.appendChild(line);
    const lbl = document.createElement('div');
    lbl.className = 'spacing-guide-label';
    lbl.textContent = _formatSpacingPx(isV ? Math.abs(toY - fromY) : Math.abs(toX - fromX));
    lbl.style.left = (fromX + toX) / 2 + 'px';
    lbl.style.top = (fromY + toY) / 2 + 'px';
    overlay.appendChild(lbl);
  };
  const cx = x + w / 2,
    cy = y + h / 2;
  if (above) drawSpacing(cx, above.tb.y + above.tb.h, cx, y);
  if (below) drawSpacing(cx, y + h, cx, below.tb.y);
  if (left) drawSpacing(left.tb.x + left.tb.w, cy, x, cy);
  if (right) drawSpacing(x + w, cy, right.tb.x, cy);
}
(function () {
  const btn = document.getElementById('spacingGuidesToggle');
  if (!btn) return;
  const sync = () => btn.classList.toggle('active', _showSpacingGuides);
  sync();
  btn.addEventListener('click', () => {
    _showSpacingGuides = !_showSpacingGuides;
    try {
      localStorage.setItem('pdfMiniPro.spacingGuides', _showSpacingGuides ? '1' : '0');
    } catch (_) {}
    sync();
    if (!_showSpacingGuides) hideAlignmentGuides();
  });
})();
// Always hide guides on any pointerup (drag end)
document.addEventListener('pointerup', hideAlignmentGuides, true);
document.addEventListener('pointercancel', hideAlignmentGuides, true);

// Hook marquee into existing overlay setup
const _origSetupOverlay = setupOverlay;
setupOverlay = function (overlay, pageNum) {
  overlay.dataset.pageNum = String(pageNum);
  _origSetupOverlay(overlay, pageNum);
  setupMarqueeSelect(overlay, pageNum);
};

// ===== Update Delete key handler so it removes ALL selected =====
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const ce = document.activeElement?.isContentEditable;
    const inp = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    if (ce || inp) return;
    if (!selectedSet.size) return;
    e.preventDefault();
    e.stopPropagation();
    const victims = [...selectedSet];
    for (const a of victims) {
      a.el?.remove();
      const i = annotations.indexOf(a);
      if (i >= 0) annotations.splice(i, 1);
      selectedSet.delete(a);
      // Take the bound Edit-PDF cover with the text (see bindEditCover).
      if (a.sourceWhiteout) {
        a.sourceWhiteout.el?.remove();
        const wi = annotations.indexOf(a.sourceWhiteout);
        if (wi >= 0) annotations.splice(wi, 1);
        selectedSet.delete(a.sourceWhiteout);
      }
    }
    selected = null;
    hidePropsPanel();
    updateAnnotCount();
    pushHistory('delete-' + victims.length);
  },
  true
);

// ===== Push history at key creation/mutation points =====
// We use MutationObservers on the annotations array — but simpler: hook insertion
// and the various "finish drag" / "commit edit" points by re-wrapping the helpers.
const _origUpdateAnnotCount = updateAnnotCount;
let lastAnnotationCount = 0;
updateAnnotCount = function () {
  _origUpdateAnnotCount();
  if (annotations.length !== lastAnnotationCount) {
    lastAnnotationCount = annotations.length;
    pushHistory('count-change');
  }
};

// Push history when any drag ends with actual movement.
// Tracks pointerdown/up at document level — covers handle drags, body drags, group drags.
let _bodyDragOrigin = null;
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!pdfJsDoc) return;
    if (e.button !== undefined && e.button !== 0) return;
    const inAnnotation = e.target && e.target.closest && e.target.closest('.annotation');
    if (!inAnnotation) return;
    _bodyDragOrigin = { x: e.clientX, y: e.clientY };
  },
  true
);
document.addEventListener(
  'pointerup',
  (e) => {
    if (!_bodyDragOrigin) return;
    const dx = e.clientX - _bodyDragOrigin.x;
    const dy = e.clientY - _bodyDragOrigin.y;
    _bodyDragOrigin = null;
    if (Math.abs(dx) + Math.abs(dy) > 3) pushHistory('drag');
  },
  true
);

// ===== Auto-save draft (IndexedDB) =====
const IDB_DB = 'pdfMiniProDrafts';
const IDB_STORE = 'drafts';
const IDB_KEY = 'current';
let autoSaveTimer = null;
let lastAutoSaveTs = 0;

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
async function idbDelete(key) {
  const db = await openIDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(doAutoSave, 1500);
}
async function doAutoSave() {
  if (!pdfBytes || !pdfJsDoc) return;
  try {
    const idxMap = new Map();
    annotations.forEach((a, i) => idxMap.set(a, i));
    const draft = {
      v: 1,
      ts: Date.now(),
      filename: pdfFileName,
      bytes: pdfBytes instanceof ArrayBuffer ? new Uint8Array(pdfBytes) : pdfBytes,
      annotations: annotations.map((a) => serializeAnnotation(a, idxMap)),
    };
    await idbPut(IDB_KEY, draft);
    lastAutoSaveTs = Date.now();
    const ind = document.getElementById('autoSaveIndicator');
    if (ind) {
      ind.textContent = 'Draft saved ' + new Date(lastAutoSaveTs).toLocaleTimeString();
      ind.classList.add('visible');
      clearTimeout(window._autoSaveHideTimer);
      window._autoSaveHideTimer = setTimeout(() => ind.classList.remove('visible'), 2000);
    }
  } catch (e) {
    console.warn('[autosave] failed:', e);
  }
}
async function checkForDraft() {
  try {
    const draft = await idbGet(IDB_KEY);
    if (!draft || !draft.bytes) return;
    const ageMs = Date.now() - (draft.ts || 0);
    const ageMin = Math.round(ageMs / 60000);
    const ageLabel =
      ageMin < 1
        ? window.t('autosave.justNow', 'just now')
        : ageMin < 60
          ? window.t('autosave.minAgo', '{n} min ago').replace('{n}', ageMin)
          : window.t('autosave.hAgo', '{n} h ago').replace('{n}', Math.round(ageMin / 60));
    const ok = confirm(
      window
        .t(
          'autosave.prompt',
          'An auto-saved draft exists ({name}, {age}). Restore it?\n\nClick OK to restore, Cancel to discard.'
        )
        .replace('{name}', draft.filename || 'document.pdf')
        .replace('{age}', ageLabel)
    );
    if (ok) {
      const bytes = draft.bytes instanceof Uint8Array ? draft.bytes : new Uint8Array(draft.bytes);
      pdfBytes = bytes;
      pdfFileName = draft.filename || 'restored.pdf';
      pdfJsDoc = await loadPdfJsDoc(bytes.slice(0));
      document.getElementById('statusPages').textContent = pdfJsDoc.numPages;
      document.getElementById('fileInfo').textContent =
        pdfFileName +
        ' · ' +
        window
          .t(
            pdfJsDoc.numPages === 1 ? 'pages.one' : 'pages.many',
            pdfJsDoc.numPages + ' page' + (pdfJsDoc.numPages === 1 ? '' : 's')
          )
          .replace('{n}', pdfJsDoc.numPages);
      await renderPages();
      // Wait for text-layer promises before restoring annotations
      await Promise.all(window._textLayerPromises || []);
      window._textLayerPromises = [];
      suppressHistory = true;
      const rebuilt = [];
      const defs = draft.annotations || [];
      for (const def of defs) {
        const overlay =
          document.querySelector(`.overlay[data-page-num="${def.pageNum}"]`) ||
          document.querySelectorAll('.overlay')[def.pageNum - 1];
        if (!overlay) continue;
        const ann = recreateAnnotation(def, overlay);
        if (ann) rebuilt.push(ann);
      }
      // Re-link Edit-PDF covers to their text (by stored index) and re-bind them,
      // so a restored draft keeps the "one object" behaviour.
      for (let i = 0; i < defs.length && i < rebuilt.length; i++) {
        const sId = defs[i] && defs[i]._sourceWhiteoutId;
        if (sId !== undefined && sId !== null && rebuilt[sId]) {
          rebuilt[i].sourceWhiteout = rebuilt[sId];
          bindEditCover(rebuilt[sId], rebuilt[i]);
        }
      }
      annotations = rebuilt;
      updateAnnotCount();
      suppressHistory = false;
      clearHistory();
      const dz = document.getElementById('dropzone');
      if (dz) dz.style.display = 'none';
      document.getElementById('saveBtn').disabled = false;
      document.getElementById('printBtn').disabled = false;
      document.getElementById('organizeBtn').disabled = false;
      if (typeof _enableMainPdfTools === 'function') _enableMainPdfTools();
      document.getElementById('zoomBar').style.display = 'flex';
      setContext(currentTool);
      showToast('Draft restored.', 'success');
    } else {
      await idbDelete(IDB_KEY);
    }
  } catch (e) {
    console.warn('[draft check] failed:', e);
  }
}
// Drop the draft after a successful manual save
const _origSavePDF = savePDF;
savePDF = async function () {
  await _origSavePDF();
  try {
    await idbDelete(IDB_KEY);
  } catch (_) {}
};
// Check for draft on first run (only once)
setTimeout(checkForDraft, 800);
