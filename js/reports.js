function renderReport(steps) {
  dom.reportCard.hidden = false;
  let html = '';
  steps.forEach((s, idx) => {
    const delta = s.rowsAfter - s.rowsBefore;
    const deltaStr = delta >= 0 ? '+' + delta : '' + delta;
    const deltaClass = delta >= 0 ? 'color:#0f7b3e;' : 'color:#b91c1c;';
    if (idx === 0) {
      html += '<div class="report-step base-step">' +
        '<span><strong>Шаг 0:</strong> базовый файл «' + escapeHtml(s.fromFile) + '»</span>' +
        '<span>ключ: <code>' + escapeHtml(s.key) + '</code></span>' +
        '<span>строк: <strong>' + s.rowsBefore + '</strong></span>' +
        '<span class="step-badge" style="background:#dcfce7;color:#166534;">★ базовый</span>' +
        '</div>';
    } else {
      html += '<div class="report-step">' +
        '<span><strong>Шаг ' + s.step + ':</strong> + «' + escapeHtml(s.fromFile) + '»</span>' +
        '<span>тип: <strong>' + escapeHtml(s.joinType) + '</strong></span>' +
        '<span>ключ: <code>' + escapeHtml(s.key) + '</code></span>' +
        '<span>было: <strong>' + s.rowsBefore + '</strong></span>' +
        '<span>→</span>' +
        '<span>стало: <strong>' + s.rowsAfter + '</strong></span>' +
        '<span class="delta" style="' + deltaClass + '">' + deltaStr + '</span>' +
        '</div>';
    }
  });
  dom.reportList.innerHTML = html;
}

