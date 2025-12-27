const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const stopBtn = document.getElementById('stop');
const refreshBtn = document.getElementById('refresh');
const exportBtn = document.getElementById('export');
const exportJsonBtn = document.getElementById('export-json');
const clearBtn = document.getElementById('clear');
const openLogsBtn = document.getElementById('open-logs');
const editProfileBtn = document.getElementById('edit-profile');
const actionsToggle = document.getElementById('actions-toggle');
const actionsMenu = document.getElementById('actions-menu');
const profilePanel = document.getElementById('profile-panel');
const profileEmailInput = document.getElementById('profile-email');
const profilePasswordInput = document.getElementById('profile-password');
const saveProfilePopupBtn = document.getElementById('save-profile-popup');
const statusSection = document.getElementById('status-section');
const logsSection = document.getElementById('logs-section');
const todayTasksSection = document.getElementById('today-tasks-section');
const todayTasksList = document.getElementById('today-tasks');
const importSection = document.getElementById('import-section');
const importMoreBtn = document.getElementById('import-more');
const importLessBtn = document.getElementById('import-less');
const importForm = document.getElementById('import-form');
const importFileInput = document.getElementById('import-file');
const importFeedback = document.getElementById('import-feedback');

let currentTask = null;
let cachedProfile = { userEmail: '', userPassword: '' };

const REQUIRED_COLUMNS = {
  id: 'ID',
  title: 'Título',
  projectName: 'Projeto',
  captureType: 'Origem',
  startedAt: 'Início',
  endedAt: 'Fim',
  durationSeconds: 'Duração (s)',
  url: 'URL',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  return fmtDate(iso);
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setImportFeedback(message, isError = false) {
  if (!importFeedback) return;
  importFeedback.textContent = message || '';
  importFeedback.classList.toggle('error', isError);
}

function setMenuDisabled(disabled) {
  [refreshBtn, exportBtn, exportJsonBtn, clearBtn, openLogsBtn].forEach((btn) => {
    if (!btn) return;
    if (disabled) btn.setAttribute('disabled', ''); else btn.removeAttribute('disabled');
    btn.classList.toggle('disabled', !!disabled);
  });
}

function applyProfileGate(profile) {
  const hasProfile = !!(profile?.userEmail && profile?.userPassword);
  if (hasProfile) {
    profilePanel?.classList.add('hidden');
    statusSection?.classList.remove('hidden');
    logsSection?.classList.remove('hidden');
    todayTasksSection?.classList.remove('hidden');
    importSection?.classList.remove('hidden');
    setMenuDisabled(false);
    editProfileBtn?.classList.remove('hidden');
  } else {
    profilePanel?.classList.remove('hidden');
    statusSection?.classList.add('hidden');
    logsSection?.classList.add('hidden');
    todayTasksSection?.classList.add('hidden');
    importSection?.classList.add('hidden');
    setMenuDisabled(true);
    editProfileBtn?.classList.add('hidden');
  }
}

function renderLogs(logs) {
  logsEl.innerHTML = '';
  if (!logs.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Nenhum registro disponível.';
    logsEl.appendChild(li);
    return;
  }

  const items = [];
  const [maybeCurrent, ...rest] = logs;
  if (maybeCurrent && !maybeCurrent.endedAt) {
    items.push(maybeCurrent);
    const remaining = 3 - items.length;
    if (remaining > 0) items.push(...rest.slice(-remaining).reverse());
  } else {
    items.push(...logs.slice(-3).reverse());
  }

  items.forEach((log) => {
    const li = document.createElement('li');
    li.className = 'logs-item';
    const wrapper = document.createElement('div');
    wrapper.className = 'logs-item-content';
    const textContainer = document.createElement('div');
    textContainer.className = 'logs-item-text';
    const strong = document.createElement('strong');
    const accessibleTitle = log.title || `registro #${log.id}`;
    const title = truncate(accessibleTitle, 30);
    strong.textContent = `#${log.id} — ${title}`;
    const span = document.createElement('span');
    span.className = 'muted';
    const endLabel = log.endedAt ? fmtDateTime(log.endedAt) : 'Em andamento';
    span.textContent = `${fmtDateTime(log.startedAt)} - ${endLabel}`;
    textContainer.appendChild(strong);
    textContainer.appendChild(span);
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'logs-item-action';
    actionButton.innerHTML = '<span aria-hidden="true">↻</span>';
    actionButton.setAttribute('aria-label', `Iniciar nova contagem para ${accessibleTitle}`);
    actionButton.title = 'Iniciar nova contagem';
    actionButton.disabled = !log.endedAt;
    actionButton.addEventListener('click', (ev) => { ev.stopPropagation(); startLogAgain(log); });
    wrapper.appendChild(textContainer);
    wrapper.appendChild(actionButton);
    li.appendChild(wrapper);
    logsEl.appendChild(li);
  });
}

function setTodayTasksFeedback(message, isError = false) {
  if (!todayTasksList) return;
  todayTasksList.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'empty-state';
  if (isError) li.classList.add('error');
  li.textContent = message;
  todayTasksList.appendChild(li);
}

function renderTodayTasks(tasks) {
  if (!todayTasksList) return;
  todayTasksList.innerHTML = '';

  if (!Array.isArray(tasks) || !tasks.length) {
    setTodayTasksFeedback('Nenhuma tarefa pendente para hoje.');
    return;
  }

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'logs-item';

    const wrapper = document.createElement('div');
    wrapper.className = 'logs-item-content';

    const textContainer = document.createElement('div');
    textContainer.className = 'logs-item-text';

    const strong = document.createElement('strong');
    const title = truncate(task.title || '', 50);
    const project = truncate(task.projectName || 'Sem projeto', 30);
    strong.textContent = `${project} - ${title}`;

    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = task.id ? `#${task.id}` : 'Sem identificador';

    textContainer.appendChild(strong);
    textContainer.appendChild(span);

    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = 'logs-item-action';
    actionButton.innerHTML = '<span aria-hidden="true">▶</span>';
    const accessibleTitle = task.title || task.id || 'tarefa';
    actionButton.setAttribute('aria-label', `Iniciar contagem para ${accessibleTitle}`);
    actionButton.title = 'Iniciar contagem';
    actionButton.addEventListener('click', (ev) => { ev.stopPropagation(); startPendingTask(task); });

    wrapper.appendChild(textContainer);
    wrapper.appendChild(actionButton);
    li.appendChild(wrapper);
    todayTasksList.appendChild(li);
  });
}

