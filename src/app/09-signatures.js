// === COMMON HELPERS ===
function pickInsertPos() {
  if (lastClickPos && document.body.contains(lastClickPos.overlay)) return lastClickPos;
  const ov = document.querySelector('.overlay');
  if (!ov) return null;
  return { pageNum: 1, x: 48, y: 48, overlay: ov };
}
function formatDateOnly(d, format) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  switch (format) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yyyy}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yyyy}`;
    case 'YYYY-MM-DD':
      return `${yyyy}-${mm}-${dd}`;
    case 'MMM-DD-YYYY':
    default:
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
function formatTimeOnly(d, format) {
  switch (format) {
    case 'hh:mm A':
      // toLocaleTimeString may use a regular space OR a narrow-no-break-space
      // (U+202F) between the digits and the AM/PM token, depending on browser
      // / locale. Force a non-breaking space so it never wraps "11:56" on one
      // line and "PM" on the next inside the stamp.
      return d
        .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        .replace(/[\s  ]+/g, ' ');
    case 'HH:mm':
    default:
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
function trimAlphaCanvas(canvas) {
  const w = canvas.width,
    h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL('image/png');
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1,
    ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out.toDataURL('image/png');
}
function plainLine(text, opts) {
  return [
    {
      text,
      color: (opts && opts.color) || '#000000',
      bold: !!(opts && opts.bold),
      italic: !!(opts && opts.italic),
      underline: !!(opts && opts.underline),
    },
  ];
}
function createTextAnnotationFromLines(pos, lines, fontSize, opts) {
  const el = document.createElement('div');
  el.className = 'annotation text-annotation';
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
  el.style.fontSize = (fontSize || defaultSize) + 'px';
  pos.overlay.appendChild(el);
  const ann = {
    type: 'text',
    pageNum: pos.pageNum,
    x: pos.x,
    y: pos.y,
    lines,
    fontSize: fontSize || defaultSize,
    noBackground: false,
    fontFamily: (opts && opts.fontFamily) || defaultTextFont || 'Helvetica',
    lineHeight: (opts && opts.lineHeight) || defaultLineHeight || 1.15,
    align: (opts && opts.align) || defaultAlign || 'left',
    width: 80,
    height: (fontSize || defaultSize) * 1.5,
    el,
  };
  annotations.push(ann);
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  updateAnnotCount();
  select(ann);
  return ann;
}

// === SIGNATURE FONTS ===
const SIG_FONTS = [
  { id: 'caveat', label: 'Caveat', css: '"Caveat", cursive', weight: 700 },
  { id: 'dancing', label: 'Dancing Script', css: '"Dancing Script", cursive', weight: 700 },
  { id: 'gvibes', label: 'Great Vibes', css: '"Great Vibes", cursive', weight: 400 },
  { id: 'pacifico', label: 'Pacifico', css: '"Pacifico", cursive', weight: 400 },
  { id: 'sacramento', label: 'Sacramento', css: '"Sacramento", cursive', weight: 400 },
  { id: 'allura', label: 'Allura', css: '"Allura", cursive', weight: 400 },
  { id: 'apple', label: 'Homemade Apple', css: '"Homemade Apple", cursive', weight: 400 },
  { id: 'yellowtail', label: 'Yellowtail', css: '"Yellowtail", cursive', weight: 400 },
  { id: 'kalam', label: 'Kalam', css: '"Kalam", cursive', weight: 700 },
];

// === SIGNATURE MODAL (3 tabs: Draw / Type / Upload) ===
let sigState = {
  open: false,
  tab: 'draw',
  color: '#000000',
  drawHasInk: false,
  typeFontId: 'caveat',
  typeText: '',
  uploadDataURL: null,
  callback: null,
  auditLocation: null,
  auditAddress: null,
};
function openSignatureModal(onInsert) {
  const modal = document.getElementById('sigModal');
  sigState = {
    open: true,
    tab: 'draw',
    color: '#000000',
    drawHasInk: false,
    typeFontId: 'caveat',
    typeText: '',
    uploadDataURL: null,
    callback: onInsert,
    auditLocation: null,
    auditAddress: null,
  };
  modal.classList.add('show');
  sigSetupTabs();
  sigSetupDraw();
  sigSetupType();
  sigSetupUpload();
  sigSetupControls();
  sigSetupAudit();
  sigSetupSavedSignatures();
  sigSwitchTab('draw');
  document.getElementById('sigSaveCheckbox').checked = false;
  document.getElementById('sigAuditCheckbox').checked = false;
  document.getElementById('sigAuditPanel').hidden = true;
  document.getElementById('sigAuditLocStatus').textContent = window.t(
    'sig.audit.optional',
    'Optional — adds coordinates + street address to the stamp.'
  );
  _sigLocationInFlight = null;
  requestAnimationFrame(() => requestAnimationFrame(sigSizeDrawPad));
}

// === SIGNATURE AUDIT METADATA (client-side, no backend) ===
const SIG_AUDIT_KEY = 'pdfMiniPro.sigAuditIdentity.v1';
function sigSetupAudit() {
  const cb = document.getElementById('sigAuditCheckbox');
  const panel = document.getElementById('sigAuditPanel');
  cb.onchange = () => {
    panel.hidden = !cb.checked;
  };
  document.getElementById('sigAuditLocBtn').onclick = sigCaptureLocation;
  // Pull defaults from the user's Profile so they don't have to retype name /
  // email / phone in the audit panel. Profile values are only used when the
  // audit field is otherwise blank — explicit audit-remembered values win.
  const profile = typeof getProfile === 'function' ? getProfile() : {};
  let pfFirst = '',
    pfLast = '';
  if (profile.fullName) {
    const parts = String(profile.fullName).trim().split(/\s+/);
    pfFirst = parts.shift() || '';
    pfLast = parts.join(' ');
  }
  const pfRole = profile.company || '';

  // Restore signer fields from localStorage (if previously remembered);
  // otherwise fall back to Profile data so the panel comes pre-filled.
  try {
    const saved = JSON.parse(localStorage.getItem(SIG_AUDIT_KEY) || 'null');
    const setIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;
    };
    // Clear first so previous-session leftovers don't bleed in
    ['sigAuditFirst', 'sigAuditLast', 'sigAuditEmail', 'sigAuditPhone', 'sigAuditRole'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    if (saved) {
      if (saved.first) document.getElementById('sigAuditFirst').value = saved.first;
      if (saved.last) document.getElementById('sigAuditLast').value = saved.last;
      if (saved.email) document.getElementById('sigAuditEmail').value = saved.email;
      if (saved.phone) document.getElementById('sigAuditPhone').value = saved.phone;
      if (saved.role) document.getElementById('sigAuditRole').value = saved.role;
      document.getElementById('sigAuditRemember').checked = true;
    } else {
      document.getElementById('sigAuditRemember').checked = false;
    }
    // Profile fallbacks — only fill fields the user (or remembered audit) didn't set
    setIfEmpty('sigAuditFirst', pfFirst);
    setIfEmpty('sigAuditLast', pfLast);
    setIfEmpty('sigAuditEmail', profile.email);
    setIfEmpty('sigAuditPhone', profile.phone);
    setIfEmpty('sigAuditRole', pfRole);
  } catch (_) {}
}
function sigGetSignerIdentity() {
  const id = {
    first: document.getElementById('sigAuditFirst').value.trim(),
    last: document.getElementById('sigAuditLast').value.trim(),
    email: document.getElementById('sigAuditEmail').value.trim(),
    phone: document.getElementById('sigAuditPhone').value.trim(),
    role: document.getElementById('sigAuditRole').value.trim(),
  };
  // Persist (or clear) per checkbox
  const remember = document.getElementById('sigAuditRemember').checked;
  try {
    if (remember && (id.first || id.last || id.email || id.phone || id.role)) {
      localStorage.setItem(SIG_AUDIT_KEY, JSON.stringify(id));
    } else if (!remember) {
      localStorage.removeItem(SIG_AUDIT_KEY);
    }
  } catch (_) {}
  return id;
}

// Tracks the in-flight GPS+reverse-geocode promise so Create can wait for it
// instead of inserting a half-finished audit stamp.
let _sigLocationInFlight = null;
// Hand-off between sigOnInsert (which composes the stamped image) and the
// signature-insertion callback (which creates the annotation and needs to
// attach the audit data to it for later PDF-metadata embedding).
let _sigPendingAuditData = null;

function sigCaptureLocation() {
  // Already in-flight (user double-clicked) — return the same promise
  if (_sigLocationInFlight) return _sigLocationInFlight;
  _sigLocationInFlight = (async () => {
    const status = document.getElementById('sigAuditLocStatus');
    const btn = document.getElementById('sigAuditLocBtn');
    if (!navigator.geolocation) {
      status.textContent = window.t('sig.audit.noGeoApi', '⚠ Geolocation API not available in this browser.');
      return;
    }
    btn.disabled = true;
    status.textContent = window.t('sig.audit.requesting', 'Requesting GPS permission…');
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0,
        });
      });
      sigState.auditLocation = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      status.textContent = window
        .t('sig.audit.resolving', 'Captured {lat}, {lon} (±{acc}m) — resolving address…')
        .replace('{lat}', pos.coords.latitude.toFixed(5))
        .replace('{lon}', pos.coords.longitude.toFixed(5))
        .replace('{acc}', Math.round(pos.coords.accuracy));
      try {
        // Always ask Nominatim for English so the stamp is universally readable.
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=14&accept-language=en`,
          {
            headers: { 'Accept-Language': 'en' },
          }
        );
        if (r.ok) {
          const j = await r.json();
          sigState.auditAddress = j.display_name || null;
          status.textContent =
            '✓ ' +
            (j.display_name || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        } else {
          status.textContent =
            `✓ ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} ` +
            window.t('sig.audit.addrFail', '(address lookup failed)');
        }
      } catch (_) {
        status.textContent =
          `✓ ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} ` +
          window.t('sig.audit.offline', '(offline — no address)');
      }
    } catch (e) {
      status.textContent =
        '⚠ ' + (e.message || window.t('sig.audit.denied', 'Permission denied / unavailable'));
    } finally {
      btn.disabled = false;
      _sigLocationInFlight = null;
    }
  })();
  return _sigLocationInFlight;
}

