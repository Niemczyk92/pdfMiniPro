// === SAVE / PRINT ===
// WinAnsi (Standard 14 fonts) only covers Latin-1. Czech/Polish chars like ň, ř, ć
// would throw "WinAnsi cannot encode" mid-render. We transliterate them to closest
// ASCII so saving never crashes. (Future: ship a Unicode TTF and skip this.)
const _PDF_CHAR_MAP = {
  ą: 'a',
  Ą: 'A',
  ć: 'c',
  Ć: 'C',
  ę: 'e',
  Ę: 'E',
  ł: 'l',
  Ł: 'L',
  ń: 'n',
  Ń: 'N',
  ś: 's',
  Ś: 'S',
  ź: 'z',
  Ź: 'Z',
  ż: 'z',
  Ż: 'Z',
  č: 'c',
  Č: 'C',
  ď: 'd',
  Ď: 'D',
  ě: 'e',
  Ě: 'E',
  ň: 'n',
  Ň: 'N',
  ř: 'r',
  Ř: 'R',
  š: 's',
  Š: 'S',
  ť: 't',
  Ť: 'T',
  ů: 'u',
  Ů: 'U',
  ž: 'z',
  Ž: 'Z',
  ý: 'y',
  Ý: 'Y',
  á: 'a',
  Á: 'A',
  é: 'e',
  É: 'E',
  í: 'i',
  Í: 'I',
  ó: 'o',
  Ó: 'O',
  ú: 'u',
  Ú: 'U',
  ä: 'a',
  Ä: 'A',
  ë: 'e',
  Ë: 'E',
  ï: 'i',
  Ï: 'I',
  ö: 'o',
  Ö: 'O',
  ü: 'u',
  Ü: 'U',
  ÿ: 'y',
  Ÿ: 'Y',
  ñ: 'n',
  Ñ: 'N',
  ç: 'c',
  Ç: 'C',
  â: 'a',
  Â: 'A',
  ê: 'e',
  Ê: 'E',
  î: 'i',
  Î: 'I',
  ô: 'o',
  Ô: 'O',
  û: 'u',
  Û: 'U',
  à: 'a',
  À: 'A',
  è: 'e',
  È: 'E',
  ì: 'i',
  Ì: 'I',
  ò: 'o',
  Ò: 'O',
  ù: 'u',
  Ù: 'U',
  ã: 'a',
  Ã: 'A',
  õ: 'o',
  Õ: 'O',
  š: 's',
  Š: 'S',
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ß: 'ss',
  þ: 'th',
  Þ: 'Th',
  ð: 'd',
  Ð: 'D',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '…': '...',
  '•': '*',
  ' ': ' ',
  ' ': ' ',
  '​': '',
};
let _safePdfTextWarned = false;
// Set true per-document by generatePdfBytes once a Unicode TTF (with Czech/Polish coverage)
// has been embedded successfully. safePdfText then short-circuits and returns text verbatim.
let _pdfUnicodeFontsReady = false;
function safePdfText(s) {
  if (s == null) return '';
  s = String(s);
  if (_pdfUnicodeFontsReady) return s;
  // Fast path: all chars within Latin-1 (which WinAnsi covers)
  let ok = true;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f && !_PDF_CHAR_MAP[s[i]]) {
      ok = ok && s.charCodeAt(i) <= 0xff;
    }
    if (s.charCodeAt(i) > 0xff) ok = false;
  }
  if (ok && !/[čďěňřšťůžýÁ-Ž]/.test(s)) return s; // already plain ASCII or Latin-1 only
  // Replace mapped chars + strip remaining diacritics + drop anything still > 0xFF
  let out = '';
  for (const ch of s) {
    if (_PDF_CHAR_MAP[ch] != null) {
      out += _PDF_CHAR_MAP[ch];
      continue;
    }
    if (ch.charCodeAt(0) <= 0x7f) {
      out += ch;
      continue;
    }
    // Try NFKD strip diacritics
    const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    out += /^[\x00-\xff]*$/.test(stripped) ? stripped : '?';
  }
  if (!_safePdfTextWarned && out !== s) {
    _safePdfTextWarned = true;
    try {
      showToast(
        'Some accented characters converted to ASCII for PDF output (standard fonts limitation).',
        'info'
      );
    } catch (_) {}
  }
  return out;
}

// Unicode TTFs (latin-ext subset: covers ASCII + Latin-1 + Latin Extended-A,
// which includes every Czech and Polish letter — ą ć ę ł ń ś ź ż č ď ě ň ř š ť ů ž …).
// Mapped per standard family + style. Mono has no italic variant, so italic falls back to regular weight.
const _UNICODE_TTF_URLS = {
  Helvetica: {
    regular:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/full/ttf/NotoSans-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/full/ttf/NotoSans-Bold.ttf',
    italic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/full/ttf/NotoSans-Italic.ttf',
    boldItalic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSans/full/ttf/NotoSans-BoldItalic.ttf',
  },
  'Times-Roman': {
    regular:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSerif/googlefonts/ttf/NotoSerif-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSerif/googlefonts/ttf/NotoSerif-Bold.ttf',
    italic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSerif/googlefonts/ttf/NotoSerif-Italic.ttf',
    boldItalic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSerif/googlefonts/ttf/NotoSerif-BoldItalic.ttf',
  },
  Courier: {
    // NotoSansMono has no italic — italic slots fall back to the regular weight on purpose.
    regular:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansMono/googlefonts/ttf/NotoSansMono-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansMono/googlefonts/ttf/NotoSansMono-Bold.ttf',
    italic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansMono/googlefonts/ttf/NotoSansMono-Regular.ttf',
    boldItalic:
      'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoSansMono/googlefonts/ttf/NotoSansMono-Bold.ttf',
  },
};
const _ttfBytesCache = {};
async function _fetchTtfBytes(url) {
  if (_ttfBytesCache[url]) return _ttfBytesCache[url];
  const r = await fetch(url, { cache: 'force-cache' });
  if (!r.ok) throw new Error('TTF fetch failed: ' + r.status + ' ' + url);
  const buf = await r.arrayBuffer();
  _ttfBytesCache[url] = new Uint8Array(buf);
  return _ttfBytesCache[url];
}

