const state = {
  files: [],
  resultCounter: 0,
  baseFileId: null,
  lastResultRows: [],
  lastResultFileId: null,
  lastAnalysis: null,
  currentPage: 1,
  pageSize: 100,
};

const dom = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  pickFilesBtn: document.getElementById('pickFilesBtn'),
  filesCard: document.getElementById('filesCard'),
  fileListEl: document.getElementById('fileList'),
  fileCountEl: document.getElementById('fileCount'),
  clearAllBtn: document.getElementById('clearAllBtn'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  deselectAllBtn: document.getElementById('deselectAllBtn'),
  mergeBtn: document.getElementById('mergeBtn'),
  mergeHint: document.getElementById('mergeHint'),
  reportCard: document.getElementById('reportCard'),
  reportList: document.getElementById('reportList'),
  warningsCard: document.getElementById('warningsCard'),
  warningList: document.getElementById('warningList'),
  sourcesCard: document.getElementById('sourcesCard'),
  sourcesList: document.getElementById('sourcesList'),
  resultCard: document.getElementById('resultCard'),
  resultRowsBadge: document.getElementById('resultRowsBadge'),
  resultTableWrap: document.getElementById('resultTableWrap'),
  downloadCsvBtn: document.getElementById('downloadCsvBtn'),
  downloadXlsxBtn: document.getElementById('downloadXlsxBtn'),
  saveResultBar: document.getElementById('saveResultBar'),
  materializeBtn: document.getElementById('materializeBtn'),
  statsBlock: document.getElementById('statsBlock'),
  paginationBar: document.getElementById('paginationBar'),
  pageSizeSelect: document.getElementById('pageSizeSelect'),
  pageInfo: document.getElementById('pageInfo'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  copyStatsBtn: document.getElementById('copyStatsBtn'),
};

function getEffectiveBaseId() {
  const explicit = state.files.find(f => f.id === state.baseFileId && f.selected);
  if (explicit) return explicit.id;
  const firstSelected = state.files.find(f => f.selected);
  return firstSelected ? firstSelected.id : null;
}
