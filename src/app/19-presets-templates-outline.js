// =====================================================================
// =====================  EXPORT PRESETS  ==============================
// =====================================================================
function openExportModal() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const r = document.querySelector('input[name="exportPreset"][value="hq"]');
  if (r) r.checked = true;
  document.getElementById('exportModal').classList.add('show');
}
function closeExportModal() {
  document.getElementById('exportModal').classList.remove('show');
}
async function performExport() {
  const chosen = document.querySelector('input[name="exportPreset"]:checked');
  const preset = chosen ? chosen.value : 'hq';
  closeExportModal();
  const btn = document.getElementById('exportBtn');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="icon">⏳</span> Exporting…';
  btn.disabled = true;
  try {
    const bytes = await generatePdfBytes({ preset });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    // Suggest a preset-specific filename
    const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
    const suffix = preset === 'archive' ? '-archive' : preset === 'web' ? '-web' : '';
    const outName = base + suffix + '.pdf';
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: outName,
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast(
          'Exported as ' +
            handle.name +
            ' (' +
            (bytes.length < 1024 * 1024
              ? (bytes.length / 1024).toFixed(1) + ' KB'
              : (bytes.length / 1048576).toFixed(2) + ' MB') +
            ')',
          'success'
        );
      } catch (err) {
        if (err.name === 'AbortError') {
          /* cancelled */
        } else {
          downloadBlob(blob, outName);
          showToast(
            'Downloaded as ' +
              outName +
              ' (' +
              (bytes.length < 1024 * 1024
                ? (bytes.length / 1024).toFixed(1) + ' KB'
                : (bytes.length / 1048576).toFixed(2) + ' MB') +
              ')',
            'success'
          );
        }
      }
    } else {
      downloadBlob(blob, outName);
      showToast(
        'Downloaded as ' +
          outName +
          ' (' +
          (bytes.length < 1024 * 1024
            ? (bytes.length / 1024).toFixed(1) + ' KB'
            : (bytes.length / 1048576).toFixed(2) + ' MB') +
          ')',
        'success'
      );
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not export PDF.', 'error');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
}
document.getElementById('exportBtn').addEventListener('click', openExportModal);
document.getElementById('exportClose').addEventListener('click', closeExportModal);
document.getElementById('exportCancel').addEventListener('click', closeExportModal);
document.getElementById('exportGo').addEventListener('click', performExport);
document.getElementById('exportModal').addEventListener('click', (e) => {
  if (e.target.id === 'exportModal') closeExportModal();
});

