// =====================================================================
// =====  COMMAND PALETTE  =============================================
// Spotlight-style action search (Ctrl+K / Cmd+K). One flat registry of
// commands, each with localized labels + keyword aliases so users can find
// an action by typing the Czech / Polish / Spanish name. Up/Down arrows
// move the highlight, Enter runs, Esc closes. Click also runs.
// =====================================================================
// Each entry: { id, icon, labelKey, label, kbd?, cat?, keywordsKey?,
// run: () => {} }. labelKey/keywordsKey go through t(); the inline label is
// the EN fallback. cat is a tiny tag shown on the right of the row.
const CMD_PALETTE = [
  {
    id: 'open',
    icon: '📂',
    labelKey: 'cmd.open',
    label: 'Open PDF',
    kbd: 'Ctrl+O',
    cat: 'File',
    keywordsKey: 'cmd.open.kw',
    run: () => document.getElementById('fileInput')?.click(),
  },
  {
    id: 'new',
    icon: '📄',
    labelKey: 'cmd.new',
    label: 'New blank PDF',
    cat: 'File',
    keywordsKey: 'cmd.new.kw',
    run: () => document.getElementById('newPdfBtn')?.click(),
  },
  {
    id: 'save',
    icon: '⬇',
    labelKey: 'cmd.save',
    label: 'Save PDF',
    kbd: 'Ctrl+S',
    cat: 'File',
    run: () => document.getElementById('saveBtn')?.click(),
  },
  {
    id: 'print',
    icon: '🖨',
    labelKey: 'cmd.print',
    label: 'Print',
    kbd: 'Ctrl+P',
    cat: 'File',
    run: () => document.getElementById('printBtnMenu')?.click(),
  },
  {
    id: 'export',
    icon: '⤓',
    labelKey: 'cmd.export',
    label: 'Export as…',
    cat: 'File',
    run: () => document.getElementById('exportBtnMenu')?.click(),
  },
  {
    id: 'share',
    icon: '✉',
    labelKey: 'cmd.share',
    label: 'Share by email…',
    cat: 'File',
    run: () => document.getElementById('shareBtnMenu')?.click(),
  },

  {
    id: 'undo',
    icon: '↶',
    labelKey: 'cmd.undo',
    label: 'Undo',
    kbd: 'Ctrl+Z',
    cat: 'Edit',
    run: () => doUndo(),
  },
  {
    id: 'redo',
    icon: '↷',
    labelKey: 'cmd.redo',
    label: 'Redo',
    kbd: 'Ctrl+Y',
    cat: 'Edit',
    run: () => doRedo(),
  },
  {
    id: 'clear',
    icon: '✕',
    labelKey: 'cmd.clear',
    label: 'Clear all edits',
    cat: 'Edit',
    run: () => document.getElementById('clearBtnMenu')?.click(),
  },

  {
    id: 'tool-text',
    icon: 'T',
    labelKey: 'cmd.text',
    label: 'Add text',
    cat: 'Add',
    keywordsKey: 'cmd.text.kw',
    run: () => setTool('text'),
  },
  {
    id: 'tool-image',
    icon: '🖼',
    labelKey: 'cmd.image',
    label: 'Insert image',
    cat: 'Add',
    run: () => document.getElementById('imgInput')?.click(),
  },
  {
    id: 'tool-draw',
    icon: '✏',
    labelKey: 'cmd.draw',
    label: 'Free draw',
    cat: 'Add',
    run: () => setTool('draw'),
  },
  {
    id: 'tool-edit',
    icon: '✎',
    labelKey: 'cmd.editPdf',
    label: 'Edit PDF text',
    cat: 'Add',
    keywordsKey: 'cmd.editPdf.kw',
    run: () => setTool('edit-pdf'),
  },
  {
    id: 'tool-highlight',
    icon: '▓',
    labelKey: 'cmd.highlight',
    label: 'Highlight text',
    cat: 'Add',
    run: () => setTool('highlight'),
  },
  {
    id: 'tool-underline',
    icon: 'U̲',
    labelKey: 'cmd.underline',
    label: 'Underline text',
    cat: 'Add',
    run: () => setTool('underline'),
  },
  {
    id: 'tool-strike',
    icon: 'S̶',
    labelKey: 'cmd.strike',
    label: 'Strike-through text',
    cat: 'Add',
    run: () => setTool('strike'),
  },
  {
    id: 'tool-redact',
    icon: '▮',
    labelKey: 'cmd.redact',
    label: 'Redact (black out)',
    cat: 'Add',
    run: () => setTool('redact'),
  },

  {
    id: 'stamps',
    icon: '⊟',
    labelKey: 'cmd.stamps',
    label: 'Stamps gallery',
    cat: 'Insert',
    run: () => document.getElementById('stampsBtnMenu')?.click(),
  },
  {
    id: 'signature',
    icon: '✍',
    labelKey: 'cmd.sig',
    label: 'Add signature',
    cat: 'Insert',
    run: () => document.getElementById('signatureBtnMenu')?.click(),
  },
  {
    id: 'qr',
    icon: '▦',
    labelKey: 'cmd.qr',
    label: 'QR / Barcode generator',
    cat: 'Insert',
    keywordsKey: 'cmd.qr.kw',
    run: () => document.getElementById('qrBarcodeBtnMenu')?.click(),
  },

  {
    id: 'pages',
    icon: '⊞',
    labelKey: 'cmd.pages',
    label: 'Organize pages',
    cat: 'Doc',
    run: () => document.getElementById('organizeBtn')?.click(),
  },
  {
    id: 'page-setup',
    icon: '📰',
    labelKey: 'cmd.pageSetup',
    label: 'Page Setup (header / footer / watermark)',
    cat: 'Doc',
    run: () => document.getElementById('pageSetupBtnMenu')?.click(),
  },
  {
    id: 'crop',
    icon: '✂',
    labelKey: 'cmd.crop',
    label: 'Crop / Resize / Margins',
    cat: 'Doc',
    run: () => document.getElementById('cropBtnMenu')?.click(),
  },
  {
    id: 'bookmarks',
    icon: '🔖',
    labelKey: 'cmd.bm',
    label: 'Bookmarks / Outline',
    cat: 'Doc',
    run: () => document.getElementById('bookmarksBtnMenu')?.click(),
  },
  {
    id: 'templates',
    icon: '📋',
    labelKey: 'cmd.tpl',
    label: 'Templates',
    cat: 'Doc',
    run: () => document.getElementById('templatesBtnMenu')?.click(),
  },

  {
    id: 'find',
    icon: '🔎',
    labelKey: 'cmd.find',
    label: 'Find & Replace',
    kbd: 'Ctrl+F',
    cat: 'Search',
    run: () => document.getElementById('findBtnMenu')?.click(),
  },
  {
    id: 'ocr',
    icon: '📄',
    labelKey: 'cmd.ocr',
    label: 'OCR scanned PDF',
    cat: 'Search',
    run: () => document.getElementById('ocrBtnMenu')?.click(),
  },

  {
    id: 'password',
    icon: '🔒',
    labelKey: 'cmd.password',
    label: 'Password protect',
    cat: 'Security',
    run: () => document.getElementById('passwordBtnMenu')?.click(),
  },
  {
    id: 'sanitize',
    icon: '🧼',
    labelKey: 'cmd.sanitize',
    label: 'Sanitize document',
    cat: 'Security',
    run: () => document.getElementById('sanitizeBtnMenu')?.click(),
  },
  {
    id: 'regex',
    icon: '🛡',
    labelKey: 'cmd.regex',
    label: 'RegEx redact',
    cat: 'Security',
    run: () => document.getElementById('regexRedactBtnMenu')?.click(),
  },

  {
    id: 'diff',
    icon: '⇄',
    labelKey: 'cmd.diff',
    label: 'Compare two PDFs',
    cat: 'Tools',
    run: () => document.getElementById('diffBtnMenu')?.click(),
  },
  {
    id: 'table',
    icon: '⊞',
    labelKey: 'cmd.table',
    label: 'Extract table → CSV',
    cat: 'Tools',
    run: () => document.getElementById('tableExtractBtnMenu')?.click(),
  },
  {
    id: 'jsonfill',
    icon: '{ }',
    labelKey: 'cmd.jsonFill',
    label: 'Fill form from JSON',
    cat: 'Tools',
    run: () => document.getElementById('jsonFillBtnMenu')?.click(),
  },

  {
    id: 'stats',
    icon: '📊',
    labelKey: 'cmd.stats',
    label: 'Document statistics',
    cat: 'App',
    run: () => openStatsModal(),
  },
  {
    id: 'metadata',
    icon: 'ℹ️',
    labelKey: 'cmd.metadata',
    label: 'PDF metadata (title, author, dates…)',
    cat: 'App',
    run: () => openStatsModal(),
  },
  {
    id: 'field',
    icon: '📝',
    labelKey: 'cmd.field',
    label: 'Form field (text / checkbox)',
    cat: 'Tools',
    run: () => setTool('field'),
  },
  {
    id: 'profile',
    icon: '👤',
    labelKey: 'cmd.profile',
    label: 'Your profile',
    cat: 'App',
    run: () => document.getElementById('profileBtn')?.click(),
  },
  {
    id: 'settings',
    icon: '⚙',
    labelKey: 'cmd.settings',
    label: 'Settings',
    cat: 'App',
    keywordsKey: 'cmd.settings.kw',
    run: () => openSettingsModal(),
  },
  {
    id: 'language',
    icon: '🌐',
    labelKey: 'cmd.lang',
    label: 'Change language',
    cat: 'App',
    keywordsKey: 'cmd.lang.kw',
    run: () => {
      openSettingsModal();
      setTimeout(() => showSettingsTab('language'), 50);
    },
  },
  {
    id: 'help',
    icon: '❓',
    labelKey: 'cmd.help',
    label: 'Help / Manual',
    cat: 'App',
    run: () => document.getElementById('helpBtn')?.click(),
  },
  {
    id: 'theme',
    icon: '🌓',
    labelKey: 'cmd.theme',
    label: 'Toggle light / dark mode',
    cat: 'App',
    run: () => document.getElementById('themeToggle')?.click(),
  },
];

