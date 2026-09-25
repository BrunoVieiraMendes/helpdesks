// Leitura da caixa de entrada (IMAP) e testes das contas de e-mail.
// A caixa é lida de tempos em tempos (Configurações > E-mail > intervalo); cada mensagem
// não lida é processada (services/email-entrada) e marcada como lida.
const { ImapFlow } = require('imapflow');
const createError = require('http-errors');

const { logger, decifra } = require('../utils');
const { obtemConfigEmail, registraVerificacao, transporteDeEnvio } = require('./email-config');
const { processaEmailBruto } = require('./email-entrada');
const enviaEmail = require('./envia-email');

const LIMITE_POR_RODADA = 50;

const conecta = (recebimento) =>
  new ImapFlow({
    host: recebimento.host,
    port: recebimento.porta,
    secure: recebimento.ssl,
    auth: { user: recebimento.usuario, pass: decifra(recebimento.senhaCifrada) || '' },
    logger: false,
    socketTimeout: 60000,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
  });

const mensagemDeErro = (e) => {
  if (e.authenticationFailed) return 'Usuário ou senha da caixa de entrada recusados pelo servidor';
  if (e.code === 'ENOTFOUND') return 'Servidor IMAP não encontrado (confira o endereço)';
  if (e.code === 'ECONNREFUSED') return 'Conexão recusada (confira servidor, porta e SSL)';
  if (e.code === 'ETIMEDOUT' || /timeout/i.test(e.message))
    return 'Tempo esgotado ao conectar no servidor IMAP';
  return e.responseText || e.message;
};

/** Conecta na caixa e conta as mensagens (botão "Testar recebimento"). */
const testaRecebimento = async () => {
  const { recebimento } = await obtemConfigEmail();
  if (!recebimento.host || !recebimento.usuario) {
    throw createError(422, 'Preencha servidor, usuário e senha da caixa de entrada');
  }
  const cliente = conecta(recebimento);
  try {
    await cliente.connect();
    const status = await cliente.status(recebimento.pasta || 'INBOX', {
      messages: true,
      unseen: true,
    });
    return { mensagens: status.messages, naoLidas: status.unseen };
  } catch (e) {
    throw createError(422, mensagemDeErro(e));
  } finally {
    await cliente.logout().catch(() => {});
  }
};

/** Envia um e-mail de teste (botão "Testar envio"). */
const testaEnvio = async (para) => {
  const envio = await transporteDeEnvio();
  if (!envio) {
    throw createError(422, 'Ative e configure o envio (SMTP) antes de testar');
  }
  try {
    await envio.transporte.verify();
    await enviaEmail({
      para,
      assunto: 'Teste de envio do Help Desk',
      template: 'teste',
      dados: { enviadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) },
    });
    return { para };
  } catch (e) {
    const mensagem =
      e.code === 'EAUTH'
        ? 'Usuário ou senha do SMTP recusados pelo servidor'
        : e.code === 'ECONNECTION' || e.code === 'ESOCKET'
          ? `Não foi possível conectar no servidor SMTP (${e.message})`
          : e.message;
    throw createError(422, mensagem);
  }
};

let rodando = false;

/**
 * Lê as mensagens não lidas e processa cada uma.
 * @param {{ forcar?: boolean }} [opcoes]  forcar: mesmo com o recebimento desativado (teste)
 * @returns {Promise<{ lidas: number, resultados: any[] }>}
 */
const verificaCaixa = async ({ forcar = false } = {}) => {
  const { recebimento } = await obtemConfigEmail();
  if (!recebimento.ativo && !forcar) return { lidas: 0, resultados: [], desativado: true };
  if (rodando) return { lidas: 0, resultados: [], emAndamento: true };
  rodando = true;
  const cliente = conecta(recebimento);
  const resultados = [];
  try {
    await cliente.connect();
    const trava = await cliente.getMailboxLock(recebimento.pasta || 'INBOX');
    try {
      const novas = [];
      for await (const msg of cliente.fetch(
        { seen: false },
        { uid: true, source: true },
        { uid: true },
      )) {
        novas.push({ uid: msg.uid, fonte: msg.source });
        if (novas.length >= LIMITE_POR_RODADA) break;
      }
      for (const { uid, fonte } of novas) {
        const r = await processaEmailBruto(fonte);
        resultados.push(r);
        // marca como lida mesmo com erro: o erro fica no log e não trava a caixa
        await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    } finally {
      trava.release();
    }
    await registraVerificacao(null);
    if (resultados.length) logger.info(`E-mail: ${resultados.length} mensagem(ns) processada(s)`);
    return { lidas: resultados.length, resultados };
  } catch (e) {
    const erro = mensagemDeErro(e);
    await registraVerificacao(erro);
    logger.error(`Falha ao ler a caixa de e-mail: ${erro}`);
    throw createError(422, erro);
  } finally {
    rodando = false;
    await cliente.logout().catch(() => {});
  }
};

let timer = null;

/**
 * Verifica a caixa no intervalo configurado (checa a cada minuto se já é hora).
 * LEITURA_DE_EMAIL=false desliga.
 */
const iniciaLeituraDeEmails = () => {
  if (timer || process.env.LEITURA_DE_EMAIL === 'false') return;
  timer = setInterval(async () => {
    try {
      const { recebimento } = await obtemConfigEmail();
      if (!recebimento.ativo) return;
      const ultima = recebimento.ultimaVerificacao
        ? new Date(recebimento.ultimaVerificacao).getTime()
        : 0;
      if (Date.now() - ultima < recebimento.intervaloMinutos * 60000 - 5000) return;
      await verificaCaixa();
    } catch {
      /* o erro já foi registrado em ultimoErro */
    }
  }, 60000);
  timer.unref();
};

module.exports = { testaRecebimento, testaEnvio, verificaCaixa, iniciaLeituraDeEmails };
