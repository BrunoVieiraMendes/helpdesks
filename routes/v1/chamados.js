const express = require('express');

const { autoriza, carregaChamado } = require('../../middlewares');
const {
  criaChamado,
  listaChamados,
  quadroKanban,
  detalhaChamado,
  atualizaChamado,
  assumeChamado,
  listaInteracoes,
  adicionaInteracao,
  aplicaMacro,
  avaliaChamado,
} = require('../../services');
const {
  editaChamadoDoCliente,
  excluiChamadoDoCliente,
} = require('../../services/edita-chamado-cliente');
const { rota } = require('../../utils');
const { PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();
const somenteEquipe = autoriza(...PAPEIS_DA_EQUIPE);

/**
 * @openapi
 * /v1/chamados:
 *   get:
 *     summary: Lista chamados com filtros combinados (paginada)
 *     description: >
 *       Cliente recebe apenas os próprios chamados; agente, os das suas equipes (e os que estão
 *       sob sua responsabilidade); admin, todos. Essa regra é aplicada pela API sempre.
 *       Filtros aceitam vários valores separados por vírgula.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string }, example: 'novo,em_atendimento' }
 *       - { in: query, name: prioridade, schema: { type: string }, example: 'alta,urgente' }
 *       - { in: query, name: responsavel, schema: { type: string }, description: 'id, "eu" ou "nenhum"' }
 *       - { in: query, name: categoria, schema: { type: string } }
 *       - { in: query, name: servico, schema: { type: string } }
 *       - { in: query, name: equipe, schema: { type: string }, description: 'id(s) ou "minhas" (somente equipe)' }
 *       - { in: query, name: solicitante, schema: { type: string }, description: 'somente equipe' }
 *       - { in: query, name: empresa, schema: { type: string }, description: 'somente equipe' }
 *       - { in: query, name: tag, schema: { type: string } }
 *       - { in: query, name: sla, schema: { type: string, enum: [vencido, sem_resposta] }, description: 'vencido = prazo de solução estourado; sem_resposta = 1ª resposta atrasada' }
 *       - { in: query, name: busca, schema: { type: string }, description: 'número (#1024) ou trecho do título' }
 *       - { in: query, name: ordenar, schema: { type: string, enum: [atualizacao, prioridade, recentes, antigos] } }
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: porPagina, schema: { type: integer, default: 20, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Página de chamados
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListaChamadosResponse'
 *       422:
 *         $ref: '#/components/responses/Invalido'
 *   post:
 *     summary: Abre um chamado
 *     description: >
 *       Cliente informa título, descrição e categoria. Agente/admin pode também informar
 *       solicitante (abrir em nome do cliente), prioridade e responsável.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovoChamado'
 *     responses:
 *       201:
 *         description: Chamado criado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChamadoResponse'
 *       422:
 *         $ref: '#/components/responses/Invalido'
 */
router.get(
  '/',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaChamados(req.query, req.user)) });
  }),
);

router.post(
  '/',
  rota(async (req, res) => {
    res.status(201).json({ sucesso: true, chamado: await criaChamado(req.body || {}, req.user) });
  }),
);

/**
 * @openapi
 * /v1/chamados/kanban:
 *   get:
 *     summary: Quadro Kanban (agente/admin)
 *     description: Uma coluna por status com o total e os primeiros chamados (por prioridade). Aceita os mesmos filtros da listagem, exceto status.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: query, name: prioridade, schema: { type: string } }
 *       - { in: query, name: responsavel, schema: { type: string } }
 *       - { in: query, name: categoria, schema: { type: string } }
 *       - { in: query, name: limite, schema: { type: integer, default: 30, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Colunas do Kanban
 *       403:
 *         $ref: '#/components/responses/Proibido'
 */
router.get(
  '/kanban',
  somenteEquipe,
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await quadroKanban(req.query, req.user)) });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}:
 *   get:
 *     summary: Detalhe do chamado
 *     description: Inclui as permissões do usuário logado sobre o chamado. Cliente recebe 404 para chamados de outras pessoas.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     responses:
 *       200:
 *         description: Chamado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChamadoResponse'
 *       404:
 *         description: Chamado não encontrado
 *   patch:
 *     summary: Altera status, prioridade, responsável ou categoria (agente/admin)
 *     description: >
 *       Usado pela barra lateral e pelo drag and drop do Kanban. Cada alteração gera um evento na timeline.
 *       Chamado fechado só pode ser reaberto por admin (status em_atendimento).
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AtualizaChamado'
 *     responses:
 *       200:
 *         description: Chamado atualizado
 *       409:
 *         description: Chamado fechado ou alterado por outra pessoa ao mesmo tempo
 *       422:
 *         description: Transição de status ou valor inválido
 */
router.get(
  '/:numero',
  carregaChamado,
  rota(async (req, res) => {
    res.json({ sucesso: true, chamado: await detalhaChamado(req.chamado._id, req.user) });
  }),
);

