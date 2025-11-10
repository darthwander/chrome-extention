const React = (() => {
  let hooks = [];
  let effects = [];
  let pendingEffects = [];
  let currentHook = 0;
  let isRendering = false;

  const resetHooks = () => {
    currentHook = 0;
  };

  const scheduleRender = null; // placeholder replaced later

  function useState(initialValue) {
    const hookIndex = currentHook;
    hooks[hookIndex] = hooks[hookIndex] ?? initialValue;
    const setState = (value) => {
      const nextValue = typeof value === 'function' ? value(hooks[hookIndex]) : value;
      if (Object.is(nextValue, hooks[hookIndex])) return;
      hooks[hookIndex] = nextValue;
      ReactDOM.__internalRender();
    };
    currentHook += 1;
    return [hooks[hookIndex], setState];
  }

  function useRef(initialValue) {
    const hookIndex = currentHook;
    hooks[hookIndex] = hooks[hookIndex] ?? { current: initialValue };
    currentHook += 1;
    return hooks[hookIndex];
  }

  function depsChanged(prevDeps, deps) {
    if (!prevDeps) return true;
    if (prevDeps.length !== deps.length) return true;
    for (let i = 0; i < deps.length; i += 1) {
      if (!Object.is(prevDeps[i], deps[i])) return true;
    }
    return false;
  }

  function useEffect(effect, deps) {
    const hookIndex = currentHook;
    const prev = effects[hookIndex];
    const shouldRun = depsChanged(prev?.deps, deps);
    if (shouldRun) {
      pendingEffects.push({ index: hookIndex, effect, deps });
    }
    effects[hookIndex] = prev ?? { cleanup: null, deps };
    currentHook += 1;
  }

  function runEffects() {
    pendingEffects.forEach(({ index, effect, deps }) => {
      if (typeof effects[index]?.cleanup === 'function') {
        effects[index].cleanup();
      }
      const cleanup = effect();
      effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null };
    });
    pendingEffects = [];
  }

  function createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat() };
  }

  return {
    createElement,
    useState,
    useEffect,
    useRef,
    __resetHooks: resetHooks,
    __runEffects: runEffects,
  };
})();

const ReactDOM = (() => {
  let rootContainer = null;
  let rootVNode = null;

  function setProp(dom, key, value) {
    if (key === 'children' || key === 'ref') return;
    if (key === 'className') {
      dom.setAttribute('class', value);
      return;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.substring(2).toLowerCase();
      dom.addEventListener(eventName, value);
      return;
    }
    if (value === false || value === null || value === undefined) {
      dom.removeAttribute(key);
      return;
    }
    dom.setAttribute(key, value);
  }

  function createDom(node) {
    if (node === null || node === undefined || typeof node === 'boolean') {
      return document.createComment('');
    }

    if (typeof node === 'string' || typeof node === 'number') {
      return document.createTextNode(String(node));
    }

    if (typeof node.type === 'function') {
      return mountComponent(node.type, node.props);
    }

    const dom = document.createElement(node.type);
    const { props, children } = node;

    Object.entries(props || {}).forEach(([key, value]) => {
      if (key === 'ref' && value && typeof value === 'object') {
        value.current = dom;
        return;
      }
      setProp(dom, key, value);
    });

    children.forEach((child) => {
      const childDom = createDom(child);
      dom.appendChild(childDom);
    });

    return dom;
  }

  function mountComponent(component, props) {
    React.__resetHooks();
    const result = component(props ?? {});
    const dom = createDom(result);
    React.__runEffects();
    return dom;
  }

  function renderRoot() {
    if (!rootContainer || !rootVNode) return;
    while (rootContainer.firstChild) {
      rootContainer.firstChild.remove();
    }
    const dom = createDom(rootVNode);
    rootContainer.appendChild(dom);
    React.__runEffects();
  }

  function createRoot(container) {
    rootContainer = container;
    return {
      render(vnode) {
        rootVNode = vnode;
        renderRoot();
      },
    };
  }

  return {
    createRoot,
    __internalRender: renderRoot,
  };
})();

