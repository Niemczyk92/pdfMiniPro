// =====================================================================
// =====================================================================
// =====================  EXPORT → TEXT / DOCX  ========================
// =====================================================================
// Browser-side PDF text extraction via pdf.js. The DOCX writer is a hand-rolled
// minimal OOXML packed into a stored-mode (no-compression) ZIP — no JSZip
// dependency, ~120 LOC. Output opens in Word, LibreOffice, Google Docs.
async function _extractAllPdfText() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return null;
  }
  const pages = [];
  for (let pi = 1; pi <= pdfJsDoc.numPages; pi++) {
    const page = await pdfJsDoc.getPage(pi);
    const tc = await page.getTextContent();
    // Group items into lines by Y-position
    const items = tc.items.filter((it) => it.str);
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    let lines = [];
    let curY = null,
      curLine = [];
    for (const it of items) {
      const y = it.transform[5];
      if (curY === null || Math.abs(y - curY) < 3) {
        curLine.push(it.str);
        curY = curY === null ? y : curY;
      } else {
        if (curLine.length) lines.push(curLine.join(' '));
        curLine = [it.str];
        curY = y;
      }
    }
    if (curLine.length) lines.push(curLine.join(' '));
    // Fallback: if pdf.js found nothing (image-only / scanned page), read
    // the OCR-injected DOM spans for this page. Without this, Export → Text
    // and Export → Word silently produce empty output for scanned PDFs that
    // the user *already* ran OCR on.
    if (lines.length === 0) {
      const wrapper = document.querySelector(`.page-wrapper[data-page-num="${pi}"]`);
      const ocrSpans = wrapper ? wrapper.querySelectorAll('.pdf-text-layer .pdf-text-item') : [];
      if (ocrSpans.length) {
        // Group by visual Y (top px in design space) into lines
        const spans = [];
        ocrSpans.forEach((s) => {
          const y = parseFloat(s.dataset.y || '0');
          const x = parseFloat(s.dataset.x || '0');
          const t = s.dataset.text || '';
          if (t) spans.push({ x, y, t });
        });
        spans.sort((a, b) => a.y - b.y || a.x - b.x);
        let cY = null,
          cur = [];
        for (const s of spans) {
          if (cY === null || Math.abs(s.y - cY) < 6) {
            cur.push(s);
            cY = cY === null ? s.y : cY;
          } else {
            if (cur.length)
              lines.push(
                cur
                  .sort((a, b) => a.x - b.x)
                  .map((z) => z.t)
                  .join(' ')
              );
            cur = [s];
            cY = s.y;
          }
        }
        if (cur.length)
          lines.push(
            cur
              .sort((a, b) => a.x - b.x)
              .map((z) => z.t)
              .join(' ')
          );
      }
    }
    // Also fold in any user-added text annotations on this page so manual
    // notes show up in TXT/DOCX export alongside the PDF / OCR text.
    try {
      const manual = (annotations || [])
        .filter((a) => a && a.type === 'text' && a.pageNum === pi && a.text)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((a) =>
          String(a.text)
            .replace(/<[^>]+>/g, '')
            .trim()
        )
        .filter(Boolean);
      if (manual.length) lines.push(...manual);
    } catch (_) {}
    pages.push(lines);
    page.cleanup();
  }
  return pages;
}
async function exportToText() {
  showToast(window.t('toast.extracting', 'Extracting text…'), 'info');
  const pages = await _extractAllPdfText();
  if (!pages) return;
  let out = '';
  pages.forEach((lines, i) => {
    out += window.t('export.pageHeader', '=== Page {n} ===').replace('{n}', i + 1) + '\n';
    out += lines.join('\n');
    out += '\n\n';
  });
  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
  const name = _shareSafeName((pdfFileName || 'document').replace(/\.pdf$/i, '') + '.txt').replace(
    /\.pdf$/i,
    '.txt'
  );
  downloadBlob(blob, name);
  showToast(
    window
      .t('toast.exportedPages', 'Exported {n} pages → {name}')
      .replace('{n}', pages.length)
      .replace('{name}', name),
    'success'
  );
}

