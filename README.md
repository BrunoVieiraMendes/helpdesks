# Help Desk

Sistema de atendimento com fila de chamados, inspirado no Movidesk: catálogo de serviços que encaminha cada chamado para uma equipe, portal do cliente, fila em Lista e Kanban com drag and drop, timeline com respostas públicas e notas internas, painel de administração e registro de SLA.

Stack igual à do Cryptotrade: Node.js + Express + MongoDB (Mongoose) + Passport JWT + Bull (Redis) + Nodemailer + Winston + Swagger. As telas usam EJS com JavaScript puro, sem framework de frontend.

## Requisitos

- Node.js 18+
- MongoDB
- Redis (opcional: filas com novas tentativas de envio e o fechamento automático)

## Instalação

```bash
npm install
cp .env.example .env      # ajuste MONGO_URL, REDIS_URL, JWT_SECRET_KEY...
npm run db:indices        # cria os índices declarados nos schemas
npm run seed              # usuários, categorias e chamados de exemplo
```

## Como rodar

```bash
npm run dev               # desenvolvimento (nodemon)
npm start                 # produção
npm run maildev           # opcional: caixa de e-mails em http://localhost:1080
```

Acesse http://localhost:3000. A documentação da API fica em http://localhost:3000/v1/docs.

Sem Redis? Use `WORKERS_ATIVOS=false` no `.env`. Tudo continua funcionando, inclusive os e-mails (enviados direto, em segundo plano); só o fechamento automático fica parado.

## Usuários de teste (senha `helpdesk123`)

| E-mail              | Papel                       |
| ------------------- | --------------------------- |
| admin@helpdesk.com  | Admin                       |
| ana@helpdesk.com    | Agente (Suporte, Auditoria) |
| carlos@helpdesk.com | Agente (TI, Suporte)        |
| joao@cliente.com    | Cliente                     |
| maria@cliente.com   | Cliente                     |

## Telas

| Rota                         | Quem acessa                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `/login`                     | todos                                                                                        |
| `/inicio`                    | equipe: página Início (contadores, bandeiras de alerta, mural de avisos, indicadores do dia) |
| `/relatorios`                | equipe: indicadores e relatórios (visão geral, SLA, equipes e agentes, satisfação, CSV)      |
| `/portal`                    | cliente: Meus Chamados                                                                       |
| `/chamados/novo`             | todos: catálogo de serviços + formulário. A equipe pode abrir em nome de um cliente          |
| `/agente`                    | equipe: Lista com filtros combinados (ficam salvos na URL)                                   |
| `/agente/quadro`             | equipe: quadro de chamados (arrastar e soltar entre status)                                  |
| `/chamados/:numero`          | chamado no layout do Movidesk: painel Público/Interno, editor de ações e histórico           |
| `/admin`                     | admin: painel de configurações (busca, visão por grupo ou A-Z, números da conta)             |
| `/admin/configuracoes#secao` | admin: cada cadastro/parâmetro (pessoas, empresas, equipes, SLA, macros...)                  |

A navegação fica no **menu lateral** de ícones. Para a equipe, os chamados e as configurações abertos viram **abas** no topo (o **+** abre um novo chamado, a fila ou as configurações).

## Indicadores e relatórios

Em `/relatorios` (ícone de gráfico no menu lateral), sempre dentro do que o usuário pode ver:

- **Filtros numa linha:** período (hoje, 7/30/90 dias, este mês, mês passado ou personalizado, até 366 dias), equipe, serviço, agente e urgência. Ficam na URL, então dá para compartilhar o link.
- **Visão geral:** abertos e resolvidos (com variação contra o período anterior), em aberto agora, tempos médios de 1ª resposta e de solução, SLA cumprido e satisfação; gráfico por dia (por semana acima de 62 dias), fila por status, distribuição por urgência, serviço, equipe e categoria, e mapa de calor de dia da semana x hora.
- **SLA:** solução no prazo por semana e por urgência (com a meta configurada).
- **Equipes e agentes:** desempenho por equipe e ranking de agentes (ordenável).
- **Satisfação:** nota média, CSAT (notas 4 e 5), taxa de resposta, distribuição das notas e comentários.
- **Relatório de chamados:** lista paginada (abertos ou resolvidos no período) e **exportação CSV** para o Excel.

