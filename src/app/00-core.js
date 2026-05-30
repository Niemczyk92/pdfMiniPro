const {
  PDFDocument,
  rgb,
  StandardFonts,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  translate,
  rotateRadians,
} = PDFLib;
// Gated debug logger — keeps diagnostics in the source but OUT of the production
// console (flip DEBUG to true while developing). Replaces the scattered raw
// console.log() calls that used to spam the console on every save / undo / load.
const DEBUG = false;
function dbg() {
  if (DEBUG) console.log.apply(console, arguments);
}
// Helper: wrap a drawing operation in a graphics-state rotation around (cx, cy).
// drawFn may be sync or async; we always await it so async work completes inside the matrix.
//
// IMPORTANT: callers pass the CSS rotation angle (the same number stored on
// `ann.rotation`). CSS-positive rotates clockwise on screen; pdf-lib's
// `rotateRadians(+α)` rotates counter-clockwise on screen (because PDF user
// space is Y-up math convention, then the viewer applies a Y-flip). So we
// NEGATE here so the saved/printed PDF rotates the same way the editor does.
async function withRotationMatrix(page, cssAngleDeg, cx, cy, drawFn) {
  if (!cssAngleDeg) {
    await drawFn();
    return;
  }
  const theta = (-cssAngleDeg * Math.PI) / 180;
  page.pushOperators(pushGraphicsState(), translate(cx, cy), rotateRadians(theta), translate(-cx, -cy));
  try {
    await drawFn();
  } finally {
    page.pushOperators(popGraphicsState());
  }
}
// Permissive load options so we can open as many PDFs as possible
// (many real-world PDFs are permission-encrypted or contain quirky objects).
const PDF_LOAD_OPTS = { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false };

// =====================================================================
//   Real PDF text deletion (modifies the page's content stream, with
//   single-line left-shift reflow). Best-effort: when matching fails we
//   fall back to the legacy whiteout cover so the user still sees the
//   text gone visually.
// =====================================================================

// Walk a decoded content-stream byte array and emit a flat array of
// "instructions": { operands:[...raw-token-records], opcode, start, end }.
// Operands keep their RAW byte range so binary-clean CID strings round-trip
// without us touching them.
function _tokenizeContentStream(bytes) {
  const insts = [];
  let i = 0;
  let operands = [];
  const len = bytes.length;
  const isWS = (b) => b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x0c || b === 0x00;
  const isDigit = (b) => (b >= 0x30 && b <= 0x39) || b === 0x2b || b === 0x2d || b === 0x2e;
  const sliceStr = (s, e) => {
    let r = '';
    for (let k = s; k < e; k++) r += String.fromCharCode(bytes[k]);
    return r;
  };
  while (i < len) {
    const b = bytes[i];
    if (isWS(b)) {
      i++;
      continue;
    }
    // Comment to end of line
    if (b === 0x25) {
      while (i < len && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i++;
      continue;
    }
    // Literal string (balanced parens, with escapes)
    if (b === 0x28) {
      const s = i;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        const c = bytes[i];
        if (c === 0x5c) {
          i += 2;
          continue;
        } // skip escape
        if (c === 0x28) {
          depth++;
          i++;
          continue;
        }
        if (c === 0x29) {
          depth--;
          i++;
          continue;
        }
        i++;
      }
      operands.push({ type: 'str', start: s, end: i, raw: sliceStr(s, i) });
      continue;
    }
    // Hex string
    if (b === 0x3c && bytes[i + 1] !== 0x3c) {
      const s = i;
      i++;
      while (i < len && bytes[i] !== 0x3e) i++;
      if (i < len) i++;
      operands.push({ type: 'hex', start: s, end: i, raw: sliceStr(s, i) });
      continue;
    }
    // Dict <<...>> — kept verbatim (depth-counted)
    if (b === 0x3c && bytes[i + 1] === 0x3c) {
      const s = i;
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (bytes[i] === 0x3c && bytes[i + 1] === 0x3c) {
          depth++;
          i += 2;
          continue;
        }
        if (bytes[i] === 0x3e && bytes[i + 1] === 0x3e) {
          depth--;
          i += 2;
          continue;
        }
        i++;
      }
      operands.push({ type: 'dict', start: s, end: i, raw: sliceStr(s, i) });
      continue;
    }
    // Array (depth-counted, supports nested literal/hex strings)
    if (b === 0x5b) {
      const s = i;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        const c = bytes[i];
        if (c === 0x28) {
          let dp = 1;
          i++;
          while (i < len && dp > 0) {
            if (bytes[i] === 0x5c) {
              i += 2;
              continue;
            }
            if (bytes[i] === 0x28) dp++;
            else if (bytes[i] === 0x29) dp--;
            i++;
          }
          continue;
        }
        if (c === 0x3c) {
          i++;
          while (i < len && bytes[i] !== 0x3e) i++;
          if (i < len) i++;
          continue;
        }
        if (c === 0x5b) {
          depth++;
          i++;
          continue;
        }
        if (c === 0x5d) {
          depth--;
          i++;
          continue;
        }
        i++;
      }
      operands.push({ type: 'arr', start: s, end: i, raw: sliceStr(s, i) });
      continue;
    }
    // Name
    if (b === 0x2f) {
      const s = i;
      i++;
      while (
        i < len &&
        !isWS(bytes[i]) &&
        bytes[i] !== 0x28 &&
        bytes[i] !== 0x3c &&
        bytes[i] !== 0x5b &&
        bytes[i] !== 0x2f &&
        bytes[i] !== 0x5d &&
        bytes[i] !== 0x3e
      )
        i++;
      operands.push({ type: 'name', start: s, end: i, raw: sliceStr(s, i) });
      continue;
    }
    // Number
    if (isDigit(b)) {
      const s = i;
      i++;
      while (i < len && (isDigit(bytes[i]) || bytes[i] === 0x2e)) i++;
      const raw = sliceStr(s, i);
      operands.push({ type: 'num', start: s, end: i, raw, value: parseFloat(raw) });
      continue;
    }
    // Operator (alpha)
    if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x27 || b === 0x22 || b === 0x2a) {
      const s = i;
      i++;
      while (
        i < len &&
        !isWS(bytes[i]) &&
        bytes[i] !== 0x28 &&
        bytes[i] !== 0x3c &&
        bytes[i] !== 0x5b &&
        bytes[i] !== 0x2f
      )
        i++;
      const opcode = sliceStr(s, i);
      insts.push({ operands, opcode, start: operands.length ? operands[0].start : s, end: i });
      operands = [];
      continue;
    }
    // Unknown — skip 1 byte
    i++;
  }
  return insts;
}

