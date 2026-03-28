const STORAGE_KEY = 'timeTrackerGeneralListFilters';
const PROJECT_COLORS = ['#bf5a36', '#2f855a', '#c6842f', '#4c6baf', '#8a4f7d', '#0f766e', '#b45309', '#6b7280'];

const ORIGIN_META = {
  azure_devops: { label: 'Azure DevOps' },
  glpi: { label: 'GLPI' },
  outros: { label: 'Outros' },
};

const state = {
  rows: [],
  filteredRows: [],
  sort: { key: 'startedAt', direction: 'desc' },
  filters: loadSavedFilters(),
};

const els = {
  tbody: document.getElementById('tbody'),
  tableEmpty: document.getElementById('table-empty'),
  tableCaption: document.getElementById('table-caption'),
  statusBanner: document.getElementById('status-banner'),
  status: document.getElementById('status'),
  periodLabel: document.getElementById('period-label'),
  refresh: document.getElementById('refresh'),
  export: document.getElementById('export'),
  clear: document.getElementById('clear'),
  sendHey: document.getElementById('send-hey'),
  from: document.getElementById('from'),
  to: document.getElementById('to'),
  search: document.getElementById('search'),
  projectFilter: document.getElementById('project-filter'),
  originFilter: document.getElementById('origin-filter'),
  shortcutButtons: Array.from(document.querySelectorAll('[data-period]')),
  sortableHeaders: Array.from(document.querySelectorAll('[data-sort]')),
  metricTotal: document.getElementById('metric-total'),
  metricTotalMeta: document.getElementById('metric-total-meta'),
  metricCount: document.getElementById('metric-count'),
  metricCountMeta: document.getElementById('metric-count-meta'),
  metricRunning: document.getElementById('metric-running'),
  metricRunningMeta: document.getElementById('metric-running-meta'),
  metricProject: document.getElementById('metric-project'),
  metricProjectMeta: document.getElementById('metric-project-meta'),
  projectSummary: document.getElementById('project-summary'),
  activitySummary: document.getElementById('activity-summary'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  saveProfile: document.getElementById('save-profile'),
};

let savedProfile = { userEmail: '', userPassword: '' };

function init() {
  hydrateFiltersFromState();
  bindEvents();
  loadProfile();
  loadDashboard();
}

function bindEvents() {
  els.refresh?.addEventListener('click', loadDashboard);
  els.export?.addEventListener('click', exportXlsx);
  els.clear?.addEventListener('click', clearLogs);
  els.sendHey?.addEventListener('click', sendToHeyGestor);
  els.saveProfile?.addEventListener('click', saveProfile);

  [els.search, els.projectFilter, els.originFilter, els.from, els.to].forEach((input) => {
    if (!input) return;
    const eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, () => {
      if (input === els.from || input === els.to) {
        state.filters.quickPeriod = '';
        syncShortcutButtons();
      }
      applyFiltersAndRender();
    });
    if (eventName !== 'change') input.addEventListener('change', applyFiltersAndRender);
  });

  els.shortcutButtons.forEach((button) => {
    button.addEventListener('click', () => applyQuickPeriod(button.dataset.period || ''));
  });

  els.sortableHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      if (!key) return;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = key;
        state.sort.direction = key === 'id' ? 'asc' : 'desc';
      }
      updateSortHeaders();
      saveFilters();
      renderAll();
    });
  });

  [els.email, els.password].forEach((input) => {
    if (!input) return;
    ['input', 'change', 'blur', 'focus'].forEach((evt) => input.addEventListener(evt, updateSaveProfileVisibility));
  });
}

function loadProfile() {
  chrome.storage.local.get(['userEmail', 'userPassword'], (values) => {
    savedProfile = {
      userEmail: (values.userEmail || '').trim(),
      userPassword: (values.userPassword || '').trim(),
    };
    if (els.email) els.email.value = values.userEmail || '';
    if (els.password) els.password.value = values.userPassword || '';
    updateSaveProfileVisibility();
  });
}

