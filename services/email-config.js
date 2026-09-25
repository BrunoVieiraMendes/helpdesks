// Configuração das contas de e-mail (envio SMTP, recebimento IMAP e quais avisos mandar).
// As senhas ficam cifradas no banco e nunca voltam para a tela (só "senhaDefinida").
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

const { ConfiguracaoEmail, Servico } = require('../models');
const { erroDeValidacao, cifra, decifra } = require('../utils');

const ID = 'email';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPO_DO_CACHE_MS = 30000;

let cache = { em: 0, valor: null };
const limpaCache = () => {
  cache = { em: 0, valor: null };
};

/** Documento completo (com as senhas cifradas). Uso interno. */
const obtemConfigEmail = async () => {
  if (cache.valor && Date.now() - cache.em < TEMPO_DO_CACHE_MS) return cache.valor;
  let doc = await ConfiguracaoEmail.findById(ID);
  if (!doc) {
    try {
      doc = await ConfiguracaoEmail.create({ _id: ID });
    } catch (e) {
      if (e.code !== 11000) throw e;
      doc = await ConfiguracaoEmail.findById(ID);
    }
  }
  cache = { em: Date.now(), valor: doc.toObject() };
  return cache.valor;
};

/** O que vai para a tela: sem as senhas. */
const paraTela = (c) => {
  const semSenha = ({ senhaCifrada, ...resto }) => ({
    ...resto,
    senhaDefinida: Boolean(senhaCifrada),
  });
  return {
    envio: semSenha(c.envio),
    recebimento: semSenha(c.recebimento),
    avisos: c.avisos,
    // o que vale hoje para o envio, para a tela explicar
    envioPeloEnv: !c.envio.ativo && Boolean(process.env.EMAIL_HOST),
  };
};

const configuracaoParaTela = async () => paraTela(await obtemConfigEmail());

const texto = (v, max = 200) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const porta = (v, erros, caminho) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 65535) erros[caminho] = 'Porta inválida';
  return n;
};

/**
 * Atualiza por seção (envio, recebimento, avisos). Senha vazia mantém a atual;
 * "limparSenha": true apaga.
 * @param {Record<string, any>} dados
 */
const atualizaConfigEmail = async (dados = {}) => {
  await obtemConfigEmail();
  const doc = await ConfiguracaoEmail.findById(ID);
  const erros = {};

  if (dados.envio) {
    const e = dados.envio;
    const alvo = doc.envio;
    if (e.ativo !== undefined) alvo.ativo = Boolean(e.ativo);
    if (e.host !== undefined) alvo.host = texto(e.host);
    if (e.porta !== undefined) alvo.porta = porta(e.porta, erros, 'envio.porta');
    if (e.seguranca !== undefined) {
      if (!ConfiguracaoEmail.SEGURANCAS.includes(e.seguranca))
        erros['envio.seguranca'] = 'Segurança inválida';
      else alvo.seguranca = e.seguranca;
    }
    if (e.usuario !== undefined) alvo.usuario = texto(e.usuario);
    if (e.senha) alvo.senhaCifrada = cifra(String(e.senha));
    if (e.limparSenha) alvo.senhaCifrada = '';
    if (e.remetenteNome !== undefined) alvo.remetenteNome = texto(e.remetenteNome, 120);
    if (e.remetenteEmail !== undefined) alvo.remetenteEmail = texto(e.remetenteEmail).toLowerCase();
    if (alvo.ativo) {
      if (!alvo.host) erros['envio.host'] = 'Informe o servidor SMTP';
      if (!EMAIL.test(alvo.remetenteEmail))
        erros['envio.remetenteEmail'] = 'Informe o e-mail do remetente';
    }
    if (alvo.remetenteEmail && !EMAIL.test(alvo.remetenteEmail)) {
      erros['envio.remetenteEmail'] = 'E-mail inválido';
    }
  }

  if (dados.recebimento) {
    const r = dados.recebimento;
    const alvo = doc.recebimento;
    if (r.ativo !== undefined) alvo.ativo = Boolean(r.ativo);
    if (r.host !== undefined) alvo.host = texto(r.host);
    if (r.porta !== undefined) alvo.porta = porta(r.porta, erros, 'recebimento.porta');
    if (r.ssl !== undefined) alvo.ssl = Boolean(r.ssl);
    if (r.usuario !== undefined) alvo.usuario = texto(r.usuario);
    if (r.senha) alvo.senhaCifrada = cifra(String(r.senha));
    if (r.limparSenha) alvo.senhaCifrada = '';
    if (r.pasta !== undefined) alvo.pasta = texto(r.pasta, 120) || 'INBOX';
    if (r.endereco !== undefined) alvo.endereco = texto(r.endereco).toLowerCase();
    if (r.criarClientes !== undefined) alvo.criarClientes = Boolean(r.criarClientes);
    if (r.intervaloMinutos !== undefined) {
      const n = Number(r.intervaloMinutos);
      if (!Number.isInteger(n) || n < 1 || n > 60)
        erros['recebimento.intervaloMinutos'] = 'Use de 1 a 60 minutos';
      else alvo.intervaloMinutos = n;
    }
    if (r.servicoPadrao !== undefined) {
      if (!r.servicoPadrao) alvo.servicoPadrao = null;
      else if (
        !mongoose.isValidObjectId(r.servicoPadrao) ||
        !(await Servico.exists({ _id: r.servicoPadrao, ativo: true }))
      ) {
        erros['recebimento.servicoPadrao'] = 'Serviço não encontrado ou inativo';
      } else alvo.servicoPadrao = r.servicoPadrao;
    }
    if (alvo.endereco && !EMAIL.test(alvo.endereco))
      erros['recebimento.endereco'] = 'E-mail inválido';
    if (alvo.ativo) {
      if (!alvo.host) erros['recebimento.host'] = 'Informe o servidor IMAP';
      if (!alvo.usuario) erros['recebimento.usuario'] = 'Informe o usuário da caixa de entrada';
      if (!alvo.senhaCifrada) erros['recebimento.senha'] = 'Informe a senha da caixa de entrada';
      if (!alvo.servicoPadrao && !erros['recebimento.servicoPadrao']) {
        erros['recebimento.servicoPadrao'] = 'Escolha o serviço dos chamados abertos por e-mail';
      }
    }
  }

  if (dados.avisos) {
    for (const chave of [
      'novoChamadoEquipe',
      'confirmacaoCliente',
      'respostaParaCliente',
      'respostaParaResponsavel',
    ]) {
      if (dados.avisos[chave] !== undefined) doc.avisos[chave] = Boolean(dados.avisos[chave]);
    }
  }

  if (Object.keys(erros).length) throw erroDeValidacao(erros, 'Revise as configurações de e-mail');
  await doc.save();
  limpaCache();
  return paraTela(doc.toObject());
};