// --- Content-aware text-deletion helpers --------------------------------------
// These let us delete EXACTLY the clicked word instead of blindly removing the
// whole matched show-operator (which over-deletes a multi-word run) or, worse,
// removing the wrong operator. The trick: decode the operator's bytes as Latin-1
// (one byte = one char). For simple WinAnsi/Standard fonts this equals the
// visible text, so a substring match against the clicked word is reliable. For
// CID/Type0, /Differences-subset, or otherwise re-mapped fonts the decode is
// garbage that will NOT contain the word → we decline and fall back to whiteout,
// so we never silently corrupt or over-delete. (Self-validating by design.)
function _pdfDecodeLiteral(bytes, start, end) {
  // start at '(' … end one past ')'
  let s = '';
  let i = start + 1;
  const last = end - 1;
  while (i < last) {
    const b = bytes[i];
    if (b === 0x5c) {
      // backslash escape
      const n = bytes[i + 1];
      if (n === undefined) {
        i++;
        continue;
      }
      if (n >= 0x30 && n <= 0x37) {
        // up to 3 octal digits
        let oct = 0,
          k = 0;
        while (k < 3 && bytes[i + 1 + k] >= 0x30 && bytes[i + 1 + k] <= 0x37) {
          oct = oct * 8 + (bytes[i + 1 + k] - 0x30);
          k++;
        }
        s += String.fromCharCode(oct & 0xff);
        i += 1 + k;
        continue;
      }
      if (n === 0x0a) {
        i += 2;
        continue;
      } // \<LF> line continuation
      if (n === 0x0d) {
        i += bytes[i + 2] === 0x0a ? 3 : 2;
        continue;
      } // \<CR>[LF]
      const map = { 0x6e: 0x0a, 0x72: 0x0d, 0x74: 0x09, 0x62: 0x08, 0x66: 0x0c };
      s += String.fromCharCode(map[n] !== undefined ? map[n] : n);
      i += 2;
      continue;
    }
    s += String.fromCharCode(b);
    i++;
  }
  return s;
}
function _pdfDecodeHex(bytes, start, end) {
  // start at '<' … end one past '>'
  let hex = '';
  for (let i = start + 1; i < end - 1; i++) {
    const c = bytes[i];
    if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66))
      hex += String.fromCharCode(c);
  }
  if (hex.length % 2) hex += '0';
  let s = '';
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return s;
}
function _decodeTJArray(bytes, arrStart, arrEnd) {
  // concat the array's string elements
  let s = '';
  let i = arrStart + 1;
  const end = arrEnd - 1;
  while (i < end) {
    const b = bytes[i];
    if (b === 0x28) {
      let depth = 1,
        j = i + 1;
      while (j < end && depth > 0) {
        const c = bytes[j];
        if (c === 0x5c) {
          j += 2;
          continue;
        }
        if (c === 0x28) depth++;
        else if (c === 0x29) depth--;
        j++;
      }
      s += _pdfDecodeLiteral(bytes, i, j);
      i = j;
      continue;
    }
    if (b === 0x3c) {
      let j = i + 1;
      while (j < end && bytes[j] !== 0x3e) j++;
      if (j < end) j++;
      s += _pdfDecodeHex(bytes, i, j);
      i = j;
      continue;
    }
    i++;
  }
  return s;
}
// Decode a show op's text (Tj/TJ/'/") as Latin-1, or null if it isn't a plain
// string/array show op.
function _decodeShowOpText(op, bytes) {
  const oc = op.opcode;
  if (oc === 'Tj' || oc === "'" || oc === '"') {
    const tok = op.operands[op.operands.length - 1];
    if (!tok) return null;
    if (tok.type === 'str') return _pdfDecodeLiteral(bytes, tok.start, tok.end);
    if (tok.type === 'hex') return _pdfDecodeHex(bytes, tok.start, tok.end);
    return null;
  }
  if (oc === 'TJ') {
    const arr = op.operands[0];
    if (!arr || arr.type !== 'arr') return null;
    return _decodeTJArray(bytes, arr.start, arr.end);
  }
  return null;
}
// Encode a Latin-1 JS string back to a PDF literal `(...)` with correct escaping.
function _encodeLatin1Literal(text) {
  let s = '(';
  for (let k = 0; k < text.length; k++) {
    const c = text.charCodeAt(k) & 0xff;
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c);
    else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return s + ')';
}
// Remove the first occurrence of `needle` from `text`, absorbing ONE flanking
// space so "ONE TWO THREE" → "ONE THREE" (not a double gap). Returns null if not found.
function _spliceWord(text, needle) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  let start = i,
    end = i + needle.length;
  if (text[end] === ' ') end++;
  else if (text[start - 1] === ' ') start--;
  return text.slice(0, start) + text.slice(end);
}
// Content-aware matcher: among show ops on the clicked baseline (and font size),
// pick the one whose DECODED text actually contains the clicked word and whose
// run starts at/before the word. Returns the instruction index, or -1.
function _findOpForDeletion(insts, bytes, target, sourceText) {
  const needle = (sourceText || '').trim();
  if (!needle) return -1;
  let best = -1,
    bestErr = Infinity;
  let tm5 = 0,
    tm4 = 0,
    fontSize = 12,
    leading = 0,
    inBT = false;
  for (let i = 0; i < insts.length; i++) {
    const it = insts[i];
    const op = it.opcode;
    if (op === 'BT') {
      tm5 = tm4 = 0;
      inBT = true;
      continue;
    }
    if (op === 'ET') {
      inBT = false;
      continue;
    }
    if (!inBT) continue;
    if (op === 'Tf') {
      const n = it.operands[1];
      if (n && n.type === 'num') fontSize = n.value || fontSize;
      continue;
    }
    if (op === 'TL') {
      const n = it.operands[0];
      if (n && n.type === 'num') leading = n.value;
      continue;
    }
    if (op === 'Tm') {
      const e = it.operands[4],
        f = it.operands[5];
      if (e && f && e.type === 'num' && f.type === 'num') {
        tm4 = e.value;
        tm5 = f.value;
      }
      continue;
    }
    if (op === 'Td' || op === 'TD') {
      const x = it.operands[0],
        y = it.operands[1];
      if (x && y && x.type === 'num' && y.type === 'num') {
        tm4 += x.value;
        tm5 += y.value;
      }
      if (op === 'TD' && y && y.type === 'num') leading = -y.value;
      continue;
    }
    if (op === 'T*') {
      tm5 -= leading;
      continue;
    }
    if (op === "'" || op === '"') {
      tm5 -= leading;
    }
    if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
      const dy = Math.abs(tm5 - target.yPt);
      const tolY = Math.max(2, fontSize * 0.6);
      const sizeErr = Math.abs(fontSize - target.hPt) / Math.max(1, target.hPt);
      if (dy >= tolY || sizeErr >= 0.4) continue;
      if (tm4 > target.xPt + Math.max(3, fontSize)) continue; // run must start at/before the word
      const txt = _decodeShowOpText(it, bytes);
      if (txt == null || !txt.includes(needle)) continue; // content gate
      const err = dy * 2 + Math.abs(tm4 - target.xPt) + sizeErr * fontSize * 2;
      if (err < bestErr) {
        bestErr = err;
        best = i;
      }
    }
  }
  return best;
}