function startLogAgain(log) {
  if (!log || !log.endedAt) return;
  const payload = { id: log.id, title: log.title, url: log.url, projectName: log.projectName, captureType: log.captureType };
  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: payload }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao iniciar nova contagem.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    if (res.action === 'started') { showStatus(`Iniciado: #${res.started?.id} - ${res.started?.title}`); stopBtn.classList.remove('hidden'); refresh(); }
    else if (res.action === 'stopped') { showStatus(`Encerrado: #${res.stopped?.id} - ${res.stopped?.title}`); stopBtn.classList.add('hidden'); refresh(); }
  });
}

function startPendingTask(task) {
  if (!task) return;
  const payload = {
    id: task.id,
    title: task.title,
    url: task.url,
    projectName: task.projectName,
    captureType: task.captureType || 'hey-gestor-task',
  };
  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: payload }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao iniciar tarefa.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    if (res.action === 'started') {
      showStatus(`Iniciado: #${res.started?.id} - ${res.started?.title}`);
      stopBtn.classList.remove('hidden');
      refresh();
    }
  });
}

function handleError(defaultMessage) {
  const err = chrome.runtime.lastError;
  const message = err ? err.message : defaultMessage;
  showStatus(`Erro: ${message || 'desconhecido'}`, true);
}

