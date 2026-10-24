// Общее верхнее меню для всех страниц

function renderNav() {
  const currentPage = document.body.getAttribute('data-page') || 'merge';

  const items = [
    { id: 'merge', href: 'index.html', label: '🔗 Merge' },
    { id: 'diagnostics', href: 'diagnostics.html', label: '🔍 Диагностика' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'app-nav';
  nav.innerHTML =
    '<div class="app-nav-inner">' +
      '<div class="app-nav-brand">' +
        '<span class="app-nav-logo">📊</span>' +
        '<span>Analyzer</span>' +
      '</div>' +
      '<div class="app-nav-links">' +
        items.map(it =>
          '<a href="' + it.href + '" class="app-nav-link ' + (it.id === currentPage ? 'active' : '') + '">' +
            it.label +
          '</a>'
        ).join('') +
      '</div>' +
      '<div class="app-nav-status" id="navStorageStatus" title="Состояние localStorage">' +
        '<span class="nav-storage-dot"></span>' +
        '<span class="nav-storage-text">…</span>' +
      '</div>' +
    '</div>';

  // Вставляем в начало body
  document.body.insertBefore(nav, document.body.firstChild);

  updateNavStorageStatus();
}

function updateNavStorageStatus() {
  const el = document.getElementById('navStorageStatus');
  if (!el) return;
  const textEl = el.querySelector('.nav-storage-text');
  const dotEl = el.querySelector('.nav-storage-dot');
  const payload = loadState();
  if (!payload || !payload.files || payload.files.length === 0) {
    textEl.textContent = 'нет данных';
    dotEl.style.background = '#cbd5e1';
    el.title = 'Файлы ещё не загружены';
    return;
  }
  const n = payload.files.length;
  const totalRows = payload.files.reduce((s, f) => s + (f.rows ? f.rows.length : 0), 0);
  textEl.textContent = n + ' ' + plural(n, 'файл', 'файла', 'файлов') + ' · ' + totalRows.toLocaleString('ru-RU') + ' строк';
  dotEl.style.background = '#22c55e';
  el.title = 'Данные хранятся в localStorage';
}
