const STORAGE_KEYS = {
  CURRENT: "currentTask",
  LOGS: "logs",
  USER_EMAIL: "userEmail",
  USER_PASSWORD: "userPassword",
  HEY_TOKEN: "heyToken",
  HEY_TOKEN_EMAIL: "heyTokenEmail",
};

const HEYGESTOR_DEFAULT_BASE_URL = "https://heygestor.on-forge.com/api/v1";

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

function formatDateYMD(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseJsonArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function countPendingEndedLogs(logs) {
  return (Array.isArray(logs) ? logs : []).filter((log) => log?.endedAt && !log?.sentHeyGestor).length;
}

async function readErrorText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function buildCurrentTask(item, startedAt = nowISO()) {
  return {
    id: item?.id ?? "",
    title: item?.title ?? "",
    projectName: item?.projectName ?? "",
    captureType: item?.captureType ?? "",
    url: item?.url ?? "",
    startedAt,
    endedAt: null,
    sentHeyGestor: false,
    heyGestorWorkLogId: item?.heyGestorWorkLogId ?? null,
    heyGestorProjectId: item?.heyGestorProjectId ?? null,
  };
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
    heyGestorWorkLogId: row.heyGestorWorkLogId ?? null,
    heyGestorProjectId: row.heyGestorProjectId ?? null,
  };
}

function validateRowDates(row) {
  const started = new Date(row.startedAt);
  const ended = new Date(row.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { ok: false, error: "Datas invalidas em um ou mais registros." };
  }
  if (started >= ended) {
    return { ok: false, error: "Registro com horario de inicio igual ou apos o fim." };
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
    heyGestorWorkLogId: log.heyGestorWorkLogId ?? null,
    heyGestorProjectId: log.heyGestorProjectId ?? null,
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
    .sort((left, right) => new Date(left.startedAt) - new Date(right.startedAt));

  return { rows: onlyEnded ? mapped.filter((row) => row.endedAt) : mapped, exportedAt };
}

async function loginHeyGestor(baseUrl) {
  const { [STORAGE_KEYS.USER_EMAIL]: userEmail, [STORAGE_KEYS.USER_PASSWORD]: userPassword } = await getStorage([
    STORAGE_KEYS.USER_EMAIL,
    STORAGE_KEYS.USER_PASSWORD,
  ]);
  if (!userEmail || !userPassword) {
    throw new Error("Email ou senha nao configurados.");
  }

  const endpoint = `${sanitizeBaseUrl(baseUrl)}/auth/login`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: userEmail,
      password: userPassword,
      device_name: "chrome-ext",
    }),
  });

  if (!response.ok) {
    const text = await readErrorText(response);
    throw new Error(`Login falhou (HTTP ${response.status}): ${text.slice(0, 200) || "sem corpo"}`);
  }

  const data = await response.json();
  const token = data?.data?.token;
  if (!token) throw new Error("Token ausente na resposta de login.");

  await setStorage({
    [STORAGE_KEYS.HEY_TOKEN]: token,
    [STORAGE_KEYS.HEY_TOKEN_EMAIL]: userEmail,
  });

  return { token, email: userEmail };
}

