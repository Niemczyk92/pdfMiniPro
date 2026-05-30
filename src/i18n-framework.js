/* === i18n framework ===
     Translation tables live in window.I18N_DICT (populated later in the page).
     Lookup order: current-lang → EN → fallback arg → key string itself.
     HTML elements opt in via data-i18n, data-i18n-html, data-i18n-title,
     data-i18n-aria, data-i18n-placeholder, data-i18n-value. */
window.I18N_SUPPORTED = ['EN', 'CZ', 'PL', 'ES'];
window.I18N_STORAGE_KEY = 'pdfMini.lang';
window.I18N_DICT = { EN: {}, CZ: {}, PL: {}, ES: {} };
window.detectBrowserLang = function () {
  // Walk `navigator.languages` (ordered list of user preferences) and return
  // the first one that maps to a supported language. Browsers may set this
  // to e.g. ['cs', 'en-US'] for a Czech speaker who also accepts English —
  // we honor their first preference, not the system default.
  const list =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || 'en'];
  for (let i = 0; i < list.length; i++) {
    const raw = (list[i] || '').toLowerCase();
    if (raw.startsWith('cs') || raw.startsWith('cz') || raw.startsWith('sk')) return 'CZ';
    if (raw.startsWith('pl')) return 'PL';
    if (raw.startsWith('es') || raw.startsWith('ca') || raw.startsWith('gl')) return 'ES';
    if (raw.startsWith('en')) return 'EN';
  }
  return 'EN';
};
window.getCurrentLang = function () {
  const stored = localStorage.getItem(window.I18N_STORAGE_KEY);
  if (stored && window.I18N_SUPPORTED.includes(stored)) return stored;
  return window.detectBrowserLang();
};
window.setCurrentLang = function (lang) {
  if (!window.I18N_SUPPORTED.includes(lang)) lang = 'EN';
  localStorage.setItem(window.I18N_STORAGE_KEY, lang);
  document.documentElement.lang = lang.toLowerCase();
  if (typeof window.applyTranslations === 'function') window.applyTranslations();
  try {
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  } catch (_) {}
};
window.t = function (key, fallback) {
  const lang = window.getCurrentLang();
  const dict = window.I18N_DICT;
  if (dict[lang] && dict[lang][key] != null) return dict[lang][key];
  if (dict.EN && dict.EN[key] != null) return dict.EN[key];
  return fallback != null ? fallback : key;
};
window.applyTranslations = function (root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(function (el) {
    const k = el.getAttribute('data-i18n');
    const tr = window.t(k, null);
    if (tr != null) el.textContent = tr;
  });
  root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    const k = el.getAttribute('data-i18n-html');
    const tr = window.t(k, null);
    if (tr != null) el.innerHTML = tr;
  });
  ['title', 'aria-label', 'placeholder', 'value', 'alt', 'label'].forEach(function (attr) {
    const dataKey = 'data-i18n-' + (attr === 'aria-label' ? 'aria' : attr);
    root.querySelectorAll('[' + dataKey + ']').forEach(function (el) {
      const k = el.getAttribute(dataKey);
      const tr = window.t(k, null);
      if (tr != null) el.setAttribute(attr, tr);
    });
  });
};
document.documentElement.lang = window.getCurrentLang().toLowerCase();
// Apply the saved UI mode (Simple / Pro) before paint so Pro tools don't
// flash visible in Simple mode on every page load.
try {
  const m = localStorage.getItem('pdfMini.uiMode') || 'pro';
  document.documentElement.setAttribute('data-ui-mode', m);
} catch (_) {}
window.applyUiMode = function (mode) {
  if (mode !== 'simple') mode = 'pro';
  document.documentElement.setAttribute('data-ui-mode', mode);
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    window.applyTranslations();
  });
} else {
  window.applyTranslations();
}
