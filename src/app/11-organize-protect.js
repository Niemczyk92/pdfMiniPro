// === TOOLBAR HOOKS ===
document.getElementById('stampsBtn').addEventListener('click', () => {
  bumpUsage('open:stamps');
  openStampsModal();
});
document.getElementById('signatureBtn').addEventListener('click', () => {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  if (currentTool !== 'select') setTool('select');
  openSignatureModal(insertSignatureFromDataURL);
});
document.getElementById('newStampBtn').addEventListener('click', () => {
  closeStampsModal();
  openCreateStampModal();
});
document.getElementById('stampsClose').addEventListener('click', closeStampsModal);
document.getElementById('stampsModal').addEventListener('click', (e) => {
  if (e.target.id === 'stampsModal') closeStampsModal();
});
document.querySelectorAll('#stampsModal .stamps-tabs .tab').forEach((t) => {
  t.addEventListener('click', () => {
    const name = t.dataset.stampTab;
    document
      .querySelectorAll('#stampsModal .stamps-tabs .tab')
      .forEach((x) => x.classList.toggle('active', x === t));
    document.getElementById('stampsGridStandard').hidden = name !== 'standard';
    document.getElementById('stampsGridInfo').hidden = name !== 'info';
    document.getElementById('stampsGridCustom').hidden = name !== 'custom';
  });
});

// === ORGANIZE PAGES / MERGE / SPLIT / COMPRESS ===
let organizeState = null;

async function openOrganizeModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  try {
    // Use the raw pdfBytes as the source — DO NOT bake annotations.
    // Previously we baked annotations into the source PDF on dialog open;
    // that meant any Pages → Apply turned editable annotations into static
    // PDF content (user complaint: "after pages changes I can't edit my
    // objects anymore"). Instead we keep annotations in JS, compute an
    // old→new page mapping on Apply, and re-attach them to the new pages.
    organizeState = {
      sources: { main: { bytes: pdfBytes, doc: pdfJsDoc, owned: false } },
      pages: [],
      counter: 0,
    };
    if (!pdfJsDoc || typeof pdfJsDoc.numPages !== 'number') {
      throw new Error('PDF is not loaded correctly (no numPages).');
    }
    for (let i = 0; i < pdfJsDoc.numPages; i++) {
      organizeState.pages.push({
        srcKey: 'main',
        srcIndex: i,
        rotation: 0,
        id: ++organizeState.counter,
        selected: false,
      });
    }
    document.getElementById('organizeModal').classList.add('show');
    bindOrganizeEvents();
    renderOrganizeGrid();
  } catch (e) {
    console.error('[organize] open failed:', e);
    showToast("Couldn't open Pages dialog: " + (e.message || e), 'error');
  }
}
function closeOrganizeModal() {
  // Cancel any in-flight thumbnail renders before touching docs
  cancelOrganizeThumbnailRenders();
  // Destroy any owned sources (newly merged files + baked-from-annotations doc)
  if (organizeState && organizeState.sources) {
    for (const key in organizeState.sources) {
      const src = organizeState.sources[key];
      // Only destroy docs we own — never the doc still on screen
      if (src && src.owned && src.doc && src.doc !== pdfJsDoc && typeof src.doc.destroy === 'function') {
        try {
          src.doc.destroy();
        } catch (e) {
          /* ignore */
        } // fire and forget
      }
    }
  }
  document.getElementById('organizeModal').classList.remove('show');
  organizeState = null;
}