// ---- Minimal ZIP writer (STORED method, no compression) ----
// Produces a valid ZIP that Word, LibreOffice, etc. accept as DOCX/XLSX.
function _crc32(bytes) {
  if (!_crc32.table) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    _crc32.table = t;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = (_crc32.table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}
function _zipPack(files) {
  // files: [{ name: 'path/in/zip', data: Uint8Array }]
  const enc = new TextEncoder();
  const records = files.map((f) => {
    const nameBytes = enc.encode(f.name);
    const dataBytes = f.data instanceof Uint8Array ? f.data : enc.encode(f.data);
    return { name: f.name, nameBytes, dataBytes, crc: _crc32(dataBytes), size: dataBytes.length };
  });
  const chunks = [];
  let offset = 0;
  const central = [];
  for (const r of records) {
    // Local file header (signature 0x04034b50)
    const local = new Uint8Array(30 + r.nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // sig
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method: 0 = stored
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0, true); // mod date
    lv.setUint32(14, r.crc, true); // crc32
    lv.setUint32(18, r.size, true); // compressed size
    lv.setUint32(22, r.size, true); // uncompressed size
    lv.setUint16(26, r.nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    local.set(r.nameBytes, 30);
    chunks.push(local);
    chunks.push(r.dataBytes);
    // Build central directory entry parallel
    const cd = new Uint8Array(46 + r.nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, r.crc, true);
    cv.setUint32(20, r.size, true);
    cv.setUint32(24, r.size, true);
    cv.setUint16(28, r.nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(r.nameBytes, 46);
    central.push(cd);
    offset += local.length + r.size;
  }
  const cdStart = offset;
  for (const cd of central) chunks.push(cd);
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  // End of central directory record (signature 0x06054b50)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, records.length, true);
  ev.setUint16(10, records.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(eocd);
  // Concatenate
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
function _xmlEscape(s) {
  return String(s || '').replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]
  );
}
async function exportToDocx() {
  showToast(window.t('toast.extracting', 'Extracting text…'), 'info');
  const pages = await _extractAllPdfText();
  if (!pages) return;
  // Build word/document.xml. One <w:p> per text line, page-break between pages.
  const paragraphs = [];
  pages.forEach((lines, idx) => {
    if (idx > 0) {
      paragraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
    paragraphs.push(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">' +
        _xmlEscape('Page ' + (idx + 1)) +
        '</w:t></w:r></w:p>'
    );
    for (const line of lines) {
      paragraphs.push('<w:p><w:r><w:t xml:space="preserve">' + _xmlEscape(line) + '</w:t></w:r></w:p>');
    }
  });
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs.join('')}</w:body>
</w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const enc = new TextEncoder();
  const zipBytes = _zipPack([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
  ]);
  const blob = new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const name = _shareSafeName((pdfFileName || 'document').replace(/\.pdf$/i, '') + '.docx').replace(
    /\.pdf$/i,
    '.docx'
  );
  downloadBlob(blob, name);
  showToast(
    window
      .t('toast.exportedPagesDocx', 'Exported {n} pages → {name}. Note: text only, layout is not preserved.')
      .replace('{n}', pages.length)
      .replace('{name}', name),
    'success'
  );
}

(function () {
  const t = document.getElementById('exportTextBtnMenu');
  if (t)
    t.addEventListener('click', () => {
      closeAllDropdowns && closeAllDropdowns();
      exportToText();
    });
  const d = document.getElementById('exportDocxBtnMenu');
  if (d)
    d.addEventListener('click', () => {
      closeAllDropdowns && closeAllDropdowns();
      exportToDocx();
    });
})();

// =====================================================================
// =====================  QR / BARCODE GENERATOR  ======================
// =====================================================================
// Lazy-loaded from CDN on first use; cached by the service worker for offline
// thereafter. Both libraries are pure-JS, no deps:
//   - qrcode-generator (Kazuhiko Arase)  ~12 KB minified
//   - JsBarcode                          ~30 KB minified
const QR_LIB_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
const BAR_LIB_URL = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
let _qrLibPromise = null;
let _barLibPromise = null;
function _loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + url + ' (no internet on first run?)'));
    document.head.appendChild(s);
  });
}
function loadQrLib() {
  return _qrLibPromise || (_qrLibPromise = _loadScript(QR_LIB_URL));
}
function loadBarLib() {
  return _barLibPromise || (_barLibPromise = _loadScript(BAR_LIB_URL));
}

// ===== QR wizard state =====
// `_qrTpl` is the chosen template (URL, vCard, …). `_qrLogo` is the optional
// center-logo image (HTMLImageElement) — null when none.
let _qrTpl = null;
let _qrLogo = null;

// Convert a Czech account number ("prefix-number" or "number") + 4-digit bank
// code into an IBAN (needed for the SPAYD payment payload). If `account` is
// already an IBAN it is returned normalised. Returns null on invalid input.
function _czAccountToIban(account, bankCode) {
  const raw = String(account || '').trim().replace(/\s+/g, '');
  if (/^[A-Za-z]{2}\d{2}/.test(raw)) return raw.toUpperCase(); // already an IBAN
  let prefix = '0',
    number = raw;
  if (raw.includes('-')) {
    const p = raw.split('-');
    prefix = p[0];
    number = p[1] || '';
  }
  prefix = prefix.replace(/\D/g, '');
  number = number.replace(/\D/g, '');
  const bank = String(bankCode || '').replace(/\D/g, '');
  if (!number || bank.length !== 4) return null;
  const bban = bank + prefix.padStart(6, '0') + number.padStart(10, '0'); // 20 digits
  // mod-97 check digits: BBAN + 'CZ'(=1235) + '00', check = 98 - (n mod 97)
  let check;
  try {
    check = 98 - Number(BigInt(bban + '123500') % 97n);
  } catch (_) {
    return null;
  }
  return 'CZ' + String(check).padStart(2, '0') + bban;
}