function toggleImportForm(show) {
  if (!importForm || !importMoreBtn || !importLessBtn) return;
  importForm.classList.toggle('hidden', !show);
  importMoreBtn.classList.toggle('hidden', show);
  importLessBtn.classList.toggle('hidden', !show);
  if (!show && importFileInput) {
    importFileInput.value = '';
    setImportFeedback('');
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

function columnIndexFromRef(ref) {
  const match = /^([A-Z]+)/i.exec(ref || '');
  if (!match) return null;
  const letters = match[1].toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function getCellText(cell) {
  const v = cell.querySelector('v');
  if (v) return (v.textContent || '').trim();
  const t = cell.querySelector('is > t');
  return t ? (t.textContent || '').trim() : '';
}

function parseZipEntries(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const nameLen = view.getUint16(offset + 26, true);
    const dataLen = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen;
    if (dataStart + dataLen > bytes.length) break;
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    entries[name] = bytes.subarray(dataStart, dataStart + dataLen);
    offset = dataStart + dataLen;
  }
  return entries;
}

function extractRowsFromSheet(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const rowNodes = Array.from(doc.getElementsByTagName('row'));
  if (!rowNodes.length) throw new Error('Arquivo sem linhas para importar.');

  const headerRow = rowNodes.find((row) => row.getAttribute('r') === '2') || rowNodes[0];
  const dataRows = rowNodes.filter((row) => row !== headerRow);

  function readRow(rowEl) {
    const cells = Array.from(rowEl.getElementsByTagName('c'));
    const values = new Map();
    cells.forEach((cell, idx) => {
      const ref = cell.getAttribute('r');
      const colIdx = ref ? columnIndexFromRef(ref) : idx;
      if (colIdx === null) return;
      values.set(colIdx, getCellText(cell));
    });
    return values;
  }

  const headerValues = readRow(headerRow);
  const columnIndexes = {};
  Object.entries(REQUIRED_COLUMNS).forEach(([key, title]) => {
    for (const [colIdx, val] of headerValues.entries()) {
      if ((val || '').trim() === title) {
        columnIndexes[key] = colIdx;
        break;
      }
    }
  });

  const missingColumns = Object.entries(REQUIRED_COLUMNS)
    .filter(([key]) => typeof columnIndexes[key] !== 'number')
    .map(([, title]) => title);
  if (missingColumns.length) {
    throw new Error(`Colunas obrigatórias ausentes: ${missingColumns.join(', ')}.`);
  }

  const rows = dataRows.map((row) => readRow(row)).map((values) => {
    const result = {};
    Object.entries(columnIndexes).forEach(([key, idx]) => {
      result[key] = values.get(idx) || '';
    });
    return result;
  });

  return rows.filter((row) => Object.values(row).some((val) => String(val || '').trim()));
}

function validateDateRange(row) {
  const started = new Date(row.startedAt);
  const ended = new Date(row.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    throw new Error(`Datas inválidas para o registro "${row.title || row.id || 'sem título'}".`);
  }
  if (started >= ended) {
    throw new Error(`Período inválido para o registro "${row.title || row.id || 'sem título'}".`);
  }
  return { started, ended };
}

function intervalsOverlap(a, b) {
  return a.started < b.ended && b.started < a.ended;
}

function hasInternalOverlap(records) {
  const sorted = [...records].sort((a, b) => a.started - b.started);
  for (let i = 1; i < sorted.length; i += 1) {
    if (intervalsOverlap(sorted[i - 1], sorted[i])) {
      return true;
    }
  }
  return false;
}

function findOverlapWithExisting(imported, existing) {
  for (const imp of imported) {
    for (const ex of existing) {
      if (intervalsOverlap(imp, ex)) {
        return { imported: imp, existing: ex };
      }
    }
  }
  return null;
}

function sanitizeImportedRows(rawRows) {
  return rawRows.map((row) => ({
    id: String(row.id || '').trim(),
    title: String(row.title || '').trim(),
    projectName: String(row.projectName || '').trim(),
    captureType: String(row.captureType || '').trim(),
    startedAt: String(row.startedAt || '').trim(),
    endedAt: String(row.endedAt || '').trim(),
    durationSeconds: Number.parseInt(row.durationSeconds, 10),
    url: String(row.url || '').trim(),
  }));
}

async function handleImportSubmit(event) {
  event.preventDefault();
  setImportFeedback('');

  if (!importFileInput || !importFileInput.files?.length) {
    setImportFeedback('Selecione um arquivo para importar.', true);
    return;
  }

  const file = importFileInput.files[0];
  setImportFeedback('Lendo arquivo...');

  try {
    let importedRows = [];
    const lowerName = (file.name || '').toLowerCase();
    const isJson = lowerName.endsWith('.json') || file.type === 'application/json';

    if (isJson) {
      const text = await readFileAsText(file);
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('JSON invalido.');
      }
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.rows) ? parsed.rows : null);
      if (!rows) throw new Error('Arquivo JSON sem campo "rows".');
      importedRows = sanitizeImportedRows(rows);
    } else {
      const buffer = await readFileAsArrayBuffer(file);
      const entries = parseZipEntries(buffer);
      const sheetBytes = entries['xl/worksheets/sheet1.xml'];
      if (!sheetBytes) throw new Error('Arquivo invalido ou corrompido.');
      const sheetText = new TextDecoder().decode(sheetBytes);
      const rawRows = extractRowsFromSheet(sheetText);
      importedRows = sanitizeImportedRows(rawRows);
    }
    if (!importedRows.length) {
      throw new Error('Nenhuma linha encontrada para importar.');
    }

    const intervals = importedRows.map((row) => ({ ...row, ...validateDateRange(row) }));
    if (hasInternalOverlap(intervals)) {
      throw new Error('Há conflitos de horário entre os registros importados.');
    }

    chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
      if (!res?.ok) { setImportFeedback('Falha ao validar registros existentes.', true); return; }
      const existing = [];
      const logs = Array.isArray(res.logs) ? res.logs : [];
      logs.forEach((log) => {
        const started = new Date(log.startedAt);
        const ended = new Date(log.endedAt || log.startedAt);
        if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) return;
        existing.push({ ...log, started, ended });
      });
      if (res.currentTask) {
        const started = new Date(res.currentTask.startedAt);
        const ended = new Date(res.currentTask.endedAt || new Date());
        if (!Number.isNaN(started.getTime()) && !Number.isNaN(ended.getTime())) {
          existing.push({ ...res.currentTask, started, ended });
        }
      }

      const overlap = findOverlapWithExisting(intervals, existing);
      if (overlap) {
        const label = overlap.existing.title || overlap.existing.id || 'registro existente';
        setImportFeedback(`Conflito com ${label}. Ajuste os horários e tente novamente.`, true);
        return;
      }

      setImportFeedback('Importando registros...');
      chrome.runtime.sendMessage({ type: 'importLogs', rows: importedRows }, (importRes) => {
        if (chrome.runtime.lastError) { setImportFeedback('Falha ao importar registros.', true); return; }
        if (!importRes?.ok) { setImportFeedback(importRes?.error || 'Importação não realizada.', true); return; }
        setImportFeedback(`Importação concluída (${importRes.count} registros).`);
        toggleImportForm(false);
        refresh();
      });
    });
  } catch (err) {
    setImportFeedback(err?.message || 'Falha ao importar arquivo.', true);
  }
}

