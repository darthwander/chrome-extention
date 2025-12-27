# Time Tracker (Chrome)

Extensão que injeta um botão em modais de itens de trabalho suportados (como Azure DevOps ou GLPI) para iniciar/encerrar tracking. Ao iniciar uma tarefa, qualquer outra em andamento é automaticamente encerrada.

## Instalação (modo desenvolvedor)
1. Acesse `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta deste projeto.
3. Acesse uma das ferramentas suportadas (ex.: `https://dev.azure.com/sua-org/...`). Abra um item de trabalho.
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

> Caso a ferramenta-alvo altere o DOM, ajuste os seletores em `content.js`.

## Permissões
- `storage`: salvar estado e logs.
- `activeTab` + `host_permissions` para domínios configurados (Azure DevOps, GLPI etc.).

## Limitações
- Atualmente só registra dados com extensão para incidentes de GLPI e Work Items dentro do card do Azure Devops

## Envio manual para Hey Gestor
- No `options.html`, use o botão **Enviar para Hey Gestor** para mandar os registros finalizados para a rota `/work-logs/import`.
- O login é feito automaticamente via `/auth/login`, usando o email e a senha configurados no perfil (a extensão valida o token com `/me` antes de enviar).
