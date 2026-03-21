# Rastreador de Tempo (Extensão para Chrome)

Esta extensão permite que você rastreie o tempo gasto em itens de trabalho de várias plataformas, fornecendo uma solução de gerenciamento de tempo simples e integrada.

## Funcionalidades

- **Rastreamento de Tempo Contínuo**:
  - Inicie e pare de rastrear o tempo com um único clique.
  - Para automaticamente a tarefa atual quando você inicia uma nova.

- **Integrações**:
  - **Azure DevOps**: Injeta um botão "Rastrear tempo" diretamente nos formulários de item de trabalho.
  - **GLPI**: Adiciona um botão "Rastrear tempo" aos formulários de chamado e mudança.
  - **HeyGestor**:
    - Envia os registros de tempo concluídos para sua conta HeyGestor.
    - Busca e exibe as tarefas pendentes do dia.

- **Interface Popup**:
  - Veja a tarefa em execução e sua duração.
  - Veja uma lista de registros de tempo recentes.
  - Inicie/pare o cronômetro manualmente.
  - Acesse um menu com ações adicionais:
    - **Atualizar**: Recarrega os dados de rastreamento.
    - **Exportar**: Baixe os registros de tempo em formato XLSX ou JSON.
    - **Importar**: Importe registros de tempo de um arquivo JSON ou XLSX.
    - **Limpar Registros**: Apaga todos os dados de rastreamento de tempo armazenados.
    - **Ver Log Completo**: Abre a página de opções detalhadas.

- **Gerenciamento de Dados**:
  - **Exportar**: Salve seus registros de tempo como arquivos XLSX ou JSON para relatórios ou backup.
  - **Importar**: Adicione registros de tempo de arquivos externos.
  - **Armazenamento Local**: Todos os dados são armazenados de forma segura no armazenamento local do seu navegador.

- **Visualização Detalhada de Logs e Gráficos (Página de Opções)**:
  - Uma visão abrangente de todos os seus registros de tempo.
  - **Linha do Tempo**: Uma representação visual do seu trabalho ao longo do dia.
  - **Gráfico de Pizza por Projeto**: Veja a distribuição do seu tempo entre diferentes projetos.

## Como Funciona

1.  **Instalação**: Carregue a extensão no modo de desenvolvedor em seu navegador.
2.  **Configuração**: Abra o popup da extensão ou a página de opções para configurar suas credenciais do HeyGestor (email e senha).
3.  **Rastreamento**:
    - Navegue para uma plataforma suportada (como um item de trabalho do Azure DevOps ou um chamado do GLPI).
    - Clique no botão **Rastrear tempo** injetado pela extensão para iniciar ou parar o cronômetro.
    - Alternativamente, use o popup para gerenciar seu rastreamento de tempo.
4.  **Visualização e Exportação**:
    - Clique no ícone da extensão para abrir o popup para uma visão geral rápida.
    - Vá para a página de opções para um registro detalhado, visualização da linha do tempo e para exportar seus dados.

## Instalação (Modo de Desenvolvedor)

1.  Abra o Chrome e vá para `chrome://extensions`.
2.  Ative o **Modo de desenvolvedor**.
3.  Clique em **Carregar sem compactação** e selecione a pasta que contém os arquivos da extensão.
4.  A extensão será instalada e estará pronta para uso.

## Integração com o HeyGestor

- **Autenticação**: A extensão requer que seu email and senha do HeyGestor sejam configurados na seção de perfil do popup ou da página de opções. Ela se autentica com a API do HeyGestor para obter um token.
- **Envio de Logs**: Na página de opções, você pode clicar em **Enviar para o Hey Gestor** para enviar todos os registros de tempo finalizados (não "em andamento") para o endpoint `/work-logs/import`.
- **Busca de Tarefas**: O popup busca e exibe automaticamente as tarefas pendentes atribuídas a você no HeyGestor para o dia atual, permitindo que você comece a rastreá-las rapidamente.

## Seletores Utilizados

A extensão usa os seguintes seletores de CSS para encontrar onde injetar o botão "Rastrear tempo". Se a interface do usuário da plataforma de destino mudar, estes podem precisar ser atualizados em `content.js`.

- **Azure DevOps**:
  - ID: `a[href*="/_workitems/edit/"]` (usando regex `/edit/(\d+)`)
  - Título: `.work-item-title-textfield input`

- **GLPI**:
  - A extensão procura por vários elementos nos formulários de chamado e mudança para encontrar um ponto de ancoragem adequado para o botão.

## Permissões

- `storage`: Para salvar registros de tempo e configurações do usuário localmente.
- `activeTab`: Para interagir com a aba atualmente aberta.
- `host_permissions`: Para acessar os domínios configurados para Azure DevOps, GLPI, etc., e injetar o script de conteúdo.
