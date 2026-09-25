const createError = require('http-errors');

const { Servico, Equipe, Chamado } = require('../models');
const { idValido, validaEquipe } = require('./valida-referencias');

const POPULA_EQUIPE = { path: 'equipe', select: 'nome ativa' };

const buscaServico = async (id) => {
  if (!idValido(id)) throw createError(404, 'Serviço não encontrado');
  const servico = await Servico.findById(id);
  if (!servico) throw createError(404, 'Serviço não encontrado');
  return servico;
};

const serializa = (id) => Servico.findById(id).select('-__v').populate(POPULA_EQUIPE).lean();

/**
 * Catálogo de serviços.
 * - Padrão: só serviços ativos de equipes ativas (o que o cliente pode escolher).
 * - { todos: true }: tudo, para a tela de administração.
 * @param {{ todos?: boolean }} opcoes
 */
const listaServicos = async ({ todos = false } = {}) => {
  const filtro = {};
  if (!todos) {
    filtro.ativo = true;
    filtro.equipe = { $in: await Equipe.find({ ativa: true }).distinct('_id') };
  }
  return Servico.find(filtro)
    .select('-__v')
    .populate(POPULA_EQUIPE)
    .sort({ ordem: 1, nome: 1 })
    .lean();
};

/** @param {{ nome?: string, descricao?: string, equipe?: string, cor?: string, ordem?: number }} dados */
const criaServico = async ({ nome, descricao, equipe, cor, ordem }) => {
  const doc = await Servico.create({
    nome,
    descricao,
    cor,
    ordem,
    equipe: (await validaEquipe(equipe))._id,
  });
  return serializa(doc._id);
};

/**
 * Atualiza o serviço. Mudar a equipe afeta só chamados novos
 * (os já abertos continuam com a equipe atual e podem ser transferidos).
 * @param {string} id
 * @param {{ nome?: string, descricao?: string, equipe?: string, cor?: string, ordem?: number, ativo?: boolean }} dados
 */
const atualizaServico = async (id, dados) => {
  const servico = await buscaServico(id);
  for (const campo of ['nome', 'descricao', 'cor', 'ordem']) {
    if (dados[campo] !== undefined) servico[campo] = dados[campo];
  }
  if (dados.ativo !== undefined) servico.ativo = Boolean(dados.ativo);
  if (dados.equipe !== undefined) servico.equipe = (await validaEquipe(dados.equipe))._id;
  await servico.save();
  return serializa(servico._id);
};

/**
 * Remove o serviço se nenhum chamado o utiliza; caso contrário, 409 (desative).
 * @param {string} id
 */
const removeServico = async (id) => {
  const servico = await buscaServico(id);
  const emUso = await Chamado.countDocuments({ servico: servico._id });
  if (emUso) {
    throw createError(
      409,
      `O serviço ${servico.nome} é usado por ${emUso} chamado(s). Desative-o para tirá-lo do catálogo.`,
    );
  }
  await servico.deleteOne();
};

module.exports = { listaServicos, criaServico, atualizaServico, removeServico };
