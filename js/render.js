function renderFileList() {
  if (state.files.length === 0) {
    dom.filesCard.hidden = true;
    dom.reportCard.hidden = true;
    dom.warningsCard.hidden = true;
    dom.sourcesCard.hidden = true;
    dom.resultCard.hidden = true;
    return;
  }
  dom.filesCard.hidden = false;
  dom.fileCountEl.textContent = state.files.length;

  const effectiveBaseId = getEffectiveBaseId();
  let html = '';
  state.files.forEach((f) => {
    const isBase = f.id === effectiveBaseId;
    const joinTypes = ['inner', 'left', 'right', 'outer'];

    html += '<div class="file-item ' + (f.selected ? '' : 'unchecked') + ' ' + (f.isResult ? 'is-result' : '') + ' ' + (isBase ? 'is-base' : '') + '" data-id="' + f.id + '">' +
      '<div class="file-check"><input type="checkbox" class="file-checkbox" data-id="' + f.id + '" ' + (f.selected ? 'checked' : '') + '></div>' +
      '<div class="file-info">' +
        '<div class="file-name">' +
          '<span>' + escapeHtml(f.name) + '</span>' +
          '<span class="badge">' + f.rows.length + ' строк</span>' +
          (f.isResult ? '<span class="badge result">результат</span>' : '') +
          (isBase ? '<span class="badge base">базовый</span>' : '') +
        '</div>' +
        '<div class="cols">' + f.columns.map(c => '<span class="col-tag">' + escapeHtml(c) + '</span>').join('') + '</div>' +
      '</div>' +
      '<div class="file-controls">' +
        '<div class="control-group">' +
          '<label>Ключевая колонка</label>' +
          '<select class="key-select" data-id="' + f.id + '" ' + (f.selected ? '' : 'disabled') + '>' +
            f.columns.map(c => '<option value="' + escapeHtml(c) + '" ' + (c === f.key ? 'selected' : '') + '>' + escapeHtml(c) + '</option>').join('') +
          '</select>' +
        '</div>' +
        (!isBase && f.selected ?
        '<div class="control-group">' +
          '<label>Тип соединения</label>' +
          '<select class="join-select" data-id="' + f.id + '">' +
            joinTypes.map(t => '<option value="' + t + '" ' + (t === f.joinType ? 'selected' : '') + '>' + t + '</option>').join('') +
          '</select>' +
        '</div>' : '') +
        (f.selected ?
        '<label class="base-selector ' + (isBase ? 'active' : '') + '" title="Сделать базовой">' +
          '<input type="radio" name="baseFile" value="' + f.id + '" ' + (isBase ? 'checked' : '') + '>' +
          (isBase ? '★ Базовый' : '☆ Сделать базовым') +
        '</label>' : '') +
        '<button class="remove-btn" data-id="' + f.id + '" title="Удалить">✕</button>' +
      '</div>' +
    '</div>';
  });
  dom.fileListEl.innerHTML = html;

  dom.fileListEl.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const file = state.files.find(f => f.id === e.target.dataset.id);
      if (file) file.selected = e.target.checked;
      renderFileList(); updateUI();
    });
  });
  dom.fileListEl.querySelectorAll('.key-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const file = state.files.find(f => f.id === e.target.dataset.id);
      if (file) file.key = e.target.value;
    });
  });
  dom.fileListEl.querySelectorAll('.join-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const file = state.files.find(f => f.id === e.target.dataset.id);
      if (file) file.joinType = e.target.value;
    });
  });
  dom.fileListEl.querySelectorAll('.base-selector input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const id = e.target.value;
      const file = state.files.find(f => f.id === id);
      if (file && file.selected) {
        state.baseFileId = id; renderFileList(); updateUI();
      }
    });
  });
  dom.fileListEl.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.files = state.files.filter(f => f.id !== id);
      if (state.baseFileId === id) state.baseFileId = null;
      if (state.lastResultFileId === id) {
        state.lastResultFileId = null;
        dom.saveResultBar.hidden = true;
      }
      renderFileList(); updateUI();
    });
  });
}

function updateUI() {
  const selected = state.files.filter(f => f.selected).length;
  const effectiveBaseId = getEffectiveBaseId();
  const baseFile = state.files.find(f => f.id === effectiveBaseId);
  if (selected < 2) {
    dom.mergeBtn.disabled = true;
    dom.mergeHint.textContent = 'Отмечено таблиц: ' + selected + '. Выберите минимум 2';
  } else {
    dom.mergeBtn.disabled = false;
    const baseName = baseFile ? baseFile.name : '—';
    dom.mergeHint.innerHTML = 'Соединено будет <strong>' + selected + '</strong> таблиц. Базовая: <strong>' + escapeHtml(baseName) + '</strong>';
  }
}

function renderResult(rows) {
  dom.resultCard.hidden = false;
  dom.resultRowsBadge.textContent = rows.length + ' строк';

  if (rows.length === 0) {
    dom.resultTableWrap.innerHTML = '<div class="empty-state">Результат пуст</div>';
    dom.paginationBar.hidden = true;
    return;
  }

  const columns = Object.keys(rows[0]);
  const isAll = state.pageSize === 'all';
  const effectivePageSize = isAll ? rows.length : Number(state.pageSize);
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(rows.length / effectivePageSize));

  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const startIdx = isAll ? 0 : (state.currentPage - 1) * effectivePageSize;
  const endIdx = isAll ? rows.length : Math.min(startIdx + effectivePageSize, rows.length);
  const preview = rows.slice(startIdx, endIdx);

  let html = '<table><thead><tr>';
  columns.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
  html += '</tr></thead><tbody>';

  preview.forEach(row => {
    const hasNull = columns.some(c => isNullVal(row[c]));
    html += '<tr class="' + (hasNull ? 'row-has-null' : '') + '">';
    columns.forEach(c => {
      const v = row[c];
      if (isNullVal(v)) html += '<td class="null-cell">' + NULL_MARKER + '</td>';
      else html += '<td>' + escapeHtml(v) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  dom.resultTableWrap.innerHTML = html;

  dom.paginationBar.hidden = false;
  if (isAll || rows.length <= effectivePageSize) {
    dom.pageInfo.textContent = 'Все ' + rows.length + ' строк';
    dom.prevPageBtn.disabled = true;
    dom.nextPageBtn.disabled = true;
  } else {
    dom.pageInfo.textContent = 'Стр. ' + state.currentPage + ' из ' + totalPages + ' (' + (startIdx + 1) + '–' + endIdx + ' из ' + rows.length + ')';
    dom.prevPageBtn.disabled = state.currentPage <= 1;
    dom.nextPageBtn.disabled = state.currentPage >= totalPages;
  }
}
