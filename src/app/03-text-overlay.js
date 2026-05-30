// === RICH TEXT HELPERS ===
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function linesToHtml(lines) {
  if (!lines || !lines.length) return '<div><br></div>';
  return lines
    .map((line) => {
      if (line.length === 0 || line.every((s) => !s.text)) return '<div><br></div>';
      const inner = line
        .map((seg) => {
          if (!seg.text) return '';
          const styles = [];
          if (seg.color && seg.color.toLowerCase() !== '#000000') styles.push('color:' + seg.color);
          if (seg.bold) styles.push('font-weight:700');
          if (seg.italic) styles.push('font-style:italic');
          if (seg.underline) styles.push('text-decoration:underline');
          const txt = escapeHtml(seg.text).replace(/ /g, '&nbsp;');
          if (styles.length) return `<span style="${styles.join(';')}">${txt}</span>`;
          return txt;
        })
        .join('');
      return '<div>' + (inner || '<br>') + '</div>';
    })
    .join('');
}

function htmlToLines(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const lines = [[]];
  function pushSeg(text, style) {
    if (!text) return;
    const cur = lines[lines.length - 1];
    if (cur.length) {
      const last = cur[cur.length - 1];
      if (
        last.color === style.color &&
        last.bold === style.bold &&
        last.italic === style.italic &&
        last.underline === style.underline
      ) {
        last.text += text;
        return;
      }
    }
    cur.push({
      text,
      color: style.color,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
    });
  }
  function walk(node, style) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushSeg(node.textContent.replace(/\u00A0/g, ' '), style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      lines.push([]);
      return;
    }
    const isBlock = tag === 'div' || tag === 'p';
    if (isBlock && lines[lines.length - 1].length > 0) lines.push([]);
    const ns = { ...style };
    if (tag === 'b' || tag === 'strong') ns.bold = true;
    if (tag === 'i' || tag === 'em') ns.italic = true;
    if (tag === 'u') ns.underline = true;
    if (node.style) {
      const c = node.style.color;
      if (c) ns.color = cssColorToHex(c);
      const w = node.style.fontWeight;
      if (w && (w === 'bold' || w === 'bolder' || parseInt(w) >= 600)) ns.bold = true;
      if (node.style.fontStyle === 'italic') ns.italic = true;
      if (node.style.textDecoration && node.style.textDecoration.includes('underline')) ns.underline = true;
      if (node.style.textDecorationLine && node.style.textDecorationLine.includes('underline'))
        ns.underline = true;
    }
    const fontColorAttr = node.getAttribute && node.getAttribute('color');
    if (fontColorAttr) ns.color = cssColorToHex(fontColorAttr);
    for (const ch of Array.from(node.childNodes)) walk(ch, ns);
  }
  for (const ch of Array.from(wrapper.childNodes))
    walk(ch, { color: '#000000', bold: false, italic: false, underline: false });
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines.length ? lines : [[]];
}

function cssColorToHex(c) {
  if (!c) return '#000000';
  c = c.trim();
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return c.toLowerCase();
  }
  if (c.startsWith('rgb')) {
    const m = c.match(/\d+/g);
    if (m && m.length >= 3)
      return '#' + ((1 << 24) + (+m[0] << 16) + (+m[1] << 8) + +m[2]).toString(16).slice(1);
  }
  const named = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff' };
  return named[c.toLowerCase()] || c;
}

function isLinesEmpty(lines) {
  return !lines || !lines.length || lines.every((l) => l.length === 0 || l.every((s) => !s.text));
}