function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultFilters();
    const parsed = JSON.parse(raw);
    return {
      ...getDefaultFilters(),
      ...parsed,
      sortKey: parsed?.sortKey || 'startedAt',
      sortDirection: parsed?.sortDirection === 'asc' ? 'asc' : 'desc',
    };
  } catch {
    return getDefaultFilters();
  }
}

function getDefaultFilters() {
  return {
    from: '',
    to: '',
    search: '',
    project: '',
    origin: '',
    quickPeriod: '',
    sortKey: 'startedAt',
    sortDirection: 'desc',
  };
}

function hydrateFiltersFromState() {
  if (els.from) els.from.value = state.filters.from || '';
  if (els.to) els.to.value = state.filters.to || '';
  if (els.search) els.search.value = state.filters.search || '';
  state.sort = {
    key: state.filters.sortKey || 'startedAt',
    direction: state.filters.sortDirection || 'desc',
  };
  updateSortHeaders();
  syncShortcutButtons();
}

function saveFilters() {
  const payload = {
    from: els.from?.value || '',
    to: els.to?.value || '',
    search: (els.search?.value || '').trim(),
    project: els.projectFilter?.value || '',
    origin: els.originFilter?.value || '',
    quickPeriod: state.filters.quickPeriod || '',
    sortKey: state.sort.key,
    sortDirection: state.sort.direction,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function setStatus(message, tone = 'neutral') {
  if (els.status) els.status.textContent = message;
  if (!els.statusBanner) return;
  els.statusBanner.classList.remove('is-success', 'is-error', 'is-loading');
  if (tone === 'success') els.statusBanner.classList.add('is-success');
  if (tone === 'error') els.statusBanner.classList.add('is-error');
  if (tone === 'loading') els.statusBanner.classList.add('is-loading');
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
  button.disabled = !!isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function fmtDate(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return '00:00:00';
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function normalizeOrigin(origin) {
  const value = String(origin || '').trim().toLowerCase();
  if (!value) return 'outros';
  return ORIGIN_META[value] ? value : 'outros';
}

function getOriginLabel(origin) {
  return ORIGIN_META[normalizeOrigin(origin)]?.label || 'Outros';
}

function projectColor(projectName) {
  const name = String(projectName || 'Sem projeto');
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function parseInputDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalDateTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function applyQuickPeriod(period) {
  const now = new Date();
  let from = null;
  if (period === 'today') from = startOfToday();
  if (period === 'week') from = startOfWeek();
  if (period === 'month') from = startOfMonth();
  if (!from) return;
  if (els.from) els.from.value = toLocalDateTimeValue(from);
  if (els.to) els.to.value = toLocalDateTimeValue(now);
  state.filters.quickPeriod = period;
  syncShortcutButtons();
  applyFiltersAndRender();
}

function syncShortcutButtons() {
  els.shortcutButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.period === state.filters.quickPeriod);
  });
}

function updateSortHeaders() {
  els.sortableHeaders.forEach((header) => {
    const key = header.dataset.sort;
    const label = header.dataset.label || header.textContent.replace(/[▲▼]\s*$/, '').trim();
    header.dataset.label = label;
    if (key === state.sort.key) {
      header.textContent = `${label} ${state.sort.direction === 'asc' ? '▲' : '▼'}`;
      header.setAttribute('aria-sort', state.sort.direction === 'asc' ? 'ascending' : 'descending');
    } else {
      header.textContent = label;
      header.setAttribute('aria-sort', 'none');
    }
  });
}

function updatePeriodLabel(from, to, count) {
  if (!els.periodLabel) return;
  if (!from && !to) {
    els.periodLabel.classList.add('hidden');
    els.periodLabel.textContent = '';
    return;
  }
  const startLabel = from ? fmtDate(from) : 'inicio';
  const endLabel = to ? fmtDate(to) : 'agora';
  els.periodLabel.textContent = `${count} registro(s) entre ${startLabel} e ${endLabel}`;
  els.periodLabel.classList.remove('hidden');
}

function updateSaveProfileVisibility() {
  if (!els.saveProfile) return;
  const email = (els.email?.value || '').trim();
  const password = (els.password?.value || '').trim();
  const changed = email !== savedProfile.userEmail || password !== savedProfile.userPassword;
  const missing = !savedProfile.userEmail || !savedProfile.userPassword;
  els.saveProfile.classList.toggle('hidden', !(changed || missing));
}

function saveProfile() {
  const userEmail = (els.email?.value || '').trim();
  const userPassword = (els.password?.value || '').trim();
  if (!userEmail || !userPassword) {
    setStatus('Informe email e senha para salvar o perfil.', 'error');
    updateSaveProfileVisibility();
    return;
  }
  chrome.storage.local.set({ userEmail, userPassword }, () => {
    savedProfile = { userEmail, userPassword };
    updateSaveProfileVisibility();
    setStatus('Perfil salvo com sucesso.', 'success');
  });
}

function loadDashboard() {
  setStatus('Carregando registros...', 'loading');
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao carregar dados: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!response?.ok) {
      setStatus('Erro ao carregar status.', 'error');
      return;
    }

    const logs = Array.isArray(response.logs) ? response.logs : [];
    const currentTask = response.currentTask && !response.currentTask.endedAt ? response.currentTask : null;
    const rows = currentTask ? [...logs, currentTask] : logs;
    state.rows = rows.map(normalizeRow).filter(Boolean);
    populateFilterOptions(state.rows);
    applyFiltersAndRender(false);

    if (currentTask) {
      setStatus(`Em andamento: #${currentTask.id} - ${currentTask.title}`, 'success');
    } else {
      setStatus('Nenhuma tarefa em andamento.', 'success');
    }
  });
}

