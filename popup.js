const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const stopBtn = document.getElementById('stop');
const refreshBtn = document.getElementById('refresh');
const exportBtn = document.getElementById('export');
const clearBtn = document.getElementById('clear');
const openLogsBtn = document.getElementById('open-logs');
const editProfileBtn = document.getElementById('edit-profile');
const actionsToggle = document.getElementById('actions-toggle');
const actionsMenu = document.getElementById('actions-menu');
const profilePanel = document.getElementById('profile-panel');
const profileNameInput = document.getElementById('profile-name');
const profileEmailInput = document.getElementById('profile-email');
const saveProfilePopupBtn = document.getElementById('save-profile-popup');
const statusSection = document.getElementById('status-section');
const logsSection = document.getElementById('logs-section');
const importSection = document.getElementById('import-section');
const importMoreBtn = document.getElementById('import-more');
const importLessBtn = document.getElementById('import-less');
const importForm = document.getElementById('import-form');
const importFileInput = document.getElementById('import-file');
const importFeedback = document.getElementById('import-feedback');

let currentTask = null;
let cachedProfile = { userName: '', userEmail: '' };

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
  [refreshBtn, exportBtn, clearBtn, openLogsBtn].forEach((btn) => {
    if (!btn) return;
    if (disabled) btn.setAttribute('disabled', ''); else btn.removeAttribute('disabled');
    btn.classList.toggle('disabled', !!disabled);
  });
}