// Pro: font-family CSS lookup + line height + alignment helpers
// Editor CSS family stacks must lead with the same Noto face we embed at save
// time (Noto Sans / Noto Serif / Noto Sans Mono) — otherwise the editor wraps
// using a system font (Arial/Times) while the PDF wraps using Noto, and the
// saved/printed output diverges from what the user sees on screen.
const TEXT_FONT_FAMILIES = {
  Helvetica: '"Noto Sans PdfMini", Helvetica, Arial, sans-serif',
  'Times-Roman': '"Noto Serif PdfMini", Times, "Times New Roman", serif',
  Courier: '"Noto Mono PdfMini", "Courier New", Courier, monospace',
};
function applyTextAnnotationStyle(el, ann) {
  // Defensive clamp: a corrupted ann.fontSize (NaN, Infinity, absurdly large from
  // an OCR / Find-Replace edge case) would render as a page-sized text block
  // that the user cannot resize back down via the normal handles. Cap at 200 CSS
  // px (≈ 125 pt PDF at scale 1.6) which is larger than any legitimate body text
  // but small enough to stay editable.
  if (!isFinite(ann.fontSize) || ann.fontSize > 200 || ann.fontSize < 4) {
    console.warn('[text] clamped invalid fontSize', ann.fontSize, '→ 14');
    ann.fontSize = 14;
  }
  el.style.fontSize = ann.fontSize + 'px';
  el.style.fontFamily = TEXT_FONT_FAMILIES[ann.fontFamily || 'Helvetica'] || TEXT_FONT_FAMILIES.Helvetica;
  el.style.lineHeight = String(ann.lineHeight || 1.15);
  el.style.textAlign = ann.align || 'left';
  el.classList.toggle('no-bg', !!ann.noBackground);
  el.classList.toggle('from-pdf-edit', !!ann.fromPdfEdit);
  el.style.transform = ann.rotation ? `rotate(${ann.rotation}deg)` : '';
  el.dataset.rotation = Math.round(ann.rotation || 0);
  // Cap max-width to (wrapper_width − ann.x − safety) so text positioned on
  // the right side of the page can never stretch past the right edge. The
  // CSS rule alone (max-width:100%) is relative to the containing block (the
  // wrapper) and IGNORES the element's own `left` offset — without this JS
  // clamp, a box at x=200 on an 800-wide wrapper could grow to 800 px wide
  // and overflow the page. This is the "breaks past ~90% page width" bug
  // the user reported in v1.31. Applied here so every render path
  // (creation, resize, history undo, page-restore) gets it consistently.
  const overlay = el.parentElement;
  if (ann.fromPdfEdit) {
    // Edit-PDF replacements must keep the original single-line footprint (see
    // the .from-pdf-edit nowrap rule). The page-edge clamp below would force a
    // wider substitute font to wrap; clear it so the box sizes to the content.
    el.style.maxWidth = 'none';
  } else if (overlay && overlay.offsetWidth && Number.isFinite(ann.x)) {
    const maxW = Math.max(40, overlay.offsetWidth - ann.x - 4);
    el.style.maxWidth = maxW + 'px';
  }
  // Re-sync opacity from the annotation model so watermarks survive every re-render.
  if (ann.opacity != null && ann.opacity < 1) el.style.opacity = String(ann.opacity);
  else if (el.style.opacity && el.style.opacity !== '1' && ann.opacity == null) el.style.opacity = '';
}
function renderTextAnnotation(ann) {
  // innerHTML wipes ALL children, including the resize / rotate handles we
  // attached in openTextEditor (or earlier). Re-add them afterwards so the
  // annotation stays interactive — addTextHandles is idempotent and skips
  // from-PDF-edit annotations on its own.
  ann.el.innerHTML = linesToHtml(ann.lines);
  applyTextAnnotationStyle(ann.el, ann);
  addTextHandles(ann.el, ann);
}

// === OVERLAY INTERACTION (text + click-through) ===
function setupOverlay(overlay, pageNum) {
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target !== overlay) return;
    if (e.button !== undefined && e.button !== 0) return;
    // Pro tools (table extract, diff range select, …) take exclusive control
    // of overlay clicks; bail so we don't deselect / start a new annotation
    // underneath them.
    if (typeof _tableExtractMode !== 'undefined' && _tableExtractMode) return;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom;
    const y = (e.clientY - rect.top) / currentZoom;

    if (activeEditor) {
      // Block the marquee-select pointerdown handler bound to the same overlay
      // (it would otherwise start a marquee in 'select' mode after our commit
      // switches the tool, and its pointerup would deselect the new annotation).
      commitEditor(true);
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    deselect();
    lastClickPos = { pageNum, x, y, overlay };

    if (currentTool === 'text') {
      e.stopPropagation();
      openTextEditor(overlay, pageNum, x, y, null);
    } else if (currentTool === 'draw') {
      e.preventDefault();
      e.stopPropagation();
      startDraw(overlay, pageNum, x, y, e.pointerId);
    } else if (currentTool === 'shape') {
      e.preventDefault();
      e.stopPropagation();
      startShape(overlay, pageNum, x, y, currentShape, e.pointerId);
    } else if (currentTool === 'field') {
      e.preventDefault();
      e.stopPropagation();
      startField(overlay, pageNum, x, y, e.pointerId);
    }
    // currentTool === 'select' → no-op (overlay click just deselects)
  });

  // PRO: Double-click anywhere on existing PDF text to trigger the Edit-PDF flow
  // (works in any tool mode, since the text layer has pointer-events: none and
  // we hit-test against the cached item rects).
  overlay.addEventListener('dblclick', (e) => {
    if (e.target !== overlay) return;
    if (activeEditor) return;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom;
    const y = (e.clientY - rect.top) / currentZoom;
    // Try image marker first — text spans usually live ABOVE images, but
    // when a PDF includes a barcode/QR with text labels next to it the
    // text-item hit-test would consume the dblclick. Resolving the image
    // first matches the user's mental model ("I double-clicked the barcode").
    if (window._tryGrabPdfImageAt && window._tryGrabPdfImageAt(overlay, x, y)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const item = findPdfTextItemAtPoint(overlay, x, y);
    if (item) {
      e.preventDefault();
      e.stopPropagation();
      cleanupStrayEmptyText();
      // For OCR hits, grab the whole line so the user can edit the
      // sentence at once instead of one word at a time.
      if (item.dataset.ocr === '1') {
        const lineSpans = e.altKey
          ? findParagraphSpansFromSeed(overlay, item)
          : findLineSpansFromSeed(overlay, item);
        if (lineSpans && lineSpans.length > 1) {
          editParagraphFromSpans(overlay, lineSpans);
          return;
        }
      }
      editOriginalPdfText(overlay, item);
    }
  });

  // PRO: hover hint in Select mode — outlines the text item the pointer is over,
  // without absorbing clicks (we use mousemove on the overlay, not the items).
  let hoverItem = null;
  function clearHover() {
    if (hoverItem) {
      hoverItem.classList.remove('pdf-text-hover');
      hoverItem = null;
    }
    overlay.style.cursor = '';
  }
  overlay.addEventListener('mousemove', (e) => {
    if (currentTool !== 'select') {
      clearHover();
      return;
    }
    if (e.target !== overlay) {
      clearHover();
      return;
    }
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom;
    const y = (e.clientY - rect.top) / currentZoom;
    const item = findPdfTextItemAtPoint(overlay, x, y);
    if (item === hoverItem) return;
    if (hoverItem) hoverItem.classList.remove('pdf-text-hover');
    hoverItem = item;
    if (hoverItem) {
      hoverItem.classList.add('pdf-text-hover');
      overlay.style.cursor = 'text';
      overlay.title = 'Double-click to edit this text';
    } else {
      overlay.style.cursor = '';
      overlay.title = '';
    }
  });
  overlay.addEventListener('mouseleave', clearHover);
}

