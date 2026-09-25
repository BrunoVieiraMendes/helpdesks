const createError = require('http-errors');

const { Chamado, Interacao } = require('../models');
const { STATUS, TIPOS_INTERACAO } = require('../constants');
const { lePaginacao, metaPaginacao, logger } = require('../utils');
const { ehEquipe } = require('./permissoes');
const atualizaChamado = require('./atualiza-chamado');
const { enfileira } = require('../workers/filas');

const POPULA_AUTOR = { path: 'autor', select: 'nome papel' };
// eventos de sistema que o cliente não vê
const CAMPOS_SO_DA_EQUIPE = ['tags', 'campoAdicional'];

/**
 * Timeline do chamado em ordem cronológica. Cliente não recebe notas internas
 * (o filtro é aplicado na consulta, a nota nunca sai do banco).
 * @param {any} chamado
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {Record<string, any>} query  ?pagina&porPagina
 */
const listaInteracoes = async (chamado, usuario, query = {}) => {
  const filtro = { chamado: chamado._id };
  if (!ehEquipe(usuario)) {
    filtro.tipo = { $ne: TIPOS_INTERACAO.INTERNA };
    // tags e campos adicionais são organização interna da equipe (ex.: "Cliente VIP")
    filtro['evento.campo'] = { $nin: CAMPOS_SO_DA_EQUIPE };
  }

  const paginacao = lePaginacao({ porPagina: 100, ...query });

  const [total, interacoes] = await Promise.all([
    Interacao.countDocuments(filtro),
    Interacao.find(filtro)
      .select('-__v')
      .sort({ createdAt: 1, _id: 1 })
      .skip(paginacao.pular)
      .limit(paginacao.porPagina)
      .populate(POPULA_AUTOR)
      .lean(),
  ]);

  return { interacoes, paginacao: metaPaginacao(total, paginacao) };
};

const resolveTipo = (tipoInformado, usuario) => {
  const tipo = tipoInformado || TIPOS_INTERACAO.PUBLICA;

  if (![TIPOS_INTERACAO.PUBLICA, TIPOS_INTERACAO.INTERNA].includes(tipo)) {
    throw createError(422, 'Tipo de interação inválido. Use "publica" ou "interna"');
  }
  if (tipo === TIPOS_INTERACAO.INTERNA && !ehEquipe(usuario)) {
    throw createError(403, 'Apenas a equipe pode registrar notas internas');
  }
  return tipo;
};

// aplica mudança automática de status sem derrubar a resposta se houver conflito
const mudaStatusAutomaticamente = async (chamadoId, dados, usuario) => {
  const atual = await Chamado.findById(chamadoId).lean();
  try {
    await atualizaChamado(atual, dados, usuario, { automatico: true });
  } catch (e) {
    if (e.status !== 409 && e.status !== 422) throw e;
    logger.debug(`Mudança automática de status ignorada no chamado ${atual.numero}: ${e.message}`);
  }
};

/**
 * Adiciona uma resposta pública ou nota interna.
 *
 * Regras automáticas (inspiradas no Movidesk):
 * - 1ª resposta pública da equipe grava sla.primeiraRespostaEm (update condicional, nunca sobrescreve).
 * - Equipe responde um chamado "Novo" -> "Em Atendimento" (e quem respondeu vira responsável, se não houver).
 * - Cliente responde um chamado "Pendente" ou "Resolvido" -> volta para "Em Atendimento".
 * - Chamado fechado não aceita novas interações.
 *
 * @param {any} chamado
 * @param {{ mensagem?: string, tipo?: string }} dados
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const adicionaInteracao = async (chamado, dados, usuario) => {
  if (chamado.status === STATUS.FECHADO) {
    throw createError(
      409,
      ehEquipe(usuario)
        ? 'Chamado fechado. Reabra-o para responder'
        : 'Este chamado está fechado. Abra um novo chamado se precisar de ajuda',
    );
  }

  const tipo = resolveTipo(dados.tipo, usuario);
  const equipe = ehEquipe(usuario);

  const interacao = await Interacao.create({
    chamado: chamado._id,
    autor: usuario._id,
    tipo,
    mensagem: dados.mensagem,
  });

  const agora = new Date();
  // toda interação conta como atualização do chamado
  await Chamado.updateOne({ _id: chamado._id }, { $set: { updatedAt: agora } });

  if (equipe && tipo === TIPOS_INTERACAO.PUBLICA) {
    await Chamado.updateOne(
      { _id: chamado._id, 'sla.primeiraRespostaEm': null },
      { $set: { 'sla.primeiraRespostaEm': agora } },
    );
    if (chamado.status === STATUS.NOVO) {
      await mudaStatusAutomaticamente(chamado._id, { status: STATUS.EM_ATENDIMENTO }, usuario);
    }
  }

  if (!equipe && [STATUS.PENDENTE, STATUS.RESOLVIDO].includes(chamado.status)) {
    await mudaStatusAutomaticamente(chamado._id, { status: STATUS.EM_ATENDIMENTO }, usuario);
  }

  if (tipo === TIPOS_INTERACAO.PUBLICA) {
    await enfileira('notificacoes', { tipo: 'nova-resposta', interacaoId: String(interacao._id) });
  }

  return Interacao.findById(interacao._id).select('-__v').populate(POPULA_AUTOR).lean();
};

/**
 * Resposta pública da equipe enviada junto com uma mudança de status (ex.: resolver o chamado).
 * Conta como 1ª resposta e avisa o cliente por e-mail, mas não aplica os automatismos de
 * status (quem chamou já decidiu o status).
 * @param {any} chamadoId
 * @param {string} mensagem
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const registraRespostaDaEquipe = async (chamadoId, mensagem, usuario) => {
  const agora = new Date();
  const interacao = await Interacao.create({
    chamado: chamadoId,
    autor: usuario._id,
    tipo: TIPOS_INTERACAO.PUBLICA,
    mensagem,
  });
  await Chamado.updateOne({ _id: chamadoId }, { $set: { updatedAt: agora } });
  await Chamado.updateOne(
    { _id: chamadoId, 'sla.primeiraRespostaEm': null },
    { $set: { 'sla.primeiraRespostaEm': agora } },
  );
  await enfileira('notificacoes', { tipo: 'nova-resposta', interacaoId: String(interacao._id) });
  return interacao;
};

module.exports = { listaInteracoes, adicionaInteracao, registraRespostaDaEquipe };