function renderOrganizeGrid() {
  const grid = document.getElementById('organizeGrid');
  grid.innerHTML = '';
  const stats = document.getElementById('organizeStats');
  const selectedCount = organizeState.pages.filter((p) => p.selected).length;
  const n = organizeState.pages.length;
  stats.textContent =
    window.t(n === 1 ? 'pages.one' : 'pages.many', n + ' page' + (n === 1 ? '' : 's')).replace('{n}', n) +
    (selectedCount ? ' · ' + window.t('pages.selected', '{n} selected').replace('{n}', selectedCount) : '');

  organizeState.pages.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'page-card' + (p.selected ? ' selected' : '');
    card.draggable = true;
    card.dataset.idx = idx;

    const check = document.createElement('div');
    check.className = 'pc-check';
    check.title = window.t('org.check', 'Select for export (split)');
    check.onclick = (e) => {
      e.stopPropagation();
      p.selected = !p.selected;
      renderOrganizeGrid();
    };
    card.appendChild(check);

    if (p.srcKey !== 'main') {
      const src = document.createElement('div');
      src.className = 'pc-source';
      src.textContent = p.srcKey;
      card.appendChild(src);
    }

    const thumb = document.createElement('div');
    thumb.className = 'pc-thumb';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    thumb.appendChild(spinner);
    card.appendChild(thumb);

    const row = document.createElement('div');
    row.className = 'pc-row';
    const num = document.createElement('div');
    num.className = 'pc-num';
    num.textContent = `#${idx + 1}` + (p.rotation ? ` (${p.rotation}°)` : '');
    row.appendChild(num);
    const rotBtn = document.createElement('button');
    rotBtn.className = 'pc-btn';
    rotBtn.title = window.t('org.rotate', 'Rotate 90° CW');
    rotBtn.textContent = '↻';
    rotBtn.onclick = (e) => {
      e.stopPropagation();
      p.rotation = (p.rotation + 90) % 360;
      renderOrganizeGrid();
    };
    row.appendChild(rotBtn);
    const replBtn = document.createElement('button');
    replBtn.className = 'pc-btn';
    replBtn.title = window.t('org.replace', 'Replace with page from another PDF');
    replBtn.textContent = '⤒';
    replBtn.onclick = (e) => {
      e.stopPropagation();
      beginReplacePage(idx);
    };
    row.appendChild(replBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'pc-btn danger';
    delBtn.title = window.t('org.delete', 'Delete page');
    delBtn.textContent = '🗑';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (organizeState.pages.length <= 1) {
        showToast(window.t('toast.cantDeleteLast', 'Cannot delete the last page.'), 'warn');
        return;
      }
      organizeState.pages.splice(idx, 1);
      renderOrganizeGrid();
    };
    row.appendChild(delBtn);
    card.appendChild(row);

    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.page-card').forEach((c) => c.classList.remove('drop-before', 'drop-after'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = card.getBoundingClientRect();
      const isBefore = e.clientX - rect.left < rect.width / 2;
      grid.querySelectorAll('.page-card').forEach((c) => c.classList.remove('drop-before', 'drop-after'));
      card.classList.add(isBefore ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      if (isNaN(fromIdx) || fromIdx === idx) return;
      const rect = card.getBoundingClientRect();
      const isBefore = e.clientX - rect.left < rect.width / 2;
      const moved = organizeState.pages.splice(fromIdx, 1)[0];
      let target = idx;
      if (fromIdx < idx) target--;
      const insertAt = isBefore ? target : target + 1;
      organizeState.pages.splice(insertAt, 0, moved);
      renderOrganizeGrid();
    });

    grid.appendChild(card);
    renderPageThumb(p, thumb, spinner);
  });
}

async function renderPageThumb(pageDef, container, spinner) {
  if (!organizeState) return; // modal closed mid-flight
  try {
    const src = organizeState.sources[pageDef.srcKey];
    if (!src) return;
    const pdfPage = await src.doc.getPage(pageDef.srcIndex + 1);
    if (!organizeState) return; // modal closed while we awaited
    // The PDF page may already have intrinsic /Rotate (e.g. after a previous
    // organize Apply baked rotation into the document). Combine that with any
    // session rotation the user has dialed in this round so thumbnails reflect
    // the final orientation, not just the session delta.
    const intrinsicRot = pdfPage.rotate || 0;
    const totalRot = (((intrinsicRot + (pageDef.rotation || 0)) % 360) + 360) % 360;
    // Use the un-rotated natural viewport to derive a uniform thumbnail scale,
    // then re-request with the desired rotation so width/height reflect the rotation.
    const naturalViewport = pdfPage.getViewport({ scale: 1, rotation: 0 });
    const targetW = 150;
    const rotated90 = totalRot % 180 !== 0;
    const scale = targetW / (rotated90 ? naturalViewport.height : naturalViewport.width);
    const viewport = pdfPage.getViewport({ scale, rotation: totalRot });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const task = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
    organizeThumbRenderTasks.push(task);
    try {
      await task.promise;
    } finally {
      const idx = organizeThumbRenderTasks.indexOf(task);
      if (idx >= 0) organizeThumbRenderTasks.splice(idx, 1);
    }
    if (!organizeState) return;
    if (spinner.parentElement) spinner.remove();
    container.appendChild(canvas);
  } catch (e) {
    if (e && (e.name === 'RenderingCancelledException' || /cancel/i.test(String(e.message)))) return;
    if (spinner) spinner.textContent = '!';
    console.error('Thumb error:', e);
  }
}