// Re-emit the operator list to bytes — preserves every untouched op via its
// original byte slice. Replaced ops get re-encoded from a string.
function _emitContentStream(insts, srcBytes) {
  const enc = new TextEncoder();
  const chunks = [];
  for (const it of insts) {
    if (it._removed) continue;
    if (it._replaceRaw != null) {
      chunks.push(enc.encode(it._replaceRaw + '\n'));
      continue;
    }
    // Default: copy original byte slice (operands + opcode)
    chunks.push(srcBytes.subarray(it.start, it.end));
    chunks.push(enc.encode('\n'));
  }
  // Concat
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Apply queued text-delete annotations for a single page.
// Returns the set of `text-delete` annotations successfully consumed
// (so the save loop can skip the legacy whiteout for those).
async function _applyTextDeletions(doc, pageNum, deletions, scale, pageH) {
  const consumed = new Set();
  if (!deletions.length) return consumed;
  try {
    const { PDFRawStream, PDFArray, PDFName, decodePDFRawStream, PDFNumber } = PDFLib;
    const page = doc.getPage(pageNum - 1);
    const pNode = page.node;
    const contentsRef = pNode.get(PDFName.of('Contents'));
    let streams = [];
    if (!contentsRef) return consumed;
    if (contentsRef instanceof PDFArray) {
      for (let i = 0; i < contentsRef.size(); i++) {
        const ref = contentsRef.get(i);
        const s = doc.context.lookup(ref, PDFRawStream);
        if (s) streams.push({ ref, stream: s });
      }
    } else {
      const ref = pNode.get(PDFName.of('Contents'));
      const s = doc.context.lookup(ref, PDFRawStream);
      if (s) streams.push({ ref, stream: s });
    }
    if (!streams.length) return consumed;
    // For Phase 1 we work on each stream independently. PDFs with text split
    // across stream boundaries inside a single BT will produce mismatches —
    // those will fall back to whiteout via the caller.
    for (const { ref, stream } of streams) {
      const bytes = decodePDFRawStream(stream).decode();
      const insts = _tokenizeContentStream(bytes);
      let changed = false;
      for (const ann of deletions) {
        if (consumed.has(ann)) continue;
        // Editor coordinates → PDF points. ann.x/y/w/h are in editor CSS pixels
        // at `scale`. PDF Y-up: y_base = pageH - (ann.y + ann.h) / scale + ann.h / scale = pageH - ann.y / scale  (top maps; baseline ≈ pageH - (y + h)/scale).
        const xPt = ann.x / scale;
        const yPt = pageH - (ann.y + ann.height) / scale;
        const hPt = ann.height / scale;
        const wPt = ann.width / scale;
        const target = { xPt, yPt, hPt, wPt };
        // Content-aware match: find the show op whose DECODED text contains the
        // clicked word. If none does (CID/Type0, remapped subset, or geometry
        // mismatch) → leave the stream alone and let the whiteout cover it. This
        // is what stops the old "removed the wrong / whole multi-word operator"
        // bug proven on 001.pdf (clicking "Faktura" in a one-operator line).
        const needle = (ann.sourceText || '').trim();
        const idx = _findOpForDeletion(insts, bytes, target, needle);
        if (idx < 0) continue; // → whiteout fallback (safe)
        const op = insts[idx];
        const opText = _decodeShowOpText(op, bytes);
        if (opText == null || !needle || !opText.includes(needle)) continue; // safety

        if (op.opcode === 'Tj' && opText.trim() !== needle) {
          // SUBSTRING SURGERY on a single-string Tj: delete just the clicked run.
          // Everything after it in the SAME Tj reflows left automatically (one
          // show op draws from one origin), so no advance math is needed.
          const newText = _spliceWord(opText, needle);
          if (newText == null) continue; // couldn't splice → whiteout
          if (newText.trim() === '') op._removed = true;
          else op._replaceRaw = _encodeLatin1Literal(newText) + ' Tj';
          changed = true;
          consumed.add(ann);
          continue;
        }
        if (opText.trim() !== needle) continue; // multi-word TJ/'/" → whiteout (no partial surgery yet)
        // Whole-operator case: the op shows exactly the clicked word → safe to remove.
        op._removed = true;
        // Reflow within the line (Word-like): find the next text-POSITIONING op
        // and, if it repositions on the SAME baseline (|ty|<eps), pull it left by
        // the removed width so the following words close the gap. We skip ops that
        // don't move the cursor horizontally (font, spacing, colour, ExtGState),
        // so the reflow still fires when a `Tf`/`TL`/colour op sits between the
        // deleted run and the next `Td`. Consecutive Tj/' show ops with no Td in
        // between already reflow automatically (the deleted glyph advance is gone);
        // absolutely-positioned runs (Tm/cm) are left as-is — the text is still
        // removed, we just don't risk a cascading reposition.
        const POS_NEUTRAL = {
          Tf: 1,
          TL: 1,
          Tc: 1,
          Tw: 1,
          Tz: 1,
          Tr: 1,
          Ts: 1,
          g: 1,
          rg: 1,
          k: 1,
          G: 1,
          RG: 1,
          K: 1,
          gs: 1,
          cs: 1,
          CS: 1,
          sc: 1,
          scn: 1,
          SC: 1,
          SCN: 1,
        };
        for (let j = idx + 1; j < insts.length; j++) {
          const nxt = insts[j];
          if (POS_NEUTRAL[nxt.opcode]) continue; // skip non-moving ops
          if (nxt.opcode === 'Td' || nxt.opcode === 'TD') {
            const xn = nxt.operands[0],
              yn = nxt.operands[1];
            if (xn && yn && xn.type === 'num' && yn.type === 'num' && Math.abs(yn.value) < 0.5) {
              const newX = xn.value - wPt;
              nxt._replaceRaw = `${newX.toFixed(3)} ${yn.value} ${nxt.opcode}`;
            }
          }
          break; // stop at the first position-affecting / showing / structural op
        }
        changed = true;
        consumed.add(ann);
      }
      if (changed) {
        const newBytes = _emitContentStream(insts, bytes);
        // Write back to the same indirect object, uncompressed.
        const newDict = stream.dict.clone(doc.context);
        try {
          newDict.delete(PDFName.of('Filter'));
        } catch (_) {}
        try {
          newDict.delete(PDFName.of('DecodeParms'));
        } catch (_) {}
        newDict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length));
        const fresh = PDFRawStream.of(newDict, newBytes);
        doc.context.assign(doc.context.getObjectRef(stream), fresh);
      }
    }
  } catch (e) {
    console.warn('[text-delete] stream rewrite failed:', e && e.message);
  }
  return consumed;
}
const PDFJS_LOAD_OPTS = { isEvalSupported: false, useSystemFonts: true, stopAtErrors: false };
// Permissive pdf.js loader — accepts bytes, applies the same compatibility options every time.
async function loadPdfJsDoc(bytes) {
  return await pdfjsLib.getDocument(Object.assign({ data: bytes }, PDFJS_LOAD_OPTS)).promise;
}
// RENDER_SCALE maps PDF points to CSS pixels in the editor. 96 / 72 = 4/3
// is the same ratio every PDF viewer (Chrome, Acrobat, Edge…) uses when it
// renders a PDF at "100% zoom" on a 96 DPI monitor. Matching it here means:
//   editor "100%"  ==  PDF viewer "100%"  ==  printed paper (1 logical inch
// on the screen = 1 physical inch on the page). Combined with the per-text
// `fs = ann.fontSize / scale` in generatePdfBytes, a 14-px label in the
// editor lands as 14/96 inch = 10.5 pt in the saved PDF and prints at the
// exact same physical size the user designed it at — true 1:1.
// Using a higher RENDER_SCALE (the old 1.6) was nice for editor sharpness
// but made the editor "100%" 1.2× larger than the PDF viewer's "100%", so
// text / positions / line spacing all looked wrong on print and save.
const RENDER_SCALE = 4 / 3;
const PALETTE = ['#000000', '#dc2626', '#2563eb', '#15803d', '#a16207', '#7c3aed', '#ffffff'];
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
const LINE_HEIGHT_RATIO = 1.15;
const BASELINE_OFFSET = 0.82;