// Great-circle distance between two lat/lon points, in kilometres.
// Used to spot VPN usage during signing — if the GPS position is far from
// the IP-derived position, the signer is almost certainly behind a VPN and
// the audit stamp would be inconsistent. We block signing in that case.
function _haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Gather everything we can without a backend. Best-effort: any field may be null.
async function sigGatherAuditData() {
  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  // Local-time string in the browser's TZ (what the user sees on their clock) +
  // tz-aware UTC offset so the stamp is unambiguous when read later.
  let localTime;
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: tz,
      timeZoneName: 'short',
    });
    localTime = fmt.format(now).replace(',', '');
  } catch (_) {
    localTime = now.toString();
  }
  const out = {
    signedAt: now.toISOString(), // UTC ISO
    localTime, // human-readable wall-clock in browser TZ
    timezone: tz, // IANA name (e.g. America/New_York)
    documentSha256: null,
    serverTime: null,
    ip: null,
    ipLocation: null, // { city, region, country, loc, org, postal, tz }
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
    language: navigator.language || '',
    screen: `${screen.width}×${screen.height}@${window.devicePixelRatio || 1}x`,
    canvasFp: null,
    location: sigState.auditLocation || null,
    address: sigState.auditAddress || null,
    identity: sigGetSignerIdentity(),
  };
  // Document SHA-256 (over the bytes the user would save right now)
  try {
    const bytes = annotations.length ? await generatePdfBytes() : pdfBytes;
    if (bytes && crypto?.subtle?.digest) {
      const buf = await crypto.subtle.digest('SHA-256', bytes);
      out.documentSha256 = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (_) {}
  // External time + IP + IP-geolocation (best-effort; may fail offline / blocked).
  // ipapi.co returns IP, city, region, country, lat/lon, ISP — all in one call.
  // Falls back to ipinfo.io then ipify.org if the first one is blocked.
  await Promise.allSettled([
    (async () => {
      try {
        const r = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (!j.error) {
            out.ip = j.ip || null;
            out.ipLocation = {
              city: j.city || null,
              region: j.region || j.region_code || null,
              country: j.country_name || j.country || null,
              countryCode: j.country_code || null,
              postal: j.postal || null,
              latitude: typeof j.latitude === 'number' ? j.latitude : null,
              longitude: typeof j.longitude === 'number' ? j.longitude : null,
              org: j.org || null,
              asn: j.asn || null,
              timezone: j.timezone || null,
            };
            return;
          }
        }
      } catch (_) {}
      // Fallback 1: ipinfo.io (similar data shape but "loc": "lat,lon" string)
      try {
        const r = await fetch('https://ipinfo.io/json', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          out.ip = j.ip || null;
          const [lat, lon] = (j.loc || '').split(',').map(parseFloat);
          out.ipLocation = {
            city: j.city || null,
            region: j.region || null,
            country: j.country || null,
            countryCode: j.country || null,
            postal: j.postal || null,
            latitude: isFinite(lat) ? lat : null,
            longitude: isFinite(lon) ? lon : null,
            org: j.org || null,
            asn: null,
            timezone: j.timezone || null,
          };
          return;
        }
      } catch (_) {}
      // Fallback 2: just the IP, no location
      try {
        const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
        if (r.ok) out.ip = (await r.json()).ip;
      } catch (_) {}
    })(),
    (async () => {
      // External time source: the Cloudflare CDN returns a server-signed
      // Date header on every response — no API needed and reliably online
      // (worldtimeapi.org was retired in 2024). HEAD avoids downloading any
      // body. Falls back silently if blocked / offline.
      try {
        const r = await fetch('https://cdnjs.cloudflare.com/cdn-cgi/trace', {
          method: 'HEAD',
          cache: 'no-store',
        });
        const d = r.headers.get('date');
        if (d) {
          const t = new Date(d);
          if (!isNaN(t.getTime())) out.serverTime = t.toISOString();
        }
      } catch (_) {}
    })(),
  ]);
  // Canvas fingerprint hash (short)
  try {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 50;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('audit-fp', 10, 10);
    const blob = await new Promise((r) => c.toBlob(r));
    if (blob && crypto?.subtle?.digest) {
      const buf = await blob.arrayBuffer();
      const h = await crypto.subtle.digest('SHA-256', buf);
      out.canvasFp = Array.from(new Uint8Array(h))
        .slice(0, 8)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch (_) {}
  return out;
}

// Compose a signature image with an audit stamp baked into the canvas — the user
// can no longer separate them. Returns a dataURL ready for addImageAnnotation.
async function sigComposeWithAudit(signatureDataURL, audit) {
  const sigImg = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = signatureDataURL;
  });
  // Layout: signature on top, audit block below in a thin gray frame.
  const W = Math.max(360, sigImg.naturalWidth);
  const sigH = Math.round(sigImg.naturalHeight * (W / sigImg.naturalWidth));
  const stampLineH = 14;
  const stampPad = 8;
  const lines = sigBuildStampLines(audit);
  const stampH = stampPad * 2 + lines.length * stampLineH;
  const H = sigH + stampH + 4;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0)';
  ctx.fillRect(0, 0, W, H);
  // Signature
  ctx.drawImage(sigImg, 0, 0, W, sigH);
  // Stamp frame
  const sy = sigH + 4;
  ctx.fillStyle = 'rgba(245,247,250,0.95)';
  ctx.fillRect(0, sy, W, stampH);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, sy + 0.5, W - 1, stampH - 1);
  // Stamp text
  ctx.fillStyle = '#1f2937';
  ctx.textBaseline = 'top';
  ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  let ty = sy + stampPad;
  for (const ln of lines) {
    ctx.fillText(ln, stampPad, ty);
    ty += stampLineH;
  }
  return canvas.toDataURL('image/png');
}