// ---- Template metadata ----
// Each template knows: icon, display name, what fields to render, and how to
// turn those field values into the actual QR string payload.
const QR_TEMPLATES = {
  payment: {
    icon: '💳',
    name: 'Payment (QR Platba)',
    fields: [
      {
        id: 'qrf_acc',
        label: 'Account number / IBAN',
        labelKey: 'qrf.acc',
        type: 'text',
        placeholder: '19-2000145399   or   CZ6508000000192000145399',
        placeholderKey: 'qrf.accPh',
        required: true,
      },
      {
        id: 'qrf_bank',
        label: 'Bank code (skip if IBAN above)',
        labelKey: 'qrf.bank',
        type: 'text',
        placeholder: '0800',
      },
      { id: 'qrf_amount', label: 'Amount', labelKey: 'qrf.amount', type: 'number', placeholder: '450.00' },
      {
        id: 'qrf_cur',
        label: 'Currency',
        labelKey: 'qrf.cur',
        type: 'select',
        options: [
          { value: 'CZK', label: 'CZK' },
          { value: 'EUR', label: 'EUR' },
          { value: 'USD', label: 'USD' },
          { value: 'GBP', label: 'GBP' },
          { value: 'PLN', label: 'PLN' },
        ],
      },
      { id: 'qrf_vs', label: 'Variable symbol (VS)', labelKey: 'qrf.vs', type: 'text', placeholder: '1234567890' },
      { id: 'qrf_ss', label: 'Specific symbol (SS)', labelKey: 'qrf.ss', type: 'text' },
      { id: 'qrf_ks', label: 'Constant symbol (KS)', labelKey: 'qrf.ks', type: 'text' },
      { id: 'qrf_rn', label: 'Recipient name', labelKey: 'qrf.rn', type: 'text' },
      { id: 'qrf_due', label: 'Due date', labelKey: 'qrf.due', type: 'date' },
      {
        id: 'qrf_msg',
        label: 'Message for recipient',
        labelKey: 'qrf.payMsg',
        type: 'text',
        placeholder: 'Invoice 2024-001',
      },
    ],
    // SPAYD (Short Payment Descriptor) — the Czech "QR Platba" standard read by
    // every CZ/SK banking app: SPD*1.0*ACC:<IBAN>*AM:<amt>*CC:<cur>*X-VS:..*MSG:..
    build: (v) => {
      const iban = _czAccountToIban(v.qrf_acc, v.qrf_bank);
      if (!iban) return '';
      const clean = (s, max) =>
        String(s || '')
          .replace(/\*/g, ' ')
          .trim()
          .slice(0, max);
      const parts = ['SPD', '1.0', 'ACC:' + iban];
      const amt = parseFloat(String(v.qrf_amount || '').replace(',', '.'));
      if (isFinite(amt) && amt > 0) parts.push('AM:' + amt.toFixed(2));
      parts.push('CC:' + (v.qrf_cur || 'CZK'));
      const digits = (s) => String(s || '').replace(/\D/g, '');
      if (digits(v.qrf_vs)) parts.push('X-VS:' + digits(v.qrf_vs));
      if (digits(v.qrf_ss)) parts.push('X-SS:' + digits(v.qrf_ss));
      if (digits(v.qrf_ks)) parts.push('X-KS:' + digits(v.qrf_ks));
      if (v.qrf_rn) parts.push('RN:' + clean(v.qrf_rn, 35));
      if (v.qrf_due) parts.push('DT:' + String(v.qrf_due).replace(/-/g, ''));
      if (v.qrf_msg) parts.push('MSG:' + clean(v.qrf_msg, 60));
      return parts.join('*');
    },
  },
  url: {
    icon: '🌐',
    name: 'Website',
    fields: [
      {
        id: 'qrf_url',
        label: 'URL',
        labelKey: 'qrf.url',
        type: 'text',
        placeholder: 'https://example.com',
        placeholderKey: 'qrf.urlPh',
        required: true,
      },
    ],
    build: (v) => {
      let u = (v.qrf_url || '').trim();
      if (!u) return '';
      if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
      return u;
    },
  },
  vcard: {
    icon: '👤',
    name: 'Business card',
    fields: [
      { id: 'qrf_first', label: 'First name', labelKey: 'qrf.first', type: 'text' },
      { id: 'qrf_last', label: 'Last name', labelKey: 'qrf.last', type: 'text' },
      { id: 'qrf_org', label: 'Company / Organization', labelKey: 'profile.company', type: 'text' },
      { id: 'qrf_title', label: 'Job title', labelKey: 'profile.jobTitle', type: 'text' },
      {
        id: 'qrf_tel',
        label: 'Phone',
        labelKey: 'profile.phone',
        type: 'tel',
        placeholderKey: 'profile.phone.ph',
        placeholder: '+1 (555) 123-4567',
      },
      {
        id: 'qrf_email',
        label: 'Email',
        labelKey: 'profile.email',
        type: 'email',
        placeholder: 'name@example.com',
      },
      {
        id: 'qrf_web',
        label: 'Website',
        labelKey: 'profile.website',
        type: 'text',
        placeholder: 'https://example.com',
      },
      { id: 'qrf_street', label: 'Street', labelKey: 'profile.street', type: 'text' },
      { id: 'qrf_city', label: 'City', labelKey: 'profile.city', type: 'text' },
      { id: 'qrf_zip', label: 'ZIP / Postcode', labelKey: 'profile.zip', type: 'text' },
      { id: 'qrf_country', label: 'Country', labelKey: 'profile.country', type: 'text' },
    ],
    build: (v) => {
      const fn = [v.qrf_first, v.qrf_last].filter(Boolean).join(' ').trim();
      if (!fn && !v.qrf_tel && !v.qrf_email) return '';
      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (v.qrf_last || v.qrf_first) lines.push(`N:${v.qrf_last || ''};${v.qrf_first || ''};;;`);
      if (fn) lines.push('FN:' + fn);
      if (v.qrf_org) lines.push('ORG:' + v.qrf_org);
      if (v.qrf_title) lines.push('TITLE:' + v.qrf_title);
      if (v.qrf_tel) lines.push('TEL;TYPE=CELL:' + v.qrf_tel);
      if (v.qrf_email) lines.push('EMAIL:' + v.qrf_email);
      if (v.qrf_web) lines.push('URL:' + v.qrf_web);
      if (v.qrf_street || v.qrf_city || v.qrf_zip || v.qrf_country) {
        lines.push(
          `ADR:;;${v.qrf_street || ''};${v.qrf_city || ''};;${v.qrf_zip || ''};${v.qrf_country || ''}`
        );
      }
      lines.push('END:VCARD');
      return lines.join('\n');
    },
  },
  wifi: {
    icon: '📶',
    name: 'Wi-Fi',
    fields: [
      { id: 'qrf_ssid', label: 'Network name (SSID)', labelKey: 'qrf.ssid', type: 'text', required: true },
      {
        id: 'qrf_pass',
        label: 'Password',
        labelKey: 'qrf.pass',
        type: 'text',
        placeholder: 'leave empty for open networks',
        placeholderKey: 'qrf.passPh',
      },
      {
        id: 'qrf_enc',
        label: 'Encryption',
        labelKey: 'qrf.enc',
        type: 'select',
        options: [
          { value: 'WPA', label: 'WPA / WPA2 / WPA3 (most common)', labelKey: 'qrf.enc.wpa' },
          { value: 'WEP', label: 'WEP (legacy)', labelKey: 'qrf.enc.wep' },
          { value: 'nopass', label: 'Open (no password)', labelKey: 'qrf.enc.open' },
        ],
      },
      { id: 'qrf_hidden', label: 'Hidden network', labelKey: 'qrf.hidden', type: 'checkbox' },
    ],
    build: (v) => {
      const ssid = (v.qrf_ssid || '').trim();
      if (!ssid) return '';
      const enc = v.qrf_enc || 'WPA';
      // Escape \ ; , : " per the Wi-Fi QR spec
      const esc = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1');
      let s = `WIFI:T:${enc};S:${esc(ssid)};`;
      if (enc !== 'nopass' && v.qrf_pass) s += `P:${esc(v.qrf_pass)};`;
      if (v.qrf_hidden) s += 'H:true;';
      s += ';';
      return s;
    },
  },
  email: {
    icon: '✉',
    name: 'Email',
    fields: [
      {
        id: 'qrf_to',
        label: 'To',
        labelKey: 'qrf.to',
        type: 'email',
        placeholder: 'name@example.com',
        placeholderKey: 'qrf.toPh',
        required: true,
      },
      { id: 'qrf_subj', label: 'Subject', labelKey: 'qrf.subj', type: 'text' },
      { id: 'qrf_body', label: 'Message', labelKey: 'qrf.msg', type: 'textarea' },
    ],
    build: (v) => {
      const to = (v.qrf_to || '').trim();
      if (!to) return '';
      const params = [];
      if (v.qrf_subj) params.push('subject=' + encodeURIComponent(v.qrf_subj));
      if (v.qrf_body) params.push('body=' + encodeURIComponent(v.qrf_body));
      return 'mailto:' + to + (params.length ? '?' + params.join('&') : '');
    },
  },
  phone: {
    icon: '📞',
    name: 'Phone',
    fields: [
      {
        id: 'qrf_tel',
        label: 'Phone number',
        labelKey: 'qrf.tel',
        type: 'tel',
        placeholder: '+1 (555) 123-4567',
        placeholderKey: 'profile.phone.ph',
        required: true,
      },
    ],
    build: (v) => {
      const t = (v.qrf_tel || '').replace(/\s+/g, '');
      return t ? 'tel:' + t : '';
    },
  },
  sms: {
    icon: '💬',
    name: 'SMS',
    fields: [
      {
        id: 'qrf_tel',
        label: 'Phone number',
        labelKey: 'qrf.tel',
        type: 'tel',
        placeholder: '+1 (555) 123-4567',
        placeholderKey: 'profile.phone.ph',
        required: true,
      },
      { id: 'qrf_msg', label: 'Pre-filled message', labelKey: 'qrf.smsMsg', type: 'textarea' },
    ],
    build: (v) => {
      const t = (v.qrf_tel || '').replace(/\s+/g, '');
      if (!t) return '';
      return 'SMSTO:' + t + (v.qrf_msg ? ':' + v.qrf_msg : '');
    },
  },
  geo: {
    icon: '📍',
    name: 'Location',
    fields: [
      {
        id: 'qrf_lat',
        label: 'Latitude',
        labelKey: 'qrf.lat',
        type: 'text',
        placeholder: '50.0755',
        required: true,
      },
      {
        id: 'qrf_lon',
        label: 'Longitude',
        labelKey: 'qrf.lon',
        type: 'text',
        placeholder: '14.4378',
        required: true,
      },
    ],
    build: (v) => {
      const lat = parseFloat(v.qrf_lat),
        lon = parseFloat(v.qrf_lon);
      if (!isFinite(lat) || !isFinite(lon)) return '';
      return `geo:${lat},${lon}`;
    },
  },
  text: {
    icon: '📝',
    name: 'Plain text',
    fields: [
      {
        id: 'qrf_text',
        label: 'Text',
        labelKey: 'qrf.text',
        type: 'textarea',
        required: true,
        placeholder: 'Any text you like — notes, codes, snippets…',
        placeholderKey: 'qrf.textPh',
      },
    ],
    build: (v) => (v.qrf_text || '').trim(),
  },
};