let pdfBytes = null,
  pdfJsDoc = null,
  pdfFileName = 'edited.pdf';
let pdfTotalTextItems = 0; // set during renderPages — 0 means scanned / image-only PDF
// Set by the "New" button when the document was just-created (single blank
// page). Suppresses the OCR banner + the "no editable text" toast since the
// emptiness is by design — the user wants to draw on a fresh canvas.
let _isBlankPdf = false;
let currentTool = 'select';
let currentShape = 'rect';
let defaultColor = '#000000',
  defaultSize = 14,
  defaultStroke = 2,
  defaultBrush = 'pen';
let defaultTextFont = 'Helvetica',
  defaultLineHeight = 1.15,
  defaultAlign = 'left';
let annotations = [];
let lastClickPos = null;
let selected = null;
let activeEditor = null,
  activeEditorAnn = null,
  isNewAnnotation = false;
let editorJustCommitted = false;
let _deselectLockUntil = 0; // see deselect() — short grace window after commit
let editorJustOpened = false;
let workerReady = null;
let currentZoom = 1.0;
const NS_SVG = 'http://www.w3.org/2000/svg';

// === THEME ===
document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme'))
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
});

// === PDF.js WORKER ===
async function initPdfWorker() {
  const u = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  try {
    const r = await fetch(u);
    if (!r.ok) throw new Error('fetch failed');
    const t = await r.text();
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
      new Blob([t], { type: 'application/javascript' })
    );
  } catch (e) {
    console.warn('Worker blob fallback:', e.message);
    pdfjsLib.GlobalWorkerOptions.workerSrc = u;
  }
}
workerReady = initPdfWorker();

