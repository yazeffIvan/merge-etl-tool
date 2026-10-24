const NULL_MARKER = 'NULL';

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, function (m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '"') return '&quot;';
    return m;
  });
}

function isNullVal(v) {
  return v === NULL_MARKER || v === undefined || v === null;
}

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

function formatPct(num, total) {
  if (total === 0) return '0%';
  return ((num / total) * 100).toFixed(1) + '%';
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
