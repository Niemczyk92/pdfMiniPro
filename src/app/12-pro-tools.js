// =====================================================================
// =====================  PRO TOOLS  ===================================
// =====================================================================

// === 1. ZERO-TRUST SANITIZATION ===
function openSanitizeModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('sanStatus').textContent = '';
  document.getElementById('sanitizeModal').classList.add('show');
}
function closeSanitizeModal() {
  document.getElementById('sanitizeModal').classList.remove('show');
}
async function doSanitize() {
  const stripMeta = document.getElementById('sanStripMeta').checked;
  const flatten = document.getElementById('sanFlatten').checked;
  const rasterize = document.getElementById('sanRasterize').checked;
  const dpi = parseInt(document.getElementById('sanRasterDpi').value) || 150;
  const status = document.getElementById('sanStatus');
  const btn = document.getElementById('sanitizeGo');
  btn.disabled = true;
  const orig = btn.textContent;
  try {
    btn.textContent = 'Sanitizing…';
    status.textContent = 'Baking annotations…';
    // Step 1: bake annotations into the visible layer (flatten always happens during normal save)
    let bytes = flatten && annotations.length ? await generatePdfBytes() : pdfBytes;
    let doc = await PDFDocument.load(bytes.slice(0), PDF_LOAD_OPTS);

    if (stripMeta) {
      status.textContent = 'Stripping metadata…';
      try {
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
      } catch (_) {}
      try {
        doc.setProducer('PDF Mini Pro — sanitized');
        doc.setCreator('PDF Mini Pro');
      } catch (_) {}
      // Reset dates so creation history doesn't leak
      try {
        doc.setCreationDate(new Date());
        doc.setModificationDate(new Date());
      } catch (_) {}
      // Wipe non-standard Info dict entries + XMP + actions. Use the dict's
      // public iteration API (`.keys()`) — `.entries()` isn't on PDFDict.
      try {
        const { PDFName } = PDFLib;
        const info = doc.context.lookup(doc.context.trailerInfo.Info);
        if (info && typeof info.keys === 'function') {
          const keep = new Set([
            'Title',
            'Author',
            'Subject',
            'Keywords',
            'Producer',
            'Creator',
            'CreationDate',
            'ModDate',
          ]);
          const toDelete = [];
          for (const k of info.keys()) {
            const name = k && k.encodedName ? k.encodedName.replace(/^\//, '') : String(k);
            if (!keep.has(name)) toDelete.push(name);
          }
          for (const name of toDelete) {
            try {
              info.delete(PDFName.of(name));
            } catch (_) {}
          }
        }
        // Remove XMP metadata stream + name tree + auto-actions
        try {
          doc.catalog.delete(PDFName.of('Metadata'));
        } catch (_) {}
        try {
          doc.catalog.delete(PDFName.of('Names'));
        } catch (_) {}
        try {
          doc.catalog.delete(PDFName.of('OpenAction'));
        } catch (_) {}
        try {
          doc.catalog.delete(PDFName.of('AA'));
        } catch (_) {}
      } catch (e) {
        console.warn('[sanitize] info strip:', e);
      }
    }

    // Step 2: rasterize if requested — destroys text but guarantees nothing hidden
    if (rasterize) {
      status.textContent = 'Rasterizing pages…';
      const pdfjs = await loadPdfJsDoc(await doc.save({ useObjectStreams: false }));
      const newDoc = await PDFDocument.create();
      for (let i = 1; i <= pdfjs.numPages; i++) {
        btn.textContent = `Rasterizing… ${i}/${pdfjs.numPages}`;
        const page = await pdfjs.getPage(i);
        const vp = page.getViewport({ scale: dpi / 72 });
        const c = document.createElement('canvas');
        c.width = Math.ceil(vp.width);
        c.height = Math.ceil(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const jpeg = dataURLToBytes(c.toDataURL('image/jpeg', 0.92));
        const img = await newDoc.embedJpg(jpeg);
        const nat = page.getViewport({ scale: 1 });
        const np = newDoc.addPage([nat.width, nat.height]);
        np.drawImage(img, { x: 0, y: 0, width: nat.width, height: nat.height });
      }
      if (stripMeta) {
        try {
          newDoc.setProducer('PDF Mini Pro — sanitized');
          newDoc.setCreator('PDF Mini Pro');
        } catch (_) {}
      }
      doc = newDoc;
    }

    status.textContent = 'Writing output…';
    const out = await doc.save({ useObjectStreams: !rasterize });
    const blob = new Blob([out], { type: 'application/pdf' });
    const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
    downloadBlob(blob, base + '-sanitized.pdf');
    closeSanitizeModal();
    showToast('Sanitized PDF downloaded.', 'success');
  } catch (e) {
    console.error('[sanitize]', e);
    status.textContent = 'Failed: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// === 2. REGEX REDACT ===
function openRegexRedactModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('rxStatus').textContent = '';
  document.getElementById('rxLivePreview').innerHTML = '';
  document.getElementById('regexRedactModal').classList.add('show');
}
function closeRegexRedactModal() {
  document.getElementById('regexRedactModal').classList.remove('show');
}
// Last preset example the user clicked — drives the live preview row so they
// can see WHAT the pattern matches before applying it to the document.
let _rxLastExample = '';
function _rxUpdateLivePreview() {
  const out = document.getElementById('rxLivePreview');
  if (!out) return;
  const pat = document.getElementById('rxPattern').value.trim();
  if (!pat) {
    out.innerHTML = '';
    return;
  }
  const flags = 'g' + (document.getElementById('rxFlagI').checked ? 'i' : '');
  let re;
  try {
    re = new RegExp(pat, flags);
  } catch (e) {
    out.innerHTML =
      '<span style="color:var(--danger)">⚠ ' +
      window.t('rx.invalid', 'Invalid regex:') +
      ' ' +
      e.message +
      '</span>';
    return;
  }
  const sample = _rxLastExample || '';
  if (!sample) {
    out.innerHTML =
      '<span style="color:var(--success)">✓ ' +
      window.t(
        'rx.valid',
        'Pattern is valid. Click a preset to see a live match preview, or hit Preview matches.'
      ) +
      '</span>';
    return;
  }
  // Highlight matches inside the example
  let highlighted = '';
  let lastIdx = 0;
  let matchCount = 0;
  const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  let m;
  while ((m = re.exec(sample)) !== null) {
    matchCount++;
    highlighted += escapeHtml(sample.slice(lastIdx, m.index));
    highlighted +=
      '<mark style="background:#fde68a;color:#7c2d12;padding:1px 3px;border-radius:3px">' +
      escapeHtml(m[0]) +
      '</mark>';
    lastIdx = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // safety vs zero-width
  }
  highlighted += escapeHtml(sample.slice(lastIdx));
  const status = matchCount
    ? `<span style="color:var(--success)">✓ ${matchCount} ` +
      window.t('rx.matchInExample', 'match(es) in example:') +
      '</span>'
    : `<span style="color:var(--warn)">⚠ ` +
      window.t('rx.noMatchInExample', 'No match in example:') +
      '</span>';
  out.innerHTML =
    status + ' <span style="font-family:\'JetBrains Mono\',monospace">' + highlighted + '</span>';
}
// Wire input listeners once on DOMContentLoaded so the live preview reacts.
(function _wireRxLive() {
  const init = () => {
    const pat = document.getElementById('rxPattern');
    const flag = document.getElementById('rxFlagI');
    if (!pat || !flag) return;
    pat.addEventListener('input', _rxUpdateLivePreview);
    flag.addEventListener('change', _rxUpdateLivePreview);
    // Hook preset buttons to also stash their example for the live preview.
    document.querySelectorAll('#regexRedactModal [data-rx-preset]').forEach((b) => {
      b.addEventListener('click', () => {
        const ex = b.dataset.rxExample || '';
        if (ex) _rxLastExample = ex;
        // The original handler sets pat.value — trigger our preview after.
        setTimeout(_rxUpdateLivePreview, 0);
      });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
function _rxBuildRegex() {
  const status = document.getElementById('rxStatus');
  const pat = document.getElementById('rxPattern').value.trim();
  if (!pat) {
    status.textContent = '⚠ Type or pick a pattern first.';
    return null;
  }
  const flags = 'g' + (document.getElementById('rxFlagI').checked ? 'i' : '');
  try {
    return new RegExp(pat, flags);
  } catch (e) {
    status.textContent = '⚠ Invalid regex: ' + e.message;
    return null;
  }
}

// Find every PDF text item whose text matches the regex.
// Tries two strategies so we catch matches that span multiple text items too:
//  1. Per-item: regex tested against each item's own .dataset.text (catches matches inside one item).
//  2. Per-line: builds a left-to-right per-y-coord text line, finds match ranges, maps back to items.
function _rxFindMatchingItems(re) {
  const allItems = Array.from(document.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)'));
  if (!allItems.length) return { items: [], itemsAvailable: 0 };
  const hits = new Set();
  // Pass 1 — per-item
  for (const it of allItems) {
    const t = it.dataset.text || '';
    if (!t) continue;
    re.lastIndex = 0;
    if (re.test(t)) hits.add(it);
  }
  // Pass 2 — per-line (group items by overlay + similar yTop, then concat)
  const byOverlay = new Map();
  for (const it of allItems) {
    const ov = it.closest('.overlay');
    if (!ov) continue;
    if (!byOverlay.has(ov)) byOverlay.set(ov, []);
    byOverlay.get(ov).push(it);
  }
  for (const [ov, items] of byOverlay) {
    // Sort by y then x
    items.sort((a, b) => {
      const ay = parseFloat(a.dataset.y) || 0,
        by = parseFloat(b.dataset.y) || 0;
      if (Math.abs(ay - by) < 6) return (parseFloat(a.dataset.x) || 0) - (parseFloat(b.dataset.x) || 0);
      return ay - by;
    });
    // Cluster items into visual lines (by y proximity)
    const lines = [];
    let curLine = [];
    let curY = null;
    for (const it of items) {
      const y = parseFloat(it.dataset.y) || 0;
      const h = parseFloat(it.dataset.h) || 14;
      if (curY === null || Math.abs(y - curY) < h * 0.6) {
        curLine.push(it);
        if (curY === null) curY = y;
      } else {
        lines.push(curLine);
        curLine = [it];
        curY = y;
      }
    }
    if (curLine.length) lines.push(curLine);
    // For each line, build text + character→item map, then run regex
    for (const line of lines) {
      const ranges = []; // { start, end (exclusive), item }
      let cursor = 0;
      let lineText = '';
      let prevItem = null;
      for (const it of line) {
        const t = it.dataset.text || '';
        if (!t) continue;
        // Insert a space between items if there's a visible gap (so cards-like words "AB CD" aren't joined)
        if (prevItem) {
          const px = parseFloat(prevItem.dataset.x) || 0;
          const pw = parseFloat(prevItem.dataset.w) || 0;
          const cx = parseFloat(it.dataset.x) || 0;
          if (cx - (px + pw) > (parseFloat(it.dataset.h) || 14) * 0.25) {
            lineText += ' ';
            cursor += 1;
          }
        }
        ranges.push({ start: cursor, end: cursor + t.length, item: it });
        lineText += t;
        cursor += t.length;
        prevItem = it;
      }
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(lineText)) !== null) {
        const mStart = m.index,
          mEnd = mStart + m[0].length;
        for (const r of ranges) {
          if (r.end <= mStart || r.start >= mEnd) continue;
          hits.add(r.item);
        }
        if (m[0].length === 0) re.lastIndex++; // guard against zero-width infinite loops
      }
    }
  }
  return { items: Array.from(hits), itemsAvailable: allItems.length };
}

function regexRedactPreview() {
  const re = _rxBuildRegex();
  if (!re) return;
  const status = document.getElementById('rxStatus');
  document.querySelectorAll('.rx-preview-hit').forEach((el) => el.remove());
  const { items, itemsAvailable } = _rxFindMatchingItems(re);
  if (!itemsAvailable) {
    status.innerHTML =
      '⚠ No PDF text layer found. If this is a scanned image, run <strong>More → OCR</strong> first.';
    return;
  }
  for (const it of items) {
    const r = it.getBoundingClientRect();
    const overlay = it.closest('.overlay');
    if (!overlay) continue;
    const orect = overlay.getBoundingClientRect();
    const hl = document.createElement('div');
    hl.className = 'rx-preview-hit';
    hl.style.cssText = `position:absolute;left:${(r.left - orect.left) / currentZoom}px;top:${(r.top - orect.top) / currentZoom}px;width:${r.width / currentZoom}px;height:${r.height / currentZoom}px;background:rgba(220,38,38,0.30);border:1.5px solid #dc2626;pointer-events:none;z-index:90;border-radius:2px;animation:rxPulse 1s ease-in-out infinite alternate`;
    overlay.appendChild(hl);
  }
  status.innerHTML = items.length
    ? `<strong style="color:var(--accent)">${items.length}</strong> item${items.length === 1 ? '' : 's'} matched · scrolled into the document. Click <strong>Redact</strong> to remove permanently.`
    : `<strong style="color:var(--danger)">0</strong> matches in ${itemsAvailable} searchable items. Try toggling <em>Case-insensitive</em> or check the pattern.`;
  setTimeout(() => document.querySelectorAll('.rx-preview-hit').forEach((el) => el.remove()), 8000);
}

function regexRedactApply() {
  const re = _rxBuildRegex();
  if (!re) return;
  const { items, itemsAvailable } = _rxFindMatchingItems(re);
  if (!itemsAvailable) {
    showToast(
      window.t('toast.noTextLayer', 'No PDF text layer found. Run OCR first if this is a scan.'),
      'warn'
    );
    return;
  }
  let count = 0;
  for (const it of items) {
    const overlay = it.closest('.overlay');
    if (!overlay) continue;
    const pageNum = parseInt(it.dataset.pageNum);
    const x = parseFloat(it.dataset.x);
    const y = parseFloat(it.dataset.y);
    const w = parseFloat(it.dataset.w);
    const h = parseFloat(it.dataset.h);
    const bleed = 2;
    const el = document.createElement('div');
    el.className = 'redact-annotation';
    el.style.left = x - bleed + 'px';
    el.style.top = y - bleed + 'px';
    el.style.width = w + bleed * 2 + 'px';
    el.style.height = h + bleed * 2 + 'px';
    overlay.appendChild(el);
    const ann = {
      type: 'redact',
      pageNum,
      x: x - bleed,
      y: y - bleed,
      width: w + bleed * 2,
      height: h + bleed * 2,
      el,
    };
    if (typeof enableWhiteoutInteractions === 'function') enableWhiteoutInteractions(el, ann);
    annotations.push(ann);
    it.classList.add('pdf-text-item-consumed');
    it.style.visibility = 'hidden';
    count++;
  }
  if (count > 0) pushHistory('rx-redact');
  closeRegexRedactModal();
  if (count > 0)
    showToast(
      `${count} match${count === 1 ? '' : 'es'} redacted. Save the PDF to bake them in (metadata is auto-wiped on save).`,
      'success'
    );
  else showToast(window.t('toast.noMatches', 'No matches found.'), 'warn');
}

// === 3. TABLE → CSV EXTRACTION ===
let _tableExtractMode = false;
function openTableExtract() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  _tableExtractMode = true;
  showToast(
    window.t('toast.tablePick', 'Click and drag a rectangle over the table you want to extract.'),
    'info'
  );
  document.body.style.cursor = 'crosshair';
}
function _tableExtractFromRect(overlay, rect) {
  // rect: { x, y, w, h } in overlay coords
  const items = Array.from(overlay.querySelectorAll('.pdf-text-item'));
  const inside = [];
  for (const it of items) {
    const ix = parseFloat(it.dataset.x);
    const iy = parseFloat(it.dataset.y);
    const iw = parseFloat(it.dataset.w);
    const ih = parseFloat(it.dataset.h);
    const cx = ix + iw / 2;
    const cy = iy + ih / 2;
    if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
      inside.push({ x: ix, y: iy, w: iw, h: ih, text: it.dataset.text || '' });
    }
  }
  if (!inside.length) {
    showToast('No text found inside the rectangle.', 'warn');
    return;
  }
  // Cluster by row (y-coordinate) using a tolerance derived from item heights
  const avgH = inside.reduce((s, i) => s + i.h, 0) / inside.length;
  inside.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  let curRow = [];
  let curY = inside[0].y;
  for (const it of inside) {
    if (Math.abs(it.y - curY) > avgH * 0.6) {
      if (curRow.length) rows.push(curRow);
      curRow = [];
      curY = it.y;
    }
    curRow.push(it);
  }
  if (curRow.length) rows.push(curRow);
  // Determine column boundaries from the union of x ranges across rows
  const colSeeds = [];
  for (const row of rows) for (const it of row) colSeeds.push(it.x);
  colSeeds.sort((a, b) => a - b);
  const cols = [];
  const colTol = avgH * 1.2;
  for (const cx of colSeeds) {
    if (!cols.length || cx - cols[cols.length - 1] > colTol) cols.push(cx);
  }
  // Place each row's items into the nearest column
  const csvRows = rows.map((row) => {
    const cells = cols.map(() => '');
    row.sort((a, b) => a.x - b.x);
    for (const it of row) {
      let bestCol = 0,
        bestDist = Infinity;
      for (let c = 0; c < cols.length; c++) {
        const d = Math.abs(it.x - cols[c]);
        if (d < bestDist) {
          bestDist = d;
          bestCol = c;
        }
      }
      cells[bestCol] = (cells[bestCol] ? cells[bestCol] + ' ' : '') + it.text;
    }
    return cells;
  });
  // CSV escape
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = csvRows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
  downloadBlob(blob, base + '-table.csv');
  showToast(`Extracted ${csvRows.length} rows × ${cols.length} cols → CSV downloaded.`, 'success');
}
(function _initTableExtractDragSelect() {
  // Listen at document capture so it works regardless of currentTool
  let start = null,
    preview = null,
    overlay = null;
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!_tableExtractMode) return;
      const ov = e.target.closest && e.target.closest('.overlay');
      if (!ov) return;
      e.preventDefault();
      e.stopPropagation();
      overlay = ov;
      const r = ov.getBoundingClientRect();
      start = { x: (e.clientX - r.left) / currentZoom, y: (e.clientY - r.top) / currentZoom };
      preview = document.createElement('div');
      preview.style.cssText = `position:absolute;left:${start.x}px;top:${start.y}px;width:0;height:0;background:rgba(37,99,235,0.18);border:1.5px dashed #2563eb;z-index:100;pointer-events:none`;
      ov.appendChild(preview);
      try {
        ov.setPointerCapture(e.pointerId);
      } catch (_) {}
    },
    true
  );
  document.addEventListener(
    'pointermove',
    (e) => {
      if (!start || !preview || !overlay) return;
      const r = overlay.getBoundingClientRect();
      const cx = (e.clientX - r.left) / currentZoom;
      const cy = (e.clientY - r.top) / currentZoom;
      const x = Math.min(start.x, cx),
        y = Math.min(start.y, cy);
      const w = Math.abs(cx - start.x),
        h = Math.abs(cy - start.y);
      preview.style.left = x + 'px';
      preview.style.top = y + 'px';
      preview.style.width = w + 'px';
      preview.style.height = h + 'px';
    },
    true
  );
  document.addEventListener(
    'pointerup',
    (e) => {
      if (!start || !preview || !overlay) return;
      const r = overlay.getBoundingClientRect();
      const cx = (e.clientX - r.left) / currentZoom;
      const cy = (e.clientY - r.top) / currentZoom;
      const rect = {
        x: Math.min(start.x, cx),
        y: Math.min(start.y, cy),
        w: Math.abs(cx - start.x),
        h: Math.abs(cy - start.y),
      };
      preview.remove();
      if (rect.w > 20 && rect.h > 20) _tableExtractFromRect(overlay, rect);
      start = null;
      preview = null;
      overlay = null;
      _tableExtractMode = false;
      document.body.style.cursor = '';
    },
    true
  );
})();

// === 4. PDF DIFF — side-by-side visual ===
// Both PDFs are rendered to canvas; text items are extracted with positions; an
// item-level LCS marks which items survived (eq) vs were only-in-A (del) vs
// only-in-B (add). Coloured boxes are overlaid on each pane at the items'
// real positions so the user sees the change *where it lives* in the document.
let _diffBytesA = null,
  _diffBytesB = null;
const DIFF_RENDER_SCALE = 1.2;

async function _diffExtractWithPositions(bytes) {
  // Returns { pages: [ { width, height, items: [ { x, yTop, w, h, text } ] } ] }
  const doc = await loadPdfJsDoc(bytes.slice(0));
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale: DIFF_RENDER_SCALE });
    const tc = await p.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      const h = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
      const txXMag = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
      const itemXMag = Math.sqrt(it.transform[0] * it.transform[0] + it.transform[1] * it.transform[1]) || 1;
      const widthPx = (it.width || 0) * (txXMag / itemXMag);
      items.push({
        x: tx[4],
        yTop: tx[5] - h,
        w: widthPx,
        h: h * 1.2,
        text: it.str,
      });
    }
    pages.push({ width: vp.width, height: vp.height, items, page: p, viewport: vp });
  }
  return { doc, pages };
}