function normalizeRow(row) {
  const start = row?.startedAt ? new Date(row.startedAt) : null;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  const isRunning = !row.endedAt;
  const end = row.endedAt ? new Date(row.endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  return {
    ...row,
    id: row.id ?? '-',
    title: row.title || 'Sem titulo',
    projectName: row.projectName || 'Sem projeto',
    captureType: normalizeOrigin(row.captureType),
    startedAt: row.startedAt,
    endedAt: row.endedAt || '',
    start,
    end,
    isRunning,
    sentHeyGestor: Boolean(row.sentHeyGestor),
    durationSeconds,
    searchableText: `${row.id ?? ''} ${row.title || ''} ${row.projectName || ''}`.toLowerCase(),
  };
}

function populateFilterOptions(rows) {
  const projects = Array.from(new Set(rows.map((row) => row.projectName).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const origins = Array.from(new Set(rows.map((row) => normalizeOrigin(row.captureType)))).sort((a, b) => getOriginLabel(a).localeCompare(getOriginLabel(b), 'pt-BR'));
  populateSelect(els.projectFilter, projects, state.filters.project, 'Todos');
  populateSelect(els.originFilter, origins, state.filters.origin, 'Todas', getOriginLabel);
}

function populateSelect(select, options, selectedValue, allLabel, labelGetter = (value) => value) {
  if (!select) return;
  const previous = selectedValue || '';
  select.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  options.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelGetter(value);
    select.appendChild(option);
  });

  select.value = options.includes(previous) ? previous : '';
}

function applyFiltersAndRender(shouldPersist = true) {
  state.filters = {
    from: els.from?.value || '',
    to: els.to?.value || '',
    search: (els.search?.value || '').trim(),
    project: els.projectFilter?.value || '',
    origin: els.originFilter?.value || '',
    quickPeriod: state.filters.quickPeriod || '',
    sortKey: state.sort.key,
    sortDirection: state.sort.direction,
  };

  const from = parseInputDate(state.filters.from);
  const to = parseInputDate(state.filters.to);
  const search = state.filters.search.toLowerCase();

  state.filteredRows = state.rows.filter((row) => {
    if (search && !row.searchableText.includes(search)) return false;
    if (state.filters.project && row.projectName !== state.filters.project) return false;
    if (state.filters.origin && row.captureType !== state.filters.origin) return false;
    if (from && row.end.getTime() < from.getTime()) return false;
    if (to && row.start.getTime() > to.getTime()) return false;
    return true;
  });

  updatePeriodLabel(from, to, state.filteredRows.length);
  renderAll();
  if (shouldPersist) saveFilters();
}

function renderAll() {
  renderSummary();
  renderTable();
  renderProjectSummary();
  renderActivitySummary();
}

function getSortedRows() {
  const rows = [...state.filteredRows];
  const direction = state.sort.direction === 'asc' ? 1 : -1;
  rows.sort((left, right) => compareRows(left, right, state.sort.key) * direction);
  return rows;
}

function compareRows(left, right, key) {
  if (key === 'id') {
    const leftNumber = Number(left.id);
    const rightNumber = Number(right.id);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return String(left.id).localeCompare(String(right.id), 'pt-BR', { numeric: true });
  }
  if (key === 'startedAt') return left.start - right.start;
  if (key === 'endedAt') return left.end - right.end;
  if (key === 'durationSeconds') return left.durationSeconds - right.durationSeconds;
  if (key === 'captureType') return getOriginLabel(left.captureType).localeCompare(getOriginLabel(right.captureType), 'pt-BR');
  return String(left[key] || '').localeCompare(String(right[key] || ''), 'pt-BR', { sensitivity: 'base' });
}

function renderSummary() {
  const rows = state.filteredRows;
  const totalSeconds = rows.reduce((sum, row) => sum + row.durationSeconds, 0);
  const running = rows.filter((row) => row.isRunning);
  const dominant = getDominantProject(rows);
  const average = rows.length ? totalSeconds / rows.length : 0;

  if (els.metricTotal) els.metricTotal.textContent = formatDuration(totalSeconds);
  if (els.metricTotalMeta) {
    els.metricTotalMeta.textContent = rows.length ? `Media por registro: ${formatDuration(average)}` : 'Total acumulado no recorte atual.';
  }
  if (els.metricCount) els.metricCount.textContent = String(rows.length);
  if (els.metricCountMeta) {
    els.metricCountMeta.textContent = rows.length ? `${rows.length} registro(s) apos a filtragem.` : 'Nenhum registro filtrado.';
  }
  if (els.metricRunning) els.metricRunning.textContent = String(running.length);
  if (els.metricRunningMeta) {
    els.metricRunningMeta.textContent = running.length ? `${running.length} tarefa(s) ainda abertas.` : 'Sem tarefas em andamento.';
  }
  if (els.metricProject) els.metricProject.textContent = dominant ? dominant.project : '-';
  if (els.metricProjectMeta) {
    els.metricProjectMeta.textContent = dominant
      ? `${Math.round(dominant.share)}% do tempo filtrado (${formatDuration(dominant.seconds)})`
      : 'Sem dados suficientes.';
  }
}

function getDominantProject(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    totals.set(row.projectName, (totals.get(row.projectName) || 0) + row.durationSeconds);
  });
  const entries = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]);
  if (!entries.length) return null;
  const [project, seconds] = entries[0];
  const grandTotal = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return { project, seconds, share: (seconds / grandTotal) * 100 };
}

