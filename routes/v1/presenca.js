const express = require('express');

const { autoriza } = require('../../middlewares');
const { registraPresenca, listaPresenca } = require('../../services/presenca');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

const router = express.Router();

/**
 * @openapi
 * /v1/presenca:
 *   post:
 *     summary: Sinal de presença do usuário logado (enviado pelo navegador a cada minuto)
 *     description: 'Só conta para agentes/admins. { ativo: true } quando a pessoa mexeu no sistema; { saindo: true } ao sair.'
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ativo: { type: boolean }
 *               saindo: { type: boolean }
 *     responses:
 *       204: { description: Registrado }
 *   get:
 *     summary: Agentes online, ausentes e offline (admin)
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: query, name: equipe, schema: { type: string } }
 *     responses:
 *       200: { description: '{ agentes, resumo: { online, ausente, offline }, atualizadoEm }' }
 */
router.post(
  '/',
  rota(async (req, res) => {
    await registraPresenca(req.user, req.body || {});
    res.status(204).end();
  }),
);

router.get(
  '/',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaPresenca(req.query)) });
  }),
);

module.exports = router;
