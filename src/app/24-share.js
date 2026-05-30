// =====================================================================
// =====================  SHARE — compress + email  ====================
// =====================================================================
async function compressBytesForShare(sourceBytes, dpi, quality) {
  const sourceDoc = await loadPdfJsDoc(sourceBytes.slice(0));
  const newDoc = await PDFDocument.create();
  for (let i = 0; i < sourceDoc.numPages; i++) {
    const page = await sourceDoc.getPage(i + 1);
    const vp = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const dataURL = canvas.toDataURL('image/jpeg', quality);
    const jpegBytes = dataURLToBytes(dataURL);
    const img = await newDoc.embedJpg(jpegBytes);
    const natural = page.getViewport({ scale: 1 });
    const pdfPage = newDoc.addPage([natural.width, natural.height]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: natural.width, height: natural.height });
  }
  return await newDoc.save({ useObjectStreams: true });
}
function openShareModal() {
  if (!pdfBytes) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  document.getElementById('shareSubject').value = window
    .t('share.subjectDefault', '{name} — for your review')
    .replace('{name}', pdfFileName || 'Document');
  document.getElementById('shareBody').value = window.t(
    'share.bodyDefault',
    'Hi,\n\nAttached is the document for your review.\n\nThanks,'
  );
  // Probe Web Share with a tiny dummy file (canShare requires actual file shape)
  const status = document.getElementById('shareStatus');
  let supported = false;
  try {
    if (navigator.share && navigator.canShare) {
      const probe = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'probe.pdf', {
        type: 'application/pdf',
      });
      supported = navigator.canShare({ files: [probe] });
    }
  } catch (_) {}
  dbg('[share] Web Share with files supported:', supported, '· UA:', navigator.userAgent.slice(0, 80));
  if (supported) {
    status.className = 'settings-status ok';
    status.textContent = window.t(
      'share.supported',
      '✓ Your browser supports direct file sharing. Click Share → pick your email app → PDF will be attached automatically.'
    );
  } else {
    status.className = 'settings-status warn';
    status.textContent = window.t(
      'share.unsupported',
      "⚠ Your browser does NOT support direct file attach via mailto (Firefox / Safari desktop / old Chrome). We'll compress + download the PDF then open mail — you will need to drag the file in from Downloads. This is a browser security limit, not us. (Tip: use Chrome / Edge on this device, or pick from your Recents in the file dialog when composing.)"
    );
  }
  document.getElementById('shareModal').classList.add('show');
}
function closeShareModal() {
  document.getElementById('shareModal').classList.remove('show');
}
// Sanitise a filename so Windows mail clients / share targets don't choke on
// it (Outlook in particular renames anything with diacritics or odd punctuation
// to "noname"). ASCII-safe, no path separators, no quotes.
function _shareSafeName(rawName) {
  let n = (rawName || 'document').toString();
  // Strip any path prefix
  n = n.split(/[\\\/]/).pop();
  // Strip diacritics
  n = n.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // Replace non-ASCII / unsafe chars
  n = n.replace(/[^\w.\- ]+/g, '_');
  // Collapse repeated separators / leading dots
  n = n
    .replace(/_+/g, '_')
    .replace(/^[._\-\s]+/, '')
    .trim();
  // Guarantee .pdf extension
  if (!/\.pdf$/i.test(n)) n = n.replace(/\.[^.]+$/, '') + '.pdf';
  if (!n || n === '.pdf') n = 'document.pdf';
  return n;
}

// Compress + return File / Blob / name. Shared by both share paths.
async function _prepareSharePayload(goBtn) {
  const status = document.getElementById('shareStatus');
  let sourceBytes = annotations.length || acroFormFields.length ? await generatePdfBytes() : pdfBytes;
  let outBytes;
  const preset = document.getElementById('sharePreset').value;
  if (preset !== 'none') {
    const profiles = {
      high: { dpi: 150, q: 0.88 },
      balanced: { dpi: 120, q: 0.72 },
      small: { dpi: 96, q: 0.55 },
    };
    const p = profiles[preset] || profiles.balanced;
    goBtn.innerHTML = '⏳ Compressing…';
    status.className = 'settings-status warn';
    status.textContent = `Compressing at DPI ${p.dpi} · JPEG ${Math.round(p.q * 100)}%…`;
    outBytes = await compressBytesForShare(sourceBytes, p.dpi, p.q);
  } else {
    outBytes = sourceBytes;
  }
  const rawName =
    (pdfFileName || 'document').replace(/\.pdf$/i, '') + (preset !== 'none' ? '-compressed' : '') + '.pdf';
  const outName = _shareSafeName(rawName);
  // Create a fresh ArrayBuffer so the File object holds its own bytes
  // (some Windows share targets misread sub-views of the original buffer).
  const arrBuf = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength);
  const blob = new Blob([arrBuf], { type: 'application/pdf' });
  const file = new File([arrBuf], outName, { type: 'application/pdf', lastModified: Date.now() });
  return { blob, file, outName, outBytes, sourceBytes };
}