function bindOrganizeEvents() {
  document.getElementById('organizeClose').onclick = closeOrganizeModal;
  document.getElementById('organizeCancel').onclick = closeOrganizeModal;
  document.getElementById('organizeModal').onclick = (e) => {
    if (e.target.id === 'organizeModal') closeOrganizeModal();
  };
  document.getElementById('organizeApply').onclick = applyOrganize;
  document.getElementById('mergeInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      e.target.value = '';
      await mergePdfIntoOrganize(file);
    }
  };
  document.getElementById('replacePageInput').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file && _replaceTargetIdx >= 0) await handleReplaceFile(file);
  };
  document.getElementById('rppClose').onclick = () => closeReplacePicker(true);
  document.getElementById('rppCancel').onclick = () => closeReplacePicker(true);
  document.getElementById('rppOk').onclick = confirmReplacePicker;
  document.getElementById('replacePagePicker').onclick = (e) => {
    if (e.target.id === 'replacePagePicker') closeReplacePicker(true);
  };
  document.getElementById('splitBtn').onclick = splitSelected;
  document.getElementById('rotateAllBtn').onclick = () => {
    organizeState.pages.forEach((p) => {
      p.rotation = (p.rotation + 90) % 360;
    });
    renderOrganizeGrid();
  };
  document.getElementById('compressBtn').onclick = openCompressModal;
  document.getElementById('addBlankPageBtn').onclick = () => openNewPdfModal('organize');
}

// Append a blank page (current modal-selected size) to organizeState as a
// new source. The page is real PDF bytes (single empty page) so subsequent
// reorder / rotate / merge / compress work the same way as any other source.
async function appendBlankPageToOrganize() {
  if (!organizeState) return false;
  const size = _newPdfResolveSize();
  if (!size) {
    showToast('Pick a page size.', 'warn');
    return false;
  }
  try {
    const doc = await PDFDocument.create();
    doc.addPage([size.w, size.h]);
    const bytes = await doc.save();
    // Unique source key so multiple blanks coexist.
    let key = 'blank',
      n = 1;
    while (organizeState.sources[key]) {
      key = 'blank' + n;
      n++;
    }
    const pdfJsBlank = await loadPdfJsDoc(bytes.slice(0));
    organizeState.sources[key] = { bytes, doc: pdfJsBlank, owned: true };
    organizeState.pages.push({
      srcKey: key,
      srcIndex: 0,
      rotation: 0,
      id: ++organizeState.counter,
      selected: false,
    });
    renderOrganizeGrid();
    showToast(`Blank page (${Math.round(size.w)}×${Math.round(size.h)} pt) added.`, 'success');
    return true;
  } catch (e) {
    showToast("Couldn't add blank page: " + (e.message || e), 'error');
    return false;
  }
}

async function mergePdfIntoOrganize(file) {
  try {
    const buf = await file.arrayBuffer();
    let srcKey = (file.name.replace(/\.pdf$/i, '') || 'merged').slice(0, 14);
    let unique = srcKey,
      n = 1;
    while (organizeState.sources[unique]) {
      unique = srcKey + n;
      n++;
    }
    const doc = await loadPdfJsDoc(buf.slice(0));
    organizeState.sources[unique] = { bytes: buf, doc, owned: true };
    for (let i = 0; i < doc.numPages; i++) {
      organizeState.pages.push({
        srcKey: unique,
        srcIndex: i,
        rotation: 0,
        id: ++organizeState.counter,
        selected: false,
      });
    }
    renderOrganizeGrid();
    showToast(`Added ${doc.numPages} page${doc.numPages === 1 ? '' : 's'} from ${file.name}`, 'success');
  } catch (e) {
    showToast('Failed to merge: ' + e.message, 'error');
  }
}

