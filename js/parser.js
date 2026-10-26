function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', raw: true, codepage: 65001 });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        let rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });

        if (rows.length === 0) {
          const arr = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
          if (arr.length > 0 && arr[0].length > 0) {
            const headers = arr[0].map(h => String(h).trim());
            rows = arr.slice(1).map(row => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
              return obj;
            });
          }
        }

        rows = rows.map(row => {
          const newRow = {};
          Object.keys(row).forEach(k => {
            const v = row[k];
            newRow[k] = (v === undefined || v === null || v === '') ? NULL_MARKER : String(v);
          });
          return newRow;
        });

        const colSet = new Set();
        rows.forEach(row => Object.keys(row).forEach(k => colSet.add(k)));
        resolve({ rows, columns: Array.from(colSet) });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function handleFiles(fileList, onDone) {
  const newFiles = Array.from(fileList);
  if (newFiles.length === 0) return;

  for (const file of newFiles) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      alert(`Файл "${file.name}" не поддерживается.`);
      continue;
    }
    try {
      const { rows, columns } = await parseFile(file);
      if (columns.length === 0) {
        alert(`Не удалось прочитать колонки из "${file.name}".`);
        continue;
      }
      const newFile = {
        id: generateId(),
        name: file.name,
        rows,
        columns,
        key: columns[0] || '',
        joinType: 'inner',
        selected: true,
        isResult: false,
        saved: false,
      };
      state.files.push(newFile);
      if (state.baseFileId === null) state.baseFileId = newFile.id;
    } catch (err) {
      console.error(err);
      alert(`Ошибка чтения "${file.name}": ${err.message}`);
    }
  }

  // Универсальные вызовы — безопасные на любой странице
  if (typeof scheduleSave === 'function') scheduleSave();
  if (typeof updateNavStorageStatus === 'function') updateNavStorageStatus();

  // А это — специфично для страницы. Передаётся снаружи.
  if (typeof onDone === 'function') onDone();
}
