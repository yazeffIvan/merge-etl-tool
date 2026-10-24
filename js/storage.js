// Общий слой хранения файлов между страницами
// Файлы и настройки живут в localStorage, доступны везде

const STORAGE_KEY = 'analyzer_state_v1';

// Сохраняем только то, что можно сериализовать в JSON.
// Функции, DOM-ссылки и т.п. — не сохраняются.
function serializeFiles(files) {
  return files.map(f => ({
    id: f.id,
    name: f.name,
    rows: f.rows,
    columns: f.columns,
    key: f.key,
    joinType: f.joinType,
    selected: f.selected,
    isResult: f.isResult,
    saved: f.saved,
  }));
}

function saveState() {
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      files: serializeFiles(state.files),
      baseFileId: state.baseFileId,
      resultCounter: state.resultCounter,
      lastResultFileId: state.lastResultFileId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Не удалось сохранить состояние:', err.message);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || payload.version !== 1) return null;
    return payload;
  } catch (err) {
    console.warn('Не удалось прочитать состояние:', err.message);
    return null;
  }
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Не удалось очистить состояние:', err.message);
  }
}

// Восстанавливает state.files и связанные поля из localStorage
function restoreIntoState(state) {
  const payload = loadState();
  if (!payload) return false;
  state.files = Array.isArray(payload.files) ? payload.files : [];
  state.baseFileId = payload.baseFileId || null;
  state.resultCounter = payload.resultCounter || 0;
  state.lastResultFileId = payload.lastResultFileId || null;
  state.lastResultRows = [];
  state.lastAnalysis = null;
  state.currentPage = 1;
  // Восстанавливаем lastResultRows, если есть результат
  if (state.lastResultFileId) {
    const rf = state.files.find(f => f.id === state.lastResultFileId);
    if (rf) state.lastResultRows = rf.rows;
  }
  return true;
}

// Автосохранение — вызывается при изменении файлов
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveState();
    saveTimer = null;
  }, 300);
}
