# PDF Mini Editor Pro

A full PDF editor that runs **entirely in your browser**. No backend, no uploads, no accounts — the PDF you open never leaves your device. Rendering uses pdf.js, editing uses pdf-lib, and everything is processed locally.

Live: **https://pdf.kamagio.com**

## Features

### Edit & annotate
- **Edit existing PDF text** — double-click any text in the PDF to edit it in place (font, size and colour are matched; the original is covered and the new text rendered on top)
- **Add Text** — new text boxes with bold / italic / underline, colour, size, alignment and font family
- **Insert image** — paste from clipboard (Ctrl+V) or upload; move, resize and rotate
- **Free draw** with brush presets (**pen · pencil · highlighter · marker**) — picked from a prominent floating bar (not a buried dropdown); the tool stays active for multiple strokes; the cursor reflects the current brush colour and width; the quick panel remembers your last brush/colour/width. Also **shapes**, **highlight / underline / strike-through**
- **Form-field designer** — press **F** (or pick **+ Add → Form field**), drag a rectangle, choose the subtype from the floating bar (**text · multi-line · number · date · checkbox · dropdown · multi-select list**); name + default value (and options for dropdown/multi-select) editable in the side panel; the fields are written into the saved PDF as real **AcroForm** fields fillable in any PDF viewer
- **White-out** (cover content) and **Redact** (black-out, strips metadata on save)
- **Signatures** — draw, type or upload; **certified / PAdES signatures** (in progress)
- **QR codes & barcodes**, **stamps gallery**
- **Ruler, grid & measurement** — toolbar toggles for a per-page ruler and grid with a live unit selector (**mm · cm · in · px · pt**). Press **M** (or 📏) and drag to measure in the chosen unit; double-click a measurement to calibrate to a known length
- **Diacritics fully supported** — Noto Sans / Serif / Mono are embedded at save time, so čřšžě, é, ñ, ü, etc. render correctly

### Pages & documents
- **Organize pages** — reorder, rotate, delete, duplicate
- **Merge** PDFs, **Split** out selected pages
- **Compress** (rasterise to shrink size), **Crop / Resize / Margins** (A4, Letter, photo sizes)
- **Page Setup** — watermark, header, footer, page numbers
- **Bookmarks / outline** editor (incl. **auto-detect headings** → one-click outline), **Templates**

### Smart tools
- **Find & Replace** across the document
- **OCR** scanned PDFs (makes image-only pages editable)
- **Compare two PDFs** — side-by-side visual diff
- **Extract table → CSV**
- **Forms** — fill AcroForm / XFA fields; **Fill from JSON** (single object, or an array to batch-generate many filled copies)
- **RegEx redact** — find & black-out SSNs, card numbers, emails, IBANs
- **AI tools** (optional local server) — summarize, translate, explain a paragraph, suggest form values, and a "chat about this PDF" panel

### Security & export
- **Password protect** (AES-256 envelope)
- **Sanitize** — flatten + strip metadata
- **Save**, **Export as** (HQ / Web / Archive), **Export → Text (.txt)**, **Export → Word (.docx, text only)**
- **Share by email** (compresses + attaches), **Print**

### App
- **Multi-language** UI (English, Čeština, Polski, Español)
- **Command palette** + single-letter shortcuts (incl. **M** for measure), **Simple / Pro** mode toggle
- **Recent files** on the start screen + **auto-save draft recovery** (all local, in IndexedDB)
- **Drag & drop** a PDF anywhere to open it; **arrow keys** nudge selected objects (Shift = 10px); **eyedropper** to pick colours
- **Copy / cut / paste** any object with **Ctrl+C / Ctrl+X / Ctrl+V** — works across pages and drops the object at your last click position
- **Document info & PDF metadata** (title, author, subject, keywords, creator, producer, dates) in the stats panel
- **PWA** — installable, works **offline**, and can be set as the default Windows PDF reader

## Running locally

Just open `index.html` in Chrome / Edge. Everything works except the PWA install and "default PDF reader" features, which require HTTPS hosting.

For local development the project is served by XAMPP at `http://localhost/pdfMiniPro/`.

> **Service worker note:** the app caches itself for offline use. After changing the code, bump `APP_VERSION` in `index.html` **and** the `CACHE` string in `sw.js` so browsers pick up the new version. The worker self-activates (`skipWaiting`) and uses a network-first strategy for the HTML, so a normal reload gets the latest code; if a tab is stuck on an old build, hard-refresh (Ctrl+Shift+R) once.

## Hosting as a PWA

Serve the files over HTTPS (GitHub Pages, Cloudflare Pages, Netlify Drop, or local Caddy). Then use Chrome's address-bar **install** icon. To set as Windows' default PDF reader: right-click a `.pdf` → **Open with** → **Choose another app** → **PDF Mini Editor** → "Always". Launches are handled via the PWA `file_handlers` manifest entry + the `launchQueue` API.

> Only Chromium browsers (Chrome, Edge, Brave, Arc) support PWA file handlers. Firefox does not.

## Notes & limitations

- **Edit-PDF covers, it doesn't rewrite the stream.** Editing existing text places a cover + new text on top; the original glyphs still exist underneath in the saved file (so text extraction could still find them). Visually and on print the result is clean. For guaranteed removal, use **Redact**.
- **Mobile** is currently desktop-first; a touch-optimised layout is on the roadmap.

## Testing

A self-contained Playwright smoke suite lives in `tests/`. It generates its own
test PDF (no external files) and checks the behaviours that have regressed before
— edit-PDF sizing/position/coverage, the bound cover (move/delete together), save,
auto-save, recent files, auto-outline and measure.

```
npm i -D playwright && npx playwright install chromium
# serve the app locally (XAMPP, or `npx serve .`), then:
npm test                 # → node tests/smoke.mjs   (default http://localhost/pdfMiniPro/index.html)
APP_URL=http://localhost:3000/index.html npm test
```

`node_modules` and the dev `package.json` tooling are not part of the shipped app
(which stays a static `index.html` + `sw.js`).

## Files

- `index.html` — the entire app
- `sw.js` — service worker (offline cache + installability)
- `manifest.webmanifest` — PWA manifest (declares `file_handlers` for `.pdf`)
- `icon*.svg` / `*.png` — app + file icons

## Privacy

The PDF you open **never leaves your browser**. All processing is local (pdf.js for rendering, pdf-lib for editing). The CDN only serves the JavaScript libraries on first visit; once the service worker caches them, no internet is needed.