// =====================================================================
// =====================  TEMPLATES  ===================================
// =====================================================================
const TPL_KEY = 'pdfMiniPro_templates';
function loadTemplates() {
  try {
    return JSON.parse(localStorage.getItem(TPL_KEY) || '[]');
  } catch (_) {
    return [];
  }
}
function saveTemplatesArr(arr) {
  try {
    localStorage.setItem(TPL_KEY, JSON.stringify(arr));
  } catch (e) {
    showToast('Could not save template (storage full?)', 'error');
  }
}
function openTemplatesModal() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('tplNewName').value = '';
  renderTemplatesList();
  document.getElementById('templatesModal').classList.add('show');
}
function closeTemplatesModal() {
  document.getElementById('templatesModal').classList.remove('show');
}
function renderTemplatesList() {
  const list = document.getElementById('tplList');
  const arr = loadTemplates();
  if (!arr.length) {
    list.innerHTML =
      '<div class="tpl-empty">' +
      window.t(
        'tpl.empty',
        'No templates yet. Add annotations to your PDF, then click <strong>＋ Save current</strong>.'
      ) +
      '</div>';
    return;
  }
  list.innerHTML = '';
  for (const tpl of arr) {
    const row = document.createElement('div');
    row.className = 'tpl-row';
    const info = document.createElement('div');
    info.className = 'tpl-row-info';
    const name = document.createElement('div');
    name.className = 'tpl-row-name';
    name.textContent = tpl.name;
    const meta = document.createElement('div');
    meta.className = 'tpl-row-meta';
    const dt = new Date(tpl.created);
    meta.textContent = `${tpl.annotations.length} annotation${tpl.annotations.length === 1 ? '' : 's'} · saved ${dt.toLocaleDateString()}`;
    info.appendChild(name);
    info.appendChild(meta);
    row.appendChild(info);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn primary';
    applyBtn.textContent = 'Apply';
    applyBtn.onclick = () => applyTemplate(tpl.id);
    row.appendChild(applyBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete template';
    delBtn.onclick = () => {
      if (!confirm(`Delete template "${tpl.name}"?`)) return;
      saveTemplatesArr(loadTemplates().filter((t) => t.id !== tpl.id));
      renderTemplatesList();
    };
    row.appendChild(delBtn);

    list.appendChild(row);
  }
}
function saveCurrentAsTemplate() {
  if (!annotations.length) {
    showToast('Add some annotations first.', 'warn');
    return;
  }
  const nameInput = document.getElementById('tplNewName');
  const name = (nameInput.value || '').trim() || 'Template ' + new Date().toLocaleString();
  const tpl = {
    id: 'tpl_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name,
    created: new Date().toISOString(),
    annotations: snapshotAnnotations(),
  };
  const arr = loadTemplates();
  arr.push(tpl);
  saveTemplatesArr(arr);
  nameInput.value = '';
  renderTemplatesList();
  showToast(`Saved template "${name}"`, 'success');
}
function applyTemplate(id) {
  const tpl = loadTemplates().find((t) => t.id === id);
  if (!tpl || !pdfJsDoc) return;
  let added = 0,
    skipped = 0;
  for (const def of tpl.annotations) {
    const targetPage = def.pageNum || 1;
    if (targetPage > pdfJsDoc.numPages) {
      skipped++;
      continue;
    }
    const overlay = document.querySelector(`.page-wrapper[data-page-num="${targetPage}"] .overlay`);
    if (!overlay) {
      skipped++;
      continue;
    }
    // Strip resolved sourceWhiteout reference — templates don't carry that linkage
    const cleanDef = { ...def };
    delete cleanDef._sourceWhiteoutId;
    const ann = recreateAnnotation(cleanDef, overlay);
    if (ann) {
      annotations.push(ann);
      added++;
    } else {
      skipped++;
    }
  }
  pushHistory('apply-template');
  updateAnnotCount();
  closeTemplatesModal();
  const msg =
    `Applied "${tpl.name}": ${added} annotation${added === 1 ? '' : 's'}` +
    (skipped ? `, ${skipped} skipped` : '');
  showToast(msg, skipped ? 'warn' : 'success');
}
document.getElementById('templatesBtn').addEventListener('click', openTemplatesModal);
document.getElementById('tplClose').addEventListener('click', closeTemplatesModal);
document.getElementById('tplDone').addEventListener('click', closeTemplatesModal);
document.getElementById('tplSaveCurrent').addEventListener('click', saveCurrentAsTemplate);
document.getElementById('templatesModal').addEventListener('click', (e) => {
  if (e.target.id === 'templatesModal') closeTemplatesModal();
});

// =====================================================================
// =====================  BOOKMARKS / OUTLINE  =========================
// =====================================================================
// In-memory bookmarks added in this session. The original PDF outline (read via
// pdf.js getOutline()) is shown read-only; new bookmarks are appended to it on save.
let sessionBookmarks = []; // [{ id, title, page }]
let originalOutline = []; // [{ title, page }] (flat snapshot of existing outline)
let bookmarkCounter = 0;

async function loadOriginalOutline() {
  originalOutline = [];
  if (!pdfJsDoc) return;
  try {
    const outline = await pdfJsDoc.getOutline();
    if (!outline) return;
    // Flatten the tree; only keep entries we can resolve to a page number
    async function walk(nodes) {
      for (const n of nodes) {
        let pageNum = null;
        try {
          if (typeof n.dest === 'string') {
            const dest = await pdfJsDoc.getDestination(n.dest);
            if (dest) {
              const idx = await pdfJsDoc.getPageIndex(dest[0]);
              pageNum = idx + 1;
            }
          } else if (Array.isArray(n.dest)) {
            const idx = await pdfJsDoc.getPageIndex(n.dest[0]);
            pageNum = idx + 1;
          }
        } catch (_) {}
        originalOutline.push({ title: n.title || '(untitled)', page: pageNum });
        if (n.items && n.items.length) await walk(n.items);
      }
    }
    await walk(outline);
  } catch (e) {
    console.warn('[bookmarks] could not read outline:', e);
  }
}

function openBookmarksModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('bmNewTitle').value = '';
  document.getElementById('bmNewPage').value = '1';
  document.getElementById('bmNewPage').max = String(pdfJsDoc.numPages);
  renderBookmarksList();
  document.getElementById('bookmarksModal').classList.add('show');
}
function closeBookmarksModal() {
  document.getElementById('bookmarksModal').classList.remove('show');
}
function renderBookmarksList() {
  const list = document.getElementById('bmList');
  list.innerHTML = '';
  const all = [
    ...originalOutline.map((b) => ({ ...b, _origin: 'original' })),
    ...sessionBookmarks.map((b) => ({ ...b, _origin: 'session' })),
  ];
  if (!all.length) {
    list.innerHTML = '<div class="bm-empty">' + window.t('bm.empty', 'No bookmarks yet.') + '</div>';
    return;
  }
  for (const b of all) {
    const row = document.createElement('div');
    row.className = 'bm-row';
    const info = document.createElement('div');
    info.className = 'bm-row-info';
    const t = document.createElement('div');
    t.className = 'bm-row-title';
    t.textContent = b.title;
    const p = document.createElement('div');
    p.className = 'bm-row-page';
    p.textContent = (b._origin === 'original' ? 'Existing' : 'New') + ' · Page ' + (b.page || '?');
    info.appendChild(t);
    info.appendChild(p);
    row.appendChild(info);
    if (b._origin === 'session') {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn outlined';
      editBtn.textContent = '✎';
      editBtn.title = 'Rename';
      editBtn.onclick = () => {
        const nv = prompt('Title:', b.title);
        if (nv != null) {
          const target = sessionBookmarks.find((x) => x.id === b.id);
          if (target) {
            target.title = nv.trim() || target.title;
            renderBookmarksList();
          }
        }
      };
      row.appendChild(editBtn);
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.textContent = '🗑';
      delBtn.onclick = () => {
        sessionBookmarks = sessionBookmarks.filter((x) => x.id !== b.id);
        renderBookmarksList();
      };
      row.appendChild(delBtn);
    } else {
      const lock = document.createElement('span');
      lock.textContent = '🔒';
      lock.title = 'Original outline entry (read-only)';
      lock.style.cssText = 'font-size:12px;opacity:.6;padding:0 6px';
      row.appendChild(lock);
    }
    list.appendChild(row);
  }
}
function addBookmark() {
  const title = document.getElementById('bmNewTitle').value.trim();
  const page = parseInt(document.getElementById('bmNewPage').value);
  if (!title) {
    showToast('Enter a title.', 'warn');
    return;
  }
  if (!page || page < 1 || page > pdfJsDoc.numPages) {
    showToast('Enter a valid page number.', 'warn');
    return;
  }
  sessionBookmarks.push({ id: ++bookmarkCounter, title, page });
  document.getElementById('bmNewTitle').value = '';
  renderBookmarksList();
  pushHistory('bookmark-add');
}

