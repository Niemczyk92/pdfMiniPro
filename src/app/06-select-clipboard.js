// === SELECT + PANEL ===
function select(ann, opts) {
  const additive = opts && opts.additive;
  if (!additive) {
    // Single-select: clear previous, add this one
    if (selected === ann && selectedSet.size === 1) {
      buildPropsPanel(ann);
      positionPropsPanel(ann);
      return;
    }
    for (const a of selectedSet) {
      if (a !== ann && a.el) a.el.classList.remove('selected');
    }
    selectedSet.clear();
  }
  selectedSet.add(ann);
  selected = ann;
  ann.el.classList.add('selected');
  buildPropsPanel(ann);
  positionPropsPanel(ann);
  if (!activeEditor) setContext('selected');
}
function deselect() {
  // Guard: when a text editor just committed, the same click can bubble through
  // several deselect-callers (overlay pointerdown, marquee pointerup, document
  // mousedown). All of them are blocked for a short window so the freshly-
  // committed annotation stays selected with handles visible — exact same UX
  // as paste-from-clipboard.
  if (Date.now() < _deselectLockUntil) return;
  if (!selectedSet.size) return;
  for (const a of selectedSet) {
    if (a.el) a.el.classList.remove('selected');
  }
  selectedSet.clear();
  selected = null;
  hidePropsPanel();
  if (pdfJsDoc && !activeEditor) setContext(currentTool);
}
function hidePropsPanel() {
  document.getElementById('propsPanel').classList.remove('show');
}

