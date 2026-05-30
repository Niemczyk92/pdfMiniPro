// ONE-TIME: break the oversized src/app/15-ux-view.js into balanced feature
// modules (byte-exact, same as split-app.mjs). Run once, then delete.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const SRC = path.join(ROOT, 'src/app/15-ux-view.js');
const text = fs.readFileSync(SRC, 'utf8');
const lineStart = [0];
for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStart.push(i + 1);

const MODULES = [
  [1,    '15-view-tools.js'],              // UX polish, view tools, reading ruler, measure
  [837,  '16-page-setup.js'],              // page setup
  [1107, '17-text-marks.js'],              // highlight / underline / strike, mobile dock
  [1419, '18-links-redact.js'],            // hyperlinks, redact
  [1858, '19-presets-templates-outline.js'],// export presets, templates, bookmarks/outline
  [2307, '20-crop-blank.js'],              // crop/margins, new blank pdf
  [2888, '21-side-panel.js'],              // side panel
  [3303, '22-settings-ai.js'],             // settings (backup/AI/errors), AI chat
  [4403, '23-export-qr.js'],               // export text/docx, QR/barcode
  [5437, '24-share.js'],                   // share (compress + email)
  [5782, '25-pades-sign.js'],              // PAdES signing (X.509)
  [6211, '26-ocr.js'],                     // OCR via Tesseract.js
  [6703, '27-forms-find.js'],              // form fill (AcroForm), find & replace
];

const bounds = MODULES.map(([ln]) => lineStart[ln - 1]);
bounds.push(text.length);
MODULES.forEach(([, name], i) => {
  fs.writeFileSync(path.join(ROOT, 'src/app', name), text.slice(bounds[i], bounds[i + 1]));
});
const rejoined = MODULES.map(([, name]) => fs.readFileSync(path.join(ROOT, 'src/app', name), 'utf8')).join('');
if (rejoined !== text) { console.error('LOSSY — aborting'); process.exit(1); }
fs.rmSync(SRC);
console.log('15-ux-view split into', MODULES.length, 'balanced modules, byte-exact');
