const STORAGE_KEYS = {
  CURRENT: "currentTask",
  LOGS: "logs",
  USER_NAME: "userName",
  USER_EMAIL: "userEmail",
};

const HEYGESTOR_DEFAULT_BASE_URL = "http://localhost:8000/api/v1";

async function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function nowISO() {
  return new Date().toISOString();
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeBaseUrl(raw) {
  const base = normalizeString(raw) || HEYGESTOR_DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

async function stopCurrentIfAny(endAtIso) {
  const { [STORAGE_KEYS.CURRENT]: current, [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([
    STORAGE_KEYS.CURRENT,
    STORAGE_KEYS.LOGS,
  ]);
  const logs = logsRaw || [];
  if (current && !current.endedAt) {
    const endedAt = endAtIso || nowISO();
    logs.push({ ...current, endedAt, sentHeyGestor: false });
    await setStorage({ [STORAGE_KEYS.CURRENT]: null, [STORAGE_KEYS.LOGS]: logs });
    return { stopped: current };
  }
  return { stopped: null };
}

async function startTask(item) {
  const startedAt = nowISO();
  const current = { ...item, startedAt, endedAt: null };
  await setStorage({ [STORAGE_KEYS.CURRENT]: current });
  return current;
}

function normalizeImportRow(row) {
  return {
    id: row.id ?? "",
    title: row.title ?? "",
    projectName: row.projectName ?? "",
    captureType: row.captureType ?? "",
    startedAt: row.startedAt ?? "",
    endedAt: row.endedAt ?? "",
    durationSeconds: Number.isFinite(row.durationSeconds) ? row.durationSeconds : undefined,
    url: row.url ?? "",
    sentHeyGestor: Boolean(row.sentHeyGestor),
  };
}

function validateRowDates(row) {
  const started = new Date(row.startedAt);
  const ended = new Date(row.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { ok: false, error: "Datas inválidas em um ou mais registros." };
  }
  if (started >= ended) {
    return { ok: false, error: "Registro com horário de início igual ou após o fim." };
  }
  return { ok: true, started, ended };
}

function intervalsOverlap(a, b) {
  return a.started < b.ended && b.started < a.ended;
}

function toWorkLogRow(log, { minDurationSeconds = 0 } = {}) {
  if (!log?.startedAt || !log?.endedAt) return null;
  const start = new Date(log.startedAt);
  const end = new Date(log.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (start >= end) return null;
  const durationSeconds = Math.max(minDurationSeconds, Math.round((end - start) / 1000));
  return {
    id: log.id ?? "",
    title: log.title ?? "",
    url: log.url ?? "",
    projectName: log.projectName ?? "",
    captureType: log.captureType ?? "",
    startedAt: log.startedAt ?? "",
    endedAt: log.endedAt ?? "",
    durationSeconds,
  };
}

async function buildExportRows({ includeRunningAsEnded = true, onlyEnded = false, minDurationSeconds = 0 } = {}) {
  const { [STORAGE_KEYS.LOGS]: logsRaw, [STORAGE_KEYS.CURRENT]: current } = await getStorage([
    STORAGE_KEYS.LOGS,
    STORAGE_KEYS.CURRENT,
  ]);
  const exportedAt = nowISO();
  const rows = Array.isArray(logsRaw) ? [...logsRaw] : [];

  if (current) {
    if (current.endedAt) {
      rows.push(current);
    } else if (includeRunningAsEnded) {
      rows.push({ ...current, endedAt: exportedAt });
    } else if (!onlyEnded) {
      rows.push(current);
    }
  }

  const mapped = rows
    .map((entry) => toWorkLogRow(entry, { minDurationSeconds }))
    .filter(Boolean)
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  return { rows: onlyEnded ? mapped.filter((r) => r.endedAt) : mapped, exportedAt };
}

async function getPendingLogsForHeyGestor() {
  const { [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([STORAGE_KEYS.LOGS]);
  const logs = Array.isArray(logsRaw) ? logsRaw : [];
  const exportedAt = nowISO();
  const pending = [];

  logs.forEach((log, idx) => {
    if (log?.sentHeyGestor) return;
    const row = toWorkLogRow(log, { minDurationSeconds: 1 });
    if (row) pending.push({ row, index: idx });
  });

  return {
    exportedAt,
    rows: pending.map((p) => p.row),
    indexes: pending.map((p) => p.index),
  };
}

async function markLogsAsSent(indexes) {
  if (!Array.isArray(indexes) || !indexes.length) return;
  const { [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([STORAGE_KEYS.LOGS]);
  const logs = Array.isArray(logsRaw) ? [...logsRaw] : [];
  indexes.forEach((i) => {
    if (logs[i]) logs[i].sentHeyGestor = true;
  });
  await setStorage({ [STORAGE_KEYS.LOGS]: logs });
}

async function loginHeyGestor(baseUrl) {
  const endpoint = `${sanitizeBaseUrl(baseUrl)}/auth/login`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "demo@example.com",
      password: "password",
      device_name: "chrome-ext",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login falhou (HTTP ${res.status}): ${text?.slice(0, 200) || "sem corpo"}`);
  }
  const data = await res.json();
  const token = data?.data?.token;
  if (!token) throw new Error("Token ausente na resposta de login.");
  return token;
}

async function pushLogsToHeyGestor() {
  const baseUrl = HEYGESTOR_DEFAULT_BASE_URL;
  const { rows, exportedAt, indexes } = await getPendingLogsForHeyGestor();
  if (!rows.length) {
    return { ok: false, error: "Nenhum registro finalizado para enviar." };
  }

  const token = await loginHeyGestor(baseUrl);
  const { [STORAGE_KEYS.USER_EMAIL]: userEmail } = await getStorage([STORAGE_KEYS.USER_EMAIL]);
  const endpoint = `${sanitizeBaseUrl(baseUrl)}/work-logs/import`;
  const body = { exportedAt, userEmail: userEmail ?? "", rows };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Envio falhou (HTTP ${res.status}): ${text?.slice(0, 200) || "sem corpo"}`);
  }

  const data = await res.json();
  await markLogsAsSent(indexes);
  return { ok: true, summary: data?.data?.summary ?? null };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "startOrStopForItem") {
        const { [STORAGE_KEYS.USER_NAME]: userName, [STORAGE_KEYS.USER_EMAIL]: userEmail } = await getStorage([
          STORAGE_KEYS.USER_NAME,
          STORAGE_KEYS.USER_EMAIL,
        ]);
        const nameOk = Boolean(String(userName || "").trim());
        const emailOk = Boolean(String(userEmail || "").trim());
        if (!nameOk || !emailOk) {
          sendResponse({ ok: false, error: "Perfil ausente: informe nome e email nas opções." });
          return;
        }

        const item = msg.item;
        const { [STORAGE_KEYS.CURRENT]: current } = await getStorage([STORAGE_KEYS.CURRENT]);

        if (current && !current.endedAt && String(current.id) === String(item.id)) {
          const result = await stopCurrentIfAny();
          sendResponse({ ok: true, action: "stopped", stopped: result.stopped });
          return;
        }

        await stopCurrentIfAny();
        const started = await startTask(item);
        sendResponse({ ok: true, action: "started", started });
        return;
      }

      if (msg?.type === "pushHeyGestor") {
        const result = await pushLogsToHeyGestor();
        sendResponse(result);
        return;
      }

      if (msg?.type === "getStatus") {
        const data = await getStorage([STORAGE_KEYS.CURRENT, STORAGE_KEYS.LOGS]);
        sendResponse({ ok: true, ...data });
        return;
      }

      if (msg?.type === "clearLogs") {
        await setStorage({ [STORAGE_KEYS.LOGS]: [] });
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "getExportData") {
        const { rows, exportedAt } = await buildExportRows({ includeRunningAsEnded: true });
        sendResponse({ ok: true, rows, exportedAt });
        return;
      }

      if (msg?.type === "importLogs") {
        const incomingRows = Array.isArray(msg.rows) ? msg.rows.map(normalizeImportRow) : [];
        if (!incomingRows.length) {
          sendResponse({ ok: false, error: "Nenhum registro para importar." });
          return;
        }

        const parsedIntervals = [];
        for (const row of incomingRows) {
          const validation = validateRowDates(row);
          if (!validation.ok) {
            sendResponse({ ok: false, error: validation.error });
            return;
          }
          parsedIntervals.push({ ...row, ...validation });
        }

        const { [STORAGE_KEYS.LOGS]: logsRaw, [STORAGE_KEYS.CURRENT]: current } = await getStorage([
          STORAGE_KEYS.LOGS,
          STORAGE_KEYS.CURRENT,
        ]);
        const existingLogs = Array.isArray(logsRaw) ? logsRaw : [];
        const existingIntervals = existingLogs
          .map((log) => ({ ...log, ...validateRowDates(log) }))
          .filter((res) => res.ok)
          .map((item) => ({ ...item, started: item.started, ended: item.ended }));

        if (current) {
          const started = new Date(current.startedAt);
          const ended = new Date(current.endedAt || new Date());
          if (!Number.isNaN(started.getTime()) && !Number.isNaN(ended.getTime())) {
            existingIntervals.push({ ...current, started, ended });
          }
        }

        for (const imp of parsedIntervals) {
          for (const ex of existingIntervals) {
            if (intervalsOverlap(imp, ex)) {
              sendResponse({ ok: false, error: "Os registros importados conflitam com registros existentes." });
              return;
            }
          }
        }

        const updatedLogs = [...existingLogs, ...incomingRows.map((r) => ({ ...r, sentHeyGestor: false }))].sort(
          (a, b) => new Date(a.startedAt) - new Date(b.startedAt)
        );
        await setStorage({ [STORAGE_KEYS.LOGS]: updatedLogs });
        sendResponse({ ok: true, count: incomingRows.length });
        return;
      }

      sendResponse({ ok: false, error: "unknown_message" });
    } catch (e) {
      console.error(e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});
