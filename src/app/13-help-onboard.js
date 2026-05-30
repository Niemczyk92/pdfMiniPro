// === HELP MODAL ===
const HELP_SECTIONS = [
  {
    icon: '🚀',
    title: 'Getting started in 60 seconds',
    body: `
    <ol>
      <li><strong>Open</strong> a PDF — click the orange Open button or drag a file onto the page. Also accepts <code>.pdfenc</code> (encrypted) files.</li>
      <li>Pick a tool from the toolbar. Hover any button — every one has a tooltip.</li>
      <li>Work on the PDF. Hit <kbd>Ctrl</kbd>+<kbd>Z</kbd> any time to undo.</li>
      <li>Click <strong>Save PDF</strong> when done. Use the small ▼ next to Save for Export / Print / Clear options. For a locked-down output try <strong>More ▼ → Password protect</strong> or <strong>More ▼ → Sanitize document</strong>.</li>
    </ol>
    <div class="help-tip"><strong>Privacy:</strong> Nothing ever leaves your device — no upload, no analytics, no cookies. The app works fully offline once loaded. AI features (when enabled) talk directly to your own local LLM, never to a third party.</div>
    <div class="help-tip"><strong>Pro tools live in More ▼:</strong> Sanitize document · RegEx redact · Extract table → CSV · Compare two PDFs (diff) · Fill form from JSON · Password protect · Crop / Resize to A4 / Letter / photo dimensions.</div>
  `,
  },
  {
    icon: '🧭',
    title: 'Toolbar layout',
    body: `
    <p>The desktop toolbar is grouped into clear sections:</p>
    <ul>
      <li><strong>Open</strong> — load a PDF (also accepts <code>.pdfenc</code> encrypted files).</li>
      <li><strong>↖ Select / ✎ Edit Text</strong> — selection mode and direct text editing on the PDF.</li>
      <li><strong>＋ Add ▼</strong> — Text, Image, Free Draw, <strong>Shapes ▸</strong> submenu (15 shapes in a grid), Highlight / Underline / Strike / Link / Redact, QR / Barcode, Stamps, Signature.</li>
      <li><strong>⊞ Pages</strong> — reorder, rotate, delete, replace pages.</li>
      <li><strong>＋ Merge PDF · ⤴ Split PDF · ⤓ Compress PDF</strong> — direct toolbar shortcuts (no need to open the Pages dialog).</li>
      <li><strong>⋯ More ▼</strong> — Page Setup, Crop / Resize / Margins, Bookmarks, Templates, <strong>Password protect</strong>, plus Pro tools: <strong>Sanitize · RegEx redact · Extract table → CSV · Compare two PDFs · Fill from JSON</strong>. Search section: Find &amp; Replace, OCR.</li>
      <li><strong>🤖 AI ▼</strong> — only shows when a local AI server is configured and reachable (Settings → AI).</li>
      <li><strong>Style</strong> — quick color and font-size defaults for new text / draws / shapes. A separate floating colour bar appears in Highlight / Underline / Strike modes.</li>
      <li><strong>↶ ↷</strong> — Undo / Redo.</li>
      <li><strong>⬇ Save PDF ▼</strong> — Save (Ctrl+S); the ▼ caret opens Export as… (HQ / Web / Archive), Print, and Clear all edits.</li>
    </ul>
    <div class="help-tip"><strong>On phones / tablets</strong> the toolbar is replaced by a bottom dock and slim top bar — same actions, thumb-friendly. <strong>More</strong> in the dock opens a bottom sheet with every Pro tool.</div>
  `,
  },
  {
    icon: '✎',
    title: 'Editing existing PDF text',
    body: `
    <ol>
      <li>Click <strong>Edit Text</strong> in the toolbar (or just double-click any text in the PDF).</li>
      <li>The clicked text becomes a white-out plus an editable annotation matching font &amp; baseline.</li>
      <li>Type your replacement. Format with the floating props panel (B / I / U, color, size).</li>
      <li><kbd>Enter</kbd> or click outside to commit; <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line; <kbd>Esc</kbd> + <kbd>Ctrl</kbd>+<kbd>Z</kbd> to abort.</li>
    </ol>
    <div class="help-tip"><strong>Heads up:</strong> If a page has rotation baked into the PDF, Edit Text may misalign with the visible orientation. On rotated pages, prefer <strong>＋ Add → Text</strong>.</div>
    <div class="help-tip"><strong>Czech / Polish characters:</strong> the standard PDF fonts (Helvetica / Times / Courier) only support Latin-1. Accented letters like ň / ř / ć are automatically transliterated on save so the document never fails to write. For perfect diacritics, embed your text as an image, or insert it with the Stamp builder.</div>
  `,
  },
  {
    icon: 'T',
    title: 'Adding new content',
    body: `
    <p>All of these live under the <strong>＋ Add ▼</strong> menu:</p>
    <ul>
      <li><strong>Text</strong> — click anywhere on the PDF; type. <kbd>Enter</kbd> commits, <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a new line. The new annotation stays selected so you can immediately drag corners to resize or use the rotation puck — same as pasted clipboard text.</li>
      <li><strong>Image</strong> — file picker or just paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>. Drag corners to resize, top handle to rotate. <kbd>Shift</kbd> while resizing breaks aspect ratio. Double-click to replace.</li>
      <li><strong>Free Draw</strong> — pick color + stroke width; draw with mouse / pen / finger.</li>
      <li><strong>Shapes ▸</strong> — fly-out submenu with 15 shapes in 3 groups: Basic (Rectangle, Ellipse, Triangle, Line, Arrow, Double Arrow), Icons (Heart, Star, Lightning, Cloud, Check, Cross), Templates (Checklist, Monthly / Weekly Calendar).</li>
      <li><strong>Highlight / Underline / Strike</strong> — <strong>drag</strong> across PDF text to mark a span, or click a single word. A floating colour bar appears with 8 presets + custom picker. Each tool remembers its own colour.</li>
      <li><strong>Link</strong> — drag a rectangle to define a hyperlink area. Choose a URL or an internal page jump. Real clickable annotation in the saved PDF.</li>
      <li><strong>Redact</strong> — drag a black rectangle. On save, metadata (Title / Author / Subject / Keywords / Producer / Creator) is wiped automatically. For pattern-based bulk redaction see <strong>RegEx redact</strong> in More.</li>
      <li><strong>QR / Barcode</strong> — generate a code (URL, vCard, text…) and insert it as a vector annotation.</li>
      <li><strong>Stamps</strong> — gallery with Standard, Information, Custom tabs. Information stamps use your Profile.</li>
      <li><strong>Signature</strong> — Draw / Type / Upload. "Save for future use" stores it locally. Tick <strong>Strengthen with audit metadata</strong> to bake a tamper-evident stamp into the signature image (SHA-256, timestamp, IP + ISP + city, optional GPS + street address, browser fingerprint, signer identity).</li>
    </ul>
  `,
  },
  {
    icon: '⊞',
    title: 'Pages — reorder, rotate, delete, merge, split, replace',
    body: `
    <p>Click <strong>Pages</strong> to open the Organize dialog. There you can:</p>
    <ul>
      <li>Drag thumbnails to reorder.</li>
      <li><strong>↻</strong> rotate · <strong>🗑</strong> delete · <strong>⤒</strong> replace one page from another PDF.</li>
      <li>Checkbox top-left selects pages for <strong>Export Selected</strong>.</li>
      <li><strong>Apply Changes</strong> commits the new layout. Edits on the page are baked first so they're preserved.</li>
    </ul>
    <p>The toolbar also has direct <strong>＋ Merge PDF</strong>, <strong>⤴ Split PDF</strong> and <strong>⤓ Compress PDF</strong> buttons:</p>
    <ul>
      <li><strong>Merge</strong> — pick another PDF and append its pages.</li>
      <li><strong>Split</strong> — three modes: custom ranges (e.g. <code>1-3, 5, 7-10</code>), every N pages, or one-per-page. Downloads multiple files at once.</li>
      <li><strong>Compress</strong> — rasterises pages at a chosen DPI / JPEG quality.</li>
    </ul>
  `,
  },
  {
    icon: '✂',
    title: 'Crop / Resize / Margins (page normalization)',
    body: `
    <p>More ▼ → <strong>Crop / Resize / Margins</strong>. Two independent flows:</p>
    <p><strong>Margins</strong> — top / right / bottom / left in PDF points. Either set just the CropBox (content outside is hidden) or tick <em>Trim</em> to also set the MediaBox (content outside is removed).</p>
    <p><strong>Normalize page size</strong> — pick a target dimension:</p>
    <ul>
      <li><strong>ISO:</strong> A4 portrait/landscape, A3 portrait/landscape, A5 portrait/landscape.</li>
      <li><strong>US:</strong> Letter portrait/landscape, Legal portrait/landscape, Tabloid, Executive.</li>
      <li><strong>Photo:</strong> 4×6", 5×7", 8×10", 10×15 cm, 13×18 cm.</li>
      <li><strong>Other:</strong> Square 8×8" or 10×10 cm, or fully custom (pt / mm / inches).</li>
    </ul>
    <p>Then choose <strong>Fit</strong> (pad with background colour), <strong>Fill</strong> (crop to cover) or <strong>Stretch</strong> (ignore aspect). Optionally rotate the content 90 / 180 / 270°. Perfect for forcing a phone photo or off-spec scan into a real A4 PDF.</p>
  `,
  },
  {
    icon: '🛠',
    title: 'Page Setup — watermarks, headers, footers, page numbers',
    body: `
    <p>More ▼ → <strong>Page Setup</strong>. Three tabs:</p>
    <ul>
      <li><strong>Header / Footer</strong> — text, position (left/center/right), size, color, page range.</li>
      <li><strong>Page Numbers</strong> — format (e.g. <code>{n} / {total}</code>), position, starting number.</li>
      <li><strong>Watermark</strong> — diagonal big text, opacity, rotation, color.</li>
    </ul>
    <p>Apply produces real annotations you can still adjust or delete before saving.</p>
  `,
  },
  {
    icon: '🔎',
    title: 'Find &amp; Replace',
    body: `
    <p><kbd>Ctrl</kbd>+<kbd>F</kbd> or More ▼ → Find. Case-sensitive / whole-word toggles. Replace one or all. Matches navigate with ↑↓ buttons.</p>
  `,
  },
  {
    icon: '🔖',
    title: 'Bookmarks / Outline editor',
    body: `
    <p>More ▼ → Bookmarks. Existing PDF outline shown read-only (🔒). Add new bookmarks pointing at any page; they're written into the saved PDF's <code>/Outlines</code>.</p>
  `,
  },
  {
    icon: '📋',
    title: 'Templates',
    body: `
    <p>More ▼ → Templates. Save the current set of annotations under a name, then apply them to other PDFs. Stored in localStorage (auto-backed-up).</p>
  `,
  },
  {
    icon: '📄',
    title: 'OCR (scanned / image PDFs)',
    body: `
    <p>More ▼ → OCR. Picks language (eng / ces / deu / pol etc.) and runs Tesseract.js locally. After OCR, scanned pages become editable text. First run downloads the language pack (~10 MB) — works fully offline thereafter.</p>
  `,
  },
  {
    icon: '🤖',
    title: 'AI features (optional, local network)',
    body: `
    <p>Connect a local LLM server (Ollama, llama.cpp, LM Studio, vLLM…) via <strong>Settings → AI</strong>. Once connected, the <strong>🤖 AI ▼</strong> button appears with:</p>
    <ul>
      <li><strong>Summarize this PDF</strong> — 5–8 sentence overview.</li>
      <li><strong>Translate selected text</strong> — pick a target language; selection comes from a text annotation or browser text-selection.</li>
      <li><strong>Explain this paragraph</strong> — plain-language rewrite.</li>
      <li><strong>Suggest form fill-ins</strong> — uses surrounding PDF context to propose values for AcroForm fields.</li>
    </ul>
    <p>Results can be copied to clipboard or inserted as a text annotation. Requests go directly browser → your AI server; no third party involved.</p>
    <div class="help-tip"><strong>CORS:</strong> Local LLM servers must allow cross-origin requests. Most have a <code>--cors</code> or <code>OLLAMA_ORIGINS</code> flag — set it to <code>*</code> on a trusted LAN.</div>
  `,
  },
  {
    icon: '⚡',
    title: 'Quick Actions panel',
    body: `
    <p>The little floating panel on the left lists your most-used tools — including <em>specific</em> stamps (e.g. APPROVED, Business Card) once you've inserted them a few times.</p>
    <ul>
      <li><strong>Drag</strong> the "QUICK" label to move the panel anywhere on screen — its position is remembered.</li>
      <li>Counts of how many times each was used appear in the bottom-right of each item.</li>
    </ul>
  `,
  },
  {
    icon: '🎯',
    title: 'Selection, multi-select, groups, lock',
    body: `
    <ul>
      <li>Click to select. <kbd>Shift</kbd>+click to add/remove from selection. <kbd>Ctrl</kbd>+<kbd>A</kbd> to select all.</li>
      <li>Drag any selected object — all selected siblings move together (alignment guides + snap).</li>
      <li><kbd>Ctrl</kbd>+<kbd>G</kbd> groups selected objects. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroups. Selecting one member selects the whole group.</li>
      <li>🔒 in the props panel <strong>locks</strong> an object: it can't be moved, resized or rotated until unlocked. Click still selects.</li>
      <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> / <kbd>Ctrl</kbd>+<kbd>D</kbd> for copy / paste / duplicate.</li>
    </ul>
  `,
  },
  {
    icon: '👤',
    title: 'Profile &amp; saved signatures',
    body: `
    <ol>
      <li>Click the person icon (top-right). Fill in name, address, phone, email, company.</li>
      <li>Business Card and Address stamps auto-fill from these values.</li>
      <li>Saved signatures live in the same dialog; click 🗑 to remove an old one.</li>
    </ol>
  `,
  },
  {
    icon: '💾',
    title: 'Backup &amp; restore (survives app updates)',
    body: `
    <p>Settings (⚙ icon, top-right) → <strong>Backup</strong>. Every change to profile, signatures, custom stamps, templates and preferences is automatically snapshotted to IndexedDB. After a fresh install / cache wipe, you'll be offered to restore.</p>
    <ul>
      <li><strong>Snapshot now</strong> — immediate manual snapshot.</li>
      <li><strong>Restore from snapshot</strong> — pull the latest snapshot back into localStorage.</li>
      <li><strong>Export settings.json</strong> / <strong>Import settings.json</strong> — move data between devices.</li>
      <li><strong>Clear all local data</strong> — wipes profile / stamps / templates / AI config.</li>
    </ul>
  `,
  },
  {
    icon: '🐞',
    title: 'Errors &amp; bug reports',
    body: `
    <p>Settings → <strong>Errors</strong>. JavaScript errors are captured locally (most recent 50). You can:</p>
    <ul>
      <li>Copy the log to clipboard.</li>
      <li>Open a pre-filled email to the developer with the log attached.</li>
      <li>Clear the log when no longer needed.</li>
    </ul>
    <div class="help-tip"><strong>SMTP:</strong> Direct browser→SMTP isn't possible without a server. The mail-client button works everywhere; for fully automated SMTP delivery you'd add a small relay (Cloudflare Worker / Node) — wireable in this dialog.</div>
  `,
  },
  {
    icon: '🔒',
    title: 'Password protection (.pdfenc)',
    body: `
    <p>More ▼ → <strong>Password protect…</strong>. Wraps the current PDF in an AES-256-GCM envelope derived from your password (PBKDF2 with 250,000 SHA-256 rounds + 16-byte salt + 12-byte IV). Downloads as <code>filename.pdfenc</code>.</p>
    <p>To re-open: drop the <code>.pdfenc</code> onto the page (or use Open) — the app sniffs the <code>PDFMINIE</code> magic header and prompts for the password. Wrong password = clean error, no half-decryption.</p>
    <div class="help-tip"><strong>Privacy:</strong> Encryption is 100% client-side. Your password never leaves the browser, and the encrypted file can't be opened by anyone without it. <strong>There is no recovery</strong> — write down the password.</div>
  `,
  },
  {
    icon: '🧼',
    title: 'Sanitize document',
    body: `
    <p>More ▼ → <strong>Sanitize document</strong>. Three independent toggles:</p>
    <ul>
      <li><strong>Strip metadata</strong> — Title, Author, Subject, Keywords, Producer, Creator, dates, custom Info-dict entries, XMP metadata stream, <code>/Names</code> tree, <code>/OpenAction</code>, <code>/AA</code> (auto-actions). Anything that could leak who-edited-when.</li>
      <li><strong>Flatten annotations</strong> — bakes whiteouts, redactions, highlights, text and signatures into the page content so nothing remains "secretly editable" by the next reader.</li>
      <li><strong>Rasterize</strong> (most aggressive) — every page becomes a JPEG at your chosen DPI (default 150). Destroys selectable text but absolutely guarantees no hidden content survives.</li>
    </ul>
    <p>Output is downloaded as <code>{name}-sanitized.pdf</code>. Use this before sharing externally.</p>
  `,
  },
  {
    icon: '🛡',
    title: 'RegEx redaction (bulk)',
    body: `
    <p>More ▼ → <strong>RegEx redact…</strong>. Permanently remove sensitive data based on a regular expression.</p>
    <p>Built-in presets:</p>
    <ul>
      <li><strong>SSN</strong> — <code>\\b\\d{3}-?\\d{2}-?\\d{4}\\b</code></li>
      <li><strong>Credit card</strong> — <code>\\b(?:\\d[ -]*?){13,19}\\b</code></li>
      <li><strong>Email</strong>, <strong>Phone</strong>, <strong>IBAN</strong>, <strong>Czech rodné č.</strong></li>
    </ul>
    <p>Click <strong>Preview matches</strong> to flash every match in a red outline for 6 seconds. Click <strong>Redact</strong> to drop a black rectangle over each one and hide the underlying text item. Metadata wipe runs automatically on save (because at least one redaction exists).</p>
  `,
  },
  {
    icon: '⇄',
    title: 'Compare two PDFs (diff)',
    body: `
    <p>More ▼ → <strong>Compare two PDFs</strong>. Drop the original and the updated file into the two upload zones. We extract text from both via pdf.js, tokenise it into words, and compute a longest-common-subsequence diff.</p>
    <p>Output: a Git-style inline diff — <ins style="background:#dcfce7;padding:1px 4px;text-decoration:none;color:#14532d">added words on green</ins>, <del style="background:#fecaca;padding:1px 4px;text-decoration:line-through;color:#7f1d1d">removed words on red</del>. Summary line at the top says "X added, Y removed".</p>
    <div class="help-tip"><strong>Limits:</strong> Word-level DP needs O(m·n) memory. Capped at ~2 million cells (roughly 1500 words on each side). For larger documents we show a summary diff instead.</div>
  `,
  },
  {
    icon: '⊞',
    title: 'Extract table → CSV',
    body: `
    <p>More ▼ → <strong>Extract table → CSV</strong>. The cursor changes to crosshair — drag a rectangle around the table on the PDF.</p>
    <p>We collect every text item whose centre lies inside the rectangle, cluster them into rows (by y-coordinate proximity) and columns (by x-coordinate seeding), and emit a CSV. Cells are escaped according to RFC 4180 (quotes / commas / newlines auto-protected).</p>
    <p>Works great on cleanly-formatted PDF tables. Heavily-merged or rotated tables may need a manual cleanup pass.</p>
  `,
  },
  {
    icon: '{ }',
    title: 'Fill forms from JSON',
    body: `
    <p>More ▼ → <strong>Fill form from JSON…</strong>. Paste a JSON object (or an array of objects for batch generation).</p>
    <p>Keys are matched to AcroForm field names with case-insensitive substring matching. Field types we handle:</p>
    <ul>
      <li><strong>Text fields</strong> — <code>setText(String(value))</code></li>
      <li><strong>Check boxes</strong> — truthy / falsy → check / uncheck</li>
      <li><strong>Radio groups / dropdowns / option lists</strong> — <code>select(String(value))</code></li>
    </ul>
    <p>Click <strong>Preview field matches</strong> first to see exactly which JSON key maps to which PDF field before filling. Array input → one filled PDF per record, downloaded as <code>name-filled-01.pdf</code>, <code>name-filled-02.pdf</code>, …</p>
  `,
  },
  {
    icon: '✍',
    title: 'Verifiable signatures (audit metadata)',
    body: `
    <p>In the Signature dialog, tick <strong>Strengthen with audit metadata</strong>. We bake a tamper-evident stamp directly <em>into</em> the signature image — non-removable.</p>
    <p>Stamp contents:</p>
    <ul>
      <li><strong>Signer identity</strong> (optional, remembered locally) — name, role, email, phone.</li>
      <li><strong>Time</strong> — local wall-clock with timezone (e.g. EDT) and the UTC anchor; plus an independent server time from worldtimeapi.org when reachable.</li>
      <li><strong>Document integrity</strong> — SHA-256 of the PDF bytes you're signing.</li>
      <li><strong>Network identity</strong> — IP + ISP from ipapi.co (with ipinfo.io fallback) and a city-level location.</li>
      <li><strong>Optional GPS</strong> — coordinates + an English street address resolved via Nominatim / OpenStreetMap.</li>
      <li><strong>Device fingerprint</strong> — short canvas hash + UA / language / screen.</li>
    </ul>
    <p>Identity + audit data is also written into the PDF Info dictionary on save (Author, Subject, Keywords, plus custom <code>/PDFMini*</code> keys) so any PDF reader's Properties dialog reveals it.</p>
  `,
  },
  {
    icon: '📱',
    title: 'Mobile layout (phones / tablets)',
    body: `
    <p>Below 760 px the desktop chrome is replaced by a touch-friendly UI:</p>
    <ul>
      <li><strong>Top bar</strong> (slim, 50 px): hamburger menu (toggles thumbs panel) · undo · redo · Help · Share · <strong>Download</strong> (primary).</li>
      <li><strong>Bottom dock</strong>: Select · Text · Draw · Image · Shape · Sign · <strong>More</strong>. Tap to switch tool — active tool is highlighted in the accent colour.</li>
      <li><strong>More sheet</strong> — bottom-anchored modal with a 3-column grid: Auto-Fill, Ask AI, Merge, Split, Rearrange, Page numbers, Rotate, Compress, Highlight, OCR, Find, Password.</li>
    </ul>
    <p>Modals (Crop, Page Setup, Find, etc.) auto-shrink to fit the screen and become scrollable.</p>
  `,
  },
  {
    icon: '⌨',
    title: 'Keyboard shortcuts',
    body: `
    <table class="shortcut-table">
      <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
      <tbody>
        <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save PDF</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>P</kbd></td><td>Print PDF</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>F</kbd></td><td>Find &amp; Replace</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Redo</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd></td><td>Copy / Paste / Duplicate selection</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>A</kbd></td><td>Select all objects on page</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd></td><td>Group / Ungroup selected objects</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd></td><td>Zoom in / out / reset</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>\\</kbd></td><td>Toggle side panel (thumbs / outline / bookmarks)</td></tr>
        <tr><td><kbd>Delete</kbd> / <kbd>Backspace</kbd></td><td>Remove selected object(s)</td></tr>
        <tr><td><kbd>Shift</kbd> + click</td><td>Add / remove from selection</td></tr>
        <tr><td><kbd>Alt</kbd> + click (Edit PDF tool)</td><td>Grab whole paragraph as draggable text</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Cancel editing / close modal / deselect</td></tr>
        <tr><td>Double-click</td><td>Edit text / replace image / edit stamp</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>V</kbd> (image / text on clipboard)</td><td>Paste image or rich text onto the PDF</td></tr>
      </tbody>
    </table>
    <div class="help-tip"><strong>Tip:</strong> On Mac use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>.</div>
  `,
  },
];