function buildPropsPanel(ann) {
  const panel = document.getElementById('propsPanel');
  panel.innerHTML = '';
  const editing = activeEditor && activeEditorAnn === ann;
  panel.classList.toggle('editing', !!editing);

  if (ann.type === 'text') {
    const bg = mkGroup();
    bg.appendChild(mkFormatBtn('B', 'bold', ann, editing));
    bg.appendChild(mkFormatBtn('I', 'italic', ann, editing));
    bg.appendChild(mkFormatBtn('U', 'underline', ann, editing));
    panel.appendChild(bg);

    const sg = mkGroup();
    const sIn = document.createElement('input');
    sIn.type = 'number';
    sIn.min = '6';
    sIn.max = '96';
    sIn.className = 'psize-input';
    sIn.value = ann.fontSize;
    sIn.title = window.t('props.textSize', 'Text size');
    sIn.addEventListener('mousedown', (e) => e.stopPropagation());
    sIn.addEventListener('input', () => {
      const v = parseInt(sIn.value);
      if (v >= 6 && v <= 96) {
        ann.fontSize = v;
        ann.el.style.fontSize = v + 'px';
        if (activeEditor && activeEditorAnn === ann) activeEditor.style.fontSize = v + 'px';
        ann.width = ann.el.offsetWidth;
        ann.height = ann.el.offsetHeight;
        positionPropsPanel(ann);
      }
    });
    sg.appendChild(sIn);
    panel.appendChild(sg);

    const cg = mkGroup();
    PALETTE.forEach((col) => cg.appendChild(mkSwatch(col, ann, editing)));
    const cIn = document.createElement('input');
    cIn.type = 'color';
    cIn.className = 'pcolor-input';
    cIn.title = window.t('props.customColor', 'Custom color');
    cIn.value = currentColorOf(ann, editing);
    cIn.addEventListener('mousedown', (e) => e.stopPropagation());
    cIn.addEventListener('input', () => applyColor(cIn.value, ann, editing));
    cg.appendChild(cIn);
    cg.appendChild(mkEyedropper((hex) => applyColor(hex, ann, editing)));
    panel.appendChild(cg);

    const bgGroup = mkGroup();
    const bgBtn = document.createElement('button');
    bgBtn.className = 'pbtn bg-toggle';
    bgBtn.innerHTML = ann.noBackground ? '◻ BG' : '■ BG';
    bgBtn.title = ann.noBackground
      ? window.t('props.bgOff', 'Background: OFF (click to add white background)')
      : window.t('props.bgOn', 'Background: ON (click for transparent)');
    if (!ann.noBackground) bgBtn.classList.add('active');
    bgBtn.addEventListener('click', () => {
      ann.noBackground = !ann.noBackground;
      ann.el.classList.toggle('no-bg', ann.noBackground);
      if (activeEditor && activeEditorAnn === ann) activeEditor.classList.toggle('no-bg', ann.noBackground);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    bgGroup.appendChild(bgBtn);
    panel.appendChild(bgGroup);

    // === PRO: font family dropdown ===
    const ffGroup = mkGroup();
    const ffSel = document.createElement('select');
    ffSel.className = 'pselect';
    ffSel.title = window.t('props.fontFamily', 'Font family');
    ['Helvetica', 'Times-Roman', 'Courier'].forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f === 'Times-Roman' ? 'Times' : f;
      if ((ann.fontFamily || 'Helvetica') === f) opt.selected = true;
      ffSel.appendChild(opt);
    });
    ffSel.addEventListener('mousedown', (e) => e.stopPropagation());
    ffSel.addEventListener('change', () => {
      ann.fontFamily = ffSel.value;
      defaultTextFont = ffSel.value;
      applyTextAnnotationStyle(ann.el, ann);
      if (activeEditor && activeEditorAnn === ann) {
        activeEditor.style.fontFamily = TEXT_FONT_FAMILIES[ann.fontFamily] || TEXT_FONT_FAMILIES.Helvetica;
      }
      ann.width = ann.el.offsetWidth;
      ann.height = ann.el.offsetHeight;
      positionPropsPanel(ann);
    });
    ffGroup.appendChild(ffSel);
    panel.appendChild(ffGroup);

    // === PRO: line spacing ===
    const lhGroup = mkGroup();
    const lhSel = document.createElement('select');
    lhSel.className = 'pselect';
    lhSel.title = window.t('props.lineSpacing', 'Line spacing');
    [
      ['1.0', 1.0],
      ['1.15', 1.15],
      ['1.5', 1.5],
      ['2.0', 2.0],
    ].forEach(([label, val]) => {
      const opt = document.createElement('option');
      opt.value = String(val);
      opt.textContent = '⇕ ' + label;
      if (Math.abs((ann.lineHeight || 1.15) - val) < 0.01) opt.selected = true;
      lhSel.appendChild(opt);
    });
    lhSel.addEventListener('mousedown', (e) => e.stopPropagation());
    lhSel.addEventListener('change', () => {
      ann.lineHeight = parseFloat(lhSel.value);
      defaultLineHeight = ann.lineHeight;
      applyTextAnnotationStyle(ann.el, ann);
      if (activeEditor && activeEditorAnn === ann) activeEditor.style.lineHeight = String(ann.lineHeight);
      ann.width = ann.el.offsetWidth;
      ann.height = ann.el.offsetHeight;
      positionPropsPanel(ann);
    });
    lhGroup.appendChild(lhSel);
    panel.appendChild(lhGroup);

    // === PRO: alignment buttons ===
    const alGroup = mkGroup();
    [
      ['left', '⇤'],
      ['center', '↔'],
      ['right', '⇥'],
    ].forEach(([val, sym]) => {
      const ab = document.createElement('button');
      ab.className = 'pbtn';
      ab.innerHTML = sym;
      ab.title = window.t('props.align.' + val, 'Align ' + val);
      if ((ann.align || 'left') === val) ab.classList.add('active');
      ab.addEventListener('click', () => {
        ann.align = val;
        defaultAlign = val;
        applyTextAnnotationStyle(ann.el, ann);
        if (activeEditor && activeEditorAnn === ann) activeEditor.style.textAlign = val;
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      });
      alGroup.appendChild(ab);
    });
    panel.appendChild(alGroup);

    // === Rotation buttons (foolproof: don't depend on the floating handle) ===
    if (!editing) {
      const rg = mkGroup();
      const rLabel = document.createElement('span');
      rLabel.className = 'plabel';
      rLabel.textContent = window.t('props.rotate', 'Rotate:');
      rg.appendChild(rLabel);
      const rotLeft = document.createElement('button');
      rotLeft.className = 'pbtn';
      rotLeft.innerHTML = '↶';
      rotLeft.title = window.t('props.rotateLeft', 'Rotate 90° left');
      rg.appendChild(rotLeft);
      const rotRight = document.createElement('button');
      rotRight.className = 'pbtn';
      rotRight.innerHTML = '↷';
      rotRight.title = window.t('props.rotateRight', 'Rotate 90° right');
      rg.appendChild(rotRight);
      const rIn = document.createElement('input');
      rIn.type = 'number';
      rIn.min = '-360';
      rIn.max = '360';
      rIn.className = 'protate-input';
      rIn.value = Math.round(ann.rotation || 0);
      rIn.title = window.t('props.rotDeg', 'Rotation (degrees)');
      rIn.addEventListener('mousedown', (e) => e.stopPropagation());
      rIn.addEventListener('input', () => {
        let v = parseFloat(rIn.value);
        if (isNaN(v)) return;
        v = ((v % 360) + 360) % 360;
        ann.rotation = v;
        applyTextAnnotationStyle(ann.el, ann);
        positionPropsPanel(ann);
      });
      rg.appendChild(rIn);
      const resetRot = document.createElement('button');
      resetRot.className = 'pbtn';
      resetRot.innerHTML = '↺';
      resetRot.title = window.t('props.resetRot', 'Reset rotation');
      const textRotateBy = (deg) => {
        let v = ((ann.rotation || 0) + deg) % 360;
        if (v < 0) v += 360;
        ann.rotation = v;
        rIn.value = Math.round(v);
        applyTextAnnotationStyle(ann.el, ann);
        positionPropsPanel(ann);
      };
      rotLeft.addEventListener('click', () => textRotateBy(-90));
      rotRight.addEventListener('click', () => textRotateBy(90));
      resetRot.addEventListener('click', () => {
        ann.rotation = 0;
        rIn.value = 0;
        applyTextAnnotationStyle(ann.el, ann);
        positionPropsPanel(ann);
      });
      rg.appendChild(resetRot);
      panel.appendChild(rg);
    }

    const ag = mkGroup();
    if (editing) {
      const doneBtn = document.createElement('button');
      doneBtn.className = 'pbtn primary';
      doneBtn.innerHTML = '✓';
      doneBtn.title = window.t('props.doneEnter', 'Done (Enter)');
      doneBtn.addEventListener('click', () => commitEditor(true));
      ag.appendChild(doneBtn);
    } else {
      const editBtn = document.createElement('button');
      editBtn.className = 'pbtn';
      editBtn.innerHTML = '✎';
      editBtn.title = window.t('props.editText', 'Edit text (or double-click)');
      editBtn.addEventListener('click', () =>
        openTextEditor(ann.el.parentElement, ann.pageNum, ann.x, ann.y, ann)
      );
      ag.appendChild(editBtn);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      if (activeEditor && activeEditorAnn === ann) commitEditor(false);
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);

    if (editing) {
      const hint = document.createElement('div');
      hint.className = 'panel-hint';
      hint.innerHTML = window.t(
        'props.editHint',
        'Select text to format · <kbd>Enter</kbd> finish · <kbd>Shift</kbd>+<kbd>Enter</kbd> new line · <kbd>Esc</kbd> cancel'
      );
      panel.appendChild(hint);
    }
  } else if (ann.type === 'image') {
    // Quick rotation buttons + numeric input
    const rg = mkGroup();
    const rLabel = document.createElement('span');
    rLabel.className = 'plabel';
    rLabel.textContent = window.t('props.rotate', 'Rotate:');
    rg.appendChild(rLabel);
    const rotLeftBtn = document.createElement('button');
    rotLeftBtn.className = 'pbtn';
    rotLeftBtn.innerHTML = '↶';
    rotLeftBtn.title = window.t('props.rotateLeft', 'Rotate 90° left');
    rg.appendChild(rotLeftBtn);
    const rotRightBtn = document.createElement('button');
    rotRightBtn.className = 'pbtn';
    rotRightBtn.innerHTML = '↷';
    rotRightBtn.title = window.t('props.rotateRight', 'Rotate 90° right');
    rg.appendChild(rotRightBtn);
    const rIn = document.createElement('input');
    rIn.type = 'number';
    rIn.min = '-360';
    rIn.max = '360';
    rIn.className = 'protate-input';
    rIn.value = Math.round(ann.rotation || 0);
    rIn.title = 'Rotation (degrees)';
    rIn.addEventListener('mousedown', (e) => e.stopPropagation());
    rIn.addEventListener('input', () => {
      let v = parseFloat(rIn.value);
      if (isNaN(v)) return;
      v = ((v % 360) + 360) % 360;
      ann.rotation = v;
      applyImgTransform(ann);
      positionPropsPanel(ann);
    });
    rg.appendChild(rIn);
    const resetRot = document.createElement('button');
    resetRot.className = 'pbtn';
    resetRot.innerHTML = '↺';
    resetRot.title = window.t('props.resetRot0', 'Reset rotation to 0°');
    const rotateBy = (deg) => {
      let v = ((ann.rotation || 0) + deg) % 360;
      if (v < 0) v += 360;
      ann.rotation = v;
      rIn.value = Math.round(v);
      applyImgTransform(ann);
      positionPropsPanel(ann);
    };
    rotLeftBtn.addEventListener('click', () => rotateBy(-90));
    rotRightBtn.addEventListener('click', () => rotateBy(90));
    resetRot.addEventListener('click', () => {
      ann.rotation = 0;
      rIn.value = 0;
      applyImgTransform(ann);
      positionPropsPanel(ann);
    });
    rg.appendChild(resetRot);
    panel.appendChild(rg);

    // Rotation slider (fine control)
    const sg = mkGroup();
    const sLabel = document.createElement('span');
    sLabel.className = 'plabel';
    sLabel.textContent = window.t('props.fine', 'Fine:');
    sg.appendChild(sLabel);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '360';
    slider.step = '1';
    slider.value = Math.round(ann.rotation || 0);
    slider.className = 'protate-slider';
    slider.title = window.t('props.fineRot', 'Fine rotation control');
    slider.addEventListener('mousedown', (e) => e.stopPropagation());
    slider.addEventListener('input', () => {
      ann.rotation = parseInt(slider.value);
      rIn.value = slider.value;
      applyImgTransform(ann);
      positionPropsPanel(ann);
    });
    sg.appendChild(slider);
    panel.appendChild(sg);

    // Hint
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.innerHTML = window.t(
      'props.imgHint',
      'Drag corners to resize · use ↶ ↷ for quick 90° rotation · <kbd>Shift</kbd> for free aspect'
    );
    panel.appendChild(hint);

    // Delete
    const ag = mkGroup();
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  } else if (ann.type === 'draw') {
    const cg = mkGroup();
    PALETTE.forEach((col) => {
      const sw = document.createElement('button');
      sw.className = 'pswatch';
      sw.style.background = col;
      if (col === '#ffffff') sw.style.borderColor = 'var(--border-strong)';
      if (col.toLowerCase() === (ann.color || '').toLowerCase()) sw.classList.add('active');
      sw.title = col;
      sw.addEventListener('click', () => {
        ann.color = col;
        renderDrawAnnotation(ann);
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      });
      cg.appendChild(sw);
    });
    const cIn = document.createElement('input');
    cIn.type = 'color';
    cIn.className = 'pcolor-input';
    cIn.title = window.t('props.customColor', 'Custom color');
    cIn.value = ann.color || '#000000';
    cIn.addEventListener('mousedown', (e) => e.stopPropagation());
    cIn.addEventListener('input', () => {
      ann.color = cIn.value;
      renderDrawAnnotation(ann);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    cg.appendChild(cIn);
    cg.appendChild(
      mkEyedropper((hex) => {
        ann.color = hex;
        renderDrawAnnotation(ann);
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      })
    );
    panel.appendChild(cg);

    const sg = mkGroup();
    const sLabel = document.createElement('span');
    sLabel.className = 'plabel';
    sLabel.textContent = 'Width:';
    sg.appendChild(sLabel);
    const sIn = document.createElement('input');
    sIn.type = 'number';
    sIn.min = '1';
    sIn.max = '20';
    sIn.className = 'psize-input';
    sIn.value = ann.strokeWidth;
    sIn.title = 'Stroke width';
    sIn.addEventListener('mousedown', (e) => e.stopPropagation());
    sIn.addEventListener('input', () => {
      const v = parseInt(sIn.value);
      if (v >= 1 && v <= 20) {
        ann.strokeWidth = v;
        renderDrawAnnotation(ann);
        positionPropsPanel(ann);
      }
    });
    sg.appendChild(sIn);
    panel.appendChild(sg);

    // Brush type
    const bg = mkGroup();
    [
      ['pen', '✒'],
      ['pencil', '✏'],
      ['highlighter', '🖊'],
      ['marker', '🖌'],
    ].forEach(([key, icon]) => {
      const bb = document.createElement('button');
      bb.className = 'pbtn' + ((ann.brush || 'pen') === key ? ' active' : '');
      bb.textContent = icon;
      bb.title = window.t('brush.' + key, key.charAt(0).toUpperCase() + key.slice(1));
      bb.addEventListener('click', () => {
        ann.brush = key;
        renderDrawAnnotation(ann);
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      });
      bg.appendChild(bb);
    });
    panel.appendChild(bg);

    const ag = mkGroup();
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  } else if (ann.type === 'field') {
    // Field type
    const tg = mkGroup();
    const tLab = document.createElement('span');
    tLab.className = 'plabel';
    tLab.textContent = window.t('props.fieldType', 'Type');
    tg.appendChild(tLab);
    const tSel = document.createElement('select');
    tSel.className = 'select-input';
    [
      ['text', window.t('field.text', 'Text')],
      ['multiline', window.t('field.multiline', 'Multi-line text')],
      ['number', window.t('field.number', 'Number')],
      ['date', window.t('field.date', 'Date')],
      ['check', window.t('field.check', 'Checkbox')],
      ['dropdown', window.t('field.dropdown', 'Dropdown')],
      ['combobox', window.t('field.combobox', 'Combobox')],
      ['multiselect', window.t('field.multiselect', 'Multi-select list')],
    ].forEach(([v, lab]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = lab;
      if (ann.subtype === v) o.selected = true;
      tSel.appendChild(o);
    });
    tSel.addEventListener('mousedown', (e) => e.stopPropagation());
    tSel.addEventListener('change', () => {
      ann.subtype = tSel.value;
      if (ann.subtype === 'check' && !['checked', 'unchecked'].includes(ann.defaultValue))
        ann.defaultValue = 'unchecked';
      if (
        (ann.subtype === 'dropdown' || ann.subtype === 'combobox' || ann.subtype === 'multiselect') &&
        (!ann.options || !ann.options.length)
      )
        ann.options = ['Option 1', 'Option 2', 'Option 3'];
      renderFieldAnnotation(ann);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    tg.appendChild(tSel);
    panel.appendChild(tg);
    // Name
    const ng = mkGroup();
    const nLab = document.createElement('span');
    nLab.className = 'plabel';
    nLab.textContent = window.t('props.fieldName', 'Field name');
    ng.appendChild(nLab);
    const nIn = document.createElement('input');
    nIn.type = 'text';
    nIn.className = 'pcolor-input';
    nIn.style.width = '120px';
    nIn.value = ann.fieldName || '';
    nIn.addEventListener('mousedown', (e) => e.stopPropagation());
    nIn.addEventListener('input', () => {
      ann.fieldName = nIn.value.replace(/[^\w.-]/g, '_') || ann.fieldName;
      renderFieldAnnotation(ann);
    });
    ng.appendChild(nIn);
    panel.appendChild(ng);
    // Options list (dropdown + combobox + multiselect)
    if (ann.subtype === 'dropdown' || ann.subtype === 'combobox' || ann.subtype === 'multiselect') {
      const og = mkGroup();
      const oLab = document.createElement('span');
      oLab.className = 'plabel';
      oLab.textContent = window.t('props.fieldOptions', 'Options (one per line)');
      og.appendChild(oLab);
      const oTa = document.createElement('textarea');
      oTa.style.cssText =
        'width:180px;height:64px;font-size:11px;font-family:monospace;border:1px solid var(--border);border-radius:6px;padding:4px;';
      oTa.value = (ann.options || []).join('\n');
      oTa.addEventListener('mousedown', (e) => e.stopPropagation());
      oTa.addEventListener('input', () => {
        ann.options = oTa.value
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length);
        renderFieldAnnotation(ann);
      });
      og.appendChild(oTa);
      panel.appendChild(og);
    }
    // Default value
    const vg = mkGroup();
    const vLab = document.createElement('span');
    vLab.className = 'plabel';
    vLab.textContent =
      ann.subtype === 'button'
        ? window.t('props.fieldButtonLabel', 'Button label')
        : window.t('props.fieldDefault', 'Default value');
    vg.appendChild(vLab);
    if (ann.subtype === 'check' || ann.subtype === 'toggle') {
      const vSel = document.createElement('select');
      vSel.className = 'select-input';
      const opts =
        ann.subtype === 'toggle'
          ? [
              ['off', '⇆ Off'],
              ['on', '⇆ On'],
            ]
          : [
              ['unchecked', '☐'],
              ['checked', '☑'],
            ];
      opts.forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if (ann.defaultValue === v) o.selected = true;
        vSel.appendChild(o);
      });
      vSel.addEventListener('mousedown', (e) => e.stopPropagation());
      vSel.addEventListener('change', () => {
        ann.defaultValue = vSel.value;
        renderFieldAnnotation(ann);
      });
      vg.appendChild(vSel);
    } else if (ann.subtype === 'dropdown') {
      const vSel = document.createElement('select');
      vSel.className = 'select-input';
      const opts = ann.options && ann.options.length ? ann.options : [''];
      [''].concat(opts).forEach((v) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = v || '(none)';
        if (ann.defaultValue === v) o.selected = true;
        vSel.appendChild(o);
      });
      vSel.addEventListener('mousedown', (e) => e.stopPropagation());
      vSel.addEventListener('change', () => {
        ann.defaultValue = vSel.value;
        renderFieldAnnotation(ann);
      });
      vg.appendChild(vSel);
    } else if (ann.subtype === 'multiline') {
      const vTa = document.createElement('textarea');
      vTa.style.cssText =
        'width:180px;height:54px;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:4px;';
      vTa.value = String(ann.defaultValue || '');
      vTa.addEventListener('mousedown', (e) => e.stopPropagation());
      vTa.addEventListener('input', () => {
        ann.defaultValue = vTa.value;
        renderFieldAnnotation(ann);
      });
      vg.appendChild(vTa);
    } else if (ann.subtype === 'date') {
      // Real native calendar in the editor — works in every browser, regardless
      // of the saved PDF's viewer (the AA-attached AFDate actions handle the
      // saved-PDF side, but Acrobat is the only viewer that pops a calendar
      // out of the field itself).
      const vIn = document.createElement('input');
      vIn.type = 'date';
      vIn.className = 'pcolor-input';
      vIn.style.width = '150px';
      vIn.value = String(ann.defaultValue || '');
      vIn.addEventListener('mousedown', (e) => e.stopPropagation());
      vIn.addEventListener('input', () => {
        ann.defaultValue = vIn.value;
        renderFieldAnnotation(ann);
      });
      vg.appendChild(vIn);
    } else if (ann.subtype === 'signature') {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:11px;color:var(--muted);max-width:170px;line-height:1.35';
      note.textContent = window.t(
        'props.fieldSigNote',
        'Signature placeholder — Bank-ID / PAdES is applied at signing time.'
      );
      vg.appendChild(note);
    } else {
      // text / number / multiselect / combobox / button label — plain text input.
      const vIn = document.createElement('input');
      vIn.type = 'text';
      vIn.className = 'pcolor-input';
      vIn.style.width = '140px';
      vIn.value = String(ann.defaultValue || '');
      if (ann.subtype === 'number') vIn.placeholder = '123 or 1.5';
      else if (ann.subtype === 'multiselect') vIn.placeholder = 'comma,separated';
      else if (ann.subtype === 'combobox') vIn.placeholder = 'type a value or leave empty';
      else if (ann.subtype === 'button') vIn.placeholder = 'Print / Submit / Clear';
      vIn.addEventListener('mousedown', (e) => e.stopPropagation());
      vIn.addEventListener('input', () => {
        ann.defaultValue = vIn.value;
        renderFieldAnnotation(ann);
      });
      vg.appendChild(vIn);
    }
    panel.appendChild(vg);
    // Number format
    if (ann.subtype === 'number') {
      const nfg = mkGroup();
      const nfLab = document.createElement('span');
      nfLab.className = 'plabel';
      nfLab.textContent = window.t('props.fieldNumberFormat', 'Format');
      nfg.appendChild(nfLab);
      const nfSel = document.createElement('select');
      nfSel.className = 'select-input';
      [
        ['plain', '1234.56'],
        ['integer', '1234'],
        ['USD', '$ 1234.56'],
        ['EUR', '1234.56 €'],
        ['CZK', '1234.56 Kč'],
        ['GBP', '£ 1234.56'],
        ['percent', '1234.56 %'],
      ].forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if ((ann.numberFormat || 'plain') === v) o.selected = true;
        nfSel.appendChild(o);
      });
      nfSel.addEventListener('mousedown', (e) => e.stopPropagation());
      nfSel.addEventListener('change', () => {
        ann.numberFormat = nfSel.value;
        renderFieldAnnotation(ann);
      });
      nfg.appendChild(nfSel);
      panel.appendChild(nfg);
    }
    // Date format
    if (ann.subtype === 'date') {
      const dfg = mkGroup();
      const dfLab = document.createElement('span');
      dfLab.className = 'plabel';
      dfLab.textContent = window.t('props.fieldDateFormat', 'Format');
      dfg.appendChild(dfLab);
      const dfSel = document.createElement('select');
      dfSel.className = 'select-input';
      [
        ['yyyy-mm-dd', 'ISO — 2026-05-29'],
        ['mm/dd/yyyy', 'US — 05/29/2026'],
        ['dd.mm.yyyy', 'EU — 29.05.2026'],
        ['dd/mm/yyyy', 'UK — 29/05/2026'],
        ['mmm d, yyyy', 'Long — May 29, 2026'],
      ].forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if ((ann.dateFormat || 'yyyy-mm-dd') === v) o.selected = true;
        dfSel.appendChild(o);
      });
      dfSel.addEventListener('mousedown', (e) => e.stopPropagation());
      dfSel.addEventListener('change', () => {
        ann.dateFormat = dfSel.value;
        renderFieldAnnotation(ann);
      });
      dfg.appendChild(dfSel);
      panel.appendChild(dfg);
    }
    // Action kind (button)
    if (ann.subtype === 'button') {
      const akg = mkGroup();
      const akLab = document.createElement('span');
      akLab.className = 'plabel';
      akLab.textContent = window.t('props.fieldAction', 'Action');
      akg.appendChild(akLab);
      const akSel = document.createElement('select');
      akSel.className = 'select-input';
      [
        ['print', '🖨 Print'],
        ['clear', '⟲ Clear / Reset'],
        ['submit', '📧 Submit (email)'],
        ['save', '💾 Save'],
      ].forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if ((ann.actionKind || 'print') === v) o.selected = true;
        akSel.appendChild(o);
      });
      akSel.addEventListener('mousedown', (e) => e.stopPropagation());
      akSel.addEventListener('change', () => {
        const prev = ann.actionKind || 'print';
        const next = akSel.value;
        ann.actionKind = next;
        // Auto-rename the button label when the user picks a new action, but
        // only if the current label is the previous action's auto-default —
        // never clobber a custom label.
        const def = { print: 'Print', submit: 'Submit', clear: 'Clear', save: 'Save' };
        if (!ann.defaultValue || ann.defaultValue === def[prev]) ann.defaultValue = def[next];
        buildPropsPanel(ann);
        positionPropsPanel(ann);
        renderFieldAnnotation(ann);
      });
      akg.appendChild(akSel);
      panel.appendChild(akg);
      // Submit-to email (only when action = submit)
      if ((ann.actionKind || 'print') === 'submit') {
        const eg = mkGroup();
        const eLab = document.createElement('span');
        eLab.className = 'plabel';
        eLab.textContent = window.t('props.fieldSubmitTo', 'Send to');
        eg.appendChild(eLab);
        const eIn = document.createElement('input');
        eIn.type = 'email';
        eIn.className = 'pcolor-input';
        eIn.style.width = '170px';
        eIn.value = ann.submitTo || '';
        eIn.placeholder = 'you@example.com';
        eIn.addEventListener('mousedown', (e) => e.stopPropagation());
        eIn.addEventListener('input', () => {
          ann.submitTo = eIn.value;
        });
        eg.appendChild(eIn);
        panel.appendChild(eg);
      }
    }
    // Signature kind
    if (ann.subtype === 'signature') {
      const skg = mkGroup();
      const skLab = document.createElement('span');
      skLab.className = 'plabel';
      skLab.textContent = window.t('props.fieldSigKind', 'Signature kind');
      skg.appendChild(skLab);
      const skSel = document.createElement('select');
      skSel.className = 'select-input';
      [
        ['simple', 'Simple signature'],
        ['certified', 'Certified (Bank-ID / PAdES)'],
      ].forEach(([v, lab]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = lab;
        if ((ann.sigKind || 'simple') === v) o.selected = true;
        skSel.appendChild(o);
      });
      skSel.addEventListener('mousedown', (e) => e.stopPropagation());
      skSel.addEventListener('change', () => {
        ann.sigKind = skSel.value;
      });
      skg.appendChild(skSel);
      panel.appendChild(skg);
    }
    // Required + Tooltip + Tab order — apply to (almost) every field
    if (ann.subtype !== 'signature' && ann.subtype !== 'button') {
      const rg = mkGroup();
      const rLab = document.createElement('label');
      rLab.style.cssText =
        'display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;color:var(--text)';
      const rCk = document.createElement('input');
      rCk.type = 'checkbox';
      rCk.checked = !!ann.required;
      rCk.addEventListener('mousedown', (e) => e.stopPropagation());
      rCk.addEventListener('change', () => {
        ann.required = rCk.checked;
        renderFieldAnnotation(ann);
      });
      const rSpan = document.createElement('span');
      rSpan.textContent = window.t('props.fieldRequired', 'Required *');
      rLab.appendChild(rCk);
      rLab.appendChild(rSpan);
      rg.appendChild(rLab);
      panel.appendChild(rg);
    }
    // Tooltip (everywhere)
    {
      const tg = mkGroup();
      const tLab = document.createElement('span');
      tLab.className = 'plabel';
      tLab.textContent = window.t('props.fieldTooltip', 'Tooltip');
      tg.appendChild(tLab);
      const tIn = document.createElement('input');
      tIn.type = 'text';
      tIn.className = 'pcolor-input';
      tIn.style.width = '170px';
      tIn.value = ann.tooltip || '';
      tIn.placeholder = 'Shown when hovering';
      tIn.addEventListener('mousedown', (e) => e.stopPropagation());
      tIn.addEventListener('input', () => {
        ann.tooltip = tIn.value;
      });
      tg.appendChild(tIn);
      panel.appendChild(tg);
    }
    // Tab order
    {
      const tog = mkGroup();
      const toLab = document.createElement('span');
      toLab.className = 'plabel';
      toLab.textContent = window.t('props.fieldTabIndex', 'Tab #');
      tog.appendChild(toLab);
      const toIn = document.createElement('input');
      toIn.type = 'number';
      toIn.min = '0';
      toIn.step = '1';
      toIn.className = 'psize-input';
      toIn.style.width = '64px';
      toIn.value = String(ann.tabIndex != null ? ann.tabIndex : '');
      toIn.placeholder = 'auto';
      toIn.addEventListener('mousedown', (e) => e.stopPropagation());
      toIn.addEventListener('input', () => {
        const v = parseInt(toIn.value);
        ann.tabIndex = isFinite(v) ? v : undefined;
      });
      tog.appendChild(toIn);
      panel.appendChild(tog);
    }
    // Font size (everything except plain checkbox uses a font)
    if (ann.subtype !== 'check') {
      const fg = mkGroup();
      const fLab = document.createElement('span');
      fLab.className = 'plabel';
      fLab.textContent = window.t('props.fieldFontSize', 'Font size (pt)');
      fg.appendChild(fLab);
      const fIn = document.createElement('input');
      fIn.type = 'number';
      fIn.min = '6';
      fIn.max = '72';
      fIn.step = '1';
      fIn.className = 'psize-input';
      fIn.style.width = '60px';
      fIn.value = String(ann.fontSize || 12);
      fIn.addEventListener('mousedown', (e) => e.stopPropagation());
      fIn.addEventListener('input', () => {
        const v = parseInt(fIn.value);
        if (v >= 6 && v <= 72) {
          ann.fontSize = v;
          renderFieldAnnotation(ann);
        }
      });
      fg.appendChild(fIn);
      panel.appendChild(fg);
    }
    // Delete
    const ag = mkGroup();
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  } else if (ann.type === 'shape') {
    const isFillable = ['rect', 'ellipse', 'triangle', 'heart', 'star', 'lightning', 'cloud'].includes(
      ann.shape
    );

    // Stroke color
    const cg = mkGroup();
    const cLbl = document.createElement('span');
    cLbl.className = 'plabel';
    cLbl.textContent = 'Stroke:';
    cg.appendChild(cLbl);
    PALETTE.forEach((col) => {
      const sw = document.createElement('button');
      sw.className = 'pswatch';
      sw.style.background = col;
      if (col === '#ffffff') sw.style.borderColor = 'var(--border-strong)';
      if (col.toLowerCase() === (ann.stroke || '').toLowerCase()) sw.classList.add('active');
      sw.title = col;
      sw.addEventListener('click', () => {
        ann.stroke = col;
        renderShapeAnnotation(ann);
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      });
      cg.appendChild(sw);
    });
    const cIn = document.createElement('input');
    cIn.type = 'color';
    cIn.className = 'pcolor-input';
    cIn.title = 'Custom stroke color';
    cIn.value = ann.stroke || '#000000';
    cIn.addEventListener('mousedown', (e) => e.stopPropagation());
    cIn.addEventListener('input', () => {
      ann.stroke = cIn.value;
      renderShapeAnnotation(ann);
    });
    cg.appendChild(cIn);
    panel.appendChild(cg);

    // Stroke width
    const sg = mkGroup();
    const sLbl = document.createElement('span');
    sLbl.className = 'plabel';
    sLbl.textContent = 'Width:';
    sg.appendChild(sLbl);
    const sIn = document.createElement('input');
    sIn.type = 'number';
    sIn.min = '1';
    sIn.max = '20';
    sIn.className = 'psize-input';
    sIn.value = ann.strokeWidth;
    sIn.title = 'Stroke width';
    sIn.addEventListener('mousedown', (e) => e.stopPropagation());
    sIn.addEventListener('input', () => {
      const v = parseInt(sIn.value);
      if (v >= 1 && v <= 20) {
        ann.strokeWidth = v;
        renderShapeAnnotation(ann);
        positionPropsPanel(ann);
      }
    });
    sg.appendChild(sIn);
    panel.appendChild(sg);

    // Fill toggle + color (only for rect/ellipse)
    if (isFillable) {
      const fg = mkGroup();
      const fBtn = document.createElement('button');
      fBtn.className = 'pbtn bg-toggle';
      fBtn.innerHTML = ann.fill ? '■ Fill' : '◻ Fill';
      fBtn.title = ann.fill ? 'Fill: ON (click to remove)' : 'Fill: OFF (click to add)';
      if (ann.fill) fBtn.classList.add('active');
      fBtn.addEventListener('click', () => {
        ann.fill = ann.fill ? null : ann.lastFill || '#fde68a';
        if (ann.fill) ann.lastFill = ann.fill;
        renderShapeAnnotation(ann);
        buildPropsPanel(ann);
        positionPropsPanel(ann);
      });
      fg.appendChild(fBtn);
      if (ann.fill) {
        const fIn = document.createElement('input');
        fIn.type = 'color';
        fIn.className = 'pcolor-input';
        fIn.title = 'Fill color';
        fIn.value = ann.fill;
        fIn.addEventListener('mousedown', (e) => e.stopPropagation());
        fIn.addEventListener('input', () => {
          ann.fill = fIn.value;
          ann.lastFill = fIn.value;
          renderShapeAnnotation(ann);
        });
        fg.appendChild(fIn);
      }
      panel.appendChild(fg);
    }

    const ag = mkGroup();
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);

    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    if (ENDPOINT_SHAPES.includes(ann.shape)) {
      hint.innerHTML = window.t('props.endpointsHint', 'Drag endpoints to reshape · drag body to move');
    } else {
      hint.innerHTML = window.t(
        'props.shapeHint',
        'Drag corners to resize · <kbd>Shift</kbd> for free aspect'
      );
    }
    panel.appendChild(hint);
  } else if (ann.type === 'stamp') {
    // Font size
    const sg = mkGroup();
    const sLbl = document.createElement('span');
    sLbl.className = 'plabel';
    sLbl.textContent = 'Size:';
    sg.appendChild(sLbl);
    const sIn = document.createElement('input');
    sIn.type = 'number';
    sIn.min = '8';
    sIn.max = '96';
    sIn.className = 'psize-input';
    sIn.value = ann.fontSize;
    sIn.title = 'Stamp text size';
    sIn.addEventListener('mousedown', (e) => e.stopPropagation());
    sIn.addEventListener('input', () => {
      const v = parseInt(sIn.value);
      if (v >= 8 && v <= 96) {
        ann.fontSize = v;
        const sz = measureStamp(ann);
        ann.width = sz.w;
        ann.height = sz.h;
        renderStampAnnotation(ann);
        positionPropsPanel(ann);
      }
    });
    sg.appendChild(sIn);
    panel.appendChild(sg);
    // Quick rotation buttons + numeric input
    const rg = mkGroup();
    const rLbl = document.createElement('span');
    rLbl.className = 'plabel';
    rLbl.textContent = 'Rotate:';
    rg.appendChild(rLbl);
    const stampRotLeft = document.createElement('button');
    stampRotLeft.className = 'pbtn';
    stampRotLeft.innerHTML = '↶';
    stampRotLeft.title = 'Rotate 90° left';
    rg.appendChild(stampRotLeft);
    const stampRotRight = document.createElement('button');
    stampRotRight.className = 'pbtn';
    stampRotRight.innerHTML = '↷';
    stampRotRight.title = 'Rotate 90° right';
    rg.appendChild(stampRotRight);
    const rIn = document.createElement('input');
    rIn.type = 'number';
    rIn.min = '-360';
    rIn.max = '360';
    rIn.className = 'protate-input';
    rIn.value = Math.round(ann.rotation || 0);
    rIn.addEventListener('mousedown', (e) => e.stopPropagation());
    rIn.addEventListener('input', () => {
      let v = parseFloat(rIn.value);
      if (isNaN(v)) return;
      v = ((v % 360) + 360) % 360;
      ann.rotation = v;
      renderStampAnnotation(ann);
      positionPropsPanel(ann);
    });
    rg.appendChild(rIn);
    const resetRot = document.createElement('button');
    resetRot.className = 'pbtn';
    resetRot.innerHTML = '↺';
    resetRot.title = window.t('props.resetRot', 'Reset rotation');
    const stampRotateBy = (deg) => {
      let v = ((ann.rotation || 0) + deg) % 360;
      if (v < 0) v += 360;
      ann.rotation = v;
      rIn.value = Math.round(v);
      renderStampAnnotation(ann);
      positionPropsPanel(ann);
    };
    stampRotLeft.addEventListener('click', () => stampRotateBy(-90));
    stampRotRight.addEventListener('click', () => stampRotateBy(90));
    resetRot.addEventListener('click', () => {
      ann.rotation = 0;
      rIn.value = 0;
      renderStampAnnotation(ann);
      positionPropsPanel(ann);
    });
    rg.appendChild(resetRot);
    panel.appendChild(rg);
    // Edit + delete
    const ag = mkGroup();
    const editBtn = document.createElement('button');
    editBtn.className = 'pbtn';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit stamp (double-click stamp)';
    editBtn.addEventListener('click', () => openStampEditor(ann));
    ag.appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  } else if (ann.type === 'whiteout') {
    const ag = mkGroup();
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:12px;color:var(--text-soft);padding:0 8px;font-weight:600';
    lbl.textContent = 'White-out';
    ag.appendChild(lbl);
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = 'Delete this white-out (restores the original PDF text below)';
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.innerHTML =
      'This rectangle hides the original PDF text below. Drag to move; delete to undo the edit.';
    panel.appendChild(hint);
  } else if (ann.type === 'link') {
    // Label + Edit + Open + Delete. Mirrors the "white-out" simple panel.
    const ag = mkGroup();
    const lbl = document.createElement('span');
    lbl.style.cssText =
      'font-size:12px;color:var(--text-soft);padding:0 8px;font-weight:600;' +
      'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    lbl.textContent =
      ann.linkKind === 'page'
        ? '🔗 ' + (ann.linkLabel || ann.linkTarget)
        : '🔗 ' + (ann.linkLabel || ann.linkTarget || '(empty)');
    lbl.title = ann.linkTarget || '';
    ag.appendChild(lbl);
    const editBtn = document.createElement('button');
    editBtn.className = 'pbtn';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit link target';
    editBtn.addEventListener('click', () => openHyperlinkModal(ann));
    ag.appendChild(editBtn);
    const openBtn = document.createElement('button');
    openBtn.className = 'pbtn';
    openBtn.innerHTML = '↗';
    openBtn.title = 'Open in new tab';
    openBtn.addEventListener('click', () => {
      if (ann.linkKind === 'page') {
        const p = parseInt(String(ann.linkTarget).replace(/^#page=/, ''));
        const wrap = document.querySelector(`.page-wrapper[data-page-num="${p}"]`);
        if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (ann.linkTarget) {
        try {
          window.open(ann.linkTarget, '_blank', 'noopener,noreferrer');
        } catch (_) {}
      }
    });
    ag.appendChild(openBtn);
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  } else {
    const ag = mkGroup();
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:12px;color:var(--muted);padding:0 8px';
    lbl.textContent = 'Item';
    ag.appendChild(lbl);
    const delBtn = document.createElement('button');
    delBtn.className = 'pbtn danger';
    delBtn.innerHTML = '🗑';
    delBtn.title = window.t('props.delete', 'Delete (Del)');
    delBtn.addEventListener('click', () => {
      removeAnnotation(ann);
      deselect();
    });
    ag.appendChild(delBtn);
    panel.appendChild(ag);
  }

  // ===== Common controls appended to EVERY props panel =====
  // Z-order + lock toggle. Whiteouts get only z-order (they should always stay at the back anyway).
  if (ann.type !== 'whiteout') {
    const cz = mkGroup();
    const front = document.createElement('button');
    front.className = 'pbtn';
    front.innerHTML = '⤴';
    front.title = 'Bring to front';
    front.addEventListener('click', () => {
      bringToFront(ann);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    cz.appendChild(front);
    const back = document.createElement('button');
    back.className = 'pbtn';
    back.innerHTML = '⤵';
    back.title = 'Send to back';
    back.addEventListener('click', () => {
      sendToBack(ann);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    cz.appendChild(back);
    const lockBtn = document.createElement('button');
    lockBtn.className = 'pbtn' + (ann.locked ? ' active' : '');
    lockBtn.innerHTML = ann.locked ? '🔒' : '🔓';
    lockBtn.title = ann.locked ? 'Locked — click to unlock' : 'Lock this object (no drag/resize/rotate)';
    lockBtn.addEventListener('click', () => {
      setAnnotationLocked(ann, !ann.locked);
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
    cz.appendChild(lockBtn);
    // 🔗 Link toggle — attach / edit / remove a clickable link on this object.
    // When set, the annotation gets a small "↗" badge in the editor and
    // generatePdfBytes emits a real PDF Link annotation over its bbox.
    if (ann.type !== 'link') {
      // standalone-link type already manages its own link
      const linkBtn = document.createElement('button');
      const hasLink = !!(ann.link && ann.link.target);
      linkBtn.className = 'pbtn' + (hasLink ? ' active' : '');
      linkBtn.innerHTML = '🔗';
      linkBtn.title = hasLink
        ? 'Link: ' + (ann.link.label || ann.link.target) + ' — click to edit / remove'
        : 'Attach a clickable link to this object';
      linkBtn.addEventListener('click', () => openLinkAttachmentModal(ann));
      cz.appendChild(linkBtn);
      if (hasLink) {
        const openLink = document.createElement('button');
        openLink.className = 'pbtn';
        openLink.innerHTML = '↗';
        openLink.title = 'Open this link';
        openLink.addEventListener('click', () => followAnnLink(ann));
        cz.appendChild(openLink);
        const rmLink = document.createElement('button');
        rmLink.className = 'pbtn danger';
        rmLink.innerHTML = '⛓‍💥';
        rmLink.title = 'Remove the attached link';
        rmLink.addEventListener('click', () => removeAnnLink(ann));
        cz.appendChild(rmLink);
      }
    }
    // Group / Ungroup
    if (selectedSet.size > 1 && !ann.groupId) {
      const groupBtn = document.createElement('button');
      groupBtn.className = 'pbtn';
      groupBtn.innerHTML = '⊞';
      groupBtn.title = 'Group selected objects (Ctrl+G)';
      groupBtn.addEventListener('click', groupSelection);
      cz.appendChild(groupBtn);
    }
    if (ann.groupId) {
      const ungroupBtn = document.createElement('button');
      ungroupBtn.className = 'pbtn active';
      ungroupBtn.innerHTML = '⊟';
      ungroupBtn.title = 'Ungroup (Ctrl+Shift+G)';
      ungroupBtn.addEventListener('click', ungroupSelection);
      cz.appendChild(ungroupBtn);
    }
    panel.appendChild(cz);
  }

  panel.querySelectorAll('button, .pswatch').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      if (activeEditor) e.preventDefault();
    });
  });

  panel.classList.add('show');
}

function mkGroup() {
  const g = document.createElement('div');
  g.className = 'pgroup';
  return g;
}

function mkFormatBtn(label, prop, ann, editing) {
  const b = document.createElement('button');
  b.className = 'pbtn ' + prop;
  b.textContent = label;
  b.title = label === 'B' ? 'Bold' : label === 'I' ? 'Italic' : 'Underline';
  if (editing) {
    try {
      if (document.queryCommandState(prop)) b.classList.add('active');
    } catch (e) {}
    b.addEventListener('click', (e) => {
      e.preventDefault();
      activeEditor.focus();
      document.execCommand(prop, false, null);
      requestAnimationFrame(updatePropsForEditor);
    });
  } else {
    const anyActive = ann.lines.some((line) => line.some((seg) => seg[prop]));
    if (anyActive) b.classList.add('active');
    b.addEventListener('click', () => {
      const newVal = !anyActive;
      ann.lines.forEach((line) => line.forEach((seg) => (seg[prop] = newVal)));
      renderTextAnnotation(ann);
      ann.width = ann.el.offsetWidth;
      ann.height = ann.el.offsetHeight;
      buildPropsPanel(ann);
      positionPropsPanel(ann);
    });
  }
  return b;
}

function mkSwatch(col, ann, editing) {
  const sw = document.createElement('button');
  sw.className = 'pswatch';
  sw.style.background = col;
  if (col === '#ffffff') sw.style.borderColor = 'var(--border-strong)';
  if (col.toLowerCase() === (currentColorOf(ann, editing) || '').toLowerCase()) sw.classList.add('active');
  sw.title = col;
  sw.addEventListener('click', (e) => {
    e.preventDefault();
    applyColor(col, ann, editing);
  });
  return sw;
}

// Eyedropper button — uses the native Chromium EyeDropper API to pick any colour
// from anywhere on screen (incl. the rendered PDF), then hands the hex to onPick.
function mkEyedropper(onPick) {
  const b = document.createElement('button');
  b.className = 'pbtn eyedropper';
  b.title = window.t('props.eyedropper', 'Pick a colour from the page');
  b.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';
  b.addEventListener('mousedown', (e) => {
    if (activeEditor) e.preventDefault();
  });
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!('EyeDropper' in window)) {
      showToast(
        window.t('toast.noEyedropper', 'This browser has no colour picker — use the custom-colour box.'),
        'warn'
      );
      return;
    }
    try {
      const res = await new window.EyeDropper().open();
      if (res && res.sRGBHex) onPick(res.sRGBHex);
    } catch (_) {
      /* user pressed Esc — ignore */
    }
  });
  return b;
}

function applyColor(col, ann, editing) {
  if (editing) {
    activeEditor.focus();
    document.execCommand('foreColor', false, col);
    requestAnimationFrame(updatePropsForEditor);
  } else {
    ann.lines.forEach((line) => line.forEach((seg) => (seg.color = col)));
    renderTextAnnotation(ann);
    ann.width = ann.el.offsetWidth;
    ann.height = ann.el.offsetHeight;
    buildPropsPanel(ann);
    positionPropsPanel(ann);
  }
}

function currentColorOf(ann, editing) {
  if (editing) {
    try {
      const v = document.queryCommandValue('foreColor');
      if (v) return cssColorToHex(v);
    } catch (e) {}
    return defaultColor;
  }
  const counts = {};
  ann.lines.forEach((l) =>
    l.forEach((s) => {
      counts[s.color] = (counts[s.color] || 0) + 1;
    })
  );
  let best = '#000000',
    max = -1;
  for (const k in counts)
    if (counts[k] > max) {
      max = counts[k];
      best = k;
    }
  return best;
}

function updatePropsForEditor() {
  if (!activeEditor || !activeEditorAnn) return;
  if (selected === activeEditorAnn) buildPropsPanel(activeEditorAnn);
  positionPropsPanel(activeEditorAnn);
}

function positionPropsPanel(ann) {
  const panel = document.getElementById('propsPanel');
  if (!panel.classList.contains('show')) return;
  const targetEl = activeEditor && activeEditorAnn === ann ? activeEditor : ann.el;
  const r = targetEl.getBoundingClientRect();
  const pw = panel.offsetWidth,
    ph = panel.offsetHeight;
  let top = r.top - ph - 14;
  let left = r.left + (r.width - pw) / 2;
  if (top < 130) top = r.bottom + 14;
  left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
}
window.addEventListener(
  'scroll',
  () => {
    if (selected) positionPropsPanel(selected);
  },
  true
);
window.addEventListener('resize', () => {
  if (selected) positionPropsPanel(selected);
});

document.addEventListener('mousedown', (e) => {
  if (editorJustOpened) return;
  if (
    e.target.closest(
      '.annotation, .props-panel, .toolbar, .titlebar, .context-bar, .text-input-active, .banner, .zoom-bar'
    )
  )
    return;
  if (activeEditor) commitEditor(true);
  // Don't deselect right after a commit — the same click that committed the
  // editor triggers two events (pointerdown then compat mousedown). The
  // pointerdown path commits and leaves the new annotation selected; this
  // mousedown would otherwise wipe that selection and hide the handles.
  else if (!editorJustCommitted) deselect();
});

// === UNDO / REDO / CLEAR / DELETE ===
document.getElementById('undoBtn').addEventListener('click', () => doUndo());
document.getElementById('redoBtn').addEventListener('click', () => doRedo());
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!annotations.length) return;
  if (!confirm('Remove all edits? This cannot be undone.')) return;
  if (activeEditor) commitEditor(false);
  annotations.forEach((a) => a.el?.remove());
  annotations = [];
  deselect();
  updateAnnotCount();
  pushHistory('clear-all');
});

