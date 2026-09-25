const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

/**
 * @openapi
 * /v1/status:
 *   get:
 *     summary: Saúde da API
 *     tags: [status]
 *     responses:
 *       200:
 *         description: API no ar
 */
router.get('/', (_req, res) => {
  res.json({
    sucesso: true,
    status: 'ok',
    banco: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado',
  });
});

module.exports = router;
