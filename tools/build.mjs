// Build step: assemble index.html from the editable source modules in src/.
// Run after editing any src/ file:  node tools/build.mjs   (or: npm run build)
//
// It simply inlines each module back where its @@INCLUDE@@ placeholder sits, so
// the deployed index.html stays a single self-contained file (unchanged GitHub
// Pages + service-worker caching model). No bundler, no transform — the inlined
// JS/CSS is byte-for-byte what you wrote, preserving the app's single global
// scope (required by its monkey-patch decorator pattern).
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const template = fs.readFileSync(path.join(ROOT, 'src/index.template.html'), 'utf8');

let out = template;
// @@INCLUDEDIR:dir@@ — concatenate every file in dir, sorted by name (numeric
// prefixes give the order). Used for the app/ feature modules; their plain
// concatenation reproduces the original single script verbatim, so they keep one
// shared global scope (no import/export rewiring of the decorator pattern).
out = out.replace(/@@INCLUDEDIR:([^@]+)@@/g, (_, rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) throw new Error('build: missing dir ' + rel);
  return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
});
// @@INCLUDE:file@@ — inline a single module file.
out = out.replace(/@@INCLUDE:([^@]+)@@/g, (_, rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error('build: missing module ' + rel);
  return fs.readFileSync(p, 'utf8');
});

fs.writeFileSync(path.join(ROOT, 'index.html'), out);
console.log('build complete → index.html (' + out.length + ' bytes)');
