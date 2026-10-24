function looksLikeNumber(v) {
  if (v === NULL_MARKER || v === '' || v == null) return false;
  const s = String(v).trim().replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s);
}
function parseNumber(v) {
  if (!looksLikeNumber(v)) return NaN;
  return parseFloat(String(v).trim().replace(',', '.'));
}
function looksLikeDate(v) {
  if (v === NULL_MARKER || v === '' || v == null) return false;
  const s = String(v).trim();
  if (s.length === 0 || s.length > 40) return false;

  // ISO: 2024-01-15, 2024/01/15 (+ опционально время)
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?/.test(s)) return true;

  // DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY (+ время)
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?)?/.test(s)) return true;

  // MM/DD/YY (US-формат, с временем или без) — как в online_retail
  if (/^\d{1,2}\/\d{1,2}\/\d{2}(\s+\d{1,2}:\d{2})?$/.test(s)) return true;

  // Месяц словами: 15 Jan 2024, Jan 15, 2024
  if (/^\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}/.test(s)) return true;
  if (/^[A-Za-z]{3,}\s+\d{1,2},?\s+\d{2,4}/.test(s)) return true;

  return false;
}

function looksLikeBool(v) {
  if (v === NULL_MARKER || v === '' || v == null) return false;
  const s = String(v).trim().toLowerCase();
  return ['true', 'false', 'yes', 'no', '0', '1'].indexOf(s) >= 0;
}

function hasTimeComponent(v) {
  if (v === NULL_MARKER || v === '' || v == null) return false;
  const s = String(v).trim();
  return /\d{1,2}:\d{2}(:\d{2})?/.test(s);
}

function detectColumnType(values, columnName) {
  const nonNull = values.filter(v => v !== NULL_MARKER && v !== '' && v != null);
  if (nonNull.length === 0) return 'empty';

  const counts = { number: 0, date: 0, datetime: 0, bool: 0, string: 0 };
  let dateWithTime = 0;

  nonNull.forEach(v => {
    if (looksLikeDate(v)) {
      counts.date++;
      if (hasTimeComponent(v)) dateWithTime++;
    }
    else if (looksLikeNumber(v)) counts.number++;
    else if (looksLikeBool(v)) counts.bool++;
    else counts.string++;
  });

  const total = nonNull.length;
  const threshold = 0.9;

  // Сначала проверяем на ID: имя намекает + почти все значения уникальны
  const uniqueSet = new Set(nonNull.map(String));
  const uniqueRatio = uniqueSet.size / nonNull.length;
  if (isIdLike(columnName || '', uniqueRatio, counts)) {
    return 'id';
  }

  // Дата с временем → datetime
  if (counts.date / total >= threshold) {
    if (dateWithTime / counts.date >= 0.3) return 'datetime';
    return 'date';
  }

  if (counts.number / total >= threshold) return 'number';
  if (counts.bool / total >= threshold) return 'bool';
  if (counts.string / total >= threshold) return 'string';
  return 'mixed';
}

// Эвристика: является ли колонка идентификатором
function isIdLike(name, uniqueRatio, counts) {
  const lower = name.toLowerCase().replace(/\s+/g, '');
  // Имя намекает на ID?
  const nameSuggestsId = /(^id$|_id$|^id_|invoice|order|^code|sku|^no$|^num$)/.test(lower);
  if (!nameSuggestsId) return false;
  // Почти все значения уникальны?
  if (uniqueRatio < 0.85) return false;
  // И значения числовые или строковые
  const total = counts.number + counts.date + counts.datetime + counts.bool + counts.string;
  if (total === 0) return false;
  const numericOrString = (counts.number + counts.string) / total;
  return numericOrString > 0.95;
}