// Item-level LCS. A and B are arrays of strings (the .text of each item).
// Returns parallel arrays `tagsA` / `tagsB`: each entry is 'eq' or 'del'/'add'.
function _diffItemTags(A, B) {
  const m = A.length,
    n = B.length;
  // Cap to avoid OOM. 2M cells = ~8 MB Int32Array.
  if (m * n > 2_000_000) {
    // Fall back to identity diff: any item present in the other array (by exact text)
    // is treated as 'eq'; everything else 'del'/'add'. Cheap but inaccurate for repeats.
    const setB = new Set(B);
    const setA = new Set(A);
    return {
      tagsA: A.map((t) => (setB.has(t) ? 'eq' : 'del')),
      tagsB: B.map((t) => (setA.has(t) ? 'eq' : 'add')),
      tooLarge: true,
    };
  }
  const W = n + 1;
  const dp = new Int32Array((m + 1) * W);
  for (let i = 1; i <= m; i++) {
    const rb = i * W,
      pb = (i - 1) * W;
    const ai = A[i - 1];
    for (let j = 1; j <= n; j++) {
      if (ai === B[j - 1]) dp[rb + j] = dp[pb + (j - 1)] + 1;
      else {
        const u = dp[pb + j],
          l = dp[rb + (j - 1)];
        dp[rb + j] = u > l ? u : l;
      }
    }
  }
  const tagsA = new Array(m).fill('del');
  const tagsB = new Array(n).fill('add');
  let i = m,
    j = n;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      tagsA[i - 1] = 'eq';
      tagsB[j - 1] = 'eq';
      i--;
      j--;
    } else if (dp[i * W + (j - 1)] >= dp[(i - 1) * W + j]) {
      j--;
    } else {
      i--;
    }
  }
  return { tagsA, tagsB, tooLarge: false };
}