**Exportação para CSV** (ponto e vírgula, UTF-8 com BOM e vírgula decimal: abre direto no Excel em português), sempre com o período e os filtros da tela:

- **Exportar indicadores (CSV)**, no topo da página, gera um único arquivo com uma seção por indicador: filtros aplicados, resumo (com o período anterior), série diária, fila por status, distribuição por urgência/serviço/equipe/categoria, mapa de calor, SLA por semana e por urgência, equipes, agentes, notas de satisfação e comentários. API: `GET /v1/relatorios/indicadores.csv`.
- O botão **CSV** de cada quadro baixa só os dados daquele quadro (a mesma tabela do "Ver tabela").
- No **Relatório de chamados**, o CSV traz um chamado por linha (até 10.000). API: `GET /v1/relatorios/chamados.csv`.

Todo gráfico tem tooltip e o botão **Ver tabela**. O acesso depende da permissão "Ver indicadores e relatórios" do perfil de acesso (liberada por padrão).

Para ver os gráficos cheios num banco de teste, `npm run demo:relatorios` cria 400 chamados históricos com a tag "Demonstração" (`npm run demo:relatorios -- --quantidade 800 --dias 180` para mais; `npm run demo:relatorios -- --remover` apaga todos). Não roda com `NODE_ENV=production`.

## E-mail

Em **Configurações > E-mail** (só admin):

- **Envio (SMTP).** Conta usada para os avisos. Há atalhos para Gmail e Outlook/Microsoft 365, e o botão **Testar envio**. Enquanto essa conta não estiver ativada, valem as variáveis `EMAIL_*` do `.env` (por exemplo, o maildev em desenvolvimento).
- **Avisos**, cada um com uma chave para ligar ou desligar:
  - novo chamado para cada agente da equipe;
  - confirmação de abertura para o cliente;
  - resposta da equipe para o cliente (inclusive a resposta de solução);
  - resposta do cliente para o responsável.
- **Chamados por e-mail (IMAP).** O Help Desk lê a caixa de entrada no intervalo configurado, ou na hora, com **Verificar caixa agora**. O que acontece com cada mensagem:
  - E-mail **sem** `[#número]` no assunto abre um chamado no **serviço padrão**, e a descrição é o texto do e-mail. O chamado mostra "Ticket aberto via e-mail".
  - Resposta com `[#1024]` no assunto, de quem pode ver o chamado, entra como resposta no chamado. Só a parte nova é gravada: o histórico citado ("Responda acima desta linha", "Em ..., Fulano escreveu:", linhas com `>`) é cortado.
  - Remetente sem cadastro é cadastrado como cliente automaticamente. Isso pode ser desligado; nesse caso o e-mail é ignorado.
  - Os e-mails enviados aos clientes saem com **Responder para** a caixa de atendimento. Assim, basta o cliente responder.
  - Para não criar laços, são **ignorados**: respostas automáticas (férias), devoluções (mailer-daemon), e-mails em massa, e-mails do próprio Help Desk e e-mails de agentes sem número de chamado. Os e-mails enviados saem marcados como automáticos.
  - Cada mensagem é processada **uma vez só**, pelo Message-ID. O **log dos e-mails recebidos** mostra o resultado de cada uma por 90 dias.
  - **Simular e-mail recebido** processa um e-mail colado, para testar sem uma caixa real.
- As senhas das contas ficam **criptografadas** no banco (AES-256-GCM, chave `CHAVE_CRIPTOGRAFIA` do `.env`) e nunca voltam para a tela.
- `LEITURA_DE_EMAIL=false` desliga a leitura automática.
- Anexos ainda não são importados. O chamado registra quantos havia.

## WhatsApp

Atendimento pela **API oficial do WhatsApp (Meta, WhatsApp Cloud API)**, sem risco de bloqueio do número. Configure em **Configurações > WhatsApp** (só admin). A tela traz o passo a passo.

