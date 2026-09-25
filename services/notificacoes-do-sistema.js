const mongoose = require('mongoose');
const createError = require('http-errors');

const { Chamado, Notificacao, Usuario } = require('../models');
const { PAPEIS_DA_EQUIPE } = require('../constants');
const { logger } = require('../utils');

const LIMITE_PADRAO = 20;
const LIMITE_MAXIMO = 50;

const MENSAGENS = {
  'novo-chamado': (c, autor) => ({
    titulo: `Novo chamado #${c.numero} na fila ${c.equipe.nome}`,
    mensagem: [
      c.titulo,
      c.servico?.nome,
      c.solicitante?.nome && `aberto por ${c.solicitante.nome}`,
      !c.solicitante?.nome && autor?.nome && `aberto por ${autor.nome}`,
    ]
      .filter(Boolean)
      .join(' · '),
  }),
  'chamado-transferido': (c, autor) => ({
    titulo: `Chamado #${c.numero} transferido para ${c.equipe.nome}`,
    mensagem: [c.titulo, autor?.nome && `por ${autor.nome}`].filter(Boolean).join(' · '),
  }),
};

/**
 * Avisa os agentes (e admins) da equipe do chamado pelo sino da barra do topo.
 * Quem causou a ação não recebe o próprio aviso. Nunca derruba a requisição:
 * o chamado já foi salvo e o aviso é secundário.
 * @param {'novo-chamado' | 'chamado-transferido'} tipo
 * @param {import('mongoose').Types.ObjectId | string} chamadoId
 * @param {{ _id: any, nome?: string } | null} autor
 * @returns {Promise<number>} quantas pessoas foram avisadas
 */
const notificaEquipeDoChamado = async (tipo, chamadoId, autor) => {
  try {
    const chamado = await Chamado.findById(chamadoId)
      .select('numero titulo equipe servico solicitante')
      .populate('equipe', 'nome')
      .populate('servico', 'nome')
      .populate('solicitante', 'nome')
      .lean();
    if (!chamado?.equipe) return 0;

    const destinatarios = await Usuario.find({
      equipes: chamado.equipe._id,
      ativo: true,
      papel: { $in: PAPEIS_DA_EQUIPE },
      ...(autor && { _id: { $ne: autor._id } }),
    })
      .select('_id')
      .lean();
    if (!destinatarios.length) return 0;

    const { titulo, mensagem } = MENSAGENS[tipo](chamado, autor);
    await Notificacao.insertMany(
      destinatarios.map((u) => ({
        usuario: u._id,
        tipo,
        chamado: chamado._id,
        numero: chamado.numero,
        titulo: titulo.slice(0, 200),
        mensagem: mensagem.slice(0, 400),
        autor: autor?._id ?? null,
      })),
    );
    return destinatarios.length;
  } catch (e) {
    logger.error(`Falha ao gerar notificações (${tipo}) do chamado ${chamadoId}: ${e.message}`);
    return 0;
  }
};

/**
 * Notificações mais recentes do usuário e o total de não lidas.
 * @param {{ _id: any }} usuario
 * @param {{ limite?: any, naoLidas?: any }} query
 */
const listaNotificacoes = async (usuario, query = {}) => {
  const limite = Math.min(Math.max(Number(query.limite) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);
  const filtro = { usuario: usuario._id };
  if (query.naoLidas === 'true') filtro.lida = false;
  const [notificacoes, naoLidas] = await Promise.all([
    Notificacao.find(filtro).sort({ createdAt: -1 }).limit(limite).select('-usuario -__v').lean(),
    Notificacao.countDocuments({ usuario: usuario._id, lida: false }),
  ]);
  return { notificacoes, naoLidas };
};

/**
 * Marca como lida uma notificação do próprio usuário.
 * @param {string} id
 * @param {{ _id: any }} usuario
 */
const marcaNotificacaoLida = async (id, usuario) => {
  if (!mongoose.isValidObjectId(id)) throw createError(404, 'Notificação não encontrada');
  const r = await Notificacao.updateOne({ _id: id, usuario: usuario._id }, { lida: true });
  if (!r.matchedCount) throw createError(404, 'Notificação não encontrada');
  return { naoLidas: await Notificacao.countDocuments({ usuario: usuario._id, lida: false }) };
};

/**
 * Marca todas como lidas; com `chamado`, só as daquele chamado (ao abrir o chamado).
 * @param {{ _id: any }} usuario
 * @param {{ chamado?: any }} [filtros]
 */
const marcaNotificacoesLidas = async (usuario, { chamado } = {}) => {
  const filtro = { usuario: usuario._id, lida: false };
  if (chamado !== undefined) {
    if (!mongoose.isValidObjectId(chamado)) return { atualizadas: 0, naoLidas: null };
    filtro.chamado = chamado;
  }
  const r = await Notificacao.updateMany(filtro, { lida: true });
  return {
    atualizadas: r.modifiedCount,
    naoLidas: await Notificacao.countDocuments({ usuario: usuario._id, lida: false }),
  };
};

module.exports = {
  notificaEquipeDoChamado,
  listaNotificacoes,
  marcaNotificacaoLida,
  marcaNotificacoesLidas,
};