async function _diffRenderPane(extracted, tags, paneEl, side) {
  paneEl.innerHTML = '';
  let flatIdx = 0; // running index into the flat tags array (matches the order items were flattened)
  for (let pi = 0; pi < extracted.pages.length; pi++) {
    const pg = extracted.pages[pi];
    // Wrapper holds canvas + absolutely-positioned highlight overlay
    const wrap = document.createElement('div');
    wrap.className = 'diff-page-wrap';
    wrap.style.cssText = `position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.15);width:${pg.width}px;height:${pg.height}px;max-width:100%`;
    const canvas = document.createElement('canvas');
    canvas.width = pg.width;
    canvas.height = pg.height;
    canvas.style.cssText = 'width:100%;height:auto;display:block';
    wrap.appendChild(canvas);
    const overlay = document.createElement('div');
    overlay.className = 'diff-overlay';
    overlay.style.cssText = `position:absolute;left:0;top:0;width:${pg.width}px;height:${pg.height}px;pointer-events:none`;
    wrap.appendChild(overlay);
    const pageLbl = document.createElement('div');
    pageLbl.textContent = `Page ${pi + 1} / ${extracted.pages.length}`;
    pageLbl.style.cssText =
      'font-size:11px;color:var(--muted);font-family:JetBrains Mono, monospace;align-self:flex-start;padding:2px 4px';
    paneEl.appendChild(pageLbl);
    paneEl.appendChild(wrap);
    // Render page
    await pg.page.render({ canvasContext: canvas.getContext('2d'), viewport: pg.viewport }).promise;
    // Paint highlights for items that aren't 'eq'
    for (const it of pg.items) {
      const tag = tags[flatIdx++];
      if (tag === 'eq') continue;
      const hl = document.createElement('div');
      const isAdd = tag === 'add';
      hl.style.cssText = `position:absolute;left:${it.x - 1}px;top:${it.yTop - 1}px;width:${it.w + 2}px;height:${it.h + 2}px;background:${isAdd ? 'rgba(34,197,94,0.30)' : 'rgba(220,38,38,0.30)'};border:1.5px solid ${isAdd ? '#16a34a' : '#dc2626'};border-radius:2px;box-sizing:border-box`;
      hl.title = (isAdd ? 'Added: ' : 'Removed: ') + it.text;
      overlay.appendChild(hl);
    }
  }
}

