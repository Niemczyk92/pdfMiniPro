// === TEXT EDITOR ===
function openTextEditor(overlay, pageNum, x, y, existingAnn) {
  if (activeEditor) commitEditor(true);
  let ann = existingAnn;
  // If we're reopening an existing annotation that somehow has a corrupt fontSize
  // (legacy bug — see clamps in applyTextAnnotationStyle), heal it on the spot so
  // the editor doesn't open as a page-sized text box.
  if (ann && (!isFinite(ann.fontSize) || ann.fontSize > 200 || ann.fontSize < 4)) {
    console.warn('[openTextEditor] healing corrupt fontSize', ann.fontSize, '→ 14');
    ann.fontSize = 14;
  }
  if (!ann) {
    const el = document.createElement('div');
    el.className = 'annotation text-annotation';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.fontSize = defaultSize + 'px';
    el.style.visibility = 'hidden';
    overlay.appendChild(el);
    ann = {
      type: 'text',
      pageNum,
      x,
      y,
      lines: [],
      fontSize: defaultSize,
      noBackground: false,
      fontFamily: defaultTextFont || 'Helvetica',
      lineHeight: defaultLineHeight || 1.15,
      align: defaultAlign || 'left',
      width: 80,
      height: defaultSize * 1.5,
      el,
    };
    applyTextAnnotationStyle(el, ann);
    annotations.push(ann);
    enableTextDrag(el, ann);
    addTextHandles(el, ann);
    el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
    isNewAnnotation = true;
  } else {
    ann.el.style.visibility = 'hidden';
    isNewAnnotation = false;
  }

  const editor = document.createElement('div');
  editor.className = 'text-input-active';
  if (ann.noBackground) editor.classList.add('no-bg');
  if (ann.fromPdfEdit) editor.classList.add('from-pdf-edit');
  editor.contentEditable = 'true';
  editor.style.left = ann.x + 'px';
  editor.style.top = ann.y + 'px';
  editor.style.fontSize = ann.fontSize + 'px';
  editor.style.color = defaultColor;
  editor.style.minWidth = (ann.fromPdfEdit ? Math.max(30, ann.width) : Math.max(80, ann.width)) + 'px';
  editor.style.fontFamily = TEXT_FONT_FAMILIES[ann.fontFamily || 'Helvetica'] || TEXT_FONT_FAMILIES.Helvetica;
  editor.style.lineHeight = String(ann.lineHeight || 1.15);
  editor.style.textAlign = ann.align || 'left';
  // Same right-edge cap as applyTextAnnotationStyle — keep the contentEditable
  // from extending past the page while the user is typing. Edit-PDF replacements
  // are exempt: they stay single-line (nowrap) at the original glyph footprint,
  // so the clamp (which would wrap a wider substitute font) is cleared.
  if (ann.fromPdfEdit) {
    editor.style.maxWidth = 'none';
  } else if (overlay && overlay.offsetWidth) {
    editor.style.maxWidth = Math.max(40, overlay.offsetWidth - ann.x - 4) + 'px';
  }

  if (isNewAnnotation || isLinesEmpty(ann.lines)) editor.innerHTML = '';
  else editor.innerHTML = linesToHtml(ann.lines);

  overlay.appendChild(editor);
  activeEditor = editor;
  activeEditorAnn = ann;
  editorJustOpened = true;
  setTimeout(() => {
    editorJustOpened = false;
  }, 100);
  setContext('typing');
  select(ann);

  setTimeout(() => {
    editor.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
    updatePropsForEditor();
  }, 20);

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      commitEditor(false);
    }
    // Enter alone commits; Shift+Enter (or Ctrl/Cmd+Enter) inserts a newline.
    // Reversed from the contenteditable default so single-line text annotations
    // — the common case — don't need a separate finish-key.
    else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      commitEditor(true);
    }
  });
  editor.addEventListener('keyup', updatePropsForEditor);
  editor.addEventListener('mouseup', updatePropsForEditor);
}