// Render the step-2 field list for the selected template, with profile
// pre-fill for vCard so the user's name / phone / email auto-populate.
function renderQrFields() {
  if (!_qrTpl) return;
  const tpl = QR_TEMPLATES[_qrTpl];
  if (!tpl) return;
  document.getElementById('qrTplIcon').textContent = tpl.icon;
  document.getElementById('qrTplName').textContent = window.t('qr.tpl.' + _qrTpl, tpl.name);
  const wrap = document.getElementById('qrFields');
  wrap.innerHTML = '';
  // Profile pre-fill for vCard
  let prefill = {};
  if (_qrTpl === 'vcard') {
    try {
      const p = typeof getProfile === 'function' ? getProfile() : {};
      if (p.fullName) {
        const parts = String(p.fullName).trim().split(/\s+/).filter(Boolean);
        prefill.qrf_first = parts[0] || '';
        prefill.qrf_last = parts.slice(1).join(' ') || '';
      }
      prefill.qrf_tel = p.phone || '';
      prefill.qrf_email = p.email || '';
      prefill.qrf_org = p.company || '';
      prefill.qrf_street = p.street || '';
      prefill.qrf_city = p.city || '';
      prefill.qrf_zip = p.zip || '';
      prefill.qrf_country = p.country || '';
    } catch (_) {}
  }
  for (const f of tpl.fields) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px';
    if (f.type !== 'checkbox') {
      const lbl = document.createElement('label');
      lbl.className = 'ps-label';
      const labelText = f.labelKey ? window.t(f.labelKey, f.label) : f.label;
      lbl.textContent = labelText + (f.required ? ' *' : '');
      row.appendChild(lbl);
    }
    let input;
    if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.className = 'ps-text';
      input.style.height = '70px';
    } else if (f.type === 'select') {
      input = document.createElement('select');
      input.className = 'ps-text';
      for (const o of f.options || []) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.labelKey ? window.t(o.labelKey, o.label) : o.label;
        input.appendChild(opt);
      }
    } else if (f.type === 'checkbox') {
      const w = document.createElement('label');
      w.className = 'check';
      input = document.createElement('input');
      input.type = 'checkbox';
      w.appendChild(input);
      w.appendChild(document.createTextNode(' ' + (f.labelKey ? window.t(f.labelKey, f.label) : f.label)));
      row.appendChild(w);
      input.id = f.id;
      input.addEventListener('change', renderQrPreview);
      wrap.appendChild(row);
      continue;
    } else {
      input = document.createElement('input');
      input.type = f.type || 'text';
      input.className = 'ps-text';
    }
    input.id = f.id;
    const phText = f.placeholderKey ? window.t(f.placeholderKey, f.placeholder || '') : f.placeholder || '';
    if (phText) input.placeholder = phText;
    if (prefill[f.id]) input.value = prefill[f.id];
    input.addEventListener('input', renderQrPreview);
    input.addEventListener('change', renderQrPreview);
    row.appendChild(input);
    wrap.appendChild(row);
  }
  renderQrPreview();
}