function _escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openDiffModal() {
  _diffBytesA = null;
  _diffBytesB = null;
  document.getElementById('diffNameA').textContent = window.t('diff.origPick', 'Original — click to pick');
  document.getElementById('diffNameB').textContent = window.t('diff.updPick', 'Updated — click to pick');
  document.getElementById('diffStatus').textContent = '';
  document.getElementById('diffPaneA').innerHTML = '';
  document.getElementById('diffPaneB').innerHTML = '';
  document.getElementById('diffGo').disabled = true;
  document.getElementById('diffModal').classList.add('show');
}
function closeDiffModal() {
  document.getElementById('diffModal').classList.remove('show');
}

async function runDiff() {
  const status = document.getElementById('diffStatus');
  const paneA = document.getElementById('diffPaneA');
  const paneB = document.getElementById('diffPaneB');
  paneA.innerHTML = '';
  paneB.innerHTML = '';
  if (!_diffBytesA || !_diffBytesB) {
    status.textContent = 'Pick both files first.';
    return;
  }
  const btn = document.getElementById('diffGo');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Extracting…';
  try {
    status.textContent = 'Extracting text + positions from both PDFs…';
    const [extA, extB] = await Promise.all([
      _diffExtractWithPositions(_diffBytesA),
      _diffExtractWithPositions(_diffBytesB),
    ]);
    // Flatten items into 1D arrays of text for LCS
    const flatA = [];
    for (const pg of extA.pages) for (const it of pg.items) flatA.push(it.text);
    const flatB = [];
    for (const pg of extB.pages) for (const it of pg.items) flatB.push(it.text);
    status.textContent = `Original: ${flatA.length} items · Updated: ${flatB.length} items · computing diff…`;
    btn.textContent = 'Diffing…';
    // Yield to the browser so the status update repaints before the (potentially heavy) DP
    await new Promise((r) => setTimeout(r, 20));
    const { tagsA, tagsB, tooLarge } = _diffItemTags(flatA, flatB);
    const removed = tagsA.filter((t) => t !== 'eq').length;
    const added = tagsB.filter((t) => t !== 'eq').length;
    btn.textContent = 'Rendering…';
    await Promise.all([_diffRenderPane(extA, tagsA, paneA, 'A'), _diffRenderPane(extB, tagsB, paneB, 'B')]);
    const note = tooLarge
      ? ' <span style="color:var(--warn,#d97706)">(fast set-diff used — LCS would exceed memory)</span>'
      : '';
    status.innerHTML = `<strong style="color:#dc2626">${removed}</strong> item${removed === 1 ? '' : 's'} removed · <strong style="color:#16a34a">${added}</strong> added${note}`;
  } catch (e) {
    console.error('[diff]', e);
    status.textContent = 'Diff failed: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// Sync-scroll wiring for the two diff panes
(function _initDiffSyncScroll() {
  let syncing = false;
  const paneA = () => document.getElementById('diffPaneA');
  const paneB = () => document.getElementById('diffPaneB');
  const onScroll = (src, dst) => () => {
    if (!document.getElementById('diffSyncScroll')?.checked) return;
    if (syncing) return;
    syncing = true;
    const a = src(),
      b = dst();
    if (a && b) {
      const ratio = a.scrollHeight > a.clientHeight ? a.scrollTop / (a.scrollHeight - a.clientHeight) : 0;
      b.scrollTop = ratio * (b.scrollHeight - b.clientHeight);
    }
    requestAnimationFrame(() => {
      syncing = false;
    });
  };
  // Bind after modal is in DOM
  setTimeout(() => {
    const a = paneA(),
      b = paneB();
    if (a) a.addEventListener('scroll', onScroll(paneA, paneB));
    if (b) b.addEventListener('scroll', onScroll(paneB, paneA));
  }, 100);
})();

// === 5. JSON FORM FILL ===
function openJsonFillModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('jsonFillStatus').textContent = '';
  document.getElementById('jsonFillModal').classList.add('show');
}
function closeJsonFillModal() {
  document.getElementById('jsonFillModal').classList.remove('show');
}
function _jsonFillParseInput() {
  const txt = document.getElementById('jsonFillPayload').value.trim();
  if (!txt) return { error: 'Paste a JSON object or array.' };
  try {
    return { data: JSON.parse(txt) };
  } catch (e) {
    return { error: 'Invalid JSON: ' + e.message };
  }
}
async function _jsonFillGetFields() {
  // Extract form field names from current pdfBytes
  try {
    const doc = await PDFDocument.load(pdfBytes.slice(0), PDF_LOAD_OPTS);
    const form = doc.getForm();
    return form.getFields().map((f) => ({
      name: f.getName(),
      type: f.constructor.name,
    }));
  } catch (e) {
    console.warn('[jsonFill] form load:', e);
    return [];
  }
}
async function jsonFillPreview() {
  const p = _jsonFillParseInput();
  const status = document.getElementById('jsonFillStatus');
  if (p.error) {
    status.textContent = p.error;
    return;
  }
  const fields = await _jsonFillGetFields();
  if (!fields.length) {
    status.textContent =
      'This PDF has no AcroForm fields. (Filled-PDF feature only works on form-enabled PDFs.)';
    return;
  }
  const data = Array.isArray(p.data) ? p.data[0] || {} : p.data;
  const keys = Object.keys(data);
  const matches = [];
  for (const f of fields) {
    const fn = f.name.toLowerCase();
    const k = keys.find((kk) => fn.includes(kk.toLowerCase()) || kk.toLowerCase().includes(fn));
    matches.push({ field: f.name, jsonKey: k || '(no match)', value: k ? data[k] : '' });
  }
  status.innerHTML =
    `<strong>${fields.length} fields, ${matches.filter((m) => m.jsonKey !== '(no match)').length} matched:</strong><br>` +
    matches
      .map(
        (m) =>
          `<code style="color:${m.jsonKey === '(no match)' ? 'var(--danger)' : 'var(--accent)'}">${m.field}</code> ← <code>${m.jsonKey}</code>${m.value !== undefined ? ` = "${String(m.value).slice(0, 40)}"` : ''}`
      )
      .join('<br>');
}
async function jsonFillApply() {
  const p = _jsonFillParseInput();
  const status = document.getElementById('jsonFillStatus');
  if (p.error) {
    status.textContent = p.error;
    return;
  }
  const btn = document.getElementById('jsonFillGo');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Filling…';
  try {
    const records = Array.isArray(p.data) ? p.data : [p.data];
    let totalFilled = 0;
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const doc = await PDFDocument.load(pdfBytes.slice(0), PDF_LOAD_OPTS);
      const form = doc.getForm();
      const fields = form.getFields();
      const recKeys = Object.keys(rec);
      let filled = 0;
      for (const f of fields) {
        const fn = f.getName().toLowerCase();
        const k = recKeys.find((kk) => fn.includes(kk.toLowerCase()) || kk.toLowerCase().includes(fn));
        if (!k) continue;
        const v = rec[k];
        try {
          if (f.constructor.name === 'PDFCheckBox') {
            if (v) f.check();
            else f.uncheck();
          } else if (f.constructor.name === 'PDFRadioGroup') {
            f.select(String(v));
          } else if (f.constructor.name === 'PDFDropdown' || f.constructor.name === 'PDFOptionList') {
            f.select(String(v));
          } else {
            f.setText(String(v));
          }
          filled++;
        } catch (_) {}
      }
      totalFilled += filled;
      const bytes = await doc.save();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
      const suffix =
        records.length > 1
          ? `-filled-${String(i + 1).padStart(String(records.length).length, '0')}`
          : '-filled';
      downloadBlob(blob, base + suffix + '.pdf');
      if (records.length > 1 && i < records.length - 1) await new Promise((r) => setTimeout(r, 120));
    }
    closeJsonFillModal();
    showToast(
      `Filled ${totalFilled} fields across ${records.length} document${records.length === 1 ? '' : 's'}.`,
      'success'
    );
  } catch (e) {
    console.error('[jsonFill]', e);
    status.textContent = 'Failed: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// === Wire Pro tools UI ===
(function _initProTools() {
  // Sanitize
  document.getElementById('sanitizeBtnMenu')?.addEventListener('click', () => {
    closeAllDropdowns && closeAllDropdowns();
    openSanitizeModal();
  });
  document.getElementById('sanitizeClose')?.addEventListener('click', closeSanitizeModal);
  document.getElementById('sanitizeCancel')?.addEventListener('click', closeSanitizeModal);
  document.getElementById('sanitizeGo')?.addEventListener('click', doSanitize);
  document.getElementById('sanitizeModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'sanitizeModal') closeSanitizeModal();
  });

  // RegEx redact
  document.getElementById('regexRedactBtnMenu')?.addEventListener('click', () => {
    closeAllDropdowns && closeAllDropdowns();
    openRegexRedactModal();
  });
  document.getElementById('regexRedactClose')?.addEventListener('click', closeRegexRedactModal);
  document.getElementById('regexRedactCancel')?.addEventListener('click', closeRegexRedactModal);
  document.getElementById('rxPreview')?.addEventListener('click', regexRedactPreview);
  document.getElementById('regexRedactGo')?.addEventListener('click', regexRedactApply);
  document.querySelectorAll('[data-rx-preset]').forEach((b) => {
    b.addEventListener('click', () => {
      document.getElementById('rxPattern').value = b.dataset.rxPreset;
    });
  });

  // Table extract
  document.getElementById('tableExtractBtnMenu')?.addEventListener('click', () => {
    closeAllDropdowns && closeAllDropdowns();
    openTableExtract();
  });

  // Diff
  document.getElementById('diffBtnMenu')?.addEventListener('click', () => {
    closeAllDropdowns && closeAllDropdowns();
    openDiffModal();
  });
  document.getElementById('diffClose')?.addEventListener('click', closeDiffModal);
  document.getElementById('diffCancel')?.addEventListener('click', closeDiffModal);
  document.getElementById('diffGo')?.addEventListener('click', runDiff);
  const dA = document.getElementById('diffFileA');
  if (dA)
    dA.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      _diffBytesA = new Uint8Array(await f.arrayBuffer());
      document.getElementById('diffNameA').textContent = f.name;
      document.getElementById('diffGo').disabled = !(_diffBytesA && _diffBytesB);
    });
  const dB = document.getElementById('diffFileB');
  if (dB)
    dB.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      _diffBytesB = new Uint8Array(await f.arrayBuffer());
      document.getElementById('diffNameB').textContent = f.name;
      document.getElementById('diffGo').disabled = !(_diffBytesA && _diffBytesB);
    });

  // JSON fill
  document.getElementById('jsonFillBtnMenu')?.addEventListener('click', () => {
    closeAllDropdowns && closeAllDropdowns();
    openJsonFillModal();
  });
  document.getElementById('jsonFillClose')?.addEventListener('click', closeJsonFillModal);
  document.getElementById('jsonFillCancel')?.addEventListener('click', closeJsonFillModal);
  document.getElementById('jsonFillPreview')?.addEventListener('click', jsonFillPreview);
  document.getElementById('jsonFillGo')?.addEventListener('click', jsonFillApply);
})();

