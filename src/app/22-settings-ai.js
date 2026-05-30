// =====================================================================
// =====================  SETTINGS — Backup / AI / Errors  =============
// =====================================================================
const SETTINGS_BACKUP_KEY = 'settings-backup-v1';
const SETTINGS_BACKUP_LS_KEYS = [
  'theme',
  'pdfMiniPro.toolUsage.v1',
  'pdfMini.profile.v1',
  'pdfMini.signatures.v1',
  'pdfMini.customStamps.v1',
  'pdfMini.onboardedVersion',
  'pdfMiniPro.recentColors.v1',
  'pdfMiniPro_templates',
  'pdfMiniPro.ai.v1',
  'pdfMiniPro.quickPanel.v1',
  'pdfMiniPro.errorLog.v1',
];
function _settingsSnapshot() {
  const snap = {};
  for (const k of SETTINGS_BACKUP_LS_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) snap[k] = v;
  }
  return { v: 1, ts: Date.now(), data: snap };
}
async function saveSettingsBackup() {
  try {
    const snap = _settingsSnapshot();
    await idbPut(SETTINGS_BACKUP_KEY, snap);
  } catch (e) {
    console.warn('[backup] save failed:', e);
  }
}
async function loadSettingsBackup() {
  try {
    return await idbGet(SETTINGS_BACKUP_KEY);
  } catch (e) {
    return null;
  }
}
async function restoreSettingsBackup(snap) {
  if (!snap || !snap.data) return false;
  for (const k of Object.keys(snap.data)) {
    try {
      localStorage.setItem(k, snap.data[k]);
    } catch (_) {}
  }
  return true;
}
function debouncedAutoBackup() {
  if (window._autoBackupTimer) clearTimeout(window._autoBackupTimer);
  window._autoBackupTimer = setTimeout(saveSettingsBackup, 2500);
}
// Hook localStorage writes to debounce a backup. We monkey-patch setItem so any
// future caller (current or new) triggers a snapshot without explicit wiring.
const _origLocalSet = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (k, v) {
  const r = _origLocalSet(k, v);
  if (SETTINGS_BACKUP_LS_KEYS.includes(k)) debouncedAutoBackup();
  return r;
};
// On first run after a fresh install (no localStorage profile), offer restore
async function maybeOfferBackupRestore() {
  // Don't prompt if user already has data
  const haveProfile = !!localStorage.getItem('pdfMini.profile.v1');
  const haveSigs = !!localStorage.getItem('pdfMini.signatures.v1');
  const haveStamps = !!localStorage.getItem('pdfMini.customStamps.v1');
  if (haveProfile || haveSigs || haveStamps) return;
  const snap = await loadSettingsBackup();
  if (!snap || !snap.data) return;
  const hasUseful = [
    'pdfMini.profile.v1',
    'pdfMini.signatures.v1',
    'pdfMini.customStamps.v1',
    'pdfMiniPro_templates',
  ].some((k) => snap.data[k]);
  if (!hasUseful) return;
  setTimeout(() => {
    if (
      confirm(
        'A previous backup of your profile, signatures, stamps and templates was found. Restore it now?'
      )
    ) {
      restoreSettingsBackup(snap).then(() => {
        showToast('Settings restored from local backup.', 'success');
        setTimeout(() => location.reload(), 600);
      });
    }
  }, 1000);
}

// ----- Error log -----
const ERR_LOG_KEY = 'pdfMiniPro.errorLog.v1';
const ERR_LOG_MAX = 50;
function getErrorLog() {
  try {
    return JSON.parse(localStorage.getItem(ERR_LOG_KEY) || '[]');
  } catch (_) {
    return [];
  }
}
function logError(entry) {
  try {
    const list = getErrorLog();
    list.unshift(Object.assign({ ts: new Date().toISOString() }, entry));
    if (list.length > ERR_LOG_MAX) list.length = ERR_LOG_MAX;
    localStorage.setItem(ERR_LOG_KEY, JSON.stringify(list));
  } catch (_) {}
}
window.addEventListener('error', (e) => {
  logError({
    type: 'error',
    msg: String(e.message || ''),
    src: (e.filename || '').split('/').pop() + ':' + (e.lineno || '?') + ':' + (e.colno || '?'),
    stack: e.error && e.error.stack ? String(e.error.stack).split('\n').slice(0, 8).join('\n') : '',
  });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason || {};
  logError({
    type: 'unhandledrejection',
    msg: String(reason.message || reason),
    stack: reason.stack ? String(reason.stack).split('\n').slice(0, 8).join('\n') : '',
  });
});

