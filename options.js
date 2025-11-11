const ORIGIN_COLORS = {
  azure_devops: '#1f77b4',
  glpi: '#2ca02c',
  outros: '#9467bd',
};

const ORIGIN_LABELS = {
  azure_devops: 'Azure DevOps',
  glpi: 'GLPI',
  outros: 'Outros',
};

let googleChart;
let chartReady = false;
let lastTimelineRows = [];
const timelineEmptyElement = document.getElementById('timeline-empty');
const TIMELINE_EMPTY_MESSAGE =
  (timelineEmptyElement?.dataset?.emptyText || timelineEmptyElement?.textContent || 'Nenhum registro disponível para exibir.').trim();
const TIMELINE_LOADING_MESSAGE =
  (timelineEmptyElement?.dataset?.loadingText || 'Carregando gráfico...').trim();

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

    updateTimelineFromRows(rows);

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

document.getElementById('export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'getExportData' }, (res) => {
    if (!res?.ok) return;
    const exportedAt = res.exportedAt;
    const rows = Array.isArray(res.rows) ? res.rows.map(normalizeExportRow) : [];
    const workbookBytes = ExcelExporter.buildXlsx(rows, exportedAt);
    const filename = `azdo-time-tracker-${ExcelExporter.formatExportFileDate(exportedAt)}.xlsx`;
    ExcelExporter.downloadXlsx(filename, workbookBytes);
  });
});

load();

function normalizeOrigin(value) {
  if (!value) return 'outros';
  const normalized = String(value).toLowerCase();
  if (normalized in ORIGIN_COLORS) {
    return normalized;
  }
  return 'outros';
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '00:00:00';
  }
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

function buildTimelineRows(rawRows) {
  const timezone = 'America/Sao_Paulo';
  const now = new Date();

  return rawRows
    .map((row) => {
      if (!row.startedAt) return null;
      const start = new Date(row.startedAt);
      if (Number.isNaN(start.getTime())) return null;

      const origin = normalizeOrigin(row.captureType);
      const endDate = row.endedAt ? new Date(row.endedAt) : new Date(now);
      if (Number.isNaN(endDate.getTime())) return null;

      const duration = (endDate - start) / 1000;
      const project = row.projectName || 'Sem projeto';
      const title = row.title || (row.id ? `Item ${row.id}` : 'Item sem título');
      const tooltip = `
        <div>
          <strong>${title}</strong><br />
          <div>ID: ${row.id ?? '-'}</div>
          <div>Projeto: ${project}</div>
          <div>Origem: ${ORIGIN_LABELS[origin] ?? origin}</div>
          <div>Início: ${start.toLocaleString('pt-BR', { timeZone: timezone })}</div>
          <div>Fim: ${row.endedAt ? endDate.toLocaleString('pt-BR', { timeZone: timezone }) : 'Em andamento'}</div>
          <div>Duração: ${formatDuration(duration)}</div>
        </div>
      `.trim();

      return {
        project,
        title,
        origin,
        start,
        end: endDate,
        tooltip,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function setTimelineEmptyState() {
  const timeline = document.getElementById('timeline');
  const empty = document.getElementById('timeline-empty');
  const legend = document.getElementById('timeline-legend');
  if (timeline) {
    timeline.hidden = true;
  }
  if (empty) {
    empty.textContent = TIMELINE_EMPTY_MESSAGE;
    empty.hidden = false;
  }
  if (legend) {
    legend.hidden = true;
    legend.innerHTML = '';
  }
}

function renderLegend(rows) {
  const legend = document.getElementById('timeline-legend');
  if (!legend) return;

  const origins = Array.from(new Set(rows.map((row) => row.origin)));
  legend.innerHTML = '';

  if (!origins.length) {
    legend.hidden = true;
    return;
  }

  legend.hidden = false;
  origins.forEach((origin) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = ORIGIN_COLORS[origin] || ORIGIN_COLORS.outros;

    const label = document.createElement('span');
    label.textContent = ORIGIN_LABELS[origin] ?? origin;

    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  });
}

function drawTimeline(rows) {
  const timelineElement = document.getElementById('timeline');
  if (!timelineElement || !rows.length) {
    setTimelineEmptyState();
    return;
  }

  if (!googleChart) {
    googleChart = new google.visualization.Timeline(timelineElement);
  }

  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn({ type: 'string', id: 'Projeto' });
  dataTable.addColumn({ type: 'string', id: 'Título' });
  dataTable.addColumn({ type: 'string', role: 'tooltip', p: { html: true } });
  dataTable.addColumn({ type: 'string', role: 'style' });
  dataTable.addColumn({ type: 'date', id: 'Início' });
  dataTable.addColumn({ type: 'date', id: 'Fim' });

  rows.forEach((row) => {
    const color = ORIGIN_COLORS[row.origin] || ORIGIN_COLORS.outros;
    dataTable.addRow([
      row.project,
      row.title,
      row.tooltip,
      `color: ${color}`,
      row.start,
      row.end,
    ]);
  });

  const projectCount = new Set(rows.map((row) => row.project)).size || 1;
  const options = {
    timeline: {
      showRowLabels: true,
      groupByRowLabel: true,
    },
    height: projectCount * 46 + 80,
    tooltip: { isHtml: true },
    hAxis: { format: 'dd/MM HH:mm' },
  };

  googleChart.draw(dataTable, options);
  timelineElement.hidden = false;
  const empty = document.getElementById('timeline-empty');
  if (empty) {
    empty.hidden = true;
  }
}

function updateTimelineFromRows(rows) {
  const timelineRows = buildTimelineRows(rows);
  lastTimelineRows = timelineRows;

  if (!timelineRows.length) {
    setTimelineEmptyState();
    return;
  }

  renderLegend(timelineRows);
  if (chartReady) {
    drawTimeline(timelineRows);
  } else {
    const timeline = document.getElementById('timeline');
    if (timeline) {
      timeline.hidden = true;
    }
    const empty = document.getElementById('timeline-empty');
    if (empty) {
      empty.textContent = TIMELINE_LOADING_MESSAGE;
      empty.hidden = false;
    }
  }
}

if (window.google && window.google.charts) {
  window.google.charts.load('current', { packages: ['timeline'] });
  window.google.charts.setOnLoadCallback(() => {
    chartReady = true;
    if (lastTimelineRows.length) {
      drawTimeline(lastTimelineRows);
    } else {
      setTimelineEmptyState();
    }
  });
}

window.addEventListener('resize', () => {
  if (chartReady && googleChart && lastTimelineRows.length) {
    drawTimeline(lastTimelineRows);
  }
});
