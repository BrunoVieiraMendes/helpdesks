const express = require('express');

const {
  listaNotificacoes,
  marcaNotificacaoLida,
  marcaNotificacoesLidas,
} = require('../../services');
const { rota } = require('../../utils');

const router = express.Router();

/**
 * @openapi
 * /v1/notificacoes:
 *   get:
 *     summary: Notificações do usuário logado (sino da barra do topo)
 *     description: >
 *       As mais recentes primeiro e o total de não lidas. Os agentes recebem uma notificação quando um
 *       chamado é aberto ou transferido para uma equipe da qual fazem parte (menos quem fez a ação).
 *     tags: [notificações]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: query, name: limite, schema: { type: integer, default: 20, maximum: 50 } }
 *       - { in: query, name: naoLidas, schema: { type: boolean }, description: 'true = só as não lidas' }
 *     responses:
 *       200: { description: '{ notificacoes, naoLidas }' }
 * /v1/notificacoes/lidas:
 *   post:
 *     summary: Marca todas como lidas (ou só as de um chamado)
 *     tags: [notificações]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { chamado: { type: string, description: 'Id do chamado (opcional)' } } }
 *     responses:
 *       200: { description: '{ atualizadas, naoLidas }' }
 * /v1/notificacoes/{id}/lida:
 *   post:
 *     summary: Marca uma notificação como lida
 *     tags: [notificações]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: '{ naoLidas }' }
 *       404: { description: Não encontrada (ou de outra pessoa) }
 */
router.get(
  '/',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaNotificacoes(req.user, req.query)) });
  }),
);

router.post(
  '/lidas',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await marcaNotificacoesLidas(req.user, req.body || {})) });
  }),
);

router.post(
  '/:id/lida',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await marcaNotificacaoLida(req.params.id, req.user)) });
  }),
);

module.exports = router;