function renderTable() {
  if (!els.tbody) return;
  const rows = getSortedRows();
  const pendingCount = rows.filter((row) => !row.isRunning && !row.sentHeyGestor).length;
  els.tbody.innerHTML = '';

  if (!rows.length) {
    if (els.tableCaption) els.tableCaption.textContent = 'Nenhum resultado com a combinacao atual de filtros.';
    els.tableEmpty?.classList.add('show');
    return;
  }

  els.tableEmpty?.classList.remove('show');
  if (els.tableCaption) {
    const pendingLabel = pendingCount ? ` ${pendingCount} pendente(s) de envio para o HeyGestor.` : '';
    els.tableCaption.textContent = `${rows.length} registro(s) exibidos, ordenados por ${humanSortLabel(state.sort.key)}.${pendingLabel}`;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.isRunning) tr.classList.add('is-running');

    appendCell(tr, createTextCell(String(row.id)));
    appendCell(tr, createTitleCell(row));
    appendCell(tr, createProjectCell(row.projectName));
    appendCell(tr, createOriginCell(row.captureType));
    appendCell(tr, createTextCell(fmtDate(row.start)));
    appendCell(tr, createTextCell(row.isRunning ? 'Em andamento' : fmtDate(row.end)));
    appendCell(tr, createDurationCell(formatDuration(row.durationSeconds)));
    appendCell(tr, createActionCell(row.url));

    els.tbody.appendChild(tr);
  });
}

