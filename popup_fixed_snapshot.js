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

let currentTask = null;
let cachedProfile = { userName: '', userEmail: '' };

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (v) => String(v).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = String(d.getFullYear()).slice(-2);
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (err) {
    return '';
  }
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const pad = (value) => String(value).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = String(d.getFullYear()).slice(-2);
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (err) {
    return '-';
  }
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

function setMenuDisabled(disabled) {
  [refreshBtn, exportBtn, clearBtn, openLogsBtn].forEach((btn) => {
    if (!btn) return;
    btn.toggleAttribute('disabled', !!disabled);
    btn.classList.toggle('disabled', !!disabled);
  });
}

function applyProfileGate(profile) {
  const hasProfile = !!(profile?.userName && profile?.userEmail);
  if (hasProfile) {
    if (profilePanel) profilePanel.classList.add('hidden');
    if (statusSection) statusSection.classList.remove('hidden');
    if (logsSection) logsSection.classList.remove('hidden');
    setMenuDisabled(false);
    if (editProfileBtn) editProfileBtn.classList.remove('hidden');
  } else {
    if (profilePanel) profilePanel.classList.remove('hidden');
    if (statusSection) statusSection.classList.add('hidden');
    if (logsSection) logsSection.classList.add('hidden');
    setMenuDisabled(true);
    if (editProfileBtn) editProfileBtn.classList.add('hidden');
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
    const remainingSlots = 3 - items.length;
    if (remainingSlots > 0) {
      const latestRest = rest.slice(-remainingSlots).reverse();
      items.push(...latestRest);
    }
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
    actionButton.innerHTML = '<span aria-hidden="true">▶</span>';
    actionButton.setAttribute('aria-label', `Iniciar nova contagem para ${accessibleTitle}`);
    actionButton.title = 'Iniciar nova contagem';
    actionButton.disabled = !log.endedAt;
    actionButton.addEventListener('click', (event) => {
      event.stopPropagation();
      startLogAgain(log);
    });

    wrapper.appendChild(textContainer);
    wrapper.appendChild(actionButton);

    li.appendChild(wrapper);
    logsEl.appendChild(li);
  });
}

function startLogAgain(log) {
  if (!log || !log.endedAt) {
    return;
  }

  const payload = {
    id: log.id,
    title: log.title,
    url: log.url,
    projectName: log.projectName,
    captureType: log.captureType,
  };

  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: payload }, (res) => {
    if (chrome.runtime.lastError) {
      handleError('Falha ao iniciar nova contagem.');
      return;
    }

    if (!res?.ok) {
      showStatus(`Erro: ${res?.error || 'desconhecido'}`, true);
      return;
    }

    if (res.action === 'started') {
      showStatus(`Iniciado: #${res.started?.id} — ${res.started?.title}`);
      stopBtn.classList.remove('hidden');
      refresh();
    } else if (res.action === 'stopped') {
      showStatus(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`);
      stopBtn.classList.add('hidden');
      refresh();
    }
  });
}

function handleError(defaultMessage) {
  const err = chrome.runtime.lastError;
  const message = err ? err.message : defaultMessage;
  showStatus(`Erro: ${message || 'desconhecido'}`, true);
}

function normalizeExportRow(row) {
  return {
    id: row.id ?? '',
    title: row.title ?? '',
    projectName: row.projectName ?? '',
    captureType: row.captureType ?? '',
    startedAt: fmtDate(row.startedAt),
    endedAt: fmtDate(row.endedAt),
    durationSeconds:
      typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds)
        ? row.durationSeconds
        : '',
    url: row.url ?? '',
  };
}

function refresh() {
  // Gate first, then fetch status only if profile ok
  chrome.storage.local.get(["userName","userEmail"], (vals) => {
    cachedProfile = { userName: (vals.userName||'').trim(), userEmail: (vals.userEmail||'').trim() };
    applyProfileGate(cachedProfile);
    if (!cachedProfile.userName || !cachedProfile.userEmail) {
      showStatus('Informe nome e email para come�ar.');
      return;
    }

    showStatus('Carregando...');
    chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
      if (chrome.runtime.lastError) {
        handleError('Falha ao obter status.');
        return;
      }
      if (!res?.ok) {
        showStatus('Erro ao carregar status.', true);
        return;
      }
      const logs = Array.isArray(res.logs) ? res.logs : [];
      currentTask = res.currentTask || null;
      if (currentTask && !currentTask.endedAt) {
        showStatus(`Em andamento: #${currentTask.id} � ${currentTask.title} (desde ${fmtDate(currentTask.startedAt)})`);
        stopBtn.classList.remove('hidden');
      } else {
        showStatus('Nenhuma tarefa em andamento.');
        stopBtn.classList.add('hidden');
      }
      const displayLogs = [...logs];
      if (currentTask && !currentTask.endedAt) {
        displayLogs.unshift(currentTask);
      }
      renderLogs(displayLogs);
    });
  });
}

