const express = require('express');
const { logaUsuario } = require('../../services');
const { rota } = require('../../utils');

const router = express.Router();

/**
 * @openapi
 * /v1/auth:
 *   post:
 *     summary: Login
 *     description: Autentica por e-mail e senha e devolve um JWT (envie em `Authorization Bearer <jwt>`).
 *     tags: [autenticação]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: JWT gerado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: E-mail ou senha inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erro'
 */
router.post(
  '/',
  rota(async (req, res) => {
    const { email, senha } = req.body || {};
    const { jwt, usuario } = await logaUsuario(email, senha);
    res.json({ sucesso: true, jwt, usuario });
  }),
);

module.exports = router;