// ----- AI configuration -----
const AI_CONFIG_KEY = 'pdfMiniPro.ai.v1';
let aiConfig = (() => {
  try {
    return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || 'null') || {};
  } catch (_) {
    return {};
  }
})();
let aiAvailable = false;
function saveAiConfig() {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(aiConfig));
  } catch (_) {}
}
// Build a list of candidate API URLs given whatever base the user typed. We
// try OpenAI-compatible variants AND Ollama's native /api/chat as a fallback.
// On success we remember the working URL on aiConfig.resolvedUrl so future calls
// skip the probe.
function _aiCandidateUrls(baseUrl) {
  let base = (baseUrl || '').trim().replace(/\/+$/, '');
  // Strip a trailing /chat/completions or /api/chat the user may have pasted whole
  base = base.replace(/\/(v1\/)?chat\/completions$/, '').replace(/\/api\/(chat|generate)$/, '');
  const out = [];
  // If the user already specified /v1, honour it first
  if (/\/v1$/.test(base)) {
    out.push({ url: base + '/chat/completions', flavour: 'openai' });
  } else {
    // Try /v1/chat/completions first (most common: Ollama with OPENAI_BASE, LM Studio, vLLM, llama.cpp)
    out.push({ url: base + '/v1/chat/completions', flavour: 'openai' });
    // Then no /v1 (some servers expose directly at root)
    out.push({ url: base + '/chat/completions', flavour: 'openai' });
  }
  // Finally Ollama-native
  out.push({ url: base + '/api/chat', flavour: 'ollama' });
  return out;
}
function _aiOpenAiBody(model, messages, opts) {
  return {
    model: model || 'auto',
    messages,
    max_tokens: (opts && opts.maxTokens) || 800,
    temperature: opts && opts.temperature != null ? opts.temperature : 0.3,
    stream: false,
  };
}
function _aiOllamaBody(model, messages, opts) {
  return {
    model: model || 'llama3',
    messages,
    options: {
      num_predict: (opts && opts.maxTokens) || 800,
      temperature: opts && opts.temperature != null ? opts.temperature : 0.3,
    },
    stream: false,
  };
}
function _aiExtractReply(j, flavour) {
  if (!j) return '';
  if (flavour === 'ollama') return (j.message && j.message.content) || j.response || '';
  // openai
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}
async function _aiPost(candidate, model, messages, opts, timeoutMs) {
  const body =
    candidate.flavour === 'ollama'
      ? _aiOllamaBody(model, messages, opts)
      : _aiOpenAiBody(model, messages, opts);
  const headers = { 'Content-Type': 'application/json' };
  if (aiConfig.apiKey) headers['Authorization'] = 'Bearer ' + aiConfig.apiKey;
  const ctrl = new AbortController();
  const tid = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(candidate.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return r;
  } finally {
    if (tid) clearTimeout(tid);
  }
}

async function aiTestConnection() {
  if (!aiConfig.baseUrl) return { ok: false, err: 'No base URL configured.' };
  const candidates = _aiCandidateUrls(aiConfig.baseUrl);
  dbg('[ai] testing candidates:', candidates.map((c) => c.url).join(', '));
  const tried = [];
  for (const cand of candidates) {
    try {
      const r = await _aiPost(
        cand,
        aiConfig.model,
        [{ role: 'user', content: 'ping' }],
        { maxTokens: 4 },
        8000
      );
      if (r.ok) {
        const j = await r.json().catch(() => null);
        aiConfig.resolvedUrl = cand.url;
        aiConfig.flavour = cand.flavour;
        return {
          ok: true,
          model: (j && j.model) || aiConfig.model || '(unknown)',
          url: cand.url,
          flavour: cand.flavour,
        };
      }
      tried.push(
        cand.url + ' → HTTP ' + r.status + (r.status === 405 ? ' (POST not accepted at this path)' : '')
      );
    } catch (e) {
      tried.push(cand.url + ' → ' + (e.name === 'AbortError' ? 'timeout' : e.message || String(e)));
    }
  }
  // Common-cause hints based on the LAST failure
  let hint = '';
  if (tried.some((t) => /HTTP 405/.test(t))) {
    hint =
      " — 405 means the URL exists but doesn't accept POST. Try a base URL like http://host:port (without /v1 — we'll add it).";
  } else if (tried.some((t) => /HTTP 404/.test(t))) {
    hint = ' — 404 means no chat endpoint at any tried path. Double-check the host & port.';
  } else if (tried.some((t) => /CORS|fetch|NetworkError|Failed to fetch/i.test(t))) {
    hint =
      ' — looks like a CORS / network issue. For Ollama set OLLAMA_ORIGINS="*" before starting, or use LM Studio\'s "CORS" toggle.';
  }
  return { ok: false, err: 'All endpoints failed.' + hint + '\nTried:\n' + tried.join('\n') };
}

