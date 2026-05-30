// ONE-TIME migration: carve the monolithic index.html into editable source
// modules under src/ + an index.template.html with @@INCLUDE@@ placeholders.
// After this runs, EDIT the src/ files and run `node tools/build.mjs` to
// regenerate index.html. The split is loss-less: build(split(x)) === x.
//
// Boundaries are the <script>/<style> TAG edges only — no JS/CSS is reparsed or
// reformatted, so behaviour is byte-for-byte identical (the whole app keeps the
// same single shared global scope; the 13+ monkey-patch decorators still work).
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });

// Plain inline <script> blocks (no attributes) in document order:
//   0 = theme init (must stay inline, runs before paint → no FOUC)
//   1 = i18n framework      2 = i18n dictionary      3 = main app
const SCRIPT_TARGETS = [null, 'src/i18n-framework.js', 'src/i18n-dict.js', 'src/app.js'];

let sIdx = 0;
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (full, inner) => {
  const target = SCRIPT_TARGETS[sIdx++];
  if (!target) return full;                       // keep inline
  fs.writeFileSync(path.join(ROOT, target), inner);
  return `<script>@@INCLUDE:${target}@@</script>`;
});

// The single <style> block → src/app.css
html = html.replace(/<style>([\s\S]*?)<\/style>/, (full, inner) => {
  fs.writeFileSync(path.join(ROOT, 'src/app.css'), inner);
  return `<style>@@INCLUDE:src/app.css@@</style>`;
});

fs.writeFileSync(path.join(ROOT, 'src/index.template.html'), html);
console.log('split complete →', SCRIPT_TARGETS.filter(Boolean).join(', '), ', src/app.css, src/index.template.html');