**O que é preciso na Meta**

1. Um app do tipo _Empresa_ em developers.facebook.com, com o produto WhatsApp.
2. Um número dedicado. Ele não pode estar ativo no aplicativo do celular.
3. Os dados que a tela pede:
   - a identificação do número de telefone;
   - um **token permanente**, gerado por um usuário do sistema com a permissão `whatsapp_business_messaging`. O token temporário do painel vale só 24 horas;
   - a **chave secreta do app**.
4. O webhook cadastrado com a URL e o token de verificação que a tela mostra, com o campo `messages` assinado.
   - Endereço: `https://SEU-DOMINIO/v1/whatsapp/webhook`. A Meta só entrega avisos para um endereço público com HTTPS. Para testar localmente, use um túnel (ngrok, por exemplo).

**Como funciona**

- **Cliente escreve.** A mensagem abre um chamado no **serviço padrão**, com o título tirado da primeira linha, e o chamado mostra "Ticket aberto via WhatsApp". O cliente recebe na hora o número do chamado.
- **Cliente escreve de novo.** Enquanto o chamado não for fechado, as novas mensagens entram nele, marcadas "via WhatsApp". Se o chamado estava Resolvido ou Pendente, volta para Em Atendimento. Depois de fechado, uma nova mensagem abre outro chamado.
- **Número sem cadastro.** Vira cliente automaticamente, com o nome do perfil do WhatsApp. Isso pode ser desligado; nesse caso a mensagem é ignorada.
- **Número cadastrado.** Em **Pessoas**, o campo **WhatsApp** liga o número a um cliente. Pode ser digitado com DDD; o DDI 55 é colocado sozinho. No Brasil, o mesmo celular é reconhecido com ou sem o nono dígito, como a Meta às vezes envia.
- **Resposta da equipe.** Cada resposta pública da equipe, inclusive a resposta de solução, vai para o WhatsApp do cliente. **Notas internas nunca vão.**
- **Regra das 24 horas da Meta.** A empresa só pode mandar mensagem livre até 24 horas depois da última mensagem do cliente. Fora desse prazo:
  - a resposta fica guardada e é entregue assim que o cliente escrever de novo;
  - se houver um **modelo aprovado** configurado (com a variável `{{1}}`, que recebe o número do chamado), ele é enviado para chamar o cliente, no máximo uma vez a cada 24 horas;
  - a equipe é avisada no histórico do chamado.
- **Entrega.** Cada mensagem enviada é acompanhada: enviada, entregue, lida ou falhou. Uma falha, como um token vencido ou um número sem WhatsApp, é explicada em português no **log de mensagens** e aparece no histórico do chamado. O cliente não vê esse aviso.
- **Segurança.** O webhook só aceita avisos com a assinatura `X-Hub-Signature-256` feita com a chave secreta do app. O token e a chave ficam **criptografados** no banco, como as senhas de e-mail.
- **Mensagens repetidas.** Cada mensagem é processada uma vez só, mesmo que a Meta reenvie o aviso.
- **Anexos.** Fotos, áudios e documentos entram no chamado como um aviso ("o cliente enviou uma imagem"), com a legenda. O arquivo não é importado.
- **Testes.**
  - **Testar conexão** confere o token e o número na Meta.
  - **Simular mensagem recebida** abre um chamado como se a mensagem tivesse chegado, sem precisar da Meta.
  - A variável `WHATSAPP_API_URL` troca o endereço da API da Meta. Serve só para testes automatizados com um servidor falso.

## Agentes online

Em **Configurações > Atendimento > Agentes online** (só admin): quem está com o sistema aberto agora.

- **Online:** mexendo no sistema.
- **Ausente:** sistema aberto, mas parado há mais de 5 minutos ou em outra aba.
- **Offline:** sem sinal há mais de 3 minutos, ou saiu do sistema.

A tela mostra os totais de cada situação e, para cada agente, as equipes, os chamados em aberto sob a responsabilidade dele e quando foi visto por último. Ela se atualiza sozinha a cada 20 segundos e tem filtro por equipe.

