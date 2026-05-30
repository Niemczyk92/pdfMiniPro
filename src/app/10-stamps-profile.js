// === QUICK ACCESS — most-used tools (Pro) ===
const QUICK_USAGE_KEY = 'pdfMiniPro.toolUsage.v1';
function getQuickUsage() {
  try {
    return JSON.parse(localStorage.getItem(QUICK_USAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveQuickUsage(map) {
  try {
    localStorage.setItem(QUICK_USAGE_KEY, JSON.stringify(map));
  } catch (e) {}
}
function bumpUsage(actionId) {
  if (!actionId) return;
  const m = getQuickUsage();
  m[actionId] = (m[actionId] || 0) + 1;
  saveQuickUsage(m);
  renderQuickPanel();
}
// Registry of invokable quick actions. Each entry: { icon, label, do() }
const QUICK_ACTIONS = {
  'tool:select': { icon: '↖', label: 'Select', do: () => setTool('select') },
  'tool:text': { icon: 'T', label: 'Text', do: () => setTool('text') },
  'tool:draw': { icon: '✏', label: 'Draw', do: () => setTool('draw') },
  'tool:image': { icon: '🖼', label: 'Image', do: () => document.getElementById('imgInput').click() },
  'shape:rect': {
    icon: '▭',
    label: 'Rect',
    do: () => {
      currentShape = 'rect';
      setTool('shape');
    },
  },
  'shape:ellipse': {
    icon: '◯',
    label: 'Ellipse',
    do: () => {
      currentShape = 'ellipse';
      setTool('shape');
    },
  },
  'shape:triangle': {
    icon: '△',
    label: 'Tri',
    do: () => {
      currentShape = 'triangle';
      setTool('shape');
    },
  },
  'shape:line': {
    icon: '／',
    label: 'Line',
    do: () => {
      currentShape = 'line';
      setTool('shape');
    },
  },
  'shape:arrow': {
    icon: '↗',
    label: 'Arrow',
    do: () => {
      currentShape = 'arrow';
      setTool('shape');
    },
  },
  'shape:double-arrow': {
    icon: '⇆',
    label: '2-Arrow',
    do: () => {
      currentShape = 'double-arrow';
      setTool('shape');
    },
  },
  'shape:heart': {
    icon: '♥',
    label: 'Heart',
    do: () => {
      currentShape = 'heart';
      setTool('shape');
    },
  },
  'shape:star': {
    icon: '★',
    label: 'Star',
    do: () => {
      currentShape = 'star';
      setTool('shape');
    },
  },
  'shape:lightning': {
    icon: '⚡',
    label: 'Bolt',
    do: () => {
      currentShape = 'lightning';
      setTool('shape');
    },
  },
  'shape:cloud': {
    icon: '☁',
    label: 'Cloud',
    do: () => {
      currentShape = 'cloud';
      setTool('shape');
    },
  },
  'shape:check': {
    icon: '✓',
    label: 'Check',
    do: () => {
      currentShape = 'check';
      setTool('shape');
    },
  },
  'shape:cross': {
    icon: '✕',
    label: 'Cross',
    do: () => {
      currentShape = 'cross';
      setTool('shape');
    },
  },
  'shape:checklist': {
    icon: '☐',
    label: 'List',
    do: () => {
      currentShape = 'checklist';
      setTool('shape');
    },
  },
  'shape:calendar-month': {
    icon: '📅',
    label: 'Month',
    do: () => {
      currentShape = 'calendar-month';
      setTool('shape');
    },
  },
  'shape:calendar-week': {
    icon: '📆',
    label: 'Week',
    do: () => {
      currentShape = 'calendar-week';
      setTool('shape');
    },
  },
  'open:stamps': { icon: '⊟', label: 'Stamps', do: () => openStampsModal() },
  'open:sign': {
    icon: '✍',
    label: 'Sign',
    do: () => {
      if (pdfJsDoc) openSignatureModal(insertSignatureFromDataURL);
    },
  },
  'open:pages': {
    icon: '⊞',
    label: 'Pages',
    do: () => {
      if (pdfJsDoc) openOrganizeModal();
    },
  },
  'info:date': { icon: '📅', label: 'Date', do: () => insertInfo('date') },
  'info:datetime': { icon: '🕒', label: 'Now', do: () => insertInfo('datetime') },
  'info:address': { icon: '🏠', label: 'Addr', do: () => insertInfo('address') },
  'info:card': { icon: '💼', label: 'Card', do: () => insertInfo('card') },
};
// Stamp templates — built dynamically since names are dynamic
function quickActionForStamp(stampId, label, tpl) {
  // Returns a transient action object for an already-known stamp template
  return { icon: '⊟', label: label, do: () => insertStampFromTemplate(tpl) };
}
// Resolve a usage id to an action descriptor — including specific stamps/custom stamps.
function resolveQuickAction(id) {
  if (QUICK_ACTIONS[id]) return QUICK_ACTIONS[id];
  // stamp:<id> → standard stamp insert
  if (id.startsWith('stamp:')) {
    const sid = id.slice(6);
    const s = STANDARD_STAMPS.find((x) => x.id === sid);
    if (s) {
      const txt = (s.text || sid).slice(0, 4).toUpperCase();
      return {
        icon: txt,
        label: s.text || sid,
        do: () => insertStampFromTemplate(makeStampTemplate(s)),
      };
    }
  }
  // custom-stamp:<id> → look up by id within saved customs
  if (id.startsWith('custom-stamp:')) {
    const sid = id.slice('custom-stamp:'.length);
    const list = typeof loadCustomStamps === 'function' ? loadCustomStamps() : [];
    const s = list.find((x) => x.id === sid);
    if (s) {
      const txt = (s.text || sid).slice(0, 4).toUpperCase();
      return {
        icon: txt,
        label: s.text || sid,
        do: () => insertStampFromTemplate(Object.assign({}, s, { _custom: true })),
      };
    }
  }
  return null;
}

// Remember the most-recently-used free-draw configuration so the quick panel can
// offer it as a one-click "resume" (e.g. "yellow highlighter · 8px").
const LAST_DRAW_KEY = 'pdfMiniPro.lastDrawTool';
function rememberLastDrawTool() {
  try {
    localStorage.setItem(
      LAST_DRAW_KEY,
      JSON.stringify({ brush: defaultBrush, color: defaultColor, width: defaultStroke })
    );
  } catch (_) {}
  if (typeof renderQuickPanel === 'function') renderQuickPanel();
}
function getLastDrawTool() {
  try {
    return JSON.parse(localStorage.getItem(LAST_DRAW_KEY) || 'null');
  } catch (_) {
    return null;
  }
}
function applyLastDrawTool(cfg) {
  if (!cfg) return;
  defaultBrush = cfg.brush || 'pen';
  defaultColor = cfg.color || '#000000';
  defaultStroke = cfg.width || 2;
  const bs = document.getElementById('defaultBrush');
  if (bs) bs.value = defaultBrush;
  const ds = document.getElementById('defaultStroke');
  if (ds) ds.value = String(defaultStroke);
  const dc = document.getElementById('defaultColor');
  if (dc) dc.value = defaultColor;
  setTool('draw');
}

function renderQuickPanel() {
  const panel = document.getElementById('quickPanel');
  const itemsEl = document.getElementById('quickPanelItems');
  const usage = getQuickUsage();
  const entries = Object.entries(usage)
    .filter(([id]) => {
      // Skip the generic "opened stamps modal" counter — we surface SPECIFIC stamps now.
      if (id === 'open:stamps') return false;
      return !!resolveQuickAction(id);
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const lastTool = getLastDrawTool();
  if (!entries.length && !lastTool) {
    panel.hidden = true;
    itemsEl.innerHTML = '';
    return;
  }
  panel.hidden = false;
  itemsEl.innerHTML = '';
  // Pinned: resume the last free-draw tool (brush + colour + width).
  if (lastTool) {
    const icons = { pen: '✒', pencil: '✏', highlighter: '🖊', marker: '🖌' };
    const brush = lastTool.brush || 'pen';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qp-item';
    btn.title =
      window.t('quick.lastDraw', 'Resume drawing') +
      ': ' +
      window.t('brush.' + brush, brush) +
      ' · ' +
      (lastTool.color || '#000') +
      ' · ' +
      (lastTool.width || 2) +
      'px';
    btn.innerHTML = `<span style="position:relative;display:inline-block">${icons[brush] || '✒'}<span style="position:absolute;bottom:-3px;left:50%;transform:translateX(-50%);width:16px;height:3px;border-radius:2px;background:${lastTool.color || '#000'}"></span></span>`;
    btn.onclick = () => applyLastDrawTool(getLastDrawTool());
    itemsEl.appendChild(btn);
  }
  for (const [id, count] of entries) {
    const a = resolveQuickAction(id);
    if (!a) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qp-item';
    btn.title = `${a.label} · used ${count}×`;
    // For text-based icons (stamps), shrink the font so it fits the 40px box
    const isText = /^[A-Z0-9 ]+$/.test(a.icon || '');
    btn.innerHTML = `<span style="${isText ? 'font-size:9px;font-weight:700;line-height:1.05' : ''}">${a.icon}</span><span class="qp-count">${count > 99 ? '99+' : count}</span>`;
    btn.onclick = () => {
      try {
        a.do();
      } catch (e) {
        console.warn(e);
      }
      bumpUsage(id);
    };
    itemsEl.appendChild(btn);
  }
}

// ----- Draggable quick panel: drag the label area to reposition; remember position -----
const QUICK_PANEL_POS_KEY = 'pdfMiniPro.quickPanel.v1';
function applySavedQuickPanelPosition() {
  try {
    const raw = localStorage.getItem(QUICK_PANEL_POS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    const panel = document.getElementById('quickPanel');
    if (!panel) return;
    if (typeof p.left === 'number') {
      panel.style.left = Math.max(2, Math.min(window.innerWidth - 60, p.left)) + 'px';
      panel.style.right = 'auto';
    }
    if (typeof p.top === 'number') {
      panel.style.top = Math.max(70, Math.min(window.innerHeight - 60, p.top)) + 'px';
      panel.style.bottom = 'auto';
    }
  } catch (_) {}
}
function enableQuickPanelDrag() {
  const panel = document.getElementById('quickPanel');
  if (!panel) return;
  const handle = panel.querySelector('.qp-label') || panel;
  handle.style.cursor = 'grab';
  let down = false,
    sx = 0,
    sy = 0,
    startL = 0,
    startT = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.qp-item')) return;
    down = true;
    handle.setPointerCapture(e.pointerId);
    handle.style.cursor = 'grabbing';
    sx = e.clientX;
    sy = e.clientY;
    const r = panel.getBoundingClientRect();
    startL = r.left;
    startT = r.top;
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx,
      dy = e.clientY - sy;
    const nl = Math.max(2, Math.min(window.innerWidth - 60, startL + dx));
    const nt = Math.max(70, Math.min(window.innerHeight - 60, startT + dy));
    panel.style.left = nl + 'px';
    panel.style.right = 'auto';
    panel.style.top = nt + 'px';
    panel.style.bottom = 'auto';
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    handle.style.cursor = 'grab';
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    const r = panel.getBoundingClientRect();
    try {
      localStorage.setItem(QUICK_PANEL_POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
    } catch (_) {}
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

// Render once on load (deferred so DOM is ready)
setTimeout(() => {
  renderQuickPanel();
  applySavedQuickPanelPosition();
  enableQuickPanelDrag();
}, 0);

// === USER PROFILE (localStorage) ===
const PROFILE_KEY = 'pdfMini.profile.v1';
const SIGNATURES_KEY = 'pdfMini.signatures.v1';
function getProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
function saveProfile(p) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch (e) {
    console.warn('Failed to save profile:', e);
  }
}
function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch (e) {}
}
function getSavedSignatures() {
  try {
    const raw = localStorage.getItem(SIGNATURES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function saveSignatures(list) {
  try {
    localStorage.setItem(SIGNATURES_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save signatures:', e);
  }
}
function addSavedSignature(dataURL) {
  const list = getSavedSignatures();
  // Limit to 12 most recent
  list.unshift({ dataURL, when: Date.now() });
  if (list.length > 12) list.length = 12;
  saveSignatures(list);
}

// === PROFILE MODAL ===
// Live-format a phone-number string into the locale-appropriate style:
//   EN → "+1 (XXX) XXX-XXXX",  CZ → "+420 XXX XXX XXX",
//   PL → "+48 XXX XXX XXX",    ES → "+34 XXX XXX XXX".
// IMPORTANT: this function is idempotent — feeding our own output back in
// must produce the same string, otherwise live-reformatting on every input
// event would compound (each keystroke would add another country-code digit
// because our "+CC" prefix would be re-counted as part of the user's number).
const PHONE_FORMATS = {
  EN: { cc: '1', nat: 10, style: 'us' },
  CZ: { cc: '420', nat: 9, style: 'eu' },
  PL: { cc: '48', nat: 9, style: 'eu' },
  ES: { cc: '34', nat: 9, style: 'eu' },
};
function formatPhoneByLang(input) {
  const lang = typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'EN';
  const cfg = PHONE_FORMATS[lang] || PHONE_FORMATS.EN;
  let s = String(input || '');
  s = s.replace(new RegExp('^\\+\\s*' + cfg.cc + '[\\s(]+'), '');
  let digits = s.replace(/\D+/g, '');
  if (digits.length === cfg.nat + cfg.cc.length && digits.startsWith(cfg.cc)) {
    digits = digits.slice(cfg.cc.length);
  }
  digits = digits.slice(0, cfg.nat);
  if (!digits) return '';
  if (cfg.style === 'us') {
    const p1 = digits.slice(0, 3);
    const p2 = digits.slice(3, 6);
    const p3 = digits.slice(6, 10);
    if (digits.length <= 3) return '+1 (' + p1 + (digits.length === 3 ? ')' : '');
    if (digits.length <= 6) return '+1 (' + p1 + ') ' + p2;
    return '+1 (' + p1 + ') ' + p2 + '-' + p3;
  }
  const groups = [];
  for (let i = 0; i < digits.length; i += 3) groups.push(digits.slice(i, i + 3));
  return '+' + cfg.cc + ' ' + groups.join(' ');
}
// Back-compat alias — older callers used formatUsPhone before this became
// language-aware; keep the old name pointing at the new implementation.
function formatUsPhone(input) {
  return formatPhoneByLang(input);
}
function attachUsPhoneAutoFormat(input) {
  if (!input || input._usPhoneBound) return;
  input._usPhoneBound = true;
  // Track when the user is *shrinking* the value (Backspace / Delete) so we
  // can leave their typing alone — otherwise re-formatting after Backspace
  // immediately re-adds the prefix and the user can't delete the field.
  let lastLen = input.value.length;
  const onInput = (e) => {
    const before = input.value;
    const shrunk = before.length < lastLen;
    lastLen = before.length;
    // Don't re-format while the user is actively deleting — let them empty
    // the field freely. Final canonical format runs on blur.
    if (shrunk) return;
    const after = formatUsPhone(before);
    if (after !== before) {
      input.value = after;
      lastLen = after.length;
    }
  };
  const onBlur = () => {
    const before = input.value;
    const after = formatUsPhone(before);
    if (after !== before) input.value = after;
    lastLen = input.value.length;
  };
  input.addEventListener('input', onInput);
  input.addEventListener('blur', onBlur);
}
function openProfileModal() {
  const p = getProfile();
  document.getElementById('prFullName').value = p.fullName || '';
  document.getElementById('prEmail').value = p.email || '';
  document.getElementById('prPhone').value = formatUsPhone(p.phone || '');
  attachUsPhoneAutoFormat(document.getElementById('prPhone'));
  document.getElementById('prStreet').value = p.street || '';
  document.getElementById('prCity').value = p.city || '';
  document.getElementById('prState').value = p.state || '';
  document.getElementById('prZip').value = p.zip || '';
  document.getElementById('prCountry').value = p.country || '';
  document.getElementById('prCompany').value = p.company || '';
  document.getElementById('prTitle').value = p.title || '';
  document.getElementById('prWebsite').value = p.website || '';
  document.getElementById('prLinkedIn').value = p.linkedin || '';
  document.getElementById('prSocial').value = p.social || '';
  document.getElementById('prTagline').value = p.tagline || '';
  // Profile photo: clear any staged change from a previous open, then
  // refresh the preview to show the persisted photo (or initials).
  _profilePhotoStaged = undefined;
  refreshProfilePhotoPreview();
  renderSavedSignaturesGrid();
  document.getElementById('profileModal').classList.add('show');
}
function closeProfileModal() {
  document.getElementById('profileModal').classList.remove('show');
}

// Compute initials from a full name string ("Jane Doe" → "JD",
// "Jonathan" → "JO", "" → "?"). Same algorithm used on the business card.
function _computeInitials(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

// Refresh the round photo preview in the Profile modal. Shows either the
// saved photo (dataURL) or, when no photo is set, the user's initials.
// Buffer for the photo that's been picked but not yet "Save"d.
let _profilePhotoStaged = undefined; // undefined = no pending change, '' = pending remove, string = pending new dataURL
function refreshProfilePhotoPreview() {
  const p = getProfile();
  const img = document.getElementById('prPhotoImg');
  const initEl = document.getElementById('prPhotoInitials');
  const silhouette = document.getElementById('prPhotoSilhouette');
  const clearBtn = document.getElementById('prPhotoClear');
  const circle = document.getElementById('prPhotoCircle');
  // Effective photo = staged (if any) OR saved
  const effective = _profilePhotoStaged !== undefined ? _profilePhotoStaged : p.photo || '';
  // Initials always reflect the LIVE name field so users see them update
  // as they type, before saving.
  const liveName = (document.getElementById('prFullName')?.value || p.fullName || '').trim();
  const liveInitials = _computeInitials(liveName);
  if (effective) {
    // Photo wins — show the image, hide initials + silhouette.
    img.src = effective;
    img.hidden = false;
    initEl.hidden = true;
    silhouette.hidden = true;
    clearBtn.hidden = false;
    circle.classList.add('has-photo');
    circle.title = 'Click to change photo';
  } else {
    // No photo. Critically, REMOVE the src attribute instead of setting it
    // to ''. Setting src='' makes Firefox / Safari draw a broken-image icon
    // even when the element is `hidden`.
    img.removeAttribute('src');
    img.hidden = true;
    clearBtn.hidden = true;
    circle.classList.remove('has-photo');
    circle.title = 'Click to upload your photo';
    if (liveInitials && liveInitials !== '?') {
      // We have a name → show initials
      initEl.textContent = liveInitials;
      initEl.hidden = false;
      silhouette.hidden = true;
    } else {
      // No name either → show the generic person silhouette
      initEl.hidden = true;
      silhouette.hidden = false;
    }
  }
}
// Wire the photo input and clear button. Photos are scaled down to a max
// of 512×512 px to keep localStorage usage reasonable.
(function wireProfilePhoto() {
  const input = document.getElementById('prPhotoInput');
  const clearBtn = document.getElementById('prPhotoClear');
  const nameInput = document.getElementById('prFullName');
  // Clicking the avatar circle itself opens the file picker — the avatar
  // IS the upload prompt (per user request: "avatar that prompts to upload
  // picture"). The Upload button still works too; the circle is a more
  // discoverable affordance for first-time users.
  const circle = document.getElementById('prPhotoCircle');
  if (circle && input)
    circle.addEventListener('click', (e) => {
      // Don't intercept the file input itself or the Upload <label> when they
      // bubble up — they already handle the picker.
      if (e.target.closest && (e.target.closest('input[type="file"]') || e.target.closest('label.btn')))
        return;
      input.click();
    });
  if (input)
    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('Please pick an image file.', 'warn');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const probe = new Image();
        probe.onload = () => openPhotoCropper(probe);
        probe.onerror = () => showToast('Could not read that image.', 'error');
        probe.src = reader.result;
      };
      reader.onerror = () => showToast(window.t('toast.readFail', 'Could not read the file.'), 'error');
      reader.readAsDataURL(file);
    });
  if (clearBtn)
    clearBtn.addEventListener('click', () => {
      _profilePhotoStaged = ''; // pending removal — applied on Save
      refreshProfilePhotoPreview();
    });
  // Re-render initials as the user types their name (so the preview reacts
  // before they save).
  if (nameInput)
    nameInput.addEventListener('input', () => {
      if (!_profilePhotoStaged) refreshProfilePhotoPreview();
    });
})();

// === Photo cropper / editor ===
// Pan + zoom + rotate (free + 90°) + mirror H/V + colour filter + brightness
// /contrast/saturation + optional vignette. Outputs a 512×512 JPEG dataURL
// into _profilePhotoStaged. All client-side — no upload anywhere.
const _pcState = {
  img: null, // source HTMLImageElement
  tx: 0,
  ty: 0, // pan in DISPLAY pixels (relative to centre)
  zoom: 1, // 1 = "fill the circle" (cover-fit)
  rot: 0, // rotation in degrees (0–360)
  flipH: false,
  flipV: false,
  filter: 'none',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  vignette: false,
  // Computed once per image: base scale to make the smaller side fill the
  // display circle exactly when zoom = 1.
  baseScale: 1,
  // Dragging state
  dragging: false,
  dragX: 0,
  dragY: 0,
};
const PC_DISPLAY_SIZE = 320; // px of the on-screen preview canvas
const PC_OUTPUT_SIZE = 512; // px of the dataURL we save

function openPhotoCropper(img) {
  _pcState.img = img;
  // baseScale = "cover" — scale so the image's SHORTER side equals the display.
  _pcState.baseScale = PC_DISPLAY_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
  // Reset all transforms when opening for a fresh image.
  _pcState.tx = 0;
  _pcState.ty = 0;
  _pcState.zoom = 1;
  _pcState.rot = 0;
  _pcState.flipH = false;
  _pcState.flipV = false;
  _pcState.filter = 'none';
  _pcState.brightness = 1;
  _pcState.contrast = 1;
  _pcState.saturation = 1;
  _pcState.vignette = false;
  // Sync UI controls
  document.getElementById('pcZoom').value = '1';
  document.getElementById('pcRot').value = '0';
  document.getElementById('pcFilter').value = 'none';
  document.getElementById('pcBright').value = '1';
  document.getElementById('pcContrast').value = '1';
  document.getElementById('pcSat').value = '1';
  document.getElementById('pcVignette').checked = false;
  document.getElementById('pcFlipH').classList.remove('active');
  document.getElementById('pcFlipV').classList.remove('active');
  _pcUpdateValueLabels();
  document.getElementById('photoCropModal').classList.add('show');
  _renderPhotoCrop();
}
function closePhotoCropper() {
  document.getElementById('photoCropModal').classList.remove('show');
  _pcState.img = null; // release reference
}
function _pcUpdateValueLabels() {
  document.getElementById('pcZoomVal').textContent = Math.round(_pcState.zoom * 100) + '%';
  document.getElementById('pcRotVal').textContent = Math.round(_pcState.rot) + '°';
  document.getElementById('pcBrightVal').textContent = Math.round(_pcState.brightness * 100) + '%';
  document.getElementById('pcContrastVal').textContent = Math.round(_pcState.contrast * 100) + '%';
  document.getElementById('pcSatVal').textContent = Math.round(_pcState.saturation * 100) + '%';
}

// Build the CSS filter string from the active named filter + the three
// continuous adjustments (brightness/contrast/saturation). Named filters
// stack on top of the user's slider tweaks.
function _pcCssFilter() {
  const parts = [];
  parts.push('brightness(' + _pcState.brightness + ')');
  parts.push('contrast(' + _pcState.contrast + ')');
  parts.push('saturate(' + _pcState.saturation + ')');
  switch (_pcState.filter) {
    case 'grayscale':
      parts.push('grayscale(1)');
      break;
    case 'sepia':
      parts.push('sepia(0.85)');
      break;
    case 'vintage':
      parts.push('sepia(0.45) contrast(0.95) brightness(0.95)');
      break;
    case 'cool':
      parts.push('hue-rotate(210deg) saturate(1.1)');
      break;
    case 'warm':
      parts.push('sepia(0.25) hue-rotate(-15deg) saturate(1.2)');
      break;
    case 'blur':
      parts.push('blur(2px)');
      break;
    case 'sharpen':
      parts.push('contrast(1.3) saturate(1.15)');
      break;
    case 'none':
    default:
      break;
  }
  return parts.join(' ');
}

// Draw the current state into a target canvas. `outSize` = canvas side in
// pixels. We use the same logic for both the on-screen preview (320 px)
// and the final apply step (512 px) — just scale the pan + base scale.
function _renderPhotoCropTo(canvas, outSize) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.clearRect(0, 0, outSize, outSize);
  // Background colour visible at edges if the photo doesn't cover after
  // rotation (e.g. user zoomed out below cover-fit).
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, outSize, outSize);
  // Apply CSS filter to ALL subsequent draw calls until restore().
  try {
    ctx.filter = _pcCssFilter();
  } catch (_) {
    ctx.filter = 'none';
  }
  // Centre origin, then rotation, then mirror, then pan, then draw image
  // centred. Order matters — rotation/mirror happens around the centre,
  // pan moves the rotated image inside the frame.
  const cx = outSize / 2,
    cy = outSize / 2;
  ctx.translate(cx, cy);
  ctx.rotate((_pcState.rot * Math.PI) / 180);
  ctx.scale(_pcState.flipH ? -1 : 1, _pcState.flipV ? -1 : 1);
  // Scale pan from display-pixel space to the target's pixel space so the
  // preview and the final output are identical compositions.
  const sf = outSize / PC_DISPLAY_SIZE;
  ctx.translate(_pcState.tx * sf, _pcState.ty * sf);
  const img = _pcState.img;
  if (img) {
    const drawScale = _pcState.baseScale * _pcState.zoom * sf;
    const dw = img.naturalWidth * drawScale;
    const dh = img.naturalHeight * drawScale;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();
  // Optional vignette — drawn AFTER the image, without the filter, as a
  // radial darken from edges. Subtle by default.
  if (_pcState.vignette) {
    const grad = ctx.createRadialGradient(
      outSize / 2,
      outSize / 2,
      outSize * 0.35,
      outSize / 2,
      outSize / 2,
      outSize * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outSize, outSize);
  }
}

function _renderPhotoCrop() {
  const c = document.getElementById('photoCropCanvas');
  if (!c) return;
  _renderPhotoCropTo(c, PC_DISPLAY_SIZE);
}

// Wire up the cropper controls.
(function wirePhotoCropper() {
  const stage = document.getElementById('photoCropStage');
  const canvas = document.getElementById('photoCropCanvas');
  const zoom = document.getElementById('pcZoom');
  const rot = document.getElementById('pcRot');
  const rotL = document.getElementById('pcRotL');
  const rotR = document.getElementById('pcRotR');
  const flipH = document.getElementById('pcFlipH');
  const flipV = document.getElementById('pcFlipV');
  const filter = document.getElementById('pcFilter');
  const bright = document.getElementById('pcBright');
  const contr = document.getElementById('pcContrast');
  const sat = document.getElementById('pcSat');
  const vign = document.getElementById('pcVignette');
  const reset = document.getElementById('photoCropReset');
  const cancel = document.getElementById('photoCropCancel');
  const close = document.getElementById('photoCropClose');
  const apply = document.getElementById('photoCropApply');
  if (!stage || !canvas) return;
  // Pan via pointer drag on the canvas.
  let dragId = null,
    lastX = 0,
    lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    const dx = e.clientX - lastX,
      dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    // Pan in the FRAME's coordinate space — straightforward x/y.
    _pcState.tx += dx;
    _pcState.ty += dy;
    _renderPhotoCrop();
  });
  const endPan = (e) => {
    if (dragId === null) return;
    dragId = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };
  canvas.addEventListener('pointerup', endPan);
  canvas.addEventListener('pointercancel', endPan);
  // Scroll-wheel zoom.
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const next = _pcState.zoom * (e.deltaY < 0 ? 1.07 : 1 / 1.07);
      _pcState.zoom = Math.max(0.5, Math.min(4, next));
      zoom.value = _pcState.zoom;
      _pcUpdateValueLabels();
      _renderPhotoCrop();
    },
    { passive: false }
  );
  // Slider + button handlers
  zoom.oninput = () => {
    _pcState.zoom = parseFloat(zoom.value);
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  rot.oninput = () => {
    _pcState.rot = parseFloat(rot.value);
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  rotL.onclick = () => {
    _pcState.rot = (((_pcState.rot - 90) % 360) + 360) % 360;
    if (_pcState.rot > 180) _pcState.rot -= 360;
    rot.value = _pcState.rot;
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  rotR.onclick = () => {
    _pcState.rot = (((_pcState.rot + 90) % 360) + 360) % 360;
    if (_pcState.rot > 180) _pcState.rot -= 360;
    rot.value = _pcState.rot;
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  flipH.onclick = () => {
    _pcState.flipH = !_pcState.flipH;
    flipH.classList.toggle('active', _pcState.flipH);
    _renderPhotoCrop();
  };
  flipV.onclick = () => {
    _pcState.flipV = !_pcState.flipV;
    flipV.classList.toggle('active', _pcState.flipV);
    _renderPhotoCrop();
  };
  filter.onchange = () => {
    _pcState.filter = filter.value;
    _renderPhotoCrop();
  };
  bright.oninput = () => {
    _pcState.brightness = parseFloat(bright.value);
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  contr.oninput = () => {
    _pcState.contrast = parseFloat(contr.value);
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  sat.oninput = () => {
    _pcState.saturation = parseFloat(sat.value);
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  vign.onchange = () => {
    _pcState.vignette = vign.checked;
    _renderPhotoCrop();
  };
  reset.onclick = () => {
    _pcState.tx = 0;
    _pcState.ty = 0;
    _pcState.zoom = 1;
    _pcState.rot = 0;
    _pcState.flipH = false;
    _pcState.flipV = false;
    _pcState.filter = 'none';
    _pcState.brightness = 1;
    _pcState.contrast = 1;
    _pcState.saturation = 1;
    _pcState.vignette = false;
    zoom.value = '1';
    rot.value = '0';
    filter.value = 'none';
    bright.value = '1';
    contr.value = '1';
    sat.value = '1';
    vign.checked = false;
    flipH.classList.remove('active');
    flipV.classList.remove('active');
    _pcUpdateValueLabels();
    _renderPhotoCrop();
  };
  cancel.onclick = closePhotoCropper;
  close.onclick = closePhotoCropper;
  apply.onclick = () => {
    // Render at output size, save as JPEG dataURL (smaller than PNG and
    // photos compress very well).
    const out = document.createElement('canvas');
    out.width = PC_OUTPUT_SIZE;
    out.height = PC_OUTPUT_SIZE;
    _renderPhotoCropTo(out, PC_OUTPUT_SIZE);
    _profilePhotoStaged = out.toDataURL('image/jpeg', 0.88);
    closePhotoCropper();
    if (typeof refreshProfilePhotoPreview === 'function') refreshProfilePhotoPreview();
    showToast(
      window.t('toast.profilePhoto', 'Photo applied — click Save in Profile to persist it.'),
      'success'
    );
  };
  // Click outside the card closes (matches other modals)
  const m = document.getElementById('photoCropModal');
  if (m)
    m.addEventListener('click', (e) => {
      if (e.target.id === 'photoCropModal') closePhotoCropper();
    });
})();

function renderSavedSignaturesGrid() {
  const grid = document.getElementById('savedSigsGrid');
  grid.innerHTML = '';
  const sigs = getSavedSignatures();
  if (!sigs.length) {
    const empty = document.createElement('div');
    empty.className = 'saved-sigs-empty';
    empty.textContent = window.t(
      'profile.noSigs',
      'No saved signatures yet. Sign in the Signature dialog and check "Save for future use".'
    );
    grid.appendChild(empty);
    return;
  }
  sigs.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'saved-sig-card';
    const img = document.createElement('img');
    img.src = s.dataURL;
    img.alt = 'Saved signature ' + (idx + 1);
    card.appendChild(img);
    const del = document.createElement('button');
    del.className = 'ssc-del';
    del.type = 'button';
    del.title = 'Remove this signature';
    del.textContent = '✕';
    del.onclick = (e) => {
      e.stopPropagation();
      const list = getSavedSignatures();
      list.splice(idx, 1);
      saveSignatures(list);
      renderSavedSignaturesGrid();
    };
    card.appendChild(del);
    grid.appendChild(card);
  });
}
document.getElementById('profileBtn').addEventListener('click', openProfileModal);
document.getElementById('profileClose').addEventListener('click', closeProfileModal);
document.getElementById('profileCancel').addEventListener('click', closeProfileModal);
document.getElementById('profileModal').addEventListener('click', (e) => {
  if (e.target.id === 'profileModal') closeProfileModal();
});
document.getElementById('profileSave').addEventListener('click', () => {
  const p = {
    fullName: document.getElementById('prFullName').value.trim(),
    email: document.getElementById('prEmail').value.trim(),
    phone: formatUsPhone(document.getElementById('prPhone').value.trim()),
    street: document.getElementById('prStreet').value.trim(),
    city: document.getElementById('prCity').value.trim(),
    state: document.getElementById('prState').value.trim(),
    zip: document.getElementById('prZip').value.trim(),
    country: document.getElementById('prCountry').value.trim(),
    company: document.getElementById('prCompany').value.trim(),
    title: document.getElementById('prTitle').value.trim(),
    website: document.getElementById('prWebsite').value.trim(),
    linkedin: document.getElementById('prLinkedIn').value.trim(),
    social: document.getElementById('prSocial').value.trim(),
    tagline: document.getElementById('prTagline').value.trim(),
    // Photo: take the staged value if the user picked/cleared one this
    // session, otherwise carry over what's already persisted.
    photo: _profilePhotoStaged !== undefined ? _profilePhotoStaged : getProfile().photo || '',
  };
  // Clear staged state after persisting
  _profilePhotoStaged = undefined;
  saveProfile(p);
  closeProfileModal();
  showToast(window.t('toast.profileSaved', 'Profile saved.'), 'success');
});
document.getElementById('profileClear').addEventListener('click', () => {
  if (!confirm('Clear all profile data? Saved signatures will also be removed.')) return;
  clearProfile();
  try {
    localStorage.removeItem(SIGNATURES_KEY);
  } catch (e) {}
  openProfileModal(); // refresh form
  showToast(window.t('toast.profileCleared', 'Profile cleared.'), 'success');
});

// === STAMP TEMPLATES (Standard & Info) ===
const RED = '#dc2626',
  GREEN = '#15803d',
  BLUE = '#1d4ed8',
  ORANGE = '#d97706',
  YELLOW_BG = '#fef9c3';
// Each standard stamp has a stable English `text` (used as the i18n fallback
// and as the canonical key fragment 'stamp.<id>'). When a stamp is inserted /
// previewed we resolve the text through t() so users in CZ/PL/ES see the
// localized wording stamped into the PDF.
const STANDARD_STAMPS = [
  { id: 'approved', text: 'APPROVED', textColor: GREEN, borderColor: GREEN },
  { id: 'as-is', text: 'AS IS', textColor: RED, borderColor: RED, italic: true },
  { id: 'completed', text: 'COMPLETED', textColor: GREEN, borderColor: GREEN },
  { id: 'confidential', text: 'CONFIDENTIAL', textColor: RED, borderColor: RED },
  { id: 'departmental', text: 'DEPARTMENTAL', textColor: RED, borderColor: RED },
  { id: 'draft', text: 'DRAFT', textColor: RED, borderColor: RED },
  { id: 'experimental', text: 'EXPERIMENTAL', textColor: RED, borderColor: RED },
  { id: 'expired', text: 'EXPIRED', textColor: RED, borderColor: RED },
  { id: 'final', text: 'FINAL', textColor: RED, borderColor: RED },
  { id: 'for-comment', text: 'FOR COMMENT', textColor: RED, borderColor: RED },
  { id: 'for-public-release', text: 'FOR PUBLIC RELEASE', textColor: RED, borderColor: RED },
  { id: 'information-only', text: 'INFORMATION ONLY', textColor: RED, borderColor: RED },
  { id: 'not-approved', text: 'NOT APPROVED', textColor: RED, borderColor: RED },
  { id: 'not-for-public-release', text: 'NOT FOR PUBLIC RELEASE', textColor: RED, borderColor: RED },
  { id: 'preliminary-results', text: 'PRELIMINARY RESULTS', textColor: RED, borderColor: RED },
  { id: 'sold', text: 'SOLD', textColor: GREEN, borderColor: GREEN },
  { id: 'top-secret', text: 'TOP SECRET', textColor: RED, borderColor: RED, bgColor: YELLOW_BG },
  { id: 'void', text: 'VOID', textColor: RED, borderColor: RED },
  { id: 'urgent', text: 'URGENT', textColor: RED, borderColor: RED, underline: true },
  { id: 'paid', text: 'PAID', textColor: GREEN, borderColor: GREEN },
  { id: 'reviewed', text: 'REVIEWED', textColor: BLUE, borderColor: BLUE },
];
// Localized stamp text — looked up in the active language at gallery render
// and at insert time. Returns the original EN `text` when no translation exists.
function localizedStampText(tpl) {
  if (!tpl || !tpl.id || tpl._custom || tpl._kind === 'image') return tpl ? tpl.text || '' : '';
  return window.t('stamp.' + tpl.id, tpl.text || '');
}
// Defaults applied when no explicit value
function stampDefaults() {
  return {
    text: 'STAMP',
    fontFamily: 'Helvetica',
    fontSize: 24,
    bold: true,
    italic: false,
    underline: false,
    textColor: RED,
    bgColor: null,
    borderColor: RED,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingX: 16,
    paddingY: 8,
  };
}
function makeStampTemplate(def) {
  return Object.assign(stampDefaults(), def);
}

// Info "stamps" — produce text annotations instead of stamp annotations.
// Label/desc are resolved through t() at render time so language switches
// at runtime; the constant keeps i18n keys so the same code path works in EN.
const INFO_STAMPS = [
  { id: 'date', labelKey: 'info.date', descKey: 'info.date.desc', icon: '📅' },
  { id: 'datetime', labelKey: 'info.datetime', descKey: 'info.datetime.desc', icon: '🕒' },
  { id: 'address', labelKey: 'info.address', descKey: 'info.address.desc', icon: '🏠' },
  { id: 'card', labelKey: 'info.card', descKey: 'info.card.desc', icon: '💼' },
  { id: 'signature', labelKey: 'info.signature', descKey: 'info.signature.desc', icon: '✍' },
];

// === STAMP ANNOTATION RENDERING ===
function applyStampStyles(el, ann) {
  const inner = el.querySelector('.stamp-inner') || el;
  el.style.width = ann.width + 'px';
  el.style.height = ann.height + 'px';
  el.style.left = ann.x + 'px';
  el.style.top = ann.y + 'px';
  el.style.transform = `rotate(${ann.rotation || 0}deg)`;
  el.style.background = ann.bgColor || 'transparent';
  el.style.borderRadius = (ann.borderRadius || 0) + 'px';
  el.style.border =
    ann.borderStyle && ann.borderStyle !== 'none' && ann.borderWidth > 0
      ? `${ann.borderWidth}px ${ann.borderStyle} ${ann.borderColor}`
      : 'none';
  inner.style.color = ann.textColor;
  const cssFamily =
    ann.fontFamily === 'Times-Roman'
      ? 'Times, "Times New Roman", serif'
      : ann.fontFamily === 'Courier'
        ? '"Courier New", Courier, monospace'
        : 'Helvetica, Arial, sans-serif';
  inner.style.fontFamily = cssFamily;
  inner.style.fontSize = ann.fontSize + 'px';
  inner.style.fontWeight = ann.bold ? '700' : '500';
  inner.style.fontStyle = ann.italic ? 'italic' : 'normal';
  inner.style.textDecoration = ann.underline ? 'underline' : 'none';
  inner.style.padding = `${ann.paddingY}px ${ann.paddingX}px`;
  // white-space:pre (not pre-line) so the on-screen stamp breaks ONLY on explicit
  // newlines — never soft-wraps. The exported PDF lays text out with split('\n'),
  // so any soft-wrap in the editor (e.g. a sub-pixel-narrow box pushing the last
  // word down) would make print show fewer lines than the design. Collapsing
  // whitespace runs here mirrors print's per-line .replace(/[ \t]+/g,' '), so a
  // "PAID  •  2024"-style double space looks identical in both.
  inner.style.whiteSpace = 'pre';
  inner.textContent = (ann.text || '').replace(/[ \t]+/g, ' ');
}
function measureStamp(ann) {
  // Build a hidden, fully-styled clone to measure natural dimensions
  const tmp = document.createElement('div');
  tmp.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:-9999px;display:inline-block;';
  const inner = document.createElement('div');
  inner.className = 'stamp-inner';
  tmp.appendChild(inner);
  document.body.appendChild(tmp);
  const tmpAnn = Object.assign({}, ann, { x: 0, y: 0, rotation: 0, width: 'auto', height: 'auto' });
  applyStampStyles(tmp, tmpAnn);
  tmp.style.width = 'auto';
  tmp.style.height = 'auto';
  inner.style.width = 'auto';
  inner.style.height = 'auto';
  inner.style.whiteSpace = 'pre';
  // +2px horizontal safety so the integer-rounded offsetWidth can never end up a
  // sub-pixel narrower than the text needs (which, with overflow:hidden, would
  // clip the last glyph). Invisible at the box level, keeps edit == print.
  const w = tmp.offsetWidth + 2,
    h = tmp.offsetHeight;
  document.body.removeChild(tmp);
  return { w, h };
}
function renderStampAnnotation(ann) {
  applyStampStyles(ann.el, ann);
}
function createStampAnnotation(pos, tpl) {
  const ann = Object.assign(
    {
      type: 'stamp',
      pageNum: pos.pageNum,
      x: pos.x,
      y: pos.y,
      rotation: 0,
    },
    stampDefaults(),
    tpl
  );
  // measure for initial size
  const sz = measureStamp(ann);
  ann.width = sz.w;
  ann.height = sz.h;

  const el = document.createElement('div');
  el.className = 'annotation stamp-annotation';
  const inner = document.createElement('div');
  inner.className = 'stamp-inner';
  el.appendChild(inner);
  pos.overlay.appendChild(el);
  ann.el = el;
  applyStampStyles(el, ann);
  annotations.push(ann);
  enableStampDrag(el, ann);
  // Rotation puck (middle-right of selection)
  const rot = document.createElement('div');
  rot.className = 'rot-handle';
  rot.title = 'Drag to rotate';
  el.appendChild(rot);
  attachRotateHandle(rot, ann, () => renderStampAnnotation(ann));
  // Double-click → open stamp editor
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    openStampEditor(ann);
  });
  updateAnnotCount();
  select(ann);
  return ann;
}

// Open the Create New Stamp modal pre-filled with this annotation's values; on save, update the annotation.
function openStampEditor(ann) {
  openCreateStampModal();
  // Prefer the original template (with tokens) when the stamp has one — that
  // way editing a "DRAFT  {USER} {DATE}" stamp shows the template again, not
  // the snapshotted resolved string. Older stamps fall back to ann.text.
  const tpl = ann.template || ann.text || '';
  csState.template = tpl;
  csState.text = tpl;
  csState.fontFamily = ann.fontFamily;
  csState.fontSize = ann.fontSize;
  csState.bold = ann.bold;
  csState.italic = ann.italic;
  csState.underline = ann.underline;
  csState.textColor = ann.textColor;
  csState.bgColor = ann.bgColor;
  csState.borderColor = ann.borderColor;
  csState.borderStyle = ann.borderStyle;
  csState.borderWidth = ann.borderWidth;
  if (ann.timestamp) {
    if (ann.timestamp.usernameVal) csState.timestamp.usernameVal = ann.timestamp.usernameVal;
    if (ann.timestamp.dateFormat) csState.timestamp.dateFormat = ann.timestamp.dateFormat;
    if (ann.timestamp.timeFormat) csState.timestamp.timeFormat = ann.timestamp.timeFormat;
  }
  // sync UI
  document.getElementById('csText').value = tpl;
  document.getElementById('csFont').value = ann.fontFamily;
  document.getElementById('csBold').classList.toggle('active', ann.bold);
  document.getElementById('csItalic').classList.toggle('active', ann.italic);
  document.getElementById('csUnderline').classList.toggle('active', ann.underline);
  document.getElementById('csTextColor').value = ann.textColor;
  document.getElementById('csBorderStyle').value = ann.borderStyle;
  document.getElementById('csBorderColor').value = ann.borderColor;
  document.getElementById('csBorderWidth').value = ann.borderWidth;
  document.getElementById('csFontSize').value = ann.fontSize;
  document.getElementById('csUsernameVal').value = csState.timestamp.usernameVal || '';
  document.getElementById('csDateFormat').value = csState.timestamp.dateFormat;
  document.getElementById('csTimeFormat').value = csState.timestamp.timeFormat;
  updateCreateStampPreview();
  document.getElementById('createStampTitle').textContent = window.t('cs.editTitle', 'Edit Stamp');
  document.getElementById('csCreate').textContent = window.t('cs.updateBtn', 'Update Stamp');
  // Override create handler to update this annotation instead
  document.getElementById('csCreate').onclick = () => {
    Object.assign(ann, buildStampTemplateFromState());
    // The visible text on the annotation is the resolved-once snapshot —
    // editing it shouldn't silently keep showing the old date / time.
    ann.text = resolveStampTemplate(csState.template, {
      usernameVal: csState.timestamp.usernameVal,
      dateFormat: csState.timestamp.dateFormat,
      timeFormat: csState.timestamp.timeFormat,
    });
    const sz = measureStamp(ann);
    ann.width = sz.w;
    ann.height = sz.h;
    renderStampAnnotation(ann);
    closeCreateStampModal();
    // Restore default create behavior (and button label) for next time
    bindCreateStampEvents();
    document.getElementById('createStampTitle').textContent = window.t('cs.title', 'Create New Stamp');
    document.getElementById('csCreate').textContent = window.t('cs.createInsert', 'Create & Insert');
    if (selected === ann) {
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    }
    showToast(window.t('toast.stampUpdated', 'Stamp updated.'), 'success');
  };
}
function enableStampDrag(el, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    startLeft = 0,
    startTop = 0,
    hasMoved = false;
  let restOpacity = '1';
  el.addEventListener('pointerdown', (e) => {
    if (currentTool === 'draw' || currentTool === 'shape') return;
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    downX = e.clientX;
    downY = e.clientY;
    startLeft = ann.x;
    startTop = ann.y;
    hasMoved = false;
    dragging = true;
    restOpacity = ann.opacity != null && ann.opacity < 1 ? String(ann.opacity) : el.style.opacity || '1';
    el.style.opacity = String(Math.max(0.15, parseFloat(restOpacity) * 0.85));
    try {
      el.setPointerCapture(e.pointerId);
    } catch (er) {}
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - downX) / currentZoom;
    const dy = (e.clientY - downY) / currentZoom;
    if (!hasMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    hasMoved = true;
    const overlay = el.parentElement;
    let nx = Math.max(0, Math.min(overlay.offsetWidth - ann.width, startLeft + dx));
    let ny = Math.max(0, Math.min(overlay.offsetHeight - ann.height, startTop + dy));
    const snapped = snapPosition(ann, nx, ny, ann.width, ann.height);
    nx = snapped.x;
    ny = snapped.y;
    ann.x = nx;
    ann.y = ny;
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    if (selected === ann) positionPropsPanel(ann);
  });
  const end = (e) => {
    if (!dragging) return;
    el.style.opacity = restOpacity;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch (er) {}
    hideAlignmentGuides();
    if (!hasMoved) select(ann);
    dragging = false;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// === CUSTOM STAMPS — localStorage ===
const CUSTOM_STAMPS_KEY = 'pdfMini.customStamps.v1';
function loadCustomStamps() {
  try {
    const raw = localStorage.getItem(CUSTOM_STAMPS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function saveCustomStamps(list) {
  try {
    localStorage.setItem(CUSTOM_STAMPS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save custom stamps:', e);
  }
}

// === STAMPS MODAL ===
function openStampsModal() {
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  if (currentTool !== 'select') setTool('select');
  document.getElementById('stampsModal').classList.add('show');
  renderStampsGrids();
}
function closeStampsModal() {
  document.getElementById('stampsModal').classList.remove('show');
}
function renderStampsGrids() {
  // Standard
  const std = document.getElementById('stampsGridStandard');
  std.innerHTML = '';
  STANDARD_STAMPS.forEach((s) => std.appendChild(makeStampCard(makeStampTemplate(s))));
  // Info
  const info = document.getElementById('stampsGridInfo');
  info.innerHTML = '';
  INFO_STAMPS.forEach((i) => info.appendChild(makeInfoCard(i)));
  // Custom
  const cus = document.getElementById('stampsGridCustom');
  cus.innerHTML = '';
  const list = loadCustomStamps();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'stamps-empty';
    empty.innerHTML = 'No custom stamps yet. Click <strong>Create New Stamp</strong> to make one.';
    cus.appendChild(empty);
  } else {
    list.forEach((s, idx) => cus.appendChild(makeStampCard(s, { custom: true, idx })));
  }
}
function makeStampCard(tpl, opts) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'stamp-card';
  const box = document.createElement('div');
  box.className = 'stamp-preview-box';
  // === Image stamp preview ===
  if (tpl._kind === 'image' && tpl.dataURL) {
    const img = document.createElement('img');
    img.src = tpl.dataURL;
    img.alt = tpl.name || 'Image stamp';
    img.style.cssText = 'max-width:100%;max-height:90px;object-fit:contain;display:block;margin:auto';
    box.style.background = 'transparent';
    box.style.border = 'none';
    box.style.padding = '6px';
    box.appendChild(img);
    if (tpl.name) {
      const cap = document.createElement('div');
      cap.style.cssText =
        'font-size:10px;color:var(--muted);margin-top:4px;text-align:center;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      cap.textContent = tpl.name;
      box.appendChild(cap);
    }
    card.appendChild(box);
    if (opts && opts.custom) {
      const del = document.createElement('button');
      del.className = 'stamp-delete';
      del.type = 'button';
      del.innerHTML = '🗑';
      del.title = 'Delete custom stamp';
      del.onclick = (e) => {
        e.stopPropagation();
        const list = loadCustomStamps();
        list.splice(opts.idx, 1);
        saveCustomStamps(list);
        renderStampsGrids();
      };
      card.appendChild(del);
    }
    card.onclick = () => insertStampFromTemplate(tpl);
    return card;
  }
  // === Text stamp preview (existing) ===
  // Resolve any {USER}/{DATE}/{TIME} tokens so the card preview shows what
  // the stamp will actually look like once inserted. Standard stamps are
  // localized via localizedStampText() so CZ/PL/ES users see e.g. "SCHVÁLENO"
  // instead of "APPROVED" in the gallery card.
  const localizedSourceText = localizedStampText(tpl);
  const cardText =
    typeof resolveStampTemplate === 'function' && localizedSourceText
      ? resolveStampTemplate(localizedSourceText, {
          usernamePlaceholder: true,
          usernameVal: (tpl.timestamp && tpl.timestamp.usernameVal) || '',
          dateFormat: (tpl.timestamp && tpl.timestamp.dateFormat) || 'MM/DD/YYYY',
          timeFormat: (tpl.timestamp && tpl.timestamp.timeFormat) || 'hh:mm A',
        })
      : localizedSourceText || '';
  // apply tpl visual props
  box.textContent = cardText;
  box.style.color = tpl.textColor;
  box.style.background = tpl.bgColor || 'transparent';
  box.style.borderRadius = (tpl.borderRadius || 0) + 'px';
  box.style.border =
    tpl.borderStyle && tpl.borderStyle !== 'none' && tpl.borderWidth > 0
      ? `${tpl.borderWidth}px ${tpl.borderStyle} ${tpl.borderColor}`
      : 'none';
  box.style.fontWeight = tpl.bold ? '700' : '500';
  box.style.fontStyle = tpl.italic ? 'italic' : 'normal';
  box.style.textDecoration = tpl.underline ? 'underline' : 'none';
  box.style.fontFamily =
    tpl.fontFamily === 'Times-Roman'
      ? 'Times, serif'
      : tpl.fontFamily === 'Courier'
        ? '"Courier New", monospace'
        : 'Helvetica, Arial, sans-serif';
  card.appendChild(box);
  if (opts && opts.custom) {
    const del = document.createElement('button');
    del.className = 'stamp-delete';
    del.type = 'button';
    del.innerHTML = '🗑';
    del.title = 'Delete custom stamp';
    del.onclick = (e) => {
      e.stopPropagation();
      const list = loadCustomStamps();
      list.splice(opts.idx, 1);
      saveCustomStamps(list);
      renderStampsGrids();
    };
    card.appendChild(del);
  }
  card.onclick = () => insertStampFromTemplate(tpl);
  return card;
}
function makeInfoCard(info) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'stamp-card info-card';
  const label = window.t(info.labelKey, info.id);
  const desc = window.t(info.descKey, '');
  card.innerHTML = `<span class="stamp-info-icon">${info.icon}</span>
    <span>
      <span class="stamp-info-label">${label}</span>
      <span class="stamp-info-sub">${desc}</span>
    </span>`;
  card.onclick = () => insertInfo(info.id);
  return card;
}
function insertStampFromTemplate(tpl) {
  if (typeof bumpUsage === 'function') {
    bumpUsage('open:stamps');
    // Also track specific stamp so the quick panel can surface frequent ones
    if (tpl && tpl.id) {
      const isCustom = tpl._custom === true;
      bumpUsage((isCustom ? 'custom-stamp:' : 'stamp:') + tpl.id);
    }
  }
  // === Image stamps: insert as image annotation ===
  if (tpl && tpl._kind === 'image' && tpl.dataURL) {
    closeStampsModal();
    const pos = pickInsertPos();
    if (!pos) return;
    addImageAnnotation(pos, tpl.dataURL, 'image/png');
    // Constrain initial size so a huge source image doesn't fill the page.
    const last = annotations[annotations.length - 1];
    if (last && last.type === 'image' && last.el) {
      const maxW = 200;
      const ratio = (tpl.h || 1) / Math.max(1, tpl.w || 1);
      last.width = Math.min(maxW, tpl.w || maxW);
      last.height = last.width * ratio;
      last.el.style.width = last.width + 'px';
      last.el.style.height = last.height + 'px';
    }
    showToast(
      window.t('toast.stampImageInserted', 'Image stamp inserted — drag a corner to resize.'),
      'success'
    );
    return;
  }
  // Resolve the stamp's text. Standard stamps are localized to the current
  // language (so users in CZ get e.g. "SCHVÁLENO" instead of "APPROVED").
  // Custom stamps and image stamps pass through unchanged.
  let text = localizedStampText(tpl);
  const hasTokens = /\{\s*(user|date|time)\s*\}/i.test(text);
  if (hasTokens || tpl.template) {
    text = resolveStampTemplate(tpl.template || text, {
      usernameVal: (tpl.timestamp && tpl.timestamp.usernameVal) || '',
      dateFormat: (tpl.timestamp && tpl.timestamp.dateFormat) || 'MM/DD/YYYY',
      timeFormat: (tpl.timestamp && tpl.timestamp.timeFormat) || 'hh:mm A',
    });
  } else if (tpl.timestamp) {
    const now = new Date();
    const parts = [];
    if (tpl.timestamp.username && tpl.timestamp.usernameVal) parts.push(tpl.timestamp.usernameVal);
    if (tpl.timestamp.date) parts.push(formatDateOnly(now, tpl.timestamp.dateFormat || 'MMM-DD-YYYY'));
    if (tpl.timestamp.time) parts.push(formatTimeOnly(now, tpl.timestamp.timeFormat || 'HH:mm'));
    if (parts.length) text = (text ? text + '\n' : '') + parts.join(' · ');
  }
  closeStampsModal();
  const pos = pickInsertPos();
  if (!pos) return;
  createStampAnnotation(pos, Object.assign({}, tpl, { text }));
  showToast(window.t('toast.stampInserted', 'Stamp inserted — drag to position.'), 'success');
}
function insertInfo(id) {
  closeStampsModal();
  if (currentTool !== 'select') setTool('select');
  if (typeof bumpUsage === 'function') bumpUsage('info:' + id);
  if (id === 'signature') {
    openSignatureModal(insertSignatureFromDataURL);
    return;
  }
  const pos = pickInsertPos();
  if (!pos) return;
  const now = new Date();
  let lines = [],
    fs = defaultSize;
  switch (id) {
    case 'date':
      lines = [plainLine(formatDateOnly(now, 'MMM-DD-YYYY'))];
      break;
    case 'datetime':
      lines = [plainLine(formatDateOnly(now, 'MMM-DD-YYYY') + ' · ' + formatTimeOnly(now, 'HH:mm'))];
      break;
    case 'address': {
      const p = getProfile();
      lines = [
        plainLine(p.street || 'Street Address'),
        plainLine([p.city, p.state, p.zip].filter(Boolean).join(', ') || 'City, State ZIP'),
        plainLine(p.country || 'Country'),
      ];
      break;
    }
    case 'card': {
      // Modern Business Card — rendered to a high-res canvas (with a vCard
      // QR on the right) and inserted as an IMAGE annotation rather than
      // a plain-text block. This is async because the QR library lazy-loads;
      // we return out of this `case` early and call the helper, which kicks
      // off the toast on its own.
      insertBusinessCardImage(pos);
      return;
    }
    default:
      return;
  }
  createTextAnnotationFromLines(pos, lines, fs);
  const profile = getProfile();
  const usedProfile = id === 'address' && profile.street;
  showToast(
    usedProfile
      ? window.t('toast.profileInserted', 'Inserted using your saved profile — double-click to edit.')
      : window.t('toast.profileInsertedBlank', 'Inserted — double-click to edit.'),
    'success'
  );
}

// === Modern Business Card (image-based, with vCard QR) ===
// Renders the saved profile onto a 960 × 560 px canvas (2× DPR for crisp
// print). Layout: gradient header strip across the top with the user's
// initials in a circle, name + title on the right; main area below has
// section-labelled contact lines on the left and a generous vCard QR on
// the right with a "SCAN TO ADD CONTACT" caption.
async function insertBusinessCardImage(pos) {
  const p = typeof getProfile === 'function' ? getProfile() : {};
  // If the user hasn't filled out at least their name, gently nudge them
  // to the Profile dialog instead of inserting a card full of placeholders.
  if (!String(p.fullName || '').trim()) {
    showToast(
      window.t(
        'toast.bcardNoProfile',
        'Fill in at least your name in Profile first — the business card uses your saved info.'
      ),
      'warn'
    );
    if (typeof openProfileModal === 'function') openProfileModal();
    return;
  }
  // ---- Layout constants ----
  const W = 960,
    H = 560;
  const PAD = 44;
  const ACCENT = '#2563eb';
  const ACCENT_DARK = '#1d4ed8';
  const ACCENT_LITE = '#dbeafe';
  const TEXT = '#0f172a';
  const MUTED = '#64748b';
  const BG = '#ffffff';
  const SOFT = '#f8fafc';
  const QR_BOX = 260;
  const FONT_STACK = '"Manrope", "Helvetica", "Arial", sans-serif';
  const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  // ---- Profile-derived values ----
  const fullName = (p.fullName || 'Your Name').trim();
  const title = (p.title || '').trim();
  const company = (p.company || '').trim();
  const phone = (p.phone || '').trim();
  const email = (p.email || '').trim();
  const website = (p.website || '').trim();
  const tagline = (p.tagline || '').trim();
  const linkedin = (p.linkedin || '').trim();
  const social = (p.social || '').trim();
  const street = (p.street || '').trim();
  const city = (p.city || '').trim();
  const state = (p.state || '').trim();
  const zip = (p.zip || '').trim();
  const country = (p.country || '').trim();
  const cityLine = [city, state, zip].filter(Boolean).join(', ');
  // Initials for the avatar circle ("Jane Doe" → "JD"; single word uses first 2 chars).
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const initials = (
    nameParts.length >= 2 ? nameParts[0][0] + nameParts[nameParts.length - 1][0] : fullName.slice(0, 2)
  ).toUpperCase();
  // ---- Build vCard payload for the QR ----
  const first = nameParts[0] || '';
  const last = nameParts.slice(1).join(' ');
  const vcardLines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (last || first) vcardLines.push(`N:${last};${first};;;`);
  vcardLines.push('FN:' + fullName);
  if (company) vcardLines.push('ORG:' + company);
  if (title) vcardLines.push('TITLE:' + title);
  if (phone) vcardLines.push('TEL;TYPE=CELL:' + phone);
  if (email) vcardLines.push('EMAIL:' + email);
  if (website) vcardLines.push('URL:' + website);
  if (street || city || zip || country) {
    vcardLines.push(`ADR:;;${street};${city};${state};${zip};${country}`);
  }
  if (tagline) vcardLines.push('NOTE:' + tagline);
  vcardLines.push('END:VCARD');
  const vcard = vcardLines.join('\n');
  // ---- Set up canvas ----
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.textBaseline = 'top';
  // ----- Card background (white) with subtle hairline frame -----
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  // ----- Top gradient header strip (1/3 of the card height) -----
  const HEAD_H = 200;
  const headGrad = ctx.createLinearGradient(0, 0, W, 0);
  headGrad.addColorStop(0, ACCENT_DARK);
  headGrad.addColorStop(1, ACCENT);
  ctx.fillStyle = headGrad;
  ctx.fillRect(0, 0, W, HEAD_H);
  // Decorative diagonal slash on the FAR right of the header (kept small so
  // it never reaches the name text region — only the right ~140 px).
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(W - 140, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, 110);
  ctx.lineTo(W - 60, HEAD_H);
  ctx.lineTo(W - 200, HEAD_H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Decorative ring on the right inside header
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W - 80, 60, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // ----- Avatar circle — fully inside the header strip on the left, next
  // to the name. Shows the user's uploaded profile photo (square-cropped,
  // clipped to a circle) when set, otherwise their initials. -----
  const AVATAR_R = 52;
  const avatarX = PAD + AVATAR_R;
  const avatarY = HEAD_H / 2;
  // White border around avatar so it pops against the gradient
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, AVATAR_R + 5, 0, Math.PI * 2);
  ctx.fill();
  // Inner colour (fallback for transparent photos / initials backdrop)
  ctx.fillStyle = ACCENT_LITE;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, AVATAR_R, 0, Math.PI * 2);
  ctx.fill();
  if (p.photo) {
    // Draw the photo clipped to the avatar circle.
    try {
      const photo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = p.photo;
      });
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, AVATAR_R, 0, Math.PI * 2);
      ctx.clip();
      // cover-fit: scale to the larger of (2R / w) and (2R / h), then centre
      const D = AVATAR_R * 2;
      const r = Math.max(D / photo.naturalWidth, D / photo.naturalHeight);
      const drawW = photo.naturalWidth * r;
      const drawH = photo.naturalHeight * r;
      ctx.drawImage(photo, avatarX - drawW / 2, avatarY - drawH / 2, drawW, drawH);
      ctx.restore();
    } catch (e) {
      // Photo failed to load → fall through to initials.
      console.warn('[business-card] photo failed to load, falling back to initials:', e);
    }
  } else {
    // Initials fallback
    ctx.fillStyle = ACCENT_DARK;
    ctx.font = '700 40px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, avatarX, avatarY + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }

  // ----- Name + title (right of avatar, white text on gradient) -----
  // Text block sits to the right of the avatar, vertically centred in the
  // header. Layout: NAME on top, then TITLE · COMPANY, then italic TAGLINE.
  const TEXT_X = PAD + AVATAR_R * 2 + 28;
  // Decoration on the right starts at W - 200, so cap the text block width.
  const TEXT_MAX_W = W - TEXT_X - 200;
  // Truncate over-long names so they don't run into the decoration.
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px ' + FONT_STACK;
  let nameToDraw = fullName;
  while (ctx.measureText(nameToDraw).width > TEXT_MAX_W && nameToDraw.length > 4) {
    nameToDraw = nameToDraw.slice(0, -2);
  }
  if (nameToDraw !== fullName) nameToDraw = nameToDraw.slice(0, -1) + '…';
  ctx.fillText(nameToDraw, TEXT_X, 48);
  // Subtitle: title + company
  if (title || company) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '600 22px ' + FONT_STACK;
    let sub = [title, company].filter(Boolean).join(' · ');
    while (ctx.measureText(sub).width > TEXT_MAX_W && sub.length > 4) sub = sub.slice(0, -2);
    ctx.fillText(sub, TEXT_X, 104);
  }
  // Tagline (italic, soft)
  if (tagline) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = 'italic 17px ' + FONT_STACK;
    let tag = tagline;
    while (ctx.measureText(tag).width > TEXT_MAX_W && tag.length > 4) tag = tag.slice(0, -2);
    if (tag !== tagline) tag = tag.slice(0, -1) + '…';
    ctx.fillText(tag, TEXT_X, 140);
  }

  // ----- Body: contact list on the left, QR card on the right -----
  // Section label
  const bodyStartY = HEAD_H + 56;
  ctx.fillStyle = MUTED;
  ctx.font = '700 13px ' + FONT_STACK;
  ctx.fillText(window.t('bcard.contact', 'CONTACT'), PAD, bodyStartY);
  // Underline accent under the section label
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, bodyStartY + 22, 32, 3);

  // Contact lines
  let y = bodyStartY + 42;
  ctx.font = '500 19px ' + FONT_STACK;
  const lineH = 36;
  const labelMaxW = W - QR_BOX - PAD * 2 - 30;
  const addContactLine = (icon, text) => {
    if (!text) return;
    // Truncate over-long contact text so it doesn't overflow into the QR area.
    let line = String(text);
    ctx.font = '500 19px ' + FONT_STACK;
    while (ctx.measureText(line).width > labelMaxW - 36 && line.length > 6) line = line.slice(0, -1);
    if (line !== text) line = line.slice(0, -1) + '…';
    // Icon (emoji glyphs render via the colour-emoji font on most systems)
    ctx.fillStyle = ACCENT;
    ctx.font = '22px ' + EMOJI;
    ctx.fillText(icon, PAD, y - 2);
    // Label
    ctx.fillStyle = TEXT;
    ctx.font = '500 19px ' + FONT_STACK;
    ctx.fillText(line, PAD + 36, y);
    y += lineH;
  };
  addContactLine('📞', phone);
  addContactLine('✉', email);
  addContactLine('🌐', website);
  const addr = [street, cityLine, country].filter(Boolean).join(', ');
  if (addr) addContactLine('📍', addr);
  if (linkedin) addContactLine('in', linkedin);
  if (social) addContactLine('@', social);

  // ---- RIGHT BLOCK (vCard QR card) ----
  try {
    await loadQrLib();
    const qr = window.qrcode(0, 'M');
    qr.addData(vcard);
    qr.make();
    const modules = qr.getModuleCount();
    const qrBoxX = W - QR_BOX - PAD;
    // Vertically align the QR with the contact list
    const qrBoxY = bodyStartY - 14;
    // Light QR background card with rounded corners and a soft shadow
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.10)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = SOFT;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(qrBoxX - 14, qrBoxY - 14, QR_BOX + 28, QR_BOX + 28, 16);
      ctx.fill();
    } else {
      ctx.fillRect(qrBoxX - 14, qrBoxY - 14, QR_BOX + 28, QR_BOX + 28);
    }
    ctx.restore();
    // Subtle border on the QR card
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(qrBoxX - 14.5, qrBoxY - 14.5, QR_BOX + 29, QR_BOX + 29, 16);
      ctx.stroke();
    }
    // Draw the QR modules
    const cell = Math.floor(QR_BOX / modules);
    const qrPx = cell * modules;
    const startX = qrBoxX + (QR_BOX - qrPx) / 2;
    const startY = qrBoxY + (QR_BOX - qrPx) / 2;
    ctx.fillStyle = TEXT;
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(startX + c * cell, startY + r * cell, cell, cell);
      }
    }
    // Caption below the QR
    ctx.fillStyle = MUTED;
    ctx.font = '700 13px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText(window.t('bcard.scan', 'SCAN TO ADD CONTACT'), qrBoxX + QR_BOX / 2, qrBoxY + QR_BOX + 24);
    ctx.textAlign = 'left';
  } catch (e) {
    console.warn('[business-card] QR generation failed:', e);
  }
  // Final hairline frame around the card
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  // Save the canvas as a PNG dataURL and insert as an image annotation
  const dataURL = canvas.toDataURL('image/png');
  addImageAnnotation(pos, dataURL, 'image/png');
  const used = !!(p.fullName || p.email || p.phone);
  showToast(
    used
      ? window.t('toast.bcardInserted', 'Business card inserted — open Profile to edit your details.')
      : window.t(
          'toast.bcardInsertedPh',
          'Business card inserted with placeholder text — fill in Profile first for a personalised card.'
        ),
    'success'
  );
}

