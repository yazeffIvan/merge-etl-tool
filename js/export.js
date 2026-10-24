function rowsForExport() {
  return state.lastResultRows.map(row => {
    const out = {};
    Object.keys(row).forEach(k => {
      out[k] = isNullVal(row[k]) ? NULL_MARKER : row[k];
    });
    return out;
  });
}

function downloadCsv() {
  if (state.lastResultRows.length === 0) { alert('Нет данных'); return; }
  const ws = XLSX.utils.json_to_sheet(rowsForExport(), { defval: NULL_MARKER });
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'merged_result.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadXlsx() {
  if (state.lastResultRows.length === 0) { alert('Нет данных'); return; }
  const ws = XLSX.utils.json_to_sheet(rowsForExport(), { defval: NULL_MARKER });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Result');
  XLSX.writeFile(wb, 'merged_result.xlsx');
}

function copyStats() {
  const a = state.lastAnalysis;
  if (!a) { alert('Сначала выполните соединение'); return; }
  const totalRows = a.totalRows;
  const totalCols = a.totalCols;
  const nullByCol = a.nullByCol;
  const fullDuplicates = a.fullDuplicates;
  const mergeSteps = a.mergeSteps;
  const columns = Object.keys(nullByCol);
  const colsWithNull = columns.filter(c => nullByCol[c] > 0);

  let text = '';
  text += '=== СТАТИСТИКА MERGE ===\n';
  text += 'Всего строк: ' + totalRows + '\nВсего колонок: ' + totalCols + '\nПолных дубликатов: ' + fullDuplicates + '\n\n';
  text += '--- По шагам ---\n';
  mergeSteps.forEach((s, idx) => {
    if (idx === 0) {
      text += 'Шаг 0 (базовая): "' + s.fromFile + '" — ' + s.rowsBefore + ' строк, ключ: ' + s.key + '\n';
    } else {
      text += 'Шаг ' + idx + ' (' + s.joinType + '): + "' + s.fromFile + '" — было ' + s.rowsBefore + ', стало ' + s.rowsAfter + '\n';
      text += '  Левых нашли пару: ' + s.leftMatched + '\n';
      text += '  Левых не нашли: ' + s.leftUnmatched + '\n';
      text += '  Правых: ' + s.rightTotal + ', использовано: ' + s.rightUsed + '\n';
      text += '  Макс. размножение: ×' + (s.maxMultiplier || 1) + '\n';
    }
  });
  text += '\n--- NULL по колонкам ---\n';
  if (colsWithNull.length === 0) text += '(нет NULL)\n';
  else colsWithNull.slice().sort((a, b) => nullByCol[b] - nullByCol[a]).forEach(c => {
    const pct = ((nullByCol[c] / totalRows) * 100).toFixed(1);
    text += c + ': ' + nullByCol[c] + ' (' + pct + '%)\n';
  });

  navigator.clipboard.writeText(text).then(() => {
    dom.copyStatsBtn.textContent = '✓ Скопировано!';
    dom.copyStatsBtn.classList.add('copied');
    setTimeout(() => {
      dom.copyStatsBtn.textContent = '📋 Скопировать статистику';
      dom.copyStatsBtn.classList.remove('copied');
    }, 1800);
  }).catch(err => alert('Не удалось скопировать: ' + err.message));
}