// Hit-test a point against the cached PDF text item rects in an overlay
function findPdfTextItemAtPoint(overlay, x, y) {
  const items = overlay.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)');
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const ix = parseFloat(it.dataset.x);
    const iy = parseFloat(it.dataset.y);
    const iw = parseFloat(it.dataset.w);
    const ih = parseFloat(it.dataset.h);
    if (x >= ix && x <= ix + iw && y >= iy && y <= iy + ih) return it;
  }
  return null;
}

// Cluster nearby (vertically close + horizontally overlapping or continuous) text
// items into a paragraph. Used by Alt+click in Edit PDF mode to grab a whole block.
// Find all .pdf-text-item spans on the SAME visual line as `seedSpan`
// (used by OCR click → grab the whole line so the user can edit the
// sentence at once instead of one word at a time). Same return shape as
// findParagraphSpansFromSeed so editParagraphFromSpans accepts it.
function findLineSpansFromSeed(overlay, seedSpan) {
  if (!seedSpan) return [];
  const sy = parseFloat(seedSpan.dataset.y);
  const sh = parseFloat(seedSpan.dataset.h) || 14;
  const all = Array.from(overlay.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)'));
  return all
    .filter((el) => {
      const ey = parseFloat(el.dataset.y);
      // Same row if Y centres are within 70 % of the seed line height
      return Math.abs(ey - sy) < sh * 0.7;
    })
    .map((el) => ({
      el,
      x: parseFloat(el.dataset.x),
      y: parseFloat(el.dataset.y),
      w: parseFloat(el.dataset.w),
      h: parseFloat(el.dataset.h),
      fontHeight: parseFloat(el.dataset.fontHeight) || parseFloat(el.dataset.h) || 14,
    }))
    .sort((a, b) => a.x - b.x);
}

function findParagraphSpansFromSeed(overlay, seedSpan) {
  const all = Array.from(overlay.querySelectorAll('.pdf-text-item:not(.pdf-text-item-consumed)'));
  if (!seedSpan || !all.length) return [];
  // Build geometry objects
  const geoms = all.map((el) => ({
    el,
    x: parseFloat(el.dataset.x),
    y: parseFloat(el.dataset.y),
    w: parseFloat(el.dataset.w),
    h: parseFloat(el.dataset.h),
    fontHeight: parseFloat(el.dataset.fontHeight) || parseFloat(el.dataset.h) || 14,
  }));
  const byEl = new Map(geoms.map((g) => [g.el, g]));
  const seed = byEl.get(seedSpan);
  if (!seed) return [];
  // BFS expanding to neighbours within ~2 line-heights vertically AND horizontally
  // overlapping or close in horizontal position
  const visited = new Set();
  const queue = [seed];
  const result = [];
  const lineH = Math.max(seed.fontHeight * 1.4, 12);
  const lineGap = lineH * 1.8; // max vertical gap to merge into same paragraph
  const colGap = seed.fontHeight * 3; // horizontal slack
  while (queue.length) {
    const g = queue.shift();
    if (visited.has(g.el)) continue;
    visited.add(g.el);
    result.push(g);
    for (const other of geoms) {
      if (visited.has(other.el)) continue;
      // Vertical proximity
      const dy = Math.min(
        Math.abs(g.y - (other.y + other.h)), // g is below other
        Math.abs(g.y + g.h - other.y) // g is above other
      );
      const sameLine = Math.abs(g.y - other.y) < g.h * 0.7;
      if (sameLine || dy < lineGap) {
        // Horizontal overlap/proximity
        const ax1 = g.x,
          ax2 = g.x + g.w;
        const bx1 = other.x,
          bx2 = other.x + other.w;
        const overlap = !(ax2 < bx1 - colGap || bx2 < ax1 - colGap);
        // For multi-line paragraphs we accept ANY horizontal pos in the page-block
        // as long as it's near vertically (text often runs full-width)
        if (overlap || dy < lineGap * 0.7) {
          queue.push(other);
        }
      }
    }
  }
  // Sort top-to-bottom, then left-to-right
  result.sort((a, b) => (Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y));
  return result;
}

