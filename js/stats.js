function analyzeResult(rows, columns, mergeSteps) {
  const totalRows = rows.length;
  const totalCols = columns.length;

  const nullByCol = {};
  columns.forEach(c => { nullByCol[c] = 0; });
  rows.forEach(row => {
    columns.forEach(c => {
      if (isNullVal(row[c])) nullByCol[c]++;
    });
  });

  const seen = new Set();
  let fullDuplicates = 0;
  rows.forEach(row => {
    const key = columns.map(c => String(row[c] ?? '')).join('\u0001');
    if (seen.has(key)) fullDuplicates++;
    else seen.add(key);
  });

  return { totalRows, totalCols, nullByCol, fullDuplicates, mergeSteps };
}
