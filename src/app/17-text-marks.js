// =====================================================================
// =====================  HIGHLIGHT / UNDERLINE / STRIKE  ==============
// =====================================================================
function _hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return `rgba(255,235,59,${alpha})`; // fallback yellow
  const r = parseInt(m[1].slice(0, 2), 16),
    g = parseInt(m[1].slice(2, 4), 16),
    b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
// Per-tool current colour, controlled by the floating .deco-color-bar.
let _decoColors = { highlight: '#ffeb3b', underline: '#dc2626', strike: '#dc2626' };
function _decoCurrentColor(kind) {
  return _decoColors[kind] || (kind === 'highlight' ? '#ffeb3b' : '#dc2626');
}

// === MOBILE DOCK / TOPBAR / SHEET BINDINGS ===
(function _initMobileDock() {
  const proxy = (mobId, deskId) => {
    const m = document.getElementById(mobId),
      d = document.getElementById(deskId);
    if (m && d) m.addEventListener('click', () => d.click());
  };
  proxy('mobileMenuBtn', 'sidePanelToggleHeader');
  proxy('mobileUndoBtn', 'undoBtn');
  proxy('mobileRedoBtn', 'redoBtn');
  proxy('mobileDownloadBtn', 'saveBtn');
  proxy('mobileHelpBtn', 'helpBtn');

  // Share — find existing share button (varies by feature flag)
  const mShare = document.getElementById('mobileShareBtn');
  if (mShare)
    mShare.addEventListener('click', () => {
      const sb = document.getElementById('shareBtn') || document.getElementById('shareBtnMenu');
      if (sb) {
        sb.click();
        return;
      }
      if (navigator.share) {
        navigator.share({ title: pdfFileName || 'PDF', text: 'Shared from PDF Mini Pro' }).catch(() => {});
      } else {
        showToast("Sharing isn't available in this browser.", 'warn');
      }
    });

  // Dock tool buttons map to existing setTool / file-pickers
  document.querySelectorAll('.md-btn[data-mob-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.mobTool;
      if (t === 'select') setTool('select');
      else if (t === 'text') setTool('text');
      else if (t === 'draw') setTool('draw');
      else if (t === 'image') document.getElementById('imgInput')?.click();
      else if (t === 'shape') {
        if (!currentShape) currentShape = 'rect';
        setTool('shape');
      } else if (t === 'sign') {
        if (!pdfJsDoc) {
          showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
          return;
        }
        if (typeof openSignatureModal === 'function') openSignatureModal(insertSignatureFromDataURL);
      }
      _syncMobileDockActive();
    });
  });

  // Keep the dock's active highlight in sync with currentTool (covers keyboard
  // shortcuts and any setTool() called from elsewhere — e.g. ESC → select).
  function _syncMobileDockActive() {
    document.querySelectorAll('.md-btn[data-mob-tool]').forEach((b) => {
      b.classList.toggle(
        'active',
        b.dataset.mobTool === currentTool || (b.dataset.mobTool === 'shape' && currentTool === 'shape')
      );
    });
  }
  window._syncMobileDockActive = _syncMobileDockActive;

  // More → open sheet
  const moreBtn = document.getElementById('mobileMoreBtn');
  const sheet = document.getElementById('mobileMoreSheet');
  if (moreBtn && sheet) {
    moreBtn.addEventListener('click', () => sheet.classList.add('is-open'));
    sheet.querySelector('.ms-backdrop').addEventListener('click', () => sheet.classList.remove('is-open'));
  }

  // Sheet tiles map to existing flows
  document.querySelectorAll('.ms-tile').forEach((tile) => {
    tile.addEventListener('click', () => {
      const act = tile.dataset.ms;
      if (sheet) sheet.classList.remove('is-open');
      if (!pdfJsDoc && act !== 'find') {
        showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
        return;
      }
      if (act === 'merge') document.getElementById('mergeMainInput')?.click();
      else if (act === 'split') typeof openSplitModal === 'function' && openSplitModal();
      else if (act === 'compress') typeof openCompressModal === 'function' && openCompressModal();
      else if (act === 'rearrange') typeof openOrganizeModal === 'function' && openOrganizeModal();
      else if (act === 'rotate') {
        if (typeof openOrganizeModal === 'function') {
          openOrganizeModal();
          setTimeout(() => document.getElementById('rotateAllBtn')?.click(), 250);
        }
      } else if (act === 'pagenum') document.getElementById('pageSetupBtnMenu')?.click();
      else if (act === 'find') document.getElementById('findBtnMenu')?.click();
      else if (act === 'ocr') document.getElementById('ocrBtnMenu')?.click();
      else if (act === 'highlight') setTool('highlight');
      else if (act === 'ai') {
        const aiBtn = document.getElementById('aiSummarizeBtn');
        if (aiBtn) aiBtn.click();
        else showToast('AI not configured yet. Open Settings to add your endpoint.', 'info');
      } else if (act === 'autofill') {
        const af = document.getElementById('aiFormFillBtn');
        if (af) af.click();
        else showToast('Form fill needs an AI endpoint.', 'info');
      } else if (act === 'password') {
        if (typeof openPasswordModal === 'function') openPasswordModal();
      } else if (act === 'sanitize') {
        if (typeof openSanitizeModal === 'function') openSanitizeModal();
      } else if (act === 'rxredact') {
        if (typeof openRegexRedactModal === 'function') openRegexRedactModal();
      } else if (act === 'diff') {
        if (typeof openDiffModal === 'function') openDiffModal();
      } else if (act === 'table') {
        if (typeof openTableExtract === 'function') openTableExtract();
      } else if (act === 'jsonfill') {
        if (typeof openJsonFillModal === 'function') openJsonFillModal();
      }
    });
  });
})();