async function aiChat(messages, opts) {
  if (!aiAvailable) throw new Error('AI not connected.');
  // Use the URL discovered at connect time; if missing, re-probe.
  if (!aiConfig.resolvedUrl) {
    const r = await aiTestConnection();
    if (!r.ok) throw new Error(r.err);
  }
  const cand = { url: aiConfig.resolvedUrl, flavour: aiConfig.flavour || 'openai' };
  const r = await _aiPost(cand, aiConfig.model, messages, opts, 0);
  if (!r.ok) throw new Error('AI HTTP ' + r.status + ' (' + cand.url + ')');
  const j = await r.json();
  return _aiExtractReply(j, cand.flavour);
}
async function refreshAiAvailability() {
  if (!aiConfig.baseUrl) {
    aiAvailable = false;
    aiConfig.resolvedUrl = null;
    aiConfig.flavour = null;
    updateAiVisibility();
    return false;
  }
  const r = await aiTestConnection();
  aiAvailable = !!r.ok;
  updateAiVisibility();
  return aiAvailable;
}
function updateAiVisibility() {
  document.documentElement.classList.toggle('ai-connected', aiAvailable);
}
// Periodic AI health check — if the user's local LLM goes offline mid-session,
// hide the AI menu within ~60s instead of waiting for a page reload. Cheap probe
// because aiTestConnection() has an 8s timeout and we only run it every 60s.
setInterval(() => {
  if (aiConfig && aiConfig.baseUrl) refreshAiAvailability();
}, 60 * 1000);

// ----- Settings modal wiring -----
function openSettingsModal() {
  document.getElementById('settingsModal').classList.add('show');
  refreshSettingsStatus();
  showSettingsTab('backup');
}
function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}
function showSettingsTab(tab) {
  document
    .querySelectorAll('.settings-tab')
    .forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.settings-pane').forEach((p) => (p.hidden = p.dataset.pane !== tab));
  if (tab === 'errors') populateErrorLog();
  if (tab === 'ai') populateAiForm();
  if (tab === 'about') populateAbout();
  if (tab === 'language') populateLangSelect();
}
function populateLangSelect() {
  const sel = document.getElementById('langSelect');
  if (!sel) return;
  sel.value = window.getCurrentLang();
}
async function refreshSettingsStatus() {
  const snap = await loadSettingsBackup();
  const el = document.getElementById('backupStatus');
  if (!el) return;
  if (snap && snap.ts) {
    const d = new Date(snap.ts);
    const keys = snap.data ? Object.keys(snap.data).length : 0;
    el.className = 'settings-status ok';
    el.textContent =
      window.t('settings.backup.lastSnap', 'Last snapshot:') +
      ' ' +
      d.toLocaleString() +
      ' · ' +
      keys +
      ' ' +
      window.t('settings.backup.keys', 'key(s) backed up.');
  } else {
    el.className = 'settings-status warn';
    el.textContent = window.t(
      'settings.backup.noneYet',
      'No snapshot yet. Click "Snapshot now" to make one.'
    );
  }
}
function populateAiForm() {
  document.getElementById('aiBaseUrl').value = aiConfig.baseUrl || '';
  document.getElementById('aiApiKey').value = aiConfig.apiKey || '';
  document.getElementById('aiModel').value = aiConfig.model || '';
  const s = document.getElementById('aiStatus');
  if (aiAvailable) {
    s.className = 'settings-status ok';
    s.textContent =
      window.t('settings.ai.connected', 'Connected · model') +
      ' ' +
      (aiConfig.model || window.t('settings.ai.auto', '(auto)'));
  } else if (aiConfig.baseUrl) {
    s.className = 'settings-status warn';
    s.textContent = window.t('settings.ai.unreachable', 'Configured but not reachable.');
  } else {
    s.className = 'settings-status';
    s.textContent = window.t('settings.ai.notConfigured', 'Not configured.');
  }
}
function populateErrorLog() {
  const list = getErrorLog();
  const view = document.getElementById('errLogView');
  const status = document.getElementById('errLogStatus');
  if (!list.length) {
    status.className = 'settings-status ok';
    status.textContent = window.t('settings.err.none', 'No errors logged.');
    view.value = '';
    return;
  }
  status.className = 'settings-status warn';
  const tplKey = list.length === 1 ? 'settings.err.countOne' : 'settings.err.countMany';
  const tpl = window.t(
    tplKey,
    list.length === 1 ? '{n} entry (newest first).' : '{n} entries (newest first).'
  );
  status.textContent = tpl.replace('{n}', list.length);
  view.value = list
    .map(
      (e) => `[${e.ts}] ${e.type}: ${e.msg}\n  ${e.src || ''}\n  ${(e.stack || '').replace(/\n/g, '\n  ')}`
    )
    .join('\n\n');
}
function populateAbout() {
  document.getElementById('aboutVersion').textContent =
    typeof APP_VERSION !== 'undefined' ? APP_VERSION : '—';
  // Determine SW version from /sw.js content (best-effort; falls back to —)
  fetch('./sw.js')
    .then((r) => r.text())
    .then((t) => {
      const m = t.match(/pdf-mini-editor-pro-v(\d+)/);
      document.getElementById('aboutSw').textContent = m ? 'v' + m[1] : '—';
    })
    .catch(() => {});
  // Privacy line is conditional — without AI everything is fully local; with
  // AI configured, PDF text + selections are sent to the AI server the user
  // configured. We name the host explicitly so it's transparent.
  const line = document.getElementById('aboutPrivacyLine');
  if (line) {
    if (aiAvailable && aiConfig && aiConfig.baseUrl) {
      let host = '(your AI server)';
      try {
        host = new URL(aiConfig.baseUrl).host || aiConfig.baseUrl;
      } catch (_) {}
      line.style.borderLeftColor = '#f59e0b';
      line.innerHTML = window
        .t(
          'settings.about.privacyAi',
          '⚠ <strong>AI is connected.</strong> When you use the AI menu (Summarize, Translate, Explain, Form-fill suggestions), PDF text and your selection are sent to <strong>{host}</strong>. Everything else (drawing, editing, saving) stays local to this device. To go fully offline, disconnect AI in Settings → AI.'
        )
        .replace('{host}', host);
    } else {
      line.style.borderLeftColor = '#10b981';
      line.innerHTML = window.t(
        'settings.about.privacyOff',
        '🔒 <strong>Fully offline mode.</strong> No data leaves this device — drawing, editing, saving, and form-filling all run locally. (Connect a local AI server in Settings → AI to enable Summarize / Translate / Explain features; until then those features are hidden.)'
      );
    }
  }
}