async function generatePdfBytes(saveOpts) {
  if (activeEditor) commitEditor(true);
  // Make sure the Noto webfaces have finished downloading before we either
  // commit the editor (which re-measures wrap) or hand text to pdf-lib for
  // measurement. If the editor is still rendering in Arial/Times fallback when
  // the PDF is measured in Noto, line widths diverge and the saved PDF wraps
  // differently than the editor — exactly what we're trying to prevent.
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn('[generatePdfBytes] document.fonts.ready failed:', e);
  }
  // Some XFA / government PDFs can't be loaded by pdf-lib at all. If we have
  // no user edits to bake in, just return the raw bytes — saves the user from
  // a hard crash on "Pages" or "Save".
  let doc;
  try {
    doc = await PDFDocument.load(pdfBytes.slice(0), PDF_LOAD_OPTS);
  } catch (e) {
    console.warn('[generatePdfBytes] pdf-lib load failed:', e);
    if (
      !annotations.length &&
      !Object.keys(pageCrops || {}).length &&
      !(sessionBookmarks && sessionBookmarks.length)
    ) {
      // Nothing to bake — return the original bytes so Save / Pages still work
      return pdfBytes.slice(0);
    }
    throw new Error(
      "This PDF can't be modified with annotations because it uses an unusual structure (likely XFA / government form). Try the Export ▾ menu instead, or save without annotations."
    );
  }
  // Register fontkit so we can embed Unicode TTF fonts (Czech/Polish coverage).
  // If it fails (CDN blocked etc.) we silently fall back to StandardFonts + transliteration.
  _pdfUnicodeFontsReady = false;
  try {
    if (window.fontkit && typeof doc.registerFontkit === 'function') {
      doc.registerFontkit(window.fontkit);
    }
  } catch (e) {
    console.warn('[generatePdfBytes] registerFontkit failed:', e);
  }
  // Pro: per-family + per-style font cache
  const fontFamilyCache = {};
  async function getFontFor(family, bold, italic) {
    family = family || 'Helvetica';
    if (!fontFamilyCache[family]) {
      const map =
        family === 'Times-Roman'
          ? {
              regular: 'TimesRoman',
              bold: 'TimesRomanBold',
              italic: 'TimesRomanItalic',
              boldItalic: 'TimesRomanBoldItalic',
            }
          : family === 'Courier'
            ? {
                regular: 'Courier',
                bold: 'CourierBold',
                italic: 'CourierOblique',
                boldItalic: 'CourierBoldOblique',
              }
            : {
                regular: 'Helvetica',
                bold: 'HelveticaBold',
                italic: 'HelveticaOblique',
                boldItalic: 'HelveticaBoldOblique',
              };
      // Try Unicode TTFs first (so Czech/Polish letters appear correctly).
      let loaded = null;
      const urls = _UNICODE_TTF_URLS[family];
      if (urls && window.fontkit && typeof doc.registerFontkit === 'function') {
        try {
          const [rB, bB, iB, biB] = await Promise.all([
            _fetchTtfBytes(urls.regular),
            _fetchTtfBytes(urls.bold),
            _fetchTtfBytes(urls.italic),
            _fetchTtfBytes(urls.boldItalic),
          ]);
          loaded = {
            regular: await doc.embedFont(rB, { subset: true }),
            bold: await doc.embedFont(bB, { subset: true }),
            italic: await doc.embedFont(iB, { subset: true }),
            boldItalic: await doc.embedFont(biB, { subset: true }),
          };
          _pdfUnicodeFontsReady = true;
        } catch (e) {
          console.warn('[generatePdfBytes] Unicode font embed failed, falling back to StandardFonts:', e);
          loaded = null;
        }
      }
      if (!loaded) {
        loaded = {
          regular: await doc.embedFont(StandardFonts[map.regular]),
          bold: await doc.embedFont(StandardFonts[map.bold]),
          italic: await doc.embedFont(StandardFonts[map.italic]),
          boldItalic: await doc.embedFont(StandardFonts[map.boldItalic]),
        };
      }
      fontFamilyCache[family] = loaded;
    }
    const set = fontFamilyCache[family];
    return bold && italic ? set.boldItalic : bold ? set.bold : italic ? set.italic : set.regular;
  }
  // legacy "fonts" object for code that still references it (stamps embed their own fonts)
  const fonts = { _legacy: true };
  // Draw whiteouts FIRST (so they cover original PDF content without obscuring user annotations)
  // Stream-level text deletions run FIRST, before any annotation drawing.
  // Each text-delete ann targets a Tj/TJ run in the original content stream;
  // we tokenize the stream, drop the operator, and reflow same-line text.
  // Any ann that couldn't be matched (returns NOT in `consumed`) is converted
  // on-the-fly to a whiteout so the visual still works.
  try {
    const delAnns = annotations.filter((a) => a.type === 'text-delete');
    if (delAnns.length) {
      const byPage = {};
      for (const a of delAnns) (byPage[a.pageNum] = byPage[a.pageNum] || []).push(a);
      for (const pageNumStr of Object.keys(byPage)) {
        const pageNum = parseInt(pageNumStr);
        const wrapper = document.querySelector(`.page-wrapper[data-page-num="${pageNum}"]`);
        if (!wrapper) continue;
        const scale = parseFloat(wrapper.dataset.scale);
        const p = doc.getPage(pageNum - 1);
        const ph = p.getHeight();
        const consumed = await _applyTextDeletions(doc, pageNum, byPage[pageNumStr], scale, ph);
        for (const a of byPage[pageNumStr]) {
          a._consumedByStreamDelete = consumed.has(a);
        }
      }
    }
  } catch (e) {
    console.warn('[text-delete] pre-pass failed:', e && e.message);
  }

  // Whiteouts AND redactions go first so they cover original PDF content.
  // Form fields go LAST so we can sort them by their user-chosen tabIndex —
  // PDF viewers tab through fields in the order they appear in the page
  // /Annots array, and pdf-lib's `addToPage` appends widgets in call order.
  const _coverFirst = (a) => {
    if (a.type === 'whiteout' || a.type === 'redact') return 0;
    if (a.type === 'field') return 2;
    return 1;
  };
  const _tabKey = (a) =>
    a.type === 'field' && a.tabIndex != null && isFinite(a.tabIndex) ? a.tabIndex : Number.POSITIVE_INFINITY;
  const orderedAnns = annotations.slice().sort((a, b) => {
    const r = _coverFirst(a) - _coverFirst(b);
    if (r !== 0) return r;
    if (a.type === 'field' && b.type === 'field') return _tabKey(a) - _tabKey(b);
    return 0;
  });
  const _hasRedaction = annotations.some((a) => a.type === 'redact');
  const _pageCount = doc.getPageCount();
  for (const ann of orderedAnns) {
    // Defensive: skip any annotation whose page no longer exists (e.g. left over
    // after pages were deleted/reordered, or a template applied with a higher
    // page index). pdf-lib's getPage() throws "index … but was actually N" on a
    // stale pageNum and that aborted the WHOLE save/print — a critical crash.
    if (!(ann.pageNum >= 1 && ann.pageNum <= _pageCount)) continue;
    // text-delete: handled in the stream-rewrite pre-pass above. If stream
    // matching succeeded, skip — otherwise drop a whiteout as a visual safety
    // net so the user still sees the text gone.
    if (ann.type === 'text-delete') {
      if (ann._consumedByStreamDelete) continue;
      const page = doc.getPage(ann.pageNum - 1);
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ann.pageNum}"]`);
      const scale = parseFloat(wrapper.dataset.scale);
      const pageH = page.getHeight();
      const bleed = Math.max(2, (ann.fontHeight || ann.height || 14) * 0.25);
      page.drawRectangle({
        x: ann.x / scale - bleed / scale,
        y: pageH - (ann.y + ann.height) / scale - bleed / scale,
        width: ann.width / scale + (bleed * 2) / scale,
        height: ann.height / scale + (bleed * 2) / scale,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
      continue;
    }
    const page = doc.getPage(ann.pageNum - 1);
    const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ann.pageNum}"]`);
    const scale = parseFloat(wrapper.dataset.scale);
    const pageH = page.getHeight();
    const px = ann.x / scale;

    if (ann.type === 'whiteout') {
      page.drawRectangle({
        x: ann.x / scale,
        y: pageH - (ann.y + ann.height) / scale,
        width: ann.width / scale,
        height: ann.height / scale,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    } else if (ann.type === 'redact') {
      page.drawRectangle({
        x: ann.x / scale,
        y: pageH - (ann.y + ann.height) / scale,
        width: ann.width / scale,
        height: ann.height / scale,
        color: rgb(0, 0, 0),
        borderWidth: 0,
      });
    } else if (ann.type === 'decoration') {
      const xPdf = ann.x / scale;
      const yPdf = pageH - (ann.y + ann.height) / scale;
      const wPdf = ann.width / scale,
        hPdf = ann.height / scale;
      // Convert stored hex colour to pdf-lib rgb (0-1 floats), with per-kind fallbacks.
      const _hex2rgb = (hex, fallback) => {
        const m = /^#([0-9a-f]{6})$/i.exec((hex || '').trim());
        if (!m) return fallback;
        return rgb(
          parseInt(m[1].slice(0, 2), 16) / 255,
          parseInt(m[1].slice(2, 4), 16) / 255,
          parseInt(m[1].slice(4, 6), 16) / 255
        );
      };
      if (ann.kind === 'highlight') {
        page.drawRectangle({
          x: xPdf,
          y: yPdf,
          width: wPdf,
          height: hPdf,
          color: _hex2rgb(ann.color, rgb(1, 0.92, 0.23)),
          opacity: 0.45,
          borderWidth: 0,
        });
      } else if (ann.kind === 'underline') {
        const y = yPdf + 1;
        page.drawLine({
          start: { x: xPdf, y: y },
          end: { x: xPdf + wPdf, y: y },
          thickness: Math.max(1, hPdf * 0.08),
          color: _hex2rgb(ann.color, rgb(0.86, 0.15, 0.15)),
        });
      } else if (ann.kind === 'strike') {
        const y = yPdf + hPdf / 2;
        page.drawLine({
          start: { x: xPdf, y: y },
          end: { x: xPdf + wPdf, y: y },
          thickness: Math.max(1, hPdf * 0.08),
          color: _hex2rgb(ann.color, rgb(0.86, 0.15, 0.15)),
        });
      }
    } else if (ann.type === 'link') {
      // Link annotations are added at the end (after all drawing) via a separate pass
      // — see the linkAnnotations bundle below.
    } else if (ann.type === 'text') {
      // ann.fontSize is stored in VIEWPORT PIXELS for every text annotation
      // (matches the editor's `el.style.fontSize = ann.fontSize + 'px'`), so
      // divide by `scale` uniformly to convert to PDF points.
      const fs = ann.fontSize / scale;
      const family = ann.fontFamily || 'Helvetica';
      const lineHRatio = ann.lineHeight || LINE_HEIGHT_RATIO;
      const align = ann.align || 'left';
      const padTopPdf = ann.fromPdfEdit ? 0 : 1 / scale;
      const padLeftPdf = ann.fromPdfEdit ? 0 : 4 / scale;
      const baselineOffset = ann.fromPdfEdit ? PDF_FONT_ASCENT[family] || 0.78 : BASELINE_OFFSET;
      const pyTop = pageH - ann.y / scale;
      const pw = ann.width / scale,
        ph = ann.height / scale;
      const cxRot = (ann.x + ann.width / 2) / scale;
      const cyRot = pageH - (ann.y + ann.height / 2) / scale;
      // === WORD-WRAP each logical line ===
      // Use pdf-lib font widths for the wrap decision — user reported the
      // canvas-measureText approach (v1.14) was worse than this. Reverted.
      // We also measure with canvas at the same fontSize so we can log
      // BOTH widths and the developer can compare them to find any remaining
      // mismatch. Wrap THIS run uses pdf-lib widths exclusively.
      const cssFamily = TEXT_FONT_FAMILIES[family] || TEXT_FONT_FAMILIES.Helvetica;
      const _measureCanvas = (function () {
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        return (text, bold, italic) => {
          cx.font = (italic ? 'italic ' : '') + (bold ? 'bold ' : '') + ann.fontSize + 'px ' + cssFamily;
          return cx.measureText(text).width;
        };
      })();
      const maxLineW = Math.max(0, pw - 2 * padLeftPdf); // PDF pt
      // pdf-lib's StandardFonts.Helvetica metrics are marginally wider than
      // the browser's actual rendered font, so a token that fits "by a hair"
      // in the editor can overflow `maxLineW` here by a fraction of a point
      // and trigger an unwanted wrap. Allow ~10% of the font size (or 2 pt
      // minimum) of slack — that's well under one average character width
      // for normal-size text, and lets very-large text (e.g. fontSize 147 in
      // the user's `dfgsdfg` case, 0.1 pt overflow) stay on the same visual
      // line just like the editor shows it.
      const wrapTolerance = Math.max(2, fs * 0.1);
      const visualLines = []; // each: { segs:[…], width: number (pdf pt) }
      const stylesMatch = (a, b) =>
        a &&
        b &&
        a.bold === b.bold &&
        a.italic === b.italic &&
        a.underline === b.underline &&
        a.color === b.color;
      for (const logicalLine of ann.lines) {
        let cur = { segs: [], width: 0 };
        if (!logicalLine || !logicalLine.length || logicalLine.every((s) => !s || !s.text)) {
          visualLines.push(cur);
          continue;
        }
        for (const seg of logicalLine) {
          if (!seg || !seg.text) continue;
          const font = await getFontFor(family, seg.bold, seg.italic);
          const tokens = seg.text.split(/(\s+)/);
          const appendChunk = (chunk, w) => {
            const last = cur.segs[cur.segs.length - 1];
            if (stylesMatch(last, seg)) last.text += chunk;
            else
              cur.segs.push({
                text: chunk,
                bold: !!seg.bold,
                italic: !!seg.italic,
                underline: !!seg.underline,
                color: seg.color || '#000000',
              });
            cur.width += w;
          };
          for (const tok of tokens) {
            if (!tok) continue;
            const tokSafe = safePdfText(tok);
            const tokW = font.widthOfTextAtSize(tokSafe, fs);
            const isWS = /^\s+$/.test(tok);
            if (cur.segs.length > 0 && maxLineW > 0 && cur.width + tokW > maxLineW + wrapTolerance && !isWS) {
              visualLines.push(cur);
              cur = { segs: [], width: 0 };
            }
            if (isWS && cur.segs.length === 0) continue;
            // Character-level break ONLY when the word truly can't fit on a
            // line by itself even with tolerance (matches CSS overflow-wrap:
            // a barely-overflowing word doesn't break mid-letter).
            if (maxLineW > 0 && tokW > maxLineW + wrapTolerance && !isWS) {
              let start = 0;
              while (start < tokSafe.length) {
                let end = start + 1;
                let chunkW = font.widthOfTextAtSize(tokSafe.slice(start, end), fs);
                while (end < tokSafe.length) {
                  const tryW = font.widthOfTextAtSize(tokSafe.slice(start, end + 1), fs);
                  if (cur.width + tryW > maxLineW + wrapTolerance) break;
                  end++;
                  chunkW = tryW;
                }
                appendChunk(tokSafe.slice(start, end), chunkW);
                start = end;
                if (start < tokSafe.length) {
                  visualLines.push(cur);
                  cur = { segs: [], width: 0 };
                }
              }
              continue;
            }
            appendChunk(tokSafe, tokW);
          }
        }
        visualLines.push(cur);
      }
      // Diagnostic log: for each visual line we record pdf-lib width AND
      // canvas-measured width (in CSS px and converted to pt) so we can
      // see which measurement source matches the editor's actual wrap.
      // To disable: window._PDFM_DEBUG_TEXT_WRAP = false in the console.
      try {
        if (window._PDFM_DEBUG_TEXT_WRAP !== false) {
          const maxLineWcss = ann.width - 8;
          const linesOut = visualLines.map((v) => {
            const txt = v.segs.map((s) => s.text).join('');
            let cssW = 0;
            for (const s of v.segs) cssW += _measureCanvas(s.text, s.bold, s.italic);
            return {
              text: txt,
              pdf_w_pt: +v.width.toFixed(1),
              css_w_px: +cssW.toFixed(1),
              css_w_as_pt: +(cssW / scale).toFixed(1),
            };
          });
          // Also measure the WHOLE logical text in one shot for comparison
          const whole = ann.lines.map((l) => l.map((s) => s.text || '').join('')).join('\n');
          const wholeCanvas = _measureCanvas(whole.replace(/\n/g, ' '), false, false);
          dbg('[pdf-text-wrap pg', ann.pageNum, ']', {
            ann_x: ann.x,
            ann_y: ann.y,
            ann_width_css_px: ann.width,
            ann_height_css_px: ann.height,
            fontSize_css_px: ann.fontSize,
            family,
            scale,
            maxLineW_pdf_pt: +maxLineW.toFixed(1),
            maxLineW_css_px: maxLineWcss,
            whole_text_canvas_w_css_px: +wholeCanvas.toFixed(1),
            visualLines: linesOut,
          });
        }
      } catch (_) {}
      await withRotationMatrix(page, ann.rotation || 0, cxRot, cyRot, async () => {
        if (!ann.noBackground) {
          page.drawRectangle({
            x: px,
            y: pyTop - ph,
            width: pw,
            height: ph,
            color: rgb(1, 1, 1),
            borderWidth: 0,
          });
        }
        for (let li = 0; li < visualLines.length; li++) {
          const vline = visualLines[li];
          const baseY = pyTop - padTopPdf - (li * lineHRatio + baselineOffset) * fs;
          let startX = px + padLeftPdf;
          if (align === 'center') startX = px + (pw - vline.width) / 2;
          else if (align === 'right') startX = px + pw - padLeftPdf - vline.width;
          let xCursor = startX;
          for (const seg of vline.segs) {
            if (!seg.text) continue;
            const font = await getFontFor(family, seg.bold, seg.italic);
            const segCol = hexToRgb(seg.color);
            const textOpts = { x: xCursor, y: baseY, size: fs, font, color: segCol };
            if (ann.opacity != null && ann.opacity < 1) textOpts.opacity = ann.opacity;
            page.drawText(seg.text, textOpts);
            const segW = font.widthOfTextAtSize(seg.text, fs);
            if (seg.underline) {
              page.drawLine({
                start: { x: xCursor, y: baseY - fs * 0.12 },
                end: { x: xCursor + segW, y: baseY - fs * 0.12 },
                thickness: Math.max(0.6, fs / 18),
                color: segCol,
              });
            }
            xCursor += segW;
          }
        }
      });
    } else if (ann.type === 'image') {
      const bytes = dataURLToBytes(ann.dataURL);
      const isJpeg = ann.mimeType.includes('jpeg') || ann.mimeType.includes('jpg');
      const img = isJpeg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      const wPdf = ann.width / scale;
      const hPdf = ann.height / scale;
      const cxDesign = ann.x + ann.width / 2;
      const cyDesign = ann.y + ann.height / 2;
      const cxPdf = cxDesign / scale;
      const cyPdf = pageH - cyDesign / scale;
      // Negate CSS angle → PDF angle (see withRotationMatrix comment).
      const pdfAngleDeg = -(ann.rotation || 0);
      const theta = (pdfAngleDeg * Math.PI) / 180;
      const cosT = Math.cos(theta),
        sinT = Math.sin(theta);
      // x,y so that drawImage rotates around the image's visual center
      const xPdf = cxPdf - (wPdf / 2) * cosT + (hPdf / 2) * sinT;
      const yPdf = cyPdf - (wPdf / 2) * sinT - (hPdf / 2) * cosT;
      page.drawImage(img, {
        x: xPdf,
        y: yPdf,
        width: wPdf,
        height: hPdf,
        rotate: degrees(pdfAngleDeg),
      });
    } else if (ann.type === 'rectangle') {
      const pw = ann.width / scale,
        ph = ann.height / scale;
      page.drawRectangle({
        x: px,
        y: pageH - ann.y / scale - ph,
        width: pw,
        height: ph,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
    } else if (ann.type === 'draw') {
      // Highlighter is rasterised in a SECOND pass (see below). Drawing each
      // highlighter as a path with opacity stacks alpha on every overlap and
      // every joint, making the print darker than the screen even with the
      // Multiply blend mode (because Multiply × Multiply still darkens). The
      // raster pass paints all highlighter strokes opaque onto one canvas
      // (overlap = same yellow), then composites the whole image at the brush
      // opacity → uniform translucent yellow regardless of pass count.
      if (ann.points && ann.points.length >= 2 && _brushStyle(ann).blend !== 'multiply') {
        const bs = _brushStyle(ann);
        // Draw the whole stroke as ONE stroked path (a single paint operation) so
        // its opacity is composited exactly ONCE — identical to the on-screen SVG
        // <polyline stroke-opacity>. Drawing N separate line segments instead
        // re-paints the translucent colour at every joint AND every self-crossing,
        // stacking alpha so translucent brushes (pencil, marker, custom opacity)
        // print darker and "blobbier" than the editor shows (see 017 vs 018).
        // Path coords are overlay px / scale; the anchor (0, pageH) + pdf-lib's
        // built-in y-flip map them to PDF space just like the per-segment code did.
        let d = `M ${(ann.points[0].x / scale).toFixed(2)} ${(ann.points[0].y / scale).toFixed(2)}`;
        for (let i = 1; i < ann.points.length; i++) {
          d += ` L ${(ann.points[i].x / scale).toFixed(2)} ${(ann.points[i].y / scale).toFixed(2)}`;
        }
        const opts = {
          x: 0,
          y: pageH,
          scale: 1,
          borderColor: hexToRgb(ann.color),
          borderWidth: bs.width / scale,
          borderLineCap: bs.cap === 'butt' ? 0 : 1,
          borderOpacity: bs.opacity,
        };
        // Round line joins to match SVG stroke-linejoin:round (pdf-lib's drawSvgPath
        // doesn't expose join, so set it in the graphics state it inherits).
        const roundJoin = PDFLib.setLineJoin && PDFLib.LineJoinStyle;
        if (roundJoin)
          page.pushOperators(pushGraphicsState(), PDFLib.setLineJoin(PDFLib.LineJoinStyle.Round));
        page.drawSvgPath(d, opts);
        if (roundJoin) page.pushOperators(popGraphicsState());
      }
    } else if (ann.type === 'field') {
      // Create a real AcroForm field via pdf-lib. Existing fields in the PDF are
      // preserved; new ones are appended to the document /AcroForm.
      try {
        const form = doc.getForm();
        const wPdf = ann.width / scale,
          hPdf = ann.height / scale;
        const xPdf = ann.x / scale;
        const yPdfBottom = pageH - (ann.y + ann.height) / scale;
        const safeName = (ann.fieldName || 'field_' + Math.random().toString(36).slice(2, 7)).replace(
          /[^\w.-]/g,
          '_'
        );
        const pos = { x: xPdf, y: yPdfBottom, width: wPdf, height: hPdf };
        if (ann.rotation) {
          try {
            pos.rotate = degrees(-(ann.rotation || 0));
          } catch (_) {}
        }
        const sub = ann.subtype || 'text';
        const fs = Math.max(6, Math.min(72, ann.fontSize || 12));
        if (sub === 'check') {
          const f = form.createCheckBox(safeName);
          f.addToPage(page, pos);
          if (ann.defaultValue === 'checked' || ann.defaultValue === true || ann.defaultValue === 'true')
            f.check();
          else f.uncheck();
        } else if (sub === 'dropdown' || sub === 'combobox') {
          const f = form.createDropdown(safeName);
          const opts = ann.options && ann.options.length ? ann.options : ['Option 1'];
          f.addOptions(opts);
          if (sub === 'combobox') {
            // Combobox = editable dropdown — user can pick from the list OR type
            // a custom value (vs. plain dropdown, which is select-only).
            try {
              f.enableEditing();
            } catch (_) {}
          }
          if (ann.defaultValue) {
            try {
              if (opts.includes(ann.defaultValue)) f.select(ann.defaultValue);
            } catch (_) {}
          }
          f.addToPage(page, pos);
          _writeFieldDA(f, fs);
          _applyFieldExtras(f, ann, sub, doc, fs);
        } else if (sub === 'multiselect') {
          const f = form.createOptionList(safeName);
          const opts = ann.options && ann.options.length ? ann.options : ['Option 1'];
          f.addOptions(opts);
          try {
            f.enableMultiselect();
          } catch (_) {}
          if (ann.defaultValue) {
            const sels = String(ann.defaultValue)
              .split(',')
              .map((s) => s.trim())
              .filter((s) => opts.includes(s));
            if (sels.length) {
              try {
                f.select(sels);
              } catch (_) {}
            }
          }
          f.addToPage(page, pos);
          _writeFieldDA(f, fs);
          _applyFieldExtras(f, ann, sub, doc, fs);
        } else if (sub === 'toggle') {
          // Toggle switch — same low-level field type as checkbox; appearance
          // is what distinguishes them visually in the editor.
          const f = form.createCheckBox(safeName);
          f.addToPage(page, pos);
          if (ann.defaultValue === 'on' || ann.defaultValue === true || ann.defaultValue === 'true')
            f.check();
          else f.uncheck();
          _applyFieldExtras(f, ann, sub, doc, fs);
        } else if (sub === 'button') {
          // Action button — Print / Clear (Reset) / Submit (mailto).
          // pdf-lib's createButton gives us a PDFButton (Ff bit 17 = PushButton).
          // We skip pdf-lib's `f.setText(label)` because in this version it
          // throws (computeFontSize → NaN before widgets are sized); the caption
          // is instead written low-level via the widget's /MK /CA entry.
          let f;
          try {
            f = form.createButton(safeName);
          } catch (e) {
            console.warn('[form] createButton failed:', e && e.message);
            f = null;
          }
          if (f) {
            // pdf-lib's PDFButton.addToPage signature is (text, page, options)
            // — different from PDFTextField (page, options). The label string
            // is what's shown on the button.
            const label =
              ann.defaultValue ||
              (ann.actionKind === 'submit'
                ? 'Submit'
                : ann.actionKind === 'clear'
                  ? 'Clear'
                  : ann.actionKind === 'save'
                    ? 'Save'
                    : 'Print');
            f.addToPage(String(label), page, pos);
            _writeFieldDA(f, fs);
            // Also stamp /MK /CA on the widget — some viewers prefer that over
            // the appearance-stream caption pdf-lib generates.
            try {
              const PDFName = PDFLib.PDFName;
              const PDFString = PDFLib.PDFString;
              const ctx = doc.context;
              const mk = ctx.obj({ CA: PDFString.of(String(label)) });
              const widgets = f.acroField.getWidgets ? f.acroField.getWidgets() : [];
              for (const w of widgets) {
                try {
                  w.dict.set(PDFName.of('MK'), mk);
                } catch (_) {}
              }
            } catch (e) {
              console.warn('[form] button caption failed:', e && e.message);
            }
            _attachButtonAction(f, ann, doc);
            _applyFieldExtras(f, ann, sub, doc, fs);
          }
        } else if (sub === 'signature') {
          // Digital-signature placeholder. Real signing (simple, certified,
          // Bank-ID/PAdES) happens elsewhere in the app and overwrites this
          // widget's value. Here we create a /FT /Sig field that any signer
          // — including Adobe Sign or Bank-ID widgets — can fill.
          try {
            const PDFName = PDFLib.PDFName;
            const PDFString = PDFLib.PDFString;
            const ctx = doc.context;
            const sigDict = ctx.obj({
              Type: PDFName.of('Annot'),
              Subtype: PDFName.of('Widget'),
              FT: PDFName.of('Sig'),
              T: PDFString.of(safeName),
              Rect: [pos.x, pos.y, pos.x + pos.width, pos.y + pos.height],
              F: 4,
              P: page.ref,
            });
            const sigRef = ctx.register(sigDict);
            // Add widget to page /Annots
            const annotsKey = PDFName.of('Annots');
            let annotsArr = page.node.get(annotsKey);
            if (!annotsArr) {
              annotsArr = ctx.obj([]);
              page.node.set(annotsKey, annotsArr);
            }
            annotsArr.push(sigRef);
            // Register the field in AcroForm /Fields
            try {
              const acro = doc.getForm().acroForm;
              const fieldsArr = acro.dict.get(PDFName.of('Fields')) || ctx.obj([]);
              fieldsArr.push(sigRef);
              acro.dict.set(PDFName.of('Fields'), fieldsArr);
              // SigFlags = 3 (SignaturesExist + AppendOnly)
              acro.dict.set(PDFName.of('SigFlags'), PDFLib.PDFNumber.of(3));
            } catch (e) {
              console.warn('[form] sig field registration failed:', e && e.message);
            }
          } catch (e) {
            console.warn('[form] signature field failed:', e && e.message);
          }
        } else {
          // text / multiline / number / date — all PDF TextField. PDF has no
          // native number or date widget, but Adobe JavaScript Form Actions
          // give us native validation + format + (in Acrobat) the calendar
          // picker for date. Attach AFNumber_/AFDate_ Keystroke + Format
          // actions via /AA so Reader-class viewers honour them.
          const f = form.createTextField(safeName);
          if (sub === 'multiline') {
            try {
              f.enableMultiline();
            } catch (_) {}
          }
          if (ann.defaultValue) {
            try {
              f.setText(String(ann.defaultValue));
            } catch (_) {}
          }
          f.addToPage(page, pos);
          // Write DA explicitly AFTER addToPage — setText auto-fits and
          // overwrites DA with a computed huge size; this locks our size in.
          _writeFieldDA(f, fs);
          if (sub === 'number' || sub === 'date') {
            // Number / date validation + format come from Adobe JavaScript Form
            // Actions, set on the field's /AA dict. Acrobat (and most viewers)
            // honour these — Acrobat also pops a calendar for date fields.
            try {
              const PDFName = PDFLib.PDFName;
              const PDFString = PDFLib.PDFString;
              const ctx = doc.context;
              const dateFmt = ann.dateFormat || 'yyyy-mm-dd';
              const numFmt = _numberFormatArgs(ann.numberFormat || 'plain');
              const jsK =
                sub === 'date'
                  ? `AFDate_KeystrokeEx(${JSON.stringify(dateFmt)});`
                  : `AFNumber_Keystroke(${numFmt});`;
              const jsF =
                sub === 'date'
                  ? `AFDate_FormatEx(${JSON.stringify(dateFmt)});`
                  : `AFNumber_Format(${numFmt});`;
              const kAct = ctx.obj({
                Type: PDFName.of('Action'),
                S: PDFName.of('JavaScript'),
                JS: PDFString.of(jsK),
              });
              const fAct = ctx.obj({
                Type: PDFName.of('Action'),
                S: PDFName.of('JavaScript'),
                JS: PDFString.of(jsF),
              });
              const aa = ctx.obj({ K: kAct, F: fAct });
              f.acroField.dict.set(PDFName.of('AA'), aa);
            } catch (e) {
              console.warn('[form] could not attach AA actions', e && e.message);
            }
          }
          _applyFieldExtras(f, ann, sub, doc, fs);
        }
      } catch (e) {
        console.warn('[form] could not create field', ann.fieldName, e && e.message);
      }
    } else if (ann.type === 'shape') {
      const strokeC = hexToRgb(ann.stroke);
      const fillC = ann.fill ? hexToRgb(ann.fill) : null;
      const sw = ann.strokeWidth / scale;
      if (ann.shape === 'rect') {
        const wPdf = ann.width / scale,
          hPdf = ann.height / scale;
        const cxPdf = (ann.x + ann.width / 2) / scale;
        const cyPdf = pageH - (ann.y + ann.height / 2) / scale;
        // Negate CSS → PDF angle so the rectangle rotates the same direction as the editor.
        const angle = -(ann.rotation || 0);
        const t = (angle * Math.PI) / 180;
        const c = Math.cos(t),
          s = Math.sin(t);
        const xPdf = cxPdf - (wPdf / 2) * c + (hPdf / 2) * s;
        const yPdf = cyPdf - (wPdf / 2) * s - (hPdf / 2) * c;
        page.drawRectangle({
          x: xPdf,
          y: yPdf,
          width: wPdf,
          height: hPdf,
          rotate: degrees(angle),
          borderColor: strokeC,
          borderWidth: sw,
          color: fillC || undefined,
        });
      } else if (ann.shape === 'ellipse') {
        const cx = (ann.x + ann.width / 2) / scale;
        const cy = pageH - (ann.y + ann.height / 2) / scale;
        await withRotationMatrix(page, ann.rotation || 0, cx, cy, () => {
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: ann.width / 2 / scale,
            yScale: ann.height / 2 / scale,
            borderColor: strokeC,
            borderWidth: sw,
            color: fillC || undefined,
          });
        });
      } else if (ann.shape === 'line') {
        page.drawLine({
          start: { x: ann.x1 / scale, y: pageH - ann.y1 / scale },
          end: { x: ann.x2 / scale, y: pageH - ann.y2 / scale },
          thickness: sw,
          color: strokeC,
          lineCap: 1,
        });
      } else if (ann.shape === 'arrow' || ann.shape === 'double-arrow') {
        const x1 = ann.x1 / scale,
          y1 = pageH - ann.y1 / scale;
        const x2 = ann.x2 / scale,
          y2 = pageH - ann.y2 / scale;
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: sw,
          color: strokeC,
          lineCap: 1,
        });
        const drawHead = (tx, ty, fx, fy) => {
          const wingLen = Math.max(10 / scale, sw * 3.5);
          const angle = Math.atan2(ty - fy, tx - fx);
          const a1 = angle + Math.PI - 0.45;
          const a2 = angle + Math.PI + 0.45;
          page.drawLine({
            start: { x: tx, y: ty },
            end: { x: tx + wingLen * Math.cos(a1), y: ty + wingLen * Math.sin(a1) },
            thickness: sw,
            color: strokeC,
            lineCap: 1,
          });
          page.drawLine({
            start: { x: tx, y: ty },
            end: { x: tx + wingLen * Math.cos(a2), y: ty + wingLen * Math.sin(a2) },
            thickness: sw,
            color: strokeC,
            lineCap: 1,
          });
        };
        drawHead(x2, y2, x1, y1);
        if (ann.shape === 'double-arrow') drawHead(x1, y1, x2, y2);
      } else if (SHAPE_PATHS[ann.shape] || STROKE_PATHS[ann.shape]) {
        // Path-based shapes (triangle, heart, star, lightning, cloud, check, cross)
        const pathStr = SHAPE_PATHS[ann.shape] || STROKE_PATHS[ann.shape];
        const isStrokeOnly = !!STROKE_PATHS[ann.shape];
        const wPdf = ann.width / scale;
        const hPdf = ann.height / scale;
        // Negate CSS → PDF angle.
        const angle = -(ann.rotation || 0);
        const t = (angle * Math.PI) / 180;
        const c = Math.cos(t),
          s = Math.sin(t);
        const cxPdf = (ann.x + ann.width / 2) / scale;
        const cyPdf = pageH - (ann.y + ann.height / 2) / scale;
        const xPdf = cxPdf - (wPdf / 2) * c - (hPdf / 2) * s;
        const yPdf = cyPdf - (wPdf / 2) * s + (hPdf / 2) * c;
        const opts = {
          x: xPdf,
          y: yPdf,
          scale: 1,
          rotate: degrees(angle),
          borderColor: strokeC,
          borderWidth: sw,
          borderLineCap: 1,
        };
        if (!isStrokeOnly && fillC) opts.color = fillC;
        const transformedPath = scaleSvgPath(pathStr, wPdf / 100, hPdf / 100);
        page.drawSvgPath(transformedPath, opts);
      } else if (ann.shape === 'checklist') {
        const xPdf = ann.x / scale,
          yPdf = pageH - (ann.y + ann.height) / scale;
        const wPdf = ann.width / scale,
          hPdf = ann.height / scale;
        const cxRot = xPdf + wPdf / 2;
        const cyRot = yPdf + hPdf / 2;
        const rows = ann.rows || 5;
        const rowH = hPdf / rows;
        const boxSize = Math.min(rowH * 0.6, wPdf * 0.08);
        await withRotationMatrix(page, ann.rotation || 0, cxRot, cyRot, () => {
          for (let i = 0; i < rows; i++) {
            const cy = yPdf + hPdf - (i + 0.5) * rowH;
            page.drawRectangle({
              x: xPdf + 4 / scale,
              y: cy - boxSize / 2,
              width: boxSize,
              height: boxSize,
              borderColor: strokeC,
              borderWidth: sw,
              color: undefined,
            });
            page.drawLine({
              start: { x: xPdf + 4 / scale + boxSize + 8 / scale, y: cy - boxSize * 0.35 },
              end: { x: xPdf + wPdf - 8 / scale, y: cy - boxSize * 0.35 },
              thickness: Math.max(sw * 0.6, 0.5),
              color: strokeC,
            });
          }
        });
      } else if (ann.shape === 'calendar-month' || ann.shape === 'calendar-week') {
        const xPdf = ann.x / scale,
          yTopPdf = pageH - ann.y / scale;
        const wPdf = ann.width / scale,
          hPdf = ann.height / scale;
        const cxRot = xPdf + wPdf / 2;
        const cyRot = yTopPdf - hPdf / 2;
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        const drawCalendar = () => {
          if (ann.shape === 'calendar-month') {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const headerH = Math.min(hPdf * 0.12, 24 / scale);
            const cols = 7,
              rows = 6;
            const cellW = wPdf / cols,
              cellH = (hPdf - headerH) / rows;
            // frame
            page.drawRectangle({
              x: xPdf,
              y: yTopPdf - hPdf,
              width: wPdf,
              height: hPdf,
              borderColor: strokeC,
              borderWidth: sw,
              color: undefined,
            });
            // header line
            page.drawLine({
              start: { x: xPdf, y: yTopPdf - headerH },
              end: { x: xPdf + wPdf, y: yTopPdf - headerH },
              thickness: sw,
              color: strokeC,
            });
            // day labels
            const fs = Math.min(headerH * 0.55, cellW * 0.4);
            for (let i = 0; i < cols; i++) {
              const tw = font.widthOfTextAtSize(days[i], fs);
              page.drawText(days[i], {
                x: xPdf + (i + 0.5) * cellW - tw / 2,
                y: yTopPdf - headerH * 0.65,
                size: fs,
                font,
                color: strokeC,
              });
            }
            // verticals
            for (let i = 1; i < cols; i++) {
              page.drawLine({
                start: { x: xPdf + i * cellW, y: yTopPdf },
                end: { x: xPdf + i * cellW, y: yTopPdf - hPdf },
                thickness: Math.max(sw * 0.6, 0.4),
                color: strokeC,
              });
            }
            // horizontals
            for (let i = 1; i < rows; i++) {
              page.drawLine({
                start: { x: xPdf, y: yTopPdf - headerH - i * cellH },
                end: { x: xPdf + wPdf, y: yTopPdf - headerH - i * cellH },
                thickness: Math.max(sw * 0.6, 0.4),
                color: strokeC,
              });
            }
          } else {
            // Weekly = vertical: Mon..Sun rows, day-name column on the left + notes area on the right
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const rowsCount = 7;
            const rowH = hPdf / rowsCount;
            const dayColW = Math.min(wPdf * 0.26, 115 / scale);
            const dayPadX = 10 / scale;
            // Outer frame
            page.drawRectangle({
              x: xPdf,
              y: yTopPdf - hPdf,
              width: wPdf,
              height: hPdf,
              borderColor: strokeC,
              borderWidth: sw,
              color: undefined,
            });
            // Vertical separator between day column and notes
            page.drawLine({
              start: { x: xPdf + dayColW, y: yTopPdf },
              end: { x: xPdf + dayColW, y: yTopPdf - hPdf },
              thickness: sw,
              color: strokeC,
            });
            // Pick a font size so "Wednesday" fits in (dayColW - 2 * dayPadX) with margin
            let fs0 = Math.min(rowH * 0.42, 16 / scale);
            const longestW = font.widthOfTextAtSize('Wednesday', fs0);
            const fitW = dayColW - dayPadX * 2;
            const fs = longestW > fitW ? fs0 * (fitW / longestW) : fs0;
            for (let i = 0; i < rowsCount; i++) {
              const rowTopY = yTopPdf - i * rowH;
              // Row separator (skip top)
              if (i > 0) {
                page.drawLine({
                  start: { x: xPdf, y: rowTopY },
                  end: { x: xPdf + wPdf, y: rowTopY },
                  thickness: Math.max(sw * 0.7, 0.4),
                  color: strokeC,
                });
              }
              // Weekend tint on day column
              if (i === 5 || i === 6) {
                page.drawRectangle({
                  x: xPdf,
                  y: rowTopY - rowH,
                  width: dayColW,
                  height: rowH,
                  color: rgb(0, 0, 0),
                  opacity: 0.04,
                  borderWidth: 0,
                });
              }
              // Day label centered in the day column
              const tw = font.widthOfTextAtSize(days[i], fs);
              page.drawText(days[i], {
                x: xPdf + dayColW / 2 - tw / 2,
                y: rowTopY - rowH / 2 - fs / 3,
                size: fs,
                font,
                color: strokeC,
              });
              // Faint dashed guides in the notes area
              const noteX1 = xPdf + dayColW + 4 / scale;
              const noteX2 = xPdf + wPdf - 4 / scale;
              const guides = 2;
              const guideStep = rowH / (guides + 1);
              for (let j = 1; j <= guides; j++) {
                page.drawLine({
                  start: { x: noteX1, y: rowTopY - j * guideStep },
                  end: { x: noteX2, y: rowTopY - j * guideStep },
                  thickness: Math.max(sw * 0.35, 0.3),
                  color: strokeC,
                  opacity: 0.5,
                  dashArray: [2 / scale, 3 / scale],
                });
              }
            }
          }
        };
        await withRotationMatrix(page, ann.rotation || 0, cxRot, cyRot, drawCalendar);
      }
    } else if (ann.type === 'stamp') {
      // Reuse the Unicode-aware font cache (falls back to StandardFonts internally if needed).
      const stampFont = await getFontFor(ann.fontFamily || 'Helvetica', !!ann.bold, !!ann.italic);
      const w = ann.width / scale,
        h = ann.height / scale;
      // Negate CSS → PDF angle so the stamp rotates the same way as the editor.
      const angle = -(ann.rotation || 0);
      const cxDesign = ann.x + ann.width / 2;
      const cyDesign = ann.y + ann.height / 2;
      const cxPdf = cxDesign / scale;
      const cyPdf = pageH - cyDesign / scale;
      const theta = (angle * Math.PI) / 180;
      const cosT = Math.cos(theta),
        sinT = Math.sin(theta);
      if (ann.bgColor || (ann.borderStyle && ann.borderStyle !== 'none' && ann.borderWidth > 0)) {
        // Draw the box as a rounded-rect SVG path so exported corners match the
        // CSS border-radius of the on-screen stamp. Anchor (top-left of the path,
        // y-down) + rotate math mirrors the path-based shapes so rotation keeps
        // the visual centre fixed.
        const boxX = cxPdf - (w / 2) * cosT - (h / 2) * sinT;
        const boxY = cyPdf - (w / 2) * sinT + (h / 2) * cosT;
        const rPdf = (ann.borderRadius || 0) / scale;
        const opts = { x: boxX, y: boxY, scale: 1, rotate: degrees(angle) };
        if (ann.bgColor) opts.color = hexToRgb(ann.bgColor);
        if (ann.borderStyle && ann.borderStyle !== 'none' && ann.borderWidth > 0) {
          opts.borderColor = hexToRgb(ann.borderColor);
          opts.borderWidth = ann.borderWidth / scale;
          if (ann.borderStyle === 'dashed') opts.borderDashArray = [6 / scale, 4 / scale];
        }
        page.drawSvgPath(roundRectSvgPath(w, h, rPdf), opts);
      }
      // Draw text — split into lines, center each. Collapse internal whitespace
      // runs to a single space to match the on-screen box (white-space: pre-line),
      // otherwise "DRAFT  {USER}"-style double spaces print wider than designed.
      const lines = (ann.text || '').split('\n').map((l) => l.replace(/[ \t]+/g, ' '));
      const fs = ann.fontSize / scale;
      const lineH = fs * 1.15; // match CSS .stamp-inner line-height
      const totalTextH = lineH * lines.length;
      // start baseline of first line relative to center
      const startOffsetY = totalTextH / 2 - fs * 0.85;
      const txtColor = hexToRgb(ann.textColor);
      for (let li = 0; li < lines.length; li++) {
        const ln = safePdfText(lines[li]);
        if (!ln) continue;
        const tw = stampFont.widthOfTextAtSize(ln, fs);
        const lx = -tw / 2;
        const ly = startOffsetY - li * lineH;
        const rx = lx * cosT - ly * sinT;
        const ry = lx * sinT + ly * cosT;
        page.drawText(ln, {
          x: cxPdf + rx,
          y: cyPdf + ry,
          size: fs,
          font: stampFont,
          color: txtColor,
          rotate: degrees(angle),
        });
        if (ann.underline) {
          const ux1 = -tw / 2,
            uy1 = ly - fs * 0.18;
          const ux2 = tw / 2,
            uy2 = uy1;
          const ax = ux1 * cosT - uy1 * sinT,
            ay = ux1 * sinT + uy1 * cosT;
          const bx = ux2 * cosT - uy2 * sinT,
            by = ux2 * sinT + uy2 * cosT;
          page.drawLine({
            start: { x: cxPdf + ax, y: cyPdf + ay },
            end: { x: cxPdf + bx, y: cyPdf + by },
            thickness: Math.max(0.6 / scale, fs / 18),
            color: txtColor,
          });
        }
      }
    }
  }

  // === Highlighter — real Multiply blend, one stroke = one paint op ==========
  // The on-screen highlighter is an SVG <polyline> with stroke-opacity α inside a
  // layer with mix-blend-mode:multiply. Over a base colour B that composites to
  //     B' = B·(1 − α·(1 − colour))           (per channel)
  // i.e. each stroke MULTIPLIES the page by k = 1 − α·(1 − colour). We reproduce
  // that EXACTLY by drawing each stroke once, with a genuine PDF Multiply blend,
  // in that pre-multiplied colour k. Consequences that match the editor 1:1:
  //   • over white  → pale translucent colour (B=1 ⇒ B'=k)
  //   • over text / dark fills → text shows through darkened, not filmed over
  //   • two SEPARATE overlapping strokes → page·k·k, i.e. they darken at the cross
  //   • self-overlap WITHIN one stroke → one paint op ⇒ multiplied once (no seams)
  // The previous "flatten to one opaque raster at α" lost the multiply (wrong over
  // dark content) and collapsed overlapping strokes to a single uniform pass.
  try {
    const RJ = PDFLib.setLineJoin && PDFLib.LineJoinStyle;
    const MUL = PDFLib.BlendMode && PDFLib.BlendMode.Multiply;
    for (const ann of annotations) {
      if (ann.type !== 'draw' || !ann.points || ann.points.length < 2) continue;
      const bs = _brushStyle(ann);
      if (bs.blend !== 'multiply') continue; // highlighter brushes only
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ann.pageNum}"]`);
      if (!wrapper) continue;
      const page = doc.getPage(ann.pageNum - 1);
      const scale = parseFloat(wrapper.dataset.scale);
      const ph = page.getHeight();
      const op = bs.opacity;
      const hx = (ann.color || '#ffff00').replace('#', '');
      const cr = parseInt(hx.substr(0, 2), 16) / 255,
        cg = parseInt(hx.substr(2, 2), 16) / 255,
        cb = parseInt(hx.substr(4, 2), 16) / 255;
      const k = (ch) => Math.max(0, Math.min(1, 1 - op * (1 - ch)));
      let d = `M ${(ann.points[0].x / scale).toFixed(2)} ${(ann.points[0].y / scale).toFixed(2)}`;
      for (let i = 1; i < ann.points.length; i++)
        d += ` L ${(ann.points[i].x / scale).toFixed(2)} ${(ann.points[i].y / scale).toFixed(2)}`;
      const opts = {
        x: 0,
        y: ph,
        scale: 1,
        borderColor: rgb(k(cr), k(cg), k(cb)),
        borderWidth: bs.width / scale,
        borderLineCap: 1,
        borderOpacity: 1,
      };
      if (MUL) opts.blendMode = MUL;
      if (RJ) page.pushOperators(pushGraphicsState(), PDFLib.setLineJoin(PDFLib.LineJoinStyle.Round));
      page.drawSvgPath(d, opts);
      if (RJ) page.pushOperators(popGraphicsState());
    }
  } catch (e) {
    console.warn('[highlighter] failed:', e && e.message);
  }

  // === Link annotations: add as a post-pass via low-level pdf-lib API ===
  // Two sources of link rects in the saved PDF:
  //   1. Legacy standalone link annotations (type === 'link') — kept for
  //      backward compatibility with PDFs created in older versions.
  //   2. NEW link-as-property — any annotation with an `ann.link` attribute,
  //      using the annotation's own bbox (so the user clicks the SHAPE /
  //      TEXT / STAMP itself, not a separate blue dashed rectangle).
  const linkAnnots = annotations.filter((a) => a.type === 'link');
  const linkedObjects = annotations.filter((a) => a.type !== 'link' && a.link && a.link.target);
  if (linkAnnots.length || linkedObjects.length) {
    const { PDFName, PDFArray, PDFString } = PDFLib;
    // Helper: build the PDFLib /Action object for a given target.
    const buildAction = (linkKind, target) => {
      if (linkKind === 'page') {
        const targetPageNum = parseInt(String(target).replace(/^#page=/, '')) || 1;
        const targetPage = doc.getPage(Math.min(doc.getPageCount(), Math.max(1, targetPageNum)) - 1);
        return doc.context.obj({
          S: 'GoTo',
          D: [targetPage.ref, 'XYZ', null, null, null],
        });
      }
      return doc.context.obj({
        S: 'URI',
        URI: PDFString.of(String(target)),
      });
    };
    // Helper: append a Link annot to a given page using a Rect in PDF coords.
    const appendLink = (page, rect, action) => {
      const linkDict = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: rect,
        Border: [0, 0, 0],
        A: action,
      });
      const linkRef = doc.context.register(linkDict);
      const Annots = PDFName.of('Annots');
      let arr = page.node.lookupMaybe(Annots, PDFArray);
      if (!arr) {
        arr = doc.context.obj([]);
        page.node.set(Annots, arr);
      }
      arr.push(linkRef);
    };
    // 1. Legacy standalone link annotations
    for (const ann of linkAnnots) {
      try {
        const page = doc.getPage(ann.pageNum - 1);
        const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ann.pageNum}"]`);
        if (!wrapper) continue;
        const scale = parseFloat(wrapper.dataset.scale);
        const pageH = page.getHeight();
        const x1 = ann.x / scale;
        const y2 = pageH - ann.y / scale;
        const x2 = (ann.x + ann.width) / scale;
        const y1 = pageH - (ann.y + ann.height) / scale;
        appendLink(page, [x1, y1, x2, y2], buildAction(ann.linkKind, ann.linkTarget));
      } catch (e) {
        console.warn('[link] failed to add legacy link annotation:', e);
      }
    }
    // 2. Link-as-property — bbox from the annotation itself. Handle the
    //    different bbox shapes per annotation type: most have (x, y, width,
    //    height); shape lines/arrows use (x1, y1, x2, y2); draw paths use
    //    a `points` array (we union into a bbox).
    for (const ann of linkedObjects) {
      try {
        const page = doc.getPage(ann.pageNum - 1);
        const wrapper = document.querySelector(`.page-wrapper[data-page-num="${ann.pageNum}"]`);
        if (!wrapper) continue;
        const scale = parseFloat(wrapper.dataset.scale);
        const pageH = page.getHeight();
        let bbX, bbY, bbW, bbH;
        if (
          ann.x !== undefined &&
          ann.y !== undefined &&
          ann.width !== undefined &&
          ann.height !== undefined
        ) {
          bbX = ann.x;
          bbY = ann.y;
          bbW = ann.width;
          bbH = ann.height;
        } else if (
          ann.x1 !== undefined &&
          ann.y1 !== undefined &&
          ann.x2 !== undefined &&
          ann.y2 !== undefined
        ) {
          const xs = [ann.x1, ann.x2],
            ys = [ann.y1, ann.y2];
          const minX = Math.min(...xs),
            minY = Math.min(...ys);
          bbX = minX;
          bbY = minY;
          bbW = Math.max(...xs) - minX;
          bbH = Math.max(...ys) - minY;
          // Pad slightly so a horizontal/vertical line still has clickable area
          const padPx = 6;
          bbX -= padPx;
          bbY -= padPx;
          bbW += 2 * padPx;
          bbH += 2 * padPx;
        } else if (Array.isArray(ann.points) && ann.points.length) {
          const xs = ann.points.map((p) => p.x),
            ys = ann.points.map((p) => p.y);
          const minX = Math.min(...xs),
            minY = Math.min(...ys);
          bbX = minX;
          bbY = minY;
          bbW = Math.max(...xs) - minX;
          bbH = Math.max(...ys) - minY;
          const padPx = 6;
          bbX -= padPx;
          bbY -= padPx;
          bbW += 2 * padPx;
          bbH += 2 * padPx;
        } else {
          continue;
        }
        const x1 = bbX / scale;
        const y2 = pageH - bbY / scale;
        const x2 = (bbX + bbW) / scale;
        const y1 = pageH - (bbY + bbH) / scale;
        appendLink(page, [x1, y1, x2, y2], buildAction(ann.link.kind, ann.link.target));
      } catch (e) {
        console.warn('[link] failed to add link-property:', e);
      }
    }
  }

  // User-edited PDF metadata from the stats modal. Applied BEFORE the preset
  // tweaks below so 'web' / 'sanitize' presets can still strip identifying
  // fields if the user picks them.
  try {
    const sm = window.sessionMetadata;
    if (sm) {
      if (typeof sm.title === 'string') doc.setTitle(sm.title);
      if (typeof sm.author === 'string') doc.setAuthor(sm.author);
      if (typeof sm.subject === 'string') doc.setSubject(sm.subject);
      if (typeof sm.keywords === 'string') {
        const kw = sm.keywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        doc.setKeywords(kw);
      }
    }
  } catch (e) {
    console.warn('[meta] could not apply session metadata:', e && e.message);
  }

  // Apply export preset metadata + save options
  const preset = (saveOpts && saveOpts.preset) || 'hq';
  try {
    if (preset === 'archive') {
      doc.setProducer('PDF Mini Editor Pro (Archive export)');
      doc.setCreator('PDF Mini Editor Pro');
      const now = new Date();
      if (!doc.getCreationDate()) doc.setCreationDate(now);
      doc.setModificationDate(now);
    } else if (preset === 'web') {
      // Strip identifying metadata for smaller, sharable files
      try {
        doc.setProducer('PDF Mini Editor Pro');
      } catch (_) {}
      try {
        doc.setKeywords([]);
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[export] metadata step failed:', e);
  }

  // Embed signature audit data into PDF metadata. Survives image cropping and
  // is machine-readable from the Info dict (any PDF reader can show it).
  try {
    const signedAnns = annotations.filter((a) => a && a.isSignature && a.auditData);
    if (signedAnns.length && !_hasRedaction) {
      // First (or only) signature drives the document-level fields.
      const first = signedAnns[0].auditData;
      const id = first.identity || {};
      const signerName = [id.first, id.last].filter(Boolean).join(' ').trim();
      if (signerName) {
        try {
          doc.setAuthor(signerName + (id.role ? ` (${id.role})` : ''));
        } catch (_) {}
      }
      try {
        doc.setSubject(`Signed document — SHA-256 ${(first.documentSha256 || '').slice(0, 16)}…`);
      } catch (_) {}
      // Keywords carry the full audit summary, comma-delimited (visible in most PDF readers' "Properties" dialog).
      const kw = [];
      kw.push(`signed-at:${first.localTime || first.signedAt}`);
      if (first.signedAt) kw.push(`signed-utc:${first.signedAt}`);
      if (first.serverTime) kw.push(`server-time:${first.serverTime}`);
      if (first.documentSha256) kw.push(`doc-sha256:${first.documentSha256}`);
      if (first.ip) kw.push(`signer-ip:${first.ip}`);
      const il = first.ipLocation || {};
      if (il.city || il.country)
        kw.push(`ip-location:${[il.city, il.region, il.country].filter(Boolean).join(', ')}`);
      if (typeof il.latitude === 'number' && typeof il.longitude === 'number')
        kw.push(`ip-geo:${il.latitude},${il.longitude}`);
      if (il.org) kw.push(`signer-isp:${il.org}`);
      if (first.location)
        kw.push(
          `gps:${first.location.latitude},${first.location.longitude},±${Math.round(first.location.accuracy)}m`
        );
      if (first.address) kw.push(`gps-address:${first.address}`);
      if (id.email) kw.push(`signer-email:${id.email}`);
      if (id.phone) kw.push(`signer-phone:${id.phone}`);
      if (id.role) kw.push(`signer-role:${id.role}`);
      kw.push(`signer-device:${sigShortDevice(first.userAgent, first.platform)}`);
      kw.push(`signer-tz:${first.timezone}`);
      try {
        doc.setKeywords(kw);
      } catch (_) {}
      try {
        doc.setProducer('PDF Mini Editor Pro — Signed (PAdES-lite, client-side audit)');
      } catch (_) {}
      try {
        doc.setCreator('PDF Mini Editor Pro');
      } catch (_) {}

      // Custom Info dict entries — under /PDFMini namespace so they don't clash
      // with any existing producer-specific keys. Stored as PDFString.
      try {
        const { PDFName, PDFString } = PDFLib;
        const info = doc.context.lookup(doc.context.trailerInfo.Info);
        if (info && typeof info.set === 'function') {
          const writeKV = (key, val) => {
            if (val === null || val === undefined || val === '') return;
            try {
              info.set(PDFName.of(key), PDFString.of(String(val)));
            } catch (_) {}
          };
          writeKV('PDFMiniSignedAtLocal', first.localTime);
          writeKV('PDFMiniSignedAtUTC', first.signedAt);
          writeKV('PDFMiniServerTime', first.serverTime);
          writeKV('PDFMiniTimezone', first.timezone);
          writeKV('PDFMiniDocumentSHA256', first.documentSha256);
          writeKV('PDFMiniSignerName', signerName || null);
          writeKV('PDFMiniSignerEmail', id.email);
          writeKV('PDFMiniSignerPhone', id.phone);
          writeKV('PDFMiniSignerRole', id.role);
          writeKV('PDFMiniSignerIP', first.ip);
          writeKV('PDFMiniSignerISP', il.org);
          if (il.city || il.country)
            writeKV(
              'PDFMiniIPLocation',
              [il.city, il.region, il.postal, il.country].filter(Boolean).join(', ')
            );
          if (typeof il.latitude === 'number') writeKV('PDFMiniIPLatitude', il.latitude.toFixed(4));
          if (typeof il.longitude === 'number') writeKV('PDFMiniIPLongitude', il.longitude.toFixed(4));
          if (first.location) {
            writeKV('PDFMiniGPSLatitude', first.location.latitude.toFixed(6));
            writeKV('PDFMiniGPSLongitude', first.location.longitude.toFixed(6));
            writeKV('PDFMiniGPSAccuracyMeters', Math.round(first.location.accuracy));
          }
          writeKV('PDFMiniGPSAddress', first.address);
          writeKV('PDFMiniDevice', sigShortDevice(first.userAgent, first.platform));
          writeKV('PDFMiniUserAgent', first.userAgent);
          writeKV('PDFMiniLanguage', first.language);
          writeKV('PDFMiniScreen', first.screen);
          writeKV('PDFMiniCanvasFingerprint', first.canvasFp);
          writeKV('PDFMiniSignatureCount', String(signedAnns.length));
          // Full JSON of every signature's audit for downstream tooling
          try {
            const compact = signedAnns.map((a) => a.auditData);
            writeKV('PDFMiniAuditJSON', JSON.stringify(compact));
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[sig metadata] custom info dict failed:', e);
      }
    }
  } catch (e) {
    console.warn('[sig metadata] failed:', e);
  }
  // Redaction triggers a metadata wipe: title/author/subject/keywords/producer/creator
  // get blanked out so they don't leak identity info on the redacted document.
  if (_hasRedaction) {
    try {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setProducer('PDF Mini Editor Pro');
      doc.setCreator('PDF Mini Editor Pro');
      // Don't preserve the original creation date either
      doc.setCreationDate(new Date());
      doc.setModificationDate(new Date());
    } catch (e) {
      console.warn('[redact] metadata wipe failed:', e);
    }
  }

  // Flip the legacy /NeedAppearances flag so PDF viewers regenerate every form
  // field's appearance from its /DA on first open. Paired with
  // updateFieldAppearances:false below — without one or the other, our user-
  // chosen font size is lost (pdf-lib auto-fits) OR the field renders blank in
  // viewers that don't honour DA fallback.
  try {
    const PDFName = PDFLib.PDFName;
    const PDFBool = PDFLib.PDFBool;
    const form = doc.getForm();
    if (form && form.acroForm) {
      form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);
    }
  } catch (e) {
    console.warn('[form] NeedAppearances flag failed:', e && e.message);
  }

  // updateFieldAppearances:false — pdf-lib's auto field-appearance updater AUTO-FITS
  // text to the box and writes the computed font size back into /DA, so our
  // explicit `setFontSize(12)` (or any user-chosen size) becomes "/Helv 17 Tf"
  // because 17 pt fills the box. Skipping the auto-update keeps our DA, and we
  // flip the legacy /NeedAppearances flag below so viewers render each field
  // from its DA at the size the user actually picked.
  const saveOptions =
    preset === 'archive'
      ? { useObjectStreams: false, addDefaultPage: false, updateFieldAppearances: false }
      : { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false };

  // --- Crop / margins ---
  try {
    for (const k of Object.keys(pageCrops)) {
      const pn = parseInt(k);
      if (!pn || pn < 1 || pn > doc.getPageCount()) continue;
      const c = pageCrops[k];
      const page = doc.getPage(pn - 1);
      const w = page.getWidth(),
        h = page.getHeight();
      const cx = Math.max(0, c.left || 0);
      const cy = Math.max(0, c.bottom || 0);
      const cw = Math.max(1, w - cx - (c.right || 0));
      const ch = Math.max(1, h - cy - (c.top || 0));
      page.setCropBox(cx, cy, cw, ch);
      if (c.trim) page.setMediaBox(cx, cy, cw, ch);
    }
  } catch (e) {
    console.warn('[crop] failed:', e);
  }

  // --- Bookmarks / Outline (append session bookmarks) ---
  try {
    if (sessionBookmarks && sessionBookmarks.length) {
      const { PDFName, PDFString } = PDFLib;
      const catalog = doc.catalog;
      // Re-use existing /Outlines dict if present; otherwise create a new one.
      let outlinesRef = catalog.get(PDFName.of('Outlines'));
      let outlinesDict = outlinesRef ? doc.context.lookup(outlinesRef) : null;
      if (!outlinesDict) {
        outlinesDict = doc.context.obj({ Type: 'Outlines', Count: 0 });
        outlinesRef = doc.context.register(outlinesDict);
        catalog.set(PDFName.of('Outlines'), outlinesRef);
      }
      // Build new bookmark entries
      const newRefs = [];
      for (const bm of sessionBookmarks) {
        const pn = Math.min(doc.getPageCount(), Math.max(1, bm.page));
        const targetPage = doc.getPage(pn - 1);
        const node = doc.context.obj({
          Title: PDFString.of(bm.title || ''),
          Parent: outlinesRef,
          Dest: [targetPage.ref, 'XYZ', null, null, null],
        });
        const nRef = doc.context.register(node);
        newRefs.push({ ref: nRef, node });
      }
      // Link newRefs siblings to each other
      for (let i = 0; i < newRefs.length; i++) {
        if (i > 0) newRefs[i].node.set(PDFName.of('Prev'), newRefs[i - 1].ref);
        if (i < newRefs.length - 1) newRefs[i].node.set(PDFName.of('Next'), newRefs[i + 1].ref);
      }
      // Splice new entries at the end of existing /Outlines.First...Last chain.
      const firstKey = PDFName.of('First');
      const lastKey = PDFName.of('Last');
      const existingLast = outlinesDict.get(lastKey);
      if (existingLast) {
        // Link existing last → first new
        const existingLastDict = doc.context.lookup(existingLast);
        existingLastDict.set(PDFName.of('Next'), newRefs[0].ref);
        newRefs[0].node.set(PDFName.of('Prev'), existingLast);
        outlinesDict.set(lastKey, newRefs[newRefs.length - 1].ref);
      } else {
        outlinesDict.set(firstKey, newRefs[0].ref);
        outlinesDict.set(lastKey, newRefs[newRefs.length - 1].ref);
      }
      // Update Count (top-level only)
      const prevCount = (() => {
        const c = outlinesDict.get(PDFName.of('Count'));
        return c && typeof c.asNumber === 'function' ? c.asNumber() : 0;
      })();
      outlinesDict.set(PDFName.of('Count'), PDFLib.PDFNumber.of(prevCount + newRefs.length));
    }
  } catch (e) {
    console.warn('[bookmarks] failed:', e);
  }

  return await doc.save(saveOptions);
}

document.getElementById('saveBtn').addEventListener('click', savePDF);
async function savePDF() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const btn = document.getElementById('saveBtn');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="icon">⏳</span> Saving…';
  btn.disabled = true;
  try {
    const bytes = await generatePdfBytes();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: pdfFileName,
          types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('Saved as ' + handle.name, 'success');
      } catch (err) {
        if (err.name === 'AbortError') {
          /* user cancelled */
        } else {
          downloadBlob(blob, pdfFileName);
          showToast('Downloaded as ' + pdfFileName, 'success');
        }
      }
    } else {
      downloadBlob(blob, pdfFileName);
      showToast('Downloaded as ' + pdfFileName, 'success');
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Could not save PDF.', 'error');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
}

document.getElementById('printBtn').addEventListener('click', printPDF);
async function printPDF() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const btn = document.getElementById('printBtn');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="icon">⏳</span> Preparing…';
  btn.disabled = true;
  try {
    const bytes = await generatePdfBytes();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    // Open the PDF in a new window — this is the most reliable way to get the
    // browser to print ONLY the PDF (not the surrounding app UI). Some browsers'
    // hidden-iframe.print() falls back to printing the parent page.
    const printWin = window.open(url, '_blank');
    if (!printWin) {
      // Popup blocked — fall back to downloading so user can open + print manually
      downloadBlob(blob, pdfFileName);
      showToast('Pop-up blocked — PDF downloaded so you can print it manually.', 'warn');
      URL.revokeObjectURL(url);
      return;
    }

    // Trigger print once PDF is loaded. Use multiple attempts because PDF
    // viewer initialization timing varies between browsers.
    let printed = false;
    const tryPrint = () => {
      if (printed) return;
      try {
        printWin.focus();
        printWin.print();
        printed = true;
      } catch (e) {
        /* window may have been closed */
      }
    };
    try {
      printWin.addEventListener('load', () => setTimeout(tryPrint, 400));
    } catch (e) {}
    setTimeout(tryPrint, 1500);
    // Revoke the blob URL after a reasonable delay (browser already loaded it)
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 120000);

    showToast(window.t('toast.printOpening', 'Opening print dialog…'), 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || window.t('toast.printFailed', 'Could not print.'), 'error');
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
}

function hexToRgb(hex) {
  if (!hex) return rgb(0, 0, 0);
  if (hex.startsWith('rgb')) {
    const m = hex.match(/\d+/g);
    if (m && m.length >= 3) return rgb(+m[0] / 255, +m[1] / 255, +m[2] / 255);
  }
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const v = parseInt(hex, 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}
function dataURLToBytes(d) {
  const bin = atob(d.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function downloadBlob(blob, fn) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = fn;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

let toastT = null;
function showToast(msg, type = 'success', durationMs) {
  const t = document.getElementById('toast');
  t.className = 'toast ' + type;
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  // Optional 3rd arg lets critical messages (e.g. the VPN warning during
  // signing) linger longer so users can actually read them.
  const ms = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 3500;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}
