// =====================================================================
// =====================  PAGE SETUP  ==================================
// =====================================================================
function openPageSetupModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('pageSetupModal').classList.add('show');
}
function closePageSetupModal() {
  document.getElementById('pageSetupModal').classList.remove('show');
}
function parsePageRange(spec, total) {
  spec = (spec || '').trim();
  if (spec === 'all' || spec === '') return Array.from({ length: total }, (_, i) => i + 1);
  if (spec === 'odd') return Array.from({ length: total }, (_, i) => i + 1).filter((p) => p % 2);
  if (spec === 'even') return Array.from({ length: total }, (_, i) => i + 1).filter((p) => p % 2 === 0);
  // Custom: "1-3,5,7-10"
  const out = new Set();
  for (const part of spec.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = parseInt(m[1]);
    const b = m[2] ? parseInt(m[2]) : a;
    for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}
function pageDecorationPos(name, pageW, pageH, lineW, lineH) {
  const margin = 36; // ~½ inch
  const padX = 16;
  let x, y;
  if (name.endsWith('left')) x = padX;
  else if (name.endsWith('right')) x = pageW - lineW - padX;
  else x = (pageW - lineW) / 2;
  if (name.startsWith('top'))
    y = margin - lineH; // y is top-of-text in design coords; we want margin from top
  else y = pageH - margin - lineH;
  // Convert to overlay coords: y means top of text annotation in design (Y down)
  y = Math.max(0, name.startsWith('top') ? margin : pageH - margin - lineH);
  return { x, y };
}
async function applyPageSetup() {
  if (!pdfJsDoc) return;
  const totalPages = pdfJsDoc.numPages;
  const rangeSel = document.getElementById('psRange').value;
  const fromTo = document.getElementById('psRangeFromTo').value;
  const pages = parsePageRange(rangeSel === 'range' ? fromTo : rangeSel, totalPages);
  dbg('[page-setup] range=', rangeSel, ' resolved pages=', pages.join(','));
  if (!pages.length) {
    showToast('No pages match the selected range.', 'warn');
    return;
  }

  const headerText = document.getElementById('psHeaderText').value;
  const headerPos = document.getElementById('psHeaderPos').value;
  const headerColor = document.getElementById('psHeaderColor').value;
  const headerSize = parseInt(document.getElementById('psHeaderSize').value) || 11;
  const footerText = document.getElementById('psFooterText').value;
  const footerPos = document.getElementById('psFooterPos').value;
  const footerColor = document.getElementById('psFooterColor').value;
  const footerSize = parseInt(document.getElementById('psFooterSize').value) || 10;
  const pnFormat = document.getElementById('psPnFormat').value;
  const pnPos = document.getElementById('psPnPos').value;
  const pnColor = document.getElementById('psPnColor').value;
  const pnSize = parseInt(document.getElementById('psPnSize').value) || 10;
  const pnSkipFirst = document.getElementById('psPnSkipFirst').checked;
  const wmText = document.getElementById('psWmText').value;
  const wmColor = document.getElementById('psWmColor').value;
  const wmSize = parseInt(document.getElementById('psWmSize').value) || 80;
  const wmRotation = parseFloat(document.getElementById('psWmRotation').value) || 0;
  const wmOpacity = parseFloat(document.getElementById('psWmOpacity').value) || 0.25;

  let createdCount = 0;
  const skippedPages = [];
  for (const pageNum of pages) {
    // Use Array.from on a fresh querySelectorAll so we always see the live DOM
    // and don't get confused by stale single-element queries.
    const allWrappers = Array.from(document.querySelectorAll('.page-wrapper'));
    const wrapper = allWrappers.find((w) => String(w.dataset.pageNum) === String(pageNum));
    if (!wrapper) {
      skippedPages.push(pageNum + ' (no wrapper)');
      continue;
    }
    const overlay = wrapper.querySelector('.overlay');
    if (!overlay) {
      skippedPages.push(pageNum + ' (no overlay)');
      continue;
    }
    // Re-read baseW/baseH on every iteration — different pages can have different sizes
    const baseW = parseFloat(wrapper.dataset.baseW);
    const baseH = parseFloat(wrapper.dataset.baseH);
    if (!baseW || !baseH || isNaN(baseW) || isNaN(baseH)) {
      skippedPages.push(pageNum + ' (bad size ' + baseW + 'x' + baseH + ')');
      continue;
    }
    let pageAdded = 0;
    if (headerText && headerText.trim()) {
      pageAdded += pageSetupCreateText(overlay, pageNum, headerText, {
        position: 'top-' + headerPos,
        color: headerColor,
        size: headerSize,
        pageW: baseW,
        pageH: baseH,
      });
    }
    if (footerText && footerText.trim()) {
      pageAdded += pageSetupCreateText(overlay, pageNum, footerText, {
        position: 'bottom-' + footerPos,
        color: footerColor,
        size: footerSize,
        pageW: baseW,
        pageH: baseH,
      });
    }
    if (pnFormat && pnFormat.trim() && !(pnSkipFirst && pageNum === 1)) {
      const text = pnFormat.replace(/\{n\}/g, String(pageNum)).replace(/\{total\}/g, String(totalPages));
      pageAdded += pageSetupCreateText(overlay, pageNum, text, {
        position: pnPos,
        color: pnColor,
        size: pnSize,
        pageW: baseW,
        pageH: baseH,
      });
    }
    if (wmText && wmText.trim()) {
      pageAdded += pageSetupCreateWatermark(overlay, pageNum, wmText, {
        color: wmColor,
        size: wmSize,
        rotation: wmRotation,
        opacity: wmOpacity,
        pageW: baseW,
        pageH: baseH,
      });
    }
    createdCount += pageAdded;
    dbg('[page-setup] page', pageNum, '→', pageAdded, 'decoration(s)');
  }
  if (skippedPages.length) {
    console.warn('[page-setup] skipped pages:', skippedPages.join(', '));
  }

  if (createdCount === 0) {
    showToast('Nothing to add — fill in at least one field.', 'warn');
    return;
  }
  closePageSetupModal();
  const skipNote = skippedPages.length ? ` (${skippedPages.length} skipped)` : '';
  showToast(
    `Added ${createdCount} decoration${createdCount === 1 ? '' : 's'} across ${pages.length} page${pages.length === 1 ? '' : 's'}${skipNote}.`,
    'success'
  );
  pushHistory('page-setup');
}

function pageSetupCreateText(overlay, pageNum, text, opts) {
  const fs = opts.size;
  // Estimate text width to position it (rough — width = chars * fs * 0.55)
  const approxW = Math.min(opts.pageW - 32, text.length * fs * 0.55 + 16);
  const lineH = fs * 1.5;
  const pos = pageDecorationPos(opts.position, opts.pageW, opts.pageH, approxW, lineH);
  const el = document.createElement('div');
  el.className = 'annotation text-annotation';
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
  el.style.fontSize = fs + 'px';
  overlay.appendChild(el);
  const ann = {
    type: 'text',
    pageNum,
    x: pos.x,
    y: pos.y,
    lines: [[{ text, color: opts.color, bold: false, italic: false, underline: false }]],
    fontSize: fs,
    noBackground: true,
    fontFamily: 'Helvetica',
    lineHeight: 1.15,
    align: 'left',
    width: approxW,
    height: lineH,
    el,
    fromPageSetup: true,
  };
  annotations.push(ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  // Adjust position post-measure (so 'right' aligns to actual width, not estimate)
  if (opts.position.endsWith('right')) {
    ann.x = opts.pageW - ann.width - 16;
    el.style.left = ann.x + 'px';
  } else if (opts.position.endsWith('center')) {
    ann.x = (opts.pageW - ann.width) / 2;
    el.style.left = ann.x + 'px';
  }
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  return 1;
}
function pageSetupCreateWatermark(overlay, pageNum, text, opts) {
  const fs = opts.size;
  const approxW = text.length * fs * 0.6;
  const lineH = fs * 1.2;
  const x = (opts.pageW - approxW) / 2;
  const y = (opts.pageH - lineH) / 2;
  const el = document.createElement('div');
  el.className = 'annotation text-annotation';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.fontSize = fs + 'px';
  el.style.opacity = String(opts.opacity);
  overlay.appendChild(el);
  const ann = {
    type: 'text',
    pageNum,
    x,
    y,
    lines: [[{ text, color: opts.color, bold: true, italic: false, underline: false }]],
    fontSize: fs,
    noBackground: true,
    fontFamily: 'Helvetica',
    lineHeight: 1.0,
    align: 'left',
    width: approxW,
    height: lineH,
    el,
    rotation: opts.rotation,
    opacity: opts.opacity,
    fromPageSetup: true,
  };
  annotations.push(ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  // Center after measure
  ann.x = (opts.pageW - ann.width) / 2;
  ann.y = (opts.pageH - ann.height) / 2;
  el.style.left = ann.x + 'px';
  el.style.top = ann.y + 'px';
  el.style.opacity = String(opts.opacity);
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  return 1;
}

document.getElementById('pageSetupBtn').addEventListener('click', openPageSetupModal);
document.getElementById('psClose').addEventListener('click', closePageSetupModal);
document.getElementById('psCancel').addEventListener('click', closePageSetupModal);
document.getElementById('psApply').addEventListener('click', applyPageSetup);
document.getElementById('pageSetupModal').addEventListener('click', (e) => {
  if (e.target.id === 'pageSetupModal') closePageSetupModal();
});
document.querySelectorAll('#pageSetupModal .tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('#pageSetupModal .tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('#pageSetupModal .ps-tab-body').forEach((b) => {
      b.hidden = b.dataset.psBody !== t.dataset.psTab;
    });
  });
});
document.getElementById('psRange').addEventListener('change', (e) => {
  document.getElementById('psRangeFromTo').style.display = e.target.value === 'range' ? '' : 'none';
});
document.getElementById('psWmOpacity').addEventListener('input', (e) => {
  document.getElementById('psWmOpacityVal').textContent = e.target.value;
});

