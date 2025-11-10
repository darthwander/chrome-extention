const STORAGE_KEYS = {
  CURRENT: "currentTask",
  LOGS: "logs"
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
  const { [STORAGE_KEYS.CURRENT]: current, [STORAGE_KEYS.LOGS]: logsRaw } = await getStorage([STORAGE_KEYS.CURRENT, STORAGE_KEYS.LOGS]);
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "startOrStopForItem") {
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

      sendResponse({ ok: false, error: "unknown_message" });
    } catch (e) {
      console.error(e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true;
});

