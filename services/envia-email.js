const path = require('path');
const ejs = require('ejs');

const { logger } = require('../utils');
const { transporteDeEnvio } = require('./email-config');

// linha que separa a resposta do cliente do histórico citado (o leitor de e-mails corta aqui)
const MARCADOR_DE_RESPOSTA = '##- Responda acima desta linha -##';

const renderiza = (template, arquivo, dados) =>
  ejs.renderFile(path.join(__dirname, '..', 'emails', template, arquivo), {
    ...dados,
    urlDoHelpdesk: process.env.URL_DO_HELPDESK,
  });

/**
 * Envia um e-mail a partir de emails/<template>/template.{html,txt}.ejs, pela conta SMTP
 * configurada em Configurações > E-mail (ou pelas variáveis EMAIL_* do .env).
 * @param {{ para: string, assunto: string, template: string, dados: Record<string, any>, chamado?: number, respondivel?: boolean }} opcoes
 *   respondivel: o cliente pode responder este e-mail (vai para a caixa lida pelo Help Desk)
 * @returns {Promise<boolean>} false se o envio de e-mail estiver desligado
 */
const enviaEmail = async ({ para, assunto, template, dados, chamado, respondivel = false }) => {
  // endereços de marcação (ex.: clientes cadastrados pelo WhatsApp) não recebem e-mail
  if (/\.invalid$/i.test(String(para || ''))) return false;
  const envio = await transporteDeEnvio();
  if (!envio) {
    logger.debug(`E-mail "${template}" não enviado: nenhuma conta de envio configurada`);
    return false;
  }
  // só oferece "responda este e-mail" quando existe uma caixa de entrada para ler a resposta
  const podeResponder = respondivel && Boolean(envio.responderPara);
  const conteudo = { ...dados, podeResponder, marcador: MARCADOR_DE_RESPOSTA };
  const [html, text] = await Promise.all([
    renderiza(template, 'template.html.ejs', conteudo),
    renderiza(template, 'template.txt.ejs', conteudo),
  ]);

  await envio.transporte.sendMail({
    from: envio.de,
    to: para,
    subject: assunto,
    html,
    text,
    ...(podeResponder && { replyTo: envio.responderPara }),
    headers: {
      // e-mail automático: respostas automáticas (férias, etc.) não devem responder de volta
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
      'X-Helpdesk': 'notificacao',
      ...(chamado && { 'X-Helpdesk-Chamado': String(chamado) }),
    },
  });

  logger.info(`E-mail "${template}" enviado para ${para}`);
  return true;
};

module.exports = enviaEmail;
module.exports.MARCADOR_DE_RESPOSTA = MARCADOR_DE_RESPOSTA;