// ----- Wire up settings UI -----
(function () {
  const _settingsBtn = document.getElementById('settingsBtn');
  if (_settingsBtn) _settingsBtn.addEventListener('click', openSettingsModal);
  const _closeBtn = document.getElementById('settingsClose');
  if (_closeBtn) _closeBtn.addEventListener('click', closeSettingsModal);
  const _doneBtn = document.getElementById('settingsDone');
  if (_doneBtn) _doneBtn.addEventListener('click', closeSettingsModal);
  const _settingsModal = document.getElementById('settingsModal');
  if (_settingsModal)
    _settingsModal.addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') closeSettingsModal();
    });
  document.querySelectorAll('.settings-tab').forEach((t) => {
    t.addEventListener('click', () => showSettingsTab(t.dataset.tab));
  });

  // Language picker — apply immediately on change, persist to localStorage.
  const _langSel = document.getElementById('langSelect');
  if (_langSel) {
    _langSel.value = window.getCurrentLang();
    _langSel.addEventListener('change', () => {
      window.setCurrentLang(_langSel.value);
      try {
        showToast(window.t('toast.langChanged', 'Language updated.'), 'success');
      } catch (_) {}
    });
  }
  // UI mode (Simple / Pro) — toggles .pro-tool visibility globally.
  const _uiModeSel = document.getElementById('uiModeSelect');
  if (_uiModeSel) {
    const saved = localStorage.getItem('pdfMini.uiMode') || 'pro';
    _uiModeSel.value = saved;
    applyUiMode(saved);
    _uiModeSel.addEventListener('change', () => {
      const mode = _uiModeSel.value;
      localStorage.setItem('pdfMini.uiMode', mode);
      applyUiMode(mode);
      try {
        showToast(window.t('toast.uiModeChanged', 'Interface updated.'), 'success');
      } catch (_) {}
    });
  }
  // Re-render dynamic JS-built strings on language change so they don't keep stale text.
  window.addEventListener('langchange', () => {
    try {
      refreshSettingsStatus();
    } catch (_) {}
    try {
      populateAiForm();
    } catch (_) {}
    try {
      populateErrorLog();
    } catch (_) {}
    try {
      populateAbout();
    } catch (_) {}
    // Re-render stamp galleries (standard stamp text is locale-dependent)
    try {
      if (
        typeof renderStampsGrids === 'function' &&
        document.getElementById('stampsModal').classList.contains('show')
      )
        renderStampsGrids();
    } catch (_) {}
    // Re-render help modal section titles
    try {
      if (
        typeof renderHelpModal === 'function' &&
        document.getElementById('helpModal').classList.contains('show')
      )
        renderHelpModal();
    } catch (_) {}
    // Re-render context bar (uses dynamic showContext text)
    try {
      if (typeof updateContextHint === 'function') updateContextHint();
    } catch (_) {}
  });

  // Backup actions
  document.getElementById('backupNowBtn').addEventListener('click', async () => {
    await saveSettingsBackup();
    showToast('Snapshot saved.', 'success');
    refreshSettingsStatus();
  });
  document.getElementById('backupRestoreBtn').addEventListener('click', async () => {
    const snap = await loadSettingsBackup();
    if (!snap || !snap.data) {
      showToast('No snapshot to restore.', 'warn');
      return;
    }
    if (!confirm('Restore settings from the local snapshot? Current localStorage will be overwritten.'))
      return;
    await restoreSettingsBackup(snap);
    showToast('Settings restored — reloading…', 'success');
    setTimeout(() => location.reload(), 600);
  });
  document.getElementById('settingsExportBtn').addEventListener('click', async () => {
    const snap = _settingsSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'pdfminipro-settings.json');
    showToast('Settings exported.', 'success');
  });
  document.getElementById('settingsImportInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const text = await f.text();
      const snap = JSON.parse(text);
      if (!snap || !snap.data) throw new Error('Bad file format.');
      if (!confirm('Import will overwrite current localStorage. Continue?')) return;
      await restoreSettingsBackup(snap);
      showToast('Settings imported — reloading…', 'success');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      showToast('Import failed: ' + (err.message || err), 'error');
    }
  });
  document.getElementById('settingsResetBtn').addEventListener('click', () => {
    if (!confirm('Wipe profile, signatures, stamps, templates, AI config, and preferences from this device?'))
      return;
    for (const k of SETTINGS_BACKUP_LS_KEYS) localStorage.removeItem(k);
    showToast('Local settings cleared — reloading…', 'success');
    setTimeout(() => location.reload(), 600);
  });

  // AI actions
  document.getElementById('aiSaveBtn').addEventListener('click', async () => {
    aiConfig.baseUrl = document.getElementById('aiBaseUrl').value.trim();
    aiConfig.apiKey = document.getElementById('aiApiKey').value.trim();
    aiConfig.model = document.getElementById('aiModel').value.trim();
    saveAiConfig();
    await refreshAiAvailability();
    populateAiForm();
    showToast('AI config saved.', 'success');
  });
  document.getElementById('aiTestBtn').addEventListener('click', async () => {
    aiConfig.baseUrl = document.getElementById('aiBaseUrl').value.trim();
    aiConfig.apiKey = document.getElementById('aiApiKey').value.trim();
    aiConfig.model = document.getElementById('aiModel').value.trim();
    aiConfig.resolvedUrl = null; // re-probe
    aiConfig.flavour = null;
    const s = document.getElementById('aiStatus');
    s.className = 'settings-status';
    s.textContent = 'Probing…';
    const r = await aiTestConnection();
    if (r.ok) {
      s.className = 'settings-status ok';
      s.textContent =
        'OK · ' +
        (r.flavour === 'ollama' ? 'Ollama-native' : 'OpenAI-compat') +
        ' · model: ' +
        (r.model || '?') +
        '\n→ ' +
        r.url;
      s.style.whiteSpace = 'pre-line';
      aiAvailable = true;
      saveAiConfig();
    } else {
      s.className = 'settings-status err';
      s.textContent = 'Failed:\n' + r.err;
      s.style.whiteSpace = 'pre-line';
      aiAvailable = false;
    }
    updateAiVisibility();
  });
  document.getElementById('aiClearBtn').addEventListener('click', () => {
    if (!confirm('Disconnect AI?')) return;
    aiConfig = {};
    saveAiConfig();
    aiAvailable = false;
    updateAiVisibility();
    populateAiForm();
    showToast('AI disconnected.', 'success');
  });

  // Error log actions
  document.getElementById('errLogRefreshBtn').addEventListener('click', populateErrorLog);
  document.getElementById('errLogClearBtn').addEventListener('click', () => {
    if (!confirm('Clear all logged errors?')) return;
    localStorage.removeItem(ERR_LOG_KEY);
    populateErrorLog();
  });
  document.getElementById('errLogCopyBtn').addEventListener('click', () => {
    const t = document.getElementById('errLogView').value;
    if (!t) {
      showToast('Log is empty.', 'warn');
      return;
    }
    navigator.clipboard.writeText(t).then(() => showToast('Log copied.', 'success'));
  });

  // Bug report
  function buildBugMailto() {
    const to = document.getElementById('bugRecipient').value.trim() || 'support@kamagio.com';
    const body = document.getElementById('bugBody').value || '';
    const attachLog = document.getElementById('bugAttachLog').checked;
    let bodyParts = [
      'Describe the issue:',
      body || '(please write what you were doing)',
      '',
      '--- system info ---',
      'App version: ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '—'),
      'User agent: ' + navigator.userAgent,
      'URL: ' + location.href,
    ];
    if (attachLog) {
      const log = document.getElementById('errLogView').value || '(no errors logged)';
      bodyParts.push('', '--- error log ---', log);
    }
    const fullBody = bodyParts.join('\n');
    return { to, subject: '[PDF Mini Pro] Bug report / feedback', body: fullBody };
  }
  document.getElementById('bugSendBtn').addEventListener('click', () => {
    const m = buildBugMailto();
    const href =
      'mailto:' +
      encodeURIComponent(m.to) +
      '?subject=' +
      encodeURIComponent(m.subject) +
      '&body=' +
      encodeURIComponent(m.body);
    if (href.length > 1800) {
      // Some mail clients truncate long URLs; fall back to copy
      navigator.clipboard.writeText(m.body).then(() => {
        showToast('Body too long for mail link — copied to clipboard instead.', 'warn');
      });
      return;
    }
    location.href = href;
  });
  document.getElementById('bugCopyBtn').addEventListener('click', () => {
    const m = buildBugMailto();
    navigator.clipboard
      .writeText('To: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.body)
      .then(() => showToast('Bug body copied to clipboard.', 'success'));
  });

  // About — SW actions
  document.getElementById('swUpdateBtn').addEventListener('click', async () => {
    if (!navigator.serviceWorker) {
      showToast('No service worker on this browser.', 'warn');
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      showToast('No service worker registered.', 'warn');
      return;
    }
    await reg.update();
    showToast(
      'Update check sent. New version (if any) will install in background — reload to activate.',
      'success'
    );
  });
  document.getElementById('swClearBtn').addEventListener('click', async () => {
    if (!('caches' in window)) {
      showToast('Cache API unavailable.', 'warn');
      return;
    }
    if (!confirm('Clear cached app assets? Next reload will re-fetch everything.')) return;
    const names = await caches.keys();
    for (const n of names) await caches.delete(n);
    showToast('Cache cleared — reloading…', 'success');
    setTimeout(() => location.reload(), 600);
  });
})();

