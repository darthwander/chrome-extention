const STORAGE_KEY = 'timeTrackerDashboardFilters';
const PROJECT_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9', '#8B5CF6', '#14B8A6', '#F97316', '#64748B'];
const ORIGIN_META = {
  azure_devops: { label: 'Azure DevOps', color: '#2563EB' },
  glpi: { label: 'GLPI', color: '#10B981' },
  outros: { label: 'Outros', color: '#64748B' },
};

const state = {
  rows: [],
  filteredRows: [],
  sort: { key: 'startedAt', direction: 'desc' },
  filters: loadSavedFilters(),
  lastStatusTone: 'neutral',
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
  metricRunning: document.getElementById('metric-running'),
  metricCount: document.getElementById('metric-count'),
  metricAverage: document.getElementById('metric-average'),
  metricProject: document.getElementById('metric-project'),
  metricProjectMeta: document.getElementById('metric-project-meta'),
  donutWrap: document.getElementById('donut-wrap'),
  donutEmpty: document.getElementById('donut-empty'),
  donut: document.getElementById('project-donut'),
  donutLegend: document.getElementById('donut-legend'),
  donutPrimaryShare: document.getElementById('donut-primary-share'),
  donutPrimaryLabel: document.getElementById('donut-primary-label'),
  timelineLayout: document.getElementById('timeline-layout'),
  timelineEmpty: document.getElementById('timeline-empty'),
  timelineScroller: document.getElementById('timeline-scroller'),
  tooltip: document.getElementById('tooltip'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  saveProfile: document.getElementById('save-profile'),
};

let savedProfile = { userEmail: '', userPassword: '' };

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

function saveFilters() {
  const payload = {
    from: els.from?.value || '',
    to: els.to?.value || '',
    search: els.search?.value || '',
    project: els.projectFilter?.value || '',
    origin: els.originFilter?.value || '',
    quickPeriod: state.filters.quickPeriod || '',
    sortKey: state.sort.key,
    sortDirection: state.sort.direction,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function init() {
  bindEvents();
  hydrateFiltersFromState();
  chrome.storage.local.get(['userEmail', 'userPassword'], (vals) => {
    savedProfile = {
      userEmail: (vals.userEmail || '').trim(),
      userPassword: (vals.userPassword || '').trim(),
    };
    if (els.email) els.email.value = vals.userEmail || '';
    if (els.password) els.password.value = vals.userPassword || '';
    updateSaveProfileVisibility();
  });
  state.sort = {
    key: state.filters.sortKey || 'startedAt',
    direction: state.filters.sortDirection || 'desc',
  };
  loadDashboard();
}

function bindEvents() {
  els.refresh?.addEventListener('click', () => loadDashboard());
  els.export?.addEventListener('click', exportXlsx);
  els.clear?.addEventListener('click', clearLogs);
  els.sendHey?.addEventListener('click', sendToHeyGestor);
  els.saveProfile?.addEventListener('click', saveProfile);

  [els.from, els.to, els.search, els.projectFilter, els.originFilter].forEach((input) => {
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
    ['input', 'change', 'focus', 'blur'].forEach((evt) => input.addEventListener(evt, updateSaveProfileVisibility));
  });

  window.addEventListener('resize', renderTimeline);
}

function hydrateFiltersFromState() {
  if (els.from) els.from.value = state.filters.from || '';
  if (els.to) els.to.value = state.filters.to || '';
  if (els.search) els.search.value = state.filters.search || '';
  state.sort = {
    key: state.filters.sortKey || 'startedAt',
    direction: state.filters.sortDirection || 'desc',
  };
  syncShortcutButtons();
  updateSortHeaders();
}

function updateSortHeaders() {
  els.sortableHeaders.forEach((header) => {
    const key = header.dataset.sort;
    const baseLabel = header.textContent.replace(/[▲▼]\s*$/, '').trim();
    if (key === state.sort.key) {
      header.textContent = `${baseLabel} ${state.sort.direction === 'asc' ? '▲' : '▼'}`;
      header.setAttribute('aria-sort', state.sort.direction === 'asc' ? 'ascending' : 'descending');
    } else {
      header.textContent = baseLabel;
      header.setAttribute('aria-sort', 'none');
    }
  });
}

function setStatus(message, tone = 'neutral') {
  if (els.status) els.status.textContent = message;
  if (!els.statusBanner) return;
  els.statusBanner.classList.remove('is-success', 'is-error', 'is-loading');
  if (tone === 'success') els.statusBanner.classList.add('is-success');
  if (tone === 'error') els.statusBanner.classList.add('is-error');
  if (tone === 'loading') els.statusBanner.classList.add('is-loading');
  state.lastStatusTone = tone;
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent.trim();
  button.disabled = !!isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function fmtDate(iso) {
  if (!iso) return '-';
  const date = iso instanceof Date ? iso : new Date(iso);
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
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function normalizeOrigin(origin) {
  const value = String(origin || '').trim().toLowerCase();
  if (!value) return 'outros';
  if (value in ORIGIN_META) return value;
  return 'outros';
}

function getOriginLabel(origin) {
  return ORIGIN_META[normalizeOrigin(origin)]?.label || String(origin || 'Outros');
}

function projectColor(projectName) {
  const name = String(projectName || 'Sem projeto');
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

function projectBadgeStyles(projectName) {
  const color = projectColor(projectName);
  return { background: `${color}1A`, text: color };
}

function parseInputDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function toLocalDateTimeValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function updatePeriodLabel(from, to, count) {
  if (!els.periodLabel) return;
  if (!from && !to) {
    els.periodLabel.classList.add('hidden');
    els.periodLabel.textContent = '';
    return;
  }
  const startLabel = from ? fmtDate(from) : 'início';
  const endLabel = to ? fmtDate(to) : 'agora';
  els.periodLabel.textContent = `${count} registro(s) no período ${startLabel} até ${endLabel}`;
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

function populateFilterOptions(rows) {
  const projects = Array.from(new Set(rows.map((row) => row.projectName).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const origins = Array.from(new Set(rows.map((row) => normalizeOrigin(row.captureType)))).sort((a, b) => getOriginLabel(a).localeCompare(getOriginLabel(b)));
  populateSelect(els.projectFilter, projects, state.filters.project, 'Todos');
  populateSelect(els.originFilter, origins, state.filters.origin, 'Todos', getOriginLabel);
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

function loadDashboard() {
  setStatus('Carregando dados do dashboard...', 'loading');
  chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao carregar dados: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }

    if (!res?.ok) {
      setStatus('Erro ao carregar status.', 'error');
      return;
    }

    const currentTask = res.currentTask && !res.currentTask.endedAt ? res.currentTask : null;
    const logs = Array.isArray(res.logs) ? res.logs : [];
    const rows = [...logs];
    if (currentTask) rows.push({ ...currentTask });
    state.rows = rows.map(normalizeRow).filter(Boolean);
    populateFilterOptions(state.rows);
    applyFiltersAndRender(false);

    if (currentTask) {
      setStatus(`Em andamento: #${currentTask.id} — ${currentTask.title} (desde ${fmtDate(currentTask.startedAt)})`, 'success');
    } else {
      setStatus('Nenhuma tarefa em andamento.', 'neutral');
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
    title: row.title || 'Sem título',
    projectName: row.projectName || 'Sem projeto',
    captureType: normalizeOrigin(row.captureType),
    startedAt: row.startedAt,
    endedAt: row.endedAt || '',
    start,
    end,
    isRunning,
    durationSeconds,
    searchableText: `${row.id ?? ''} ${row.title || ''}`.toLowerCase(),
  };
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
  const project = state.filters.project;
  const origin = state.filters.origin;

  state.filteredRows = state.rows.filter((row) => {
    if (search && !row.searchableText.includes(search)) return false;
    if (project && row.projectName !== project) return false;
    if (origin && row.captureType !== origin) return false;
    const startMs = row.start.getTime();
    const endMs = row.end.getTime();
    if (from && endMs < from.getTime()) return false;
    if (to && startMs > to.getTime()) return false;
    return true;
  });

  updatePeriodLabel(from, to, state.filteredRows.length);
  renderAll();
  if (shouldPersist) saveFilters();
}

function renderAll() {
  renderTable();
  renderSummary();
  renderDonut();
  renderTimeline();
}

function getSortedRows() {
  const rows = [...state.filteredRows];
  const direction = state.sort.direction === 'asc' ? 1 : -1;
  rows.sort((a, b) => compareRows(a, b, state.sort.key) * direction);
  return rows;
}

function compareRows(a, b, key) {
  if (key === 'id') {
    const aNum = Number(a.id);
    const bNum = Number(b.id);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
    return String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true });
  }
  if (key === 'startedAt') return a.start - b.start;
  if (key === 'endedAt') return a.end - b.end;
  if (key === 'durationSeconds') return a.durationSeconds - b.durationSeconds;
  if (key === 'captureType') return getOriginLabel(a.captureType).localeCompare(getOriginLabel(b.captureType), 'pt-BR');
  return String(a[key] || '').localeCompare(String(b[key] || ''), 'pt-BR', { sensitivity: 'base' });
}

function humanSortLabel(key) {
  const labels = {
    id: 'ID',
    title: 'título',
    projectName: 'projeto',
    captureType: 'origem',
    startedAt: 'início',
    endedAt: 'fim',
    durationSeconds: 'duração',
  };
  return labels[key] || key;
}

function renderTable() {
  if (!els.tbody) return;
  const rows = getSortedRows();
  const longest = rows.reduce((max, row) => (row.durationSeconds > (max?.durationSeconds || -1) ? row : max), null);
  els.tbody.innerHTML = '';

  if (!rows.length) {
    els.tableEmpty?.classList.remove('hidden');
    if (els.tableCaption) els.tableCaption.textContent = 'Nenhum resultado com a combinação atual de filtros.';
    return;
  }

  els.tableEmpty?.classList.add('hidden');
  if (els.tableCaption) {
    els.tableCaption.textContent = `${rows.length} log(s) exibidos, ordenados por ${humanSortLabel(state.sort.key)}.`;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    if (longest && row.id === longest.id && row.startedAt === longest.startedAt) tr.classList.add('is-highlight');

    const idTd = document.createElement('td');
    const idChip = document.createElement('span');
    idChip.className = 'cell-id';
    idChip.textContent = row.id;
    idTd.appendChild(idChip);

    const titleTd = document.createElement('td');
    titleTd.className = 'title-cell';
    const titleMain = document.createElement('div');
    titleMain.className = 'title-main';
    titleMain.textContent = row.title;
    const titleSub = document.createElement('div');
    titleSub.className = 'title-sub';
    titleSub.textContent = row.isRunning ? 'Tarefa em andamento' : `${fmtDate(row.start)} até ${fmtDate(row.end)}`;
    titleTd.appendChild(titleMain);
    titleTd.appendChild(titleSub);

    const projectTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    const badgeStyles = projectBadgeStyles(row.projectName);
    badge.style.background = badgeStyles.background;
    badge.style.color = badgeStyles.text;
    const dot = document.createElement('span');
    dot.className = 'badge-dot';
    dot.style.background = badgeStyles.text;
    const badgeText = document.createElement('span');
    badgeText.textContent = row.projectName;
    badge.appendChild(dot);
    badge.appendChild(badgeText);
    projectTd.appendChild(badge);

    const originTd = document.createElement('td');
    const originText = document.createElement('span');
    originText.className = 'origin-text';
    originText.textContent = getOriginLabel(row.captureType);
    originTd.appendChild(originText);

    const startTd = document.createElement('td');
    startTd.textContent = fmtDate(row.start);

    const endTd = document.createElement('td');
    endTd.textContent = row.isRunning ? 'Em andamento' : fmtDate(row.end);

    const durationTd = document.createElement('td');
    const durationChip = document.createElement('span');
    durationChip.className = 'duration-chip';
    durationChip.textContent = formatDuration(row.durationSeconds);
    durationTd.appendChild(durationChip);

    const actionTd = document.createElement('td');
    if (row.url) {
      const link = document.createElement('a');
      link.className = 'go-link';
      link.href = row.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Abrir ${row.title}`);
      link.textContent = '↗';
      actionTd.appendChild(link);
    } else {
      actionTd.textContent = '—';
    }

    [idTd, titleTd, projectTd, originTd, startTd, endTd, durationTd, actionTd].forEach((td) => tr.appendChild(td));
    els.tbody.appendChild(tr);
  });
}

function renderSummary() {
  const rows = state.filteredRows;
  const totalSeconds = rows.reduce((sum, row) => sum + row.durationSeconds, 0);
  const runningCount = rows.filter((row) => row.isRunning).length;
  const average = rows.length ? totalSeconds / rows.length : 0;
  const dominant = getDominantProject(rows);

  if (els.metricTotal) els.metricTotal.textContent = formatDuration(totalSeconds);
  if (els.metricRunning) {
    els.metricRunning.textContent = runningCount
      ? `${runningCount} tarefa(s) em andamento dentro do recorte atual.`
      : 'Sem tarefas em andamento.';
  }
  if (els.metricCount) els.metricCount.textContent = String(rows.length);
  if (els.metricAverage) els.metricAverage.textContent = `Média por tarefa: ${formatDuration(average)}`;
  if (els.metricProject) els.metricProject.textContent = dominant ? dominant.project : '-';
  if (els.metricProjectMeta) {
    els.metricProjectMeta.textContent = dominant
      ? `${Math.round(dominant.share)}% do tempo filtrado (${formatDuration(dominant.seconds)})`
      : 'Sem dados suficientes.';
  }
}

function getDominantProject(rows) {
  const totals = new Map();
  rows.forEach((row) => totals.set(row.projectName, (totals.get(row.projectName) || 0) + row.durationSeconds));
  const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const [project, seconds] = entries[0];
  const grand = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  return { project, seconds, share: (seconds / grand) * 100 };
}

function renderDonut() {
  const totals = new Map();
  state.filteredRows.forEach((row) => {
    totals.set(row.projectName, (totals.get(row.projectName) || 0) + row.durationSeconds);
  });

  const entries = Array.from(totals.entries()).filter(([, seconds]) => seconds > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    els.donutWrap?.classList.add('hidden');
    els.donutEmpty?.classList.remove('hidden');
    els.donutLegend.innerHTML = '';
    els.donut.style.background = 'conic-gradient(#e5e7eb 0 100%)';
    if (els.donutPrimaryShare) els.donutPrimaryShare.textContent = '0%';
    if (els.donutPrimaryLabel) els.donutPrimaryLabel.textContent = 'Sem dados';
    return;
  }

  els.donutWrap?.classList.remove('hidden');
  els.donutEmpty?.classList.add('hidden');

  const grand = entries.reduce((sum, [, seconds]) => sum + seconds, 0);
  let cursor = 0;
  const stops = [];
  els.donutLegend.innerHTML = '';

  entries.forEach(([project, seconds], index) => {
    const color = projectColor(project);
    const pct = (seconds / grand) * 100;
    stops.push(`${color} ${cursor}% ${cursor + pct}%`);
    cursor += pct;

    const legend = document.createElement('div');
    legend.className = 'legend-row';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = color;
    const name = document.createElement('span');
    name.className = 'legend-name';
    name.textContent = project;
    const value = document.createElement('span');
    value.className = 'legend-value';
    value.textContent = `${pct.toFixed(0)}%`;
    legend.appendChild(swatch);
    legend.appendChild(name);
    legend.appendChild(value);
    els.donutLegend.appendChild(legend);

    if (index === 0) {
      if (els.donutPrimaryShare) els.donutPrimaryShare.textContent = `${pct.toFixed(0)}%`;
      if (els.donutPrimaryLabel) els.donutPrimaryLabel.textContent = project;
    }
  });

  els.donut.style.background = `conic-gradient(${stops.join(', ')})`;
}

function renderTimeline() {
  if (!els.timelineLayout) return;
  const rows = getSortedRows();
  els.timelineLayout.innerHTML = '';

  if (!rows.length) {
    els.timelineEmpty?.classList.remove('hidden');
    els.timelineScroller?.classList.add('hidden');
    return;
  }

  els.timelineEmpty?.classList.add('hidden');
  els.timelineScroller?.classList.remove('hidden');

  const minStart = new Date(Math.min(...rows.map((row) => row.start.getTime())));
  const maxEnd = new Date(Math.max(...rows.map((row) => row.end.getTime())));
  const totalMs = Math.max(1, maxEnd.getTime() - minStart.getTime());
  const totalHours = totalMs / 3600000;
  const timelineWidth = Math.max(920, Math.round(totalHours * 160));
  const ticks = buildAxisTicks(minStart, maxEnd, 6);
  const longest = rows.reduce((max, row) => (row.durationSeconds > (max?.durationSeconds || -1) ? row : max), null);

  const grid = document.createElement('div');
  grid.className = 'timeline-grid';
  grid.style.gridTemplateColumns = `var(--timeline-label-width) minmax(${timelineWidth}px, 1fr)`;

  const spacer = document.createElement('div');
  spacer.className = 'timeline-axis-spacer';
  grid.appendChild(spacer);

  const axis = document.createElement('div');
  axis.className = 'timeline-axis';
  ticks.forEach((tick) => {
    const tickEl = document.createElement('div');
    tickEl.className = 'axis-tick';
    tickEl.style.left = `${tick.position}%`;
    const label = document.createElement('span');
    label.textContent = fmtDate(tick.date);
    tickEl.appendChild(label);
    axis.appendChild(tickEl);
  });
  grid.appendChild(axis);

  rows.forEach((row) => {
    const labelCard = document.createElement('div');
    labelCard.className = 'timeline-label-card';

    const top = document.createElement('div');
    top.className = 'timeline-label-top';
    const title = document.createElement('div');
    title.className = 'timeline-label-title';
    title.textContent = row.title;
    const duration = document.createElement('span');
    duration.className = 'duration-chip';
    duration.textContent = formatDuration(row.durationSeconds);
    top.appendChild(title);
    top.appendChild(duration);

    const meta = document.createElement('div');
    meta.className = 'timeline-meta';
    [`#${row.id}`, row.projectName, getOriginLabel(row.captureType)].forEach((part, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.textContent = '•';
        meta.appendChild(separator);
      }
      const span = document.createElement('span');
      span.textContent = part;
      meta.appendChild(span);
    });

    labelCard.appendChild(top);
    labelCard.appendChild(meta);

    const track = document.createElement('div');
    track.className = 'timeline-track';
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    if (row.isRunning) bar.classList.add('is-running');
    if (longest && row.id === longest.id && row.startedAt === longest.startedAt) bar.classList.add('is-highlight');

    const left = ((row.start.getTime() - minStart.getTime()) / totalMs) * 100;
    const width = Math.max(((row.durationSeconds * 1000) / totalMs) * 100, 1.2);
    const projectColorValue = projectColor(row.projectName);
    const originColorValue = ORIGIN_META[row.captureType]?.color || ORIGIN_META.outros.color;
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    bar.style.background = `linear-gradient(135deg, ${projectColorValue} 0%, ${originColorValue} 100%)`;
    bar.dataset.tooltip = `${row.title}\n${fmtDate(row.start)} até ${row.isRunning ? 'Em andamento' : fmtDate(row.end)}\nDuração: ${formatDuration(row.durationSeconds)}`;
    bar.setAttribute('tabindex', '0');
    bindTooltip(bar);

    const stripe = document.createElement('div');
    stripe.className = 'timeline-bar-stripe';
    bar.appendChild(stripe);
    track.appendChild(bar);

    grid.appendChild(labelCard);
    grid.appendChild(track);
  });

  els.timelineLayout.appendChild(grid);
}

function buildAxisTicks(minStart, maxEnd, count) {
  const total = maxEnd.getTime() - minStart.getTime();
  const ticks = [];
  for (let i = 0; i <= count; i += 1) {
    const ratio = i / count;
    ticks.push({
      position: ratio * 100,
      date: new Date(minStart.getTime() + total * ratio),
    });
  }
  return ticks;
}

function bindTooltip(target) {
  if (!els.tooltip) return;
  const show = (event) => {
    els.tooltip.textContent = target.dataset.tooltip || '';
    els.tooltip.classList.add('show');
    positionTooltip(event);
  };
  const hide = () => {
    els.tooltip.classList.remove('show');
  };

  target.addEventListener('mouseenter', show);
  target.addEventListener('mousemove', positionTooltip);
  target.addEventListener('mouseleave', hide);
  target.addEventListener('focus', show);
  target.addEventListener('blur', hide);
}

function positionTooltip(event) {
  if (!els.tooltip) return;
  const offsetX = 16;
  const offsetY = 18;
  const width = els.tooltip.offsetWidth || 220;
  const height = els.tooltip.offsetHeight || 70;
  const maxX = window.innerWidth - width - 16;
  const maxY = window.innerHeight - height - 16;
  const x = Math.min(maxX, (event.clientX || 0) + offsetX);
  const y = Math.min(maxY, (event.clientY || 0) + offsetY);
  els.tooltip.style.left = `${Math.max(12, x)}px`;
  els.tooltip.style.top = `${Math.max(12, y)}px`;
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
  chrome.runtime.sendMessage({ type: 'getExportData' }, (res) => {
    setButtonLoading(els.export, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao exportar: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!res?.ok) {
      setStatus(`Erro ao exportar: ${res?.error || 'desconhecido'}`, 'error');
      return;
    }
    const exportedAt = res.exportedAt;
    const rows = Array.isArray(res.rows) ? res.rows.map(normalizeExportRow) : [];
    const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt);
    const filename = `azdo-time-tracker-${ExcelExporter.formatExportFileDate(exportedAt)}.xlsx`;
    ExcelExporter.downloadXlsx(filename, workbookBytes);
    setStatus('Exportação XLSX concluída.', 'success');
  });
}

function clearLogs() {
  setButtonLoading(els.clear, true, 'Limpando...');
  chrome.runtime.sendMessage({ type: 'clearLogs' }, (res) => {
    setButtonLoading(els.clear, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao limpar logs: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!res?.ok) {
      setStatus(`Erro ao limpar logs: ${res?.error || 'desconhecido'}`, 'error');
      return;
    }
    setStatus('Logs removidos com sucesso.', 'success');
    loadDashboard();
  });
}

function sendToHeyGestor() {
  setButtonLoading(els.sendHey, true, 'Enviando...');
  setStatus('Enviando registros para HeyGestor...', 'loading');
  chrome.runtime.sendMessage({ type: 'pushHeyGestor' }, (res) => {
    setButtonLoading(els.sendHey, false);
    if (chrome.runtime.lastError) {
      setStatus(`Falha ao enviar: ${chrome.runtime.lastError.message || 'desconhecido'}`, 'error');
      return;
    }
    if (!res?.ok) {
      setStatus(`Erro ao enviar: ${res?.error || 'desconhecido'}`, 'error');
      return;
    }
    setStatus('Envio concluído para HeyGestor.', 'success');
    loadDashboard();
  });
}

init();