// Convert a paragraph (cluster of pdf-text-item spans) into ONE editable text annotation.
function editParagraphFromSpans(overlay, spans) {
  if (!spans || !spans.length) return;
  // Combined bbox
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const g of spans) {
    if (g.x < minX) minX = g.x;
    if (g.y < minY) minY = g.y;
    if (g.x + g.w > maxX) maxX = g.x + g.w;
    if (g.y + g.h > maxY) maxY = g.y + g.h;
  }
  // Same defensive clamp as editOriginalPdfText — corrupted OCR / odd transforms
  // can produce huge fontHeight values that would render as page-sized glyphs.
  let fontHeight = Math.max(12, Math.round(spans[0].fontHeight));
  if (!isFinite(fontHeight) || fontHeight > 120) fontHeight = 14;
  const pageNum = parseInt(spans[0].el.dataset.pageNum);
  // 1) Whiteout the whole region with bleed
  const bleed = Math.max(2, fontHeight * 0.1);
  const whiteoutAnn = {
    type: 'whiteout',
    pageNum,
    x: minX - bleed,
    y: minY - bleed,
    width: maxX - minX + bleed * 2,
    height: maxY - minY + bleed * 2,
  };
  whiteoutAnn.el = createWhiteoutEl(whiteoutAnn, overlay);
  annotations.push(whiteoutAnn);
  // 2) Group spans into lines (rows where Y is close)
  const lines = [];
  let curLine = [];
  let curY = spans[0].y;
  for (const g of spans) {
    if (Math.abs(g.y - curY) > g.h * 0.7) {
      lines.push(curLine);
      curLine = [];
      curY = g.y;
    }
    curLine.push(g);
  }
  if (curLine.length) lines.push(curLine);
  // 3) Build text content: each line is one entry, words separated by single spaces
  const linesText = lines
    .map((line) =>
      line
        .map((g) => (g.el.dataset.text || '').trim())
        .filter(Boolean)
        .join(' ')
    )
    .filter((t) => t.length);
  // 4) Try to detect font from the first span
  const cls = classifyPdfFontName(spans[0].el.dataset.fontName || '');
  // 5) Build the editable text annotation
  const el = document.createElement('div');
  el.className = 'annotation text-annotation';
  el.style.left = minX + 'px';
  el.style.top = minY + 'px';
  el.style.fontSize = fontHeight + 'px';
  el.style.width = maxX - minX + 'px'; // start at bbox width so wrapping matches
  overlay.appendChild(el);
  const ann = {
    type: 'text',
    pageNum,
    x: minX,
    y: minY,
    lines: linesText.length
      ? linesText.map((line) => [
          { text: line, color: '#000000', bold: cls.bold, italic: cls.italic, underline: false },
        ])
      : [[{ text: '', color: '#000000', bold: cls.bold, italic: cls.italic, underline: false }]],
    fontSize: fontHeight,
    fontFamily: cls.family,
    lineHeight: 1.15,
    align: 'left',
    noBackground: true,
    width: maxX - minX,
    height: maxY - minY,
    el,
    sourceWhiteout: whiteoutAnn,
    fromPdfEdit: true,
    isParagraph: true, // distinguishes paragraph from single-line edits
  };
  annotations.push(ann);
  bindEditCover(whiteoutAnn, ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  // 6) Hide source spans so user doesn't keep re-editing the same region
  for (const g of spans) {
    g.el.style.display = 'none';
    g.el.classList.add('pdf-text-item-consumed');
  }
  pushHistory('edit-paragraph-begin');
  updateAnnotCount();
  setTool('select');
  select(ann);
  showToast(
    `Paragraph grabbed (${spans.length} text item${spans.length === 1 ? '' : 's'}) — drag to move, double-click to edit.`,
    'success'
  );
}

// Hook into the overlay's text-item click to detect Alt-click → grab paragraph
document.addEventListener(
  'click',
  (e) => {
    if (!e.altKey) return;
    if (currentTool !== 'edit-pdf') return;
    const span = e.target.closest && e.target.closest('.pdf-text-item:not(.pdf-text-item-consumed)');
    if (!span) return;
    e.preventDefault();
    e.stopPropagation();
    const overlay = span.closest('.overlay');
    if (!overlay) return;
    const spans = findParagraphSpansFromSeed(overlay, span);
    editParagraphFromSpans(overlay, spans);
  },
  true
);

