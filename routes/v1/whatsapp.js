const express = require('express');

const { recebeWebhook, webhookAutentico } = require('../../services');
const { obtemConfigWhatsapp } = require('../../services/whatsapp-config');
const { rota, logger } = require('../../utils');

const router = express.Router();

/**
 * @openapi
 * /v1/whatsapp/webhook:
 *   get:
 *     summary: Verificação do webhook pela Meta (pública)
 *     description: 'A Meta envia hub.mode=subscribe, hub.verify_token e hub.challenge. Com o token de verificação certo, devolve o challenge.'
 *     tags: [whatsapp]
 *     responses:
 *       200: { description: O challenge recebido }
 *       403: { description: Token de verificação errado }
 *   post:
 *     summary: Avisos do WhatsApp (mensagens recebidas e entregas) — chamado pela Meta
 *     description: 'Exige a assinatura X-Hub-Signature-256 feita com a chave secreta do app. Responde 200 na hora e processa em segundo plano.'
 *     tags: [whatsapp]
 *     responses:
 *       200: { description: Recebido }
 *       401: { description: Assinatura inválida }
 */
router.get(
  '/webhook',
  rota(async (req, res) => {
    const q = req.query;
    const modo = q['hub.mode'] ?? q.hub?.mode;
    const token = q['hub.verify_token'] ?? q.hub?.verify_token;
    const desafio = q['hub.challenge'] ?? q.hub?.challenge;
    const config = await obtemConfigWhatsapp();
    if (modo === 'subscribe' && token && token === config.tokenVerificacao) {
      logger.info('Webhook do WhatsApp verificado pela Meta');
      return res.type('text/plain').send(String(desafio ?? ''));
    }
    return res.sendStatus(403);
  }),
);

router.post(
  '/webhook',
  rota(async (req, res) => {
    const config = await obtemConfigWhatsapp();
    if (!config.ativo) return res.sendStatus(200); // desligado: aceita e ignora (a Meta não insiste)
    if (!(await webhookAutentico(req.corpoBruto, req.get('x-hub-signature-256')))) {
      logger.warn('Aviso do WhatsApp com assinatura inválida recusado');
      return res.sendStatus(401);
    }
    // a Meta espera resposta rápida; o processamento continua em segundo plano
    res.sendStatus(200);
    setImmediate(() => {
      recebeWebhook(req.body).catch((e) =>
        logger.error(`Falha ao processar aviso do WhatsApp: ${e.stack || e.message}`),
      );
    });
    return undefined;
  }),
);

module.exports = router;