function renderHelpModal() {
  const root = document.getElementById('helpContent');
  root.innerHTML = '';
  HELP_SECTIONS.forEach((s, idx) => {
    const det = document.createElement('details');
    det.className = 'help-section';
    if (idx === 0) det.open = true;
    const localizedTitle = window.t('help.s.' + idx + '.title', s.title);
    const localizedBody = window.t('help.s.' + idx + '.body', s.body);
    det.innerHTML = `
      <summary><span class="help-icon">${s.icon}</span> ${localizedTitle}</summary>
      <div class="help-body">${localizedBody}</div>
    `;
    root.appendChild(det);
  });
}
function openHelpModal() {
  renderHelpModal();
  document.getElementById('helpModal').classList.add('show');
}
function closeHelpModal() {
  document.getElementById('helpModal').classList.remove('show');
}
document.getElementById('helpBtn').addEventListener('click', openHelpModal);
document.getElementById('helpClose').addEventListener('click', closeHelpModal);
document.getElementById('helpDone').addEventListener('click', closeHelpModal);
document.getElementById('helpModal').addEventListener('click', (e) => {
  if (e.target.id === 'helpModal') closeHelpModal();
});
document.getElementById('helpReplayIntro').addEventListener('click', () => {
  closeHelpModal();
  openOnboarding(true);
});