// === SPLIT PDF (standalone, not via Organize) ===
let _splitMode = 'ranges';
function openSplitModal() {
  const modal = document.getElementById('splitModal');
  const total = pdfJsDoc ? pdfJsDoc.numPages : 1;
  document.getElementById('splitRangesHint').textContent = `(pages 1–${total})`;
  document.getElementById('splitRangesInput').placeholder =
    total > 6 ? `e.g. 1-3, 4-${Math.min(6, total)}, ${Math.min(7, total)}-${total}` : `e.g. 1-${total}`;
  document.getElementById('splitEveryInput').max = String(Math.max(1, total));
  modal.classList.add('show');
  _splitMode = 'ranges';
  document.querySelectorAll('#splitModal .split-mode').forEach((c) => {
    c.classList.toggle('active', c.dataset.mode === _splitMode);
    c.onclick = () => {
      _splitMode = c.dataset.mode;
      document
        .querySelectorAll('#splitModal .split-mode')
        .forEach((x) => x.classList.toggle('active', x === c));
      document.getElementById('splitRangesRow').hidden = _splitMode !== 'ranges';
      document.getElementById('splitEveryRow').hidden = _splitMode !== 'every';
    };
  });
  document.getElementById('splitRangesRow').hidden = false;
  document.getElementById('splitEveryRow').hidden = true;
  document.getElementById('splitClose').onclick = closeSplitModal;
  document.getElementById('splitCancel').onclick = closeSplitModal;
  document.getElementById('splitModal').onclick = (e) => {
    if (e.target.id === 'splitModal') closeSplitModal();
  };
  document.getElementById('splitGo').onclick = doSplit;
}
function closeSplitModal() {
  document.getElementById('splitModal').classList.remove('show');
}

