const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const stopBtn = document.getElementById('stop');
const refreshBtn = document.getElementById('refresh');
const exportBtn = document.getElementById('export');
const clearBtn = document.getElementById('clear');
const openLogsBtn = document.getElementById('open-logs');
const actionsToggle = document.getElementById('actions-toggle');
const actionsMenu = document.getElementById('actions-menu');

let currentTask = null;

function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
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

function renderLogs(logs) {
  logsEl.innerHTML = '';
  if (!logs.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Nenhum registro disponível.';
    logsEl.appendChild(li);
    return;
  }

  logs.slice(0, 3).forEach((log) => {
    const li = document.createElement('li');
    li.className = 'logs-item';
    const endLabel = log.endedAt ? fmtDateTime(log.endedAt) : 'Em andamento';
    const title = truncate(log.title || '', 42);
    li.innerHTML = `
      <strong>#${log.id} — ${title}</strong>
      <span class="muted">${fmtDateTime(log.startedAt)} - ${endLabel}</span>
    `;
    logsEl.appendChild(li);
  });
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function handleError(defaultMessage) {
  const err = chrome.runtime.lastError;
  const message = err ? err.message : defaultMessage;
  showStatus(`Erro: ${message || 'desconhecido'}`, true);
}

function refresh() {
  showStatus('Carregando…');
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
      showStatus(`Em andamento: #${currentTask.id} — ${currentTask.title} (desde ${fmtDate(currentTask.startedAt)})`);
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
  chrome.runtime.sendMessage({ type: 'exportCsv' }, (res) => {
    if (chrome.runtime.lastError) {
      handleError('Falha ao exportar CSV.');
      return;
    }
    if (!res?.ok) {
      showStatus(`Erro: ${res?.error || 'desconhecido'}`, true);
      return;
    }
    download(`time-tracker-${Date.now()}.csv`, res.csv);
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
