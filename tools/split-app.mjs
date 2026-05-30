// ONE-TIME: carve src/app.js into ordered feature modules under src/app/.
// Cuts are made at the character offset of chosen section-banner lines, so the
// concatenation of all chunks (in name order) === the original app.js byte for
// byte — build is loss-less regardless of where a function actually starts.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'src/app.js');
const text = fs.readFileSync(SRC, 'utf8');

// offset of the start of each 1-indexed line
const lineStart = [0];
for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStart.push(i + 1);

// [startLine, fileName] — startLine is the banner line where the module begins.
const MODULES = [
  [1,     '00-core.js'],            // PDFLib setup, theme, PDF.js worker, SW, PWA, launch queue
  [678,   '01-brushes-forms.js'],   // brush picker + form-field designer
  [1244,  '02-recent-files.js'],    // recent files (IndexedDB) + mobile-fit notes
  [1961,  '03-text-overlay.js'],    // rich text helpers, overlay interaction, image detection
  [2904,  '04-command-palette.js'], // command palette
  [3098,  '05-text-image.js'],      // text editor, text drag, image annotation
  [3730,  '06-select-clipboard.js'],// select + props panel, undo/redo, multi-select, clipboard
  [5352,  '07-save-print.js'],      // generatePdfBytes (save/export) + print
  [6784,  '08-draw-shapes.js'],     // dropdowns, free drawing, shapes
  [7745,  '09-signatures.js'],      // common helpers, signature modal + audit
  [8651,  '10-stamps-profile.js'],  // quick access, profile, cropper, stamps, business card
  [10516, '11-organize-protect.js'],// toolbar hooks, organize/merge/split/compress, password
  [11320, '12-pro-tools.js'],       // sanitize, regex redact, table CSV, diff, JSON fill, split
  [12204, '13-help-onboard.js'],    // help + onboarding
  [12701, '14-select-guides.js'],   // marquee, alignment/spacing guides, autosave
  [13296, '15-ux-view.js'],         // UX polish, view tools, reading ruler, measure, forms tail
];

const bounds = MODULES.map(([ln]) => lineStart[ln - 1]);
bounds.push(text.length);

fs.mkdirSync(path.join(ROOT, 'src/app'), { recursive: true });
let total = 0;
MODULES.forEach(([, name], i) => {
  const slice = text.slice(bounds[i], bounds[i + 1]);
  fs.writeFileSync(path.join(ROOT, 'src/app', name), slice);
  total += slice.length;
});
// sanity: concatenation must equal the source exactly
const rejoined = MODULES.map(([, name]) => fs.readFileSync(path.join(ROOT, 'src/app', name), 'utf8')).join('');
if (rejoined !== text) { console.error('LOSSY SPLIT — aborting'); process.exit(1); }
fs.rmSync(SRC);
console.log('app split into', MODULES.length, 'modules, byte-exact (', total, 'bytes )');