// Collect the user's input into a plain object and run the template's
// `build` function to produce the final QR payload string.
function collectQrFieldValues() {
  if (!_qrTpl) return '';
  const tpl = QR_TEMPLATES[_qrTpl];
  if (!tpl) return '';
  const values = {};
  for (const f of tpl.fields) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    values[f.id] = f.type === 'checkbox' ? !!el.checked : el.value || '';
  }
  return tpl.build(values);
}

// --- Render QR onto qrCanvas based on wizard fields + style options ---
async function renderQrPreview() {
  const status = document.getElementById('qrStatus');
  const canvas = document.getElementById('qrCanvas');
  if (!canvas || !status) return;
  const text = collectQrFieldValues();
  const size = parseInt(document.getElementById('qrSize').value) || 320;
  const margin = parseInt(document.getElementById('qrMargin').value) || 2;
  const ecc = document.getElementById('qrEcc').value || 'M';
  const dark = document.getElementById('qrDark').value;
  const light = document.getElementById('qrLight').value;
  const trans = document.getElementById('qrTransparent').checked;
  const moduleShape = (document.querySelector('input[name="qrModuleShape"]:checked') || {}).value || 'square';
  const eyeShape = (document.querySelector('input[name="qrEyeShape"]:checked') || {}).value || 'square';
  if (!text) {
    canvas.width = canvas.height = 1;
    status.className = 'code-status';
    status.textContent = window.t('qr.fillFields', 'Fill in the fields above.');
    return;
  }
  try {
    status.className = 'code-status';
    status.textContent = 'Loading QR library…';
    await loadQrLib();
    // Higher EC level when a logo is overlaid so the QR remains scannable.
    const effEcc = _qrLogo ? (ecc === 'L' || ecc === 'M' ? 'H' : ecc) : ecc;
    const qr = window.qrcode(0, effEcc);
    qr.addData(text);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const total = moduleCount + margin * 2;
    const cell = Math.max(1, Math.floor(size / total));
    const px = cell * total;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    // background
    if (trans) ctx.clearRect(0, 0, px, px);
    else {
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, px, px);
    }

    // Helper: tell whether (r,c) is part of one of the three "finder pattern"
    // (eye) 7×7 boxes in the corners — we render those with a different shape
    // so the QR looks polished without breaking scan recognition.
    const inEye = (r, c) => {
      if (r < 7 && c < 7) return 'tl';
      if (r < 7 && c >= moduleCount - 7) return 'tr';
      if (r >= moduleCount - 7 && c < 7) return 'bl';
      return null;
    };
    // Draw data modules first (skipping eye regions which we'll re-draw)
    ctx.fillStyle = dark;
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (inEye(r, c)) continue;
        if (!qr.isDark(r, c)) continue;
        const x = (c + margin) * cell,
          y = (r + margin) * cell;
        if (moduleShape === 'dot') {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else if (moduleShape === 'rounded') {
          const rr = cell * 0.3;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, cell, cell, rr);
          } else {
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + cell, y, x + cell, y + cell, rr);
            ctx.arcTo(x + cell, y + cell, x, y + cell, rr);
            ctx.arcTo(x, y + cell, x, y, rr);
            ctx.arcTo(x, y, x + cell, y, rr);
          }
          ctx.fill();
        } else {
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
    // Draw the three eyes — keep their 7×7 outer ring + 3×3 center solid
    // so scanners reliably find them. Outline of the ring can be square,
    // rounded, or fully circular.
    const drawEye = (cornerR, cornerC) => {
      const x0 = (cornerC + margin) * cell;
      const y0 = (cornerR + margin) * cell;
      const outer = 7 * cell;
      const inner = 3 * cell;
      ctx.fillStyle = dark;
      // outer ring (filled square with inner cut-out)
      ctx.beginPath();
      if (eyeShape === 'circle') {
        ctx.arc(x0 + outer / 2, y0 + outer / 2, outer / 2, 0, Math.PI * 2);
      } else if (eyeShape === 'rounded') {
        const rr = cell * 1.2;
        if (ctx.roundRect) ctx.roundRect(x0, y0, outer, outer, rr);
        else ctx.rect(x0, y0, outer, outer);
      } else {
        ctx.rect(x0, y0, outer, outer);
      }
      ctx.fill();
      // hollow middle ring
      ctx.fillStyle = trans ? '#ffffff' : light;
      // For transparent we still want to "punch out" the ring — easiest is
      // to draw with the light colour even if "trans" is on, since the
      // surrounding modules are darker. A clean transparent ring is hard
      // without compositing — accept the light-coloured ring.
      const ringInset = cell;
      ctx.beginPath();
      if (eyeShape === 'circle') {
        ctx.arc(x0 + outer / 2, y0 + outer / 2, outer / 2 - ringInset, 0, Math.PI * 2);
      } else if (eyeShape === 'rounded') {
        const rr = cell * 0.8;
        if (ctx.roundRect)
          ctx.roundRect(x0 + ringInset, y0 + ringInset, outer - 2 * ringInset, outer - 2 * ringInset, rr);
        else ctx.rect(x0 + ringInset, y0 + ringInset, outer - 2 * ringInset, outer - 2 * ringInset);
      } else {
        ctx.rect(x0 + ringInset, y0 + ringInset, outer - 2 * ringInset, outer - 2 * ringInset);
      }
      ctx.fill();
      // inner solid 3×3
      ctx.fillStyle = dark;
      ctx.beginPath();
      if (eyeShape === 'circle') {
        ctx.arc(x0 + outer / 2, y0 + outer / 2, inner / 2, 0, Math.PI * 2);
      } else if (eyeShape === 'rounded') {
        const rr = cell * 0.5;
        if (ctx.roundRect) ctx.roundRect(x0 + 2 * cell, y0 + 2 * cell, inner, inner, rr);
        else ctx.rect(x0 + 2 * cell, y0 + 2 * cell, inner, inner);
      } else {
        ctx.rect(x0 + 2 * cell, y0 + 2 * cell, inner, inner);
      }
      ctx.fill();
    };
    drawEye(0, 0);
    drawEye(0, moduleCount - 7);
    drawEye(moduleCount - 7, 0);

    // Optional center logo. Drawn over a small white "punch hole" so the
    // logo edges look clean. We sized the hole to ~22% of QR width which
    // most scanners tolerate at H-level error correction.
    if (_qrLogo) {
      const logoBoxSize = Math.round(px * 0.22);
      const lx = (px - logoBoxSize) / 2,
        ly = (px - logoBoxSize) / 2;
      ctx.fillStyle = trans ? '#ffffff' : light;
      const pad = Math.round(cell * 0.6);
      ctx.fillRect(lx - pad, ly - pad, logoBoxSize + 2 * pad, logoBoxSize + 2 * pad);
      try {
        ctx.drawImage(_qrLogo, lx, ly, logoBoxSize, logoBoxSize);
      } catch (_) {}
    }
    status.className = 'code-status ok';
    status.textContent =
      `${moduleCount}×${moduleCount} modules · ${px}×${px} px · ECC=${effEcc}` +
      (_qrLogo ? ' · with logo' : '');
  } catch (e) {
    status.className = 'code-status err';
    status.textContent = 'Error: ' + (e.message || e);
    console.warn('[qr] render failed:', e);
  }
}