function normalizeExportRow(row) {
  return {
    id: row.id ?? '',
    title: row.title ?? '',
    projectName: row.projectName ?? '',
    captureType: row.captureType ?? '',
    startedAt: row.startedAt ?? '',
    endedAt: row.endedAt ?? '',
    durationSeconds: typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds) ? row.durationSeconds : '',
    url: row.url ?? '',
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function loadTodayTasks() {
  if (!todayTasksList) return;
  setTodayTasksFeedback('Carregando tarefas...');
  chrome.runtime.sendMessage({ type: 'getPendingTasksToday' }, (res) => {
    if (chrome.runtime.lastError) { setTodayTasksFeedback('Falha ao carregar tarefas.', true); return; }
    if (!res?.ok) { setTodayTasksFeedback(res?.error || 'Erro ao carregar tarefas.', true); return; }
    renderTodayTasks(Array.isArray(res.rows) ? res.rows : []);
  });
}

function refresh() {
  // Gate first
  chrome.storage.local.get(['userEmail','userPassword'], (vals) => {
    cachedProfile = { userEmail: (vals.userEmail||'').trim(), userPassword: (vals.userPassword||'').trim() };
    applyProfileGate(cachedProfile);
    if (!cachedProfile.userEmail || !cachedProfile.userPassword) {
      showStatus('Informe email e senha para começar.');
      return;
    }

    showStatus('Carregando...');
    chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
      if (chrome.runtime.lastError) { handleError('Falha ao obter status.'); return; }
      if (!res?.ok) { showStatus('Erro ao carregar status.', true); return; }
      const logs = Array.isArray(res.logs) ? res.logs : [];
      currentTask = res.currentTask || null;
      if (currentTask && !currentTask.endedAt) {
        showStatus(`Em andamento: #${currentTask.id} — ${currentTask.title} (desde ${fmtDate(currentTask.startedAt)})`);
        stopBtn.classList.remove('hidden');
      } else {
        showStatus('Nenhuma tarefa em andamento.');
        stopBtn.classList.add('hidden');
      }
      const displayLogs = [...logs];
      if (currentTask && !currentTask.endedAt) displayLogs.unshift(currentTask);
      renderLogs(displayLogs);
      loadTodayTasks();
    });
  });
}

