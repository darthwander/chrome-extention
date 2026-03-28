(function () {
  const BUTTON_ID = "azdo-time-tracker-btn";
  const TOAST_CONTAINER_ID = "azdo-tt-toast-container";
  const GLPI_FLOATING_CONTAINER_ID = "azdo-tt-glpi-floating";

  let currentContext = null;

  const observer = new MutationObserver(() => {
    tryInject();
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  function tryInject() {
    const context = getInjectionContext();
    if (!context) return;

    currentContext = context;

    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.className = "azdo-tt-btn";
      btn.textContent = "Track time";
      btn.addEventListener("click", onClick);
      context.anchor.appendChild(btn);
    } else if (btn.parentElement !== context.anchor) {
      context.anchor.appendChild(btn);
    }
  }

  function onClick() {
    const item = currentContext?.extractItem();
    if (!item) {
      toast("Nao foi possivel identificar o Work Item.", "error");
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: "startOrStopForItem", item }, (res) => {
        if (chrome.runtime.lastError) {
          toast("Extensao recarregada. Atualize a pagina e tente novamente.", "error");
          return;
        }
        if (!res?.ok) {
          toast(`Erro: ${res?.error || "desconhecido"}`, "error");
          return;
        }
        if (res.action === "started") toast(`Iniciado: #${item.id} - ${item.title}`, "start");
        if (res.action === "stopped") toast(`Encerrado: #${res.stopped?.id} - ${res.stopped?.title}`, "stop");
      });
    } catch (_error) {
      toast("Contexto da extensao invalido. Atualize a pagina.", "error");
    }
  }

  function getInjectionContext() {
    const azureHeader = document.querySelector(".work-item-form-header");
    if (azureHeader) {
      const anchorContainer = azureHeader.querySelector("#jibble-button")?.parentElement
        || azureHeader.querySelector(".wif-comment-count-link")?.parentElement
        || azureHeader.querySelector(".flex-row");

      if (anchorContainer) {
        return { anchor: anchorContainer, extractItem: extractAzureWorkItem };
      }
    }

    const glpiContext = getGlpiInjectionContext();
    if (glpiContext) {
      return glpiContext;
    }

    return null;
  }

  function extractAzureWorkItem() {
    const idLink = document.querySelector('.work-item-form-header a[href*="/_workitems/edit/"]');
    let id = null;
    let url = null;
    if (idLink) {
      const href = idLink.getAttribute("href") || "";
      const match = href.match(/\/edit\/(\d+)/);
      if (match) id = match[1];
      url = new URL(href, location.origin).href;
    }

    const titleInput = document.querySelector(".work-item-title-textfield input");
    const title = titleInput ? titleInput.value : "";

    if (!id || !title) return null;

    const projectName = extractProjectName(url);
    return { id, title, url, projectName, captureType: "azure_devops" };
  }

  function isGlpiTicketPage() {
    return window.location.pathname.includes("/front/ticket.form.php");
  }

  function isGlpiChangePage() {
    return window.location.pathname === "/front/change.form.php";
  }

  function isGenericGlpiFormPage() {
    return /\/front\/[^/]+\.form\.php$/i.test(window.location.pathname);
  }

  function getGlpiInjectionContext() {
    if (!isGenericGlpiFormPage()) return null;

    const anchor = isGlpiChangePage() ? findGlpiChangeAnchor() : findGlpiAnchor();
    if (!anchor) return null;

    if (isGlpiTicketPage()) {
      return { anchor, extractItem: extractGlpiWorkItem };
    }

    if (isGlpiChangePage()) {
      return { anchor, extractItem: extractGlpiChangeItem };
    }

    return { anchor, extractItem: extractGenericGlpiItem };
  }

  function findGlpiAnchor() {
    const navbar = document.querySelector(".navbar.navbar-expand-md");
    if (navbar) {
      const navActions = navbar.querySelector(".nav.navbar-nav") || navbar.querySelector(".navbar-nav");
      if (navActions) return navActions;
    }

    const preferred = document.querySelector(".timeline-header.d-flex");
    if (preferred) return preferred;

    const pageHeader = document.querySelector(".page-header, .header-title");
    if (pageHeader) return pageHeader;

    let fallback = document.getElementById(GLPI_FLOATING_CONTAINER_ID);
    if (!fallback) {
      fallback = document.createElement("div");
      fallback.id = GLPI_FLOATING_CONTAINER_ID;
      Object.assign(fallback.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: "2147483647",
      });
      document.body.appendChild(fallback);
    }
    return fallback;
  }

  function findGlpiChangeAnchor() {
    return document.querySelector("h3.navigationheader-title");
  }

  function extractGlpiWorkItem() {
    const url = window.location.href;
    const searchParams = new URLSearchParams(window.location.search);
    let id = searchParams.get("id");

    if (!id) {
      const altId = document.querySelector('input[name="id"], input[name="tickets_id"], input[name="items_id"]');
      if (altId?.value) id = altId.value.trim();
    }

    const typeLabel = getGlpiTypeLabel("ticket");
    const pageTitle = (document.querySelector("title")?.textContent || "").trim();
    const headerTitle = document.querySelector(".card-title.card-header, .page-title, h1, h2")?.textContent?.trim();
    const baseTitle = pageTitle || headerTitle || "";
    const rawTitle = baseTitle || (id ? `${typeLabel} ${id}` : "");
    const title = prefixGlpiTitle(typeLabel, rawTitle);

    if (!id || !title) return null;

    return {
      id,
      title,
      url,
      projectName: "GLPI",
      captureType: "glpi",
    };
  }

  function extractGlpiChangeItem() {
    const url = window.location.href;
    const typeLabel = getGlpiTypeLabel("change");
    const searchParams = new URLSearchParams(window.location.search);
    let id = searchParams.get("id");

    const headerTitleEl = document.querySelector("h3.navigationheader-title");
    const headerText = headerTitleEl?.textContent?.trim() || "";

    if (!id) {
      const headerMatch = headerText.match(/\((\d+)\)/);
      if (headerMatch) id = headerMatch[1];
    }

    if (!id) {
      const titleText = document.querySelector("title")?.textContent || "";
      const titleMatch = titleText.match(/#?(\d+)/);
      if (titleMatch) id = titleMatch[1];
    }

    const pageTitle = (document.querySelector("title")?.textContent || "").trim();
    let title = headerText || pageTitle || "";

    if (title && id) {
      const idCleanupRegex = new RegExp(`\\s*\\(?#?${id}\\)?\\s*$`);
      title = title.replace(idCleanupRegex, "").trim();
    }

    if (!title && id) title = `${typeLabel} ${id}`;
    if (!id || !title) return null;

    return {
      id,
      title: prefixGlpiTitle(typeLabel, title),
      url,
      projectName: "GLPI",
      captureType: "glpi",
      type: "change",
    };
  }

  function extractGenericGlpiItem() {
    const url = window.location.href;
    const pathMatch = window.location.pathname.match(/\/front\/([^/]+)\.form\.php$/i);
    const entityName = pathMatch?.[1] || "item";
    const typeLabel = getGlpiTypeLabel(entityName);
    const searchParams = new URLSearchParams(window.location.search);
    let id = searchParams.get("id");

    if (!id) {
      const altId = document.querySelector('input[name="id"], input[name="items_id"], input[name$="_id"]');
      if (altId?.value) id = altId.value.trim();
    }

    if (!id) {
      const titleText = document.querySelector("title")?.textContent || "";
      const titleMatch = titleText.match(/#?(\d+)/);
      if (titleMatch) id = titleMatch[1];
    }

    const headerCandidates = [
      document.querySelector("h3.navigationheader-title")?.textContent,
      document.querySelector(".card-title.card-header")?.textContent,
      document.querySelector(".page-title")?.textContent,
      document.querySelector("h1")?.textContent,
      document.querySelector("h2")?.textContent,
      document.querySelector("title")?.textContent,
    ]
      .map((value) => (value || "").trim())
      .filter(Boolean);

    let title = headerCandidates[0] || "";
    if (title && id) {
      const idCleanupRegex = new RegExp(`\\s*\\(?#?${id}\\)?\\s*$`);
      title = title.replace(idCleanupRegex, "").trim();
    }

    if (!title && id) {
      title = `${typeLabel} ${id}`;
    }

    if (!id || !title) return null;

    return {
      id,
      title: prefixGlpiTitle(typeLabel, title),
      url,
      projectName: "GLPI",
      captureType: "glpi",
      type: entityName,
    };
  }

  function getGlpiTypeLabel(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "ticket") return "Incidente";
    if (normalized === "problem") return "Problema";
    if (normalized === "change") return "Mudanca";
    return humanizeGlpiEntityName(normalized || "item");
  }

  function prefixGlpiTitle(typeLabel, title) {
    const cleanType = String(typeLabel || "").trim();
    const cleanTitle = String(title || "").trim();
    if (!cleanType) return cleanTitle;
    if (!cleanTitle) return cleanType;
    if (cleanTitle.toLowerCase().startsWith(`${cleanType.toLowerCase()}:`)) return cleanTitle;
    return `${cleanType}: ${cleanTitle}`;
  }

  function humanizeGlpiEntityName(value) {
    return String(value || "item")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function extractProjectName(workItemUrl) {
    if (!workItemUrl) return "";

    try {
      const url = new URL(workItemUrl);
      const segments = url.pathname.split("/").filter(Boolean);
      const workItemIndex = segments.indexOf("_workitems");
      if (workItemIndex > 0) {
        return decodeURIComponent(segments[workItemIndex - 1]);
      }
    } catch (error) {
      console.warn("Failed to extract project name from URL", error);
    }

    const projectField = document.querySelector('input[id*="-Area-input"], input[id*="-Project-input"]');
    if (projectField?.value) return projectField.value.trim();
    return "";
  }

  function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement("div");
      container.id = TOAST_CONTAINER_ID;
      container.className = "azdo-tt-toast-container";
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(message, variant = "default") {
    const container = ensureToastContainer();
    const el = document.createElement("div");
    const classes = ["azdo-tt-toast"];
    if (variant && variant !== "default") classes.push(`azdo-tt-toast-${variant}`);
    el.className = classes.join(" ");
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
})();
