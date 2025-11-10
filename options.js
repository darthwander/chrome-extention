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

      const idTd = document.createElement('td');
      idTd.textContent = r.id;
      tr.appendChild(idTd);

      const titleTd = document.createElement('td');
      titleTd.textContent = r.title;
      tr.appendChild(titleTd);

      const projectTd = document.createElement('td');
      projectTd.textContent = r.projectName || '-';
      tr.appendChild(projectTd);

      const captureTypeTd = document.createElement('td');
      captureTypeTd.textContent = r.captureType || '-';
      tr.appendChild(captureTypeTd);

      const startTd = document.createElement('td');
      startTd.textContent = fmtDate(r.startedAt);
      tr.appendChild(startTd);

      const endTd = document.createElement('td');
      endTd.textContent = endLabel;
      tr.appendChild(endTd);

      const durationTd = document.createElement('td');
      durationTd.textContent = durationLabel;
      tr.appendChild(durationTd);

      const actionsTd = document.createElement('td');
      if (r.url) {
        const link = document.createElement('a');
        link.href = r.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'link-button';
        link.textContent = 'Abrir no Azure';
        actionsTd.appendChild(link);
      } else {
        actionsTd.textContent = '—';
      }
      tr.appendChild(actionsTd);

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
