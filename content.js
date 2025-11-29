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
      btn = document.createElement('button');
      btn.id = BUTTON_ID;
      btn.type = 'button';
      btn.className = 'azdo-tt-btn';
      btn.textContent = 'Track time';
      btn.addEventListener('click', onClick);
      context.anchor.appendChild(btn);
    } else if (btn.parentElement !== context.anchor) {
      context.anchor.appendChild(btn);
    }
  }

  function onClick() {
    const item = currentContext?.extractItem();
    if (!item) {
      toast('Não foi possível identificar o Work Item.', 'error');
      return;
    }

    chrome.runtime.sendMessage({ type: 'startOrStopForItem', item }, (res) => {
      if (!res?.ok) {
        toast('Erro: ' + (res?.error || 'desconhecido'), 'error');
        return;
      }
      if (res.action === 'started') toast(`Iniciado: #${item.id} — ${item.title}`, 'start');
      if (res.action === 'stopped') toast(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`, 'stop');
    });
  }

  function getInjectionContext() {
    const azureHeader = document.querySelector('.work-item-form-header');
    if (azureHeader) {
      const anchorContainer = azureHeader.querySelector('#jibble-button')?.parentElement
        || azureHeader.querySelector('.wif-comment-count-link')?.parentElement
        || azureHeader.querySelector('.flex-row');

      if (anchorContainer) {
        return { anchor: anchorContainer, extractItem: extractAzureWorkItem };
      }
    }

    if (isGlpiTicketPage()) {
      const anchor = findGlpiAnchor();
      if (anchor) {
        return { anchor, extractItem: extractGlpiWorkItem };
      }
    }

    return null;
  }

  function extractAzureWorkItem() {
    const idLink = document.querySelector('.work-item-form-header a[href*="/_workitems/edit/"]');
    let id = null;
    let url = null;
    if (idLink) {
      const match = idLink.getAttribute('href').match(/\/edit\/(\d+)/);
      if (match) id = match[1];
      url = new URL(idLink.getAttribute('href'), location.origin).href;
    }

    const titleInput = document.querySelector('.work-item-title-textfield input');
    const title = titleInput ? titleInput.value : '';

    if (!id || !title) return null;

    const projectName = extractProjectName(url);
    const captureType = 'azure_devops';

    return { id, title, url, projectName, captureType };
  }

  function isGlpiTicketPage() {
    if (window.location.pathname.includes('/front/ticket.form.php')) return true;
    if (window.location.pathname.includes('/front/change.form.php')) return true;
    if (document.querySelector('meta[content*="GLPI"]')) return true;
    return false;
  }

  function findGlpiAnchor() {
    const navbar = document.querySelector('.navbar.navbar-expand-md');
    if (navbar) {
      const navActions = navbar.querySelector('.nav.navbar-nav') || navbar.querySelector('.navbar-nav');
      if (navActions) return navActions;
    }

    const preferred = document.querySelector('.timeline-header.d-flex');
    if (preferred) return preferred;

    const pageHeader = document.querySelector('.page-header, .header-title');
    if (pageHeader) return pageHeader;

    let fallback = document.getElementById(GLPI_FLOATING_CONTAINER_ID);
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.id = GLPI_FLOATING_CONTAINER_ID;
      Object.assign(fallback.style, {
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: '2147483647',
      });
      document.body.appendChild(fallback);
    }
    return fallback;
  }

  function extractGlpiWorkItem() {
    const url = window.location.href;
    const searchParams = new URLSearchParams(window.location.search);
    let id = searchParams.get('id');

    if (!id) {
      const altId = document.querySelector('input[name="id"], input[name="tickets_id"], input[name="items_id"]');
      if (altId?.value) id = altId.value.trim();
    }

    const pageTitle = (document.querySelector('title')?.textContent || '').trim();
    const headerTitle = document.querySelector('.card-title.card-header, .page-title, h1, h2')?.textContent?.trim();
    const baseTitle = pageTitle || headerTitle || '';
    const title = baseTitle || (id ? `Ticket ${id}` : '');

    if (!id || !title) return null;

    return {
      id,
      title,
      url,
      projectName: 'GLPI',
      captureType: 'glpi',
    };
  }

  function extractProjectName(workItemUrl) {
    if (!workItemUrl) return '';

    try {
      const url = new URL(workItemUrl);
      const segments = url.pathname.split('/').filter(Boolean);
      const workItemIndex = segments.indexOf('_workitems');
      if (workItemIndex > 0) {
        return decodeURIComponent(segments[workItemIndex - 1]);
      }
    } catch (error) {
      console.warn('Failed to extract project name from URL', error);
    }

    const projectField = document.querySelector('input[id*="-Area-input"], input[id*="-Project-input"]');
    if (projectField && projectField.value) {
      return projectField.value.trim();
    }

    return '';
  }

  function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = TOAST_CONTAINER_ID;
      container.className = 'azdo-tt-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(message, variant = 'default') {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    const classes = ['azdo-tt-toast'];
    if (variant && variant !== 'default') classes.push(`azdo-tt-toast-${variant}`);
    el.className = classes.join(' ');
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
})();
