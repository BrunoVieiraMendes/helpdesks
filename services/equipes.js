const createError = require('http-errors');

const { Equipe, Usuario, Servico, Chamado } = require('../models');
const { PAPEIS_DA_EQUIPE } = require('../constants');
const { erroDeValidacao } = require('../utils');
const { idValido } = require('./valida-referencias');
const { STATUS_ABERTOS } = require('./regras-chamado');

const buscaEquipe = async (id) => {
  if (!idValido(id)) throw createError(404, 'Equipe não encontrada');
  const equipe = await Equipe.findById(id);
  if (!equipe) throw createError(404, 'Equipe não encontrada');
  return equipe;
};

/**
 * Lista equipes com membros, serviços e total de chamados em aberto.
 * Inativas só com { todas: true } (tela do admin).
 * @param {{ todas?: boolean }} opcoes
 */
const listaEquipes = async ({ todas = false } = {}) => {
  const equipes = await Equipe.find(todas ? {} : { ativa: true })
    .select('-__v')
    .sort({ nome: 1 })
    .lean();
  const ids = equipes.map((e) => e._id);

  const [membros, servicos, abertos] = await Promise.all([
    Usuario.find({ equipes: { $in: ids } })
      .select('nome email papel ativo equipes')
      .sort({ nome: 1 })
      .lean(),
    Servico.find({ equipe: { $in: ids } })
      .select('nome ativo equipe')
      .sort({ ordem: 1 })
      .lean(),
    Chamado.aggregate([
      { $match: { equipe: { $in: ids }, status: { $in: STATUS_ABERTOS } } },
      { $group: { _id: '$equipe', total: { $sum: 1 } } },
    ]),
  ]);

  const doMesmo = (a, b) => String(a) === String(b);
  return equipes.map((e) => ({
    ...e,
    membros: membros
      .filter((m) => m.equipes.some((id) => doMesmo(id, e._id)))
      .map(({ equipes: _equipes, ...m }) => m),
    servicos: servicos
      .filter((s) => doMesmo(s.equipe, e._id))
      .map(({ _id, nome, ativo }) => ({ _id, nome, ativo })),
    chamadosAbertos: abertos.find((a) => doMesmo(a._id, e._id))?.total ?? 0,
  }));
};

/** @param {{ nome?: string, descricao?: string }} dados */
const criaEquipe = async ({ nome, descricao }) =>
  (await Equipe.create({ nome, descricao })).toJSON();

/**
 * @param {string} id
 * @param {{ nome?: string, descricao?: string, ativa?: boolean }} dados
 */
const atualizaEquipe = async (id, { nome, descricao, ativa }) => {
  const equipe = await buscaEquipe(id);
  if (nome !== undefined) equipe.nome = nome;
  if (descricao !== undefined) equipe.descricao = descricao;
  if (ativa !== undefined) equipe.ativa = Boolean(ativa);
  await equipe.save();
  return equipe.toJSON();
};

/**
 * Remove a equipe. Se ela ainda tem serviços ou chamados, responde 409:
 * o admin deve mover os serviços ou desativar a equipe.
 * @param {string} id
 */
const removeEquipe = async (id) => {
  const equipe = await buscaEquipe(id);
  const [servicos, chamados] = await Promise.all([
    Servico.countDocuments({ equipe: equipe._id }),
    Chamado.countDocuments({ equipe: equipe._id }),
  ]);

  if (servicos || chamados) {
    const motivos = [
      servicos && `${servicos} serviço(s)`,
      chamados && `${chamados} chamado(s)`,
    ].filter(Boolean);
    throw createError(
      409,
      `A equipe ${equipe.nome} possui ${motivos.join(' e ')}. Mova os serviços para outra equipe ou desative a equipe.`,
    );
  }

  await Usuario.updateMany({ equipes: equipe._id }, { $pull: { equipes: equipe._id } });
  await equipe.deleteOne();
};

/**
 * Adiciona um agente/admin à equipe.
 * @param {string} equipeId
 * @param {string} usuarioId
 */
const adicionaMembro = async (equipeId, usuarioId) => {
  const equipe = await buscaEquipe(equipeId);
  if (!idValido(usuarioId)) throw erroDeValidacao({ usuario: 'Usuário inválido' });

  const usuario = await Usuario.findById(usuarioId).select('nome papel');
  if (!usuario) throw createError(404, 'Usuário não encontrado');
  if (!PAPEIS_DA_EQUIPE.includes(usuario.papel)) {
    throw erroDeValidacao({ usuario: 'Apenas agentes e admins podem fazer parte de uma equipe' });
  }

  await Usuario.updateOne({ _id: usuario._id }, { $addToSet: { equipes: equipe._id } });
};

/**
 * Remove o usuário da equipe. Ele deixa de ver a fila da equipe, mas continua
 * enxergando os chamados dos quais já é o responsável.
 * @param {string} equipeId
 * @param {string} usuarioId
 */
const removeMembro = async (equipeId, usuarioId) => {
  const equipe = await buscaEquipe(equipeId);
  if (!idValido(usuarioId)) throw createError(404, 'Usuário não encontrado');

  await Usuario.updateOne({ _id: usuarioId }, { $pull: { equipes: equipe._id } });
};

module.exports = {
  listaEquipes,
  criaEquipe,
  atualizaEquipe,
  removeEquipe,
  adicionaMembro,
  removeMembro,
};