document.addEventListener(
  'keydown',
  (e) => {
    const ce = document.activeElement?.isContentEditable;
    const inp = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
    const ctrl = e.ctrlKey || e.metaKey;

    // === Command palette (Ctrl+K / Cmd+K) === always works, even from inputs.
    // Also supports Ctrl+P-style "/" trigger when not typing into an input.
    if (ctrl && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === '/' && !ce && !inp) {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (ctrl && (e.key === 'z' || e.key === 'Z')) {
      if (ce || inp) return;
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
    } else if (ctrl && (e.key === 'y' || e.key === 'Y')) {
      if (ce || inp) return;
      e.preventDefault();
      doRedo();
    } else if (ctrl && (e.key === 'c' || e.key === 'C')) {
      if (ce || inp) return;
      e.preventDefault();
      doCopySelection();
    } else if (ctrl && (e.key === 'x' || e.key === 'X')) {
      if (ce || inp) return;
      e.preventDefault();
      doCutSelection();
    } else if (ctrl && (e.key === 'v' || e.key === 'V')) {
      if (ce || inp) return;
      // Prefer in-app annotation clipboard. If empty, let the native paste handler
      // do image / text from OS clipboard.
      if (pdfMiniClipboard && pdfMiniClipboard.length) {
        e.preventDefault();
        doPasteFromClipboard();
      }
    } else if (ctrl && (e.key === 'd' || e.key === 'D')) {
      if (ce || inp) return;
      e.preventDefault();
      doDuplicateSelection();
    } else if (ctrl && (e.key === 'g' || e.key === 'G')) {
      if (ce || inp) return;
      e.preventDefault();
      if (e.shiftKey) ungroupSelection();
      else groupSelection();
    } else if (ctrl && (e.key === 'a' || e.key === 'A')) {
      if (ce || inp) return;
      if (!pdfJsDoc) return;
      e.preventDefault();
      selectAllAnnotations();
    } else if (ctrl && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (pdfBytes) savePDF();
    } else if (ctrl && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      e.stopPropagation();
      if (pdfBytes) printPDF();
    } else if (ctrl && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      if (pdfJsDoc) snapZoom(+1);
    } else if (ctrl && e.key === '-') {
      e.preventDefault();
      if (pdfJsDoc) snapZoom(-1);
    } else if (ctrl && e.key === '0') {
      e.preventDefault();
      if (pdfJsDoc) {
        _userZoomed = true;
        setZoom(1.0);
      }
    } else if (!ctrl && !e.shiftKey && !e.altKey && !ce && !inp && pdfJsDoc) {
      // Single-letter tool shortcuts (Figma-style). Only fire when nothing's
      // being typed and the user is in the editor with a doc loaded.
      // Guard against IME/programmatic events where e.key may be undefined
      if (typeof e.key !== 'string') return;
      const k = e.key.toLowerCase();
      const map = {
        v: 'select',
        s: 'select', // V or S → Select (V is Adobe/Figma)
        t: 'text', // T → Text
        d: 'draw', // D → Draw
        e: 'edit-pdf', // E → Edit PDF text
        h: 'highlight', // H → Highlight
        u: 'underline', // U → Underline
        r: 'shape', // R → Rectangle (shape tool)
        f: 'field', // F → Form field designer
      };
      const tool = map[k];
      if (tool) {
        e.preventDefault();
        setTool(tool);
        return;
      }
      if (k === 'm') {
        e.preventDefault();
        setMeasureMode(!measureMode);
        return;
      }
      if (k === '?') {
        e.preventDefault();
        document.getElementById('helpBtn')?.click();
        return;
      }
    }
    if (e.key === 'Escape') {
      if (activeEditor) {
        e.preventDefault();
        commitEditor(false);
        return;
      }
      if (typeof measureMode !== 'undefined' && measureMode) {
        e.preventDefault();
        setMeasureMode(false);
        return;
      }
      // Close topmost modal if open
      const openModals = document.querySelectorAll('.modal-overlay.show');
      if (openModals.length) {
        const top = openModals[openModals.length - 1];
        const closeBtn = top.querySelector('.modal-close');
        if (closeBtn) {
          e.preventDefault();
          closeBtn.click();
          return;
        }
        top.classList.remove('show');
        e.preventDefault();
        return;
      }
      if (selected || (selectedSet && selectedSet.size)) {
        e.preventDefault();
        _deselectLockUntil = 0; // force-bypass the commit grace window
        deselect();
        // Belt-and-braces: if anything is still flagged selected (multi-select
        // edge case after paste), wipe it directly so Esc reliably clears.
        if (selectedSet && selectedSet.size) {
          for (const a of selectedSet) {
            if (a.el) a.el.classList.remove('selected');
          }
          selectedSet.clear();
          selected = null;
          hidePropsPanel();
        }
        return;
      }
      if (currentTool !== 'select') {
        e.preventDefault();
        setTool('select');
      }
    }
  },
  true
); // capture: true ensures we get Ctrl+P before browser default

function removeAnnotation(ann) {
  ann.el?.remove();
  const i = annotations.indexOf(ann);
  if (i >= 0) annotations.splice(i, 1);
  selectedSet.delete(ann);
  // Edit-PDF replacements own their cover (whiteout) — remove it too so deleting
  // the edited text fully reverts to the original instead of leaving an orphan
  // white rectangle floating over the page.
  if (ann.sourceWhiteout) {
    ann.sourceWhiteout.el?.remove();
    const wi = annotations.indexOf(ann.sourceWhiteout);
    if (wi >= 0) annotations.splice(wi, 1);
    selectedSet.delete(ann.sourceWhiteout);
  }
  if (selected === ann) selected = null;
  updateAnnotCount();
  pushHistory('delete');
}
function updateAnnotCount() {
  document.getElementById('statusAnnots').textContent = annotations.length;
  document.getElementById('clearBtn').disabled = annotations.length === 0;
  updateHistoryUI();
}

// =====================================================================
// ============  PRO: UNDO / REDO + MULTI-SELECT + CLIPBOARD  ===========
// =====================================================================

// --- Multi-select state ---
let selectedSet = new Set(); // all currently-selected annotations
// `selected` (declared near the top) is the PRIMARY (last touched) — used for props panel

// --- History (snapshot-based undo/redo) ---
let historyStack = []; // array of snapshots
let historyIndex = -1; // pointer into historyStack
const HISTORY_LIMIT = 80;
let historyPushScheduled = false;
let suppressHistory = false; // set true while restoring (so we don't re-push)

function pushHistory(label) {
  if (suppressHistory) return;
  if (!pdfJsDoc) return;
  // Coalesce rapid-fire calls into one (e.g. after pointer move + commit)
  if (historyPushScheduled) return;
  historyPushScheduled = true;
  Promise.resolve().then(() => {
    historyPushScheduled = false;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(snapshotAnnotations());
    historyIndex = historyStack.length - 1;
    if (historyStack.length > HISTORY_LIMIT) {
      historyStack.shift();
      historyIndex--;
    }
    updateHistoryUI();
    // Hook for autosave
    if (typeof scheduleAutoSave === 'function') scheduleAutoSave();
  });
}
function updateHistoryUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.disabled = historyIndex <= 0;
  if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}
