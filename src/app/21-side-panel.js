// =====================================================================
// =====================  SIDE PANEL  ==================================
// =====================================================================
let _spActive = 'thumbs';
let _spThumbCache = {}; // pageNum → dataURL
const _spThumbRenders = new Map(); // pageNum → promise (so we don't render twice)

function openSidePanel(focusTab) {
  const sp = document.getElementById('sidePanel');
  sp.hidden = false;
  document.body.classList.add('side-panel-open');
  // Push the panel's current width into the CSS var so main gets offset correctly
  document.documentElement.style.setProperty('--sp-width-actual', sp.getBoundingClientRect().width + 'px');
  if (focusTab) showSpTab(focusTab);
  else showSpTab(_spActive);
}
function closeSidePanel() {
  const sp = document.getElementById('sidePanel');
  sp.hidden = true;
  document.body.classList.remove('side-panel-open');
}
function toggleSidePanel() {
  const sp = document.getElementById('sidePanel');
  if (sp.hidden) openSidePanel();
  else closeSidePanel();
}
function showSpTab(tab) {
  _spActive = tab;
  document.body.classList.toggle('sp-thumbs-active', tab === 'thumbs');
  document.querySelectorAll('.sp-tab').forEach((t) => t.classList.toggle('active', t.dataset.sp === tab));
  document.querySelectorAll('.sp-pane').forEach((p) => (p.hidden = p.dataset.sp !== tab));
  // Populate the pane lazily
  if (tab === 'thumbs') populateSpThumbs();
  else if (tab === 'outline') populateSpOutline();
  else if (tab === 'bookmarks') populateSpBookmarks();
  else if (tab === 'signatures') populateSpSignatures();
  else if (tab === 'attachments') populateSpAttachments();
}
async function populateSpThumbs() {
  const pane = document.querySelector('.sp-pane[data-sp="thumbs"]');
  if (!pdfJsDoc) {
    pane.innerHTML = '<div class="sp-loading">' + window.t('sp.noPdf', 'No PDF loaded') + '.</div>';
    return;
  }
  pane.innerHTML = '';
  for (let pi = 1; pi <= pdfJsDoc.numPages; pi++) {
    const card = document.createElement('div');
    card.className = 'sp-thumb';
    card.dataset.pageNum = pi;
    card.innerHTML = `<div class="sp-thumb-placeholder" style="height:140px;display:grid;place-items:center;color:var(--muted);font-size:11px">…</div>
                      <div class="sp-thumb-num">${pi}</div>`;
    card.onclick = () => {
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${pi}"]`);
      if (wrapper) {
        wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.sp-thumb').forEach((t) => t.classList.remove('current'));
        card.classList.add('current');
      }
    };
    pane.appendChild(card);
    // Render thumbnail asynchronously
    renderSpThumb(pi, card);
  }
}
async function renderSpThumb(pi, card) {
  if (_spThumbCache[pi]) {
    const img = new Image();
    img.src = _spThumbCache[pi];
    const ph = card.querySelector('.sp-thumb-placeholder');
    if (ph) ph.replaceWith(img);
    return;
  }
  if (_spThumbRenders.has(pi)) return _spThumbRenders.get(pi);
  const p = (async () => {
    try {
      const page = await pdfJsDoc.getPage(pi);
      // Render at the maximum allowed thumb width (per the zoom slider's upper bound)
      // so CSS can scale DOWN without blur when the user picks a smaller thumb size,
      // and scale UP only slightly when they zoom in.
      const targetW = 360;
      const naturalViewport = page.getViewport({ scale: 1, rotation: page.rotate || 0 });
      const scale = targetW / naturalViewport.width;
      const viewport = page.getViewport({ scale, rotation: page.rotate || 0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      _spThumbCache[pi] = canvas.toDataURL('image/png');
      const img = new Image();
      img.src = _spThumbCache[pi];
      const ph = card.querySelector('.sp-thumb-placeholder');
      if (ph) ph.replaceWith(img);
    } catch (e) {
      const ph = card.querySelector('.sp-thumb-placeholder');
      if (ph) ph.textContent = '!';
    }
  })();
  _spThumbRenders.set(pi, p);
  return p;
}
async function populateSpOutline() {
  const pane = document.querySelector('.sp-pane[data-sp="outline"]');
  if (!pdfJsDoc) {
    pane.innerHTML = '<div class="sp-loading">' + window.t('sp.noPdf', 'No PDF loaded') + '.</div>';
    return;
  }
  try {
    const outline = await pdfJsDoc.getOutline();
    if (!outline || !outline.length) {
      pane.innerHTML =
        '<div class="sp-list-empty">' +
        window.t(
          'sp.noToc',
          'No table of contents in this PDF.<br><br>You can add bookmarks via the Bookmarks tab.'
        ) +
        '</div>';
      return;
    }
    pane.innerHTML = '';
    async function renderNodes(nodes, depth) {
      for (const n of nodes) {
        const item = document.createElement('div');
        item.className = 'sp-list-item';
        item.style.paddingLeft = 10 + depth * 14 + 'px';
        item.innerHTML = `<span class="sp-list-icon">≡</span><span class="sp-list-title">${(n.title || '(untitled)').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</span>`;
        item.onclick = async () => {
          try {
            let pageNum = null;
            if (typeof n.dest === 'string') {
              const dest = await pdfJsDoc.getDestination(n.dest);
              if (dest) pageNum = (await pdfJsDoc.getPageIndex(dest[0])) + 1;
            } else if (Array.isArray(n.dest)) {
              pageNum = (await pdfJsDoc.getPageIndex(n.dest[0])) + 1;
            }
            if (pageNum) {
              const wrapper = document.querySelector(`.page-wrapper[data-page-num="${pageNum}"]`);
              if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } catch (_) {}
        };
        pane.appendChild(item);
        if (n.items && n.items.length) await renderNodes(n.items, depth + 1);
      }
    }
    await renderNodes(outline, 0);
  } catch (e) {
    pane.innerHTML = '<div class="sp-list-empty">Couldn\'t load outline.</div>';
  }
}
function populateSpBookmarks() {
  const pane = document.querySelector('.sp-pane[data-sp="bookmarks"]');
  if (!pdfJsDoc) {
    pane.innerHTML = '<div class="sp-loading">' + window.t('sp.noPdf', 'No PDF loaded') + '.</div>';
    return;
  }
  pane.innerHTML = '';
  const orig =
    typeof originalOutline !== 'undefined' && Array.isArray(originalOutline) ? originalOutline : [];
  const session =
    typeof sessionBookmarks !== 'undefined' && Array.isArray(sessionBookmarks) ? sessionBookmarks : [];
  if (!orig.length && !session.length) {
    pane.innerHTML =
      '<div class="sp-list-empty">' +
      window.t('sp.noBm', 'No bookmarks yet.<br><br>Click <strong>More ▼ → Bookmarks</strong> to add one.') +
      '</div>';
    return;
  }
  const mkRow = (b, origin) => {
    const item = document.createElement('div');
    item.className = 'sp-list-item';
    item.innerHTML = `<span class="sp-list-icon">${origin === 'session' ? '✦' : '🔖'}</span><span class="sp-list-title">${(b.title || '(untitled)').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</span><span class="sp-list-meta">p.${b.page || '?'}</span>`;
    item.title =
      (origin === 'session' ? 'Session bookmark · ' : 'Existing outline entry · ') +
      'page ' +
      (b.page || '?');
    item.onclick = () => {
      if (!b.page) return;
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${b.page}"]`);
      if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    return item;
  };
  for (const b of orig) pane.appendChild(mkRow(b, 'existing'));
  for (const b of session) pane.appendChild(mkRow(b, 'session'));
}
function populateSpSignatures() {
  const pane = document.querySelector('.sp-pane[data-sp="signatures"]');
  pane.innerHTML = '';
  // Saved user signatures (localStorage)
  const saved = typeof getSavedSignatures === 'function' ? getSavedSignatures() : [];
  // AcroForm signature fields
  const sigFields =
    typeof acroFormFields !== 'undefined' ? acroFormFields.filter((f) => f.type === 'signature') : [];
  // Placed signature annotations (rendered as images)
  const placedSigs = annotations.filter((a) => a.type === 'image' && a.isSignature);
  if (!saved.length && !sigFields.length && !placedSigs.length) {
    pane.innerHTML =
      '<div class="sp-list-empty">' +
      window.t(
        'sp.noSigs',
        'No signatures yet.<br><br>Use <strong>＋ Add → Signature</strong> to create one.'
      ) +
      '</div>';
    return;
  }
  if (placedSigs.length) {
    const h = document.createElement('div');
    h.className = 'dropdown-section';
    h.textContent = 'On document';
    pane.appendChild(h);
    placedSigs.forEach((a, i) => {
      const item = document.createElement('div');
      item.className = 'sp-list-item';
      item.innerHTML = `<span class="sp-list-icon">✍</span><span class="sp-list-title">Signature ${i + 1}</span><span class="sp-list-meta">p.${a.pageNum}</span>`;
      item.onclick = () => {
        const wrapper = document.querySelector(`.page-wrapper[data-page-num="${a.pageNum}"]`);
        if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (typeof select === 'function') select(a);
      };
      pane.appendChild(item);
    });
  }
  if (saved.length) {
    const h = document.createElement('div');
    h.className = 'dropdown-section';
    h.textContent = 'Saved';
    pane.appendChild(h);
    saved.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'sp-list-item';
      item.innerHTML = `<span class="sp-list-icon">✍</span><span class="sp-list-title">Signature ${i + 1}</span><span class="sp-list-meta">${(s.dataURL || '').slice(0, 24)}…</span>`;
      item.onclick = () => {
        if (typeof openSignatureModal === 'function') openSignatureModal(insertSignatureFromDataURL);
      };
      pane.appendChild(item);
    });
  }
}
async function populateSpAttachments() {
  const pane = document.querySelector('.sp-pane[data-sp="attachments"]');
  if (!pdfJsDoc) {
    pane.innerHTML = '<div class="sp-loading">' + window.t('sp.noPdf', 'No PDF loaded') + '.</div>';
    return;
  }
  try {
    const atts = await pdfJsDoc.getAttachments();
    if (!atts || !Object.keys(atts).length) {
      pane.innerHTML =
        '<div class="sp-list-empty">' +
        window.t('sp.noAttach', 'No file attachments in this PDF.') +
        '</div>';
      return;
    }
    pane.innerHTML = '';
    for (const name of Object.keys(atts)) {
      const a = atts[name];
      const item = document.createElement('div');
      item.className = 'sp-list-item';
      item.innerHTML = `<span class="sp-list-icon">📎</span><span class="sp-list-title">${a.filename || name}</span><span class="sp-list-meta">${a.content ? Math.round(a.content.length / 1024) + ' KB' : ''}</span>`;
      item.title = 'Click to download';
      item.onclick = () => {
        const blob = new Blob([a.content], { type: 'application/octet-stream' });
        downloadBlob(blob, a.filename || name);
      };
      pane.appendChild(item);
    }
  } catch (e) {
    pane.innerHTML = '<div class="sp-list-empty">Couldn\'t read attachments: ' + (e.message || e) + '</div>';
  }
}
// Wire up the toggle + tab clicks + zoom slider + resize handle
const SP_WIDTH_KEY = 'pdfMiniPro.sidePanel.width.v1';
const SP_THUMB_W_KEY = 'pdfMiniPro.sidePanel.thumbW.v1';

function _spApplyWidth(w) {
  const sp = document.getElementById('sidePanel');
  if (!sp) return;
  const min = 200,
    max = Math.min(window.innerWidth - 200, 600);
  const clamped = Math.max(min, Math.min(max, w));
  sp.style.width = clamped + 'px';
  // Push main content rightward by the same amount when panel is open
  document.documentElement.style.setProperty('--sp-width-actual', clamped + 'px');
}
function _spApplyThumbWidth(w) {
  const sp = document.getElementById('sidePanel');
  if (!sp) return;
  const clamped = Math.max(100, Math.min(400, w));
  sp.style.setProperty('--sp-thumb-w', clamped + 'px');
  const slider = document.getElementById('spZoomSlider');
  if (slider && parseInt(slider.value) !== clamped) slider.value = clamped;
}
function _spLoadPrefs() {
  try {
    const w = parseInt(localStorage.getItem(SP_WIDTH_KEY));
    if (w) _spApplyWidth(w);
    const tw = parseInt(localStorage.getItem(SP_THUMB_W_KEY));
    if (tw) _spApplyThumbWidth(tw);
  } catch (_) {}
}
function _spSaveWidth(w) {
  try {
    localStorage.setItem(SP_WIDTH_KEY, String(w));
  } catch (_) {}
}
function _spSaveThumbW(w) {
  try {
    localStorage.setItem(SP_THUMB_W_KEY, String(w));
  } catch (_) {}
}

(function () {
  const btn = document.getElementById('sidePanelToggle');
  if (btn) btn.addEventListener('click', toggleSidePanel);
  const hdrBtn = document.getElementById('sidePanelToggleHeader');
  if (hdrBtn) hdrBtn.addEventListener('click', toggleSidePanel);
  const close = document.getElementById('sidePanelClose');
  if (close) close.addEventListener('click', closeSidePanel);
  document.querySelectorAll('.sp-tab').forEach((t) => {
    t.addEventListener('click', () => showSpTab(t.dataset.sp));
  });
  // Ctrl+\ to toggle
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      toggleSidePanel();
    }
  });
  // Thumb zoom slider
  const slider = document.getElementById('spZoomSlider');
  if (slider) {
    slider.addEventListener('input', () => {
      const w = parseInt(slider.value) || 200;
      _spApplyThumbWidth(w);
      _spSaveThumbW(w);
    });
  }
  const zin = document.getElementById('spZoomIn');
  if (zin)
    zin.addEventListener('click', () => {
      const cur = parseInt(slider.value) || 200;
      const next = Math.min(parseInt(slider.max), cur + 20);
      slider.value = next;
      _spApplyThumbWidth(next);
      _spSaveThumbW(next);
    });
  const zout = document.getElementById('spZoomOut');
  if (zout)
    zout.addEventListener('click', () => {
      const cur = parseInt(slider.value) || 200;
      const next = Math.max(parseInt(slider.min), cur - 20);
      slider.value = next;
      _spApplyThumbWidth(next);
      _spSaveThumbW(next);
    });
  // Resize handle — drag horizontally to change panel width
  const handle = document.getElementById('spResizeHandle');
  if (handle) {
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const sp = document.getElementById('sidePanel');
      const rect = sp.getBoundingClientRect();
      const newW = e.clientX - rect.left;
      _spApplyWidth(newW);
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch (_) {}
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const sp = document.getElementById('sidePanel');
      _spSaveWidth(sp.getBoundingClientRect().width);
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }
  // Initialise from localStorage
  _spLoadPrefs();
})();
// Re-populate panel when a new PDF loads (we wrap loadPDFFromBytes' completion)
if (typeof window._origLoadForSp === 'undefined') {
  window._origLoadForSp = true;
  const _orig = loadPDFFromBytes;
  loadPDFFromBytes = async function () {
    const r = await _orig.apply(this, arguments);
    _spThumbCache = {}; // invalidate thumb cache
    if (!document.getElementById('sidePanel').hidden) showSpTab(_spActive);
    return r;
  };
  const _origL = loadPDF;
  loadPDF = async function () {
    const r = await _origL.apply(this, arguments);
    _spThumbCache = {};
    if (!document.getElementById('sidePanel').hidden) showSpTab(_spActive);
    return r;
  };
}