router.patch(
  '/:numero',
  somenteEquipe,
  carregaChamado,
  rota(async (req, res) => {
    res.json({
      sucesso: true,
      chamado: await atualizaChamado(req.chamado, req.body || {}, req.user),
    });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}/conteudo:
 *   patch:
 *     summary: Solicitante edita o próprio chamado (só enquanto Novo)
 *     description: >
 *       Título, descrição, serviço (define a equipe), categoria e campos adicionais visíveis ao cliente.
 *       Depois que a equipe começa o atendimento (status diferente de Novo), responde 409.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo: { type: string }
 *               descricao: { type: string }
 *               servico: { type: string }
 *               categoria: { type: string, nullable: true }
 *               camposAdicionais: { type: object, additionalProperties: true }
 *     responses:
 *       200: { description: Chamado atualizado }
 *       403: { description: Não é quem abriu o chamado }
 *       409: { description: Chamado já não está mais Novo }
 */
/**
 * @openapi
 * /v1/chamados/{numero}:
 *   delete:
 *     summary: Solicitante exclui o próprio chamado (só enquanto Novo)
 *     description: Apaga o chamado, a timeline e os avisos do sino. Depois do atendimento começar, responde 409.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     responses:
 *       200: { description: Excluído }
 *       403: { description: Não é quem abriu o chamado }
 *       409: { description: Chamado já não está mais Novo }
 */
router.delete(
  '/:numero',
  carregaChamado,
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await excluiChamadoDoCliente(req.chamado, req.user)) });
  }),
);

router.patch(
  '/:numero/conteudo',
  carregaChamado,
  rota(async (req, res) => {
    res.json({
      sucesso: true,
      chamado: await editaChamadoDoCliente(req.chamado, req.body || {}, req.user),
    });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}/assumir:
 *   post:
 *     summary: Assumir chamado (agente/admin)
 *     description: Torna o usuário logado responsável e, se o chamado estiver Novo, muda para Em Atendimento.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     responses:
 *       200:
 *         description: Chamado assumido
 */
router.post(
  '/:numero/assumir',
  somenteEquipe,
  carregaChamado,
  rota(async (req, res) => {
    res.json({ sucesso: true, chamado: await assumeChamado(req.chamado, req.user) });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}/interacoes:
 *   get:
 *     summary: Timeline do chamado
 *     description: Cliente não recebe notas internas.
 *     tags: [timeline]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *       - { in: query, name: pagina, schema: { type: integer, default: 1 } }
 *       - { in: query, name: porPagina, schema: { type: integer, default: 100 } }
 *     responses:
 *       200:
 *         description: Interações em ordem cronológica
 *   post:
 *     summary: Responder ou registrar nota interna
 *     description: >
 *       `tipo` publica (padrão) ou interna (somente equipe). Regras automáticas: 1ª resposta pública da
 *       equipe grava o SLA; equipe respondendo chamado Novo o coloca Em Atendimento; cliente respondendo
 *       chamado Pendente/Resolvido o devolve para Em Atendimento. Chamado fechado não aceita respostas.
 *     tags: [timeline]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovaInteracao'
 *     responses:
 *       201:
 *         description: Interação criada
 *       403:
 *         description: Cliente tentando criar nota interna
 *       409:
 *         description: Chamado fechado
 */
router.get(
  '/:numero/interacoes',
  carregaChamado,
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaInteracoes(req.chamado, req.user, req.query)) });
  }),
);

router.post(
  '/:numero/interacoes',
  carregaChamado,
  rota(async (req, res) => {
    res.status(201).json({
      sucesso: true,
      interacao: await adicionaInteracao(req.chamado, req.body || {}, req.user),
    });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}/macros/{id}:
 *   post:
 *     summary: Aplica uma macro no chamado (agente/admin)
 *     description: >
 *       Executa as ações da macro (status, justificativa, prioridade, equipe, atribuir a mim, tags)
 *       e depois registra a mensagem dela. Envie `mensagem` para usar o texto editado pelo agente.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensagem: { type: string }
 *     responses:
 *       200:
 *         description: Chamado depois da macro
 *       422:
 *         description: Alguma ação da macro não é válida para este chamado (nada é gravado)
 */
router.post(
  '/:numero/macros/:id',
  somenteEquipe,
  carregaChamado,
  rota(async (req, res) => {
    res.json({
      sucesso: true,
      chamado: await aplicaMacro(req.chamado, req.params.id, req.body || {}, req.user),
    });
  }),
);

/**
 * @openapi
 * /v1/chamados/{numero}/avaliacao:
 *   post:
 *     summary: Pesquisa de satisfação (solicitante)
 *     description: Nota de 1 a 5 e comentário opcional, uma única vez, com o chamado Resolvido ou Fechado.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/NumeroChamado'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nota]
 *             properties:
 *               nota: { type: integer, minimum: 1, maximum: 5 }
 *               comentario: { type: string, maxLength: 1000 }
 *     responses:
 *       200:
 *         description: Chamado com a avaliação
 *       403:
 *         description: Pesquisa desativada, chamado ainda aberto ou usuário não é o solicitante
 *       409:
 *         description: Chamado já avaliado
 */
router.post(
  '/:numero/avaliacao',
  carregaChamado,
  rota(async (req, res) => {
    res.json({
      sucesso: true,
      chamado: await avaliaChamado(req.chamado, req.body || {}, req.user),
    });
  }),
);

module.exports = router;