Como funciona: o navegador de cada agente manda um sinal a cada minuto (`POST /v1/presenca`); ao clicar em **Sair**, o agente fica offline na hora. A lista para o admin está em `GET /v1/presenca`. O sinal não altera a data de atualização do cadastro, e a presença não aparece nas outras listagens de usuários.

## Notificações

O **sino** na barra do topo (agentes e admins) avisa quando um chamado é **aberto** ou **transferido** para uma equipe da qual a pessoa faz parte. Quem fez a ação não recebe o próprio aviso.

- Mostra um contador de não lidas, que também aparece no título da aba, por exemplo "(2) Início". Clicar no sino abre a lista das 20 mais recentes, e cada item leva ao chamado.
- A lista é consultada a cada 30 segundos enquanto a aba está visível. O que chega de novo aparece como aviso na tela. Com a aba em segundo plano, aparece como **notificação da área de trabalho**, depois que a pessoa clica em "Ativar notificações na área de trabalho" e permite no navegador.
- Abrir o chamado marca as notificações dele como lidas. Também dá para "Marcar todas como lidas".
- Funciona sem Redis.
- As notificações são apagadas automaticamente depois de 90 dias.
- API: `GET /v1/notificacoes`, `POST /v1/notificacoes/{id}/lida` e `POST /v1/notificacoes/lidas` (aceita `{ chamado }` para marcar só as de um chamado).

## Equipes e serviços

- O **admin** cadastra as **equipes** (ex.: Suporte, TI, Auditoria) e define quem faz parte de cada uma. Um agente pode estar em várias equipes.
- O admin monta o **catálogo de serviços**. Cada serviço aponta para a equipe que o atende.
- Ao abrir um chamado, o cliente escolhe o serviço, e o chamado vai para a fila da equipe correspondente. Os agentes dessa equipe recebem um e-mail.
- **Visibilidade:** o agente vê os chamados das equipes das quais faz parte e os que estão sob sua responsabilidade. O admin vê todos. As mudanças de equipe valem na hora, sem precisar de novo login.
- O responsável precisa ser membro da equipe do chamado. O admin pode atender qualquer equipe.
- **Transferência:** trocar a equipe ou o serviço na barra lateral move o chamado para outra fila. Se o responsável atual não fizer parte da nova equipe, o chamado fica sem responsável. Tudo é registrado na timeline.
- **Remover ou desativar:**
  - equipes, serviços, categorias e usuários sem uso podem ser removidos;
  - quem já tem histórico só pode ser desativado, para a timeline continuar íntegra;
  - uma equipe desativada tira os serviços dela do catálogo.

**Atualizando um banco que já existia:** rode `npm run seed` de novo. Ele cria os cadastros de exemplo que ainda não existem (equipes, serviços, empresas, tags, justificativas, feriados e macros), calcula os prazos de SLA dos chamados antigos e associa cada chamado a uma equipe e à empresa do solicitante. O chamado vai para a equipe do responsável; se não tiver responsável, vai para Suporte. Os usuários e as equipes que você já ajustou não são alterados.

## Configurações (inspiradas no Movidesk)

O painel `/admin` reúne as configurações em cinco grupos: Conta, Pessoas, Chamados, Campos adicionais e Atendimento.

**Sua marca no sistema:** em **Empresa e parâmetros**, o admin envia a **logo da empresa** (PNG, JPG ou WebP). Ela substitui o "HD" no menu lateral, na tela de login e no ícone da aba do navegador. O **nome da empresa** aparece no login e no título das abas.

- Imagens grandes são reduzidas no navegador antes do envio (lado maior até 512 px, máximo de 512 KB).
- A logo fica no banco e é servida em `/marca/logo`.
- SVG não é aceito, porque pode conter código.
- "Voltar ao HD padrão" remove a logo.
- API: `PUT /v1/configuracoes/logo` e `DELETE /v1/configuracoes/logo`.

