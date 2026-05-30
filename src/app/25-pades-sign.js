// =====================================================================
// =====================================================================
// =====================  PAdES signing (X.509)  =======================
// =====================================================================
// Real cryptographic signing per PAdES-B-B (CMS SignedData embedded into
// the PDF signature dict). Uses node-forge for PKCS#12 parsing, certificate
// chain extraction, hashing, and PKCS#7 construction.
const FORGE_CDN = 'https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js';
let _forgePromise = null;
function loadForge() {
  return _forgePromise || (_forgePromise = _loadScript(FORGE_CDN));
}

let _certData = null; // { privateKey, certs, info: {cn, issuer, validFrom, validTo} }
async function _parseCertFile(file, password) {
  await loadForge();
  const buf = new Uint8Array(await file.arrayBuffer());
  // Convert to forge's binary string format
  let binStr = '';
  for (let i = 0; i < buf.length; i++) binStr += String.fromCharCode(buf[i]);
  const p12Asn1 = forge.asn1.fromDer(binStr);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '');
  // Try both encrypted + unencrypted private key bags
  let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  let keyArr = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
  if (!keyArr || !keyArr.length) {
    keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
    keyArr = keyBags[forge.pki.oids.keyBag];
  }
  if (!keyArr || !keyArr.length) throw new Error('No private key found in PKCS#12 bundle.');
  const privateKey = keyArr[0].key;
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = (certBags[forge.pki.oids.certBag] || []).map((b) => b.cert);
  if (!certs.length) throw new Error('No certificate found in PKCS#12 bundle.');
  // Find the leaf cert (the one corresponding to the private key)
  const leaf = certs[0]; // first is conventionally the leaf in most p12 files
  const info = {
    cn: leaf.subject.getField('CN')?.value || '(no CN)',
    org: leaf.subject.getField('O')?.value || '',
    issuer: leaf.issuer.getField('CN')?.value || '(unknown issuer)',
    validFrom: leaf.validity.notBefore,
    validTo: leaf.validity.notAfter,
    serial: leaf.serialNumber,
  };
  return { privateKey, certs, leaf, info };
}

// Build the visible signature appearance image as a PNG dataURL
function _buildSigAppearancePng(info, reason, location, when) {
  const w = 400,
    h = 140;
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2; // 2x for HiDPI
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  // Background + border
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  // Header
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, w, 22);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Helvetica, Arial, sans-serif';
  ctx.fillText('🔐  DIGITALLY SIGNED', 8, 15);
  // Body text
  ctx.fillStyle = '#111';
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
  ctx.fillText(info.cn, 8, 42);
  ctx.font = '11px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#555';
  let y = 58;
  if (info.org) {
    ctx.fillText(info.org, 8, y);
    y += 14;
  }
  ctx.fillText('Issued by: ' + info.issuer, 8, y);
  y += 14;
  ctx.fillText('Signed: ' + when.toISOString().replace('T', ' ').slice(0, 19) + ' UTC', 8, y);
  y += 14;
  if (reason) (ctx.fillText('Reason: ' + reason.slice(0, 50), 8, y), (y += 14));
  if (location) ctx.fillText('Location: ' + location.slice(0, 50), 8, y);
  return c.toDataURL('image/png');
}

// Compute SHA-256 over a byte range (uint8array indices)
async function _sha256OverRange(bytes, ranges) {
  // ranges = [[start, len], [start, len], ...] (PDF /ByteRange format)
  // Concatenate the byte ranges then hash
  let total = 0;
  for (const r of ranges) total += r[1];
  const merged = new Uint8Array(total);
  let off = 0;
  for (const r of ranges) {
    merged.set(bytes.subarray(r[0], r[0] + r[1]), off);
    off += r[1];
  }
  const hash = await crypto.subtle.digest('SHA-256', merged);
  return new Uint8Array(hash);
}

