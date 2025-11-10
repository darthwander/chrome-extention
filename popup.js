const statusEl = document.getElementById('status');
const logsEl = document.getElementById('logs');
const stopBtn = document.getElementById('stop');
const refreshBtn = document.getElementById('refresh');
const exportBtn = document.getElementById('export');
const clearBtn = document.getElementById('clear');
const openLogsBtn = document.getElementById('open-logs');

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

function durationLabel(startIso, endIso) {
  if (!startIso || !endIso) return '-';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
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

  logs.slice(0, 5).forEach((log) => {
    const li = document.createElement('li');
    li.className = 'logs-item';
    const endLabel = log.endedAt ? fmtDate(log.endedAt) : 'Em andamento';
    li.innerHTML = `
      <strong>#${log.id} — ${log.title}</strong>
      <span class="muted">Início: ${fmtDate(log.startedAt)}</span>
      <span class="muted">Fim: ${endLabel}</span>
      <span class="muted">Duração: ${durationLabel(log.startedAt, log.endedAt)}</span>
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
    download(`azdo-time-tracker-${Date.now()}.csv`, res.csv);
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