// ---- Path 1: System share (Web Share API). User picks the email/messaging app. ----
// Works on Chrome/Edge mobile + most Android. On Windows desktop, Outlook is
// known to receive an empty "no_name" file due to a broken Windows Share Contract
// implementation — that's an Outlook bug, not us. Pick "Mail" (Win11) instead,
// or use the Download path below.
async function doShareViaApp() {
  const goBtn = document.getElementById('shareGo');
  const orig = goBtn.innerHTML;
  goBtn.disabled = true;
  goBtn.innerHTML = '⏳ Generating PDF…';
  const status = document.getElementById('shareStatus');
  try {
    const { file, outName, outBytes, sourceBytes } = await _prepareSharePayload(goBtn);
    const origMB = ((sourceBytes.byteLength || sourceBytes.length) / 1048576).toFixed(2);
    const newMB = ((outBytes.byteLength || outBytes.length) / 1048576).toFixed(2);
    dbg(
      '[share] file ready:',
      outName,
      'bytes:',
      outBytes.length,
      '· canShare files:',
      navigator.canShare && navigator.canShare({ files: [file] })
    );
    status.className = 'settings-status ok';
    status.textContent = `Ready · ${outName} · ${origMB} MB → ${newMB} MB · Opening share sheet…`;
    if (!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }))) {
      status.className = 'settings-status err';
      status.textContent =
        'Your browser does not support direct file sharing. Use "📥 Download + open mail" instead.';
      return;
    }
    // Minimal payload — including title/text sometimes confuses Outlook
    // into treating the file as text and creating an empty "no_name" attachment.
    // Pass ONLY files. If user wants a subject/body they can set it in the
    // email client after the share opens.
    try {
      await navigator.share({ files: [file] });
      closeShareModal();
      showToast(
        'Shared. If Outlook shows "no_name" file is empty — that\'s an Outlook bug. Use Download path or pick Mail app instead.',
        'success'
      );
    } catch (e) {
      if (e.name === 'AbortError') {
        status.className = 'settings-status';
        status.textContent = 'Share cancelled.';
        return;
      }
      throw e;
    }
  } catch (e) {
    console.error('[share] error:', e);
    status.className = 'settings-status err';
    status.textContent = 'Failed: ' + (e.message || e);
    showToast('Share failed: ' + (e.message || e), 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.innerHTML = orig;
  }
}