function commitEditor(commit) {
  if (!activeEditor) return;
  const ann = activeEditorAnn;
  const wasNew = isNewAnnotation;
  const newLines = commit ? htmlToLines(activeEditor.innerHTML) : ann.lines;
  activeEditor.remove();
  activeEditor = null;
  activeEditorAnn = null;

  if (commit) {
    if (isLinesEmpty(newLines)) {
      ann.el.remove();
      const i = annotations.indexOf(ann);
      if (i >= 0) annotations.splice(i, 1);
      if (selected === ann) deselect();
      updateAnnotCount();
      isNewAnnotation = false;
      setContext(currentTool);
      return;
    }
    ann.lines = newLines;
  } else if (isNewAnnotation) {
    ann.el.remove();
    const i = annotations.indexOf(ann);
    if (i >= 0) annotations.splice(i, 1);
    if (selected === ann) deselect();
    updateAnnotCount();
    isNewAnnotation = false;
    setContext(currentTool);
    return;
  }

  renderTextAnnotation(ann);
  ann.el.style.visibility = '';
  ann.width = ann.el.offsetWidth;
  ann.height = ann.el.offsetHeight;
  // For Edit-PDF replacements, grow the underlying whiteout to cover the NEW
  // text width if it's wider than the original glyph (so the original isn't
  // still visible peeking out from beneath the new content).
  if (ann.fromPdfEdit && ann.sourceWhiteout) {
    const wo = ann.sourceWhiteout;
    const bleed = Math.max(2, ann.fontSize * 0.08);
    const needRight = ann.x + ann.width + bleed;
    const needBottom = ann.y + ann.height + bleed;
    const woRight = wo.x + wo.width;
    const woBottom = wo.y + wo.height;
    if (needRight > woRight) {
      wo.width = needRight - wo.x;
    }
    if (needBottom > woBottom) {
      wo.height = needBottom - wo.y;
    }
    if (wo.el) {
      wo.el.style.width = wo.width + 'px';
      wo.el.style.height = wo.height + 'px';
    }
  }
  isNewAnnotation = false;
  updateAnnotCount();
  // Match paste-text behaviour: after committing a freshly-created text via
  // the Text tool, drop back to Select so handles work on the next click
  // instead of starting another empty textbox.
  if (commit && wasNew && currentTool === 'text' && !ann.fromPdfEdit) {
    currentTool = 'select';
    updateToolUI();
  }
  setContext(selected === ann ? 'selected' : currentTool);
  if (selected === ann) {
    buildPropsPanel(ann);
    positionPropsPanel(ann);
  }
  if (commit) pushHistory('text-edit');
  // Short grace window so the compat events that follow our pointerdown commit
  // (mousedown, mouseup, click — any of them could land on a handler that calls
  // deselect()) leave the new annotation selected.
  editorJustCommitted = true;
  setTimeout(() => {
    editorJustCommitted = false;
  }, 250);
  _deselectLockUntil = Date.now() + 250;
}

// === TEXT DRAG (for text + rect annotations) ===
function enableTextDrag(el, ann) {
  let dragging = false,
    downX = 0,
    downY = 0,
    startLeft = 0,
    startTop = 0,
    hasMoved = false;
  // For Edit-PDF text, the cover (whiteout) travels with the text so the pair
  // stays one object — record its start position alongside the text's.
  let woStartLeft = 0,
    woStartTop = 0;
  // Cache the annotation's "resting" opacity so we restore it (not 1) after drag —
  // otherwise a watermark dropped at opacity 0.25 becomes a solid block on first click.
  let restOpacity = '1';
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (activeEditor && activeEditorAnn === ann) return;
    if (
      e.target &&
      e.target.classList &&
      (e.target.classList.contains('img-handle') || e.target.classList.contains('rot-handle'))
    )
      return;
    e.stopPropagation();
    downX = e.clientX;
    downY = e.clientY;
    startLeft = ann.x;
    startTop = ann.y;
    if (ann.sourceWhiteout) {
      woStartLeft = ann.sourceWhiteout.x;
      woStartTop = ann.sourceWhiteout.y;
    }
    hasMoved = false;
    dragging = true;
    // Pull from the annotation model first (set by Page-Setup watermark), then
    // the live inline style, then default to 1.
    restOpacity = ann.opacity != null && ann.opacity < 1 ? String(ann.opacity) : el.style.opacity || '1';
    // Watermarks (low-opacity, fromPageSetup) keep their original opacity through
    // the entire drag — no "darken on grab" feedback. Otherwise the gentle 0.85x
    // multiplier still gives a hint of activity.
    if (parseFloat(restOpacity) < 0.6) {
      el.style.opacity = restOpacity;
    } else {
      el.style.opacity = String(Math.max(0.15, parseFloat(restOpacity) * 0.85));
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - downX) / currentZoom;
    const dy = (e.clientY - downY) / currentZoom;
    if (!hasMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    hasMoved = true;
    const overlay = el.parentElement;
    let nx = Math.max(0, Math.min(overlay.offsetWidth - el.offsetWidth, startLeft + dx));
    let ny = Math.max(0, Math.min(overlay.offsetHeight - el.offsetHeight, startTop + dy));
    const snapped = snapPosition(ann, nx, ny, el.offsetWidth, el.offsetHeight);
    nx = snapped.x;
    ny = snapped.y;
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    ann.x = nx;
    ann.y = ny;
    // Move the bound cover by the same delta so it keeps hiding the original.
    if (ann.sourceWhiteout && ann.sourceWhiteout.el) {
      const wo = ann.sourceWhiteout;
      wo.x = woStartLeft + (nx - startLeft);
      wo.y = woStartTop + (ny - startTop);
      wo.el.style.left = wo.x + 'px';
      wo.el.style.top = wo.y + 'px';
    }
    if (selected === ann) positionPropsPanel(ann);
  });
  window.addEventListener('pointerup', () => {
    if (!dragging) return;
    hideAlignmentGuides();
    el.style.opacity = restOpacity;
    if (!hasMoved) select(ann);
    dragging = false;
  });
}

