# Azure DevOps Time Tracker (Chrome)

Extensão que injeta um botão no modal de Work Item do Azure DevOps para iniciar/encerrar tracking. Ao iniciar uma tarefa, qualquer outra em andamento é automaticamente encerrada.

## Instalação (modo desenvolvedor)
1. Acesse `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta deste projeto.
3. Acesse o Azure DevOps (ex.: `https://dev.azure.com/sua-org/...`). Abra um Work Item no Board.
4. No modal, clique em **Track time**.

## Funcionamento
- **Track time** no modal:
  - Se não houver tarefa: inicia a atual.
  - Se houver outra tarefa: encerra a antiga e inicia a atual.
  - Se clicar na mesma tarefa: encerra a atual.
- Histórico e status: clique no ícone da extensão (popup) para ver `options.html`.
- Exportar CSV pelo popup.

## Seletores usados
- ID: `a[href*="/_workitems/edit/"]` (regex `/edit/(\d+)`).
- Título: `.work-item-title-textfield input`.

> Caso o Azure DevOps altere o DOM, ajuste os seletores em `content.js`.

## Permissões
- `storage`: salvar estado e logs.
- `activeTab` + `host_permissions` para `dev.azure.com` e `*.visualstudio.com`.

## Limitações
- Somente captura do modal de Work Item.
- Não envia dados para servidor; tudo em `chrome.storage.local`.
