// Логика Pivot-таблиц и графиков

let currentPivotData = [];
let currentPivotColumns = [];
let chartInstance = null; // Ссылка на график Chart.js

function populateSelects() {
  const fileSelect = document.getElementById('pivotFileSelect');
  const emptyCard = document.getElementById('emptyCard');
  const builderCard = document.getElementById('pivotBuilderCard');

  if (state.files.length === 0) {
    emptyCard.style.display = 'block';
    builderCard.hidden = true;
    return;
  }
  emptyCard.style.display = 'none';
  builderCard.hidden = false;

  // Заполняем список файлов
  fileSelect.innerHTML = state.files.map(f => 
    `<option value="${f.id}">${escapeHtml(f.name)} (${f.rows.length} строк)</option>`
  ).join('');

  updateColumnSelects();
}

function updateColumnSelects() {
  const fileId = document.getElementById('pivotFileSelect').value;
  const file = state.files.find(f => f.id === fileId);
  if (!file) return;

  const groupSelect = document.getElementById('pivotGroupBy');
  const groupSelect2 = document.getElementById('pivotGroupBy2');
  const metricSelect = document.getElementById('pivotMetricCol');

  const colOptions = file.columns.map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join('');
  
  groupSelect.innerHTML = colOptions;
  groupSelect2.innerHTML = '<option value="">— нет (только строки) —</option>' + colOptions;
  
  // Для метрики исключаем первую колонку (обычно это ID)
  const numericCols = file.columns.filter(c => c !== file.columns[0]);
  metricSelect.innerHTML = numericCols.map(c => `<option value="${c}">${escapeHtml(c)}</option>`).join('');
}

function buildPivot() {
  const fileId = document.getElementById('pivotFileSelect').value;
  const groupBy = document.getElementById('pivotGroupBy').value;
  const groupBy2 = document.getElementById('pivotGroupBy2').value;
  const metricCol = document.getElementById('pivotMetricCol').value;
  const aggType = document.getElementById('pivotAggType').value;

  const file = state.files.find(f => f.id === fileId);
  if (!file) return;

  const groups = new Map();
  const subGroupsSet = new Set(); // Для сбора уникальных колонок разбивки

  file.rows.forEach(row => {
    const key1 = row[groupBy];
    const key2 = groupBy2 ? row[groupBy2] : null;
    if (key2) subGroupsSet.add(key2);

    const valStr = row[metricCol];
    
    if (valStr === NULL_MARKER && aggType !== 'count') return;
    
    const val = aggType === 'count' ? 1 : parseFloat(valStr);
    const combinedKey = key1 + '\u0001' + (key2 || '');

    if (!groups.has(combinedKey)) {
      groups.set(combinedKey, { key1, key2, sum: 0, count: 0, min: Infinity, max: -Infinity });
    }
    const g = groups.get(combinedKey);

    if (aggType === 'count') {
      g.count++;
    } else if (!isNaN(val)) {
      g.sum += val;
      g.count++;
      if (val < g.min) g.min = val;
      if (val > g.max) g.max = val;
    }
  });

  // Формируем плоский массив данных
  currentPivotData = [];
  groups.forEach(g => {
    let resultVal = 0;
    if (aggType === 'sum') resultVal = g.sum;
    else if (aggType === 'avg') resultVal = g.count ? g.sum / g.count : 0;
    else if (aggType === 'count') resultVal = g.count;
    else if (aggType === 'min') resultVal = g.min === Infinity ? 0 : g.min;
    else if (aggType === 'max') resultVal = g.max === -Infinity ? 0 : g.max;

    const rowObj = {
      [groupBy]: g.key1 === NULL_MARKER ? 'NULL' : g.key1,
      [`${metricCol} (${aggType})`]: resultVal.toFixed(2)
    };
    if (groupBy2) {
      rowObj[groupBy2] = g.key2 === NULL_MARKER ? 'NULL' : g.key2;
    }
    currentPivotData.push(rowObj);
  });

  const metricName = `${metricCol} (${aggType})`;
  
  // Сортировка: сначала по первой колонке, потом по метрике (по убыванию)
  currentPivotData.sort((a, b) => {
    if (a[groupBy] !== b[groupBy]) {
      return String(a[groupBy]).localeCompare(String(b[groupBy]));
    }
    return parseFloat(b[metricName]) - parseFloat(a[metricName]);
  });

  currentPivotColumns = [groupBy];
  if (groupBy2) currentPivotColumns.push(groupBy2);
  currentPivotColumns.push(metricName);

  renderPivotTable();
}