// Wire the floating colour bar (preset swatches + custom picker)
(function _initDecoColorBar() {
  function setColor(c) {
    // The visible swatch row tracks the per-tool colour. We set it for the
    // currently-active deco tool, but if user hasn't activated one yet we
    // default to highlight (the most common case).
    const kind =
      currentTool === 'highlight' || currentTool === 'underline' || currentTool === 'strike'
        ? currentTool
        : 'highlight';
    _decoColors[kind] = c;
    document.querySelectorAll('.dcb-swatch').forEach((b) => {
      b.classList.toggle('active', b.dataset.color === c);
    });
    const custom = document.getElementById('decoCustomColor');
    if (custom) custom.value = c;
  }
  document.querySelectorAll('.dcb-swatch').forEach((btn) => {
    btn.addEventListener('click', () => setColor(btn.dataset.color));
  });
  const custom = document.getElementById('decoCustomColor');
  if (custom) custom.addEventListener('input', (e) => setColor(e.target.value));
})();

function addDecorationOnTextItem(overlay, span, kind, color) {
  const pageNum = parseInt(span.dataset.pageNum);
  const x = parseFloat(span.dataset.x);
  const yTop = parseFloat(span.dataset.y);
  const w = parseFloat(span.dataset.w);
  const h = parseFloat(span.dataset.h);
  const finalColor = color || _decoCurrentColor(kind);
  const el = document.createElement('div');
  el.className = 'annotation deco-annotation ' + kind;
  el.style.left = x + 'px';
  el.style.top = yTop + 'px';
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  // Apply chosen color: highlight uses semi-transparent fill, underline/strike use the line color.
  if (kind === 'highlight') el.style.background = _hexToRgba(finalColor, 0.45);
  else el.style.setProperty('--deco-color', finalColor);
  overlay.appendChild(el);
  const ann = {
    type: 'decoration',
    kind,
    pageNum,
    x,
    y: yTop,
    width: w,
    height: h,
    el,
    color: finalColor,
  };
  annotations.push(ann);
  enableWhiteoutInteractions(el, ann); // same drag semantics
  updateAnnotCount();
  return ann;
}

// === Drag-to-select highlight / underline / strike ===
// Users drag across PDF text — every text item the rectangle intersects gets the
// decoration applied. A single click on a word still highlights just that word.
let _decoDrag = null;

