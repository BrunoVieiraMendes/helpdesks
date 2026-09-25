const express = require('express');

const { autoriza } = require('../../middlewares');
const { painelInicial } = require('../../services');
const { rota } = require('../../utils');
const { PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();

/**
 * @openapi
 * /v1/inicio:
 *   get:
 *     summary: Números da página Início (agente/admin)
 *     description: >
 *       Contadores por status (meus, da minha equipe e de todos os agentes, se o perfil permitir),
 *       bandeiras (SLA vencido, 1ª resposta atrasada, sem responsável), chamados de hoje,
 *       prazos que vencem hoje/na semana, satisfação dos últimos 30 dias e avisos do mural.
 *       Tudo respeita o que o usuário pode ver.
 *     tags: [chamados]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Painel inicial
 */
router.get(
  '/',
  autoriza(...PAPEIS_DA_EQUIPE),
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await painelInicial(req.user)) });
  }),
);

module.exports = router;