// Switch between Step 1 (template picker) and Step 2 (fields + preview)
function showQrStep(n) {
  document.getElementById('qrStep1').hidden = n !== 1;
  document.getElementById('qrStep2').hidden = n !== 2;
}
function pickQrTemplate(name) {
  if (!QR_TEMPLATES[name]) return;
  _qrTpl = name;
  showQrStep(2);
  renderQrFields();
}

// --- Render Barcode onto barCanvas ---
async function renderBarPreview() {
  const fmt = document.getElementById('barFormat').value;
  const text = document.getElementById('barText').value;
  const width = parseInt(document.getElementById('barWidth').value) || 2;
  const height = parseInt(document.getElementById('barHeight').value) || 80;
  const color = document.getElementById('barColor').value;
  const showText = document.getElementById('barDisplayValue').checked;
  const status = document.getElementById('barStatus');
  const canvas = document.getElementById('barCanvas');
  if (!text) {
    canvas.width = canvas.height = 1;
    status.className = 'code-status';
    status.textContent = window.t('bar.pickFmt', 'Pick format + value to preview.');
    return;
  }
  try {
    status.className = 'code-status';
    status.textContent = 'Loading barcode library…';
    await loadBarLib();
    window.JsBarcode(canvas, text, {
      format: fmt,
      lineColor: color,
      width: width,
      height: height,
      displayValue: showText,
      background: '#ffffff',
      margin: 10,
      textMargin: 4,
      fontSize: 14,
      valid: (isValid) => {
        if (!isValid) {
          status.className = 'code-status err';
          status.textContent =
            'Value not valid for ' +
            fmt +
            ' (check format requirements — e.g. EAN-13 needs exactly 12-13 digits).';
        }
      },
    });
    if (status.classList.contains('err')) return;
    status.className = 'code-status ok';
    status.textContent = `${fmt} · ${canvas.width}×${canvas.height} px`;
  } catch (e) {
    status.className = 'code-status err';
    status.textContent = 'Error: ' + (e.message || e);
    console.warn('[barcode] render failed:', e);
  }
}