// Auto-build an outline by scanning the rendered text for "heading" lines —
// lines whose font is notably larger than the body text. Adds them as session
// bookmarks (written to the PDF /Outlines on Save). Needs a text layer, so it
// asks the user to OCR first on scanned PDFs.
function autoDetectHeadings() {
  if (!pdfJsDoc) return;
  const spans = Array.from(document.querySelectorAll('.pdf-text-item'));
  if (!spans.length) {
    showToast(window.t('bm.autoNoText', 'No selectable text found — run OCR first, then try again.'), 'warn');
    return;
  }
  const fhs = spans
    .map((s) => parseFloat(s.dataset.fontHeight) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const median = fhs[Math.floor(fhs.length / 2)] || 12;
  const threshold = median * 1.28; // "notably larger than body"
  const byPage = {};
  for (const s of spans) {
    const pg = parseInt(s.dataset.pageNum) || 1;
    (byPage[pg] = byPage[pg] || []).push({
      y: parseFloat(s.dataset.y) || 0,
      x: parseFloat(s.dataset.x) || 0,
      fh: parseFloat(s.dataset.fontHeight) || 0,
      t: s.dataset.text || '',
    });
  }
  const headings = [];
  const pushLine = (pg, l) => {
    const txt = l.text.replace(/\s+/g, ' ').trim();
    if (!txt || txt.length > 90) return; // headings are short
    if (l.fh < threshold) return; // must stand out from body
    if (!/[A-Za-z0-9]/.test(txt)) return;
    headings.push({ page: pg, title: txt });
  };
  for (const pg of Object.keys(byPage)
    .map(Number)
    .sort((a, b) => a - b)) {
    const items = byPage[pg].sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));
    let line = null;
    for (const it of items) {
      if (!line || Math.abs(it.y - line.y) > Math.max(4, line.fh * 0.6)) {
        if (line) pushLine(pg, line);
        line = { y: it.y, fh: it.fh, text: it.t };
      } else {
        line.text += ' ' + it.t;
        line.fh = Math.max(line.fh, it.fh);
      }
    }
    if (line) pushLine(pg, line);
  }
  if (!headings.length) {
    showToast(window.t('bm.autoNone', 'No headings detected.'), 'warn');
    return;
  }
  const existing = new Set(sessionBookmarks.map((b) => b.page + '|' + b.title));
  let added = 0;
  for (const h of headings.slice(0, 80)) {
    const key = h.page + '|' + h.title;
    if (existing.has(key)) continue;
    existing.add(key);
    sessionBookmarks.push({ id: ++bookmarkCounter, title: h.title, page: h.page });
    added++;
  }
  renderBookmarksList();
  if (added) pushHistory('bookmark-auto');
  showToast(
    window.t('bm.autoAdded', 'Added {n} bookmark(s) from headings.').replace('{n}', added),
    added ? 'success' : 'warn'
  );
}
document.getElementById('bookmarksBtn').addEventListener('click', openBookmarksModal);
document.getElementById('bmClose').addEventListener('click', closeBookmarksModal);
document.getElementById('bmDone').addEventListener('click', closeBookmarksModal);
document.getElementById('bmAdd').addEventListener('click', addBookmark);
document.getElementById('bmAutoDetect').addEventListener('click', autoDetectHeadings);
document.getElementById('bookmarksModal').addEventListener('click', (e) => {
  if (e.target.id === 'bookmarksModal') closeBookmarksModal();
});