// Build CMS SignedData (PAdES-B-B) using node-forge
function _buildCmsSignature(privateKey, certs, contentHash, signingTimeDate) {
  // Construct a PKCS#7 SignedData detached signature.
  // Forge's pkcs7 module supports this with addSignerInfo + sign + toAsn1.
  const p7 = forge.pkcs7.createSignedData();
  // content is the hashed PDF byte range; PKCS#7 expects raw content but for
  // PAdES we pass an empty content + an already-computed message digest in
  // authenticated attributes. Forge takes care of building messageDigest attr
  // when we set contentDigest manually:
  p7.content = forge.util.createBuffer(''); // detached signature
  for (const cert of certs) p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: certs[0],
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest /* forge fills with sha256 of content */ },
      { type: forge.pki.oids.signingTime, value: signingTimeDate },
    ],
  });
  // Forge's signer expects to compute messageDigest from `p7.content`. Since
  // we want the digest over the PDF byte range (which is in `contentHash`),
  // we monkey-patch p7's content to BE the byte range. Forge accepts that.
  // Easier path: feed the actual byte-range bytes as content (we still want
  // detached, so we don't include them in output).
  // Implementation: we rebuild content = the actual byte-range bytes.
  // (caller passes contentHash separately, but forge needs raw bytes.)
  // We'll handle this in the wrapper that calls _buildCmsSignature.
  p7.sign({ detached: true });
  const asn1 = p7.toAsn1();
  const der = forge.asn1.toDer(asn1).getBytes();
  // Convert binary string to Uint8Array
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i);
  return out;
}

// Higher-level signer: takes the PDF byte range, builds CMS with the actual
// bytes as content for digest computation, returns the DER-encoded CMS bytes.
function _signByteRange(privateKey, certs, byteRangeBytes, signingTime) {
  const p7 = forge.pkcs7.createSignedData();
  // Forge accepts content as binary string
  let bin = '';
  for (let i = 0; i < byteRangeBytes.length; i++) bin += String.fromCharCode(byteRangeBytes[i]);
  p7.content = forge.util.createBuffer(bin);
  for (const cert of certs) p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: certs[0],
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: signingTime },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const out = new Uint8Array(der.length);
  for (let i = 0; i < der.length; i++) out[i] = der.charCodeAt(i);
  return out;
}