function appendCell(row, cell) {
  row.appendChild(cell);
}

function createTextCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function createTitleCell(row) {
  const td = document.createElement('td');
  const wrapper = document.createElement('div');
  wrapper.className = 'cell-title';

  const head = document.createElement('div');
  head.className = 'cell-title-head';

  const title = document.createElement('strong');
  title.textContent = row.title;
  head.appendChild(title);

  if (!row.isRunning && !row.sentHeyGestor) {
    const indicator = document.createElement('span');
    indicator.className = 'unsent-indicator';
    indicator.textContent = '!';
    indicator.title = 'Registro pendente de envio para o HeyGestor';
    indicator.setAttribute('aria-label', 'Registro pendente de envio para o HeyGestor');
    head.appendChild(indicator);
  }

  const subtitle = document.createElement('span');
  subtitle.className = 'cell-sub';
  subtitle.textContent = row.isRunning ? `Iniciada em ${fmtDate(row.start)}` : `${fmtDate(row.start)} ate ${fmtDate(row.end)}`;

  wrapper.appendChild(head);
  wrapper.appendChild(subtitle);
  td.appendChild(wrapper);
  return td;
}

function createProjectCell(projectName) {
  const td = document.createElement('td');
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = `${projectColor(projectName)}18`;
  chip.style.color = projectColor(projectName);

  const dot = document.createElement('span');
  dot.className = 'chip-dot';

  const text = document.createElement('span');
  text.textContent = projectName;

  chip.appendChild(dot);
  chip.appendChild(text);
  td.appendChild(chip);
  return td;
}

function createOriginCell(origin) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'origin-badge';
  badge.textContent = getOriginLabel(origin);
  td.appendChild(badge);
  return td;
}

function createDurationCell(text) {
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'duration-badge';
  badge.textContent = text;
  td.appendChild(badge);
  return td;
}

function createActionCell(url) {
  const td = document.createElement('td');
  if (!url) {
    td.textContent = '-';
    return td;
  }
  const link = document.createElement('a');
  link.className = 'row-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = '↗';
  td.appendChild(link);
  return td;
}

function humanSortLabel(key) {
  const labels = {
    id: 'ID',
    title: 'titulo',
    projectName: 'projeto',
    captureType: 'origem',
    startedAt: 'inicio',
    endedAt: 'fim',
    durationSeconds: 'duracao',
  };
  return labels[key] || key;
}

function renderProjectSummary() {
  if (!els.projectSummary) return;
  els.projectSummary.innerHTML = '';

  const totals = new Map();
  state.filteredRows.forEach((row) => {
    totals.set(row.projectName, (totals.get(row.projectName) || 0) + row.durationSeconds);
  });

  const entries = Array.from(totals.entries()).sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    els.projectSummary.innerHTML = '<div class="muted-note">Sem dados para resumir.</div>';
    return;
  }

  const grandTotal = entries.reduce((sum, [, seconds]) => sum + seconds, 0) || 1;
  entries.slice(0, 6).forEach(([project, seconds]) => {
    const pct = Math.max(2, Math.round((seconds / grandTotal) * 100));
    const row = document.createElement('div');
    row.className = 'project-row';

    const line = document.createElement('div');
    line.className = 'project-line';

    const left = document.createElement('span');
    left.textContent = project;

    const right = document.createElement('span');
    right.textContent = `${formatDuration(seconds)} · ${Math.round((seconds / grandTotal) * 100)}%`;

    const track = document.createElement('div');
    track.className = 'bar-track';

    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${pct}%`;
    fill.style.background = `linear-gradient(90deg, ${projectColor(project)}, #d58d4b)`;

    line.appendChild(left);
    line.appendChild(right);
    track.appendChild(fill);
    row.appendChild(line);
    row.appendChild(track);
    els.projectSummary.appendChild(row);
  });
}