// === Mobile "use desktop" notice (v1.34) ===
// The mobile editor experience is being rebuilt — until that ships, only
// PHONES get a friendly overlay pointing them to the desktop site. Desktop
// browsers (even narrow ones) get the editor unaltered.
//
// v1.35 tightened the trigger because v1.34's 760 px breakpoint was also
// firing on small-windowed desktops. The rule is now:
//   - viewport ≤ 500 px wide → phone, show notice
//   - hovers-with-fine-pointer (mouse) → desktop, never show notice
//     (catches landscape phones that report wider viewport too)
(function _showMobileNotice() {
  const PHONE_MAX_W = 500; // iPhone Pro Max in portrait = 430; we leave headroom
  const notice = document.getElementById('mobileNotice');
  if (!notice) return;
  // hasFinePointer is true on devices with a precise pointing device — i.e.
  // a mouse-driven desktop or laptop. We treat such devices as "definitely
  // desktop" no matter how narrow the window happens to be.
  let hasFinePointer = false;
  try {
    hasFinePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  } catch (_) {}
  if (hasFinePointer) return;
  // Otherwise gate on viewport width — phones are <= 500 px portrait.
  if (window.innerWidth > PHONE_MAX_W) return;
  notice.hidden = false;
  const cont = document.getElementById('mobileNoticeContinue');
  if (cont)
    cont.addEventListener('click', () => {
      notice.hidden = true;
    });
})();