// === ONBOARDING / WHAT'S NEW ===
const APP_VERSION = '1.84';
const ONBOARD_KEY = 'pdfMini.onboardedVersion';
const ONBOARD_SLIDES = [
  {
    version: '1.0',
    icon: '👋',
    title: 'Welcome to PDF Mini Editor',
    desc: "Edit, sign and assemble PDFs entirely in your browser. Nothing is uploaded — everything stays on this device, even when you're offline.",
  },
  {
    version: '1.0',
    icon: '📂',
    title: 'Open & edit any PDF',
    desc: 'Drag a PDF onto the page or click <strong>Open</strong>. Add text, images, freehand drawings, shapes and more — then <strong>Save</strong> or <strong>Print</strong> when done.',
  },
  {
    version: '1.0',
    icon: '✏',
    title: 'Draw, shape & annotate',
    desc: 'Pick the <strong>Draw</strong> tool for free-hand notes. Use the <strong>Shape</strong> menu for rectangles, ellipses, arrows, hearts, stars and even checklists or mini calendars.',
  },
  {
    version: '1.0',
    icon: '⊟',
    title: 'Stamps & signatures',
    desc: 'Drop classic <strong>APPROVED · DRAFT · CONFIDENTIAL</strong> stamps, or create your own. <strong>Sign</strong> the document by drawing, typing in a handwriting font, or uploading an image of your signature.',
  },
  {
    version: '1.0',
    icon: '⊞',
    title: 'Organize pages',
    desc: 'Reorder pages by drag &amp; drop, rotate, delete, <strong>merge</strong> another PDF, <strong>split</strong> selected pages into a new file, or <strong>compress</strong> the whole document.',
  },
  {
    version: '1.0',
    icon: '👤',
    title: 'Save your profile',
    desc: 'Click the profile icon (top right) to save your name, address and contact info. Business Card and Signature blocks will fill in automatically next time.',
  },
  {
    version: '1.4',
    icon: '✨',
    title: "What's new in 1.4",
    desc: '<strong>Paste text</strong> with Ctrl+V to drop a text block · <strong>Easier rotation</strong> with ↶ ↷ buttons in the props panel · <strong>Double-click</strong> a stamp or signature to edit it · Crisper PDF rendering on high-DPI screens · <strong>Help</strong> button (top right) with the full manual.',
  },
  {
    version: '1.5',
    icon: '🎨',
    title: 'Apple-style toolbar',
    desc: 'A cleaner, easier toolbar grouped into <strong>＋ Add</strong>, <strong>▭ Shape</strong>, <strong>⋯ More</strong> and a split <strong>⬇ Save ▼</strong> button. Bigger touch targets, friendlier for tablet and 60+ users.',
  },
  {
    version: '1.5',
    icon: '🌍',
    title: 'Czech / Polish characters supported',
    desc: "Accented letters like ň, ř, ć no longer crash the PDF save — they're transliterated to their base form so every PDF writes successfully.",
  },
  {
    version: '1.5',
    icon: '📋',
    title: 'Form filling that just works',
    desc: 'Government / XFA-style forms (USCIS, tax docs, etc.) now fill correctly. Every form field becomes a clickable input — type, then Save.',
  },
  {
    version: '1.5',
    icon: '🤖',
    title: 'Optional local AI',
    desc: 'Connect a LAN LLM (Ollama, LM Studio, llama.cpp) in <strong>Settings → AI</strong>. Then you get <strong>Summarise</strong>, <strong>Translate</strong>, <strong>Explain</strong> and <strong>Form fill-in suggestions</strong>. Hidden until connected, never phones home.',
  },
  {
    version: '1.5',
    icon: '💾',
    title: 'Auto-backup of your data',
    desc: "Profile, signatures, custom stamps, templates and preferences are auto-snapshotted to IndexedDB. After an update or cache clear, you'll be offered to restore. Export / import as JSON for new devices.",
  },
  {
    version: '1.5',
    icon: '🐞',
    title: 'Built-in bug reporting',
    desc: 'JavaScript errors are captured locally. <strong>Settings → Errors</strong> lets you copy the log or open a pre-filled bug report email to the developer.',
  },
  {
    version: '1.5',
    icon: '⚡',
    title: 'Smarter Quick panel',
    desc: "The floating quick-action panel now surfaces <em>specific</em> stamps you use (APPROVED, Business Card…) — and it's draggable: pin it wherever you like.",
  },
  {
    version: '1.5',
    icon: '🧰',
    title: 'New annotation tools',
    desc: 'Highlight / Underline / Strike PDF text · clickable Hyperlinks · Page Setup (watermark / header / footer / numbers) · Bookmarks · Crop · Templates · Object groups (Ctrl+G) · Lock objects.',
  },
  // ===== 1.6 =====
  {
    version: '1.6',
    icon: '🚀',
    title: "What's new in 1.6",
    desc: 'A big release: <strong>password protection</strong>, <strong>document sanitization</strong>, <strong>PDF diff</strong>, <strong>table → CSV</strong>, <strong>JSON form fill</strong>, <strong>drag-to-highlight</strong> with a colour picker, <strong>page normalization</strong> (A4 / Letter / photo sizes) and a brand-new <strong>mobile dock</strong>.',
  },
  {
    version: '1.6',
    icon: '🖍',
    title: 'Drag-to-highlight with colour picker',
    desc: 'Highlight, Underline and Strike now work like a real marker: <strong>click and drag</strong> across PDF text to mark a span. A floating colour bar appears with 8 presets (yellow, cyan, green, red, pink, purple, orange, black) plus a custom picker — each tool remembers its own colour.',
  },
  {
    version: '1.6',
    icon: '🔒',
    title: 'Password-protect your PDF',
    desc: 'More ▼ → <strong>Password protect…</strong> wraps the PDF in an AES-256-GCM envelope (PBKDF2, 250k rounds). Downloads as <code>.pdfenc</code>; re-open it with the regular Open button and the app prompts for the password. 100% client-side — your password never leaves the browser.',
  },
  {
    version: '1.6',
    icon: '🧼',
    title: 'Zero-trust sanitization',
    desc: 'More ▼ → <strong>Sanitize document</strong>. Strips PDF metadata (Title, Author, dates, custom Info-dict keys, XMP stream, JavaScript actions), bakes annotations into the page, and optionally rasterises every page. After this, nothing hidden can leak from the file.',
  },
  {
    version: '1.6',
    icon: '🛡',
    title: 'Smart RegEx redaction',
    desc: 'More ▼ → <strong>RegEx redact…</strong>. Pick a preset (SSN, credit card, email, phone, IBAN, CZ rodné číslo) or write your own pattern. Preview every match, then permanently black-bar them. Document metadata is auto-wiped on save when any redaction exists.',
  },
  {
    version: '1.6',
    icon: '⇄',
    title: 'Visual diff between two PDFs',
    desc: 'More ▼ → <strong>Compare two PDFs</strong>. Pick the original and the updated file — a Git-style word diff renders inline (green = added, red = removed). Handles documents up to ~1500 words/page-equivalent comfortably.',
  },
  {
    version: '1.6',
    icon: '⊞',
    title: 'Tables → CSV extraction',
    desc: 'More ▼ → <strong>Extract table → CSV</strong>. Drag a rectangle around any table in the PDF; we cluster the text items into rows and columns and download a clean CSV. Great for invoices, lab results, financial reports.',
  },
  {
    version: '1.6',
    icon: '{ }',
    title: 'Fill forms from JSON',
    desc: "More ▼ → <strong>Fill form from JSON…</strong>. Paste a JSON object and we match its keys to your PDF's AcroForm field names. Paste an <em>array</em> instead to generate dozens of personalised, filled copies in one go.",
  },
  {
    version: '1.6',
    icon: '📐',
    title: 'Page normalization (A4 / Letter / photo)',
    desc: 'More ▼ → <strong>Crop / Resize / Margins</strong>. Beyond CropBox margins, you can now <strong>resize</strong> every page to A4, A3, A5, Letter, Legal, Tabloid, Executive, photo sizes (4×6, 5×7, 8×10, 10×15 cm) or any custom dimension. Choose Fit (letterbox), Fill (crop) or Stretch — perfect for normalising a photo or off-spec scan into a real A4 PDF.',
  },
  {
    version: '1.6',
    icon: '✍',
    title: 'Verifiable signatures with audit stamp',
    desc: 'When you Sign, tick <strong>Strengthen with audit metadata</strong>. We bake into the signature image: SHA-256 of the document, UTC + local timestamp, your IP + ISP + city (IP-based), optional GPS coordinates with an English street address, browser fingerprint. Identity fields (name, email, phone, role) print on the stamp and are also embedded as machine-readable PDF metadata.',
  },
  {
    version: '1.6',
    icon: '✂',
    title: 'Smarter merge & split on the toolbar',
    desc: 'Three new toolbar buttons next to Pages: <strong>Merge PDF</strong> (append another file), <strong>Split PDF</strong> (custom ranges, every N pages, or one-per-page → multi-file download) and <strong>Compress PDF</strong>. No more digging into the Pages dialog for everyday operations.',
  },
  {
    version: '1.6',
    icon: '📱',
    title: 'New mobile dock layout',
    desc: 'On phones / tablets the toolbar is replaced by a thumb-friendly <strong>bottom dock</strong> (Select · Text · Draw · Image · Shape · Sign · More) plus a slim top bar (hamburger · undo · redo · Share · Download). <strong>More</strong> opens a 3-column bottom sheet with every Pro tool one tap away.',
  },
  {
    version: '1.6',
    icon: '⌨',
    title: 'Text editing — Enter to commit',
    desc: 'When typing in a text annotation, <kbd>Enter</kbd> now <strong>finishes</strong> the text (the common case) and <kbd>Shift</kbd>+<kbd>Enter</kbd> inserts a new line. Click outside still commits too, and the new annotation stays selected so you can immediately resize or rotate it.',
  },
  {
    version: '1.6',
    icon: '🎯',
    title: 'Shapes moved into Add ▼',
    desc: 'The toolbar is one button shorter: shapes now live in a fly-out submenu inside <strong>＋ Add ▼</strong>. The submenu shows a compact 3-column grid (Basic, Icons, Templates) — same 15 shapes, much less clicking.',
  },
];

