(function () {
  const BUTTON_ID = "azdo-time-tracker-btn";
  const TOAST_CONTAINER_ID = "azdo-tt-toast-container";

  const observer = new MutationObserver(() => {
    tryInject();
  });

  observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

  function tryInject() {
    const header = document.querySelector('.work-item-form-header');
    if (!header) return;

    if (document.getElementById(BUTTON_ID)) return;

    const anchorContainer = header.querySelector('#jibble-button')?.parentElement
      || header.querySelector('.wif-comment-count-link')?.parentElement
      || header.querySelector('.flex-row');

    if (!anchorContainer) return;

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.className = 'azdo-tt-btn';
    btn.textContent = 'Track time';
    btn.addEventListener('click', onClick);

    anchorContainer.appendChild(btn);
  }

  function onClick() {
    const item = extractWorkItem();
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

  function extractWorkItem() {
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