function applyProfileGate(profile) {
  const hasProfile = !!(profile?.userName && profile?.userEmail);
  if (hasProfile) {
    profilePanel?.classList.add('hidden');
    statusSection?.classList.remove('hidden');
    logsSection?.classList.remove('hidden');
    importSection?.classList.remove('hidden');
    setMenuDisabled(false);
    editProfileBtn?.classList.remove('hidden');
  } else {
    profilePanel?.classList.remove('hidden');
    statusSection?.classList.add('hidden');
    logsSection?.classList.add('hidden');
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

function startLogAgain(log) {
  if (!log || !log.endedAt) return;
  const payload = { id: log.id, title: log.title, url: log.url, projectName: log.projectName, captureType: log.captureType };
  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: payload }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao iniciar nova contagem.'); return; }
    if (!res?.ok) { showStatus(`Erro: ${res?.error || 'desconhecido'}`, true); return; }
    if (res.action === 'started') { showStatus(`Iniciado: #${res.started?.id} — ${res.started?.title}`); stopBtn.classList.remove('hidden'); refresh(); }
    else if (res.action === 'stopped') { showStatus(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`); stopBtn.classList.add('hidden'); refresh(); }
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

function parseSharedStrings(xmlText) {
  if (!xmlText) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const items = Array.from(doc.getElementsByTagName('si'));
  return items.map((si) => {
    const texts = Array.from(si.getElementsByTagName('t')).map((node) => node.textContent || '');
    return texts.join('').trim();
  });
}

function getCellText(cell, sharedStrings = []) {
  const type = cell.getAttribute('t');
  const v = cell.querySelector('v');
  if (type === 's' && v) {
    const idx = Number.parseInt(v.textContent || '', 10);
    return Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
  }
  if (v) return (v.textContent || '').trim();
  const t = cell.querySelector('is > t');
  return t ? (t.textContent || '').trim() : '';
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Navegador não suporta descompactação de arquivos XLSX.');
  }
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  await writer.write(compressed);
  await writer.close();
  const response = new Response(stream.readable);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function parseZipEntries(arrayBuffer) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries = {};
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compression = view.getUint16(offset + 8, true);
    const dataLen = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart + dataLen > bytes.length) break;

    const nameBytes = bytes.subarray(nameStart, nameStart + nameLen);
    const name = decoder.decode(nameBytes);
    const compressed = bytes.subarray(dataStart, dataStart + dataLen);
    let contents;
    if (compression === 0) {
      contents = compressed;
    } else if (compression === 8) {
      contents = await inflateRaw(compressed);
    } else {
      throw new Error(`Método de compactação não suportado para ${name}.`);
    }

    entries[name] = contents;
    offset = dataStart + dataLen;
  }
  return entries;
}

function extractRowsFromSheet(xmlText, sharedStrings = []) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const rowNodes = Array.from(doc.getElementsByTagName('row'));
  if (!rowNodes.length) throw new Error('Arquivo sem linhas para importar.');

  const findHeaderRow = () => {
    for (const row of rowNodes) {
      const values = readRow(row);
      const hasAllColumns = Object.values(REQUIRED_COLUMNS).every((title) =>
        Array.from(values.values()).some((val) => (val || '').trim() === title),
      );
      if (hasAllColumns) return row;
    }
    return null;
  };

  const headerRow = findHeaderRow();
  if (!headerRow) {
    throw new Error('Não foi possível localizar o cabeçalho com as colunas esperadas.');
  }

  const headerIndex = rowNodes.indexOf(headerRow);
  const dataRows = rowNodes.slice(headerIndex + 1);

  function readRow(rowEl) {
    const cells = Array.from(rowEl.getElementsByTagName('c'));
    const values = new Map();
    cells.forEach((cell, idx) => {
      const ref = cell.getAttribute('r');
      const colIdx = ref ? columnIndexFromRef(ref) : idx;
      if (colIdx === null) return;
      values.set(colIdx, getCellText(cell, sharedStrings));
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

function excelSerialToDate(value) {
  // Excel serial starts at 1899-12-30
  const msPerDay = 24 * 60 * 60 * 1000;
  const excelEpoch = Date.UTC(1899, 11, 30);
  const utcDate = excelEpoch + value * msPerDay;
  return new Date(utcDate);
}

function parseExcelDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }

  const raw = String(value || '').trim();
  if (!raw) return new Date(NaN);

  const numeric = Number.parseFloat(raw);
  if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToDate(numeric);
  }

  const dateTimeMatch = raw.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dateTimeMatch) {
    const [, d, m, y, hh, mm, ss] = dateTimeMatch;
    const yearNum = y.length === 2 ? 2000 + Number.parseInt(y, 10) : Number.parseInt(y, 10);
    return new Date(
      yearNum,
      Number.parseInt(m, 10) - 1,
      Number.parseInt(d, 10),
      Number.parseInt(hh, 10),
      Number.parseInt(mm, 10),
      ss ? Number.parseInt(ss, 10) : 0,
    );
  }

  return new Date(raw);
}

function validateDateRange(row) {
  const started = parseExcelDate(row.startedAt);
  const ended = parseExcelDate(row.endedAt);
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

function normalizeImportedRows(rows) {
  return rows.map((row) => {
    const { started, ended } = validateDateRange(row);
    return {
      ...row,
      startedAt: started.toISOString(),
      endedAt: ended.toISOString(),
      durationSeconds: Number.isFinite(row.durationSeconds) ? row.durationSeconds : undefined,
    };
  });
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
    const buffer = await readFileAsArrayBuffer(file);
    const entries = await parseZipEntries(buffer);
    const sheetBytes = entries['xl/worksheets/sheet1.xml'];
    if (!sheetBytes) throw new Error('Arquivo inválido ou corrompido.');
    const sheetText = new TextDecoder().decode(sheetBytes);
    const sharedStrings = parseSharedStrings(entries['xl/sharedStrings.xml'] ? new TextDecoder().decode(entries['xl/sharedStrings.xml']) : '');
    const rawRows = extractRowsFromSheet(sheetText, sharedStrings);
    const importedRows = sanitizeImportedRows(rawRows);
    if (!importedRows.length) {
      throw new Error('Nenhuma linha encontrada para importar.');
    }

    const normalizedRows = normalizeImportedRows(importedRows);
    const intervals = normalizedRows.map((row) => ({ ...row, started: new Date(row.startedAt), ended: new Date(row.endedAt) }));
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
      chrome.runtime.sendMessage({ type: 'importLogs', rows: normalizedRows }, (importRes) => {
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
    startedAt: fmtDate(row.startedAt),
    endedAt: fmtDate(row.endedAt),
    durationSeconds: typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds) ? row.durationSeconds : '',
    url: row.url ?? '',
  };
}

function refresh() {
  // Gate first
  chrome.storage.local.get(['userName','userEmail'], (vals) => {
    cachedProfile = { userName: (vals.userName||'').trim(), userEmail: (vals.userEmail||'').trim() };
    applyProfileGate(cachedProfile);
    if (!cachedProfile.userName || !cachedProfile.userEmail) {
      showStatus('Informe nome e email para começar.');
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
    chrome.storage.local.get(['userName','userEmail'], (vals) => {
      const meta = { userName: vals.userName || '', userEmail: vals.userEmail || '' };
      const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt, meta);
      const filename = 'azdo-time-tracker-' + ExcelExporter.formatExportFileDate(exportedAt) + '.xlsx';
      ExcelExporter.downloadXlsx(filename, workbookBytes);
    });
  });
});

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
    const name = (profileNameInput?.value || '').trim();
    const email = (profileEmailInput?.value || '').trim();
    if (!name || !email) { alert('Informe nome e email.'); return; }
    chrome.storage.local.set({ userName: name, userEmail: email }, () => {
      applyProfileGate({ userName: name, userEmail: email });
      showStatus('Perfil salvo.');
      refresh();
    });
  });
}

// Edit profile option in menu
if (editProfileBtn) {
  editProfileBtn.addEventListener('click', () => {
    chrome.storage.local.get(['userName','userEmail'], (vals) => {
      if (profileNameInput) profileNameInput.value = vals.userName || '';
      if (profileEmailInput) profileEmailInput.value = vals.userEmail || '';
      profilePanel?.classList.remove('hidden');
      statusSection?.classList.add('hidden');
      logsSection?.classList.add('hidden');
      setMenuDisabled(true);
    });
  });
}

refresh();