// Add 4 corner handles (proportional font-size resize) + rotation puck to a text annotation.
function addTextHandles(el, ann) {
  // Skip from-PDF-edit annotations — their position must match the original glyphs
  if (ann.fromPdfEdit) return;
  if (el.querySelector('.img-handle, .rot-handle')) return; // already added
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const h = document.createElement('div');
    h.className = 'img-handle ' + corner;
    h.dataset.corner = corner;
    el.appendChild(h);
    attachTextCornerResize(h, ann, corner);
  });
  const rot = document.createElement('div');
  rot.className = 'rot-handle';
  rot.title = 'Drag to rotate';
  el.appendChild(rot);
  attachRotateHandle(rot, ann, () => {
    applyTextRotation(ann);
    positionPropsPanel(ann);
  });
}

function applyTextRotation(ann) {
  ann.el.style.transform = ann.rotation ? `rotate(${ann.rotation}deg)` : '';
}

// Corner drag → scale font-size proportionally (the box auto-resizes to fit the text)
function attachTextCornerResize(h, ann, corner) {
  h.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select(ann);
    try {
      h.setPointerCapture(e.pointerId);
    } catch (_) {}
    const startX = e.clientX,
      startY = e.clientY;
    let startFs = ann.fontSize;
    if (!isFinite(startFs) || startFs < 4 || startFs > 200) startFs = 14; // recover from corrupt state
    const startW = ann.el.offsetWidth || 1;
    const startH = ann.el.offsetHeight || 1;
    const startAx = ann.x,
      startAy = ann.y;
    const sx = corner.includes('e') ? 1 : -1;
    const sy = corner.includes('s') ? 1 : -1;
    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / currentZoom;
      const dy = (ev.clientY - startY) / currentZoom;
      const rW = (startW + sx * dx) / startW;
      const rH = (startH + sy * dy) / startH;
      const r = Math.abs(rW - 1) > Math.abs(rH - 1) ? rW : rH;
      let newFs = Math.round(startFs * (isFinite(r) ? r : 1));
      newFs = Math.max(6, Math.min(160, isFinite(newFs) ? newFs : 14));
      ann.fontSize = newFs;
      ann.el.style.fontSize = newFs + 'px';
      ann.width = ann.el.offsetWidth;
      ann.height = ann.el.offsetHeight;
      if (corner.includes('w')) ann.x = startAx + startW - ann.width;
      if (corner.includes('n')) ann.y = startAy + startH - ann.height;
      ann.el.style.left = ann.x + 'px';
      ann.el.style.top = ann.y + 'px';
      const sizeInput = document.querySelector('#propsPanel .psize-input');
      if (sizeInput && document.activeElement !== sizeInput) sizeInput.value = newFs;
      if (selected === ann) positionPropsPanel(ann);
    };
    const onUp = (ev) => {
      h.removeEventListener('pointermove', onMove);
      h.removeEventListener('pointerup', onUp);
      h.removeEventListener('pointercancel', onUp);
      try {
        h.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    };
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  });
}