function renderPivotTable() {
  const resultCard = document.getElementById('pivotResultCard');
  const tableWrap = document.getElementById('pivotTableWrap');
  const info = document.getElementById('pivotResultInfo');

  if (currentPivotData.length === 0) {
    resultCard.hidden = true;
    return;
  }

  resultCard.hidden = false;
  
  const metricName = currentPivotColumns[currentPivotColumns.length - 1];
  const totalSum = currentPivotData.reduce((acc, row) => acc + parseFloat(row[metricName]), 0);

  info.innerHTML = `
    <span>Уникальных строк: <b>${currentPivotData.length}</b></span>
    <span>Итого по метрике: <b>${totalSum.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</b></span>
  `;

  let html = '<table><thead><tr>';
  currentPivotColumns.forEach(c => { html += `<th>${escapeHtml(c)}</th>`; });
  html += '</tr></thead><tbody>';

  currentPivotData.forEach(row => {
    html += '<tr>';
    currentPivotColumns.forEach(c => {
      let val = row[c];
      if (c === metricName) {
        val = parseFloat(val).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
      }
      html += `<td>${escapeHtml(val)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';

  tableWrap.innerHTML = html;
  
  renderPivotChart(); 
}

function renderPivotChart() {
  const canvas = document.getElementById('pivotChartCanvas');
  if (!canvas || currentPivotData.length === 0) return;

  const groupBy = currentPivotColumns[0];
  const hasSubGroup = currentPivotColumns.length === 3;
  const groupBy2 = hasSubGroup ? currentPivotColumns[1] : null;
  const metricName = currentPivotColumns[currentPivotColumns.length - 1];

  // Собираем уникальные значения для оси X (первая колонка)
  const labels = [...new Set(currentPivotData.map(r => r[groupBy]))];
  
  let datasets = [];

  if (!hasSubGroup) {
    // Простой график (без разбивки)
    const data = labels.map(label => {
      const row = currentPivotData.find(r => r[groupBy] === label);
      return row ? parseFloat(row[metricName]) : 0;
    });
    
    datasets.push({
      label: metricName,
      data: data,
      backgroundColor: '#3b82f6',
      borderRadius: 6
    });
  } else {
    // Сложный график (с разбивкой)
    const subGroups = [...new Set(currentPivotData.map(r => r[groupBy2]))];
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'];

    subGroups.forEach((sub, idx) => {
      const data = labels.map(label => {
        const row = currentPivotData.find(r => r[groupBy] === label && r[groupBy2] === sub);
        return row ? parseFloat(row[metricName]) : 0;
      });
      
      datasets.push({
        label: sub === 'NULL' ? 'NULL' : sub,
        data: data,
        backgroundColor: colors[idx % colors.length],
        borderRadius: 4
      });
    });
  }

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          display: hasSubGroup, // Показываем легенду только если есть разбивка
          position: 'bottom'
        }
      },
      scales: {
        x: { stacked: false }, // Если хотите графики друг на друге, поменяйте на true
        y: { beginAtZero: true, grid: { color: '#e2e9f2' } }
      }
    }
  });
}

function downloadPivot(format) {
  if (currentPivotData.length === 0) return;
  const ws = XLSX.utils.json_to_sheet(currentPivotData);
  
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pivot_result.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
    XLSX.writeFile(wb, 'pivot_result.xlsx');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  restoreIntoState(state);
  populateSelects();

  document.getElementById('pivotFileSelect').addEventListener('change', updateColumnSelects);
  document.getElementById('buildPivotBtn').addEventListener('click', buildPivot);
  document.getElementById('downloadPivotCsvBtn').addEventListener('click', () => downloadPivot('csv'));
  document.getElementById('downloadPivotXlsxBtn').addEventListener('click', () => downloadPivot('xlsx'));
});