// ====== PDF image detection — overlay markers per detected raster image
// AND per detected vector cluster (barcodes, QR codes, vector logos that are
// drawn with many small paths instead of as a single image XObject). ======
async function buildPdfImageLayer(overlay, pdfPage, viewport, pageNum) {
  let opList;
  try {
    opList = await pdfPage.getOperatorList();
  } catch (e) {
    return;
  }
  const OPS = pdfjsLib.OPS || {};
  const PAINT_IMAGE = OPS.paintImageXObject;
  const PAINT_INLINE = OPS.paintInlineImageXObject;
  const PAINT_MASK = OPS.paintImageMaskXObject;
  const PAINT_JPEG = OPS.paintJpegXObject;
  const SAVE = OPS.save,
    RESTORE = OPS.restore,
    TRANSFORM = OPS.transform;
  const CONSTRUCT_PATH = OPS.constructPath;
  const RECTANGLE = OPS.rectangle;
  const MOVE_TO = OPS.moveTo,
    LINE_TO = OPS.lineTo,
    CURVE_TO = OPS.curveTo;
  const STROKE = OPS.stroke,
    FILL = OPS.fill,
    EO_FILL = OPS.eoFill;
  const FILL_STROKE = OPS.fillStroke,
    EO_FILL_STROKE = OPS.eoFillStroke;
  const CLOSE_FILL_STROKE = OPS.closeFillStroke,
    CLOSE_STROKE = OPS.closeStroke;
  const CLOSE_EO_FILL_STROKE = OPS.closeEOFillStroke;
  const END_PATH = OPS.endPath,
    CLOSE_PATH = OPS.closePath;
  if (TRANSFORM == null) return;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const images = [];
  const vectorPaths = []; // each: { x, y, w, h } in screen px
  // Track standalone path-building ops (moveTo / lineTo / curveTo / rectangle)
  // so paths constructed without a wrapping `constructPath` op also get
  // recognized. pdf.js 3.x emits them inline for simpler paths such as
  // individual barcode bars (m … l … S).
  let curPathMin = null; // user-space [minX, minY, maxX, maxY] or null
  let curPathSubpaths = 0; // count of disjoint sub-paths in the running path
  const extendPath = (ux, uy) => {
    if (!curPathMin) curPathMin = [ux, uy, ux, uy];
    else {
      if (ux < curPathMin[0]) curPathMin[0] = ux;
      if (uy < curPathMin[1]) curPathMin[1] = uy;
      if (ux > curPathMin[2]) curPathMin[2] = ux;
      if (uy > curPathMin[3]) curPathMin[3] = uy;
    }
  };
  const flushCurPath = () => {
    if (!curPathMin) return;
    // curPathMin uses [minX, minY, maxX, maxY] (the intuitive order). Convert
    // to pdf.js' [minX, maxX, minY, maxY] before handing to screenBbox.
    const b = screenBbox([curPathMin[0], curPathMin[2], curPathMin[1], curPathMin[3]]);
    const effW = b.w > 0 ? b.w : 2;
    const effH = b.h > 0 ? b.h : 2;
    if (effW < 250 && effH < 250 && !(effW > 80 && effH > 80)) {
      vectorPaths.push({ x: b.x, y: b.y, w: effW, h: effH });
    }
    // Single fat-path detection — same heuristic as in CONSTRUCT_PATH.
    const finalW = Math.max(b.w, effW);
    const finalH = Math.max(b.h, effH);
    const aspect = finalW / finalH;
    if (
      curPathSubpaths >= 6 &&
      finalW >= 30 &&
      finalH >= 20 &&
      finalW <= 400 &&
      finalH <= 250 &&
      aspect >= 0.15 &&
      aspect <= 8
    ) {
      images.push({ x: b.x, y: b.y, w: finalW, h: finalH });
    }
    curPathMin = null;
    curPathSubpaths = 0;
  };
  // Transform a user-space point through ctm + viewport
  const screenPoint = (ux, uy) => {
    const m = pdfjsLib.Util.transform(viewport.transform, ctm);
    return { x: m[0] * ux + m[2] * uy + m[4], y: m[1] * ux + m[3] * uy + m[5] };
  };
  // Transform a user-space bbox [minX,minY,maxX,maxY] to a screen bbox.
  // pdf.js stores constructPath minMax as [minX, maxX, minY, maxY] — NOT the
  // intuitive [minX, minY, maxX, maxY]. Verified by dumping the operator list
  // for the Alza barcode in 001.pdf: every bar emits minMax of the form
  // [x, x, yTop, yBottom], which with the wrong interpretation would collapse
  // to a 0-pixel sized box and disappear from detection.
  const screenBbox = (mm) => {
    const corners = [
      screenPoint(mm[0], mm[2]), // (minX, minY)
      screenPoint(mm[1], mm[2]), // (maxX, minY)
      screenPoint(mm[1], mm[3]), // (maxX, maxY)
      screenPoint(mm[0], mm[3]), // (minX, maxY)
    ];
    const xs = corners.map((c) => c.x),
      ys = corners.map((c) => c.y);
    const x = Math.min(...xs),
      y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (fn === SAVE) stack.push(ctm.slice());
    else if (fn === RESTORE) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === TRANSFORM) {
      ctm = pdfjsLib.Util.transform(ctm, args);
    } else if (fn === PAINT_IMAGE || fn === PAINT_INLINE || fn === PAINT_MASK || fn === PAINT_JPEG) {
      const corners = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ].map((c) => screenPoint(c.x, c.y));
      const xs = corners.map((c) => c.x),
        ys = corners.map((c) => c.y);
      const x = Math.min(...xs),
        y = Math.min(...ys);
      const w = Math.max(...xs) - x,
        h = Math.max(...ys) - y;
      if (w < 12 || h < 12) continue;
      // Skip images that cover most of the page — typical for scanned PDFs
      // (the entire page is one paintImageXObject). A marker over the whole
      // page would block clicks on the OCR-extracted text spans underneath,
      // so the user couldn't edit any text. The page IS the image; if they
      // want it as an object they can use Pages → Compress instead.
      const pageArea = viewport.width * viewport.height;
      if (w * h > pageArea * 0.55) continue;
      images.push({ x, y, w, h, _raster: true });
    } else if (fn === CONSTRUCT_PATH) {
      // pdf.js 3.x: argsArray entry is [opArray, argsArray, minMax].
      // minMax is the user-space bbox [minX, minY, maxX, maxY].
      const minMax = args && args[2];
      const ops = args && args[0];
      if (minMax && minMax.length >= 4 && isFinite(minMax[0])) {
        const b = screenBbox(minMax);
        // A stroked vertical line (barcode bar) has b.w === 0; a stroked
        // horizontal line has b.h === 0. Give them a nominal 2 px so they
        // survive clustering / aspect math.
        const effW = b.w > 0 ? b.w : 2;
        const effH = b.h > 0 ? b.h : 2;
        if (effW < 250 && effH < 250 && !(effW > 80 && effH > 80)) {
          vectorPaths.push({ x: b.x, y: b.y, w: effW, h: effH });
        }
        // Bucket B — a single path with many sub-shapes (one full barcode
        // flattened into one filled-rects path, OR a barcode drawn as many
        // moveTo+lineTo stroke segments). Count "shape starts": rectangle
        // ops, closePath ops, and moveTo ops are all signals that the path
        // contains multiple disjoint elements rather than one continuous
        // outline.
        let rectOrClose = 0;
        let moveCount = 0;
        if (Array.isArray(ops)) {
          for (let k = 0; k < ops.length; k++) {
            const op = ops[k];
            if (op === OPS.rectangle || op === OPS.closePath) rectOrClose++;
            else if (op === OPS.moveTo) moveCount++;
          }
        }
        // Each disjoint stroke needs a moveTo; treat every other moveTo as
        // a sub-shape "start" so two-point bars (moveTo + lineTo) count.
        const subpathSignal = Math.max(rectOrClose, Math.floor(moveCount));
        const finalW = Math.max(b.w, effW);
        const finalH = Math.max(b.h, effH);
        const aspect = finalW / finalH;
        if (
          subpathSignal >= 6 &&
          finalW >= 30 &&
          finalH >= 20 &&
          finalW <= 400 &&
          finalH <= 250 &&
          aspect >= 0.15 &&
          aspect <= 8
        ) {
          images.push({ x: b.x, y: b.y, w: finalW, h: finalH });
        }
      }
    } else if (fn === RECTANGLE && Array.isArray(args) && args.length >= 4) {
      // Rectangle may be standalone (rare) — flush any running path first.
      flushCurPath();
      const ux = args[0],
        uy = args[1],
        uw = args[2],
        uh = args[3];
      const b = screenBbox([ux, ux + uw, uy, uy + uh]); // pdf.js order
      const effW = b.w > 0 ? b.w : 2;
      const effH = b.h > 0 ? b.h : 2;
      if (effW < 250 && effH < 250 && !(effW > 80 && effH > 80)) {
        vectorPaths.push({ x: b.x, y: b.y, w: effW, h: effH });
      }
    } else if (fn === MOVE_TO && Array.isArray(args) && args.length >= 2) {
      extendPath(args[0], args[1]);
      curPathSubpaths++;
    } else if (fn === LINE_TO && Array.isArray(args) && args.length >= 2) {
      extendPath(args[0], args[1]);
    } else if (fn === CURVE_TO && Array.isArray(args) && args.length >= 6) {
      extendPath(args[0], args[1]);
      extendPath(args[2], args[3]);
      extendPath(args[4], args[5]);
    } else if (fn === CLOSE_PATH) {
      curPathSubpaths++;
    } else if (
      fn === STROKE ||
      fn === FILL ||
      fn === EO_FILL ||
      fn === FILL_STROKE ||
      fn === EO_FILL_STROKE ||
      fn === CLOSE_FILL_STROKE ||
      fn === CLOSE_STROKE ||
      fn === CLOSE_EO_FILL_STROKE ||
      fn === END_PATH
    ) {
      flushCurPath();
    }
  }
  // In case the page ended mid-path (rare), don't lose the bbox.
  flushCurPath();
  // === Cluster vector paths into rectangles ===
  // Barcodes are many narrow tall rects in a horizontal row.
  // QR codes are many small squares in a grid.
  // A path-dense rectangular cluster ≥ N members likely represents one.
  const vectorClusters = _clusterPaths(vectorPaths);
  // Remove any prior markers (re-render scenario)
  overlay.querySelectorAll('.pdf-image-marker').forEach((m) => m.remove());
  // Dedupe: a barcode may be detected both as a clustered group AND as a
  // single fat path. Keep the larger of two overlapping markers.
  const pageAreaFinal = viewport.width * viewport.height;
  const candidates = images.concat(vectorClusters).filter((c) => c.w * c.h <= pageAreaFinal * 0.55);
  const placed = [];
  const overlapFrac = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    return inter / Math.min(a.w * a.h, b.w * b.h);
  };
  candidates.sort((p, q) => q.w * q.h - p.w * p.h);
  for (const c of candidates) {
    let dup = false;
    for (const p of placed) {
      if (overlapFrac(c, p) > 0.6) {
        dup = true;
        break;
      }
    }
    if (!dup) placed.push(c);
  }
  for (let i = 0; i < placed.length; i++) {
    const img = placed[i];
    const marker = document.createElement('div');
    marker.className = 'pdf-image-marker';
    marker.style.left = img.x + 'px';
    marker.style.top = img.y + 'px';
    marker.style.width = img.w + 'px';
    marker.style.height = img.h + 'px';
    marker.title = window.t('img.markerTitle', 'Image — double-click to grab and move');
    marker.dataset.pageNum = String(pageNum);
    marker.dataset.x = String(img.x);
    marker.dataset.y = String(img.y);
    marker.dataset.w = String(img.w);
    marker.dataset.h = String(img.h);
    if (img._raster) marker.dataset.raster = '1';
    // Swallow single clicks so a click on the image marker doesn't fall
    // through to a text span underneath (which would trigger Edit-PDF on
    // the wrong element). Dblclick on the marker still bubbles to the
    // overlay handler which calls grabImageMarker via geometry hit-test.
    marker.addEventListener('click', (e) => {
      if (currentTool === 'select' || currentTool === 'edit-pdf') {
        e.stopPropagation();
        e.preventDefault();
      }
    });
    // Direct dblclick → grab. Faster than the overlay hit-test fallback.
    marker.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      grabImageMarker(marker);
    });
    overlay.appendChild(marker);
  }
}