// ---- Path 2: Download + open mail. Always works, requires drag-and-drop. ----
async function doShareViaDownload() {
  const goBtn = document.getElementById('shareGoDownload');
  const orig = goBtn.innerHTML;
  goBtn.disabled = true;
  goBtn.innerHTML = '⏳ Generating PDF…';
  const status = document.getElementById('shareStatus');
  try {
    const { blob, outName, outBytes, sourceBytes } = await _prepareSharePayload(goBtn);
    const origMB = ((sourceBytes.byteLength || sourceBytes.length) / 1048576).toFixed(2);
    const newMB = ((outBytes.byteLength || outBytes.length) / 1048576).toFixed(2);
    status.className = 'settings-status ok';
    status.textContent = `Downloaded ${outName} · ${origMB} MB → ${newMB} MB`;
    const subject = document.getElementById('shareSubject').value || pdfFileName || 'Document';
    const body = document.getElementById('shareBody').value || '';
    const to = (document.getElementById('shareTo').value || '').trim();
    downloadBlob(blob, outName);
    const fullBody =
      (body || '') +
      '\n\n📎 Drag "' +
      outName +
      '" from your Downloads into this email.\n' +
      '(Browser security blocks automatic mailto attachments.)';
    let href = 'mailto:';
    if (to) href += encodeURIComponent(to);
    href += '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(fullBody);
    if (href.length > 1900) href = href.slice(0, 1900);
    window.open(href, '_blank');
    closeShareModal();
    showToast(`📥 ${outName} downloaded (${newMB} MB). Drag it from Downloads into the email.`, 'success');
  } catch (e) {
    console.error('[share] error:', e);
    status.className = 'settings-status err';
    status.textContent = 'Failed: ' + (e.message || e);
    showToast('Share failed: ' + (e.message || e), 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.innerHTML = orig;
  }
}

// Backwards-compatible single-path entry (the old "Compress & share" button)
async function doShare() {
  const goBtn = document.getElementById('shareGo');
  const orig = goBtn.innerHTML;
  goBtn.disabled = true;
  goBtn.innerHTML = '⏳ Generating PDF…';
  const status = document.getElementById('shareStatus');
  try {
    // 1. Bake current edits into bytes
    let sourceBytes = annotations.length || acroFormFields.length ? await generatePdfBytes() : pdfBytes;
    let outBytes;
    // 2. Compress (if not "none")
    const preset = document.getElementById('sharePreset').value;
    if (preset !== 'none') {
      const profiles = {
        high: { dpi: 150, q: 0.88 },
        balanced: { dpi: 120, q: 0.72 },
        small: { dpi: 96, q: 0.55 },
      };
      const p = profiles[preset] || profiles.balanced;
      goBtn.innerHTML = '⏳ Compressing…';
      status.className = 'settings-status warn';
      status.textContent = `Compressing at DPI ${p.dpi} · JPEG ${Math.round(p.q * 100)}%…`;
      outBytes = await compressBytesForShare(sourceBytes, p.dpi, p.q);
    } else {
      outBytes = sourceBytes;
    }
    const origMB = ((sourceBytes.byteLength || sourceBytes.length) / 1048576).toFixed(2);
    const newMB = ((outBytes.byteLength || outBytes.length) / 1048576).toFixed(2);
    const rawName =
      (pdfFileName || 'document').replace(/\.pdf$/i, '') + (preset !== 'none' ? '-compressed' : '') + '.pdf';
    const outName = _shareSafeName(rawName);
    dbg('[share] file name:', outName, 'bytes:', outBytes.length);
    // IMPORTANT: ArrayBuffer-flavoured Uint8Array works with File but some
    // mobile share-sheets misread the size when the underlying buffer is shared.
    // We materialise a fresh ArrayBuffer to avoid that class of bug.
    const arrBuf = outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength);
    const blob = new Blob([arrBuf], { type: 'application/pdf' });
    const file = new File([arrBuf], outName, { type: 'application/pdf', lastModified: Date.now() });
    status.className = 'settings-status ok';
    status.textContent = `Ready · ${outName} · ${origMB} MB → ${newMB} MB`;
    // 3. Choose strategy — ALWAYS try Web Share with files first if supported.
    //    Web Share is the only browser path that can attach a file to an email
    //    without download-then-drag. Browser security blocks mailto attachments.
    const subject = document.getElementById('shareSubject').value || pdfFileName || 'Document';
    const body = document.getElementById('shareBody').value || '';
    const to = (document.getElementById('shareTo').value || '').trim();
    const canFileShare = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
    if (canFileShare) {
      try {
        await navigator.share({ files: [file], title: subject, text: body });
        closeShareModal();
        showToast('Shared. Pick your email app from the share sheet.', 'success');
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          // user cancelled the share sheet — don't fall through to download
          showToast('Share cancelled.', 'info');
          return;
        }
        console.warn('[share] navigator.share failed, falling back:', e);
      }
    }
    // 4. Browser doesn't support Web Share with files (typical for Firefox / older
    //    desktop browsers). The mailto spec explicitly forbids file attachments
    //    for security reasons, so we MUST download the file and ask the user to
    //    drag it in. No way around this without a server-side relay.
    downloadBlob(blob, outName);
    const fullBody =
      (body || '') +
      '\n\nPřiložte soubor "' +
      outName +
      '" který se právě stáhl do složky Stažené.\n' +
      '(Browser security blocks automatic mailto: attachments — Web Share API needed.)';
    let href = 'mailto:';
    if (to) href += encodeURIComponent(to);
    href += '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(fullBody);
    if (href.length > 1900) href = href.slice(0, 1900);
    window.open(href, '_blank');
    closeShareModal();
    showToast(
      `📥 Browser nepodporuje přímé attachnutí. Stáhli jsme ${outName} — přetáhněte ho do emailu.`,
      'warn'
    );
  } catch (e) {
    console.error('[share] error:', e);
    status.className = 'settings-status err';
    status.textContent = 'Failed: ' + (e.message || e);
    showToast('Share failed: ' + (e.message || e), 'error');
  } finally {
    goBtn.disabled = false;
    goBtn.innerHTML = orig;
  }
}
(function () {
  const o = document.getElementById('shareBtnMenu');
  if (o)
    o.addEventListener('click', () => {
      closeAllDropdowns && closeAllDropdowns();
      openShareModal();
    });
  const c = document.getElementById('shareClose');
  if (c) c.addEventListener('click', closeShareModal);
  const cc = document.getElementById('shareCancel');
  if (cc) cc.addEventListener('click', closeShareModal);
  const g = document.getElementById('shareGo');
  if (g) g.addEventListener('click', doShareViaApp);
  const gd = document.getElementById('shareGoDownload');
  if (gd) gd.addEventListener('click', doShareViaDownload);
  const m = document.getElementById('shareModal');
  if (m)
    m.addEventListener('click', (e) => {
      if (e.target.id === 'shareModal') closeShareModal();
    });
})();

// Boot: take an initial snapshot, then maybe offer restore
setTimeout(() => {
  saveSettingsBackup();
  maybeOfferBackupRestore();
  refreshAiAvailability();
}, 1500);