// === IMAGE ANNOTATION with resize + rotate ===
document.getElementById('imgInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!pdfJsDoc) {
    showToast(window.t('toast.openFirst', 'Open a PDF first.'), 'warn');
    return;
  }
  if (!lastClickPos) {
    const ov = document.querySelector('.overlay');
    lastClickPos = { pageNum: 1, x: 50, y: 50, overlay: ov };
  }
  const dataURL = await fileToDataURL(file);
  const ann = addImageAnnotation(lastClickPos, dataURL, file.type);
  e.target.value = '';
  // selection happens after image loads
});

document.addEventListener('paste', async (e) => {
  if (!pdfJsDoc) return;
  // If the user is actively typing in an input / textarea / contenteditable
  // (incl. inside an open modal), let the native paste flow through.
  // Modal *overlays* by themselves don't block paste — the activeElement
  // check below is the single source of truth for "is the user typing?".
  const ae = document.activeElement;
  if (ae) {
    if (ae.isContentEditable) return;
    const tag = ae.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  }
  // Fall back to "top of page 1" when the user hasn't clicked anywhere yet,
  // or when their last clicked overlay was removed by a re-render.
  if (!lastClickPos || !lastClickPos.overlay || !document.body.contains(lastClickPos.overlay)) {
    const ov = document.querySelector('.overlay');
    if (!ov) return;
    lastClickPos = { pageNum: 1, x: 50, y: 50, overlay: ov };
  }
  const items = e.clipboardData?.items;
  // Try image first — preferred when both present
  if (items) {
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        e.preventDefault();
        const dataURL = await blobToDataURL(blob);
        addImageAnnotation(lastClickPos, dataURL, item.type);
        return;
      }
    }
  }
  // Otherwise fall back to plain text
  const text = (e.clipboardData?.getData && e.clipboardData.getData('text/plain')) || '';
  if (text && text.trim()) {
    e.preventDefault();
    // Build multi-line text annotation, preserving line breaks
    const lines = text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => plainLine(l, { color: defaultColor }));
    createTextAnnotationFromLines(lastClickPos, lines, defaultSize);
    showToast(window.t('toast.pastedText', 'Pasted text — double-click to edit.'), 'success');
  }
});

function fileToDataURL(f) {
  return new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(f);
  });
}
function blobToDataURL(b) {
  return fileToDataURL(b);
}

function addImageAnnotation(pos, dataURL, mimeType) {
  const container = document.createElement('div');
  container.className = 'annotation img-container';
  container.style.left = pos.x + 'px';
  container.style.top = pos.y + 'px';
  container.style.transform = 'rotate(0deg)';

  const img = document.createElement('img');
  img.src = dataURL;
  img.draggable = false;
  container.appendChild(img);

  // Resize handles
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const h = document.createElement('div');
    h.className = 'img-handle ' + corner;
    h.dataset.corner = corner;
    container.appendChild(h);
  });
  // Rotate handle
  const rotHandle = document.createElement('div');
  rotHandle.className = 'img-handle rot';
  container.appendChild(rotHandle);

  pos.overlay.appendChild(container);

  const ann = {
    type: 'image',
    pageNum: pos.pageNum,
    x: pos.x,
    y: pos.y,
    width: 0,
    height: 0,
    rotation: 0,
    dataURL,
    mimeType,
    el: container,
    imgEl: img,
    isSignature: false,
  };
  annotations.push(ann);

  img.addEventListener('load', () => {
    const maxW = 260;
    const natRatio = img.naturalWidth / img.naturalHeight;
    let w = Math.min(maxW, img.naturalWidth);
    let h = w / natRatio;
    if (h > maxW) {
      h = maxW;
      w = h * natRatio;
    }
    ann.width = w;
    ann.height = h;
    ann.aspectRatio = w / h; // store original aspect for proportional resize
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    enableImageInteractions(container, ann);
    select(ann);
    updateAnnotCount();
  });

  // Double-click → if it's a signature, open the signature modal to replace
  container.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (ann.isSignature) {
      openSignatureModal((newDataURL) => {
        ann.dataURL = newDataURL;
        img.src = newDataURL;
        img.addEventListener(
          'load',
          () => {
            const maxW = 220;
            const natRatio = img.naturalWidth / img.naturalHeight;
            let w = Math.min(maxW, img.naturalWidth);
            let h = w / natRatio;
            ann.width = w;
            ann.height = h;
            ann.aspectRatio = w / h;
            applyImgTransform(ann);
            if (selected === ann) positionPropsPanel(ann);
          },
          { once: true }
        );
        showToast(window.t('toast.sigReplaced', 'Signature replaced.'), 'success');
      });
    } else {
      // For a regular image, offer to replace from file
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        const newDataURL = await fileToDataURL(file);
        ann.dataURL = newDataURL;
        ann.mimeType = file.type;
        img.src = newDataURL;
        showToast('Image replaced.', 'success');
      };
      fileInput.click();
    }
  });

  return ann;
}

