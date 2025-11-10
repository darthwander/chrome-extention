(function () {
  const BUTTON_ID = "azdo-time-tracker-btn";

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
      toast('Não foi possível identificar o Work Item.', true);
      return;
    }

    chrome.runtime.sendMessage({ type: 'startOrStopForItem', item }, (res) => {
      if (!res?.ok) {
        toast('Erro: ' + (res?.error || 'desconhecido'), true);
        return;
      }
      if (res.action === 'started') toast(`Iniciado: #${item.id} — ${item.title}`);
      if (res.action === 'stopped') toast(`Encerrado: #${res.stopped?.id} — ${res.stopped?.title}`);
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

  function toast(message, isError = false) {
    let el = document.createElement('div');
    el.className = 'azdo-tt-toast' + (isError ? ' azdo-tt-toast-error' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }
})();