let _cpFiltered = [];
let _cpActiveIdx = 0;
function openCommandPalette() {
  const overlay = document.getElementById('cmdPalette');
  if (!overlay) return;
  const input = document.getElementById('cpInput');
  input.value = '';
  _cpActiveIdx = 0;
  _renderCmdPalette('');
  overlay.classList.add('show');
  setTimeout(() => input.focus(), 30);
}
function closeCommandPalette() {
  document.getElementById('cmdPalette')?.classList.remove('show');
}
// Fuzzy: every search char must appear (in order) in the target. Returns
// a score (higher = better) or -1 for no match.
function _cpFuzzyScore(q, target) {
  q = q.toLowerCase();
  target = (target || '').toLowerCase();
  if (!q) return 1;
  if (target.includes(q)) return 1000 - target.indexOf(q); // contiguous wins
  let qi = 0,
    score = 0,
    lastIdx = -1,
    streak = 0;
  for (let i = 0; i < target.length && qi < q.length; i++) {
    if (target[i] === q[qi]) {
      score += lastIdx === i - 1 ? 10 + streak : 2;
      streak = lastIdx === i - 1 ? streak + 1 : 1;
      lastIdx = i;
      qi++;
    }
  }
  return qi === q.length ? score : -1;
}
function _renderCmdPalette(query) {
  const list = document.getElementById('cpList');
  if (!list) return;
  const q = (query || '').trim();
  const scored = CMD_PALETTE.map((c) => {
    const label = window.t(c.labelKey, c.label);
    const keywords = c.keywordsKey ? window.t(c.keywordsKey, '') : '';
    const cat = c.cat || '';
    const haystack = label + ' ' + keywords + ' ' + cat;
    let score = _cpFuzzyScore(q, haystack);
    // Boost label-prefix hits
    if (score > 0 && label.toLowerCase().startsWith(q.toLowerCase())) score += 5000;
    return { cmd: c, label, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  _cpFiltered = scored.map((x) => x.cmd);
  if (_cpActiveIdx >= _cpFiltered.length) _cpActiveIdx = 0;
  if (!_cpFiltered.length) {
    list.innerHTML = '<div class="cp-empty">' + window.t('cp.empty', 'No matches.') + '</div>';
    return;
  }
  list.innerHTML = scored
    .map((x, i) => {
      const c = x.cmd;
      const kbd = c.kbd ? `<span class="cp-item-kbd">${c.kbd}</span>` : '';
      const cat = c.cat ? `<span class="cp-item-cat">${window.t('cp.cat.' + c.cat, c.cat)}</span>` : '';
      return `<div class="cp-item${i === _cpActiveIdx ? ' active' : ''}" data-idx="${i}">
      <span class="cp-item-icon">${c.icon || ''}</span>
      <span class="cp-item-label">${x.label}</span>
      ${cat}
      ${kbd}
    </div>`;
    })
    .join('');
  // Wire clicks
  list.querySelectorAll('.cp-item').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      _runCmdPaletteAt(idx);
    });
    el.addEventListener('mouseenter', () => {
      _cpActiveIdx = parseInt(el.dataset.idx);
      list.querySelectorAll('.cp-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
    });
  });
}
function _runCmdPaletteAt(idx) {
  const c = _cpFiltered[idx];
  if (!c) return;
  closeCommandPalette();
  try {
    c.run();
  } catch (e) {
    console.warn('[cmd-palette] run failed for', c.id, e);
  }
}
// Wire input / keyboard / overlay-click once
(function _wireCmdPalette() {
  const overlay = document.getElementById('cmdPalette');
  const input = document.getElementById('cpInput');
  if (!overlay || !input) return;
  const launcher = document.getElementById('cmdPaletteBtn');
  if (launcher) launcher.addEventListener('click', openCommandPalette);
  input.addEventListener('input', () => _renderCmdPalette(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      _runCmdPaletteAt(_cpActiveIdx);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cpActiveIdx = Math.min(_cpFiltered.length - 1, _cpActiveIdx + 1);
      _renderCmdPalette(input.value);
      // Scroll into view
      const el = document.querySelector('.cp-item.active');
      if (el) el.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cpActiveIdx = Math.max(0, _cpActiveIdx - 1);
      _renderCmdPalette(input.value);
      const el = document.querySelector('.cp-item.active');
      if (el) el.scrollIntoView({ block: 'nearest' });
      return;
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCommandPalette();
  });
})();

// This is just defensive in case we end up with one orphaned at the click site.
function cleanupStrayEmptyText() {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    if (a.type === 'text' && isLinesEmpty(a.lines)) {
      try {
        a.el?.remove();
      } catch (_) {}
      annotations.splice(i, 1);
    }
  }
  updateAnnotCount();
}
