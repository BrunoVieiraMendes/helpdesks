const express = require('express');

const { autoriza } = require('../../middlewares');
const { obtemConfiguracao, atualizaConfiguracao, resumoDaConta } = require('../../services');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

const router = express.Router();

router.use(autoriza(PAPEIS.ADMIN));

/**
 * @openapi
 * /v1/configuracoes:
 *   get:
 *     summary: Parâmetros da conta (admin)
 *     description: Expediente, acordos de SLA por urgência, pesquisa de satisfação e fechamento automático.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Parâmetros
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso: { type: boolean }
 *                 configuracao: { $ref: '#/components/schemas/Configuracao' }
 *   patch:
 *     summary: Atualiza parâmetros (admin)
 *     description: >
 *       Envie só as seções que mudaram. Os prazos de SLA e o expediente valem para chamados
 *       abertos (ou com a prioridade alterada) a partir de agora.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Configuracao'
 *     responses:
 *       200:
 *         description: Parâmetros atualizados
 *       422:
 *         $ref: '#/components/responses/Invalido'
 */
router.get(
  '/',
  rota(async (_req, res) => {
    res.json({ sucesso: true, configuracao: await obtemConfiguracao() });
  }),
);

router.patch(
  '/',
  rota(async (req, res) => {
    res.json({ sucesso: true, configuracao: await atualizaConfiguracao(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/configuracoes/resumo:
 *   get:
 *     summary: Números do painel de configurações (admin)
 *     description: Clientes, empresas, equipes e agentes ativos; chamados abertos, SLA vencido e média das avaliações.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Resumo
 */
router.get(
  '/resumo',
  rota(async (_req, res) => {
    res.json({ sucesso: true, ...(await resumoDaConta()) });
  }),
);

module.exports = router;
