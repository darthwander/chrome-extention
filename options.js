function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString();
}

function durationSeconds(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  return Math.max(0, Math.round((end - start) / 1000));
}

async function load() {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
    const tbody = document.getElementById('tbody');
    const status = document.getElementById('status');
    tbody.innerHTML = '';

    if (!res?.ok) {
      status.textContent = 'Erro ao carregar status.';
      return;
    }

    const current = res.currentTask;
    const logs = res.logs || [];

    if (current && !current.endedAt) {
      status.textContent = `Em andamento: #${current.id} — ${current.title} (desde ${fmtDate(current.startedAt)})`;
    } else {
      status.textContent = 'Nenhuma tarefa em andamento.';
    }

    const rows = [...logs];
    if (current && !current.endedAt) {
      rows.push({ ...current });
    }

    for (const r of rows) {
      const tr = document.createElement('tr');
      const isRunning = !r.endedAt;
      const endLabel = isRunning ? 'EM ANDAMENTO' : fmtDate(r.endedAt);
      const durationLabel = isRunning ? '-' : durationSeconds(r.startedAt, r.endedAt);
      tr.innerHTML = `
        <td>${r.id}</td>
        <td>${r.title}</td>
        <td>${fmtDate(r.startedAt)}</td>
        <td>${endLabel}</td>
        <td>${durationLabel}</td>
      `;
      tbody.appendChild(tr);
    }
  });
}

document.getElementById('refresh').addEventListener('click', load);

document.getElementById('clear').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clearLogs' }, () => load());
});

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'exportCsv' }, (res) => {
    if (!res?.ok) return;
    download(`azdo-time-tracker-${Date.now()}.csv`, res.csv);
  });
});

load();