// "1-3, 5, 7-10" → [[1,2,3],[5],[7,8,9,10]] (1-indexed). Skips invalid / out-of-range parts silently.
function parseRangesInput(text, total) {
  const groups = [];
  for (const raw of String(text || '').split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) continue;
    let a = parseInt(m[1], 10),
      b = m[2] ? parseInt(m[2], 10) : a;
    if (a > b) [a, b] = [b, a];
    a = Math.max(1, a);
    b = Math.min(total, b);
    if (a > total) continue;
    const indices = [];
    for (let i = a; i <= b; i++) indices.push(i);
    if (indices.length) groups.push(indices);
  }
  return groups;
}

async function doSplit() {
  const goBtn = document.getElementById('splitGo');
  const orig = goBtn.textContent;
  goBtn.disabled = true;
  goBtn.textContent = 'Splitting…';
  try {
    // Use annotation-baked bytes if there are annotations; otherwise raw pdfBytes.
    const sourceBytes = annotations.length ? await generatePdfBytes() : pdfBytes;
    const srcDoc = await PDFDocument.load(sourceBytes.slice(0), PDF_LOAD_OPTS);
    const total = srcDoc.getPageCount();

    // Build group list (each group → one output PDF). 1-indexed in UI, convert to 0-indexed for pdf-lib.
    let groups = [];
    if (_splitMode === 'ranges') {
      groups = parseRangesInput(document.getElementById('splitRangesInput').value, total);
      if (!groups.length) {
        showToast('No valid page ranges. Try something like "1-3, 5".', 'warn');
        return;
      }
    } else if (_splitMode === 'every') {
      const n = Math.max(1, parseInt(document.getElementById('splitEveryInput').value, 10) || 1);
      for (let i = 1; i <= total; i += n) {
        const chunk = [];
        for (let j = i; j < i + n && j <= total; j++) chunk.push(j);
        groups.push(chunk);
      }
    } else {
      // 'each'
      for (let i = 1; i <= total; i++) groups.push([i]);
    }

    const base = (pdfFileName || 'document.pdf').replace(/\.pdf$/i, '');
    let pad = String(groups.length).length;
    for (let g = 0; g < groups.length; g++) {
      const indices = groups[g];
      goBtn.textContent = `Splitting… ${g + 1}/${groups.length}`;
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(
        srcDoc,
        indices.map((i) => i - 1)
      );
      for (const p of copied) newDoc.addPage(p);
      const out = await newDoc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const label =
        indices.length === 1
          ? `p${String(indices[0]).padStart(pad, '0')}`
          : `p${String(indices[0]).padStart(pad, '0')}-${String(indices[indices.length - 1]).padStart(pad, '0')}`;
      downloadBlob(blob, `${base}-${label}.pdf`);
      // Tiny pause between downloads — some browsers throttle bursts.
      if (g < groups.length - 1) await new Promise((r) => setTimeout(r, 150));
    }
    closeSplitModal();
    showToast(`Split into ${groups.length} file${groups.length === 1 ? '' : 's'}.`, 'success');
  } catch (e) {
    console.error('[split]', e);
    showToast('Split failed: ' + (e.message || e), 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = orig;
  }
}
const _compressMainBtn = document.getElementById('compressMainBtn');
if (_compressMainBtn) {
  _compressMainBtn.addEventListener('click', () => {
    if (!pdfJsDoc) {
      showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
      return;
    }
    bumpUsage && bumpUsage('compress:main');
    openCompressModal();
  });
}