// Main entry: produce a PAdES-signed PDF as Uint8Array
async function signPdfPades(srcBytes, certData, opts) {
  await loadForge();
  const reason = opts.reason || '';
  const location = opts.location || '';
  const contact = opts.contact || '';
  const when = new Date();
  // 1. Optionally add a visible signature widget appearance to the PDF
  let pdfBytesWork = srcBytes;
  if (opts.visible) {
    // Add a visible signature appearance image annotation on page 1 via pdf-lib
    const apngUrl = _buildSigAppearancePng(certData.info, reason, location, when);
    const apngBytes = dataURLToBytes(apngUrl);
    const doc = await PDFDocument.load(srcBytes.slice(0), PDF_LOAD_OPTS);
    const png = await doc.embedPng(apngBytes);
    const page = doc.getPage(0);
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    // Bottom-right 200x70 box with 36pt margin
    const sigW = 200,
      sigH = 70;
    page.drawImage(png, {
      x: pageW - sigW - 36,
      y: 36,
      width: sigW,
      height: sigH,
    });
    pdfBytesWork = await doc.save();
  }
  // 2. Insert a /Sig dict + AcroForm with placeholder /Contents
  //    The placeholder is a long hex string of zeros that we'll later overwrite
  //    with the real CMS signature. Reserve 16384 hex chars = 8192 bytes — plenty
  //    for a typical RSA-2048 CMS with cert chain.
  const SIG_CONTENTS_SIZE = 8192;
  const PLACEHOLDER = '0'.repeat(SIG_CONTENTS_SIZE * 2);
  const { PDFName, PDFString, PDFHexString, PDFArray, PDFNumber } = PDFLib;
  const doc = await PDFDocument.load(pdfBytesWork.slice(0), PDF_LOAD_OPTS);
  const page = doc.getPage(0);
  const ctx = doc.context;
  // Build the /Sig dict
  const sigDict = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, 0, 0, 0], // placeholder; we'll patch the raw bytes after save
    Contents: PDFHexString.of(PLACEHOLDER),
    M: PDFString.fromDate(when),
    Name: PDFString.of(certData.info.cn),
    Reason: PDFString.of(reason),
    Location: PDFString.of(location),
    ContactInfo: PDFString.of(contact),
    Prop_Build: ctx.obj({ Filter: ctx.obj({ Name: 'Adobe.PPKLite', R: PDFNumber.of(196608) }) }),
  });
  const sigRef = ctx.register(sigDict);
  // Widget annotation linking the signature field
  const widget = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    Rect: [0, 0, 0, 0], // invisible widget (we drew the appearance separately)
    V: sigRef,
    T: PDFString.of('PDFMiniProSig_' + Date.now()),
    F: PDFNumber.of(4),
    P: page.ref,
  });
  const widgetRef = ctx.register(widget);
  // Attach widget to page's /Annots
  const AnnotsKey = PDFName.of('Annots');
  let annotsArr = page.node.lookupMaybe(AnnotsKey, PDFArray);
  if (!annotsArr) {
    annotsArr = ctx.obj([]);
    page.node.set(AnnotsKey, annotsArr);
  }
  annotsArr.push(widgetRef);
  // AcroForm with our signature field
  let acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFLib.PDFDict);
  if (!acroForm) {
    acroForm = ctx.obj({ Fields: ctx.obj([widgetRef]), SigFlags: PDFNumber.of(3) });
    doc.catalog.set(PDFName.of('AcroForm'), acroForm);
  } else {
    let fields = acroForm.lookupMaybe(PDFName.of('Fields'), PDFArray);
    if (!fields) {
      fields = ctx.obj([]);
      acroForm.set(PDFName.of('Fields'), fields);
    }
    fields.push(widgetRef);
    acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  }
  // Force NO object streams so byte offsets are predictable
  let bytes = await doc.save({ useObjectStreams: false });
  const dec = new TextDecoder('latin1');
  const enc = new TextEncoder();
  // 3. Expand the narrow ByteRange placeholder (`[ 0 0 0 0 ]`, ~21 chars) to a
  //    fixed 60-char wide placeholder so we can later write real byte-range
  //    values without overflowing or shifting subsequent bytes.
  const RESERVED_BR_LEN = 60;
  let hay = dec.decode(bytes);
  const brRegex = /\/ByteRange\s*\[\s*0\s+0\s+0\s+0\s*\]/;
  const brMatch = brRegex.exec(hay);
  if (!brMatch) throw new Error('ByteRange placeholder not found in saved PDF.');
  const brOrigLen = brMatch[0].length;
  const expandedBrTpl = '/ByteRange [' + ' '.repeat(RESERVED_BR_LEN - 13) + ']'; // = RESERVED_BR_LEN chars
  const delta = RESERVED_BR_LEN - brOrigLen;
  const expanded = new Uint8Array(bytes.length + delta);
  expanded.set(bytes.subarray(0, brMatch.index), 0);
  expanded.set(enc.encode(expandedBrTpl), brMatch.index);
  expanded.set(bytes.subarray(brMatch.index + brOrigLen), brMatch.index + RESERVED_BR_LEN);
  bytes = expanded;
  // 4. Locate the /Contents placeholder in the (now expanded) byte stream
  const placeholderToken = '<' + PLACEHOLDER + '>';
  hay = dec.decode(bytes);
  const placeholderIdx = hay.indexOf(placeholderToken);
  if (placeholderIdx < 0) throw new Error('Could not locate /Contents placeholder.');
  const beforeLen = placeholderIdx + 1; // through '<'
  const afterStart = placeholderIdx + 1 + PLACEHOLDER.length; // position of '>'
  const afterLen = bytes.length - afterStart;
  const byteRange = [0, beforeLen, afterStart, afterLen];
  // 5. Write the actual ByteRange values into the reserved 60-char slot
  const brContent = byteRange.join(' ');
  const realBr = '/ByteRange [' + brContent + ']';
  if (realBr.length > RESERVED_BR_LEN) {
    throw new Error('ByteRange too wide (' + realBr.length + ' > ' + RESERVED_BR_LEN + ').');
  }
  const padded = '/ByteRange [' + brContent + ' '.repeat(RESERVED_BR_LEN - realBr.length) + ']';
  bytes.set(enc.encode(padded), brMatch.index);
  // 6. Compute the byte range that's actually being signed (everything except the
  //    bytes INSIDE the /Contents <...> placeholder).
  const rangeBytes = new Uint8Array(beforeLen + afterLen);
  rangeBytes.set(bytes.subarray(0, beforeLen), 0);
  rangeBytes.set(bytes.subarray(afterStart, afterStart + afterLen), beforeLen);
  // 7. Build CMS SignedData (PAdES-B-B)
  const cmsBytes = _signByteRange(certData.privateKey, certData.certs, rangeBytes, when);
  if (cmsBytes.length > SIG_CONTENTS_SIZE) {
    throw new Error('Signature too large (' + cmsBytes.length + ' bytes) — increase SIG_CONTENTS_SIZE.');
  }
  // 8. Hex-encode and pad to the placeholder length
  let hex = '';
  for (let i = 0; i < cmsBytes.length; i++) {
    const b = cmsBytes[i].toString(16);
    hex += b.length === 1 ? '0' + b : b;
  }
  hex = hex.padEnd(SIG_CONTENTS_SIZE * 2, '0');
  bytes.set(enc.encode(hex), placeholderIdx + 1);
  return bytes;
}