// Group nearby vector path bboxes into clusters. A cluster represents a
// region drawn from many small paths (barcode bars, QR code modules, vector
// icon strokes). Returns array of merged rects suitable for image markers.
function _clusterPaths(paths) {
  if (!paths.length) return [];
  // Spatial union-find: bucket paths into a grid and merge pairs whose
  // bboxes are within `proxX` (horizontal) / `proxY` (vertical) of each
  // other. Vertical proximity is larger so a two-line vector logo (e.g.
  // "Dillon" + "Corporation" baseline below) clusters into ONE graphic.
  // Horizontal stays tight so distinct columns / unrelated icons don't merge.
  const proxX = 8;
  const proxY = 24;
  const sorted = paths.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const parent = sorted.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const cell = 40;
  const grid = new Map();
  const cellKey = (cx, cy) => cx + ',' + cy;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const c0 = Math.floor((p.x - proxX) / cell);
    const c1 = Math.floor((p.x + p.w + proxX) / cell);
    const r0 = Math.floor((p.y - proxY) / cell);
    const r1 = Math.floor((p.y + p.h + proxY) / cell);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const k = cellKey(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }
  for (const indices of grid.values()) {
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const pa = sorted[indices[a]],
          pb = sorted[indices[b]];
        const gx = Math.max(0, Math.max(pa.x, pb.x) - Math.min(pa.x + pa.w, pb.x + pb.w));
        const gy = Math.max(0, Math.max(pa.y, pb.y) - Math.min(pa.y + pa.h, pb.y + pb.h));
        if (gx <= proxX && gy <= proxY) union(indices[a], indices[b]);
      }
    }
  }
  // Collect groups
  const groups = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(sorted[i]);
  }
  // Emit cluster bboxes that look like graphics (enough paths, big enough,
  // and shaped like a barcode/QR/icon rather than a table grid).
  const clusters = [];
  for (const g of groups.values()) {
    if (g.length < 12) continue; // need a meaningful cloud of paths
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    let flatCount = 0; // paths wider than tall by 2x+
    let pathAreaSum = 0;
    for (const p of g) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x + p.w > maxX) maxX = p.x + p.w;
      if (p.y + p.h > maxY) maxY = p.y + p.h;
      pathAreaSum += p.w * p.h;
      if (p.w > p.h * 2) flatCount++;
    }
    const w = maxX - minX,
      h = maxY - minY;
    if (w < 30 || h < 20) continue; // stray tiny clusters
    if (w > 1200 || h > 1600) continue; // probably page background
    // Table-like clusters have many flat (wide-and-short) rects — cell rows
    // and horizontal borders. Reject if 30%+ of the paths are flat: real
    // barcodes (tall narrow bars) and QR codes (square modules) have ≈0%.
    if (flatCount / g.length > 0.3) continue;
    // Density gate — tables also tend to be sparse (a 200×150 table can
    // have only 20-40 paths total, density ~1/800). Real barcodes pack
    // 30+ tall bars into ~150×130 = ~1/650 px²; QR modules ~1/30 px².
    const density = g.length / (w * h);
    if (density < 1 / 700) continue;
    const pad = 2;
    clusters.push({ x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 });
  }
  return clusters;
}