| Grupo                  | Item                         | O que faz                                                                                    |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| Conta                  | Empresa / Parâmetros         | nome da conta e dias até o fechamento automático de chamados resolvidos                      |
| Conta                  | Mural de avisos              | recados para a equipe (Início) e para os clientes (portal), com validade                     |
| Conta                  | Feriados                     | dias sem expediente (fixos ou recorrentes); botão para importar os nacionais do ano          |
| Pessoas                | Pessoas, Empresas, Equipes   | clientes pertencem a uma empresa; o chamado guarda a empresa do solicitante                  |
| Pessoas                | Perfis de acesso             | permissões de agentes e de clientes (ver abaixo); um perfil padrão por tipo                  |
| Pessoas                | Cargos, Classificações       | cadastros informativos das pessoas (ex.: "Analista de Suporte", "Revenda / Parceiro")        |
| Classificação          | Serviços, Categorias, Status | catálogo, tipos de chamado e o ciclo de status (somente leitura)                             |
| Classificação          | Justificativas               | motivo obrigatório ao mover para um status (ex.: Pendente → "Aguardando cliente")            |
| Classificação          | Tags                         | etiquetas coloridas da equipe (o cliente não vê); dá para filtrar a fila por tag             |
| Campos adicionais      | Campos                       | campos extras do chamado (texto, número, data, sim/não, lista de valores, lista de pessoas)  |
| Campos adicionais      | Regras para exibição         | quando cada campo aparece (serviço, categoria ou valor de outro campo) e se fica obrigatório |
| Acordos / Urgências    | SLA                          | expediente, fuso e prazos de 1ª resposta e solução por urgência, em horas úteis              |
| Automação              | Macros                       | resposta pronta + ações (status, justificativa, prioridade, equipe, atribuir a mim, tags)    |
| Pesquisa de satisfação | Configurações de perguntas   | nota de 1 a 5 estrelas e comentário, pedidos ao cliente quando o chamado é resolvido         |

Todos os cadastros usam a mesma lista: **Id** numérico, contagem de registros, botão **+**, menu **Opções** (habilitar, desabilitar ou remover os selecionados), busca a partir de 3 caracteres, ordenação clicando no cabeçalho e clique na linha para editar. O Id é sequencial por cadastro; registros antigos recebem o seu na inicialização do servidor.

### Campos adicionais e regras para exibição

- Um campo que **nenhuma regra ativa cita aparece sempre**. Se alguma regra o cita, ele só aparece quando uma delas casar com o chamado.
- Uma regra casa quando o serviço, a categoria e o valor do campo da condição batem. Condição em branco vale para qualquer valor. A regra pode tornar os campos obrigatórios.
- O formulário de abertura mostra e esconde os campos ao vivo (a mesma lógica roda em `public/js/campos.js` e em `services/campos-adicionais.js`, e a API valida de novo).
- Campos marcados como **visíveis para o cliente** aparecem na abertura feita pelo cliente e no detalhe do chamado dele. Os demais, e o histórico de alterações dos campos, ficam só com a equipe.
- A equipe edita os campos na barra lateral do chamado; cada alteração vira um evento na timeline.
- Um campo que já foi preenchido em algum chamado não pode mudar de tipo nem ser removido (desabilite).

### Perfis de acesso

Cada agente ou cliente pode ter um perfil. Quem não tem usa o **perfil padrão** do seu tipo; sem perfil padrão, valem as permissões padrão do sistema (`PERMISSOES` em `constants.js`). Administradores têm acesso total e não usam perfil. Mudanças no perfil valem na próxima requisição, sem novo login.

| Perfil de | Permissão                                | Padrão |
| --------- | ---------------------------------------- | ------ |
| Agente    | Abrir chamados em nome de clientes       | sim    |
| Agente    | Alterar a prioridade dos chamados        | sim    |
| Agente    | Transferir chamados de equipe ou serviço | sim    |
| Agente    | Reabrir chamados fechados                | não    |
| Agente    | Aplicar macros                           | sim    |
| Cliente   | Abrir chamados                           | sim    |
| Cliente   | Ver os chamados de toda a sua empresa    | não    |
| Cliente   | Responder a pesquisa de satisfação       | sim    |