function doUndo() {
  dbg('[undo] requested; index=', historyIndex, 'of', historyStack.length);
  if (historyIndex <= 0) {
    showToast(window.t('toast.nothingUndo', 'Nothing to undo.'), 'warn');
    return;
  }
  historyIndex--;
  restoreFromSnapshot(historyStack[historyIndex]);
  updateHistoryUI();
  showToast(window.t('toast.undone', 'Undone.'), 'success');
}
function doRedo() {
  dbg('[redo] requested; index=', historyIndex, 'of', historyStack.length);
  if (historyIndex >= historyStack.length - 1) {
    showToast('Nothing to redo.', 'warn');
    return;
  }
  historyIndex++;
  restoreFromSnapshot(historyStack[historyIndex]);
  updateHistoryUI();
  showToast('Redone.', 'success');
}
function clearHistory() {
  historyStack = [];
  historyIndex = -1;
  pushHistory('initial');
}

// --- Serialization ---
const SERIALIZE_SKIP_KEYS = new Set([
  'el',
  'imgEl',
  'svg',
  'bbox',
  '_origAscent',
  '_origBaselineY',
  // Back-reference from an Edit-PDF cover to its text (set by bindEditCover).
  // It points at a live annotation object (with a DOM .el) — serialising it
  // would throw DataCloneError in IndexedDB and bloat history. It's re-derived
  // on restore, so skip it.
  'ownerText',
]);
function serializeAnnotation(a, idxMap) {
  const out = {};
  for (const k in a) {
    if (SERIALIZE_SKIP_KEYS.has(k)) continue;
    if (k === 'sourceWhiteout') {
      out._sourceWhiteoutId = idxMap.get(a.sourceWhiteout);
      continue;
    }
    out[k] = a[k];
  }
  return out;
}
function snapshotAnnotations() {
  const idxMap = new Map();
  annotations.forEach((a, i) => idxMap.set(a, i));
  return annotations.map((a) => serializeAnnotation(a, idxMap));
}

