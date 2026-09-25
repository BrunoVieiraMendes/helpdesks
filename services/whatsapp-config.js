// Configuração da conta do WhatsApp (API oficial da Meta). O token de acesso e a chave secreta
// do app ficam cifrados no banco e nunca voltam para a tela (só "tokenDefinido"/"segredoDefinido").
const crypto = require('crypto');
const mongoose = require('mongoose');

const { ConfiguracaoWhatsapp, Servico } = require('../models');
const { erroDeValidacao, cifra } = require('../utils');

const ID = 'whatsapp';
const TEMPO_DO_CACHE_MS = 30000;

let cache = { em: 0, valor: null };
const limpaCache = () => {
  cache = { em: 0, valor: null };
};

const novoTokenDeVerificacao = () => crypto.randomBytes(18).toString('base64url');

/** Documento completo (com os segredos cifrados). Uso interno. */
const obtemConfigWhatsapp = async () => {
  if (cache.valor && Date.now() - cache.em < TEMPO_DO_CACHE_MS) return cache.valor;
  let doc = await ConfiguracaoWhatsapp.findById(ID);
  if (!doc) {
    try {
      doc = await ConfiguracaoWhatsapp.create({
        _id: ID,
        tokenVerificacao: novoTokenDeVerificacao(),
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      doc = await ConfiguracaoWhatsapp.findById(ID);
    }
  }
  cache = { em: Date.now(), valor: doc.toObject() };
  return cache.valor;
};

/** O que vai para a tela: sem o token e sem a chave secreta. */
const paraTela = ({ tokenCifrado, segredoCifrado, ...resto }) => ({
  ...resto,
  tokenDefinido: Boolean(tokenCifrado),
  segredoDefinido: Boolean(segredoCifrado),
});

const configWhatsappParaTela = async () => paraTela(await obtemConfigWhatsapp());

const texto = (v, max = 200) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

/**
 * Atualiza a configuração. Token/chave em branco mantêm os atuais.
 * @param {Record<string, any>} dados
 */
const atualizaConfigWhatsapp = async (dados = {}) => {
  await obtemConfigWhatsapp();
  const doc = await ConfiguracaoWhatsapp.findById(ID);
  const erros = {};

  if (dados.ativo !== undefined) doc.ativo = Boolean(dados.ativo);
  if (dados.numeroId !== undefined) doc.numeroId = texto(dados.numeroId, 40);
  if (dados.contaId !== undefined) doc.contaId = texto(dados.contaId, 40);
  if (dados.token) doc.tokenCifrado = cifra(String(dados.token).trim());
  if (dados.segredo) doc.segredoCifrado = cifra(String(dados.segredo).trim());
  if (dados.versaoApi !== undefined) {
    const versao = texto(dados.versaoApi, 10) || 'v21.0';
    if (!/^v\d{1,3}\.\d$/.test(versao)) erros.versaoApi = 'Use o formato v21.0';
    else doc.versaoApi = versao;
  }
  if (dados.criarClientes !== undefined) doc.criarClientes = Boolean(dados.criarClientes);
  if (dados.servicoPadrao !== undefined) {
    if (!dados.servicoPadrao) doc.servicoPadrao = null;
    else if (
      !mongoose.isValidObjectId(dados.servicoPadrao) ||
      !(await Servico.exists({ _id: dados.servicoPadrao, ativo: true }))
    ) {
      erros.servicoPadrao = 'Serviço não encontrado ou inativo';
    } else doc.servicoPadrao = dados.servicoPadrao;
  }
  if (dados.avisos) {
    for (const chave of ['confirmacaoCliente', 'respostaParaCliente']) {
      if (dados.avisos[chave] !== undefined) doc.avisos[chave] = Boolean(dados.avisos[chave]);
    }
  }
  if (dados.modelo) {
    if (dados.modelo.nome !== undefined) doc.modelo.nome = texto(dados.modelo.nome, 512);
    if (dados.modelo.idioma !== undefined) doc.modelo.idioma = texto(dados.modelo.idioma, 15);
    if (doc.modelo.nome && !/^[a-z0-9_]+$/.test(doc.modelo.nome)) {
      erros['modelo.nome'] = 'Use o nome do modelo como está na Meta (minúsculas, números e _)';
    }
    if (doc.modelo.nome && !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(doc.modelo.idioma)) {
      erros['modelo.idioma'] = 'Idioma inválido (ex.: pt_BR)';
    }
  }
  if (doc.numeroId && !/^\d{5,40}$/.test(doc.numeroId)) {
    erros.numeroId = 'A identificação do número tem só dígitos';
  }
  if (doc.contaId && !/^\d{5,40}$/.test(doc.contaId)) {
    erros.contaId = 'A identificação da conta tem só dígitos';
  }

  if (doc.ativo) {
    if (!doc.numeroId) erros.numeroId = 'Informe a identificação do número de telefone';
    if (!doc.tokenCifrado) erros.token = 'Informe o token de acesso';
    if (!doc.segredoCifrado) {
      erros.segredo = 'Informe a chave secreta do app (confere se os avisos vieram da Meta)';
    }
    if (!doc.servicoPadrao && !erros.servicoPadrao) {
      erros.servicoPadrao = 'Escolha o serviço dos chamados abertos pelo WhatsApp';
    }
  }

  if (Object.keys(erros).length) throw erroDeValidacao(erros, 'Revise a configuração do WhatsApp');
  await doc.save();
  limpaCache();
  return paraTela(doc.toObject());
};

/** Gera um novo token de verificação do webhook (o antigo deixa de valer). */
const renovaTokenDeVerificacao = async () => {
  await obtemConfigWhatsapp();
  await ConfiguracaoWhatsapp.updateOne(
    { _id: ID },
    { $set: { tokenVerificacao: novoTokenDeVerificacao() } },
  );
  limpaCache();
  return configWhatsappParaTela();
};

/** Anota dados sem passar pela validação (último recebimento, erro, número testado). */
const anotaNaConfigWhatsapp = async (campos) => {
  await ConfiguracaoWhatsapp.updateOne({ _id: ID }, { $set: campos });
  limpaCache();
};

module.exports = {
  obtemConfigWhatsapp,
  configWhatsappParaTela,
  atualizaConfigWhatsapp,
  renovaTokenDeVerificacao,
  anotaNaConfigWhatsapp,
};