function renderActivitySummary() {
  if (!els.activitySummary) return;
  els.activitySummary.innerHTML = '';

  const totals = new Map();
  state.filteredRows.forEach((row) => {
    const dayKey = row.start.toLocaleDateString('pt-BR');
    totals.set(dayKey, (totals.get(dayKey) || 0) + row.durationSeconds);
  });

  const entries = Array.from(totals.entries()).sort((left, right) => {
    const [leftDay, leftMonth, leftYear] = left[0].split('/');
    const [rightDay, rightMonth, rightYear] = right[0].split('/');
    return new Date(`${leftYear}-${leftMonth}-${leftDay}`) - new Date(`${rightYear}-${rightMonth}-${rightDay}`);
  });

  if (!entries.length) {
    els.activitySummary.innerHTML = '<div class="muted-note">Sem atividade no periodo.</div>';
    return;
  }

  const maxSeconds = Math.max(...entries.map(([, seconds]) => seconds), 1);
  entries.slice(-7).forEach(([day, seconds]) => {
    const pct = Math.max(3, Math.round((seconds / maxSeconds) * 100));
    const row = document.createElement('div');
    row.className = 'activity-row';

    const line = document.createElement('div');
    line.className = 'activity-line';

    const left = document.createElement('span');
    left.textContent = day;

    const right = document.createElement('span');
    right.textContent = formatDuration(seconds);

    const track = document.createElement('div');
    track.className = 'bar-track';

    const fill = document.createElement('div');
    fill.className = 'bar-fill activity-fill';
    fill.style.width = `${pct}%`;

    line.appendChild(left);
    line.appendChild(right);
    track.appendChild(fill);
    row.appendChild(line);
    row.appendChild(track);
    els.activitySummary.appendChild(row);
  });
}

function normalizeExportRow(row) {
  return {
    id: row.id ?? '',
    title: row.title ?? '',
    projectName: row.projectName ?? '',
    captureType: row.captureType ?? '',
    startedAt: fmtDate(row.startedAt),
    endedAt: row.endedAt ? fmtDate(row.endedAt) : '',
    durationSeconds: row.durationSeconds,
    url: row.url ?? '',
  };
}

function exportXlsx() {
  setButtonLoading(els.export, true, 'Exportando...');
  chrome.runtime.sendMessage({ type: 'getExportData' }, (response) => {
    setButtonLoading(els.export, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao exportar: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!response?.ok) {
      setStatus(`Erro ao exportar: ${response?.error || 'desconhecido'}`, 'error');
      return;
    }
    const exportedAt = response.exportedAt;
    const rows = Array.isArray(response.rows) ? response.rows.map(normalizeExportRow) : [];
    const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt);
    const filename = `azdo-time-tracker-${ExcelExporter.formatExportFileDate(exportedAt)}.xlsx`;
    ExcelExporter.downloadXlsx(filename, workbookBytes);
    setStatus('Exportacao XLSX concluida.', 'success');
  });
}

function clearLogs() {
  setButtonLoading(els.clear, true, 'Limpando...');
  chrome.runtime.sendMessage({ type: 'clearLogs' }, (response) => {
    setButtonLoading(els.clear, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao limpar logs: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!response?.ok) {
      setStatus(`Erro ao limpar logs: ${response?.error || 'desconhecido'}`, 'error');
      return;
    }
    setStatus('Logs removidos com sucesso.', 'success');
    loadDashboard();
  });
}

function sendToHeyGestor() {
  setButtonLoading(els.sendHey, true, 'Enviando...');
  setStatus('Enviando registros para HeyGestor...', 'loading');
  chrome.runtime.sendMessage({ type: 'pushHeyGestor' }, (response) => {
    setButtonLoading(els.sendHey, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao enviar: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!response?.ok) {
      setStatus(`Erro ao enviar: ${response?.error || 'desconhecido'}`, 'error');
      return;
    }
    setStatus('Envio concluido para HeyGestor.', 'success');
    loadDashboard();
  });
}

init();