// --- Restoration ---
function restoreFromSnapshot(snapshot) {
  suppressHistory = true;
  // Commit any open editor first
  if (activeEditor) {
    activeEditor.remove();
    activeEditor = null;
    activeEditorAnn = null;
  }
  // Clear all current DOM elements + state
  annotations.forEach((a) => {
    try {
      a.el?.remove();
    } catch (_) {}
  });
  annotations = [];
  selectedSet.clear();
  selected = null;
  hidePropsPanel();
  // Rebuild
  const rebuilt = [];
  for (const def of snapshot) {
    const overlay =
      document.querySelector(`.overlay[data-page-num="${def.pageNum}"]`) ||
      document.querySelectorAll('.overlay')[def.pageNum - 1];
    if (!overlay) continue;
    const ann = recreateAnnotation(def, overlay);
    if (ann) rebuilt.push(ann);
  }
  // Re-link sourceWhiteout references by index, then re-bind the cover so it
  // stays a non-selectable, move/delete-together part of the text (see bindEditCover).
  for (let i = 0; i < snapshot.length; i++) {
    const sId = snapshot[i]._sourceWhiteoutId;
    if (sId !== undefined && sId !== null && rebuilt[sId]) {
      rebuilt[i].sourceWhiteout = rebuilt[sId];
      bindEditCover(rebuilt[sId], rebuilt[i]);
    }
  }
  annotations = rebuilt;
  updateAnnotCount();
  suppressHistory = false;
}