function renderStats(analysis) {
  const totalRows = analysis.totalRows;
  const totalCols = analysis.totalCols;
  const nullByCol = analysis.nullByCol;
  const fullDuplicates = analysis.fullDuplicates;
  const mergeSteps = analysis.mergeSteps;
  const columns = Object.keys(nullByCol);
  const colsWithNull = columns.filter(c => nullByCol[c] > 0);
  const totalNulls = columns.reduce((s, c) => s + nullByCol[c], 0);

  let html = '<div class="section-title">📈 Общая статистика</div>';
  html += '<div class="stats-grid">';
  html += '<div class="stat-card"><div class="stat-label">Всего строк</div><div class="stat-value">' + totalRows.toLocaleString('ru-RU') + '</div></div>';
  html += '<div class="stat-card"><div class="stat-label">Всего колонок</div><div class="stat-value">' + totalCols + '</div></div>';
  html += '<div class="stat-card ' + (totalNulls > 0 ? 'warn' : 'ok') + '">' +
    '<div class="stat-label">Ячеек с NULL</div>' +
    '<div class="stat-value">' + totalNulls.toLocaleString('ru-RU') + '</div>' +
    '<div class="stat-sub">' + colsWithNull.length + ' ' + plural(colsWithNull.length, 'колонка', 'колонки', 'колонок') + ' затронуто</div>' +
    '</div>';
  html += '<div class="stat-card ' + (fullDuplicates > 0 ? 'danger' : 'ok') + '">' +
    '<div class="stat-label">Полных дубликатов</div>' +
    '<div class="stat-value">' + fullDuplicates.toLocaleString('ru-RU') + '</div>' +
    '<div class="stat-sub">' + formatPct(fullDuplicates, totalRows) + ' от всех строк</div>' +
    '</div>';

  const lastStep = mergeSteps[mergeSteps.length - 1];
  const lastKey = lastStep ? lastStep.key : null;
  if (lastKey && columns.includes(lastKey)) {
    const keyCounts = new Map();
    state.lastResultRows.forEach(row => {
      const v = String(row[lastKey] ?? '');
      keyCounts.set(v, (keyCounts.get(v) || 0) + 1);
    });
    let dupKeys = 0;
    let dupRows = 0;
    keyCounts.forEach(cnt => { if (cnt > 1) { dupKeys++; dupRows += cnt; } });
    html += '<div class="stat-card ' + (dupKeys > 0 ? 'warn' : 'ok') + '">' +
      '<div class="stat-label">Дубликатов по <code>' + escapeHtml(lastKey) + '</code></div>' +
      '<div class="stat-value">' + dupRows.toLocaleString('ru-RU') + '</div>' +
      '<div class="stat-sub">уникальных ключей с дублями: ' + dupKeys + '</div>' +
      '</div>';
  }
  html += '</div>';

  if (colsWithNull.length > 0) {
    html += '<div class="section-title">🕳 NULL по колонкам <span class="count">' + colsWithNull.length + '</span></div>';
    html += '<table class="null-table"><thead><tr><th>Колонка</th><th>NULL</th><th>%</th><th style="width:40%;">Заполненность</th></tr></thead><tbody>';
    const sorted = colsWithNull.slice().sort((a, b) => nullByCol[b] - nullByCol[a]);
    sorted.forEach(col => {
      const nulls = nullByCol[col];
      const pct = (nulls / totalRows) * 100;
      const filled = 100 - pct;
      let barColor = '#22c55e';
      if (pct > 50) barColor = '#ef4444';
      else if (pct > 20) barColor = '#f59e0b';
      else if (pct > 5) barColor = '#eab308';
      html += '<tr>' +
        '<td><code>' + escapeHtml(col) + '</code></td>' +
        '<td><strong>' + nulls.toLocaleString('ru-RU') + '</strong></td>' +
        '<td>' + pct.toFixed(1) + '%</td>' +
        '<td><span class="null-bar"><span class="null-bar-fill" style="width:' + filled + '%; background:' + barColor + ';"></span></span><span class="null-pct">' + filled.toFixed(1) + '% заполнено</span></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }
  dom.statsBlock.innerHTML = html;
}

function renderWarnings(analysis, orderedFiles) {
  const warnings = [];
  const totalRows = analysis.totalRows;
  const nullByCol = analysis.nullByCol;
  const fullDuplicates = analysis.fullDuplicates;
  const mergeSteps = analysis.mergeSteps;
  const columns = Object.keys(nullByCol);

  mergeSteps.forEach((s, idx) => {
    if (idx === 0) return;
    const file = orderedFiles[idx];
    const joinType = s.joinType;

    if (joinType === 'inner') {
      if (s.leftUnmatched > 0) {
        warnings.push({ type: 'warn', icon: '⚠', text: 'Шаг ' + idx + ' (inner join с <strong>' + escapeHtml(file.name) + '</strong>): <strong>' + s.leftUnmatched + '</strong> ' + plural(s.leftUnmatched, 'строка', 'строки', 'строк') + ' не нашли пару по ключу <code>' + escapeHtml(s.leftKey) + '</code> и были <strong>отброшены</strong>.' });
      } else {
        warnings.push({ type: 'ok', icon: '✓', text: 'Шаг ' + idx + ' (inner join с <strong>' + escapeHtml(file.name) + '</strong>): все левые строки нашли пару.' });
      }
    }
    if ((joinType === 'left' || joinType === 'outer') && s.leftUnmatched > 0) {
      warnings.push({ type: 'info', icon: 'ℹ', text: 'Шаг ' + idx + ': <strong>' + s.leftUnmatched + '</strong> ' + plural(s.leftUnmatched, 'строка', 'строки', 'строк') + ' не нашли пару по <code>' + escapeHtml(s.rightKey) + '</code> — заполнены как <code>NULL</code>.' });
    }
    if (s.maxMultiplier > 1) {
      warnings.push({ type: 'warn', icon: '⚠', text: 'Шаг ' + idx + ': в правой таблице <strong>' + escapeHtml(file.name) + '</strong> есть дубли по ключу <code>' + escapeHtml(s.rightKey) + '</code>. Макс. размножение: <strong>×' + s.maxMultiplier + '</strong>.' });
    }
    if (joinType === 'right' || joinType === 'outer') {
      const rightUnused = s.rightTotal - s.rightUsed;
      if (rightUnused > 0) {
        warnings.push({ type: 'info', icon: 'ℹ', text: 'Шаг ' + idx + ': <strong>' + rightUnused + '</strong> ' + plural(rightUnused, 'строка', 'строки', 'строк') + ' из правой таблицы <strong>' + escapeHtml(file.name) + '</strong> не нашли пару.' });
      }
    }
  });

  const colsWithNull = columns.filter(c => nullByCol[c] > 0);
  colsWithNull.slice(0, 5).forEach(col => {
    const n = nullByCol[col];
    warnings.push({ type: 'info', icon: '🕳', text: 'Колонка <code>' + escapeHtml(col) + '</code>: <strong>' + n + '</strong> ' + plural(n, 'значение', 'значения', 'значений') + ' NULL (' + formatPct(n, totalRows) + ').' });
  });
  if (colsWithNull.length > 5) {
    warnings.push({ type: 'info', icon: '…', text: 'И ещё <strong>' + (colsWithNull.length - 5) + '</strong> ' + plural(colsWithNull.length - 5, 'колонка', 'колонки', 'колонок') + ' с NULL.' });
  }

  if (fullDuplicates > 0) {
    warnings.push({ type: 'danger', icon: '⚠', text: 'Обнаружено <strong>' + fullDuplicates + '</strong> ' + plural(fullDuplicates, 'полный дубликат', 'полных дубликата', 'полных дубликатов') + '.' });
  } else if (totalRows > 0) {
    warnings.push({ type: 'ok', icon: '✓', text: 'Полных дубликатов нет.' });
  }

  if (warnings.length === 0) { dom.warningsCard.hidden = true; return; }
  dom.warningsCard.hidden = false;
  dom.warningList.innerHTML = warnings.map(w => '<div class="warning-item ' + w.type + '"><span class="icon">' + w.icon + '</span><span>' + w.text + '</span></div>').join('');
}

function renderSources(analysis, orderedFiles) {
  const steps = analysis.mergeSteps;
  if (steps.length === 0) { dom.sourcesCard.hidden = true; return; }
  dom.sourcesCard.hidden = false;
  let html = '';
  steps.forEach((s, idx) => {
    if (idx === 0) {
      html += '<div class="source-card">' +
        '<div class="source-header"><div class="source-name"><span>★ ' + escapeHtml(s.fromFile) + '</span><span class="badge badge-inner">базовая</span></div></div>' +
        '<div class="source-stats">' +
        '<div class="s-item"><span class="s-label">Строк в базе</span><span class="s-value">' + s.rowsBefore.toLocaleString('ru-RU') + '</span></div>' +
        '<div class="s-item"><span class="s-label">Ключ</span><span class="s-value"><code>' + escapeHtml(s.key) + '</code></span></div>' +
        '</div></div>';
    } else {
      const badgeClass = { inner: 'badge-inner', left: 'badge-left', right: 'badge-right', outer: 'badge-outer' }[s.joinType] || 'badge-inner';
      const matched = s.leftMatched;
      const unmatched = s.leftUnmatched;
      const totalLeft = matched + unmatched;
      const matchPct = totalLeft > 0 ? ((matched / totalLeft) * 100).toFixed(1) : '0';
      html += '<div class="source-card">' +
        '<div class="source-header"><div class="source-name"><span>→ ' + escapeHtml(s.fromFile) + '</span><span class="badge ' + badgeClass + '">' + escapeHtml(s.joinType) + '</span></div></div>' +
        '<div class="source-stats">' +
        '<div class="s-item"><span class="s-label">Строк в таблице</span><span class="s-value">' + s.rightTotal.toLocaleString('ru-RU') + '</span></div>' +
        '<div class="s-item"><span class="s-label">Нашли пару</span><span class="s-value matched">' + matched.toLocaleString('ru-RU') + '</span></div>' +
        '<div class="s-item"><span class="s-label">Не нашли</span><span class="s-value ' + (unmatched > 0 ? 'unmatched' : '') + '">' + unmatched.toLocaleString('ru-RU') + '</span></div>' +
        '<div class="s-item"><span class="s-label">% совпадений</span><span class="s-value">' + matchPct + '%</span></div>' +
        '<div class="s-item"><span class="s-label">Макс. размножение</span><span class="s-value ' + (s.maxMultiplier > 1 ? 'multiplied' : '') + '">×' + (s.maxMultiplier || 1) + '</span></div>' +
        '<div class="s-item"><span class="s-label">Ключ</span><span class="s-value"><code>' + escapeHtml(s.key) + '</code></span></div>' +
        '</div></div>';
    }
  });
  dom.sourcesList.innerHTML = html;
}
