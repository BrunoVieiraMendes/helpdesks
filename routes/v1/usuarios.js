const express = require('express');

const { autoriza } = require('../../middlewares');
const { listaUsuarios, criaUsuario, atualizaUsuario, removeUsuario } = require('../../services');
const { rota } = require('../../utils');
const { PAPEIS, PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();

/**
 * @openapi
 * /v1/usuarios/eu:
 *   get:
 *     summary: Usuário logado
 *     description: Inclui o perfil de acesso efetivo e as permissões (usado pelas telas para esconder ações).
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Dados do usuário dono do JWT
 *       401:
 *         $ref: '#/components/responses/NaoAutorizado'
 */
router.get('/eu', (req, res) => {
  const { _id, nome, email, papel, perfilEfetivo, permissoes } = req.user;
  res.json({
    sucesso: true,
    usuario: { _id, nome, email, papel, perfil: perfilEfetivo, permissoes },
  });
});

/**
 * @openapi
 * /v1/usuarios:
 *   get:
 *     summary: Lista usuários (agente/admin)
 *     description: Usado nos filtros e no select de responsável. Ex. `?papel=agente,admin&ativo=true&equipe=<id>`
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: query, name: papel, schema: { type: string }, example: 'agente,admin' }
 *       - { in: query, name: ativo, schema: { type: boolean } }
 *       - { in: query, name: equipe, schema: { type: string } }
 *       - { in: query, name: busca, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Lista de usuários
 *       403:
 *         $ref: '#/components/responses/Proibido'
 *   post:
 *     summary: Cria usuário (admin)
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NovoUsuario'
 *     responses:
 *       201:
 *         description: Usuário criado
 *       409:
 *         description: E-mail já cadastrado
 *       422:
 *         $ref: '#/components/responses/Invalido'
 */
router.get(
  '/',
  autoriza(...PAPEIS_DA_EQUIPE),
  rota(async (req, res) => {
    res.json({ sucesso: true, usuarios: await listaUsuarios(req.query) });
  }),
);

router.post(
  '/',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    res.status(201).json({ sucesso: true, usuario: await criaUsuario(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/usuarios/{id}:
 *   patch:
 *     summary: Atualiza usuário (admin)
 *     description: Altera nome, e-mail, papel, equipes, ativo ou senha.
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AtualizaUsuario'
 *     responses:
 *       200:
 *         description: Usuário atualizado
 *       404:
 *         description: Usuário não encontrado
 *   delete:
 *     summary: Remove usuário (admin)
 *     description: Só remove quem não tem histórico de atendimento; senão responde 409 (desative o usuário).
 *     tags: [usuários]
 *     security: [{ auth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Usuário removido
 *       409:
 *         description: Usuário com histórico
 */
router.patch(
  '/:id',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    res.json({
      sucesso: true,
      usuario: await atualizaUsuario(req.params.id, req.body || {}, req.user),
    });
  }),
);

router.delete(
  '/:id',
  autoriza(PAPEIS.ADMIN),
  rota(async (req, res) => {
    await removeUsuario(req.params.id, req.user);
    res.json({ sucesso: true, mensagem: 'Usuário removido' });
  }),
);

module.exports = router;