function sigBuildStampLines(a) {
  const shortHash = a.documentSha256
    ? a.documentSha256.slice(0, 16) + '…' + a.documentSha256.slice(-8)
    : 'n/a';
  const lines = [];
  const id = a.identity || {};
  // Signer block first — the human-readable "who" is most important for legal weight.
  const name = [id.first, id.last].filter(Boolean).join(' ');
  if (name || id.role) {
    let head = '✍ SIGNED BY ';
    head += name || '(unnamed)';
    if (id.role) head += `  ·  ${id.role}`;
    lines.push(head);
  }
  if (id.email || id.phone) {
    const parts = [];
    if (id.email) parts.push(id.email);
    if (id.phone) parts.push(id.phone);
    lines.push(parts.join('  ·  '));
  }
  // Time: show the wall-clock the signer saw (their TZ) AND the UTC anchor.
  lines.push(`🔒 ${a.localTime || a.signedAt}`);
  lines.push(`   UTC ${a.signedAt}` + (a.serverTime ? `  ·  server ${a.serverTime}` : ''));
  // Document integrity
  lines.push(`SHA-256  ${shortHash}`);
  // Signing context: IP + ISP (one line)
  const il = a.ipLocation || {};
  const ipBit = a.ip ? `IP ${a.ip}` : 'IP n/a';
  const ispBit = il.org ? `  ·  ${String(il.org).slice(0, 40)}` : '';
  lines.push(`${ipBit}${ispBit}`);
  // Device line
  const devBit = sigShortDevice(a.userAgent, a.platform);
  lines.push(`${devBit}  ·  ${a.language}  ·  ${a.screen}`);
  // Location lines — IP-based always (if we got it); GPS overrides / supplements
  if (a.location) {
    // GPS precise — primary line
    lines.push(
      `GPS ${a.location.latitude.toFixed(5)}, ${a.location.longitude.toFixed(5)}  (±${Math.round(a.location.accuracy)}m)`
    );
    if (a.address) {
      const addr = a.address.length > 80 ? a.address.slice(0, 77) + '…' : a.address;
      lines.push(addr);
    }
    // Still print IP-based location as a corroborating data point
    const ipLoc = _sigFormatIpLocation(il);
    if (ipLoc) lines.push(`IP location: ${ipLoc}`);
  } else if (il.city || il.region || il.country || (il.latitude && il.longitude)) {
    // No GPS — IP location is the only "where". Print coarsely + coordinates.
    const ipLoc = _sigFormatIpLocation(il);
    if (ipLoc) lines.push(`Location (IP): ${ipLoc}`);
    if (typeof il.latitude === 'number' && typeof il.longitude === 'number') {
      lines.push(`IP geo: ${il.latitude.toFixed(4)}, ${il.longitude.toFixed(4)} (city-level)`);
    }
  }
  if (a.canvasFp) lines.push(`Device fingerprint  ${a.canvasFp}`);
  return lines;
}