// Grab a PDF image into a draggable image annotation: snapshot the canvas region
// + whiteout the original spot. Triggered by Alt+click on a .pdf-image-marker
// (or click when current tool is 'edit-pdf').
async function grabImageMarker(marker) {
  const pageNum = parseInt(marker.dataset.pageNum);
  let x = parseFloat(marker.dataset.x);
  let y = parseFloat(marker.dataset.y);
  let w = parseFloat(marker.dataset.w);
  let h = parseFloat(marker.dataset.h);
  const wrapper = marker.closest('.page-wrapper');
  if (!wrapper) return;
  const canvas = wrapper.querySelector('canvas');
  if (!canvas) return;
  const overlay = marker.parentElement;
  // HiDPI canvas: CSS px → canvas px
  const cssW = parseFloat(canvas.style.width) || canvas.width;
  const pixMul = canvas.width / cssW;
  // Pixel-walk to find the TRUE bbox — only for VECTOR clusters where the
  // detected bbox can underestimate the real ink region (anti-aliased
  // edges extend beyond each path's bbox). Raster XObjects already give an
  // exact paint rectangle via pdf.js, so expanding them would only suck in
  // adjacent text / table cells and ruin the snapshot.
  const isRaster = marker.dataset.raster === '1';
  if (!isRaster)
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const isInk = (r, g, b, a) => a >= 128 && r + g + b < 720;
      const edgeHasInk = (sx, sy, sw, sh) => {
        if (sw < 1 || sh < 1) return false;
        const d = ctx.getImageData(sx, sy, sw, sh).data;
        for (let i = 0; i < d.length; i += 4) {
          if (isInk(d[i], d[i + 1], d[i + 2], d[i + 3])) return true;
        }
        return false;
      };
      const step = 2; // CSS px step per expansion
      const maxExpand = 6; // tight cap — barcode edges only,
      // no creeping into adjacent text
      for (let pass = 0; pass < maxExpand; pass++) {
        let grew = false;
        // top
        let sx = Math.max(0, Math.floor(x * pixMul));
        let sy = Math.max(0, Math.floor((y - step) * pixMul));
        let sw = Math.min(canvas.width - sx, Math.ceil(w * pixMul));
        if (y - step >= 0 && edgeHasInk(sx, sy, sw, Math.ceil(step * pixMul))) {
          y -= step;
          h += step;
          grew = true;
        }
        // bottom
        sy = Math.max(0, Math.floor((y + h) * pixMul));
        if (
          sy + Math.ceil(step * pixMul) <= canvas.height &&
          edgeHasInk(sx, sy, sw, Math.ceil(step * pixMul))
        ) {
          h += step;
          grew = true;
        }
        // left
        sx = Math.max(0, Math.floor((x - step) * pixMul));
        sy = Math.max(0, Math.floor(y * pixMul));
        let sh2 = Math.min(canvas.height - sy, Math.ceil(h * pixMul));
        if (x - step >= 0 && edgeHasInk(sx, sy, Math.ceil(step * pixMul), sh2)) {
          x -= step;
          w += step;
          grew = true;
        }
        // right
        sx = Math.max(0, Math.floor((x + w) * pixMul));
        if (
          sx + Math.ceil(step * pixMul) <= canvas.width &&
          edgeHasInk(sx, sy, Math.ceil(step * pixMul), sh2)
        ) {
          w += step;
          grew = true;
        }
        if (!grew) break;
      }
    } catch (e) {
      /* sampling can fail on tainted canvases — fall through */
    }
  const sx = Math.max(0, x * pixMul);
  const sy = Math.max(0, y * pixMul);
  const sw = Math.min(canvas.width - sx, w * pixMul);
  const sh = Math.min(canvas.height - sy, h * pixMul);
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(sw));
  tmp.height = Math.max(1, Math.round(sh));
  tmp.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataURL = tmp.toDataURL('image/png');
  // 1) Whiteout original
  const wo = { type: 'whiteout', pageNum, x, y, width: w, height: h };
  wo.el = createWhiteoutEl(wo, overlay);
  annotations.push(wo);
  // 2) Build image annotation at the SAME position, preserving size
  const container = document.createElement('div');
  container.className = 'annotation img-container';
  container.style.left = x + 'px';
  container.style.top = y + 'px';
  container.style.width = w + 'px';
  container.style.height = h + 'px';
  container.style.transform = 'rotate(0deg)';
  const img = document.createElement('img');
  img.src = dataURL;
  img.draggable = false;
  container.appendChild(img);
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const h2 = document.createElement('div');
    h2.className = 'img-handle ' + corner;
    h2.dataset.corner = corner;
    container.appendChild(h2);
  });
  const rotHandle = document.createElement('div');
  rotHandle.className = 'img-handle rot';
  container.appendChild(rotHandle);
  overlay.appendChild(container);
  const ann = {
    type: 'image',
    pageNum,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    dataURL,
    mimeType: 'image/png',
    el: container,
    imgEl: img,
    aspectRatio: w / h,
    isSignature: false,
    sourceWhiteout: wo,
    fromPdfEdit: true,
  };
  annotations.push(ann);
  bindEditCover(wo, ann);
  enableImageInteractions(container, ann);
  marker.remove(); // hide the marker now that user has grabbed it
  pushHistory('grab-image');
  updateAnnotCount();
  setTool('select');
  select(ann);
  showToast(
    window.t('toast.imgGrabbed', 'Image grabbed — drag to move, corner handles to resize.'),
    'success'
  );
}

