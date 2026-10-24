// Горячие клавиши приложения
// Важно: не срабатывают, когда фокус в input/textarea/select/contenteditable

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

// Показывает модалку со списком горячих клавиш
function showHotkeysHelp() {
  const existing = document.getElementById('hotkeysModal');
  if (existing) { existing.remove(); return; }

  const isMacOS = isMac();
  const mod = isMacOS ? '⌘' : 'Ctrl';

  const rows = [
    [mod + ' + Enter', 'Соединить выбранные'],
    [mod + ' + S', 'Скачать CSV'],
    [mod + ' + Shift + S', 'Скачать Excel'],
    [mod + ' + Shift + C', 'Скопировать статистику'],
    [mod + ' + K', 'Очистить всё'],
    ['?', 'Показать эту справку'],
    ['Esc', 'Закрыть справку'],
  ];

  const modal = document.createElement('div');
  modal.id = 'hotkeysModal';
  modal.className = 'hotkeys-modal';
  modal.innerHTML =
    '<div class="hotkeys-backdrop"></div>' +
    '<div class="hotkeys-dialog">' +
      '<div class="hotkeys-header">' +
        '<strong>⌨️ Горячие клавиши</strong>' +
        '<button class="hotkeys-close" type="button" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '<table class="hotkeys-table">' +
        rows.map(r =>
          '<tr>' +
            '<td><kbd>' + r[0] + '</kbd></td>' +
            '<td>' + r[1] + '</td>' +
          '</tr>'
        ).join('') +
      '</table>' +
      '<div class="hotkeys-hint">Работают везде, кроме полей ввода.</div>' +
    '</div>';

  document.body.appendChild(modal);

  // Закрытие
  const close = () => modal.remove();
  modal.querySelector('.hotkeys-close').addEventListener('click', close);
  modal.querySelector('.hotkeys-backdrop').addEventListener('click', close);
}

function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    // Если фокус в поле ввода — игнорируем всё, кроме Esc (закрытие модалки)
    const inEditable = isEditableTarget(document.activeElement);

    // Esc закрывает модалку справки, если открыта
    if (e.key === 'Escape') {
      const modal = document.getElementById('hotkeysModal');
      if (modal) { modal.remove(); e.preventDefault(); }
      return;
    }

    // "?" — открыть справку (но не в полях ввода)
    if (!inEditable && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
      e.preventDefault();
      showHotkeysHelp();
      return;
    }

    // Cmd (mac) или Ctrl (win/linux)
    const isMod = isMac() ? e.metaKey : e.ctrlKey;
    if (!isMod) return;

    // Если в поле ввода — не перехватываем Cmd+S и т.п.
    if (inEditable) return;

    const key = e.key.toLowerCase();

    // Cmd + Enter — Соединить
    if (key === 'enter' && !e.shiftKey && !e.altKey) {
      if (!dom.mergeBtn.disabled) {
        e.preventDefault();
        performMerge();
      }
      return;
    }

    // Cmd + K — Очистить
    if (key === 'k' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (state.files.length === 0 && !state.lastAnalysis) return;
      if (confirm('Очистить все загруженные таблицы и результат?')) {
        dom.clearAllBtn.click();
      }
      return;
    }

    // Cmd + S — CSV, Cmd + Shift + S — Excel
    if (key === 's') {
      if (state.lastResultRows.length === 0) return;
      e.preventDefault();
      if (e.shiftKey) {
        downloadXlsx();
      } else {
        downloadCsv();
      }
      return;
    }

    // Cmd + Shift + C — Скопировать статистику
    if (key === 'c' && e.shiftKey) {
      if (!state.lastAnalysis) return;
      e.preventDefault();
      copyStats();
      return;
    }
  });
}