/** Anota o resultado da última leitura da caixa (sem mexer no resto). */
const registraVerificacao = async (erro) => {
  await ConfiguracaoEmail.updateOne(
    { _id: ID },
    {
      $set: {
        'recebimento.ultimaVerificacao': new Date(),
        'recebimento.ultimoErro': erro ? String(erro).slice(0, 500) : '',
      },
    },
  );
  limpaCache();
};

// ---------------------------------------------------------------- envio
/**
 * Transportador SMTP e remetente em uso: a conta configurada na tela ou, sem ela,
 * as variáveis EMAIL_* do .env. null = envio de e-mail desligado.
 * @param {any} [config]  permite testar uma configuração ainda não salva
 */
const transporteDeEnvio = async (config) => {
  const c = config || (await obtemConfigEmail());
  const envio = c.envio;
  // endereço para onde o cliente responde: a caixa que o Help Desk lê
  const responderPara = c.recebimento?.ativo
    ? c.recebimento.endereco || c.recebimento.usuario
    : null;

  if (envio.ativo && envio.host) {
    const senha = decifra(envio.senhaCifrada);
    return {
      transporte: nodemailer.createTransport({
        host: envio.host,
        port: envio.porta,
        secure: envio.seguranca === 'ssl',
        requireTLS: envio.seguranca === 'starttls',
        ignoreTLS: envio.seguranca === 'nenhuma',
        ...(envio.usuario && { auth: { user: envio.usuario, pass: senha || '' } }),
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      }),
      de: { name: envio.remetenteNome || 'Help Desk', address: envio.remetenteEmail },
      endereco: envio.remetenteEmail,
      responderPara: responderPara && EMAIL.test(responderPara) ? responderPara : null,
    };
  }
  if (process.env.EMAIL_HOST) {
    const remetente = process.env.EMAIL_REMETENTE || 'Help Desk <helpdesk@localhost>';
    return {
      transporte: nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 25,
        secure: false,
        ignoreTLS: process.env.NODE_ENV !== 'production',
      }),
      de: remetente,
      endereco: ((remetente.match(/<([^>]+)>/) || [])[1] || remetente).trim().toLowerCase(),
      responderPara: responderPara && EMAIL.test(responderPara) ? responderPara : null,
    };
  }
  return null;
};

module.exports = {
  obtemConfigEmail,
  configuracaoParaTela,
  atualizaConfigEmail,
  registraVerificacao,
  transporteDeEnvio,
  limpaCacheDeEmail: limpaCache,
};