// Insert the active preview canvas as an image annotation on the PDF
function insertCodeIntoPdf() {
  const activeTab = document.querySelector('.settings-tab[data-codetab].active');
  if (!activeTab) return;
  const which = activeTab.dataset.codetab;
  const canvas = document.getElementById(which === 'qr' ? 'qrCanvas' : 'barCanvas');
  if (!canvas || canvas.width <= 1) {
    showToast('Generate a preview first.', 'warn');
    return;
  }
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  const dataURL = canvas.toDataURL('image/png');
  // Pick a default insertion overlay (first page if no lastClickPos)
  const overlay =
    lastClickPos && lastClickPos.overlay ? lastClickPos.overlay : document.querySelector('.overlay');
  if (!overlay) {
    showToast('No page overlay to insert into.', 'error');
    return;
  }
  const pageNum = parseInt(overlay.closest('.page-wrapper').dataset.pageNum);
  const pos =
    lastClickPos && lastClickPos.pageNum === pageNum ? lastClickPos : { pageNum, x: 50, y: 50, overlay };
  addImageAnnotation(pos, dataURL, 'image/png');
  closeCodeModal();
  showToast((which === 'qr' ? 'QR code' : 'Barcode') + ' inserted. Drag to position.', 'success');
}

// Download the current preview as a standalone PNG
function downloadCodeAsPng() {
  const activeTab = document.querySelector('.settings-tab[data-codetab].active');
  if (!activeTab) return;
  const which = activeTab.dataset.codetab;
  const canvas = document.getElementById(which === 'qr' ? 'qrCanvas' : 'barCanvas');
  if (!canvas || canvas.width <= 1) {
    showToast('Generate a preview first.', 'warn');
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('Could not save PNG.', 'error');
      return;
    }
    const name = which === 'qr' ? 'qrcode.png' : 'barcode.png';
    downloadBlob(blob, name);
    showToast(`Saved ${name}`, 'success');
  }, 'image/png');
}