// Медиана
function median(arr) {
  if (arr.length === 0) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Профилирование одной колонки
function profileColumn(name, values) {
  const total = values.length;
  let nulls = 0;
  const valueCounts = new Map();

  values.forEach(v => {
    if (v === NULL_MARKER || v === '' || v == null) { nulls++; return; }
    const key = String(v);
    valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
  });

  const uniqueCount = valueCounts.size;
  const type = detectColumnType(values,name);
  const nullPct = total > 0 ? (nulls / total) * 100 : 0;

  // Дубликаты значений: сколько строк имеют неуникальное значение
  let dupRows = 0;
  let dupValues = 0;
  valueCounts.forEach(cnt => {
    if (cnt > 1) { dupValues++; dupRows += cnt; }
  });

  // Числовая статистика
  let numeric = null;
  if (type === 'number') {
    const nums = values.map(parseNumber).filter(n => !isNaN(n));
    if (nums.length > 0) {
      nums.sort((a, b) => a - b);
      const sum = nums.reduce((s, n) => s + n, 0);
      const mean = sum / nums.length;
      const min = nums[0];
      const max = nums[nums.length - 1];
      const med = median(nums);
      // Стд. отклонение
      const variance = nums.reduce((s, n) => s + (n - mean) * (n - mean), 0) / nums.length;
      const std = Math.sqrt(variance);
      // Аномалии по правилу 3 сигм
      const anomalies = nums.filter(n => Math.abs(n - mean) > 3 * std);
      // Отрицательные, нули
      const negatives = nums.filter(n => n < 0).length;
      const zeros = nums.filter(n => n === 0).length;

      numeric = {
        count: nums.length, mean, min, max, median: med, std,
        negatives, zeros,
        anomalies: anomalies.length,
        anomalyExamples: anomalies.slice(0, 3),
      };
    }
  }

  // Топ-5 значений
  const topValues = Array.from(valueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([v, c]) => ({ value: v, count: c }));

  return {
    name, total, nulls, nullPct, uniqueCount, type,
    dupRows, dupValues, numeric, topValues,
  };
}

// Полная диагностика файла
function diagnoseFile(file) {
  const profiles = file.columns.map(col => {
    const values = file.rows.map(r => r[col]);
    return profileColumn(col, values);
  });

  // Полные дубликаты
  const seen = new Set();
  let fullDuplicates = 0;
  const duplicateRowsSamples = [];
  const duplicateRowIndexes = [];

  file.rows.forEach((row, idx) => {
    const key = file.columns.map(c => String(row[c] ?? '')).join('\u0001');
    if (seen.has(key)) {
      fullDuplicates++;
      if (duplicateRowsSamples.length < 10) {
        duplicateRowsSamples.push({ index: idx, row });
      }
      duplicateRowIndexes.push(idx);
    } else {
      seen.add(key);
    }
  });

  // Проблемы с сэмплами
  const problems = [];

  profiles.forEach(p => {
    const colName = p.name;
    const colIndex = file.columns.indexOf(colName);

    if (p.type === 'empty') {
      problems.push({
        type: 'danger', icon: '⚠',
        text: 'Колонка <code>' + escapeHtml(colName) + '</code> пустая — все значения NULL.',
        samples: [],
        sampleNote: 'Все значения NULL.',
      });
      return;
    }

    if (p.nullPct > 50) {
      problems.push({
        type: 'danger', icon: '⚠',
        text: 'Колонка <code>' + escapeHtml(colName) + '</code>: <b>' + p.nullPct.toFixed(1) + '%</b> пропусков (' + p.nulls + ' из ' + p.total + ').',
        samples: collectSamples(file.rows, colName, v => v === NULL_MARKER),
        sampleNote: 'Строки с NULL в этой колонке:',
      });
    } else if (p.nullPct > 10) {
      problems.push({
        type: 'warn', icon: '⚠',
        text: 'Колонка <code>' + escapeHtml(colName) + '</code>: <b>' + p.nullPct.toFixed(1) + '%</b> пропусков (' + p.nulls + ').',
        samples: collectSamples(file.rows, colName, v => v === NULL_MARKER),
        sampleNote: 'Строки с NULL в этой колонке:',
      });
    }

    if (p.type === 'mixed') {
      // Собираем примеры "непохожих" значений
      problems.push({
        type: 'warn', icon: '⚠',
        text: 'Колонка <code>' + escapeHtml(colName) + '</code> содержит смешанные типы — может мешать анализу.',
        samples: collectSamples(file.rows, colName, v => {
          if (v === NULL_MARKER) return false;
          // Примеры "строковых" значений среди числовой колонки
          return !looksLikeNumber(v) && !looksLikeDate(v) && !looksLikeBool(v);
        }, 5),
        sampleNote: 'Примеры нечисловых значений:',
      });
    }

    if (p.uniqueCount === p.total && p.total > 0 && p.nulls === 0 && p.type === 'id') {
      problems.push({
        type: 'info', icon: '🔑',
        text: 'Колонка <code>' + escapeHtml(colName) + '</code> — уникальная, похожа на ID, подходит как ключ.',
        samples: [],
      });
    }

    if (p.numeric) {
      if (p.numeric.negatives > 0 && !/balance|delta|profit|loss|temp|score/i.test(colName)) {
        problems.push({
          type: 'info', icon: 'ℹ',
          text: 'Колонка <code>' + escapeHtml(colName) + '</code> содержит <b>' + p.numeric.negatives + '</b> отрицательных значений.',
          samples: collectSamples(file.rows, colName, v => {
            const n = parseNumber(v);
            return !isNaN(n) && n < 0;
          }),
          sampleNote: 'Строки с отрицательными значениями:',
        });
      }

      if (p.numeric.zeros > 0 && p.numeric.zeros / p.numeric.count > 0.05) {
        problems.push({
          type: 'warn', icon: '⚠',
          text: 'Колонка <code>' + escapeHtml(colName) + '</code>: <b>' + p.numeric.zeros + '</b> нулевых значений (' + ((p.numeric.zeros / p.numeric.count) * 100).toFixed(1) + '%).',
          samples: collectSamples(file.rows, colName, v => {
            const n = parseNumber(v);
            return !isNaN(n) && n === 0;
          }),
          sampleNote: 'Строки с нулевыми значениями:',
        });
      }

      if (p.numeric.anomalies > 0) {
        // Найдём границы 3σ, чтобы отобрать сами выбросы
        const nums = file.rows.map(r => parseNumber(r[colName])).filter(n => !isNaN(n));
        const sum = nums.reduce((s, n) => s + n, 0);
        const mean = sum / nums.length;
        const variance = nums.reduce((s, n) => s + (n - mean) * (n - mean), 0) / nums.length;
        const std = Math.sqrt(variance);
        const low = mean - 3 * std;
        const high = mean + 3 * std;

        problems.push({
          type: 'info', icon: '📈',
          text: 'Колонка <code>' + escapeHtml(colName) + '</code>: <b>' + p.numeric.anomalies + '</b> выброс(ов) по правилу 3σ.',
          samples: collectSamples(file.rows, colName, v => {
            const n = parseNumber(v);
            return !isNaN(n) && (n < low || n > high);
          }),
          sampleNote: 'Строки с выбросами (среднее ± 3σ):',
        });
      }
    }
  });

  if (fullDuplicates > 0) {
    problems.push({
      type: 'warn', icon: '⚠',
      text: 'Найдено <b>' + fullDuplicates + '</b> полных дубликат(ов) строк.',
      samples: duplicateRowsSamples,
      sampleNote: 'Примеры дублирующихся строк:',
    });
  } else {
    problems.push({
      type: 'ok', icon: '✓',
      text: 'Полных дубликатов строк нет.',
      samples: [],
    });
  }

  return { profiles, fullDuplicates, problems };
}

// Собирает до N строк, где выполняется predicate
function collectSamples(rows, colName, predicate, limit) {
  limit = limit || 10;
  const samples = [];
  for (let i = 0; i < rows.length && samples.length < limit; i++) {
    if (predicate(rows[i][colName])) {
      samples.push({ index: i, row: rows[i] });
    }
  }
  return samples;
}

// ============ Отрисовка ============

function renderDiagFileList() {
  const el = document.getElementById('fileList');
  const countEl = document.getElementById('fileCount');
  const card = document.getElementById('filesCard');

  if (state.files.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  countEl.textContent = state.files.length;

  el.innerHTML = state.files.map(f => {
    const badge = f.isResult ? '<span class="badge result">результат</span>' : '';
    return '<div class="file-item" data-id="' + f.id + '">' +
      '<div class="file-info">' +
        '<div class="file-name"><span>' + escapeHtml(f.name) + '</span>' + badge + '</div>' +
        '<div class="cols">' + f.columns.map(c => '<span class="col-tag">' + escapeHtml(c) + '</span>').join('') + '</div>' +
      '</div>' +
      '<div class="file-controls">' +
        '<div class="control-group"><label>Строк</label><div style="font-weight:600;">' + f.rows.length.toLocaleString('ru-RU') + '</div></div>' +
        '<div class="control-group"><label>Колонок</label><div style="font-weight:600;">' + f.columns.length + '</div></div>' +
        '<button class="remove-btn" data-id="' + f.id + '" title="Удалить">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');

  el.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      state.files = state.files.filter(f => f.id !== id);
      if (state.baseFileId === id) state.baseFileId = null;
      renderDiagFileList();
      scheduleSave();
      updateNavStorageStatus();
    });
  });
}

