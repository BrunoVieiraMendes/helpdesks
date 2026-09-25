const express = require('express');

const { autoriza } = require('../../middlewares');
const {
  listaCategorias,
  criaCategoria,
  atualizaCategoria,
  removeCategoria,
} = require('../../services');
const { ehAdmin } = require('../../services/permissoes');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

const router = express.Router();

/**
 * @openapi
 * /v1/categorias:
 *   get:
 *     summary: Lista categorias ativas
 *     description: Admin pode enviar `?todas=true` para incluir as inativas.
 *     tags: [categorias]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Categorias
 *   post:
 *     summary: Cria categoria (admin)
 *     tags: [categorias]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Categoria'
 *     responses:
 *       201:
 *         description: Categoria criada
 */
router.get(
  '/',
  rota(async (req, res) => {
    const todas = req.query.todas === 'true' && ehAdmin(req.user);
    res.json({ sucesso: true, categorias: await listaCategorias({ todas }) });
  }),
);

router.post(
  '/',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    res.status(201).json({ sucesso: true, categoria: await criaCategoria(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/categorias/{id}:
 *   patch:
 *     summary: Atualiza / desativa categoria (admin)
 *     tags: [categorias]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Categoria'
 *     responses:
 *       200:
 *         description: Categoria atualizada
 *   delete:
 *     summary: Remove categoria (admin)
 *     description: Só remove se nenhum chamado a utiliza; senão responde 409 (desative).
 *     tags: [categorias]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Categoria removida
 */
router.patch(
  '/:id',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    res.json({ sucesso: true, categoria: await atualizaCategoria(req.params.id, req.body || {}) });
  }),
);

router.delete(
  '/:id',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    await removeCategoria(req.params.id);
    res.json({ sucesso: true, mensagem: 'Categoria removida' });
  }),
);

module.exports = router;
