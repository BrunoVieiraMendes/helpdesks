const express = require('express');

const { autoriza } = require('../../middlewares');
const { listaServicos, criaServico, atualizaServico, removeServico } = require('../../services');
const { ehAdmin } = require('../../services/permissoes');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

const router = express.Router();
const somenteAdmin = autoriza(PAPEIS.ADMIN);

/**
 * @openapi
 * /v1/servicos:
 *   get:
 *     summary: Catálogo de serviços
 *     description: >
 *       Serviços ativos (de equipes ativas) que o cliente pode escolher ao abrir um chamado.
 *       Admin pode enviar `?todos=true` para incluir os inativos.
 *     tags: [serviços]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Serviços com a equipe que atende
 *   post:
 *     summary: Cria serviço (admin)
 *     tags: [serviços]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Servico'
 *     responses:
 *       201:
 *         description: Serviço criado
 */
router.get(
  '/',
  rota(async (req, res) => {
    const todos = req.query.todos === 'true' && ehAdmin(req.user);
    res.json({ sucesso: true, servicos: await listaServicos({ todos }) });
  }),
);

router.post(
  '/',
  somenteAdmin,
  rota(async (req, res) => {
    res.status(201).json({ sucesso: true, servico: await criaServico(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/servicos/{id}:
 *   patch:
 *     summary: Atualiza / desativa serviço (admin)
 *     description: Trocar a equipe afeta só os chamados novos.
 *     tags: [serviços]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Servico'
 *     responses:
 *       200:
 *         description: Serviço atualizado
 *   delete:
 *     summary: Remove serviço (admin)
 *     description: Só é possível se nenhum chamado o utiliza; senão responde 409 (desative o serviço).
 *     tags: [serviços]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Serviço removido
 *       409:
 *         description: Serviço em uso
 */
router.patch(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    res.json({ sucesso: true, servico: await atualizaServico(req.params.id, req.body || {}) });
  }),
);

router.delete(
  '/:id',
  somenteAdmin,
  rota(async (req, res) => {
    await removeServico(req.params.id);
    res.json({ sucesso: true, mensagem: 'Serviço removido' });
  }),
);

module.exports = router;