async function ensureHeyGestorToken() {
  const {
    [STORAGE_KEYS.HEY_TOKEN]: token,
    [STORAGE_KEYS.HEY_TOKEN_EMAIL]: tokenEmail,
    [STORAGE_KEYS.USER_EMAIL]: userEmail,
  } = await getStorage([STORAGE_KEYS.HEY_TOKEN, STORAGE_KEYS.HEY_TOKEN_EMAIL, STORAGE_KEYS.USER_EMAIL]);

  if (!token || !userEmail || tokenEmail !== userEmail) {
    return loginHeyGestor(HEYGESTOR_DEFAULT_BASE_URL);
  }

  try {
    const response = await fetch(`${HEYGESTOR_DEFAULT_BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Token invalido");
    const data = await response.json();
    const emailFromMe = data?.data?.email || data?.email;
    if (emailFromMe && emailFromMe !== userEmail) {
      throw new Error("Token pertence a outro usuario");
    }
    return { token, email: emailFromMe || userEmail };
  } catch {
    return loginHeyGestor(HEYGESTOR_DEFAULT_BASE_URL);
  }
}

async function fetchPendingTasksForToday() {
  const { token } = await ensureHeyGestorToken();
  const today = formatDateYMD(new Date());
  const endpoint = `${sanitizeBaseUrl(HEYGESTOR_DEFAULT_BASE_URL)}/tasks/pending?from=${today}&to=${today}`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await readErrorText(response);
    throw new Error(`Falha ao buscar tarefas (HTTP ${response.status}): ${text.slice(0, 200) || "sem corpo"}`);
  }

  const data = await response.json();
  const rows = parseJsonArray(data);
  return rows.map((row) => ({
    id: row.id ?? "",
    title: row.title ?? "",
    projectName: row.projectName ?? row.project?.name ?? "",
    captureType: row.captureType ?? "",
    url: row.url ?? "",
  }));
}

async function fetchHeyGestorProjects() {
  const { token } = await ensureHeyGestorToken();
  const endpoint = `${sanitizeBaseUrl(HEYGESTOR_DEFAULT_BASE_URL)}/projects`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await readErrorText(response);
    throw new Error(`Falha ao listar projetos (HTTP ${response.status}): ${text.slice(0, 200) || "sem corpo"}`);
  }

  const data = await response.json();
  return parseJsonArray(data);
}

function normalizeProjectKey(value) {
  return normalizeString(value).toLowerCase();
}

async function resolveHeyGestorProjectId(projectName) {
  const normalized = normalizeProjectKey(projectName);
  if (!normalized) {
    throw new Error("Projeto ausente para criar o work log no HeyGestor.");
  }

  const projects = await fetchHeyGestorProjects();
  const found = projects.find((project) => {
    const candidates = [
      project?.name,
      project?.projectName,
      project?.title,
      project?.label,
    ];
    return candidates.some((candidate) => normalizeProjectKey(candidate) === normalized);
  });

  if (!found?.id) {
    throw new Error(`Projeto "${projectName}" nao encontrado no HeyGestor.`);
  }

  return found.id;
}

function ensureIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data invalida para envio ao HeyGestor.");
  }
  return date.toISOString();
}

function addSecondsToIso(value, seconds) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data invalida para envio ao HeyGestor.");
  }
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function buildHeyGestorWorkLogPayload(log, projectId, { placeholder = false } = {}) {
  const startedAt = ensureIsoDate(log.startedAt);
  let endedAt = log.endedAt ? ensureIsoDate(log.endedAt) : addSecondsToIso(startedAt, 1);
  let durationSeconds = Number.isFinite(log.durationSeconds)
    ? Math.max(1, Math.round(log.durationSeconds))
    : Math.max(1, Math.round((new Date(endedAt) - new Date(startedAt)) / 1000));

  if (placeholder) {
    endedAt = addSecondsToIso(startedAt, 1);
    durationSeconds = 1;
  }

  return {
    project_id: projectId,
    title: normalizeString(log.title) || `Work item ${log.id || ""}`.trim(),
    description: null,
    work_date: formatDateYMD(new Date(startedAt)),
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    url: normalizeString(log.url) || null,
  };
}

async function createHeyGestorWorkLog(log, { placeholder = false } = {}) {
  const { token } = await ensureHeyGestorToken();
  const projectId = log.heyGestorProjectId || await resolveHeyGestorProjectId(log.projectName);
  const payload = buildHeyGestorWorkLogPayload(log, projectId, { placeholder });
  const endpoint = `${sanitizeBaseUrl(HEYGESTOR_DEFAULT_BASE_URL)}/work-logs`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await readErrorText(response);
    throw new Error(`Criacao do work log falhou (HTTP ${response.status}): ${text.slice(0, 200) || "sem corpo"}`);
  }

  const data = await response.json();
  const workLogId = data?.data?.id || data?.id;
  if (!workLogId) {
    throw new Error("Resposta do HeyGestor sem id do work log.");
  }

  return { workLogId, projectId };
}

async function updateHeyGestorWorkLog(log) {
  if (!log?.heyGestorWorkLogId) {
    throw new Error("Work log remoto ausente para atualizacao.");
  }

  const { token } = await ensureHeyGestorToken();
  const projectId = log.heyGestorProjectId || await resolveHeyGestorProjectId(log.projectName);
  const payload = buildHeyGestorWorkLogPayload(log, projectId);
  const endpoint = `${sanitizeBaseUrl(HEYGESTOR_DEFAULT_BASE_URL)}/work-logs/${log.heyGestorWorkLogId}`;

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await readErrorText(response);
    throw new Error(`Atualizacao do work log falhou (HTTP ${response.status}): ${text.slice(0, 200) || "sem corpo"}`);
  }

  return { workLogId: log.heyGestorWorkLogId, projectId };
}

async function syncSingleEndedLog(log) {
  const row = toWorkLogRow(log, { minDurationSeconds: 1 });
  if (!row) throw new Error("Registro finalizado invalido para envio ao HeyGestor.");

  const remote = log.heyGestorWorkLogId
    ? await updateHeyGestorWorkLog(row)
    : await createHeyGestorWorkLog(row);

  return {
    ...log,
    sentHeyGestor: true,
    heyGestorWorkLogId: remote.workLogId,
    heyGestorProjectId: remote.projectId,
  };
}

async function ensureCurrentTaskRemoteWorkLog(current) {
  const remote = await createHeyGestorWorkLog(current, { placeholder: true });
  const updated = {
    ...current,
    sentHeyGestor: true,
    heyGestorWorkLogId: remote.workLogId,
    heyGestorProjectId: remote.projectId,
  };
  await setStorage({ [STORAGE_KEYS.CURRENT]: updated });
  return updated;
}

async function startTask(item) {
  const current = buildCurrentTask(item);
  await setStorage({ [STORAGE_KEYS.CURRENT]: current });

  try {
    const synced = await ensureCurrentTaskRemoteWorkLog(current);
    return {
      current: synced,
      sync: { ok: true, sentCount: 1, pendingCount: 0, error: "" },
    };
  } catch (error) {
    return {
      current,
      sync: { ok: false, sentCount: 0, pendingCount: 0, error: error?.message || String(error) },
    };
  }
}

async function finalizeCurrentTask(endAtIso) {
  const { [STORAGE_KEYS.CURRENT]: current, [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([
    STORAGE_KEYS.CURRENT,
    STORAGE_KEYS.LOGS,
  ]);
  const logs = Array.isArray(logsRaw) ? [...logsRaw] : [];

  if (!current || current.endedAt) {
    return {
      stopped: null,
      sync: { ok: true, sentCount: 0, pendingCount: countPendingEndedLogs(logs), error: "" },
    };
  }

  const finished = {
    ...current,
    endedAt: endAtIso || nowISO(),
    sentHeyGestor: false,
  };

  let storedLog = finished;
  let sync = { ok: false, sentCount: 0, pendingCount: 0, error: "" };

  try {
    storedLog = await syncSingleEndedLog(finished);
    sync = { ok: true, sentCount: 1, pendingCount: countPendingEndedLogs(logs), error: "" };
  } catch (error) {
    sync = {
      ok: false,
      sentCount: 0,
      pendingCount: countPendingEndedLogs(logs) + 1,
      error: error?.message || String(error),
    };
  }

  logs.push(storedLog);
  await setStorage({ [STORAGE_KEYS.CURRENT]: null, [STORAGE_KEYS.LOGS]: logs });

  return { stopped: current, sync };
}

async function getPendingLogsForHeyGestor() {
  const { [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([STORAGE_KEYS.LOGS]);
  const logs = Array.isArray(logsRaw) ? logsRaw : [];
  return logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log?.endedAt && !log?.sentHeyGestor);
}

async function pushLogsToHeyGestor() {
  return syncPendingLogsToHeyGestor({ allowEmpty: false });
}

async function syncPendingLogsToHeyGestor({ allowEmpty = true } = {}) {
  const { [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([STORAGE_KEYS.LOGS]);
  const logs = Array.isArray(logsRaw) ? [...logsRaw] : [];
  const pendingEntries = logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log?.endedAt && !log?.sentHeyGestor);

  if (!pendingEntries.length) {
    if (allowEmpty) {
      return { ok: true, sentCount: 0, pendingCount: 0, error: "" };
    }
    return { ok: false, error: "Nenhum registro finalizado para enviar." };
  }

  let sentCount = 0;
  let lastError = "";

  for (const entry of pendingEntries) {
    try {
      logs[entry.index] = await syncSingleEndedLog(entry.log);
      sentCount += 1;
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }

  await setStorage({ [STORAGE_KEYS.LOGS]: logs });
  const pendingCount = countPendingEndedLogs(logs);

  if (pendingCount > 0) {
    return {
      ok: false,
      sentCount,
      pendingCount,
      error: lastError || "Ainda existem registros pendentes de envio.",
    };
  }

  return { ok: true, sentCount, pendingCount: 0, error: "" };
}

async function syncPendingLogsAfterInteraction() {
  try {
    return await syncPendingLogsToHeyGestor({ allowEmpty: true });
  } catch (error) {
    const pending = await getPendingLogsForHeyGestor();
    return {
      ok: false,
      sentCount: 0,
      pendingCount: pending.length,
      error: error?.message || String(error),
    };
  }
}

function mergeSyncResults(...results) {
  const validResults = results.filter(Boolean);
  return {
    ok: validResults.every((result) => result.ok !== false),
    sentCount: validResults.reduce((sum, result) => sum + (result.sentCount || 0), 0),
    pendingCount: validResults.reduce((max, result) => Math.max(max, result.pendingCount || 0), 0),
    error: validResults.map((result) => result.error).filter(Boolean).join(" | "),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "startOrStopForItem") {
        const { [STORAGE_KEYS.USER_EMAIL]: userEmail, [STORAGE_KEYS.USER_PASSWORD]: userPassword } = await getStorage([
          STORAGE_KEYS.USER_EMAIL,
          STORAGE_KEYS.USER_PASSWORD,
        ]);
        const emailOk = Boolean(String(userEmail || "").trim());
        const passOk = Boolean(String(userPassword || "").trim());
        if (!emailOk || !passOk) {
          sendResponse({ ok: false, error: "Perfil ausente: informe email e senha nas opcoes." });
          return;
        }

        const item = msg.item;
        const { [STORAGE_KEYS.CURRENT]: current } = await getStorage([STORAGE_KEYS.CURRENT]);

        if (current && !current.endedAt && String(current.id) === String(item.id)) {
          const stopResult = await finalizeCurrentTask();
          const retryResult = await syncPendingLogsAfterInteraction();
          sendResponse({
            ok: true,
            action: "stopped",
            stopped: stopResult.stopped,
            sync: mergeSyncResults(stopResult.sync, retryResult),
          });
          return;
        }

        const stopResult = await finalizeCurrentTask();
        const startResult = await startTask(item);
        const retryResult = await syncPendingLogsAfterInteraction();

        sendResponse({
          ok: true,
          action: "started",
          started: startResult.current,
          sync: mergeSyncResults(stopResult.sync, startResult.sync, retryResult),
        });
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

      if (msg?.type === "getPendingTasksToday") {
        const rows = await fetchPendingTasksForToday();
        sendResponse({ ok: true, rows });
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
          .filter((result) => result.ok)
          .map((item) => ({ ...item, started: item.started, ended: item.ended }));

        if (current) {
          const started = new Date(current.startedAt);
          const ended = new Date(current.endedAt || new Date());
          if (!Number.isNaN(started.getTime()) && !Number.isNaN(ended.getTime())) {
            existingIntervals.push({ ...current, started, ended });
          }
        }

        for (const imported of parsedIntervals) {
          for (const existing of existingIntervals) {
            if (intervalsOverlap(imported, existing)) {
              sendResponse({ ok: false, error: "Os registros importados conflitam com registros existentes." });
              return;
            }
          }
        }

        const updatedLogs = [...existingLogs, ...incomingRows.map((row) => ({ ...row, sentHeyGestor: false }))].sort(
          (left, right) => new Date(left.startedAt) - new Date(right.startedAt)
        );
        await setStorage({ [STORAGE_KEYS.LOGS]: updatedLogs });
        sendResponse({ ok: true, count: incomingRows.length });
        return;
      }

      sendResponse({ ok: false, error: "unknown_message" });
    } catch (error) {
      console.error(error);
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});