function _sigFormatIpLocation(il) {
  if (!il) return null;
  const parts = [];
  if (il.city) parts.push(il.city);
  if (il.region && il.region !== il.city) parts.push(il.region);
  if (il.postal) parts.push(il.postal);
  if (il.country) parts.push(il.country);
  return parts.length ? parts.join(', ') : null;
}

function sigShortDevice(ua, platform) {
  if (!ua) return platform || '?';
  let os = platform || '';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10/11';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  let browser = 'Browser';
  const m = ua.match(/(Edg|Chrome|Firefox|Safari)\/(\d+)/);
  if (m) browser = m[1].replace('Edg', 'Edge') + ' ' + m[2];
  return `${os} · ${browser}`;
}
function sigSetupSavedSignatures() {
  const section = document.getElementById('sigSavedSection');
  const row = document.getElementById('sigSavedThumbs');
  const list = getSavedSignatures();
  if (!list.length) {
    section.hidden = true;
    row.innerHTML = '';
    return;
  }
  section.hidden = false;
  row.innerHTML = '';
  list.forEach((s) => {
    const thumb = document.createElement('div');
    thumb.className = 'sig-saved-thumb';
    const img = document.createElement('img');
    img.src = s.dataURL;
    thumb.appendChild(img);
    thumb.title = 'Click to insert this saved signature';
    thumb.onclick = () => {
      const cb = sigState.callback;
      closeSignatureModal();
      if (cb) cb(s.dataURL);
    };
    row.appendChild(thumb);
  });
}
function closeSignatureModal() {
  sigState.open = false;
  document.getElementById('sigModal').classList.remove('show');
}
function sigSwitchTab(name) {
  sigState.tab = name;
  document.querySelectorAll('#sigModal .tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.sigTab === name);
    t.setAttribute('aria-selected', t.dataset.sigTab === name ? 'true' : 'false');
  });
  document.querySelectorAll('#sigModal .sig-tab-body').forEach((b) => {
    b.hidden = b.dataset.sigBody !== name;
  });
  // Show font selector only on Type tab
  document.getElementById('sigTypeStyle').style.display = name === 'type' ? '' : 'none';
  sigUpdateInsertEnabled();
  if (name === 'draw') sigSizeDrawPad();
}
function sigUpdateInsertEnabled() {
  const insert = document.getElementById('sigInsert');
  if (sigState.tab === 'draw') insert.disabled = !sigState.drawHasInk;
  else if (sigState.tab === 'type') insert.disabled = !sigState.typeText.trim();
  else insert.disabled = !sigState.uploadDataURL;
}
function sigSetupTabs() {
  document.querySelectorAll('#sigModal .tab').forEach((t) => {
    t.onclick = () => sigSwitchTab(t.dataset.sigTab);
  });
}
function sigSetupControls() {
  document.getElementById('sigClose').onclick = closeSignatureModal;
  document.getElementById('sigCancel').onclick = closeSignatureModal;
  document.getElementById('sigInsert').onclick = sigOnInsert;
  document.getElementById('sigModal').onclick = (e) => {
    if (e.target === document.getElementById('sigModal')) closeSignatureModal();
  };
  // Quick swatches
  document.querySelectorAll('#sigModal .sig-swatch').forEach((b) => {
    b.onclick = () => sigSetColor(b.dataset.sigColor);
  });
  const colorInput = document.getElementById('sigColor');
  colorInput.oninput = () => sigSetColor(colorInput.value);
  // Style selector mirrors font picker
  const styleSelect = document.getElementById('sigTypeStyle');
  styleSelect.innerHTML =
    '<option value="">Text Styles</option>' +
    SIG_FONTS.map((f) => `<option value="${f.id}">${f.label}</option>`).join('');
  styleSelect.onchange = () => {
    if (!styleSelect.value) return;
    sigState.typeFontId = styleSelect.value;
    sigUpdateTypePreview();
    document.querySelectorAll('#sigFontGrid .sig-font-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.fontId === sigState.typeFontId);
    });
  };
}
function sigSetColor(c) {
  sigState.color = c;
  document.querySelectorAll('#sigModal .sig-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.sigColor === c);
  });
  document.getElementById('sigColor').value = c;
  if (sigState.tab === 'type') sigUpdateTypePreview();
}