function openActionsMenu() { actionsMenu.classList.remove('hidden'); actionsToggle.setAttribute('aria-expanded', 'true'); actionsMenu.setAttribute('aria-hidden', 'false'); }
function closeActionsMenu() { actionsMenu.classList.add('hidden'); actionsToggle.setAttribute('aria-expanded', 'false'); actionsMenu.setAttribute('aria-hidden', 'true'); }

actionsToggle.addEventListener('click', (e) => { e.stopPropagation(); if (actionsMenu.classList.contains('hidden')) openActionsMenu(); else closeActionsMenu(); });
document.addEventListener('click', (e) => { if (!actionsMenu.classList.contains('hidden') && !actionsMenu.contains(e.target) && e.target !== actionsToggle) closeActionsMenu(); });
actionsMenu.addEventListener('click', (e) => { if (e.target instanceof HTMLElement && e.target.classList.contains('menu-item')) closeActionsMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeActionsMenu(); });

if (importMoreBtn) importMoreBtn.addEventListener('click', () => toggleImportForm(true));
if (importLessBtn) importLessBtn.addEventListener('click', () => toggleImportForm(false));
if (importForm) importForm.addEventListener('submit', handleImportSubmit);

function stopCurrentTask() {
  if (!currentTask) return;
  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: currentTask }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao parar tarefa.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    if (res.action === 'stopped') { showStatus(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`); stopBtn.classList.add('hidden'); refresh(); }
  });
}

refreshBtn.addEventListener('click', refresh);
stopBtn.addEventListener('click', stopCurrentTask);

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'getExportData' }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao exportar XLSX.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    const exportedAt = res.exportedAt;
    const rows = Array.isArray(res.rows) ? res.rows.map(normalizeExportRow) : [];
    chrome.storage.local.get(['userEmail'], (vals) => {
      const meta = { userName: '', userEmail: vals.userEmail || '' };
      const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt, meta);
      const filename = 'azdo-time-tracker-' + ExcelExporter.formatExportFileDate(exportedAt) + '.xlsx';
      ExcelExporter.downloadXlsx(filename, workbookBytes);
    });
  });
});

if (exportJsonBtn) {
  exportJsonBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'getExportData' }, (res) => {
      if (chrome.runtime.lastError) { handleError('Falha ao exportar JSON.'); return; }
      if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
      const exportedAt = res.exportedAt;
      const rows = Array.isArray(res.rows) ? res.rows.map(normalizeExportRow) : [];
    chrome.storage.local.get(['userEmail'], (vals) => {
      const meta = { userName: '', userEmail: vals.userEmail || '' };
      const payload = { exportedAt, ...meta, rows };
      const filename = 'azdo-time-tracker-' + ExcelExporter.formatExportFileDate(exportedAt) + '.json';
      downloadJson(filename, payload);
    });
  });
  });
}

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clearLogs' }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao limpar logs.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    refresh();
  });
});

openLogsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL('options.html'));
});

// Save profile from popup gate
if (saveProfilePopupBtn) {
  saveProfilePopupBtn.addEventListener('click', () => {
    const email = (profileEmailInput?.value || '').trim();
    const password = (profilePasswordInput?.value || '').trim();
    if (!email || !password) { alert('Informe email e senha.'); return; }
    chrome.storage.local.set({ userEmail: email, userPassword: password }, () => {
      applyProfileGate({ userEmail: email, userPassword: password });
      showStatus('Perfil salvo.');
      refresh();
    });
  });
}

// Edit profile option in menu
if (editProfileBtn) {
  editProfileBtn.addEventListener('click', () => {
    chrome.storage.local.get(['userEmail','userPassword'], (vals) => {
      if (profileEmailInput) profileEmailInput.value = vals.userEmail || '';
      if (profilePasswordInput) profilePasswordInput.value = vals.userPassword || '';
      profilePanel?.classList.remove('hidden');
      statusSection?.classList.add('hidden');
      logsSection?.classList.add('hidden');
      setMenuDisabled(true);
    });
  });
}

refresh();