// Touch-mode flag — set ONLY when the primary pointer is coarse (touch) AND there
// is no fine pointer (mouse). This deliberately does NOT trip on hybrid Windows
// touch-laptops (which also report a fine pointer), so desktop stays byte-for-byte
// unchanged; it gates the body[data-touch] mobile CSS + gesture tweaks.
(function _setTouchFlag() {
  try {
    const mm = window.matchMedia;
    if (!mm) return;
    const coarse = mm('(pointer: coarse)').matches;
    const fine = mm('(pointer: fine)').matches;
    if (coarse && !fine) document.body.setAttribute('data-touch', '1');
  } catch (_) {}
})();

// === SW + UPDATE ===
let waitingSW = null,
  refreshing = false;
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(newSW);
          });
        });
        setInterval(() => reg.update().catch(() => {}), 3600 * 1000);
      })
      .catch((e) => console.warn('SW register failed:', e));
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
function showUpdateBanner(sw) {
  waitingSW = sw;
  document.getElementById('updateBanner').classList.add('show');
}
document.getElementById('updateAccept').addEventListener('click', () => {
  if (waitingSW) waitingSW.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
});
document.getElementById('updateDismiss').addEventListener('click', () => {
  document.getElementById('updateBanner').classList.remove('show');
});

// === PWA INSTALL ===
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(() => {
    if (!localStorage.getItem('installDismissed'))
      document.getElementById('installBanner').classList.add('show');
  }, 4000);
});
document.getElementById('installAccept').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  document.getElementById('installBanner').classList.remove('show');
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
document.getElementById('installDismiss').addEventListener('click', () => {
  document.getElementById('installBanner').classList.remove('show');
  localStorage.setItem('installDismissed', '1');
});