// Alt+click anywhere (or click in Edit PDF mode) over an image marker → grab.
// Markers are pointer-events:none so we hit-test by geometry against the
// overlay the click landed on.
document.addEventListener(
  'click',
  (e) => {
    if (currentTool !== 'edit-pdf' && !e.altKey) return;
    const overlay = e.target && e.target.closest && e.target.closest('.overlay');
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / currentZoom;
    const y = (e.clientY - rect.top) / currentZoom;
    if (window._tryGrabPdfImageAt && window._tryGrabPdfImageAt(overlay, x, y)) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true
);
// Hit-test against image markers when the user double-clicks empty overlay
// (e.g. a marker that sits underneath transparent regions). The text-layer
// dblclick handler hands off here for image hits so the user doesn't need to
// land precisely on the marker outline.
window._tryGrabPdfImageAt = function (overlay, x, y) {
  const markers = overlay.querySelectorAll('.pdf-image-marker');
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    const mx = parseFloat(m.dataset.x);
    const my = parseFloat(m.dataset.y);
    const mw = parseFloat(m.dataset.w);
    const mh = parseFloat(m.dataset.h);
    if (x >= mx && x <= mx + mw && y >= my && y <= my + mh) {
      grabImageMarker(m);
      return true;
    }
  }
  return false;
};

// Hook buildPdfTextLayer so image layer is also built per page
if (typeof window._imgLayerWrap === 'undefined') {
  window._imgLayerWrap = true;
  const _orig = buildPdfTextLayer;
  buildPdfTextLayer = async function (overlay, pdfPage, viewport, pageNum) {
    await _orig(overlay, pdfPage, viewport, pageNum);
    buildPdfImageLayer(overlay, pdfPage, viewport, pageNum).catch((e) => console.warn('[imgLayer]', e));
  };
}

// If a recent click in text mode created an empty text annotation and the editor
// just committed it, the empty annotation is already removed by commitEditor.
