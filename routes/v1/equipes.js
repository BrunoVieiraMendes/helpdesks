const express = require('express');

const { autoriza } = require('../../middlewares');
const {
  listaEquipes,
  criaEquipe,
  atualizaEquipe,
  removeEquipe,
  adicionaMembro,
  removeMembro,
} = require('../../services');
const { ehAdmin } = require('../../services/permissoes');
const { rota } = require('../../utils');
const { PAPEIS, PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();
const somenteAdmin = autoriza(PAPEIS.ADMIN);

/**
 * @openapi
 * /v1/equipes:
 *   get:
 *     summary: Lista equipes com membros, serviços e chamados em aberto (agente/admin)
 *     description: Admin pode enviar `?todas=true` para incluir as inativas.
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Equipes
 *   post:
 *     summary: Cria equipe (admin)
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Equipe'
 *     responses:
 *       201:
 *         description: Equipe criada
 *       409:
 *         description: Já existe uma equipe com esse nome
 */
router.get(
  '/',
  autoriza(...PAPEIS_DA_EQUIPE),
  rota(async (req, res) => {
    const todas = req.query.todas === 'true' && ehAdmin(req.user);
    res.json({ sucesso: true, equipes: await listaEquipes({ todas }) });
  }),
);

router.post(
  '/',
  somenteAdmin,
  rota(async (req, res) => {
    res.status(201).json({ sucesso: true, equipe: await criaEquipe(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/equipes/{id}:
 *   patch:
 *     summary: Atualiza / desativa equipe (admin)
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Equipe'
 *     responses:
 *       200:
 *         description: Equipe atualizada
 *   delete:
 *     summary: Remove equipe (admin)
 *     description: Só é possível se não houver serviços nem chamados ligados a ela; senão responde 409 (desative a equipe).
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Equipe removida
 *       409:
 *         description: Equipe em uso
 */
router.patch(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    res.json({ sucesso: true, equipe: await atualizaEquipe(req.params.id, req.body || {}) });
  }),
);

router.delete(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    await removeEquipe(req.params.id);
    res.json({ sucesso: true, mensagem: 'Equipe removida' });
  }),
);

/**
 * @openapi
 * /v1/equipes/{id}/membros:
 *   post:
 *     summary: Adiciona agente/admin à equipe (admin)
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usuario: { type: string }
 *     responses:
 *       200:
 *         description: Membro adicionado
 * /v1/equipes/{id}/membros/{usuarioId}:
 *   delete:
 *     summary: Remove membro da equipe (admin)
 *     tags: [equipes]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *       - { in: path, name: usuarioId, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Membro removido
 */
router.post(
  '/:id/membros',
  somenteAdmin,
  rota(async (req, res) => {
    await adicionaMembro(req.params.id, (req.body || {}).usuario);
    res.json({ sucesso: true, mensagem: 'Membro adicionado' });
  }),
);

router.delete(
  '/:id/membros/:usuarioId',
  somenteAdmin,
  rota(async (req, res) => {
    await removeMembro(req.params.id, req.params.usuarioId);
    res.json({ sucesso: true, mensagem: 'Membro removido' });
  }),
);

module.exports = router;