const { useState, useEffect, useRef } = React;

const mockTask = {
  id: 4523,
  title: 'Endpoint de SVA (partnerSale)',
  startDate: '10/11/2025, 09:58:09',
  project: 'Azure DevOps — Time Tracker',
};

function AzureDevOpsTimeTracker() {
  const [task] = useState(mockTask);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuRef.current]);

  const toggleMenu = () => setIsMenuOpen((prev) => !prev);

  const handleStopExecution = () => {
    console.log('Parar execução acionado para a tarefa', task.id);
  };

  const handleAction = (action) => {
    console.log(`Ação selecionada: ${action}`);
    setIsMenuOpen(false);
  };

  return (
    React.createElement(
      'div',
      { className: 'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl' },
      React.createElement(
        'header',
        { className: 'mb-6 flex items-center justify-between' },
        React.createElement(
          'div',
          null,
          React.createElement(
            'p',
            { className: 'text-xs font-semibold uppercase tracking-wider text-slate-500' },
            'Azure DevOps — Time Tracker'
          ),
          React.createElement(
            'h1',
            { className: 'text-2xl font-semibold text-slate-900' },
            'Tarefa em execução'
          )
        ),
        React.createElement(
          'div',
          { className: 'relative', ref: menuRef },
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: toggleMenu,
              className:
                'menu-button flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-azure-100 hover:bg-azure-50 hover:text-azure-600 focus:outline-none focus:ring-2 focus:ring-azure-500',
              'aria-label': 'Abrir menu de ações',
            },
            '⋮'
          ),
          isMenuOpen &&
            React.createElement(
              'div',
              {
                className:
                  'menu-panel absolute right-0 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg',
              },
              React.createElement(
                'button',
                {
                  className:
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-azure-50 hover:text-azure-700',
                  onClick: () => handleAction('Atualizar'),
                  type: 'button',
                },
                React.createElement('span', { className: 'text-lg' }, '🔄'),
                'Atualizar'
              ),
              React.createElement(
                'button',
                {
                  className:
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-azure-50 hover:text-azure-700',
                  onClick: () => handleAction('Exportar CSV'),
                  type: 'button',
                },
                React.createElement('span', { className: 'text-lg' }, '📤'),
                'Exportar CSV'
              ),
              React.createElement(
                'button',
                {
                  className:
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-azure-50 hover:text-azure-700',
                  onClick: () => handleAction('Limpar Logs'),
                  type: 'button',
                },
                React.createElement('span', { className: 'text-lg' }, '🧹'),
                'Limpar Logs'
              ),
              React.createElement(
                'button',
                {
                  className:
                    'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-azure-50 hover:text-azure-700',
                  onClick: () => handleAction('Abrir lista em nova aba'),
                  type: 'button',
                },
                React.createElement('span', { className: 'text-lg' }, '🗂️'),
                'Abrir lista em nova aba'
              )
            )
        )
      ),
      React.createElement(
        'section',
        { className: 'space-y-4' },
        React.createElement(
          'div',
          { className: 'rounded-xl border border-slate-200 bg-slate-50 p-4' },
          React.createElement(
            'p',
            { className: 'text-sm font-semibold text-azure-600' },
            `#${task.id} — ${task.title}`
          ),
          React.createElement(
            'p',
            { className: 'mt-2 text-sm text-slate-600' },
            `Iniciado em ${task.startDate}`
          ),
          React.createElement(
            'p',
            { className: 'mt-2 text-sm text-slate-500' },
            `Projeto: ${task.project}`
          )
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: handleStopExecution,
            className:
              'flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2',
          },
          React.createElement('span', { className: 'text-lg' }, '⏹️'),
          'Parar Execução'
        )
      ),
      React.createElement(
        'footer',
        { className: 'mt-6 text-center text-xs text-slate-400' },
        'Logs e ações adicionais disponíveis no menu.'
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(AzureDevOpsTimeTracker));