function typeBadge(type) {
  const labels = {
    number: 'число', string: 'строка', date: 'дата',
    datetime: 'дата+время', bool: 'boolean', mixed: 'смешанный',
    empty: 'пусто', id: 'ID',
  };
  return '<span class="type-badge type-' + type + '">' + (labels[type] || type) + '</span>';
}

// Отрисовка таблицы с примерами строк
function renderSamplesTable(file, samples) {
  if (!samples || samples.length === 0) return '';
  const cols = file.columns;
  let html = '<table class="diag-samples-table"><thead><tr>';
  html += '<th style="width:50px;">#</th>';
  cols.forEach(c => { html += '<th>' + escapeHtml(c) + '</th>'; });
  html += '</tr></thead><tbody>';

  samples.forEach(s => {
    html += '<tr>';
    html += '<td class="mono" style="color:#94a3b8;">' + (s.index + 1) + '</td>';
    cols.forEach(c => {
      const v = s.row[c];
      if (isNullVal(v)) {
        html += '<td class="null-cell">' + NULL_MARKER + '</td>';
      } else {
        const text = String(v);
        const short = text.length > 40 ? text.slice(0, 40) + '…' : text;
        html += '<td title="' + escapeHtml(text) + '">' + escapeHtml(short) + '</td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function renderDiagnosticsForFile(file, diag) {
  const html = [];

  // Шапка
  html.push('<div class="diag-card">');
  html.push('<div class="diag-card-title">📄 ' + escapeHtml(file.name) +
    '<span class="meta">' + file.rows.length.toLocaleString('ru-RU') + ' строк</span>' +
    '<span class="meta">' + file.columns.length + ' колонок</span>' +
    '</div>');

  // Сводка
  const emptyCols = diag.profiles.filter(p => p.type === 'empty').length;
  const highNullCols = diag.profiles.filter(p => p.nullPct > 50).length;
  const mixedCols = diag.profiles.filter(p => p.type === 'mixed').length;

  html.push('<div class="diag-summary">');
  html.push('<div class="item"><div class="lbl">Строк</div><div class="val">' + file.rows.length.toLocaleString('ru-RU') + '</div></div>');
  html.push('<div class="item"><div class="lbl">Колонок</div><div class="val">' + file.columns.length + '</div></div>');
  html.push('<div class="item ' + (diag.fullDuplicates > 0 ? 'warn' : 'ok') + '"><div class="lbl">Полных дубликатов</div><div class="val">' + diag.fullDuplicates + '</div></div>');
  html.push('<div class="item ' + (emptyCols > 0 ? 'danger' : 'ok') + '"><div class="lbl">Пустых колонок</div><div class="val">' + emptyCols + '</div></div>');
  html.push('<div class="item ' + (highNullCols > 0 ? 'danger' : 'ok') + '"><div class="lbl">Колонок с NULL&gt;50%</div><div class="val">' + highNullCols + '</div></div>');
  html.push('<div class="item ' + (mixedCols > 0 ? 'warn' : 'ok') + '"><div class="lbl">Смешанных типов</div><div class="val">' + mixedCols + '</div></div>');
  html.push('</div>');

    // Проблемы
  html.push('<div class="diag-section-title">🚩 Проблемы <span class="count">' + diag.problems.length + '</span></div>');
  html.push('<div class="diag-problems">');
  if (diag.problems.length === 0) {
    html.push('<div class="diag-problem ok"><span class="icon">✓</span><span>Проблем не обнаружено.</span></div>');
  } else {
    diag.problems.forEach((p, pIdx) => {
      const hasSamples = p.samples && p.samples.length > 0;
      const globalIdx = file.id + '_p' + pIdx;

      html.push('<div class="diag-problem ' + p.type + '" data-problem-id="' + globalIdx + '">' +
        '<span class="icon">' + p.icon + '</span>' +
        '<span style="flex:1;">' + p.text + '</span>' +
        (hasSamples ?
          '<button class="diag-samples-toggle" type="button" data-target="samples-' + globalIdx + '">' +
            '👁 ' + p.samples.length + ' ' + plural(p.samples.length, 'пример', 'примера', 'примеров') +
          '</button>'
          : '') +
      '</div>');

      // Раскрывающийся блок с сэмплами
      if (hasSamples) {
        html.push('<div class="diag-samples" id="samples-' + globalIdx + '" hidden>');
        html.push('<div class="diag-samples-note">' + (p.sampleNote || 'Примеры строк:') + '</div>');
        html.push('<div style="overflow-x:auto;">');
        html.push(renderSamplesTable(file, p.samples));
        html.push('</div></div>');
      }
    });
  }
  html.push('</div>');

  // Профили колонок
  html.push('<div class="diag-section-title">📊 Профили колонок <span class="count">' + diag.profiles.length + '</span></div>');
  html.push('<div style="overflow-x:auto;"><table class="diag-table"><thead><tr>' +
    '<th>Колонка</th>' +
    '<th>Тип</th>' +
    '<th class="right">NULL</th>' +
    '<th class="right">% NULL</th>' +
    '<th class="right">Уникальных</th>' +
    '<th class="right">Дублей (значений)</th>' +
    '<th class="right">Дублей (строк)</th>' +
    '<th>Топ-5 значений</th>' +
    '</tr></thead><tbody>');

  diag.profiles.forEach(p => {
    const nullPctBar = (() => {
      const filled = 100 - p.nullPct;
      let color = '#22c55e';
      if (p.nullPct > 50) color = '#ef4444';
      else if (p.nullPct > 20) color = '#f59e0b';
      else if (p.nullPct > 5) color = '#eab308';
      return '<div class="diag-bar-wrap"><span class="diag-bar"><span class="diag-bar-fill" style="width:' + filled + '%;background:' + color + ';"></span></span><span style="font-size:12px;color:#64748b;">' + p.nullPct.toFixed(1) + '%</span></div>';
    })();

    const topHtml = p.topValues.length === 0
      ? '<span style="color:#94a3b8;font-size:12px;">—</span>'
      : p.topValues.map(t =>
          '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;background:#f1f5f9;border-radius:5px;font-size:11px;color:#334155;">' +
            escapeHtml(t.value.length > 20 ? t.value.slice(0, 20) + '…' : t.value) +
            ' <b style="color:#0b1c33;">×' + t.count + '</b>' +
          '</span>'
        ).join('');

    html.push('<tr>' +
      '<td class="mono"><b>' + escapeHtml(p.name) + '</b></td>' +
      '<td>' + typeBadge(p.type) + '</td>' +
      '<td class="right">' + p.nulls.toLocaleString('ru-RU') + '</td>' +
      '<td class="right">' + nullPctBar + '</td>' +
      '<td class="right">' + p.uniqueCount.toLocaleString('ru-RU') + '</td>' +
      '<td class="right">' + p.dupValues + '</td>' +
      '<td class="right">' + p.dupRows + '</td>' +
      '<td>' + topHtml + '</td>' +
    '</tr>');
  });
  html.push('</tbody></table></div>');

  // Числовая статистика
  const numericProfiles = diag.profiles.filter(p => p.numeric);
  if (numericProfiles.length > 0) {
    html.push('<div class="diag-section-title">🔢 Числовая статистика <span class="count">' + numericProfiles.length + '</span></div>');
    html.push('<div style="overflow-x:auto;"><table class="diag-table"><thead><tr>' +
      '<th>Колонка</th>' +
      '<th class="right">Мин</th>' +
      '<th class="right">Медиана</th>' +
      '<th class="right">Среднее</th>' +
      '<th class="right">Макс</th>' +
      '<th class="right">Std</th>' +
      '<th class="right">Отрицат.</th>' +
      '<th class="right">Нулей</th>' +
      '<th class="right">Выбросов (3σ)</th>' +
      '</tr></thead><tbody>');
    numericProfiles.forEach(p => {
      const n = p.numeric;
      const fmt = (x) => Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(2);
      html.push('<tr>' +
        '<td class="mono"><b>' + escapeHtml(p.name) + '</b></td>' +
        '<td class="right">' + fmt(n.min) + '</td>' +
        '<td class="right">' + fmt(n.median) + '</td>' +
        '<td class="right">' + fmt(n.mean) + '</td>' +
        '<td class="right">' + fmt(n.max) + '</td>' +
        '<td class="right">' + fmt(n.std) + '</td>' +
        '<td class="right">' + (n.negatives > 0 ? '<span style="color:#b91c1c;font-weight:600;">' + n.negatives + '</span>' : n.negatives) + '</td>' +
        '<td class="right">' + n.zeros + '</td>' +
        '<td class="right">' + (n.anomalies > 0 ? '<span style="color:#92400e;font-weight:600;">' + n.anomalies + '</span>' : n.anomalies) + '</td>' +
      '</tr>');
    });
    html.push('</tbody></table></div>');
  }

  html.push('</div>');
  return html.join('');
}

function runDiagnostics() {
  const container = document.getElementById('diagnosticsContainer');
  if (state.files.length === 0) {
    container.innerHTML = '';
    return;
  }

  const html = [];
  state.files.forEach(f => {
    const diag = diagnoseFile(f);
    f._diag = diag;
    html.push(renderDiagnosticsForFile(f, diag));
  });
  container.innerHTML = html.join('');

  // Обработчики раскрытия сэмплов
  container.querySelectorAll('.diag-samples-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (!el) return;
      const isHidden = el.hidden;
      el.hidden = !isHidden;
      btn.textContent = isHidden
        ? '▾ Скрыть примеры'
        : '👁 ' + el.querySelectorAll('tbody tr').length + ' ' +
          plural(el.querySelectorAll('tbody tr').length, 'пример', 'примера', 'примеров');
    });
  });
}

// Текстовый отчёт для скачивания
function buildDiagReport() {
  let text = '=== ДИАГНОСТИКА ДАННЫХ ===\n';
  text += 'Дата: ' + new Date().toLocaleString('ru-RU') + '\n';
  text += 'Файлов: ' + state.files.length + '\n\n';

  state.files.forEach(f => {
    const diag = f._diag || diagnoseFile(f);
    text += '─────────\n';
    text += 'Файл: ' + f.name + '\n';
    text += 'Строк: ' + f.rows.length + ', колонок: ' + f.columns.length + '\n';
    text += 'Полных дубликатов: ' + diag.fullDuplicates + '\n\n';

    text += 'Проблемы:\n';
    if (diag.problems.length === 0) text += '  (нет)\n';
    else diag.problems.forEach(p => {
      const plain = p.text.replace(/<[^>]+>/g, '');
      text += '  [' + p.type.toUpperCase() + '] ' + plain + '\n';
    });
    text += '\n';

    text += 'Профили колонок:\n';
    diag.profiles.forEach(p => {
      text += '  ' + p.name + ' | тип: ' + p.type +
        ' | NULL: ' + p.nulls + ' (' + p.nullPct.toFixed(1) + '%)' +
        ' | уникальных: ' + p.uniqueCount +
        ' | дублей значений: ' + p.dupValues +
        ' | дублей строк: ' + p.dupRows + '\n';
      if (p.numeric) {
        const n = p.numeric;
        text += '     мин: ' + n.min.toFixed(2) + ', медиана: ' + n.median.toFixed(2) +
          ', среднее: ' + n.mean.toFixed(2) + ', макс: ' + n.max.toFixed(2) +
          ', std: ' + n.std.toFixed(2) + '\n';
        text += '     отрицательных: ' + n.negatives + ', нулей: ' + n.zeros +
          ', выбросов (3σ): ' + n.anomalies + '\n';
      }
    });
    text += '\n';
  });

  return text;
}

// ============ Инициализация ============

function setupHandlers() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const pickBtn = document.getElementById('pickFilesBtn');
  const reloadBtn = document.getElementById('reloadBtn');
  const runBtn = document.getElementById('runDiagBtn');
  const exportBtn = document.getElementById('exportDiagBtn');
  const clearBtn = document.getElementById('clearAllBtn');

  dropzone.addEventListener('click', () => fileInput.click());
  pickBtn.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('hover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('hover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('hover');
        if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files, () => {
        renderDiagFileList();
        runDiagnostics();
      });
    }
  });

  fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
      handleFiles(e.target.files, () => {
        renderDiagFileList();
        runDiagnostics();
      });
      fileInput.value = '';
    }
  });

  reloadBtn.addEventListener('click', () => {
    restoreIntoState(state);
    renderDiagFileList();
    runDiagnostics();
    updateNavStorageStatus();
  });

  runBtn.addEventListener('click', () => {
    runDiagnostics();
  });

  exportBtn.addEventListener('click', () => {
    if (state.files.length === 0) { alert('Нет файлов'); return; }
    const text = buildDiagReport();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'diagnostics_report.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Очистить все файлы и хранилище?')) return;
    state.files = [];
    state.baseFileId = null;
    state.resultCounter = 0;
    state.lastResultFileId = null;
    clearState();
    renderDiagFileList();
    document.getElementById('diagnosticsContainer').innerHTML = '';
    updateNavStorageStatus();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  restoreIntoState(state);
  renderDiagFileList();
  setupHandlers();
  // Автоматически запускаем диагностику, если файлы уже есть
  if (state.files.length > 0) runDiagnostics();
});