A API valida cada permissão (403) e as telas escondem ou desabilitam o que o perfil não libera.

## Regras de negócio

- **Resolver exige resposta:** mudar para Resolvido, ou Fechar um chamado ainda não resolvido, só com uma resposta ao cliente na mesma ação. Na API, é o campo `resposta` do `PATCH /v1/chamados/{numero}`; sem ele, a API devolve 422. No quadro e na tela do chamado, abre uma janela pedindo a resposta. A resposta é publicada no chamado e enviada por e-mail ao cliente. Macros que resolvem usam a própria mensagem pública.
- **Busca rápida:** o campo da barra do topo (atalho `/` ou `Ctrl+K`) acha chamados por número ou assunto. Um número abre o chamado direto.

- **RBAC:** o cliente só vê os próprios chamados (ou os da empresa, se o perfil permitir). Se tentar abrir o de outra pessoa, recebe 404. Agentes veem **somente a fila das suas equipes** (os de outras equipes dão 404) e podem **encaminhar** um chamado para outra equipe, com uma confirmação antes; depois disso deixam de vê-lo. O admin tem acesso total, inclusive para administrar equipes, serviços, pessoas e demais cadastros. O restante do que cada um pode fazer vem do perfil de acesso.
- **Status:** Novo, Em Atendimento, Pendente, Resolvido e Fechado. As transições permitidas estão em `constants.js`. Um chamado não volta para "Novo".
- **Automatismos:**
  - quando a equipe responde um chamado Novo, ele vai para Em Atendimento e quem respondeu vira o responsável;
  - quando o cliente responde um chamado Pendente ou Resolvido, ele volta para Em Atendimento;
  - um chamado Resolvido há mais de N dias (Configurações > Parâmetros; o valor inicial vem de `DIAS_PARA_FECHAMENTO_AUTOMATICO`) é fechado automaticamente.
- **SLA:**
  - `sla.primeiraRespostaEm` guarda a 1ª resposta pública da equipe e nunca é sobrescrita;
  - `sla.resolvidoEm` e `sla.fechadoEm` acompanham o status e são zerados quando o chamado é reaberto;
  - `sla.prazoPrimeiraResposta` e `sla.prazoSolucao` são calculados na abertura, em horário útil (expediente menos feriados), pelo acordo da urgência. Mudar a prioridade recalcula os prazos;
  - em **Pendente** o relógio para: o tempo útil pausado é somado ao prazo de solução quando o chamado sai de Pendente;
  - a fila mostra a situação (no prazo, em risco, vencido, pausado, cumprido) e tem os filtros `?sla=vencido` e `?sla=sem_resposta`.
- **Justificativas:** se o status de destino tiver justificativas ativas, a API exige uma (422). A barra lateral e o Kanban pedem o motivo num diálogo. Mudanças automáticas (ex.: o cliente respondeu) não exigem.
- **Macros:** as ações são aplicadas antes da mensagem; se alguma ação for inválida, nada é gravado. Macros não fecham chamados.
- **Pesquisa de satisfação:** só o solicitante avalia, uma vez, com o chamado Resolvido ou Fechado.
- **Timeline:** cada alteração vira um evento do tipo `sistema`. As notas internas e os eventos de tags são filtrados na própria consulta e nunca chegam ao cliente.
- **Concorrência:** as alterações usam update condicional. Se duas pessoas mudam o mesmo campo ao mesmo tempo, a segunda recebe 409.

## Estrutura

```
app.js              Express, passport, rotas, error handler central
constants.js        status, prioridades, transições, papéis
models/             schemas Mongoose + índices
middlewares/        autentica, autoriza(papéis), carregaChamado (RBAC)
services/           um caso de uso por arquivo
routes/v1/          API REST (documentada com swagger-jsdoc)
routes/paginas.js   páginas EJS
workers/            filas Bull: notificações por e-mail e fechamento automático
emails/             templates EJS de e-mail
views/, public/     telas (EJS + JS puro + CSS)
scripts/            sincronização de índices
```

## Qualidade

```bash
npm run lint
npm run format:check
```
