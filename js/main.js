function performMerge() {
  const selected = state.files.filter(f => f.selected);
  if (selected.length < 2) return;

  for (const f of selected) {
    if (!f.key) { alert('Выберите ключевую колонку для «' + f.name + '»'); return; }
  }

  const effectiveBaseId = getEffectiveBaseId();
  const baseFile = selected.find(f => f.id === effectiveBaseId);
  if (!baseFile) { alert('Не удалось определить базовую таблицу.'); return; }

  const orderedFiles = [baseFile].concat(selected.filter(f => f.id !== baseFile.id));

  const reportSteps = [];
  let currentRows = orderedFiles[0].rows.map(r => Object.assign({}, r));
  let currentColumns = orderedFiles[0].columns.slice();

  reportSteps.push({
    step: 0, fromFile: orderedFiles[0].name,
    rowsBefore: orderedFiles[0].rows.length, rowsAfter: currentRows.length,
    joinType: '—', key: orderedFiles[0].key, isBase: true,
    leftMatched: 0, leftUnmatched: 0, rightTotal: 0, rightUsed: 0, maxMultiplier: 0,
  });

  for (let i = 1; i < orderedFiles.length; i++) {
    const rightFile = orderedFiles[i];
    const joinType = rightFile.joinType || 'inner';
    const prevFile = orderedFiles[i - 1];
    const leftKey = prevFile.key;
    const rightKey = rightFile.key;

    let actualLeftKey = leftKey;
    if (currentRows.length > 0 && !(leftKey in currentRows[0])) {
      const possible = Object.keys(currentRows[0]).find(k => k.indexOf(leftKey + '_left') === 0);
      if (possible) actualLeftKey = possible;
      else {
        const anyKey = Object.keys(currentRows[0]).find(k => k.indexOf(leftKey) === 0);
        if (anyKey) actualLeftKey = anyKey;
        else { alert('Не найдена колонка "' + leftKey + '" в промежуточном результате.'); return; }
      }
    }

    const rowsBefore = currentRows.length;
    const result = mergeRows(currentRows, rightFile.rows, actualLeftKey, rightKey, joinType);
    const merged = result.rows;
    const stats = result.stats;

    const colSet = new Set();
    merged.forEach(row => Object.keys(row).forEach(k => colSet.add(k)));

    currentRows = merged;
    currentColumns = Array.from(colSet);

    reportSteps.push({
      step: i, fromFile: rightFile.name,
      rowsBefore: rowsBefore, rowsAfter: currentRows.length,
      joinType: joinType, key: rightKey, isBase: false,
      leftMatched: stats.leftMatched,
      leftUnmatched: stats.leftUnmatched,
      rightTotal: stats.rightTotal,
      rightUsed: stats.rightUsed,
      maxMultiplier: stats.maxMultiplier,
      leftKey: stats.leftKey,
      rightKey: stats.rightKey,
    });
  }

  const analysis = analyzeResult(currentRows, currentColumns, reportSteps);
  state.lastAnalysis = analysis;

  state.resultCounter++;
  const sourceNames = orderedFiles.map(f => f.name.replace(/\.[^.]+$/, '')).join(' + ');
  const resultName = '📦 Результат #' + state.resultCounter + ' (' + sourceNames.slice(0, 40) + (sourceNames.length > 40 ? '…' : '') + ')';

  const lastKey = orderedFiles[orderedFiles.length - 1].key;
  let resultKey = currentColumns[0];
  if (lastKey && currentColumns.indexOf(lastKey) >= 0) resultKey = lastKey;
  else {
    const withSuffix = currentColumns.find(c => c.indexOf(lastKey) === 0);
    if (withSuffix) resultKey = withSuffix;
  }

  const resultFile = {
    id: generateId(), name: resultName,
    rows: currentRows, columns: currentColumns,
    key: resultKey, joinType: 'inner',
    selected: false, isResult: true, saved: false,
  };
  state.files.push(resultFile);
  state.lastResultFileId = resultFile.id;
  state.lastResultRows = currentRows;
  state.currentPage = 1;

  renderReport(reportSteps);
  renderStats(analysis);
  renderWarnings(analysis, orderedFiles);
  renderSources(analysis, orderedFiles);
  renderResult(currentRows);
  renderFileList();
  updateUI();
  scheduleSave();
  updateNavStorageStatus();

  dom.saveResultBar.hidden = false;
  dom.filesCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupHandlers() {
  dom.dropzone.addEventListener('click', () => dom.fileInput.click());
  dom.pickFilesBtn.addEventListener('click', () => dom.fileInput.click());

  dom.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dom.dropzone.classList.add('hover'); });
  dom.dropzone.addEventListener('dragleave', () => dom.dropzone.classList.remove('hover'));
    dom.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.dropzone.classList.remove('hover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files, () => {
        renderFileList();
        updateUI();
      });
    }
  });
    dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files, () => {
        renderFileList();
        updateUI();
      });
      dom.fileInput.value = '';
    }
  });

  dom.clearAllBtn.addEventListener('click', () => {
    state.files = []; state.lastResultRows = []; state.lastResultFileId = null;
    state.baseFileId = null; state.resultCounter = 0; state.lastAnalysis = null;
    renderFileList(); updateUI();
    dom.reportCard.hidden = true;
    dom.warningsCard.hidden = true;
    dom.sourcesCard.hidden = true;
    dom.resultCard.hidden = true;
    dom.fileInput.value = '';
    clearState();
    updateNavStorageStatus();
  });

  dom.selectAllBtn.addEventListener('click', () => { state.files.forEach(f => f.selected = true); renderFileList(); updateUI(); scheduleSave(); updateNavStorageStatus(); });
  dom.deselectAllBtn.addEventListener('click', () => { state.files.forEach(f => f.selected = false); renderFileList(); updateUI(); scheduleSave(); updateNavStorageStatus(); });

  dom.mergeBtn.addEventListener('click', performMerge);
  dom.downloadCsvBtn.addEventListener('click', downloadCsv);
  dom.downloadXlsxBtn.addEventListener('click', downloadXlsx);
  dom.copyStatsBtn.addEventListener('click', copyStats);

  dom.materializeBtn.addEventListener('click', () => {
    const f = state.files.find(x => x.id === state.lastResultFileId);
    if (!f) return;
    const newName = prompt('Имя для сохранения результата:', f.name.replace('📦 ', '').replace(/^Результат #\d+ /, 'Результат_'));
    if (newName === null) return;
    f.name = newName.trim() || f.name;
    f.isResult = false;
    f.saved = true;
    renderFileList();
    scheduleSave();
    updateNavStorageStatus();
    dom.saveResultBar.hidden = true;
  });

  dom.pageSizeSelect.addEventListener('change', (e) => {
    const v = e.target.value;
    state.pageSize = v === 'all' ? 'all' : Number(v);
    state.currentPage = 1;
    renderResult(state.lastResultRows);
  });
  dom.prevPageBtn.addEventListener('click', () => {
    if (state.currentPage > 1) { state.currentPage--; renderResult(state.lastResultRows); }
  });
  dom.nextPageBtn.addEventListener('click', () => {
    if (state.pageSize === 'all') return;
    const ps = Number(state.pageSize);
    const totalPages = Math.max(1, Math.ceil(state.lastResultRows.length / ps));
    if (state.currentPage < totalPages) { state.currentPage++; renderResult(state.lastResultRows); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  // Восстанавливаем состояние из localStorage
  const restored = restoreIntoState(state);
  if (restored && state.files.length > 0) {
    renderFileList();
    updateUI();
  }
  setupHandlers();
  setupHotkeys();
  updateUI();
});