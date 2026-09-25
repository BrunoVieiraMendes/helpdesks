const path = require('path');
const ejs = require('ejs');
const nodemailer = require('nodemailer');

const { logger } = require('../utils');

let transportador;
const obtemTransportador = () => {
  transportador ??= nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    ignoreTLS: process.env.NODE_ENV !== 'production',
  });
  return transportador;
};

const renderiza = (template, arquivo, dados) =>
  ejs.renderFile(path.join(__dirname, '..', 'emails', template, arquivo), {
    ...dados,
    urlDoHelpdesk: process.env.URL_DO_HELPDESK,
  });

/**
 * Envia um e-mail a partir de emails/<template>/template.{html,txt}.ejs
 * @param {{ para: string, assunto: string, template: string, dados: Record<string, any> }} opcoes
 */
const enviaEmail = async ({ para, assunto, template, dados }) => {
  const [html, text] = await Promise.all([
    renderiza(template, 'template.html.ejs', dados),
    renderiza(template, 'template.txt.ejs', dados),
  ]);

  await obtemTransportador().sendMail({
    from: process.env.EMAIL_REMETENTE,
    to: para,
    subject: assunto,
    html,
    text,
  });

  logger.info(`E-mail "${template}" enviado para ${para}`);
};

module.exports = enviaEmail;
