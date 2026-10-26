// Страница очистки: имена, типы, NULL, дубли, фильтры

const CLEANUP_STORAGE_KEY = 'analyzer_cleanup_v1';

function loadCleanupSettings() {
  try {
    const raw = localStorage.getItem(CLEANUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveCleanupSettings(settings) {
  try { localStorage.setItem(CLEANUP_STORAGE_KEY, JSON.stringify(settings)); }
  catch (e) { console.warn(e); }
}

let cleanupSettings = loadCleanupSettings();

function getFileSettings(fileId) {
  if (!cleanupSettings[fileId]) {
    cleanupSettings[fileId] = {
      columns: {},
      nullRule: 'keep',
      nullReplaceValue: '',
      dupRule: 'none',
      dupKey: '',
      dupKeep: 'first',
      filters: [],
    };
  }
  return cleanupSettings[fileId];
}

function getColumnSettings(fileId, colName, autoType) {
  const fs = getFileSettings(fileId);
  if (!fs.columns[colName]) {
    fs.columns[colName] = {
      enabled: true,
      newName: colName,
      type: autoType || 'string',
    };
  }
  return fs.columns[colName];
}

function convertValue(v, targetType) {
  if (v === NULL_MARKER || v === undefined || v === null || v === '') return NULL_MARKER;
  const s = String(v).trim();

  switch (targetType) {
    case 'string': return s;
    case 'number': {
      const cleaned = s.replace(/\s/g, '').replace(',', '.');
      const n = parseFloat(cleaned);
      return isNaN(n) ? NULL_MARKER : String(n);
    }
    case 'integer': {
      const cleaned = s.replace(/\s/g, '').replace(',', '.');
      const n = parseFloat(cleaned);
      return isNaN(n) ? NULL_MARKER : String(Math.trunc(n));
    }
    case 'date': {
      const d = parseDateValue(s);
      return d ? d : NULL_MARKER;
    }
    case 'datetime': {
      const d = parseDateTimeValue(s);
      return d ? d : NULL_MARKER;
    }
    case 'bool': {
      const lower = s.toLowerCase();
      if (['true', 'yes', '1', 'да'].indexOf(lower) >= 0) return 'true';
      if (['false', 'no', '0', 'нет'].indexOf(lower) >= 0) return 'false';
      return NULL_MARKER;
    }
    case 'id':
    case 'mixed':
    default: return s;
  }
}

function parseDateValue(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    let year = parseInt(m[3]);
    year = year < 50 ? 2000 + year : 1900 + year;
    return year + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  return null;
}

function parseDateTimeValue(s) {
  if (!s) return null;
  let datePart = s;
  let timePart = '';
  const timeMatch = s.match(/\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    timePart = ' ' + timeMatch[1].padStart(2, '0') + ':' + timeMatch[2] + (timeMatch[3] ? ':' + timeMatch[3] : '');
    datePart = s.substring(0, timeMatch.index);
  }
  let m = datePart.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') + timePart;
  m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) {
    let year = parseInt(m[3]);
    year = year < 50 ? 2000 + year : 1900 + year;
    return year + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') + timePart;
  }
  m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') + timePart;
  m = datePart.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') + timePart;
  return null;
}

function applyFilters(rows, filters) {
  if (!filters || filters.length === 0) return rows;
  return rows.filter(row => {
    return filters.every(f => {
      if (!f.column || !f.op) return true;
      const val = row[f.column];
      if (val === NULL_MARKER || val == null) return f.op === 'is_null';
      const sval = String(val).trim();
      const fval = String(f.value || '').trim();

      switch (f.op) {
        case 'eq': return sval === fval;
        case 'neq': return sval !== fval;
        case 'gt': return parseFloat(sval) > parseFloat(fval);
        case 'gte': return parseFloat(sval) >= parseFloat(fval);
        case 'lt': return parseFloat(sval) < parseFloat(fval);
        case 'lte': return parseFloat(sval) <= parseFloat(fval);
        case 'contains': return sval.toLowerCase().indexOf(fval.toLowerCase()) >= 0;
        case 'not_contains': return sval.toLowerCase().indexOf(fval.toLowerCase()) < 0;
        case 'starts': return sval.toLowerCase().indexOf(fval.toLowerCase()) === 0;
        case 'ends': return sval.toLowerCase().slice(-fval.length) === fval.toLowerCase();
        case 'is_null': return false;
        case 'not_null': return true;
        default: return true;
      }
    });
  });
}

function applyCleanup(file) {
  const fs = getFileSettings(file.id);
  let rows = file.rows.slice();

  rows = applyFilters(rows, fs.filters);

  const newColumns = [];
  const columnMap = {};
  file.columns.forEach(col => {
    const cs = getColumnSettings(file.id, col, file._autoTypes ? file._autoTypes[col] : 'string');
    if (!cs.enabled) return;
    const newName = (cs.newName || col).trim() || col;
    columnMap[col] = newName;
    newColumns.push(newName);
  });

  rows = rows.map(row => {
    const out = {};
    file.columns.forEach(col => {
      const cs = getColumnSettings(file.id, col, file._autoTypes ? file._autoTypes[col] : 'string');
      if (!cs.enabled) return;
      const newName = columnMap[col];
      const converted = convertValue(row[col], cs.type);
      out[newName] = converted;
    });
    return out;
  });

  if (fs.nullRule === 'replace') {
    const replaceVal = fs.nullReplaceValue !== undefined ? fs.nullReplaceValue : '';
    rows = rows.map(row => {
      const out = {};
      newColumns.forEach(c => {
        out[c] = row[c] === NULL_MARKER ? replaceVal : row[c];
      });
      return out;
    });
  } else if (fs.nullRule === 'drop_rows') {
    rows = rows.filter(row => newColumns.every(c => row[c] !== NULL_MARKER));
  } else if (fs.nullRule === 'drop_rows_any') {
    rows = rows.filter(row => newColumns.some(c => row[c] !== NULL_MARKER));
  }

  if (fs.dupRule === 'full') {
    const seen = new Set();
    rows = rows.filter(row => {
      const key = newColumns.map(c => String(row[c] ?? '')).join('\u0001');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else if (fs.dupRule === 'key' && fs.dupKey) {
    const keyCol = fs.dupKey;
    const seenMap = new Map();
    const keep = fs.dupKeep === 'last' ? 'last' : 'first';

    if (keep === 'first') {
      rows = rows.filter(row => {
        const k = String(row[keyCol] ?? '');
        if (seenMap.has(k)) return false;
        seenMap.set(k, true);
        return true;
      });
    } else {
      const reversed = [];
      const seen = new Set();
      for (let i = rows.length - 1; i >= 0; i--) {
        const k = String(rows[i][keyCol] ?? '');
        if (seen.has(k)) continue;
        seen.add(k);
        reversed.push(rows[i]);
      }
      rows = reversed.reverse();
    }
  }

  return { rows, columns: newColumns };
}

function autoDetectTypes(file) {
  const types = {};
  file.columns.forEach(col => {
    const values = file.rows.map(r => r[col]);
    types[col] = detectColumnType(values, col);
  });
  return types;
}

function renderFiles() {
  const container = document.getElementById('filesContainer');
  const emptyCard = document.getElementById('emptyCard');

  if (state.files.length === 0) {
    emptyCard.style.display = 'block';
    container.innerHTML = '';
    return;
  }
  emptyCard.style.display = 'none';

  const html = [];
  state.files.forEach(file => {
    if (!file._autoTypes) {
      file._autoTypes = autoDetectTypes(file);
    }
    html.push(renderFileCard(file));
  });
  container.innerHTML = html.join('');

  state.files.forEach(file => {
    attachFileHandlers(file);
  });
}

function renderFileCard(file) {
  const fs = getFileSettings(file.id);
  const autoTypes = file._autoTypes || {};

  const colsRows = file.columns.map(col => {
    const cs = getColumnSettings(file.id, col, autoTypes[col] || 'string');
    const origType = autoTypes[col] || 'string';
    const nameChanged = cs.newName !== col;
    const typeChanged = cs.type !== origType;

    const typeOptions = [
      ['string', 'строка'], ['number', 'число'], ['integer', 'целое'],
      ['date', 'дата'], ['datetime', 'дата+время'], ['bool', 'boolean'], ['id', 'ID'],
    ];

    return '<tr data-col="' + escapeHtml(col) + '" class="' + (cs.enabled ? '' : 'disabled') + '">' +
      '<td><input type="checkbox" class="col-enable" data-col="' + escapeHtml(col) + '" ' + (cs.enabled ? 'checked' : '') + '></td>' +
      '<td><code style="font-size:12px;">' + escapeHtml(col) + '</code></td>' +
      '<td><span class="orig-type">' + (autoTypes[col] || '—') + '</span></td>' +
      '<td><input type="text" class="col-newname ' + (nameChanged ? 'changed' : '') + '" data-col="' + escapeHtml(col) + '" value="' + escapeHtml(cs.newName) + '"></td>' +
      '<td><select class="col-type ' + (typeChanged ? 'changed' : '') + '" data-col="' + escapeHtml(col) + '">' +
        typeOptions.map(t => '<option value="' + t[0] + '" ' + (t[0] === cs.type ? 'selected' : '') + '>' + t[1] + '</option>').join('') +
      '</select></td>' +
    '</tr>';
  }).join('');

  const filtersHtml = (fs.filters || []).map((f, idx) => renderFilterRow(file, f, idx)).join('');

  const newNames = file.columns.map(col => {
    const cs = getColumnSettings(file.id, col, autoTypes[col] || 'string');
    return (cs.newName || col).trim() || col;
  });

  return '<div class="cleanup-card" data-file-id="' + file.id + '">' +
    '<div class="cleanup-card-title">📄 ' + escapeHtml(file.name) +
      '<span class="meta">' + file.rows.length.toLocaleString('ru-RU') + ' строк</span>' +
      '<span class="meta">' + file.columns.length + ' колонок</span></div>' +
    '<div class="cleanup-section"><div class="cleanup-section-title">📋 Колонки</div>' +
      '<div style="overflow-x:auto;"><table class="cols-table"><thead><tr>' +
        '<th style="width:30px;"></th><th>Оригинальное имя</th><th>Тип (авто)</th><th>Новое имя</th><th>Целевой тип</th>' +
      '</tr></thead><tbody>' + colsRows + '</tbody></table></div></div>' +
    '<div class="cleanup-section"><div class="cleanup-section-title">🕳 Правила для NULL</div>' +
      '<div class="radio-group">' +
        renderRadio(file.id, 'nullRule', 'keep', 'Оставить как есть', fs.nullRule) +
        renderRadio(file.id, 'nullRule', 'replace', 'Заменить на значение', fs.nullRule) +
        renderRadio(file.id, 'nullRule', 'drop_rows', 'Удалить строки, где есть NULL', fs.nullRule) +
      '</div>' +
      (fs.nullRule === 'replace' ? '<div style="margin-top:10px;"><label style="font-size:12px;color:#64748b;margin-right:8px;">Значение для замены:</label><input type="text" class="null-replace-value" data-file="' + file.id + '" value="' + escapeHtml(fs.nullReplaceValue || '') + '" placeholder="0 или пусто" style="padding:6px 10px;border-radius:6px;border:1px solid #d0dae6;font-size:13px;width:200px;"></div>' : '') +
    '</div>' +
    '<div class="cleanup-section"><div class="cleanup-section-title">🔄 Дедупликация</div>' +
      '<div class="radio-group">' +
        renderRadio(file.id, 'dupRule', 'none', 'Не трогать', fs.dupRule) +
        renderRadio(file.id, 'dupRule', 'full', 'Удалить полные дубликаты', fs.dupRule) +
        renderRadio(file.id, 'dupRule', 'key', 'По ключу', fs.dupRule) +
      '</div>' +
      (fs.dupRule === 'key' ? '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;"><select class="dup-key" data-file="' + file.id + '" style="padding:6px 10px;border-radius:6px;border:1px solid #d0dae6;font-size:13px;"><option value="">— выберите ключ —</option>' + newNames.map(n => '<option value="' + escapeHtml(n) + '" ' + (n === fs.dupKey ? 'selected' : '') + '>' + escapeHtml(n) + '</option>').join('') + '</select><label style="font-size:12px;color:#64748b;">Оставить:</label><select class="dup-keep" data-file="' + file.id + '" style="padding:6px 10px;border-radius:6px;border:1px solid #d0dae6;font-size:13px;"><option value="first" ' + (fs.dupKeep === 'first' ? 'selected' : '') + '>первую</option><option value="last" ' + (fs.dupKeep === 'last' ? 'selected' : '') + '>последнюю</option></select></div>' : '') +
    '</div>' +
    '<div class="cleanup-section"><div class="cleanup-section-title">🔍 Фильтры <button class="btn btn-sm add-filter-btn" data-file="' + file.id + '" type="button" style="margin-left:auto;font-size:11px;padding:4px 10px;">+ Добавить фильтр</button></div>' +
      '<div class="filters-list" data-file="' + file.id + '">' + (filtersHtml || '<div style="font-size:13px;color:#94a3b8;font-style:italic;">Нет фильтров — все строки участвуют</div>') + '</div></div>' +
    '<div class="cleanup-actions" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 22px; padding-top: 18px; border-top: 1px solid #f1f5f9;">' +
      '<button class="btn btn-primary apply-btn" data-file="' + file.id + '" type="button">✓ Применить очистку</button>' +
      '<button class="btn btn-sm reset-btn" data-file="' + file.id + '" type="button">↺ Сбросить настройки</button>' +
      '<button class="btn btn-sm export-recipe-btn" data-file="' + file.id + '" type="button" style="margin-left:auto;">💾 Сохранить паттерн</button>' +
      '<label class="btn btn-sm" style="cursor: pointer; margin:0; display: inline-flex; align-items: center; justify-content: center; padding: 6px 14px; font-size: 13px; border-radius: 8px; border: 1px solid #d0dae6; background: white; color: #1e293b;">' +
        '📥 Выбрать паттерн' +
        '<input type="file" class="import-recipe-input" data-file="' + file.id + '" accept=".json" style="display:none;">' +
      '</label>' +
    '</div></div>';
}

function renderRadio(fileId, field, value, label, currentValue) {
  const checked = currentValue === value;
  return '<label class="radio-option ' + (checked ? 'checked' : '') + '"><input type="radio" name="' + field + '_' + fileId + '" data-file="' + fileId + '" data-field="' + field + '" value="' + value + '" ' + (checked ? 'checked' : '') + '>' + label + '</label>';
}

function renderFilterRow(file, filter, idx) {
  const autoTypes = file._autoTypes || {};
  const opOptions = [
    ['eq', 'равно'], ['neq', 'не равно'], ['gt', '>'], ['gte', '>='], ['lt', '<'], ['lte', '<='],
    ['contains', 'содержит'], ['not_contains', 'не содержит'], ['starts', 'начинается с'],
    ['ends', 'заканчивается на'], ['is_null', 'is NULL'], ['not_null', 'not NULL'],
  ];
  const noValueOps = ['is_null', 'not_null'];

  return '<div class="filter-row" data-file="' + file.id + '" data-idx="' + idx + '">' +
    '<select class="filter-col" data-file="' + file.id + '" data-idx="' + idx + '">' +
      '<option value="">— колонка —</option>' +
      file.columns.map(c => {
        const cs = getColumnSettings(file.id, c, autoTypes[c] || 'string');
        const newName = (cs.newName || c).trim() || c;
        return '<option value="' + escapeHtml(newName) + '" ' + (newName === filter.column ? 'selected' : '') + '>' + escapeHtml(newName) + '</option>';
      }).join('') +
    '</select>' +
    '<select class="filter-op" data-file="' + file.id + '" data-idx="' + idx + '">' +
      opOptions.map(o => '<option value="' + o[0] + '" ' + (o[0] === filter.op ? 'selected' : '') + '>' + o[1] + '</option>').join('') +
    '</select>' +
    (noValueOps.indexOf(filter.op) >= 0 ? '' : '<input type="text" class="filter-value" data-file="' + file.id + '" data-idx="' + idx + '" value="' + escapeHtml(filter.value || '') + '" placeholder="значение">') +
    '<button class="filter-remove" type="button" data-file="' + file.id + '" data-idx="' + idx + '" title="Удалить">✕</button></div>';
}

function attachFileHandlers(file) {
  const card = document.querySelector('.cleanup-card[data-file-id="' + file.id + '"]');
  if (!card) return;
  const fs = getFileSettings(file.id);

  card.querySelectorAll('.col-enable').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const col = e.target.dataset.col;
      const cs = getColumnSettings(file.id, col, file._autoTypes[col]);
      cs.enabled = e.target.checked;
      saveCleanupSettings(cleanupSettings);
      renderFiles();
    });
  });

  card.querySelectorAll('.col-newname').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const col = e.target.dataset.col;
      const cs = getColumnSettings(file.id, col, file._autoTypes[col]);
      cs.newName = e.target.value;
      e.target.classList.toggle('changed', e.target.value !== col);
      saveCleanupSettings(cleanupSettings);
    });
  });

  card.querySelectorAll('.col-type').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const col = e.target.dataset.col;
      const cs = getColumnSettings(file.id, col, file._autoTypes[col]);
      cs.type = e.target.value;
      saveCleanupSettings(cleanupSettings);
      renderFiles();
    });
  });

  card.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      fs[e.target.dataset.field] = e.target.value;
      saveCleanupSettings(cleanupSettings);
      renderFiles();
    });
  });

  const nullRepl = card.querySelector('.null-replace-value');
  if (nullRepl) nullRepl.addEventListener('input', (e) => { 
    fs.nullReplaceValue = e.target.value; 
    saveCleanupSettings(cleanupSettings); 
  });

  const dupKey = card.querySelector('.dup-key');
  if (dupKey) dupKey.addEventListener('change', (e) => { 
    fs.dupKey = e.target.value; 
    saveCleanupSettings(cleanupSettings); 
  });

  const dupKeep = card.querySelector('.dup-keep');
  if (dupKeep) dupKeep.addEventListener('change', (e) => { 
    fs.dupKeep = e.target.value; 
    saveCleanupSettings(cleanupSettings); 
  });

  const addBtn = card.querySelector('.add-filter-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    if (!fs.filters) fs.filters = [];
    fs.filters.push({ column: '', op: 'eq', value: '' });
    saveCleanupSettings(cleanupSettings);
    renderFiles();
  });

  card.querySelectorAll('.filter-col, .filter-op, .filter-value').forEach(el => {
    el.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      if (!fs.filters[idx]) return;
      if (e.target.classList.contains('filter-col')) fs.filters[idx].column = e.target.value;
      else if (e.target.classList.contains('filter-op')) {
        fs.filters[idx].op = e.target.value;
        saveCleanupSettings(cleanupSettings);
        renderFiles();
        return;
      } else if (e.target.classList.contains('filter-value')) fs.filters[idx].value = e.target.value;
      saveCleanupSettings(cleanupSettings);
    });
  });

  card.querySelectorAll('.filter-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      fs.filters.splice(parseInt(e.target.dataset.idx), 1);
      saveCleanupSettings(cleanupSettings);
      renderFiles();
    });
  });

  const applyBtn = card.querySelector('.apply-btn');
  if (applyBtn) applyBtn.addEventListener('click', () => applyAndSave(file));

  const resetBtn = card.querySelector('.reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (!confirm('Сбросить все настройки очистки для этого файла?')) return;
    delete cleanupSettings[file.id];
    saveCleanupSettings(cleanupSettings);
    renderFiles();
  });

  // === ЭКСПОРТ ПАТТЕРНА ===
  const exportBtn = card.querySelector('.export-recipe-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = JSON.stringify(getFileSettings(file.id), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'cleanup_pattern_' + file.name.replace(/\.[^.]+$/, '') + '.json';
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  // === ИМПОРТ ПАТТЕРНА ===
  const importInput = card.querySelector('.import-recipe-input');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          // Применяем настройки к текущему файлу
          cleanupSettings[file.id] = parsed;
          saveCleanupSettings(cleanupSettings);
          renderFiles(); 
        } catch (err) {
          alert('Ошибка: не удалось прочитать паттерн очистки. Проверьте, что это JSON-файл.');
        }
      };
      reader.readAsText(f);
      importInput.value = '';
    });
  }
}

