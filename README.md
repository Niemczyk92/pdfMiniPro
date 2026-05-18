# PDF Mini Editor

A local PDF editor that runs entirely in the browser. No backend, no uploads, no accounts.

## Features

- **White Box** — cover existing text in the PDF
- **Add Text** — write new text with auto white background, color, size, **B** / *I* / underline
- **Insert Image** — paste from clipboard (Ctrl+V) or upload from disk
- **Edit any change** — click to select, drag to move, double-click text to edit, Delete to remove
- **Multi-page** — works with any number of pages
- **PWA** — installable as a standalone app
- **Offline** — once installed, works without internet

## Running locally (simple)

Just open `index.html` in Chrome / Edge by double-clicking it. Everything works **except** the PWA install and "default PDF reader" features (those require HTTPS hosting — see below).

## Hosting it as a real PWA

To get the "install" prompt and the ability to set it as Windows' default PDF reader, you need to serve these files over HTTPS. Three easy free options:

### Option A — GitHub Pages (5 minutes)

1. Create a new GitHub repo, push all files in this folder to it
2. Repo Settings → Pages → Source: deploy from branch `main`, folder `/ (root)`
3. After ~1 minute, open the URL GitHub gives you (`https://<you>.github.io/<repo>/`)
4. In Chrome, click the **install** icon in the address bar

### Option B — Cloudflare Pages (drag and drop)

1. Go to https://pages.cloudflare.com/
2. Create a new project → "Direct Upload"
3. Drag this whole folder into the upload area
4. Open the URL Cloudflare gives you
5. Install via Chrome's address-bar install icon

### Option C — Netlify Drop

1. Go to https://app.netlify.com/drop
2. Drag this folder onto the page
3. Done — open the URL it gives you

### Option D — Local HTTPS via Caddy

If you want to keep it private on your network, install Caddy and run:

```
caddy file-server --domain pdf.local
```

Then trust the Caddy root cert and access via `https://pdf.local`.

## Setting as default PDF reader in Windows

After installing the PWA (Chrome address bar → install icon):

1. Right-click any `.pdf` file in File Explorer
2. **Open with** → **Choose another app**
3. Pick **PDF Mini Editor** from the list
4. Check **"Always use this app to open .pdf files"**
5. Click OK

Now any `.pdf` you double-click opens in the PWA. The launch is handled by the PWA's `file_handlers` manifest entry, which uses the browser's `launchQueue` API to receive the file.

> Note: Only Chromium browsers (Chrome, Edge, Brave, Arc) support PWA file handlers as of 2026. Firefox does not.

## Limitations

- **Diacritics / accented characters** (čřšž, é, ñ, ü, etc.) are **not supported** when saving text. The built-in PDF fonts (Helvetica family) don't include them. If you need them, the next step is embedding a Unicode font like Noto Sans into the PDF — let me know.
- **No re-edit of original PDF text** — this tool adds annotations on top of the PDF; it does not extract or modify existing text inside the document structure.
- **Image resize** is not yet implemented — you can move but not resize inserted images.

## Files in this folder

- `index.html` — the entire app
- `manifest.webmanifest` — PWA manifest (declares file_handlers for `.pdf`)
- `sw.js` — service worker (offline cache + installability)
- `icon.svg` — app icon
- `icon-maskable.svg` — adaptive icon (Android, Chrome OS)

## Privacy

The PDF you open **never leaves your browser**. All processing happens locally via pdf.js (rendering) and pdf-lib (editing). The CDN is used only to load the JavaScript libraries themselves on first visit — once the service worker caches them, you don't even need internet.