function openActionsMenu() {
  actionsMenu.classList.remove('hidden');
  actionsToggle.setAttribute('aria-expanded', 'true');
  actionsMenu.setAttribute('aria-hidden', 'false');
}

function closeActionsMenu() {
  actionsMenu.classList.add('hidden');
  actionsToggle.setAttribute('aria-expanded', 'false');
  actionsMenu.setAttribute('aria-hidden', 'true');
}

actionsToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  if (actionsMenu.classList.contains('hidden')) {
    openActionsMenu();
  } else {
    closeActionsMenu();
  }
});

document.addEventListener('click', (event) => {
  if (actionsMenu.classList.contains('hidden')) return;
  if (!actionsMenu.contains(event.target) && event.target !== actionsToggle) {
    closeActionsMenu();
  }
});

actionsMenu.addEventListener('click', (event) => {
  if (event.target instanceof HTMLElement && event.target.classList.contains('menu-item')) {
    closeActionsMenu();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeActionsMenu();
  }
});

function stopCurrentTask() {
  if (!currentTask) return;
  chrome.runtime.sendMessage({ type: 'startOrStopForItem', item: currentTask }, (res) => {
    if (chrome.runtime.lastError) {
      handleError('Falha ao parar tarefa.');
      return;
    }

    if (!res?.ok) {
      showStatus(`Erro: ${res?.error || 'desconhecido'}`, true);
      return;
    }

    if (res.action === 'stopped') {
      showStatus(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`);
      stopBtn.classList.add('hidden');
      refresh();
    }
  });
}

refreshBtn.addEventListener('click', refresh);
stopBtn.addEventListener('click', stopCurrentTask);

exportBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'getExportData' }, (res) => {
    if (chrome.runtime.lastError) { handleError('Falha ao exportar XLSX.'); return; }
    if (!res?.ok) { showStatus(Erro: , true); return; }
    const exportedAt = res.exportedAt;
    const rows = Array.isArray(res.rows) ? res.rows.map(normalizeExportRow) : [];
    chrome.storage.local.get(['userName','userEmail'], (vals) => {
      const meta = { userName: vals.userName || '', userEmail: vals.userEmail || '' };
      const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt, meta);
      const filename = zdo-time-tracker-.xlsx;
      ExcelExporter.downloadXlsx(filename, workbookBytes);
    });
  });
});
});

clearBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clearLogs' }, (res) => {
    if (chrome.runtime.lastError) {
      handleError('Falha ao limpar logs.');
      return;
    }
    if (!res?.ok) {
      showStatus(`Erro: ${res?.error || 'desconhecido'}`, true);
      return;
    }
    refresh();
  });
});

openLogsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

refresh();


// Save profile from popup gate
if (typeof saveProfilePopupBtn !== 'undefined' && saveProfilePopupBtn) {
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
if (typeof editProfileBtn !== 'undefined' && editProfileBtn) {
  editProfileBtn.addEventListener('click', () => {
    chrome.storage.local.get(['userName','userEmail'], (vals) => {
      if (profileNameInput) profileNameInput.value = vals.userName || '';
      if (profileEmailInput) profileEmailInput.value = vals.userEmail || '';
      if (profilePanel) profilePanel.classList.remove('hidden');
      if (statusSection) statusSection.classList.add('hidden');
      if (logsSection) logsSection.classList.add('hidden');
      setMenuDisabled(true);
    });
  });
}