// ---- Replace page from another PDF ----
let _replaceTargetIdx = -1;
let _replacePending = null; // { srcKey, doc }
function beginReplacePage(idx) {
  _replaceTargetIdx = idx;
  document.getElementById('replacePageInput').click();
}
async function handleReplaceFile(file) {
  try {
    const buf = await file.arrayBuffer();
    let srcKey = (file.name.replace(/\.pdf$/i, '') || 'replace').slice(0, 14);
    let unique = srcKey,
      n = 1;
    while (organizeState.sources[unique]) {
      unique = srcKey + n;
      n++;
    }
    const doc = await loadPdfJsDoc(buf.slice(0));
    organizeState.sources[unique] = { bytes: buf, doc, owned: true };
    if (doc.numPages === 1) {
      applyReplaceWithPage(unique, 0);
      showToast(`Replaced page ${_replaceTargetIdx + 1} with ${file.name}`, 'success');
      _replaceTargetIdx = -1;
    } else {
      _replacePending = { srcKey: unique, doc, fileName: file.name };
      document.getElementById('rppInfo').textContent =
        `${file.name} has ${doc.numPages} pages. Choose which one to use as the replacement for page ${_replaceTargetIdx + 1}.`;
      document.getElementById('rppMax').textContent = String(doc.numPages);
      const inp = document.getElementById('rppPageNum');
      inp.max = String(doc.numPages);
      inp.value = '1';
      document.getElementById('replacePagePicker').classList.add('show');
      setTimeout(() => inp.focus(), 50);
    }
  } catch (e) {
    showToast('Failed to load replacement PDF: ' + e.message, 'error');
    _replaceTargetIdx = -1;
  }
}
function applyReplaceWithPage(srcKey, srcIndex) {
  if (_replaceTargetIdx < 0) return;
  const pg = organizeState.pages[_replaceTargetIdx];
  if (!pg) return;
  pg.srcKey = srcKey;
  pg.srcIndex = srcIndex;
  pg.rotation = 0;
  pg.id = ++organizeState.counter; // force thumbnail re-render
  renderOrganizeGrid();
}
function closeReplacePicker(cancelled) {
  document.getElementById('replacePagePicker').classList.remove('show');
  if (cancelled) {
    _replacePending = null;
    _replaceTargetIdx = -1;
  }
}
function confirmReplacePicker() {
  if (!_replacePending) {
    closeReplacePicker(true);
    return;
  }
  const n = parseInt(document.getElementById('rppPageNum').value);
  if (!n || n < 1 || n > _replacePending.doc.numPages) {
    showToast('Enter a valid page number.', 'warn');
    return;
  }
  applyReplaceWithPage(_replacePending.srcKey, n - 1);
  showToast(`Replaced with page ${n} of ${_replacePending.fileName}`, 'success');
  closeReplacePicker(false);
  _replacePending = null;
  _replaceTargetIdx = -1;
}