// ---- Modal wiring ----
function openCertSignModal() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  _certData = null;
  document.getElementById('certFileName').textContent = 'Choose file…';
  document.getElementById('certPassword').value = '';
  document.getElementById('certInfoBox').style.display = 'none';
  document.getElementById('certSignBtn').disabled = true;
  document.getElementById('certSignModal').classList.add('show');
}
function closeCertSignModal() {
  document.getElementById('certSignModal').classList.remove('show');
}
async function _tryParseCert() {
  const fileInput = document.getElementById('certFileInput');
  const file = fileInput.files[0];
  if (!file) return;
  const password = document.getElementById('certPassword').value;
  const info = document.getElementById('certInfoBox');
  const btn = document.getElementById('certSignBtn');
  info.style.display = 'block';
  info.className = 'settings-status';
  info.textContent = 'Parsing…';
  btn.disabled = true;
  try {
    _certData = await _parseCertFile(file, password);
    const i = _certData.info;
    info.className = 'settings-status ok';
    info.textContent =
      'Signer: ' +
      i.cn +
      (i.org ? ' (' + i.org + ')' : '') +
      '\nIssuer: ' +
      i.issuer +
      '\nValid: ' +
      i.validFrom.toISOString().slice(0, 10) +
      ' → ' +
      i.validTo.toISOString().slice(0, 10) +
      '\nSerial: ' +
      i.serial.slice(0, 32);
    btn.disabled = false;
  } catch (e) {
    _certData = null;
    info.className = 'settings-status err';
    info.textContent =
      'Failed: ' + (e.message || e) + '\n(Check the password — most p12 errors are wrong password.)';
    btn.disabled = true;
  }
}
async function doCertSign() {
  if (!_certData) return;
  const btn = document.getElementById('certSignBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Signing…';
  try {
    // Bake current edits into PDF bytes first
    const sourceBytes = annotations.length || acroFormFields.length ? await generatePdfBytes() : pdfBytes;
    const signedBytes = await signPdfPades(sourceBytes, _certData, {
      reason: document.getElementById('certReason').value.trim(),
      location: document.getElementById('certLocation').value.trim(),
      contact: document.getElementById('certContact').value.trim(),
      visible: document.getElementById('certVisible').checked,
    });
    const blob = new Blob([signedBytes], { type: 'application/pdf' });
    const name = _shareSafeName((pdfFileName || 'document').replace(/\.pdf$/i, '') + '-signed.pdf');
    downloadBlob(blob, name);
    closeCertSignModal();
    showToast(
      `✓ Signed ${name} (${(signedBytes.length / 1024).toFixed(1)} KB). Open in Acrobat Reader to validate.`,
      'success'
    );
  } catch (e) {
    console.error('[pades] sign failed:', e);
    showToast('Signing failed: ' + (e.message || e), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}
(function wireCertSign() {
  const fi = document.getElementById('certFileInput');
  if (fi)
    fi.addEventListener('change', () => {
      const f = fi.files[0];
      if (f) {
        document.getElementById('certFileName').textContent = f.name;
        _tryParseCert();
      }
    });
  const pwd = document.getElementById('certPassword');
  if (pwd)
    pwd.addEventListener('input', () => {
      // Debounce — re-parse after user stops typing
      clearTimeout(window._certPwdT);
      window._certPwdT = setTimeout(_tryParseCert, 350);
    });
  const c = document.getElementById('certClose');
  if (c) c.addEventListener('click', closeCertSignModal);
  const cc = document.getElementById('certCancel');
  if (cc) cc.addEventListener('click', closeCertSignModal);
  const go = document.getElementById('certSignBtn');
  if (go) go.addEventListener('click', doCertSign);
  const m = document.getElementById('certSignModal');
  if (m)
    m.addEventListener('click', (e) => {
      if (e.target.id === 'certSignModal') closeCertSignModal();
    });
})();

