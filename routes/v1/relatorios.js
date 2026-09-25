const express = require('express');
const createError = require('http-errors');

const { autoriza } = require('../../middlewares');
const {
  indicadores,
  relatorioDeChamados,
  csvDeChamados,
  csvDeIndicadores,
} = require('../../services');
const { pode } = require('../../services/permissoes');
const { rota } = require('../../utils');
const { PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();

router.use(autoriza(...PAPEIS_DA_EQUIPE), (req, _res, next) => {
  if (!pode(req.user, 'verRelatorios')) {
    return next(createError(403, 'Seu perfil de acesso não permite ver indicadores e relatórios'));
  }
  return next();
});

/**
 * @openapi
 * components:
 *   parameters:
 *     FiltrosDoRelatorio:
 *       in: query
 *       name: de
 *       schema: { type: string, example: '2026-09-01' }
 *       description: 'Início do período (AAAA-MM-DD). Com `ate`, padrão = últimos 30 dias. Aceita também equipe, servico, responsavel, prioridade e categoria, como na fila.'
 * /v1/relatorios/indicadores:
 *   get:
 *     summary: Indicadores do período (agente/admin)
 *     description: >
 *       Resumo (abertos, resolvidos, em aberto, tempos médios, SLA, nota), série diária, backlog por status,
 *       distribuição por serviço/equipe/categoria/urgência, mapa de calor (dia x hora), SLA por semana e por
 *       urgência, desempenho por agente e por equipe e satisfação. Sempre dentro do que o usuário pode ver.
 *       Exige a permissão "Ver indicadores e relatórios".
 *     tags: [relatórios]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/FiltrosDoRelatorio'
 *       - { in: query, name: ate, schema: { type: string, example: '2026-09-30' } }
 *     responses:
 *       200: { description: Indicadores }
 *       422: { description: Período inválido (até 366 dias) }
 * /v1/relatorios/indicadores.csv:
 *   get:
 *     summary: Exporta todos os indicadores do período em um CSV
 *     description: >
 *       Um arquivo com uma seção por indicador (filtros, resumo, série diária, fila por status, distribuições,
 *       mapa de calor, SLA, equipes, agentes, satisfação e comentários). Separado por ponto e vírgula,
 *       UTF-8 com BOM e vírgula decimal (abre direto no Excel em português).
 *     tags: [relatórios]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/FiltrosDoRelatorio'
 *       - { in: query, name: ate, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Arquivo CSV
 *         content: { text/csv: {} }
 */
router.get(
  '/indicadores',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await indicadores(req.query, req.user)) });
  }),
);

/** Envia um CSV como download. */
const enviaCsv = (res, { nome, conteudo }) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.send(conteudo);
};

router.get(
  '/indicadores.csv',
  rota(async (req, res) => {
    enviaCsv(res, await csvDeIndicadores(req.query, req.user));
  }),
);

/**
 * @openapi
 * /v1/relatorios/chamados:
 *   get:
 *     summary: Relatório de chamados do período (paginado)
 *     description: '`base=abertos` (padrão) usa a data de abertura; `base=resolvidos`, a data de solução. Aceita os filtros da fila, inclusive status.'
 *     tags: [relatórios]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/FiltrosDoRelatorio'
 *       - { in: query, name: ate, schema: { type: string } }
 *       - { in: query, name: base, schema: { type: string, enum: [abertos, resolvidos] } }
 *       - { in: query, name: pagina, schema: { type: integer } }
 *     responses:
 *       200: { description: Chamados }
 * /v1/relatorios/chamados.csv:
 *   get:
 *     summary: Exporta o relatório de chamados em CSV (até 10.000 linhas)
 *     description: Separado por ponto e vírgula, em UTF-8 com BOM (abre direto no Excel).
 *     tags: [relatórios]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/FiltrosDoRelatorio'
 *       - { in: query, name: ate, schema: { type: string } }
 *       - { in: query, name: base, schema: { type: string, enum: [abertos, resolvidos] } }
 *     responses:
 *       200:
 *         description: Arquivo CSV
 *         content: { text/csv: {} }
 */
router.get(
  '/chamados',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await relatorioDeChamados(req.query, req.user)) });
  }),
);

router.get(
  '/chamados.csv',
  rota(async (req, res) => {
    enviaCsv(res, await csvDeChamados(req.query, req.user));
  }),
);

module.exports = router;