async function applyOrganize() {
  const btn = document.getElementById('organizeApply');
  const origLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Applying…';
  let newBytes;

  // ---- Phase 1: build the new PDF bytes (modal still open so progress is visible) ----
  try {
    if (!organizeState || !organizeState.pages.length) throw new Error('No pages to assemble.');
    btn.textContent = 'Building PDF…';
    // Snapshot pages + sources locally so any later modal-close can't mutate them mid-flight
    const pageListCopy = organizeState.pages.map((p) => ({ ...p }));
    const sourcesCopy = organizeState.sources;
    // Cancel any in-flight thumbnail renders so they don't keep the worker busy
    cancelOrganizeThumbnailRenders();
    newBytes = await buildPdfFromOrganizeState(pageListCopy, sourcesCopy, (msg) => {
      btn.textContent = msg;
    });
    // Fire-and-forget destroy of any owned sources — NEVER await, NEVER touch the on-screen pdfJsDoc.
    for (const k in sourcesCopy) {
      const src = sourcesCopy[k];
      if (src && src.owned && src.doc && src.doc !== pdfJsDoc && typeof src.doc.destroy === 'function') {
        try {
          src.doc.destroy();
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.error('[organize] build failed:', e);
    showToast('Failed: ' + (e.message || e), 'error');
    btn.disabled = false;
    btn.textContent = origLabel;
    return;
  }

  // ---- Phase 2: compute old→new page mapping so existing annotations
  // follow their pages through reorder / add / delete. We map by source
  // index in the original document; annotations on a page that no longer
  // appears in the new layout are dropped, and the page mapping uses the
  // FIRST occurrence if a page was duplicated.
  const pageMap = {};
  const pageRotations = {}; // newPageNum → cumulative rotation applied
  organizeState.pages.forEach((p, newIdx) => {
    if (p.srcKey === 'main') {
      const oldPage = p.srcIndex + 1;
      if (!pageMap[oldPage]) pageMap[oldPage] = newIdx + 1;
      pageRotations[newIdx + 1] = (pageRotations[newIdx + 1] || 0) + (p.rotation || 0);
    }
  });

  organizeState = null;
  document.getElementById('organizeModal').classList.remove('show');
  btn.disabled = false;
  btn.textContent = origLabel;

  try {
    btn.textContent = origLabel;
    await loadPDFFromBytes(newBytes, pdfFileName, {
      preserveAnnotations: true,
      pageMap,
      pageRotations,
    });
    showToast('Pages updated.', 'success');
  } catch (e) {
    console.error('[organize] load failed:', e);
    showToast('Loading the rearranged PDF failed: ' + (e.message || e), 'error');
  }
}

// Track thumbnail render tasks so we can cancel them on apply/close
let organizeThumbRenderTasks = [];
function cancelOrganizeThumbnailRenders() {
  for (const t of organizeThumbRenderTasks) {
    try {
      t.cancel && t.cancel();
    } catch (_) {}
  }
  organizeThumbRenderTasks = [];
}

// Build a new PDF from an organize page list. Batches copyPages per source for speed.
async function buildPdfFromOrganizeState(pageList, sources, progress) {
  if (!pageList || !pageList.length) throw new Error('No pages to assemble.');
  if (progress) progress('Loading source PDFs…');
  // Group page indices by source for batched copy
  const groups = {};
  pageList.forEach((p, finalIdx) => {
    if (!groups[p.srcKey]) groups[p.srcKey] = { indices: [], finalOrders: [] };
    groups[p.srcKey].indices.push(p.srcIndex);
    groups[p.srcKey].finalOrders.push(finalIdx);
  });
  const newDoc = await PDFDocument.create();
  const copiedPages = new Array(pageList.length);
  let groupNum = 0;
  const totalGroups = Object.keys(groups).length;
  for (const key in groups) {
    groupNum++;
    if (progress) progress(`Copying pages ${groupNum}/${totalGroups}…`);
    const src = sources[key];
    if (!src) throw new Error(`Missing source "${key}".`);
    const srcDoc = await PDFDocument.load(src.bytes.slice(0), PDF_LOAD_OPTS);
    const pages = await newDoc.copyPages(srcDoc, groups[key].indices);
    groups[key].finalOrders.forEach((finalIdx, i) => {
      copiedPages[finalIdx] = pages[i];
    });
  }
  if (progress) progress('Assembling…');
  // Add pages in final order, applying rotation
  for (let i = 0; i < pageList.length; i++) {
    const p = pageList[i];
    const page = copiedPages[i];
    if (p.rotation) {
      const existing = page.getRotation().angle || 0;
      let total = (existing + p.rotation) % 360;
      if (total < 0) total += 360;
      page.setRotation(degrees(total));
    }
    newDoc.addPage(page);
  }
  if (progress) progress('Saving…');
  return await newDoc.save();
}

async function splitSelected() {
  const selectedPages = organizeState.pages.filter((p) => p.selected);
  if (!selectedPages.length) {
    showToast(
      window.t(
        'toast.selectPagesFirst',
        'Select pages first — click the checkbox in the top-left of each page.'
      ),
      'warn'
    );
    return;
  }
  try {
    const bytes = await buildPdfFromOrganizeState(selectedPages, organizeState.sources);
    const baseName = pdfFileName.replace(/\.pdf$/i, '');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    downloadBlob(blob, baseName + '-extract.pdf');
    showToast(`Exported ${selectedPages.length} page${selectedPages.length === 1 ? '' : 's'}.`, 'success');
  } catch (e) {
    showToast('Failed to split: ' + e.message, 'error');
  }
}

// === COMPRESS PDF ===
let compressChoice = { quality: 0.72, dpi: 120 };
function openCompressModal() {
  document.getElementById('compressModal').classList.add('show');
  document.querySelectorAll('#compressModal .compress-card').forEach((c) => {
    c.classList.toggle('active', parseFloat(c.dataset.quality) === compressChoice.quality);
    c.onclick = () => {
      document.querySelectorAll('#compressModal .compress-card').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      compressChoice = { quality: parseFloat(c.dataset.quality), dpi: parseInt(c.dataset.dpi) };
    };
  });
  document.getElementById('compressClose').onclick = closeCompressModal;
  document.getElementById('compressCancel').onclick = closeCompressModal;
  document.getElementById('compressModal').onclick = (e) => {
    if (e.target.id === 'compressModal') closeCompressModal();
  };
  document.getElementById('compressGo').onclick = doCompress;
}
function closeCompressModal() {
  document.getElementById('compressModal').classList.remove('show');
}
async function doCompress() {
  const goBtn = document.getElementById('compressGo');
  const orig = goBtn.textContent;
  goBtn.disabled = true;
  goBtn.textContent = 'Compressing…';
  try {
    let sourceBytes, sourceDoc;
    if (organizeState) {
      sourceBytes = await buildPdfFromOrganizeState(organizeState.pages, organizeState.sources);
      sourceDoc = await loadPdfJsDoc(sourceBytes.slice(0));
    } else {
      sourceBytes = annotations.length ? await generatePdfBytes() : pdfBytes;
      sourceDoc = await loadPdfJsDoc(sourceBytes.slice(0));
    }
    const newDoc = await PDFDocument.create();
    const dpi = compressChoice.dpi;
    const quality = compressChoice.quality;
    for (let i = 0; i < sourceDoc.numPages; i++) {
      goBtn.textContent = `Compressing… ${i + 1}/${sourceDoc.numPages}`;
      const page = await sourceDoc.getPage(i + 1);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const jpegDataURL = canvas.toDataURL('image/jpeg', quality);
      const jpegBytes = dataURLToBytes(jpegDataURL);
      const img = await newDoc.embedJpg(jpegBytes);
      const naturalViewport = page.getViewport({ scale: 1 });
      const pdfPage = newDoc.addPage([naturalViewport.width, naturalViewport.height]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: naturalViewport.width, height: naturalViewport.height });
    }
    const out = await newDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const base = pdfFileName.replace(/\.pdf$/i, '');
    downloadBlob(blob, base + '-compressed.pdf');
    closeCompressModal();
    const origSize = (sourceBytes.byteLength || sourceBytes.length) / 1048576;
    const newSize = out.byteLength / 1048576;
    showToast(`Compressed: ${origSize.toFixed(2)} MB → ${newSize.toFixed(2)} MB`, 'success');
  } catch (e) {
    showToast('Compression failed: ' + e.message, 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = orig;
  }
}

// Re-load PDF from in-memory bytes (used after organize / merge / compress).
// `opts` (optional):
//   - preserveAnnotations: keep existing annotations in JS, re-attach them
//     to the new page overlays after render. Used by Pages → Apply so the
//     user's text / shapes / stamps remain editable after a reorder.
//   - pageMap: { oldPageNum → newPageNum } applied to each annotation's
//     `pageNum` before re-attach. Annotations whose page isn't in the map
//     (deleted page) are dropped.
async function loadPDFFromBytes(bytes, filename, opts) {
  opts = opts || {};
  await workerReady;
  if (activeEditor) commitEditor(false);
  // Snapshot existing annotations as plain defs (no .el reference) so we
  // can re-create them on the new page overlays after render.
  let preservedDefs = null;
  if (opts.preserveAnnotations) {
    preservedDefs = annotations.map((a) => {
      const def = Object.assign({}, a);
      delete def.el;
      return def;
    });
    // Apply page mapping: drop annotations whose old page no longer exists.
    if (opts.pageMap) {
      preservedDefs = preservedDefs.reduce((acc, def) => {
        const newPage = opts.pageMap[def.pageNum];
        if (newPage) {
          def.pageNum = newPage;
          acc.push(def);
        }
        return acc;
      }, []);
    }
  }
  // Detach old DOM elements either way (the new render replaces all wrappers).
  annotations.forEach((a) => {
    try {
      a.el?.remove();
    } catch (_) {}
  });
  if (!opts.preserveAnnotations) annotations = [];
  selected = null;
  hidePropsPanel();
  // Fire-and-forget destroy of the previous pdfJsDoc.
  // We intentionally do NOT await — a stuck pdf.js worker can hang destroy(),
  // and awaiting it would freeze the whole Organize → Apply flow on the 2nd run.
  const oldDoc = pdfJsDoc;
  pdfJsDoc = null;
  if (oldDoc && typeof oldDoc.destroy === 'function') {
    try {
      oldDoc.destroy();
    } catch (_) {
      /* ignore */
    }
  }
  pdfBytes = bytes;
  pdfFileName = filename;
  pdfJsDoc = await loadPdfJsDoc(bytes.slice(0));
  document.getElementById('statusPages').textContent = pdfJsDoc.numPages;
  document.getElementById('fileInfo').textContent =
    (filename || 'document.pdf') +
    ' · ' +
    window
      .t(
        pdfJsDoc.numPages === 1 ? 'pages.one' : 'pages.many',
        pdfJsDoc.numPages + ' page' + (pdfJsDoc.numPages === 1 ? '' : 's')
      )
      .replace('{n}', pdfJsDoc.numPages);
  await renderPages();
  // Re-attach preserved annotations to the new page overlays. Each def is
  // converted back into a live annotation (with a new .el bound to the new
  // wrapper's overlay) via the same recreateAnnotation path used elsewhere.
  if (opts.preserveAnnotations && preservedDefs && preservedDefs.length) {
    // Wait for text-layer promises so getDocument-backed overlays exist.
    try {
      await Promise.all(window._textLayerPromises || []);
    } catch (_) {}
    window._textLayerPromises = [];
    const rebuilt = [];
    for (const def of preservedDefs) {
      const overlay =
        document.querySelector(`.page-wrapper[data-page-num="${def.pageNum}"] .overlay`) ||
        document.querySelectorAll('.overlay')[def.pageNum - 1];
      if (!overlay) continue;
      try {
        const ann = recreateAnnotation(def, overlay);
        if (ann) rebuilt.push(ann);
      } catch (e) {
        console.warn('[loadPDFFromBytes] failed to recreate annotation', def, e);
      }
    }
    annotations = rebuilt;
  }
  document.getElementById('saveBtn').disabled = false;
  document.getElementById('printBtn').disabled = false;
  document.getElementById('organizeBtn').disabled = false;
  if (typeof _enableMainPdfTools === 'function') _enableMainPdfTools();
  document.getElementById('zoomBar').style.display = 'flex';
  updateAnnotCount();
  setContext(currentTool);
  if (typeof clearHistory === 'function') clearHistory();
}

document.getElementById('organizeBtn').addEventListener('click', () => {
  bumpUsage('open:pages');
  openOrganizeModal();
});

// === Main-toolbar PDF tools: Merge / Split / Compress ===
// These mirror the buttons inside Pages → Organize, but are reachable in one click.
function _enableMainPdfTools() {
  const ids = ['mergeMainBtn', 'splitMainBtn', 'compressMainBtn'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
}
// Merge PDF — open Organize, then trigger the merge file picker so the appended
// pages are visible immediately and the user can rearrange before Apply.
const _mergeMainInput = document.getElementById('mergeMainInput');
if (_mergeMainInput) {
  _mergeMainInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!pdfJsDoc) {
      showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
      return;
    }
    bumpUsage && bumpUsage('merge:main');
    if (!organizeState) await openOrganizeModal();
    if (organizeState) await mergePdfIntoOrganize(file);
  });
}
const _splitMainBtn = document.getElementById('splitMainBtn');
if (_splitMainBtn) {
  _splitMainBtn.addEventListener('click', () => {
    if (!pdfJsDoc) {
      showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
      return;
    }
    bumpUsage && bumpUsage('split:main');
    openSplitModal();
  });
}

// =====================================================================
// =====================  PASSWORD PROTECTION  =========================
// =====================================================================
// Standard PDF password (RC4 / AES) requires a heavy WASM lib (qpdf-wasm
// ≈ 5 MB). For now we use a 100%-client-side AES-256-GCM envelope: file
// is wrapped as `.pdfenc`, re-opens via the normal Open flow which sniffs
// the magic header and prompts for the password.
const PDFENC_MAGIC = new TextEncoder().encode('PDFMINIE'); // 8 bytes
const PDFENC_ITER = 250000;

async function _pdfencDeriveKey(password, salt) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PDFENC_ITER, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function pdfencEncrypt(bytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await _pdfencDeriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  // Layout: magic(8) | salt(16) | iv(12) | ciphertext
  const out = new Uint8Array(PDFENC_MAGIC.length + salt.length + iv.length + ct.length);
  out.set(PDFENC_MAGIC, 0);
  out.set(salt, 8);
  out.set(iv, 24);
  out.set(ct, 36);
  return out;
}
async function pdfencDecrypt(bytes, password) {
  if (bytes.length < 36) throw new Error('File is too short to be encrypted.');
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  if (head !== 'PDFMINIE') throw new Error('Not a PDF Mini encrypted file.');
  const salt = bytes.slice(8, 24);
  const iv = bytes.slice(24, 36);
  const ct = bytes.slice(36);
  const key = await _pdfencDeriveKey(password, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new Uint8Array(pt).buffer;
  } catch (_) {
    throw new Error('Wrong password (or file corrupt).');
  }
}

function openPasswordModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordConfirm').value = '';
  document.getElementById('passwordError').textContent = '';
  document.getElementById('passwordShow').checked = false;
  document.getElementById('passwordInput').type = 'password';
  document.getElementById('passwordConfirm').type = 'password';
  document.getElementById('passwordModal').classList.add('show');
  setTimeout(() => document.getElementById('passwordInput').focus(), 50);
}
function closePasswordModal() {
  document.getElementById('passwordModal').classList.remove('show');
}
async function applyPassword() {
  const pwd = document.getElementById('passwordInput').value;
  const conf = document.getElementById('passwordConfirm').value;
  const err = document.getElementById('passwordError');
  err.textContent = '';
  if (!pwd) {
    err.textContent = 'Enter a password.';
    return;
  }
  if (pwd.length < 8) {
    err.textContent = 'Use at least 8 characters.';
    return;
  }
  if (pwd !== conf) {
    err.textContent = "Passwords don't match.";
    return;
  }
  const btn = document.getElementById('passwordEncrypt');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Encrypting…';
  try {
    const bytes = annotations.length ? await generatePdfBytes() : pdfBytes;
    const enc = await pdfencEncrypt(bytes, pwd);
    const blob = new Blob([enc], { type: 'application/octet-stream' });
    const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
    downloadBlob(blob, base + '.pdfenc');
    closePasswordModal();
    showToast(
      'Encrypted file downloaded. Reopen via the Open button — same app prompts for the password.',
      'success'
    );
  } catch (e) {
    console.error('[encrypt]', e);
    err.textContent = 'Encryption failed: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

function _promptAndDecryptPdfenc(bytes) {
  // Returns a Promise resolving to the decrypted ArrayBuffer, or null if cancelled.
  return new Promise((resolve) => {
    const modal = document.getElementById('passwordOpenModal');
    const input = document.getElementById('passwordOpenInput');
    const err = document.getElementById('passwordOpenError');
    input.value = '';
    err.textContent = '';
    modal.classList.add('show');
    setTimeout(() => input.focus(), 50);
    const onClose = (result) => {
      modal.classList.remove('show');
      document.getElementById('passwordOpenGo').onclick = null;
      document.getElementById('passwordOpenCancel').onclick = null;
      document.getElementById('passwordOpenClose').onclick = null;
      input.onkeydown = null;
      resolve(result);
    };
    const tryDecrypt = async () => {
      const pwd = input.value;
      if (!pwd) {
        err.textContent = 'Enter the password.';
        return;
      }
      document.getElementById('passwordOpenGo').disabled = true;
      try {
        const buf = await pdfencDecrypt(bytes, pwd);
        onClose(buf);
      } catch (e) {
        err.textContent = e.message || 'Decryption failed.';
      } finally {
        document.getElementById('passwordOpenGo').disabled = false;
      }
    };
    document.getElementById('passwordOpenGo').onclick = tryDecrypt;
    document.getElementById('passwordOpenCancel').onclick = () => onClose(null);
    document.getElementById('passwordOpenClose').onclick = () => onClose(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryDecrypt();
      }
    };
  });
}

// Wire UI
(function _initPasswordUI() {
  const c = document.getElementById('passwordClose');
  if (c) c.onclick = closePasswordModal;
  const cn = document.getElementById('passwordCancel');
  if (cn) cn.onclick = closePasswordModal;
  const enc = document.getElementById('passwordEncrypt');
  if (enc) enc.onclick = applyPassword;
  const show = document.getElementById('passwordShow');
  if (show)
    show.addEventListener('change', () => {
      const t = show.checked ? 'text' : 'password';
      document.getElementById('passwordInput').type = t;
      document.getElementById('passwordConfirm').type = t;
    });
  document.getElementById('passwordModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'passwordModal') closePasswordModal();
  });
  // Enter key submits
  document.getElementById('passwordConfirm')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyPassword();
    }
  });
})();