// === LAUNCH QUEUE ===
if ('launchQueue' in window) {
  launchQueue.setConsumer(async (lp) => {
    if (!lp.files || !lp.files.length) return;
    for (const h of lp.files) {
      try {
        const f = await h.getFile();
        if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
          await loadPDF(f);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
  });
}

const CTX = {
  noFile: {
    step: 1,
    key: 'ctx.noFile',
    text: 'Start by opening a PDF file — click "Open" or drag a file onto the page.',
  },
  select: {
    step: 2,
    key: 'ctx.select',
    text: 'Click an existing object to select, drag to move, use handles to resize/rotate. PRO: double-click any text in the PDF itself to edit it. Press Esc anywhere to return to this mode.',
  },
  text: {
    step: 2,
    key: 'ctx.text',
    text: 'Click on the PDF to add text. Enter finishes — Shift+Enter for a new line. Select any part to format it.',
  },
  typing: {
    step: 3,
    key: 'ctx.typing',
    text: 'Type your text. Select any part to format it. Press Esc to cancel, click outside or ✓ Done to finish.',
  },
  selected: {
    step: 3,
    key: 'ctx.selected',
    text: 'Drag to move. Drag corners to resize, top handle to rotate. Press Delete to remove.',
  },
  draw: {
    step: 2,
    key: 'ctx.draw',
    text: 'Free drawing — click and drag (or use your finger) to draw on the PDF. Press Esc to switch back to Select.',
  },
  shape: {
    step: 2,
    key: 'ctx.shape',
    text: 'Click and drag on the PDF to draw a shape. Press Esc to switch back to Select.',
  },
  'edit-pdf': {
    step: 2,
    key: 'ctx.editPdf',
    text: 'PRO: Click any text in the PDF to edit, retype, or delete it. Or just double-click any text in any mode. The app matches the original font and size automatically.',
  },
  highlight: {
    step: 2,
    key: 'ctx.highlight',
    text: 'PRO: Drag across the PDF text to highlight a span (or click a single word). Use the Style color picker (top right) to change the highlight colour. Esc returns to Select.',
  },
  underline: {
    step: 2,
    key: 'ctx.underline',
    text: 'PRO: Drag across the PDF text to underline a span (or click a single word). Style color sets the line colour. Esc returns to Select.',
  },
  strike: {
    step: 2,
    key: 'ctx.strike',
    text: 'PRO: Drag across the PDF text to strike it out (or click a single word). Style color sets the line colour. Esc returns to Select.',
  },
  link: {
    step: 2,
    key: 'ctx.link',
    text: 'PRO: Click and drag a rectangle, then enter a URL or page number — it becomes clickable in the saved PDF.',
  },
};
let _lastContextKey = 'noFile';
function setContext(key) {
  const c = CTX[key];
  if (!c) return;
  _lastContextKey = key;
  document.querySelector('#contextBar .step').textContent = c.step;
  document.getElementById('contextText').textContent = window.t(c.key, c.text);
}
function updateContextHint() {
  setContext(_lastContextKey);
}

const TOOL_LABELS_KEYS = {
  select: 'tool.select',
  text: 'tool.text',
  draw: 'tool.draw',
  shape: 'tool.shape',
  'edit-pdf': 'tool.editPdf',
  highlight: 'tool.highlight',
  underline: 'tool.underline',
  strike: 'tool.strike',
  link: 'tool.link',
  field: 'tool.field',
};
const TOOL_LABELS = {
  select: 'Select',
  text: 'Text',
  draw: 'Draw',
  shape: 'Shape',
  'edit-pdf': 'Edit PDF',
  highlight: 'Highlight',
  underline: 'Underline',
  strike: 'Strike',
  link: 'Link',
  field: 'Field',
};
function updateToolUI() {
  document.querySelectorAll('.btn.tool').forEach((x) => {
    const isActive = x.dataset.tool === currentTool;
    x.classList.toggle('active', isActive);
  });
  document.getElementById('statusTool').textContent =
    currentTool === 'shape'
      ? window.t('tool.shape', 'Shape') + ' · ' + currentShape
      : window.t(TOOL_LABELS_KEYS[currentTool] || 'tool.select', TOOL_LABELS[currentTool] || 'Select');
  document.querySelectorAll('.overlay').forEach((o) => {
    o.classList.toggle('text-cursor', currentTool === 'text');
    o.classList.toggle('draw-cursor', currentTool === 'draw');
    o.classList.toggle('shape-cursor', currentTool === 'shape');
  });
  document.getElementById('defaultSize').style.display = currentTool === 'text' ? '' : 'none';
  document.getElementById('defaultStroke').style.display =
    currentTool === 'draw' || currentTool === 'shape' ? '' : 'none';
  // The old inconspicuous brush dropdown is replaced by the prominent .brush-bar
  // (shown via CSS on body.draw-mode). The element stays in the DOM as a hidden
  // sentinel for legacy state but is never visible.
  document.getElementById('defaultBrush').style.display = 'none';
  document.getElementById('defaultColor').style.display = currentTool === 'select' ? 'none' : '';
  // Reflect the current brush + colour in the floating bar and update the
  // overlay cursor so it looks like what the brush will actually paint.
  if (typeof _syncBrushBar === 'function' && currentTool === 'draw') _syncBrushBar();
  if (typeof _updateDrawCursor === 'function') _updateDrawCursor();
}
function setTool(tool) {
  if (activeEditor) commitEditor(true);
  const changed = currentTool !== tool;
  currentTool = tool;
  if (pdfJsDoc) setContext(currentTool);
  updateToolUI();
  closeAllDropdowns();
  deselect();
  document.body.classList.toggle('draw-mode', currentTool === 'draw');
  document.body.classList.toggle('shape-mode', currentTool === 'shape');
  document.body.classList.toggle('edit-pdf-mode', currentTool === 'edit-pdf');
  document.body.classList.toggle('select-mode', currentTool === 'select');
  document.body.classList.toggle('highlight-mode', currentTool === 'highlight');
  document.body.classList.toggle('underline-mode', currentTool === 'underline');
  document.body.classList.toggle('strike-mode', currentTool === 'strike');
  document.body.classList.toggle('link-mode', currentTool === 'link');
  document.body.classList.toggle('field-mode', currentTool === 'field');
  document.body.classList.toggle('redact-mode', currentTool === 'redact');
  document
    .querySelectorAll('.overlay')
    .forEach((o) => o.classList.toggle('edit-pdf-cursor', currentTool === 'edit-pdf'));
  // Sync the floating deco-color-bar with the new tool's stored colour
  if (
    typeof _decoColors !== 'undefined' &&
    (tool === 'highlight' || tool === 'underline' || tool === 'strike')
  ) {
    const c = _decoColors[tool] || (tool === 'highlight' ? '#ffeb3b' : '#dc2626');
    document
      .querySelectorAll('.dcb-swatch')
      .forEach((b) => b.classList.toggle('active', b.dataset.color === c));
    const _customInp = document.getElementById('decoCustomColor');
    if (_customInp) _customInp.value = c;
  }
  // Sync the mobile dock's active-tool highlight
  if (typeof window._syncMobileDockActive === 'function') window._syncMobileDockActive();
  if (changed && tool !== 'select' && typeof bumpUsage === 'function') {
    bumpUsage(tool === 'shape' ? 'shape:' + currentShape : 'tool:' + tool);
  }
}

document.querySelectorAll('.btn.tool').forEach((b) => {
  b.addEventListener('click', (e) => {
    const tool = b.dataset.tool;
    if (tool === 'edit-pdf' && pdfJsDoc && pdfTotalTextItems === 0) {
      showImageOnlyPdfNotice();
      return;
    }
    setTool(tool);
  });
});

// Friendly explanation when the loaded PDF has no extractable text (scan / image-only)
function showImageOnlyPdfNotice() {
  showToast(
    window.t(
      'toast.scanNotice',
      "This PDF has no editable text — it looks like a scan or image-only PDF. Use 'Add Text' to overlay new text on top."
    ),
    'warn'
  );
}
document.getElementById('defaultColor').addEventListener('input', (e) => (defaultColor = e.target.value));
document.getElementById('defaultSize').addEventListener('input', (e) => {
  const v = parseInt(e.target.value);
  if (v >= 6 && v <= 96) defaultSize = v;
});
document.getElementById('defaultStroke').addEventListener('input', (e) => {
  const v = parseInt(e.target.value);
  if (v >= 1 && v <= 20) defaultStroke = v;
});
document.getElementById('defaultBrush').addEventListener('change', (e) => {
  defaultBrush = e.target.value;
});
