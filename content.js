(function () {
  const BUTTON_ID = "azdo-time-tracker-btn";
  const TOAST_CONTAINER_ID = "azdo-tt-toast-container";

  const observer = new MutationObserver(() => {
    tryInject();
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  function tryInject() {
    if (document.getElementById(BUTTON_ID)) return;

    const context = detectContext();
    if (!context) return;

    const btn = createButton();
    context.attach(btn);
  }

  function detectContext() {
    const azureContext = getAzureDevOpsContext();
    if (azureContext) return azureContext;

    const glpiContext = getGlpiContext();
    if (glpiContext) return glpiContext;

    return null;
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'azdo-tt-btn';
    btn.textContent = 'Track time';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function getAzureDevOpsContext() {
    const header = document.querySelector('.work-item-form-header');
    if (!header) return null;

    const anchorContainer = header.querySelector('#jibble-button')?.parentElement
      || header.querySelector('.wif-comment-count-link')?.parentElement
      || header.querySelector('.flex-row');

    if (!anchorContainer) return null;

    return {
      type: 'azure_devops',
      attach(button) {
        anchorContainer.appendChild(button);
      },
    };
  }

  function getGlpiContext() {
    const headers = document.querySelectorAll('.timeline-header');
    for (const header of headers) {
      const next = header.nextElementSibling;
      const isMainCardHeader = next?.classList?.contains('card-title') && next?.classList?.contains('card-header');
      if (!isMainCardHeader) continue;

      return {
        type: 'glpi',
        attach(button) {
          const wrapper = document.createElement('div');
          wrapper.className = 'azdo-tt-glpi-wrapper';
          wrapper.appendChild(button);
          const dropdown = header.querySelector('.timeline-item-buttons');
          if (dropdown) {
            header.insertBefore(wrapper, dropdown);
          } else {
            header.appendChild(wrapper);
          }
        },
      };
    }

    return null;
  }

  function onClick() {
    const item = extractWorkItem();
    if (!item) {
      toast('Não foi possível identificar o item.', 'error');
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

  function extractWorkItem() {
    const azure = extractAzureDevOpsWorkItem();
    if (azure) return azure;

    const glpi = extractGlpiTicket();
    if (glpi) return glpi;

    return null;
  }

  function extractAzureDevOpsWorkItem() {
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

  function extractGlpiTicket() {
    const titleEl = document.querySelector('.card-title.card-header');
    const rawTitle = titleEl ? normalizeWhitespace(titleEl.textContent) : '';
    const id = extractGlpiId();

    if (!id && !rawTitle) return null;

    const title = buildGlpiTitle(rawTitle, id);
    if (!title || !id) return null;

    const captureType = 'glpi';
    return {
      id,
      title,
      url: location.href,
      projectName: 'GLPI',
      captureType,
    };
  }

  function buildGlpiTitle(rawTitle, id) {
    const safeTitle = rawTitle || '';
    if (!safeTitle && id) return `Ticket ${id}`;
    if (!id) return safeTitle;
    if (safeTitle.includes(id)) return safeTitle;
    return `${safeTitle} (${id})`;
  }

  function extractGlpiId() {
    const url = new URL(location.href);
    const urlId = url.searchParams.get('id');
    if (urlId) return urlId;

    const hiddenInput = document.querySelector('input[name="id"][value]');
    if (hiddenInput?.value) return hiddenInput.value;

    const titleEl = document.querySelector('.card-title.card-header');
    const titleText = titleEl ? titleEl.textContent : '';
    const matchFromTitle = titleText.match(/\((\d+)\)/);
    if (matchFromTitle) return matchFromTitle[1];

    const anyLink = document.querySelector('a[href*="ticket.form.php?id="]');
    if (anyLink) {
      try {
        const linkUrl = new URL(anyLink.href, location.origin);
        const linkId = linkUrl.searchParams.get('id');
        if (linkId) return linkId;
      } catch (error) {
        console.warn('Failed to parse GLPI link URL', error);
      }
    }

    return null;
  }

  function normalizeWhitespace(text = '') {
    return text.replace(/\s+/g, ' ').trim();
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
