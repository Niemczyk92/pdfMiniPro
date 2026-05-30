// =====================================================================
// =====================  HYPERLINKS  ==================================
// =====================================================================
let _linkPendingAnn = null;
function startLinkDrag(overlay, pageNum, x0, y0, pointerId) {
  const preview = document.createElement('div');
  preview.className = 'link-annotation';
  preview.style.left = x0 + 'px';
  preview.style.top = y0 + 'px';
  preview.style.width = '0px';
  preview.style.height = '0px';
  overlay.appendChild(preview);
  let p2 = { x: x0, y: y0 };
  try {
    overlay.setPointerCapture(pointerId);
  } catch (_) {}
  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const rect = overlay.getBoundingClientRect();
    p2.x = (ev.clientX - rect.left) / currentZoom;
    p2.y = (ev.clientY - rect.top) / currentZoom;
    const x = Math.min(x0, p2.x),
      y = Math.min(y0, p2.y);
    const w = Math.abs(p2.x - x0),
      h = Math.abs(p2.y - y0);
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
    preview.style.width = w + 'px';
    preview.style.height = h + 'px';
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    overlay.removeEventListener('pointermove', onMove);
    overlay.removeEventListener('pointerup', onUp);
    overlay.removeEventListener('pointercancel', onUp);
    try {
      overlay.releasePointerCapture(pointerId);
    } catch (_) {}
    const x = Math.min(x0, p2.x),
      y = Math.min(y0, p2.y);
    const w = Math.abs(p2.x - x0),
      h = Math.abs(p2.y - y0);
    if (w < 8 || h < 8) {
      preview.remove();
      return;
    }
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
    preview.style.width = w + 'px';
    preview.style.height = h + 'px';
    _linkPendingAnn = { overlay, pageNum, x, y, width: w, height: h, previewEl: preview };
    openHyperlinkModal();
  };
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
}
// ===== Link-as-property: attach a clickable link to ANY annotation =====
// Stores `ann.link = { kind: 'url'|'page', target, label }`. Visual badge
// on the element + PDF Link rect emitted on save (see generatePdfBytes
// post-pass). Replaces the original standalone link-rectangle approach
// — those big blue dashed boxes were ugly (per user feedback 034.jpg).
let _linkAttachAnn = null;
function openLinkAttachmentModal(ann) {
  // Reuse the existing hyperlink modal with a special "attach to existing
  // annotation" mode. The annotation already has a bbox — we just need to
  // know the link target.
  _linkAttachAnn = ann;
  const hlUrl = document.getElementById('hlUrl');
  const hlPage = document.getElementById('hlPage');
  const hlTU = document.getElementById('hlTypeUrl');
  const hlTP = document.getElementById('hlTypePage');
  if (ann.link && ann.link.kind === 'page') {
    hlTP.checked = true;
    hlTU.checked = false;
    hlPage.value = String(ann.link.target || '').replace(/^#page=/, '');
    hlUrl.value = '';
  } else {
    hlTU.checked = true;
    hlTP.checked = false;
    hlUrl.value = (ann.link && ann.link.target) || '';
    hlPage.value = '';
  }
  // Clear other in-flight states from the standalone-link path
  _linkPendingAnn = null;
  _linkEditingAnn = null;
  document.getElementById('hyperlinkModal').classList.add('show');
  setTimeout(() => (ann.link && ann.link.kind === 'page' ? hlPage : hlUrl).focus(), 60);
}
function followAnnLink(ann) {
  if (!ann || !ann.link || !ann.link.target) return;
  if (ann.link.kind === 'page') {
    const p = parseInt(String(ann.link.target).replace(/^#page=/, ''));
    const wrap = document.querySelector(`.page-wrapper[data-page-num="${p}"]`);
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    try {
      window.open(ann.link.target, '_blank', 'noopener,noreferrer');
    } catch (_) {}
  }
}
function updateAnnLinkBadge(ann) {
  if (!ann || !ann.el) return;
  const has = !!(ann.link && ann.link.target);
  if (has) {
    ann.el.dataset.hasLink = '1';
    ann.el.dataset.linkTarget = ann.link.target;
    ann.el.dataset.linkLabel = (ann.link.label || ann.link.target || '').slice(0, 60);
  } else {
    delete ann.el.dataset.hasLink;
    delete ann.el.dataset.linkTarget;
    delete ann.el.dataset.linkLabel;
  }
}
// Alt+click (or Ctrl/⌘+click) on any annotation with a link → follow it
// without going through the props panel.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!(e.altKey || e.metaKey || e.ctrlKey)) return;
    if (currentTool !== 'select') return;
    const el = e.target && e.target.closest ? e.target.closest('.annotation') : null;
    if (!el || !el.dataset.hasLink) return;
    const ann = annotations.find((a) => a.el === el);
    if (!ann) return;
    e.preventDefault();
    e.stopPropagation();
    followAnnLink(ann);
  },
  true
);

// Pre-fill with values from an existing link annotation when editing,
// otherwise reset for a new link.
function openHyperlinkModal(editingAnn) {
  const hlUrl = document.getElementById('hlUrl');
  const hlPage = document.getElementById('hlPage');
  const hlTU = document.getElementById('hlTypeUrl');
  const hlTP = document.getElementById('hlTypePage');
  if (editingAnn) {
    if (editingAnn.linkKind === 'page') {
      hlTP.checked = true;
      hlTU.checked = false;
      hlPage.value = String(editingAnn.linkTarget || '').replace(/^#page=/, '');
      hlUrl.value = '';
    } else {
      hlTU.checked = true;
      hlTP.checked = false;
      hlUrl.value = editingAnn.linkTarget || '';
      hlPage.value = '';
    }
    _linkEditingAnn = editingAnn;
  } else {
    hlUrl.value = '';
    hlPage.value = '';
    hlTU.checked = true;
    _linkEditingAnn = null;
  }
  document.getElementById('hyperlinkModal').classList.add('show');
  setTimeout(() => (editingAnn && editingAnn.linkKind === 'page' ? hlPage : hlUrl).focus(), 60);
}
// Track an existing link we're editing (null = create new)
let _linkEditingAnn = null;
function closeHyperlinkModal(cancelled) {
  document.getElementById('hyperlinkModal').classList.remove('show');
  if (cancelled && _linkPendingAnn) {
    try {
      _linkPendingAnn.previewEl.remove();
    } catch (_) {}
  }
  _linkPendingAnn = null;
  _linkEditingAnn = null;
  _linkAttachAnn = null;
}

// Add a "Remove link" affordance for annotations that already have one.
function removeAnnLink(ann) {
  if (!ann || !ann.link) return;
  delete ann.link;
  updateAnnLinkBadge(ann);
  pushHistory('link-remove');
  if (selected === ann) {
    buildPropsPanel(ann);
    positionPropsPanel(ann);
  }
  showToast('Link removed.', 'success');
}
function confirmHyperlink() {
  // Two paths: editing an existing link (re-opened via double-click /
  // "Edit" props button) OR finishing a fresh drag-to-create.
  const isUrl = document.getElementById('hlTypeUrl').checked;
  let target = '';
  let labelTxt = '';
  if (isUrl) {
    target = document.getElementById('hlUrl').value.trim();
    if (!target) {
      showToast('Enter a URL.', 'warn');
      return;
    }
    if (!/^https?:\/\//i.test(target) && !/^mailto:/i.test(target)) target = 'https://' + target;
    labelTxt = target;
  } else {
    const p = parseInt(document.getElementById('hlPage').value);
    if (!p || p < 1 || p > pdfJsDoc.numPages) {
      showToast('Enter a valid page number.', 'warn');
      return;
    }
    target = '#page=' + p;
    labelTxt = 'Page ' + p;
  }
  if (_linkAttachAnn) {
    // Attach-to-existing-annotation mode (the new link-as-property path).
    // Set `ann.link` and refresh the props panel — the saved PDF will get a
    // clickable Link rect over this annotation's bbox in generatePdfBytes.
    const ann = _linkAttachAnn;
    ann.link = {
      kind: isUrl ? 'url' : 'page',
      target: target,
      label: labelTxt,
    };
    updateAnnLinkBadge(ann);
    pushHistory('link-attach');
    closeHyperlinkModal(false);
    if (selected === ann) {
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    }
    showToast('Link attached.', 'success');
    return;
  }
  if (_linkEditingAnn) {
    // Edit mode — update the existing annotation in place.
    const ann = _linkEditingAnn;
    ann.linkKind = isUrl ? 'url' : 'page';
    ann.linkTarget = target;
    ann.linkLabel = labelTxt;
    ann.el.dataset.linkLabel = labelTxt.length > 40 ? labelTxt.slice(0, 38) + '…' : labelTxt;
    ann.el.title = labelTxt;
    pushHistory('link-edit');
    closeHyperlinkModal(false);
    if (selected === ann) {
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    }
    showToast('Link updated.', 'success');
    return;
  }
  if (!_linkPendingAnn) {
    closeHyperlinkModal(true);
    return;
  }
  const pending = _linkPendingAnn;
  const el = pending.previewEl;
  el.classList.remove('selected');
  el.dataset.linkLabel = labelTxt.length > 40 ? labelTxt.slice(0, 38) + '…' : labelTxt;
  el.title = labelTxt;
  const ann = {
    type: 'link',
    pageNum: pending.pageNum,
    x: pending.x,
    y: pending.y,
    width: pending.width,
    height: pending.height,
    linkKind: isUrl ? 'url' : 'page',
    linkTarget: target,
    linkLabel: labelTxt,
    el,
  };
  annotations.push(ann);
  enableLinkInteractions(el, ann);
  updateAnnotCount();
  pushHistory('link');
  closeHyperlinkModal(false);
  setTool('select');
}
function enableLinkInteractions(el, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    startLeft = 0,
    startTop = 0,
    hasMoved = false;
  el.addEventListener('pointerdown', (e) => {
    if (currentTool !== 'select') return;
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
    dragging = false;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (_) {}
    if (!hasMoved) select(ann);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // Double-click → re-open the hyperlink modal pre-filled with this link's
  // current values for editing (matches the double-click-to-edit convention
  // used by text, stamps and signatures).
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (currentTool !== 'select') setTool('select');
    select(ann);
    openHyperlinkModal(ann);
  });
}
document.getElementById('hlClose').addEventListener('click', () => closeHyperlinkModal(true));
document.getElementById('hlCancel').addEventListener('click', () => closeHyperlinkModal(true));
document.getElementById('hlOk').addEventListener('click', confirmHyperlink);
document.getElementById('hyperlinkModal').addEventListener('click', (e) => {
  if (e.target.id === 'hyperlinkModal') closeHyperlinkModal(true);
});

// Hook link + redact tools into the overlay pointerdown path
const _origSetupOverlay2 = setupOverlay;
setupOverlay = function (overlay, pageNum) {
  _origSetupOverlay2(overlay, pageNum);
  overlay.addEventListener('pointerdown', (e) => {
    if (currentTool !== 'link' && currentTool !== 'redact') return;
    if (e.target !== overlay) return;
    if (e.button !== undefined && e.button !== 0) return;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom;
    const y = (e.clientY - rect.top) / currentZoom;
    e.preventDefault();
    e.stopPropagation();
    if (currentTool === 'link') startLinkDrag(overlay, pageNum, x, y, e.pointerId);
    else startRedactDrag(overlay, pageNum, x, y, e.pointerId);
  });
};

// ==== Redact tool: drag a black rectangle. On save, document metadata
// (Title/Author/Subject/Keywords/Producer/Creator) is wiped. ====
function startRedactDrag(overlay, pageNum, x0, y0, pointerId) {
  const preview = document.createElement('div');
  preview.className = 'redact-annotation';
  preview.style.left = x0 + 'px';
  preview.style.top = y0 + 'px';
  preview.style.width = '0px';
  preview.style.height = '0px';
  overlay.appendChild(preview);
  let p2 = { x: x0, y: y0 };
  try {
    overlay.setPointerCapture(pointerId);
  } catch (_) {}
  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const rect = overlay.getBoundingClientRect();
    p2.x = (ev.clientX - rect.left) / currentZoom;
    p2.y = (ev.clientY - rect.top) / currentZoom;
    const x = Math.min(x0, p2.x),
      y = Math.min(y0, p2.y);
    const w = Math.abs(p2.x - x0),
      h = Math.abs(p2.y - y0);
    preview.style.left = x + 'px';
    preview.style.top = y + 'px';
    preview.style.width = w + 'px';
    preview.style.height = h + 'px';
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    overlay.removeEventListener('pointermove', onMove);
    overlay.removeEventListener('pointerup', onUp);
    overlay.removeEventListener('pointercancel', onUp);
    try {
      overlay.releasePointerCapture(pointerId);
    } catch (_) {}
    const x = Math.min(x0, p2.x),
      y = Math.min(y0, p2.y);
    const w = Math.abs(p2.x - x0),
      h = Math.abs(p2.y - y0);
    if (w < 8 || h < 8) {
      preview.remove();
      return;
    }
    const ann = { type: 'redact', pageNum, x, y, width: w, height: h, el: preview };
    annotations.push(ann);
    enableWhiteoutInteractions(preview, ann); // same drag semantics
    updateAnnotCount();
    pushHistory('redact');
    setTool('select');
    select(ann);
  };
  overlay.addEventListener('pointermove', onMove);
  overlay.addEventListener('pointerup', onUp);
  overlay.addEventListener('pointercancel', onUp);
}

// Recreate redact annotation on undo / autosave restore
function recreateRedactAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'redact-annotation';
  el.style.left = def.x + 'px';
  el.style.top = def.y + 'px';
  el.style.width = def.width + 'px';
  el.style.height = def.height + 'px';
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  enableWhiteoutInteractions(el, ann);
  return ann;
}
// Hook into the recreate dispatcher
if (typeof window._redactRecreateWired === 'undefined') {
  window._redactRecreateWired = true;
  const _orig = recreateAnnotation;
  recreateAnnotation = function (def, overlay) {
    if (def.type === 'redact') return recreateRedactAnn(def, overlay);
    return _orig(def, overlay);
  };
}
document.getElementById('statsBtn').addEventListener('click', openStatsModal);
document.getElementById('statsClose').addEventListener('click', closeStatsModal);
document.getElementById('statsDone').addEventListener('click', closeStatsModal);
document.getElementById('statsModal').addEventListener('click', (e) => {
  if (e.target.id === 'statsModal') closeStatsModal();
});