// === CREATE NEW STAMP MODAL ===
let csState = null;

// Resolve {USER}, {DATE}, {TIME} tokens in a template string against the
// current values. Case-insensitive. Used by both the live preview and the
// final "Create & Insert" action so what the user sees IS what they get.
function resolveStampTemplate(template, opts) {
  if (template == null) return '';
  const o = opts || {};
  const now = o.now || new Date();
  const userVal = o.usernamePlaceholder ? o.usernameVal || '[username]' : o.usernameVal || '';
  const dateFmt = o.dateFormat || 'MM/DD/YYYY';
  const timeFmt = o.timeFormat || 'hh:mm A';
  return String(template).replace(/\{\s*(user|date|time)\s*\}/gi, (_, key) => {
    switch (key.toLowerCase()) {
      case 'user':
        return userVal;
      case 'date':
        return formatDateOnly(now, dateFmt);
      case 'time':
        return formatTimeOnly(now, timeFmt);
    }
    return '';
  });
}

function openCreateStampModal() {
  // Pre-fill username with the user's first + last name from profile, when present.
  let defaultUsername = '';
  try {
    const _p = typeof getProfile === 'function' ? getProfile() : {};
    if (_p && _p.fullName) {
      // First + Last (ignore middle names) — e.g. "Jane Mary Doe" → "Jane Doe"
      const parts = String(_p.fullName).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1) defaultUsername = parts[0];
      else if (parts.length >= 2) defaultUsername = parts[0] + ' ' + parts[parts.length - 1];
    }
  } catch (_) {}
  // Default template seeds the textarea with the standard "DRAFT + sig line" layout.
  const defaultTemplate = 'DRAFT\n{USER} · {DATE} {TIME}';
  csState = {
    kind: 'text', // 'text' | 'image' — switches which inputs the modal collects
    image: null, // { dataURL, w, h, name } when kind === 'image'
    template: defaultTemplate,
    text: defaultTemplate, // back-compat alias used by some downstream helpers
    fontFamily: 'Helvetica',
    fontSize: 24,
    bold: true,
    italic: false,
    underline: false,
    textColor: RED,
    bgColor: null,
    borderColor: RED,
    borderStyle: 'dashed',
    borderWidth: 2,
    timestamp: { usernameVal: defaultUsername, dateFormat: 'MM/DD/YYYY', timeFormat: 'hh:mm A' },
  };
  // Reset kind picker to "Text"; image preview empty
  document.querySelectorAll('input[name="csKind"]').forEach((r) => {
    r.checked = r.value === 'text';
  });
  document.getElementById('csTextField').hidden = false;
  document.getElementById('csImageField').hidden = true;
  document.getElementById('csTextOnlyFields').hidden = false;
  document.getElementById('csImagePreview').hidden = true;
  document.getElementById('csImagePreview').src = '';
  document.getElementById('csImageEmpty').hidden = false;
  document.getElementById('csImageReplace').hidden = true;
  document.getElementById('csImageClear').hidden = true;
  document.getElementById('csImageInfo').textContent = '';
  // Populate form
  document.getElementById('csText').value = csState.template;
  document.getElementById('csFont').value = csState.fontFamily;
  document.getElementById('csBold').classList.toggle('active', csState.bold);
  document.getElementById('csItalic').classList.toggle('active', csState.italic);
  document.getElementById('csUnderline').classList.toggle('active', csState.underline);
  document.getElementById('csTextColor').value = csState.textColor;
  document.getElementById('csBorderStyle').value = csState.borderStyle;
  document.getElementById('csBorderColor').value = csState.borderColor;
  document.getElementById('csBorderWidth').value = csState.borderWidth;
  document.getElementById('csFontSize').value = csState.fontSize;
  document.getElementById('csUsernameVal').value = defaultUsername;
  document.getElementById('csDateFormat').value = csState.timestamp.dateFormat;
  document.getElementById('csTimeFormat').value = csState.timestamp.timeFormat;
  document.getElementById('csSaveLib').checked = false;
  bindCreateStampEvents();
  updateCreateStampPreview();
  document.getElementById('createStampModal').classList.add('show');
}
function closeCreateStampModal() {
  document.getElementById('createStampModal').classList.remove('show');
}
function bindCreateStampEvents() {
  const $ = (id) => document.getElementById(id);
  $('createStampClose').onclick = closeCreateStampModal;
  $('csCancel').onclick = closeCreateStampModal;
  document.getElementById('createStampModal').onclick = (e) => {
    if (e.target.id === 'createStampModal') closeCreateStampModal();
  };
  // Template textarea — every change updates the preview live.
  $('csText').oninput = (e) => {
    csState.template = e.target.value || '';
    csState.text = csState.template; // alias for downstream helpers
    updateCreateStampPreview();
  };
  // Token-insert chips. Each chip has data-token; clicking it splices that
  // string into the textarea at the current caret position (or appends if
  // the textarea isn't focused) and keeps the caret immediately after.
  function insertAtCaret(textarea, token) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + token + after;
    const caret = start + token.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.focus();
    csState.template = textarea.value;
    csState.text = csState.template;
    updateCreateStampPreview();
  }
  document.querySelectorAll('.cs-chip[data-token]').forEach((chip) => {
    chip.onclick = () => insertAtCaret($('csText'), chip.dataset.token);
  });
  $('csFont').onchange = (e) => {
    csState.fontFamily = e.target.value;
    updateCreateStampPreview();
  };
  $('csBold').onclick = () => {
    csState.bold = !csState.bold;
    $('csBold').classList.toggle('active', csState.bold);
    updateCreateStampPreview();
  };
  $('csItalic').onclick = () => {
    csState.italic = !csState.italic;
    $('csItalic').classList.toggle('active', csState.italic);
    updateCreateStampPreview();
  };
  $('csUnderline').onclick = () => {
    csState.underline = !csState.underline;
    $('csUnderline').classList.toggle('active', csState.underline);
    updateCreateStampPreview();
  };
  document.querySelectorAll('#csTextColorRow .pswatch').forEach((b) => {
    b.onclick = () => {
      csState.textColor = b.dataset.color;
      $('csTextColor').value = b.dataset.color;
      updateCreateStampPreview();
    };
  });
  $('csTextColor').oninput = (e) => {
    csState.textColor = e.target.value;
    updateCreateStampPreview();
  };
  $('csTextColorClear').onclick = () => {
    csState.textColor = '#000000';
    $('csTextColor').value = '#000000';
    updateCreateStampPreview();
  };
  document.querySelectorAll('#csBgColorRow .pswatch').forEach((b) => {
    b.onclick = () => {
      csState.bgColor = b.dataset.bg;
      $('csBgColor').value = b.dataset.bg;
      updateCreateStampPreview();
    };
  });
  $('csBgColor').oninput = (e) => {
    csState.bgColor = e.target.value;
    updateCreateStampPreview();
  };
  $('csBgClear').onclick = () => {
    csState.bgColor = null;
    updateCreateStampPreview();
  };
  $('csBorderStyle').onchange = (e) => {
    csState.borderStyle = e.target.value;
    updateCreateStampPreview();
  };
  $('csBorderColor').oninput = (e) => {
    csState.borderColor = e.target.value;
    updateCreateStampPreview();
  };
  $('csBorderWidth').oninput = (e) => {
    const v = parseInt(e.target.value);
    csState.borderWidth = isNaN(v) ? 0 : Math.max(0, Math.min(10, v));
    updateCreateStampPreview();
  };
  $('csFontSize').oninput = (e) => {
    const v = parseInt(e.target.value);
    csState.fontSize = isNaN(v) ? 24 : Math.max(8, Math.min(96, v));
    updateCreateStampPreview();
  };
  $('csUsernameVal').oninput = (e) => {
    csState.timestamp.usernameVal = e.target.value;
    updateCreateStampPreview();
  };
  $('csDateFormat').onchange = (e) => {
    csState.timestamp.dateFormat = e.target.value;
    updateCreateStampPreview();
  };
  $('csTimeFormat').onchange = (e) => {
    csState.timestamp.timeFormat = e.target.value;
    updateCreateStampPreview();
  };
  // ===== Stamp KIND picker (text vs image) =====
  document.querySelectorAll('input[name="csKind"]').forEach((r) => {
    r.onchange = () => {
      csState.kind = r.value === 'image' ? 'image' : 'text';
      $('csTextField').hidden = csState.kind === 'image';
      $('csImageField').hidden = csState.kind === 'text';
      // Hide the entire text-styling block (font, colors, border, tokens,
      // text size) when the user picks "Image stamp" — none of those
      // controls apply to an uploaded logo / scanned stamp.
      $('csTextOnlyFields').hidden = csState.kind === 'image';
      updateCreateStampPreview();
    };
  });
  // ===== Image upload =====
  const imgDrop = $('csImageDrop');
  const imgInput = $('csImageInput');
  const imgPrev = $('csImagePreview');
  const imgEmpty = $('csImageEmpty');
  const imgInfo = $('csImageInfo');
  const imgRepl = $('csImageReplace');
  const imgClear = $('csImageClear');
  function loadStampImageFromFile(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      showToast('Please choose an image file (PNG / JPG / SVG / WebP).', 'warn');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result;
      const probe = new Image();
      probe.onload = () => {
        csState.image = { dataURL, w: probe.naturalWidth, h: probe.naturalHeight, name: file.name };
        imgPrev.src = dataURL;
        imgPrev.hidden = false;
        imgEmpty.hidden = true;
        imgRepl.hidden = false;
        imgClear.hidden = false;
        imgInfo.textContent = `${file.name} · ${probe.naturalWidth}×${probe.naturalHeight}`;
        updateCreateStampPreview();
      };
      probe.onerror = () => showToast("That image couldn't be read.", 'error');
      probe.src = dataURL;
    };
    reader.onerror = () => showToast(window.t('toast.readFail', 'Could not read the file.'), 'error');
    reader.readAsDataURL(file);
  }
  imgDrop.onclick = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    imgInput.click();
  };
  imgInput.onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) loadStampImageFromFile(f);
  };
  imgRepl.onclick = (e) => {
    e.preventDefault();
    imgInput.click();
  };
  imgClear.onclick = (e) => {
    e.preventDefault();
    csState.image = null;
    imgPrev.src = '';
    imgPrev.hidden = true;
    imgEmpty.hidden = false;
    imgRepl.hidden = true;
    imgClear.hidden = true;
    imgInfo.textContent = '';
    updateCreateStampPreview();
  };
  // Drag-and-drop support
  ['dragenter', 'dragover'].forEach((ev) =>
    imgDrop.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      imgDrop.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    imgDrop.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      imgDrop.classList.remove('dragover');
    })
  );
  imgDrop.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadStampImageFromFile(file);
  });
  $('csCreate').onclick = () => {
    // === IMAGE STAMP path ===
    if (csState.kind === 'image') {
      if (!csState.image || !csState.image.dataURL) {
        showToast(window.t('cs.imageRequired', 'Choose an image first (or switch to Text stamp).'), 'warn');
        return;
      }
      // Save to library if requested. Image stamps store the dataURL.
      if ($('csSaveLib').checked) {
        const list = loadCustomStamps();
        list.push({
          id: 'custom-img-' + Date.now(),
          _kind: 'image',
          dataURL: csState.image.dataURL,
          w: csState.image.w,
          h: csState.image.h,
          name: csState.image.name || 'Image stamp',
        });
        saveCustomStamps(list);
      }
      closeCreateStampModal();
      const pos = pickInsertPos();
      if (!pos) return;
      // Cap the inserted size so a 4000×3000 px logo doesn't fill the page.
      const maxW = 200; // CSS px
      const ratio = csState.image.h / Math.max(1, csState.image.w);
      const insertW = Math.min(maxW, csState.image.w);
      const insertH = insertW * ratio;
      addImageAnnotation({ ...pos, x: pos.x, y: pos.y }, csState.image.dataURL, 'image/png');
      // addImageAnnotation sets its own width/height from the natural size;
      // resize the just-added annotation down to insertW/insertH so the user
      // doesn't get a giant image.
      const last = annotations[annotations.length - 1];
      if (last && last.type === 'image' && last.el) {
        last.width = insertW;
        last.height = insertH;
        last.el.style.width = insertW + 'px';
        last.el.style.height = insertH + 'px';
      }
      showToast(
        window.t('toast.stampImageInserted', 'Image stamp inserted — drag a corner to resize.'),
        'success'
      );
      return;
    }
    // === TEXT STAMP path (existing) ===
    const tpl = (csState.template || '').replace(/^\s+|\s+$/g, '');
    if (!tpl) {
      showToast(window.t('cs.contentRequired', 'Stamp content is required.'), 'warn');
      return;
    }
    const stampTpl = buildStampTemplateFromState();
    // Save to library if requested — keep the template (with tokens) so the
    // tokens re-resolve to *now* whenever the stamp is later inserted.
    if ($('csSaveLib').checked) {
      const list = loadCustomStamps();
      list.push(Object.assign({}, stampTpl, { id: 'custom-' + Date.now() }));
      saveCustomStamps(list);
    }
    closeCreateStampModal();
    const pos = pickInsertPos();
    if (!pos) return;
    // Resolve tokens against the *current* moment for the inserted stamp.
    const resolvedText = resolveStampTemplate(csState.template, {
      usernameVal: csState.timestamp.usernameVal,
      dateFormat: csState.timestamp.dateFormat,
      timeFormat: csState.timestamp.timeFormat,
    });
    createStampAnnotation(pos, Object.assign({}, stampTpl, { text: resolvedText }));
    showToast(window.t('toast.stampSimpleInserted', 'Stamp inserted.'), 'success');
  };
}
function buildStampTemplateFromState() {
  return {
    // Store BOTH the raw template (with {USER}/{DATE}/{TIME} tokens) and the
    // currently-resolved text. Insertion uses the template when present so
    // saved custom stamps stay dynamic — each insertion re-stamps with the
    // moment's date / time, not the moment the stamp was first authored.
    text: csState.template,
    template: csState.template,
    fontFamily: csState.fontFamily,
    fontSize: csState.fontSize,
    bold: csState.bold,
    italic: csState.italic,
    underline: csState.underline,
    textColor: csState.textColor,
    bgColor: csState.bgColor,
    borderColor: csState.borderColor,
    borderStyle: csState.borderStyle,
    borderWidth: csState.borderWidth,
    borderRadius: 8,
    paddingX: 16,
    paddingY: 8,
    timestamp: Object.assign({}, csState.timestamp),
  };
}
function updateCreateStampPreview() {
  const box = document.getElementById('createStampPreviewBox');
  // === IMAGE STAMP preview ===
  if (csState.kind === 'image' && csState.image && csState.image.dataURL) {
    box.textContent = '';
    box.style.cssText = ''; // wipe text-stamp styles
    box.style.background = 'transparent';
    box.style.border = 'none';
    box.style.padding = '0';
    box.style.display = 'inline-flex';
    // Render the image inside the preview box — sized so it always fits
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = csState.image.dataURL;
    img.style.cssText =
      'max-width:100%;max-height:240px;object-fit:contain;background:repeating-conic-gradient(#f4f4f5 0% 25%, #ffffff 0% 50%) 50%/14px 14px;border-radius:6px;';
    box.appendChild(img);
    return;
  }
  // === TEXT STAMP preview ===
  box.innerHTML = '';
  // Resolve the template with a placeholder fallback so the preview never
  // shows a literal "{USER}" when the user has cleared the username field.
  const resolved = resolveStampTemplate(csState.template || '', {
    usernamePlaceholder: true,
    usernameVal: csState.timestamp.usernameVal,
    dateFormat: csState.timestamp.dateFormat,
    timeFormat: csState.timestamp.timeFormat,
  });
  // Use whitespace="pre-line" via textContent so newlines render as breaks
  // and the preview EXACTLY matches what the stamp will render.
  box.textContent = resolved || 'Stamp content';
  box.style.color = csState.textColor;
  box.style.background = csState.bgColor || 'transparent';
  box.style.border =
    csState.borderStyle && csState.borderStyle !== 'none' && csState.borderWidth > 0
      ? `${csState.borderWidth}px ${csState.borderStyle} ${csState.borderColor}`
      : 'none';
  box.style.borderRadius = '8px';
  box.style.padding = '8px 16px';
  box.style.fontWeight = csState.bold ? '700' : '500';
  box.style.fontStyle = csState.italic ? 'italic' : 'normal';
  box.style.textDecoration = csState.underline ? 'underline' : 'none';
  box.style.fontSize = csState.fontSize + 'px';
  // Same CSS font stack the actual stamp uses (applyStampStyles).
  box.style.fontFamily =
    csState.fontFamily === 'Times-Roman'
      ? 'Times, "Times New Roman", serif'
      : csState.fontFamily === 'Courier'
        ? '"Courier New", Courier, monospace'
        : 'Helvetica, Arial, sans-serif';
}