// --- DRAW tab ---
let sigDraw = null;
function sigSetupDraw() {
  const canvas = document.getElementById('sigPad');
  const ctx = canvas.getContext('2d');
  // remove old listeners by replacing canvas via clone, simpler: track and unregister
  if (sigDraw) {
    sigDraw.cleanup();
  }
  let drawing = false,
    lastX = 0,
    lastY = 0,
    pointerId = null;
  function getXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function setInk(state) {
    sigState.drawHasInk = state;
    canvas.classList.toggle('has-ink', state);
    sigUpdateInsertEnabled();
  }
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (sigState.tab !== 'draw') return;
    e.preventDefault();
    drawing = true;
    pointerId = e.pointerId;
    const p = getXY(e);
    lastX = p.x;
    lastY = p.y;
    try {
      canvas.setPointerCapture(pointerId);
    } catch (er) {}
    ctx.fillStyle = sigState.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    setInk(true);
  }
  function onMove(e) {
    if (!drawing) return;
    const p = getXY(e);
    ctx.strokeStyle = sigState.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
  }
  function onUp(e) {
    if (!drawing) return;
    drawing = false;
    try {
      canvas.releasePointerCapture(pointerId);
    } catch (er) {}
  }
  const clear = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setInk(false);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  document.getElementById('sigClear').onclick = clear;

  sigDraw = {
    canvas,
    ctx,
    clear,
    cleanup() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    },
  };
  setInk(false);
}
function sigSizeDrawPad() {
  const canvas = document.getElementById('sigPad');
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- TYPE tab ---
function sigSetupType() {
  const grid = document.getElementById('sigFontGrid');
  const input = document.getElementById('sigTypeInput');
  grid.innerHTML = '';
  SIG_FONTS.forEach((f) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'sig-font-card' + (f.id === sigState.typeFontId ? ' selected' : '');
    card.dataset.fontId = f.id;
    card.style.fontFamily = f.css;
    card.style.fontWeight = f.weight;
    card.textContent = input.value.trim() || 'Your Signature';
    card.onclick = () => {
      sigState.typeFontId = f.id;
      document.querySelectorAll('#sigFontGrid .sig-font-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      document.getElementById('sigTypeStyle').value = f.id;
      sigUpdateTypePreview();
    };
    grid.appendChild(card);
  });
  input.value = '';
  input.oninput = () => {
    sigState.typeText = input.value;
    sigUpdateTypePreview();
    grid.querySelectorAll('.sig-font-card').forEach((c) => {
      c.textContent = input.value.trim() || 'Your Signature';
    });
    sigUpdateInsertEnabled();
  };
}
function sigUpdateTypePreview() {
  const preview = document.getElementById('sigTypePreview');
  const f = SIG_FONTS.find((x) => x.id === sigState.typeFontId) || SIG_FONTS[0];
  preview.style.fontFamily = f.css;
  preview.style.fontWeight = f.weight;
  preview.style.color = sigState.color;
  preview.textContent = sigState.typeText.trim() || 'Your Signature';
}

// --- UPLOAD tab ---
function sigSetupUpload() {
  const drop = document.getElementById('sigUploadDrop');
  const input = document.getElementById('sigUploadInput');
  const previewBox = document.getElementById('sigUploadPreview');
  const previewImg = document.getElementById('sigUploadImg');
  const removeBtn = document.getElementById('sigUploadRemove');
  drop.onclick = () => input.click();
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  };
  drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };
  removeBtn.onclick = () => {
    sigState.uploadDataURL = null;
    drop.style.display = '';
    previewBox.hidden = true;
    sigUpdateInsertEnabled();
  };
  async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      sigState.uploadDataURL = reader.result;
      previewImg.src = reader.result;
      drop.style.display = 'none';
      previewBox.hidden = false;
      sigUpdateInsertEnabled();
    };
    reader.readAsDataURL(file);
  }
}

