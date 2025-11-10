# Time Tracker (Azure DevOps + GLPI)

Extensão que injeta um botão no modal de Work Item do Azure DevOps e na tela do ticket do GLPI para iniciar/encerrar tracking. Ao iniciar uma tarefa, qualquer outra em andamento é automaticamente encerrada.

## Instalação (modo desenvolvedor)
1. Acesse `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta deste projeto.
3. Acesse o Azure DevOps (ex.: `https://dev.azure.com/sua-org/...`) e abra um Work Item ou acesse o GLPI (`https://seu-glpi/front/ticket.form.php?id=...`).
4. Na tela do item, clique em **Track time**.

## Funcionamento
- **Track time** no modal:
  - Se não houver tarefa: inicia a atual.
  - Se houver outra tarefa: encerra a antiga e inicia a atual.
  - Se clicar na mesma tarefa: encerra a atual.
- Histórico e status: clique no ícone da extensão (popup) para ver `options.html`.
- Exportar CSV pelo popup.

## Seletores usados
### Azure DevOps
- ID: `a[href*="/_workitems/edit/"]` (regex `/edit/(\d+)`).
- Título: `.work-item-title-textfield input`.

### GLPI
- ID: query string `id=` (fallbacks em `input[name="id"]` ou o texto do título).
- Título: `.card-title.card-header`.

> Caso o Azure DevOps ou o GLPI alterem o DOM, ajuste os seletores em `content.js`.

## Permissões
- `storage`: salvar estado e logs.
- `activeTab` + `host_permissions` para `dev.azure.com`, `*.visualstudio.com` e páginas de ticket do GLPI (`*/front/ticket.form.php*`).

## Limitações
- Somente captura do modal de Work Item e da tela de ticket.
- Não envia dados para servidor; tudo em `chrome.storage.local`.