function recreateAnnotation(def, overlay) {
  let ann = null;
  switch (def.type) {
    case 'text':
      ann = recreateTextAnn(def, overlay);
      break;
    case 'image':
      ann = recreateImageAnn(def, overlay);
      break;
    case 'shape':
      ann = recreateShapeAnn(def, overlay);
      break;
    case 'draw':
      ann = recreateDrawAnn(def, overlay);
      break;
    case 'stamp':
      ann = recreateStampAnn(def, overlay);
      break;
    case 'whiteout':
      ann = recreateWhiteoutAnn(def, overlay);
      break;
    case 'field':
      ann = recreateFieldAnn(def, overlay);
      break;
    case 'decoration':
      ann = recreateDecorationAnn(def, overlay);
      break;
    case 'link':
      ann = recreateLinkAnn(def, overlay);
      break;
  }
  // Restore the link-as-property badge so re-attached annotations (after
  // Pages reorder / Crop-Resize / draft restore) keep showing they're links.
  if (ann && ann.link && ann.link.target) {
    try {
      updateAnnLinkBadge(ann);
    } catch (_) {}
  }
  return ann;
}
function recreateTextAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation text-annotation';
  el.style.left = def.x + 'px';
  el.style.top = def.y + 'px';
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  renderTextAnnotation(ann);
  ann.width = el.offsetWidth;
  ann.height = el.offsetHeight;
  enableTextDrag(el, ann);
  addTextHandles(el, ann);
  el.addEventListener('dblclick', () => openTextEditor(el.parentElement, ann.pageNum, ann.x, ann.y, ann));
  return ann;
}
function recreateImageAnn(def, overlay) {
  const container = document.createElement('div');
  container.className = 'annotation img-container';
  container.style.left = def.x + 'px';
  container.style.top = def.y + 'px';
  container.style.width = def.width + 'px';
  container.style.height = def.height + 'px';
  const img = document.createElement('img');
  img.src = def.dataURL;
  img.draggable = false;
  container.appendChild(img);
  ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
    const h = document.createElement('div');
    h.className = 'img-handle ' + corner;
    h.dataset.corner = corner;
    container.appendChild(h);
  });
  const rotHandle = document.createElement('div');
  rotHandle.className = 'img-handle rot';
  container.appendChild(rotHandle);
  overlay.appendChild(container);
  const ann = Object.assign({}, def, { el: container, imgEl: img });
  applyImgTransform(ann);
  enableImageInteractions(container, ann);
  container.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (ann.isSignature) {
      openSignatureModal((newDataURL) => {
        ann.dataURL = newDataURL;
        img.src = newDataURL;
        pushHistory('replace-signature');
      });
    } else {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        ann.dataURL = await fileToDataURL(file);
        ann.mimeType = file.type;
        img.src = ann.dataURL;
        pushHistory('replace-image');
      };
      fileInput.click();
    }
  });
  return ann;
}
function recreateShapeAnn(def, overlay) {
  const container = document.createElement('div');
  container.className = 'annotation shape-annotation';
  overlay.appendChild(container);
  const ann = Object.assign({}, def, { el: container });
  renderShapeAnnotation(ann);
  enableShapeMove(container, ann);
  return ann;
}
function recreateDrawAnn(def, overlay) {
  const container = document.createElement('div');
  container.className = 'annotation draw-annotation';
  overlay.appendChild(container);
  const ann = Object.assign({}, def, { el: container });
  renderDrawAnnotation(ann);
  enableDrawInteractions(container, ann);
  return ann;
}
function recreateStampAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation stamp-annotation';
  const inner = document.createElement('div');
  inner.className = 'stamp-inner';
  el.appendChild(inner);
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  applyStampStyles(el, ann);
  enableStampDrag(el, ann);
  const rot = document.createElement('div');
  rot.className = 'rot-handle';
  rot.title = 'Drag to rotate';
  el.appendChild(rot);
  attachRotateHandle(rot, ann, () => renderStampAnnotation(ann));
  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    openStampEditor(ann);
  });
  return ann;
}
function recreateWhiteoutAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation whiteout-annotation';
  el.style.left = def.x + 'px';
  el.style.top = def.y + 'px';
  el.style.width = def.width + 'px';
  el.style.height = def.height + 'px';
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  enableWhiteoutInteractions(el, ann);
  return ann;
}

function recreateDecorationAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'annotation deco-annotation ' + (def.kind || 'highlight');
  el.style.left = def.x + 'px';
  el.style.top = def.y + 'px';
  el.style.width = def.width + 'px';
  el.style.height = def.height + 'px';
  // Restore custom colour (highlight uses bg fill, underline/strike use --deco-color)
  if (def.color) {
    if ((def.kind || 'highlight') === 'highlight') el.style.background = _hexToRgba(def.color, 0.45);
    else el.style.setProperty('--deco-color', def.color);
  }
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  enableWhiteoutInteractions(el, ann);
  return ann;
}

function recreateLinkAnn(def, overlay) {
  const el = document.createElement('div');
  el.className = 'link-annotation';
  el.style.left = def.x + 'px';
  el.style.top = def.y + 'px';
  el.style.width = def.width + 'px';
  el.style.height = def.height + 'px';
  if (def.linkLabel) {
    el.dataset.linkLabel = def.linkLabel.length > 40 ? def.linkLabel.slice(0, 38) + '…' : def.linkLabel;
    el.title = def.linkLabel;
  }
  overlay.appendChild(el);
  const ann = Object.assign({}, def, { el });
  enableLinkInteractions(el, ann);
  return ann;
}

// --- Multi-select operations ---
function clearSelection() {
  for (const a of selectedSet) {
    if (a.el) a.el.classList.remove('selected');
  }
  selectedSet.clear();
  selected = null;
  hidePropsPanel();
  if (pdfJsDoc && !activeEditor) setContext(currentTool);
}
function setPrimarySelection(ann) {
  // Replace selectedSet with just `ann`
  clearSelection();
  if (ann) {
    selectedSet.add(ann);
    selected = ann;
    ann.el.classList.add('selected');
    buildPropsPanel(ann);
    positionPropsPanel(ann);
    if (!activeEditor) setContext('selected');
  }
}
function toggleInSelection(ann) {
  if (selectedSet.has(ann)) {
    selectedSet.delete(ann);
    ann.el.classList.remove('selected');
    if (selected === ann) {
      const arr = [...selectedSet];
      selected = arr.length ? arr[arr.length - 1] : null;
    }
  } else {
    selectedSet.add(ann);
    selected = ann;
    ann.el.classList.add('selected');
  }
  if (selected) {
    buildPropsPanel(selected);
    positionPropsPanel(selected);
  } else hidePropsPanel();
  dbg('[multi-select] now selected', selectedSet.size, 'object(s)');
}
function selectAllAnnotations() {
  clearSelection();
  for (const a of annotations) {
    selectedSet.add(a);
    if (a.el) a.el.classList.add('selected');
  }
  selected = annotations.length ? annotations[annotations.length - 1] : null;
  if (selected) {
    buildPropsPanel(selected);
    positionPropsPanel(selected);
  }
}