let onboardCurrent = 0;
let onboardActiveSlides = [];

function openOnboarding(force = false) {
  const lastSeen = localStorage.getItem(ONBOARD_KEY);
  if (force) {
    onboardActiveSlides = ONBOARD_SLIDES.slice();
  } else if (!lastSeen) {
    // First-ever visit — show all
    onboardActiveSlides = ONBOARD_SLIDES.slice();
  } else if (lastSeen !== APP_VERSION) {
    // Returning user with newer version — show only slides from versions newer than lastSeen
    onboardActiveSlides = ONBOARD_SLIDES.filter((s) => compareVersions(s.version, lastSeen) > 0);
    if (!onboardActiveSlides.length) {
      // No new slides, just bump version silently
      localStorage.setItem(ONBOARD_KEY, APP_VERSION);
      return;
    }
  } else {
    // Same version — don't show
    return;
  }
  onboardCurrent = 0;
  renderOnboardSlide();
  document.getElementById('onboardModal').classList.add('show');
}
function compareVersions(a, b) {
  const pa = a.split('.').map(Number),
    pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0,
      vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
function renderOnboardSlide() {
  const slide = onboardActiveSlides[onboardCurrent];
  const isNewer = compareVersions(slide.version, '1.0') > 0;
  const slideEl = document.getElementById('onboardSlide');
  // Resolve translated slide content via t() — each slide has a stable key like
  // "onboard.s.<index>.title" / ".desc" so we can localize without restructuring
  // the canonical ONBOARD_SLIDES array (which still carries the EN source).
  const idx = ONBOARD_SLIDES.indexOf(slide);
  const titleKey = 'onboard.s.' + idx + '.title';
  const descKey = 'onboard.s.' + idx + '.desc';
  const title = window.t(titleKey, slide.title);
  const desc = window.t(descKey, slide.desc);
  const newBadge = window.t('onboard.newIn', 'New in') + ' ' + slide.version;
  slideEl.innerHTML = `
    ${isNewer ? `<span class="new-badge">${newBadge}</span>` : ''}
    <div class="icon-big">${slide.icon}</div>
    <h3>${title}</h3>
    <div class="desc">${desc}</div>
  `;
  // Force-restart the CSS animation so each slide transitions in
  slideEl.style.animation = 'none';
  void slideEl.offsetWidth;
  slideEl.style.animation = '';
  // Progress bar + counter (replaces the row of dots — was overflowing on
  // releases with many slides, causing a horizontal scrollbar on the modal).
  const total = onboardActiveSlides.length;
  const pct = total <= 1 ? 100 : ((onboardCurrent + 1) / total) * 100;
  const fill = document.getElementById('onboardProgressFill');
  const counter = document.getElementById('onboardCounter');
  if (fill) fill.style.width = pct.toFixed(2) + '%';
  if (counter)
    counter.textContent = window
      .t('onboard.stepFmt', 'Step {n} of {total}')
      .replace('{n}', onboardCurrent + 1)
      .replace('{total}', total);
  const prev = document.getElementById('onboardPrev');
  const next = document.getElementById('onboardNext');
  prev.disabled = onboardCurrent === 0;
  next.textContent =
    onboardCurrent === total - 1
      ? window.t('onboard.start', 'Get started ✓')
      : window.t('onboard.next', 'Next →');
}
function onboardingFinish() {
  localStorage.setItem(ONBOARD_KEY, APP_VERSION);
  document.getElementById('onboardModal').classList.remove('show');
}
document.getElementById('onboardSkip').addEventListener('click', onboardingFinish);
document.getElementById('onboardPrev').addEventListener('click', () => {
  if (onboardCurrent > 0) {
    onboardCurrent--;
    renderOnboardSlide();
  }
});
document.getElementById('onboardNext').addEventListener('click', () => {
  if (onboardCurrent === onboardActiveSlides.length - 1) {
    onboardingFinish();
  } else {
    onboardCurrent++;
    renderOnboardSlide();
  }
});
document.getElementById('onboardModal').addEventListener('click', (e) => {
  // Only close via skip / finish to avoid accidental backdrop dismiss
  // (no-op)
});

// Show onboarding on load (deferred slightly so the page paints first)
setTimeout(() => openOnboarding(false), 600);