function openCodeModal() {
  document.getElementById('codeModal').classList.add('show');
  // Default to QR tab + show template picker (step 1)
  showCodeTab('qr');
  _qrTpl = null;
  _qrLogo = null;
  const ls = document.getElementById('qrLogoStatus');
  if (ls) ls.textContent = 'No logo';
  const lc = document.getElementById('qrLogoClear');
  if (lc) lc.hidden = true;
  showQrStep(1);
}
function closeCodeModal() {
  document.getElementById('codeModal').classList.remove('show');
}
function showCodeTab(which) {
  document
    .querySelectorAll('.settings-tab[data-codetab]')
    .forEach((t) => t.classList.toggle('active', t.dataset.codetab === which));
  document.querySelectorAll('.code-pane').forEach((p) => (p.hidden = p.dataset.codepane !== which));
  if (which === 'qr') setTimeout(renderQrPreview, 0);
  else setTimeout(renderBarPreview, 0);
}

(function wireCodeGenerator() {
  const open = document.getElementById('qrBarcodeBtnMenu');
  if (open)
    open.addEventListener('click', () => {
      closeAllDropdowns && closeAllDropdowns();
      openCodeModal();
    });
  const close = document.getElementById('codeClose');
  if (close) close.addEventListener('click', closeCodeModal);
  const cancel = document.getElementById('codeCancel');
  if (cancel) cancel.addEventListener('click', closeCodeModal);
  const insert = document.getElementById('codeInsert');
  if (insert) insert.addEventListener('click', insertCodeIntoPdf);
  const dl = document.getElementById('codeDownload');
  if (dl) dl.addEventListener('click', downloadCodeAsPng);
  document
    .querySelectorAll('.settings-tab[data-codetab]')
    .forEach((t) => t.addEventListener('click', () => showCodeTab(t.dataset.codetab)));
  // ===== QR wizard =====
  document
    .querySelectorAll('.qr-template-card[data-qr-tpl]')
    .forEach((card) => card.addEventListener('click', () => pickQrTemplate(card.dataset.qrTpl)));
  const back = document.getElementById('qrBackBtn');
  if (back)
    back.addEventListener('click', () => {
      _qrTpl = null;
      showQrStep(1);
    });
  // Style controls re-render on change
  ['qrSize', 'qrMargin', 'qrEcc', 'qrDark', 'qrLight', 'qrTransparent'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderQrPreview);
  });
  document
    .querySelectorAll('input[name="qrModuleShape"], input[name="qrEyeShape"]')
    .forEach((r) => r.addEventListener('change', renderQrPreview));
  // Logo picker — store as Image element for the canvas renderer.
  const logoIn = document.getElementById('qrLogoInput');
  const logoStatus = document.getElementById('qrLogoStatus');
  const logoClear = document.getElementById('qrLogoClear');
  if (logoIn)
    logoIn.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          _qrLogo = img;
          if (logoStatus) logoStatus.textContent = f.name + ' · ' + img.width + '×' + img.height;
          if (logoClear) logoClear.hidden = false;
          renderQrPreview();
        };
        img.onerror = () => {
          if (logoStatus) logoStatus.textContent = 'Could not load image.';
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
  if (logoClear)
    logoClear.addEventListener('click', () => {
      _qrLogo = null;
      if (logoStatus) logoStatus.textContent = 'No logo';
      logoClear.hidden = true;
      renderQrPreview();
    });
  // ===== Barcode (unchanged) =====
  ['barFormat', 'barText', 'barWidth', 'barHeight', 'barColor', 'barDisplayValue'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => renderBarPreview());
  });
  // Click outside modal closes
  const m = document.getElementById('codeModal');
  if (m)
    m.addEventListener('click', (e) => {
      if (e.target.id === 'codeModal') closeCodeModal();
    });
})();