// --- Clipboard (in-memory) ---
let pdfMiniClipboard = [];
// Heal a desynced state where `selected` is set but selectedSet is empty
// (can happen if some path mutated `selected` without touching the set).
function _healSelection() {
  if (!selectedSet.size && selected && annotations.includes(selected)) {
    selectedSet.add(selected);
    if (selected.el) selected.el.classList.add('selected');
  }
}
function doCopySelection() {
  _healSelection();
  dbg('[copy] selectedSet has', selectedSet.size, 'item(s)');
  if (!selectedSet.size) {
    showToast(window.t('toast.selectFirst', 'Select something first (click or Shift-click).'), 'warn');
    return;
  }
  const idxMap = new Map();
  annotations.forEach((a, i) => idxMap.set(a, i));
  pdfMiniClipboard = [...selectedSet].map((a) => serializeAnnotation(a, idxMap));
  showToast(
    `Copied ${pdfMiniClipboard.length} object${pdfMiniClipboard.length === 1 ? '' : 's'} — Ctrl+V to paste.`,
    'success'
  );
}
function doDuplicateSelection() {
  _healSelection();
  if (!selectedSet.size) return;
  const idxMap = new Map();
  annotations.forEach((a, i) => idxMap.set(a, i));
  const defs = [...selectedSet].map((a) => serializeAnnotation(a, idxMap));
  pasteAnnotationDefs(defs, 18, 18);
}
// Cut = copy to the in-app clipboard, then remove the originals (with any bound
// Edit-PDF covers). Works for ANY object and across pages — Ctrl+V drops them
// back wherever you last clicked (see doPasteFromClipboard).
function doCutSelection() {
  _healSelection();
  if (!selectedSet.size) {
    showToast(window.t('toast.selectFirst', 'Select something first (click or Shift-click).'), 'warn');
    return;
  }
  const idxMap = new Map();
  annotations.forEach((a, i) => idxMap.set(a, i));
  pdfMiniClipboard = [...selectedSet].map((a) => serializeAnnotation(a, idxMap));
  const victims = [...selectedSet];
  for (const a of victims) {
    a.el?.remove();
    const i = annotations.indexOf(a);
    if (i >= 0) annotations.splice(i, 1);
    selectedSet.delete(a);
    if (a.sourceWhiteout) {
      a.sourceWhiteout.el?.remove();
      const wi = annotations.indexOf(a.sourceWhiteout);
      if (wi >= 0) annotations.splice(wi, 1);
      selectedSet.delete(a.sourceWhiteout);
    }
  }
  selected = null;
  hidePropsPanel();
  updateAnnotCount();
  pushHistory('cut');
  showToast(`Cut ${victims.length} object${victims.length === 1 ? '' : 's'} — Ctrl+V to paste.`, 'success');
}
// Smallest x/y across a set of serialized defs (handles xy, endpoint and points
// shapes) — used to drop a pasted group at an exact point.
function _defsAnchor(defs) {
  let minX = Infinity,
    minY = Infinity;
  for (const d of defs) {
    if (typeof d.x === 'number') {
      minX = Math.min(minX, d.x);
      minY = Math.min(minY, d.y);
    }
    if (typeof d.x1 === 'number') {
      minX = Math.min(minX, d.x1, d.x2);
      minY = Math.min(minY, d.y1, d.y2);
    }
    if (Array.isArray(d.points))
      for (const p of d.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
      }
  }
  return { x: isFinite(minX) ? minX : 0, y: isFinite(minY) ? minY : 0 };
}
function pasteAnnotationDefs(defs, offsetX, offsetY, atPoint) {
  if (!defs || !defs.length) return;
  clearSelection();
  const targetPage = (lastClickPos && lastClickPos.pageNum) || (defs[0] && defs[0].pageNum) || 1;
  const overlay =
    document.querySelector(`.overlay[data-page-num="${targetPage}"]`) ||
    document.querySelectorAll('.overlay')[targetPage - 1];
  if (!overlay) return;
  // Paste-at-point: translate the whole group so its top-left lands on atPoint,
  // keeping the objects' relative offsets.
  if (atPoint) {
    const a = _defsAnchor(defs);
    offsetX = atPoint.x - a.x;
    offsetY = atPoint.y - a.y;
  }
  for (const def of defs) {
    const cloned = JSON.parse(JSON.stringify(def));
    delete cloned._sourceWhiteoutId; // the cover isn't carried; don't dangle a stale ref
    // Form fields with duplicate names would sync in any PDF viewer (typing
    // in one fills all). Give every pasted field a unique name.
    if (cloned.type === 'field' && cloned.fieldName && typeof _fieldCounter !== 'undefined') {
      cloned.fieldName = cloned.fieldName.replace(/_copy\d+$/, '') + '_copy' + ++_fieldCounter;
    }
    cloned.pageNum = targetPage;
    if ('x' in cloned) cloned.x += offsetX;
    if ('y' in cloned) cloned.y += offsetY;
    if ('x1' in cloned) {
      cloned.x1 += offsetX;
      cloned.y1 += offsetY;
    }
    if ('x2' in cloned) {
      cloned.x2 += offsetX;
      cloned.y2 += offsetY;
    }
    if (cloned.points) cloned.points = cloned.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
    const ann = recreateAnnotation(cloned, overlay);
    if (ann) {
      annotations.push(ann);
      selectedSet.add(ann);
      ann.el.classList.add('selected');
      selected = ann;
    }
  }
  if (selected) {
    buildPropsPanel(selected);
    positionPropsPanel(selected);
  }
  updateAnnotCount();
  pushHistory('paste');
  showToast(`Pasted ${defs.length} object${defs.length === 1 ? '' : 's'}.`, 'success');
}
function doPasteFromClipboard() {
  if (!pdfMiniClipboard || !pdfMiniClipboard.length) return false;
  // Drop the objects where the user last clicked (page + exact point). Falls back
  // to a small offset when there's no recent click on a live page.
  const at =
    lastClickPos && lastClickPos.overlay && document.body.contains(lastClickPos.overlay)
      ? { x: lastClickPos.x, y: lastClickPos.y }
      : null;
  if (at) pasteAnnotationDefs(pdfMiniClipboard, 0, 0, at);
  else pasteAnnotationDefs(pdfMiniClipboard, 18, 18);
  return true;
}