async function sigOnInsert() {
  const btn = document.getElementById('sigInsert');
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = window.t('sig.btn.working', 'Working…');
  try {
    let dataURL = null;
    if (sigState.tab === 'draw') {
      if (!sigState.drawHasInk) return;
      dataURL = trimAlphaCanvas(sigDraw.canvas);
    } else if (sigState.tab === 'type') {
      if (!sigState.typeText.trim()) return;
      dataURL = await renderTypedSignatureToDataURL(sigState.typeText, sigState.typeFontId, sigState.color);
    } else if (sigState.tab === 'upload') {
      if (!sigState.uploadDataURL) return;
      dataURL = sigState.uploadDataURL;
    }
    if (dataURL && document.getElementById('sigSaveCheckbox').checked) {
      addSavedSignature(dataURL); // save the bare signature, not the audit-stamped one
    }
    // Bake audit stamp into the signature image if requested
    if (dataURL && document.getElementById('sigAuditCheckbox').checked) {
      // If user clicked "Capture GPS" but it's still resolving, wait for it
      // (allowed permission but the high-accuracy fix is still arriving).
      if (_sigLocationInFlight) {
        btn.textContent = window.t('sig.btn.waitGps', 'Waiting for GPS…');
        try {
          await _sigLocationInFlight;
        } catch (_) {}
      }
      btn.textContent = window.t('sig.btn.collecting', 'Collecting audit data…');
      try {
        const audit = await sigGatherAuditData();
        // VPN-guard: if GPS and IP-derived locations disagree by more than
        // ~500 km, the signer is almost certainly behind a VPN. Signing
        // with an inconsistent audit stamp would be misleading — we block
        // and ask them to disable the VPN. 500 km is wide enough to allow
        // mobile-carrier IPs that geolocate to a regional aggregation
        // point but rejects "I'm in Prague but my IP says San Francisco".
        if (
          audit.location &&
          audit.ipLocation &&
          Number.isFinite(audit.location.latitude) &&
          Number.isFinite(audit.location.longitude) &&
          Number.isFinite(audit.ipLocation.latitude) &&
          Number.isFinite(audit.ipLocation.longitude)
        ) {
          const distKm = _haversineKm(
            audit.location.latitude,
            audit.location.longitude,
            audit.ipLocation.latitude,
            audit.ipLocation.longitude
          );
          if (distKm > 500) {
            const ipCity = audit.ipLocation.city || audit.ipLocation.country || 'IP address';
            showToast(
              '⚠ VPN detected — signing blocked. Your GPS location is ~' +
                Math.round(distKm) +
                ' km away from your IP location (' +
                ipCity +
                '). ' +
                'A VPN is almost certainly in use. Disable the VPN and try the signature again ' +
                'so the audit stamp shows consistent location data.',
              'error',
              10000 // longer toast — this is important
            );
            // Re-enable the button so the user can retry after disabling VPN.
            // We DON'T close the modal — they can immediately retry.
            return;
          }
        }
        dataURL = await sigComposeWithAudit(dataURL, audit);
        // Stash the same data so the annotation can carry it through to the
        // PDF Info dict at save time (machine-readable, survives image crop).
        _sigPendingAuditData = audit;
      } catch (e) {
        console.error('[sig audit]', e);
        showToast(
          window.t('sig.audit.fail', 'Audit metadata failed:') +
            ' ' +
            (e.message || e) +
            '. ' +
            window.t('sig.audit.failTail', 'Inserting plain signature.'),
          'warn'
        );
      }
    }
    const cb = sigState.callback;
    closeSignatureModal();
    if (cb && dataURL) cb(dataURL);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

async function renderTypedSignatureToDataURL(text, fontId, color) {
  const f = SIG_FONTS.find((x) => x.id === fontId) || SIG_FONTS[0];
  const fontSize = 96;
  const scale = 2;
  const fontCss = `${f.weight} ${fontSize * scale}px ${f.css}`;
  // Wait for the font to actually load
  try {
    await document.fonts.load(fontCss, text);
  } catch (e) {}
  try {
    await document.fonts.ready;
  } catch (e) {}
  const measure = document.createElement('canvas');
  const mctx = measure.getContext('2d');
  mctx.font = fontCss;
  const metrics = mctx.measureText(text);
  const w = Math.ceil(metrics.width) + 40 * scale;
  const h = Math.ceil(fontSize * scale * 1.4) + 20 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.font = fontCss;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, 20 * scale, h / 2 + fontSize * scale * 0.1);
  return trimAlphaCanvas(canvas);
}

function insertSignatureFromDataURL(dataURL) {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  if (currentTool !== 'select') setTool('select');
  if (typeof bumpUsage === 'function') bumpUsage('open:sign');
  const pos = pickInsertPos();
  if (!pos) return;
  const newAnn = addImageAnnotation(pos, dataURL, 'image/png');
  newAnn.isSignature = true;
  // Attach the audit data captured in sigOnInsert (if any) so generatePdfBytes
  // can embed it into the PDF Info dict + keywords on save.
  if (_sigPendingAuditData) {
    newAnn.auditData = _sigPendingAuditData;
    _sigPendingAuditData = null;
  }
  const img = newAnn.imgEl;
  img.addEventListener(
    'load',
    () => {
      const maxW = 220;
      const natRatio = img.naturalWidth / img.naturalHeight;
      let w = Math.min(maxW, img.naturalWidth);
      let h = w / natRatio;
      newAnn.width = w;
      newAnn.height = h;
      newAnn.aspectRatio = w / h;
      applyImgTransform(newAnn);
    },
    { once: true }
  );
  showToast(
    window.t('toast.sigInserted', 'Signature inserted — drag to position it. Double-click to re-sign.'),
    'success'
  );
}
