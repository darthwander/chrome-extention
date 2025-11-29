const STORAGE_KEYS = {
  CURRENT: "currentTask",
  LOGS: "logs",
  USER_NAME: "userName",
  USER_EMAIL: "userEmail",
};

async function getStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function setStorage(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

function nowISO() {
  return new Date().toISOString();
}

async function stopCurrentIfAny(endAtIso) {
  const { [STORAGE_KEYS.CURRENT]: current, [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([
    STORAGE_KEYS.CURRENT,
    STORAGE_KEYS.LOGS,
  ]);
  const logs = logsRaw || [];
  if (current && !current.endedAt) {
    const endedAt = endAtIso || nowISO();
    logs.push({ ...current, endedAt });
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
    id: row.id ?? '',
    title: row.title ?? '',
    projectName: row.projectName ?? '',
    captureType: row.captureType ?? '',
    startedAt: row.startedAt ?? '',
    endedAt: row.endedAt ?? '',
    durationSeconds: Number.isFinite(row.durationSeconds) ? row.durationSeconds : undefined,
    url: row.url ?? '',
  };
}

function validateRowDates(row) {
  const started = new Date(row.startedAt);
  const ended = new Date(row.endedAt);
  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    return { ok: false, error: 'Datas inválidas em um ou mais registros.' };
  }
  if (started >= ended) {
    return { ok: false, error: 'Registro com horário de início igual ou após o fim.' };
  }
  return { ok: true, started, ended };
}

function intervalsOverlap(a, b) {
  return a.started < b.ended && b.started < a.ended;
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
        const { [STORAGE_KEYS.LOGS]: logsRaw, [STORAGE_KEYS.CURRENT]: current } = await getStorage([
          STORAGE_KEYS.LOGS,
          STORAGE_KEYS.CURRENT,
        ]);
        const logs = logsRaw || [];

        const exportedAt = nowISO();
        const tempLogs = [...logs];
        if (current && !current.endedAt) {
          tempLogs.push({ ...current, endedAt: exportedAt });
        }

        const rows = tempLogs.map((l) => {
          const start = new Date(l.startedAt);
          const end = new Date(l.endedAt);
          const durationSeconds = Math.max(0, Math.round((end - start) / 1000));
          return {
            id: l.id ?? "",
            title: l.title ?? "",
            url: l.url ?? "",
            projectName: l.projectName ?? "",
            captureType: l.captureType ?? "",
            startedAt: l.startedAt ?? "",
            endedAt: l.endedAt ?? "",
            durationSeconds,
          };
        });

        sendResponse({ ok: true, rows, exportedAt });
        return;
      }

      if (msg?.type === "importLogs") {
        const incomingRows = Array.isArray(msg.rows) ? msg.rows.map(normalizeImportRow) : [];
        if (!incomingRows.length) { sendResponse({ ok: false, error: "Nenhum registro para importar." }); return; }

        const parsedIntervals = [];
        for (const row of incomingRows) {
          const validation = validateRowDates(row);
          if (!validation.ok) { sendResponse({ ok: false, error: validation.error }); return; }
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

        const updatedLogs = [...existingLogs, ...incomingRows].sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
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