function applyAndSave(file) {
  const result = applyCleanup(file);
  const cleanName = file.name.replace(/\.[^.]+$/, '') + ' (cleaned)';
  const newFile = {
    id: generateId(), name: cleanName, rows: result.rows, columns: result.columns,
    key: result.columns[0] || '', joinType: 'inner', selected: false, isResult: true, saved: false,
  };
  state.files.push(newFile);
  scheduleSave();
  updateNavStorageStatus();
  showResult(newFile, file, result);
}

function showResult(newFile, sourceFile, result) {
  const old = document.getElementById('resultSection');
  if (old) old.remove();

  const container = document.getElementById('filesContainer');
  const resultDiv = document.createElement('div');
  resultDiv.id = 'resultSection';

  const beforeRows = sourceFile.rows.length;
  const afterRows = result.rows.length;
  const diff = afterRows - beforeRows;
  const preview = result.rows.slice(0, 10);
  const cols = result.columns;

  let tableHtml = '<table class="preview-table"><thead><tr>';
  cols.forEach(c => { tableHtml += '<th>' + escapeHtml(c) + '</th>'; });
  tableHtml += '</tr></thead><tbody>';
  preview.forEach(row => {
    const hasNull = cols.some(c => row[c] === NULL_MARKER);
    tableHtml += '<tr class="' + (hasNull ? 'row-has-null' : '') + '">';
    cols.forEach(c => {
      const v = row[c];
      if (v === NULL_MARKER) tableHtml += '<td class="null-cell">NULL</td>';
      else {
        const s = String(v);
        tableHtml += '<td title="' + escapeHtml(s) + '">' + escapeHtml(s.length > 30 ? s.slice(0, 30) + '…' : s) + '</td>';
      }
    });
    tableHtml += '</tr>';
  });
  tableHtml += '</tbody></table>';

  resultDiv.innerHTML = '<div class="cleanup-card">' +
    '<div class="result-banner">' +
      '<span>✅ <strong>Очистка применена:</strong> файл «' + escapeHtml(newFile.name) + '» добавлен в список</span>' +
      '<button class="btn btn-sm" onclick="downloadCleanResult(\'' + newFile.id + '\', \'csv\')" type="button">⬇ CSV</button>' +
      '<button class="btn btn-success btn-sm" onclick="downloadCleanResult(\'' + newFile.id + '\', \'xlsx\')" type="button">⬇ Excel</button>' +
    '</div>' +
    '<div class="cleanup-card-title">📄 ' + escapeHtml(newFile.name) + '</div>' +
    '<div class="mini-stats"><span>Было строк: <b>' + beforeRows.toLocaleString('ru-RU') + '</b></span>' +
      '<span>Стало строк: <b>' + afterRows.toLocaleString('ru-RU') + '</b></span>' +
      '<span>Разница: <b style="color:' + (diff >= 0 ? '#166534' : '#b91c1c') + ';">' + (diff >= 0 ? '+' : '') + diff + '</b></span>' +
      '<span>Колонок: <b>' + cols.length + '</b></span></div>' +
    '<div class="preview-note">Предпросмотр первых ' + preview.length + ' строк:</div>' +
    '<div class="preview-table-wrap">' + tableHtml + '</div></div>';

  container.insertBefore(resultDiv, container.firstChild);
  resultDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.downloadCleanResult = function(fileId, format) {
  const f = state.files.find(x => x.id === fileId);
  if (!f) return;
  const rowsForExport = f.rows.map(row => {
    const out = {};
    Object.keys(row).forEach(k => { out[k] = row[k] === NULL_MARKER ? 'NULL' : row[k]; });
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(rowsForExport, { defval: 'NULL' });
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = f.name + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned');
    XLSX.writeFile(wb, f.name + '.xlsx');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  restoreIntoState(state);
  renderFiles();
});