// ----- AI feature actions -----
async function extractPdfPlainText(maxChars) {
  if (!pdfJsDoc) return '';
  maxChars = maxChars || 12000;
  let out = '';
  for (let pi = 1; pi <= pdfJsDoc.numPages && out.length < maxChars; pi++) {
    try {
      const page = await pdfJsDoc.getPage(pi);
      const tc = await page.getTextContent();
      out += '\n--- Page ' + pi + ' ---\n';
      for (const item of tc.items) {
        if (item.str) out += item.str + (item.hasEOL ? '\n' : ' ');
        if (out.length >= maxChars) break;
      }
    } catch (_) {}
  }
  return out.slice(0, maxChars);
}
function getSelectedPdfText() {
  // 1) Text-annotation selection
  if (selected && selected.type === 'text' && Array.isArray(selected.lines)) {
    return selected.lines
      .map((line) => line.map((s) => s.text || '').join(''))
      .join('\n')
      .trim();
  }
  // 2) Native browser text selection within the PDF text layer
  try {
    const s = window.getSelection();
    const t = (s && s.toString()) || '';
    if (t.trim()) return t.trim();
  } catch (_) {}
  return '';
}
function openAiResponseModal(title) {
  document.getElementById('aiRespTitle').textContent = title || 'AI Result';
  document.getElementById('aiRespBody').textContent = 'Thinking…';
  document.getElementById('aiRespMeta').textContent = '';
  document.getElementById('aiRespInsert').hidden = true;
  document.getElementById('aiResponseModal').classList.add('show');
}
function setAiResponse(text, opts) {
  document.getElementById('aiRespBody').textContent = text;
  document.getElementById('aiRespMeta').textContent = (opts && opts.meta) || '';
  document.getElementById('aiRespInsert').hidden = !(opts && opts.canInsert);
}
async function aiAction(systemPrompt, userPrompt, title, canInsert) {
  if (!aiAvailable) {
    showToast('AI not connected — set it up in Settings → AI.', 'warn');
    return;
  }
  openAiResponseModal(title);
  const started = Date.now();
  try {
    const text = await aiChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 700, temperature: 0.25 }
    );
    setAiResponse((text || '(empty response)').trim(), {
      meta: `model ${aiConfig.model || 'auto'} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
      canInsert: !!canInsert,
    });
  } catch (e) {
    setAiResponse('Error: ' + (e.message || e), { meta: '' });
  }
}
(function wireAiFeatures() {
  const sumBtn = document.getElementById('aiSummarizeBtn');
  if (sumBtn)
    sumBtn.addEventListener('click', async () => {
      closeAllDropdowns();
      if (!pdfJsDoc) {
        showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
        return;
      }
      const text = await extractPdfPlainText(12000);
      if (!text.trim()) {
        showToast('No extractable text in this PDF.', 'warn');
        return;
      }
      aiAction(
        'You summarise PDF documents in clear, neutral prose. 5-8 sentences total. Keep numbers and names verbatim.',
        'Summarise this PDF:\n\n' + text,
        'Summary',
        true
      );
    });
  const trBtn = document.getElementById('aiTranslateBtn');
  if (trBtn)
    trBtn.addEventListener('click', () => {
      closeAllDropdowns();
      const sel = getSelectedPdfText();
      if (!sel) {
        showToast('Select a text annotation or highlight text in the PDF first.', 'warn');
        return;
      }
      const target = prompt('Translate to which language? (e.g. English, Czech, German, Polish)', 'English');
      if (!target) return;
      aiAction(
        'You translate text precisely. Output only the translation, no preamble.',
        'Translate the following to ' + target + ':\n\n' + sel,
        'Translation → ' + target,
        true
      );
    });
  const exBtn = document.getElementById('aiExplainBtn');
  if (exBtn)
    exBtn.addEventListener('click', () => {
      closeAllDropdowns();
      const sel = getSelectedPdfText();
      if (!sel) {
        showToast('Select a text annotation or highlight a paragraph first.', 'warn');
        return;
      }
      aiAction(
        'You explain technical or legal paragraphs in plain language. 3-5 sentences. Define jargon. Keep it factual.',
        'Explain this paragraph in plain language:\n\n' + sel,
        'Explanation',
        true
      );
    });
  const ffBtn = document.getElementById('aiFormFillBtn');
  if (ffBtn)
    ffBtn.addEventListener('click', async () => {
      closeAllDropdowns();
      if (!acroFormFields || !acroFormFields.length) {
        showToast('No form fields detected on this PDF.', 'warn');
        return;
      }
      const ctx = await extractPdfPlainText(6000);
      const fields = acroFormFields.map((f) => '- ' + f.fieldName + ' (' + f.type + ')').join('\n');
      aiAction(
        'You suggest sensible fill-in values for PDF form fields based on document context. Output as: FieldName: suggested value. Skip fields you cannot infer. Be concise.',
        'PDF context (first 6000 chars):\n' + ctx + '\n\nForm fields to suggest values for:\n' + fields,
        'Fill-in suggestions'
      );
    });
  // Modal close + actions
  const _aiClose = document.getElementById('aiRespClose');
  if (_aiClose)
    _aiClose.addEventListener('click', () =>
      document.getElementById('aiResponseModal').classList.remove('show')
    );
  const _aiDone = document.getElementById('aiRespDone');
  if (_aiDone)
    _aiDone.addEventListener('click', () =>
      document.getElementById('aiResponseModal').classList.remove('show')
    );
  const _aiCopy = document.getElementById('aiRespCopy');
  if (_aiCopy)
    _aiCopy.addEventListener('click', () => {
      const t = document.getElementById('aiRespBody').textContent;
      navigator.clipboard.writeText(t).then(() => showToast('Copied.', 'success'));
    });
  const _aiInsert = document.getElementById('aiRespInsert');
  if (_aiInsert)
    _aiInsert.addEventListener('click', () => {
      const t = document.getElementById('aiRespBody').textContent;
      if (!t || !pdfJsDoc) return;
      // Use first overlay as drop target
      const overlay = document.querySelector('.overlay');
      if (!overlay) return;
      // Programmatic paste: stuff into the clipboard helper
      pdfMiniClipboard = [];
      // Create a text annotation directly
      const pageNum = parseInt(overlay.closest('.page-wrapper').dataset.pageNum);
      const el = document.createElement('div');
      el.className = 'annotation text-annotation';
      el.style.left = '32px';
      el.style.top = '32px';
      overlay.appendChild(el);
      const ann = {
        type: 'text',
        pageNum,
        x: 32,
        y: 32,
        lines: t
          .split('\n')
          .map((line) => [{ text: line, color: '#000000', bold: false, italic: false, underline: false }]),
        fontSize: 14,
        fontFamily: 'Helvetica',
        lineHeight: 1.3,
        align: 'left',
        noBackground: false,
        width: 360,
        height: 30,
        el,
      };
      annotations.push(ann);
      renderTextAnnotation(ann);
      ann.width = el.offsetWidth;
      ann.height = el.offsetHeight;
      enableTextDrag(el, ann);
      addTextHandles(el, ann);
      el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
      select(ann);
      pushHistory('ai-insert');
      updateAnnotCount();
      document.getElementById('aiResponseModal').classList.remove('show');
      showToast('AI response inserted on page 1. Drag to position.', 'success');
    });
  const _aiResModal = document.getElementById('aiResponseModal');
  if (_aiResModal)
    _aiResModal.addEventListener('click', (e) => {
      if (e.target.id === 'aiResponseModal') _aiResModal.classList.remove('show');
    });
  // Dropdown trigger
  const aiDD = document.getElementById('aiDropdown');
  if (aiDD) {
    const trig = aiDD.querySelector('.btn');
    if (trig)
      trig.addEventListener('click', async (e) => {
        // Fast path: open immediately so UI is responsive
        toggleDropdown('aiDropdown', e);
        // Then re-check in the background. If the server has gone down since
        // last check, hide the menu and tell the user.
        const stillUp = await refreshAiAvailability();
        if (!stillUp) {
          closeAllDropdowns();
          showToast('AI server is no longer reachable — menu hidden. Re-test in Settings → AI.', 'warn');
        }
      });
  }
})();

// ============== AI CHAT WITH PDF (floating panel) ====================
// Lets the user ask natural-language questions about the loaded PDF. Each
// answer is followed by a "Jump to page N" pill that scrolls the viewer
// to the page the AI cited as its source.
(function wireAiChat() {
  const fab = document.getElementById('aiChatFab');
  const panel = document.getElementById('aiChatPanel');
  const body = document.getElementById('aiChatBody');
  const input = document.getElementById('aiChatInput');
  const sendBt = document.getElementById('aiChatSend');
  const closeB = document.getElementById('aiChatClose');
  const clearB = document.getElementById('aiChatClear');
  if (!fab || !panel) return;

  // Conversation history (just for context window; not persisted across reloads).
  const history = [];

  function appendUser(text) {
    const m = document.createElement('div');
    m.className = 'aichat-msg user';
    m.textContent = text;
    // Drop the empty-state placeholder first time we add a real message.
    const empty = body.querySelector('.aichat-empty');
    if (empty) empty.remove();
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
  }
  function appendBot(text, sourcePage) {
    const m = document.createElement('div');
    m.className = 'aichat-msg bot';
    m.textContent = text;
    if (sourcePage && pdfJsDoc && sourcePage >= 1 && sourcePage <= pdfJsDoc.numPages) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'aichat-jump';
      jump.textContent = '↗ Jump to page ' + sourcePage;
      jump.onclick = () => jumpToPage(sourcePage);
      const wrap = document.createElement('div');
      wrap.appendChild(m);
      wrap.appendChild(jump);
      wrap.style.alignSelf = 'flex-start';
      wrap.style.maxWidth = '88%';
      m.style.maxWidth = '100%';
      body.appendChild(wrap);
    } else {
      body.appendChild(m);
    }
    body.scrollTop = body.scrollHeight;
  }
  function appendThinking() {
    const m = document.createElement('div');
    m.className = 'aichat-msg bot thinking';
    m.textContent = 'Thinking…';
    m.dataset.thinking = '1';
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }
  function jumpToPage(pageNum) {
    const wrapper = document.querySelector('.page-wrapper[data-page-num="' + pageNum + '"]');
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Build a per-page text snapshot to send as context. We label pages so the
  // model can cite which page it's drawing from.
  async function buildPdfContext(maxChars) {
    maxChars = maxChars || 14000;
    if (!pdfJsDoc) return '';
    let out = '';
    for (let pi = 1; pi <= pdfJsDoc.numPages && out.length < maxChars; pi++) {
      try {
        const page = await pdfJsDoc.getPage(pi);
        const tc = await page.getTextContent();
        out += '\n=== PAGE ' + pi + ' ===\n';
        for (const item of tc.items) {
          if (item.str) out += item.str + (item.hasEOL ? '\n' : ' ');
          if (out.length >= maxChars) break;
        }
        page.cleanup && page.cleanup();
      } catch (_) {}
    }
    return out.slice(0, maxChars);
  }
  // Parse out a "SOURCE_PAGE: N" or "Source: page N" hint the model emitted.
  // Returns { text, page } — text has the hint stripped from the visible reply.
  function parseSource(reply) {
    if (!reply) return { text: '', page: null };
    let page = null;
    let text = reply;
    const re = /^[ \t]*(?:source[_\s-]*page|source)\s*[:=]\s*(?:page\s*)?(\d{1,4})\s*$/im;
    const m = text.match(re);
    if (m) {
      page = parseInt(m[1], 10);
      text = text.replace(re, '').trim();
    }
    // Also strip a trailing "(page N)" mention if the model added that style.
    return { text, page };
  }

  async function ask() {
    const q = (input.value || '').trim();
    if (!q) return;
    if (!aiAvailable) {
      showToast('AI not connected — set it up in Settings → AI.', 'warn');
      return;
    }
    if (!pdfJsDoc) {
      showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
      return;
    }
    input.value = '';
    input.style.height = 'auto';
    appendUser(q);
    sendBt.disabled = true;
    const thinking = appendThinking();
    try {
      const ctx = await buildPdfContext(14000);
      const sys =
        'You answer questions about a PDF the user has open. Use ONLY the PDF content below to answer. ' +
        'If the answer is not in the PDF, say "Not found in this PDF." ' +
        'After your answer, on the LAST line, write exactly: SOURCE_PAGE: N — where N is the page number you drew the answer from (1-based). ' +
        'If multiple pages contributed, pick the most relevant one.\n\n' +
        '--- PDF CONTENT START ---\n' +
        ctx +
        '\n--- PDF CONTENT END ---';
      const msgs = [{ role: 'system', content: sys }];
      // Light prior context — last 4 turns to keep the prompt small.
      for (const h of history.slice(-4)) msgs.push(h);
      msgs.push({ role: 'user', content: q });
      const reply = await aiChat(msgs, { maxTokens: 600, temperature: 0.2 });
      thinking.remove();
      const { text, page } = parseSource(reply);
      const finalText = text || '(no answer)';
      appendBot(finalText, page);
      history.push({ role: 'user', content: q });
      history.push({ role: 'assistant', content: finalText });
      // Auto-jump the viewer to the cited page.
      if (page && pdfJsDoc && page >= 1 && page <= pdfJsDoc.numPages) {
        setTimeout(() => jumpToPage(page), 250);
      }
    } catch (e) {
      thinking.remove();
      appendBot('Error: ' + (e.message || e), null);
    } finally {
      sendBt.disabled = false;
      input.focus();
    }
  }

  fab.addEventListener('click', async () => {
    // Re-check before showing — same pattern as the AI dropdown.
    if (!panel.classList.contains('show')) {
      panel.classList.add('show');
      input.focus();
      const stillUp = await refreshAiAvailability();
      if (!stillUp) {
        panel.classList.remove('show');
        showToast('AI server not reachable — re-test in Settings → AI.', 'warn');
      }
    } else {
      panel.classList.remove('show');
    }
  });
  closeB.addEventListener('click', () => panel.classList.remove('show'));
  clearB.addEventListener('click', () => {
    history.length = 0;
    body.innerHTML =
      '<div class="aichat-empty">Ask a question about the open PDF and I\'ll answer using its contents. The viewer will jump to the page the answer came from.</div>';
  });
  sendBt.addEventListener('click', ask);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  });
  // Auto-grow the textarea (cheap; capped via max-height in CSS).
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(120, input.scrollHeight) + 'px';
  });
})();