document.addEventListener(
  'pointerdown',
  (e) => {
    if (currentTool !== 'highlight' && currentTool !== 'underline' && currentTool !== 'strike') return;
    if (e.button !== undefined && e.button !== 0) return;
    const span = e.target.closest && e.target.closest('.pdf-text-item:not(.pdf-text-item-consumed)');
    if (!span) return;
    const overlay = span.closest('.overlay');
    if (!overlay) return;
    e.preventDefault();
    const overlayRect = overlay.getBoundingClientRect();
    const sx = (e.clientX - overlayRect.left) / currentZoom;
    const sy = (e.clientY - overlayRect.top) / currentZoom;
    const color = _decoCurrentColor(currentTool);
    const preview = document.createElement('div');
    preview.className = 'deco-drag-preview';
    preview.style.left = sx + 'px';
    preview.style.top = sy + 'px';
    preview.style.width = '0px';
    preview.style.height = '0px';
    preview.style.background = currentTool === 'highlight' ? _hexToRgba(color, 0.3) : 'transparent';
    preview.style.border = '1px dashed ' + color;
    overlay.appendChild(preview);
    _decoDrag = {
      overlay,
      kind: currentTool,
      color,
      startSpan: span,
      preview,
      startX: sx,
      startY: sy,
      lastX: sx,
      lastY: sy,
      startClient: { x: e.clientX, y: e.clientY },
      lastClient: { x: e.clientX, y: e.clientY },
      moved: false,
      pointerId: e.pointerId,
    };
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch (_) {}
  },
  true
);

document.addEventListener(
  'pointermove',
  (e) => {
    if (!_decoDrag) return;
    if (_decoDrag.pointerId !== undefined && e.pointerId !== _decoDrag.pointerId) return;
    const overlayRect = _decoDrag.overlay.getBoundingClientRect();
    const cx = (e.clientX - overlayRect.left) / currentZoom;
    const cy = (e.clientY - overlayRect.top) / currentZoom;
    _decoDrag.lastX = cx;
    _decoDrag.lastY = cy;
    _decoDrag.lastClient = { x: e.clientX, y: e.clientY };
    if (Math.abs(cx - _decoDrag.startX) > 2 || Math.abs(cy - _decoDrag.startY) > 2) _decoDrag.moved = true;
    const x = Math.min(_decoDrag.startX, cx);
    const y = Math.min(_decoDrag.startY, cy);
    const w = Math.abs(cx - _decoDrag.startX);
    const h = Math.abs(cy - _decoDrag.startY);
    _decoDrag.preview.style.left = x + 'px';
    _decoDrag.preview.style.top = y + 'px';
    _decoDrag.preview.style.width = w + 'px';
    _decoDrag.preview.style.height = h + 'px';
  },
  true
);

document.addEventListener(
  'pointerup',
  (e) => {
    if (!_decoDrag) return;
    const drag = _decoDrag;
    _decoDrag = null;
    drag.preview.remove();
    try {
      drag.overlay.releasePointerCapture(e.pointerId);
    } catch (_) {}
    // Plain click (no drag) — highlight just the one span that was clicked
    if (!drag.moved) {
      addDecorationOnTextItem(drag.overlay, drag.startSpan, drag.kind, drag.color);
      pushHistory('deco-' + drag.kind);
      return;
    }
    // Drag — intersect drag rectangle (in viewport coords) with every text-item rect
    const x1 = Math.min(drag.startClient.x, drag.lastClient.x);
    const y1 = Math.min(drag.startClient.y, drag.lastClient.y);
    const x2 = Math.max(drag.startClient.x, drag.lastClient.x);
    const y2 = Math.max(drag.startClient.y, drag.lastClient.y);
    const items = drag.overlay.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)');
    let count = 0;
    for (const span of items) {
      const r = span.getBoundingClientRect();
      if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) continue;
      addDecorationOnTextItem(drag.overlay, span, drag.kind, drag.color);
      count++;
    }
    if (count === 0) addDecorationOnTextItem(drag.overlay, drag.startSpan, drag.kind, drag.color);
    pushHistory('deco-' + drag.kind);
  },
  true
);

document.addEventListener(
  'pointercancel',
  () => {
    if (!_decoDrag) return;
    _decoDrag.preview.remove();
    _decoDrag = null;
  },
  true
);

