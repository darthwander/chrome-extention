Objetivo:
Capturar automaticamente informações de um incidente exibido no BMC Helix Smart IT.

Instruções:

1. Analise a DOM completamente após o carregamento da página.

2. Identifique e extraia os seguintes campos:

- incident_number:
  Número do incidente no formato:
  INC000000000000
  Utilize regex:
  INC\d+

- creation_date:
  Data/hora de criação do incidente.
  Procure campos rotulados como:
  "Created Date"
  "Submit Date"
  "Reported Date"
  "Data de Criação"

- description:
  Descrição completa informada pelo usuário na abertura do incidente.
  Procure seções rotuladas como:
  "Description"
  "Detailed Description"
  "Issue Description"
  "Resumo do Problema"