function applyImgTransform(ann) {
  ann.el.style.left = ann.x + 'px';
  ann.el.style.top = ann.y + 'px';
  ann.el.style.width = ann.width + 'px';
  ann.el.style.height = ann.height + 'px';
  ann.el.style.transform = `rotate(${ann.rotation}deg)`;
}

function enableImageInteractions(container, ann) {
  const img = container.querySelector('img');
  const handles = container.querySelectorAll('.img-handle:not(.rot)');
  const rotHandle = container.querySelector('.img-handle.rot');

  // === MOVE: dragging the image body ===
  let mDragging = false,
    mDownX = 0,
    mDownY = 0,
    mStartX = 0,
    mStartY = 0,
    mMoved = false;
  let mWoStartX = 0,
    mWoStartY = 0;
  let mRestOpacity = '1';
  img.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    mDragging = true;
    mMoved = false;
    mDownX = e.clientX;
    mDownY = e.clientY;
    mStartX = ann.x;
    mStartY = ann.y;
    if (ann.sourceWhiteout) {
      mWoStartX = ann.sourceWhiteout.x;
      mWoStartY = ann.sourceWhiteout.y;
    }
    mRestOpacity =
      ann.opacity != null && ann.opacity < 1 ? String(ann.opacity) : container.style.opacity || '1';
    container.style.opacity = String(Math.max(0.15, parseFloat(mRestOpacity) * 0.85));
  });
  window.addEventListener('pointermove', (e) => {
    if (!mDragging) return;
    const dx = (e.clientX - mDownX) / currentZoom;
    const dy = (e.clientY - mDownY) / currentZoom;
    if (!mMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    mMoved = true;
    const overlay = container.parentElement;
    let nx = Math.max(0, Math.min(overlay.offsetWidth - ann.width, mStartX + dx));
    let ny = Math.max(0, Math.min(overlay.offsetHeight - ann.height, mStartY + dy));
    const snapped = snapPosition(ann, nx, ny, ann.width, ann.height);
    ann.x = snapped.x;
    ann.y = snapped.y;
    applyImgTransform(ann);
    // Edit-PDF image grab: keep the bound cover under the image as it moves.
    if (ann.sourceWhiteout && ann.sourceWhiteout.el) {
      const wo = ann.sourceWhiteout;
      wo.x = mWoStartX + (ann.x - mStartX);
      wo.y = mWoStartY + (ann.y - mStartY);
      wo.el.style.left = wo.x + 'px';
      wo.el.style.top = wo.y + 'px';
    }
    if (selected === ann) positionPropsPanel(ann);
  });
  window.addEventListener('pointerup', () => {
    if (!mDragging) return;
    container.style.opacity = mRestOpacity;
    hideAlignmentGuides();
    if (!mMoved) select(ann);
    mDragging = false;
  });

  // === RESIZE: dragging a corner handle ===
  handles.forEach((h) => {
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      try {
        h.setPointerCapture(e.pointerId);
      } catch (_) {}
      select(ann);
      const corner = h.dataset.corner;
      const startX = e.clientX,
        startY = e.clientY;
      const startW = ann.width,
        startH = ann.height;
      const startCX = ann.x + startW / 2;
      const startCY = ann.y + startH / 2;
      const aspect = ann.aspectRatio && ann.aspectRatio > 0 ? ann.aspectRatio : startW / startH;
      const theta = ((ann.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(theta),
        sin = Math.sin(theta);

      function onMove(ev) {
        // Mouse delta in design space (account for zoom)
        const dx = (ev.clientX - startX) / currentZoom;
        const dy = (ev.clientY - startY) / currentZoom;
        // Rotate delta into image's local (unrotated) frame
        const lmdx = dx * cos + dy * sin;
        const lmdy = -dx * sin + dy * cos;

        // Sign for each corner: in local frame, anchor opposite corner stays put.
        // SE handle: +X, +Y. Width change = +lmdx, height change = +lmdy
        // NE handle: +X, -Y. Width = +lmdx, height = -lmdy
        // SW handle: -X, +Y. Width = -lmdx, height = +lmdy
        // NW handle: -X, -Y. Width = -lmdx, height = -lmdy
        const sx = corner === 'se' || corner === 'ne' ? 1 : -1;
        const sy = corner === 'se' || corner === 'sw' ? 1 : -1;
        let newW = startW + sx * lmdx;
        let newH = startH + sy * lmdy;

        // Lock aspect unless Shift is held
        if (!ev.shiftKey) {
          // Use the larger relative change as driver
          const rW = newW / startW,
            rH = newH / startH;
          const r = Math.abs(rW - 1) > Math.abs(rH - 1) ? rW : rH;
          newW = startW * r;
          newH = newW / aspect;
        }

        // Minimum size
        const MIN = 20;
        if (newW < MIN) {
          newW = MIN;
          if (!ev.shiftKey) newH = newW / aspect;
        }
        if (newH < MIN) {
          newH = MIN;
          if (!ev.shiftKey) newW = newH * aspect;
        }

        // Anchor opposite corner of dragged corner.
        // Compute the anchor corner's viewport position from initial state,
        // then derive new center so anchor stays put after resize.
        // Anchor offset in local frame from center, BEFORE resize:
        const ax_local = -sx * (startW / 2);
        const ay_local = -sy * (startH / 2);
        // After rotation, anchor offset in global frame:
        const ax_global = ax_local * cos - ay_local * sin;
        const ay_global = ax_local * sin + ay_local * cos;
        // Anchor global position (constant during resize):
        const anchorX = startCX + ax_global;
        const anchorY = startCY + ay_global;
        // New anchor local offset (from new center):
        const nax_local = -sx * (newW / 2);
        const nay_local = -sy * (newH / 2);
        // In global:
        const nax_global = nax_local * cos - nay_local * sin;
        const nay_global = nax_local * sin + nay_local * cos;
        // New center:
        const newCX = anchorX - nax_global;
        const newCY = anchorY - nay_global;

        ann.width = newW;
        ann.height = newH;
        ann.x = newCX - newW / 2;
        ann.y = newCY - newH / 2;
        if (!ev.shiftKey) ann.aspectRatio = aspect;
        else ann.aspectRatio = newW / newH;
        applyImgTransform(ann);
        if (selected === ann) positionPropsPanel(ann);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  });

  // === ROTATE: dragging the rotate handle ===
  rotHandle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      rotHandle.setPointerCapture(e.pointerId);
    } catch (_) {}
    select(ann);
    // Compute image center in viewport coords
    const rect = container.getBoundingClientRect();
    const cx_view = rect.left + rect.width / 2;
    const cy_view = rect.top + rect.height / 2;

    function onMove(ev) {
      const angleRad = Math.atan2(ev.clientY - cy_view, ev.clientX - cx_view);
      // Rotate handle is positioned at "top" of image, so 0° rotation = handle points UP (angle = -π/2)
      // We want rotation = mouse_angle_from_center + 90° (so when mouse is above, rotation is 0)
      // Handle sits to the right (neutral pos = mouse pointing east, angle = 0)
      let deg = (angleRad * 180) / Math.PI;
      if (deg < 0) deg += 360;
      if (deg >= 360) deg -= 360;
      // Snap to 15° when Shift held
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      ann.rotation = deg;
      applyImgTransform(ann);
      if (selected === ann) {
        // Update rotation input in panel
        const rotInput = document.querySelector('.protate-input');
        if (rotInput) rotInput.value = Math.round(deg);
        positionPropsPanel(ann);
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}
