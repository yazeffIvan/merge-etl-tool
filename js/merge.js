function mergeRows(leftRows, rightRows, leftKey, rightKey, joinType) {
  const normalize = (v) => (isNullVal(v)) ? '' : String(v).trim();

  const rightMap = new Map();
  rightRows.forEach(row => {
    const key = normalize(row[rightKey]);
    if (!rightMap.has(key)) rightMap.set(key, []);
    rightMap.get(key).push(row);
  });

  const rightMatched = new Set();
  const result = [];

  const leftCols = leftRows.length > 0 ? Object.keys(leftRows[0]) : [];
  const rightCols = rightRows.length > 0 ? Object.keys(rightRows[0]) : [];
  const emptyLeft = {};
  leftCols.forEach(c => { emptyLeft[c] = NULL_MARKER; });
  const emptyRight = {};
  rightCols.forEach(c => { emptyRight[c] = NULL_MARKER; });

  let leftMatched = 0;
  let leftUnmatched = 0;
  let maxMultiplier = 0;

  leftRows.forEach(leftRow => {
    const key = normalize(leftRow[leftKey]);
    const matches = rightMap.get(key);

    if (matches && matches.length > 0) {
      leftMatched++;
      if (matches.length > maxMultiplier) maxMultiplier = matches.length;
      matches.forEach(rightRow => {
        rightMatched.add(rightRow);
        result.push(mergeTwoRows(leftRow, rightRow, leftCols, rightCols));
      });
    } else {
      leftUnmatched++;
      if (joinType === 'left' || joinType === 'outer') {
        result.push(mergeTwoRows(leftRow, emptyRight, leftCols, rightCols));
      }
    }
  });

  if (joinType === 'right' || joinType === 'outer') {
    rightRows.forEach(rightRow => {
      if (!rightMatched.has(rightRow)) {
        result.push(mergeTwoRows(emptyLeft, rightRow, leftCols, rightCols));
      }
    });
  }

  return {
    rows: result,
    stats: {
      leftMatched,
      leftUnmatched,
      rightUsed: rightMatched.size,
      rightTotal: rightRows.length,
      maxMultiplier,
      leftKey,
      rightKey,
      joinType,
    },
  };
}

function mergeTwoRows(leftRow, rightRow, leftCols, rightCols) {
  const out = {};
  leftCols.forEach(k => {
    out[k] = (leftRow && leftRow[k] !== undefined && leftRow[k] !== null && leftRow[k] !== '') ? leftRow[k] : NULL_MARKER;
  });
  rightCols.forEach(k => {
    const rightVal = (rightRow && rightRow[k] !== undefined && rightRow[k] !== null && rightRow[k] !== '') ? rightRow[k] : NULL_MARKER;
    if (out.hasOwnProperty(k)) {
      const leftKey = k + '_left';
      const rightKey = k + '_right';
      if (!out.hasOwnProperty(leftKey)) {
        out[leftKey] = out[k];
        delete out[k];
      } else {
        out[leftKey + '_' + Math.random().toString(36).substring(2, 5)] = out[k];
        delete out[k];
      }
      out[rightKey] = rightVal;
    } else {
      out[k] = rightVal;
    }
  });
  return out;
}
