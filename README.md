# Time Tracker para Chrome

Extensao Chrome para rastrear tempo em itens de trabalho, centralizar os registros localmente e sincronizar os lancamentos com o HeyGestor.

## O que a extensao faz

- Injeta o botao `Track time` em paginas suportadas do Azure DevOps e do GLPI.
- Mantem apenas uma tarefa em andamento por vez.
- Salva historico e estado atual em `chrome.storage.local`.
- Cria e atualiza work logs no HeyGestor automaticamente.
- Exibe tarefas pendentes do dia no HeyGestor para iniciar o tracking direto pelo popup.
- Permite lancamento manual para atividades do projeto fixo `Reunioes`.
- Exporta os registros para `XLSX` e `JSON`.
- Importa registros de arquivos `XLSX` e `JSON`, com validacao de datas e conflito de horarios.
- Oferece uma pagina de opcoes com filtros, metricas e lista consolidada dos registros.

## Plataformas suportadas

### Azure DevOps

- Detecta work items em paginas `dev.azure.com` e `*.visualstudio.com`.
- Extrai ID, titulo, URL e projeto.
- Injeta o botao de tracking no cabecalho do work item.

### GLPI

- Suporta paginas como `ticket.form.php`, `change.form.php` e outros formularios em `/front/*.form.php`.
- Tenta identificar o item atual pelo `id`, titulo da pagina e tipo da entidade.
- Prefixa os titulos com o tipo identificado, como `Incidente`, `Problema` e `Mudanca`.

### HeyGestor

- Exige email e senha salvos na extensao.
- Faz login na API e reaproveita o token salvo quando possivel.
- Cria um work log remoto assim que uma tarefa e iniciada.
- Atualiza o work log remoto ao encerrar a tarefa.
- Busca tarefas pendentes do dia atual.
- Permite reenvio manual dos registros finalizados que ficaram pendentes.

## Fluxos disponiveis

### Popup

O popup tem cinco areas principais:

- `Status`: mostra a tarefa em andamento e permite encerra-la.
- `Ultimos registros`: mostra os registros recentes e permite reiniciar um registro encerrado.
- `Tarefas disponiveis hoje`: lista tarefas pendentes do HeyGestor e inicia o tracking com um clique.
- `Lancamento manual`: inicia um registro manual no projeto `Reunioes`.
- `Importar registro`: importa arquivos exportados anteriormente.

No menu de acoes do popup tambem e possivel:

- atualizar os dados;
- exportar em `XLSX`;
- exportar em `JSON`;
- limpar os logs locais;
- abrir a lista completa;
- editar email e senha.

### Pagina de opcoes

A pagina `options.html` funciona como dashboard local da extensao e inclui:

- metricas de tempo total, quantidade de registros, tarefas em andamento e projeto dominante;
- filtros por texto, projeto, origem e intervalo de datas;
- atalhos rapidos para `Hoje`, `Semana` e `Mes`;
- tabela consolidada com ordenacao por coluna;
- resumo por projeto;
- resumo de atividade por dia;
- acao para exportar `XLSX`;
- acao para limpar logs;
- acao para enviar pendencias ao HeyGestor;
- formulario para salvar email e senha do HeyGestor.

## Regras importantes de funcionamento

- A extensao exige email e senha configurados antes de iniciar qualquer tracking.
- Ao iniciar uma nova tarefa, a tarefa atual e encerrada antes.
- Registros encerrados que falharem no envio para o HeyGestor ficam marcados como pendentes.
- A importacao rejeita arquivos sem as colunas obrigatorias.
- A importacao rejeita datas invalidas.
- A importacao rejeita periodos com inicio maior ou igual ao fim.
- A importacao rejeita conflitos de horario entre registros importados.
- A importacao rejeita conflitos com registros ja existentes ou com a tarefa atual.

## Estrutura dos dados exportados

Os arquivos exportados carregam, no minimo, estas colunas:

- `ID`
- `Titulo`
- `Projeto`
- `Origem`
- `Inicio`
- `Fim`
- `Duracao (s)`
- `URL`

O formato `JSON` exporta `rows` com a mesma estrutura base usada pela extensao.

## Instalacao em modo desenvolvedor

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta deste projeto.

## Permissoes usadas

- `storage`: salva credenciais, tarefa atual e historico local.
- `activeTab`: interacao com a aba ativa.
- `host_permissions`: `https://dev.azure.com/*`, `https://*.visualstudio.com/*`, `*://*/glpi/*`, `*://*/front/*.form.php*`, `http://localhost:8000/*` e `https://heygestor.on-forge.com/*`.

## Arquivos principais

- `manifest.json`: configuracao da extensao e permissoes.
- `content.js`: injecao do botao e extracao de dados das paginas suportadas.
- `background.js`: estado do tracking, importacao/exportacao e integracao com o HeyGestor.
- `popup.html` e `popup.js`: interface rapida da extensao.
- `options.html` e `options.js`: dashboard e gestao detalhada dos registros.
- `exporter.js`: geracao do arquivo `XLSX`.

## Estrutura do projeto

- O projeto atualmente nao depende de `npm` para instalacao ou execucao.
- Basta carregar a pasta da extensao no Chrome em modo desenvolvedor.
- Nao ha etapa de build, bundling ou vendor manual no estado atual do repositorio.

## Limitacoes atuais

- Nao ha pipeline de testes automatizados configurado no projeto.
- O envio para o HeyGestor depende de correspondencia de nome de projeto entre o registro local e os projetos retornados pela API.
- A extensao foi desenhada para os layouts atualmente tratados em `content.js`; mudancas de interface no Azure DevOps ou no GLPI podem exigir ajuste de seletores.
