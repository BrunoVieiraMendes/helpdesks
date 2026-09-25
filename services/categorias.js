const createError = require('http-errors');

const { Categoria, Chamado } = require('../models');
const { idValido } = require('./valida-referencias');

/**
 * Lista categorias. Inativas só aparecem com ?todas=true (uso do admin).
 * @param {{ todas?: boolean }} opcoes
 */
const listaCategorias = ({ todas = false } = {}) =>
  Categoria.find(todas ? {} : { ativa: true })
    .select('-__v')
    .sort({ nome: 1 })
    .lean();

/** @param {{ nome?: string, descricao?: string }} dados */
const criaCategoria = async ({ nome, descricao }) =>
  (await Categoria.create({ nome, descricao })).toJSON();

/**
 * @param {string} id
 * @param {{ nome?: string, descricao?: string, ativa?: boolean }} dados
 */
const atualizaCategoria = async (id, { nome, descricao, ativa }) => {
  if (!idValido(id)) throw createError(404, 'Categoria não encontrada');
  const categoria = await Categoria.findById(id);
  if (!categoria) throw createError(404, 'Categoria não encontrada');

  if (nome !== undefined) categoria.nome = nome;
  if (descricao !== undefined) categoria.descricao = descricao;
  if (ativa !== undefined) categoria.ativa = Boolean(ativa);

  await categoria.save();
  return categoria.toJSON();
};

/**
 * Remove a categoria se nenhum chamado a utiliza; caso contrário, 409 (desative).
 * @param {string} id
 */
const removeCategoria = async (id) => {
  if (!idValido(id)) throw createError(404, 'Categoria não encontrada');
  const categoria = await Categoria.findById(id);
  if (!categoria) throw createError(404, 'Categoria não encontrada');

  const emUso = await Chamado.countDocuments({ categoria: categoria._id });
  if (emUso) {
    throw createError(
      409,
      `A categoria ${categoria.nome} é usada por ${emUso} chamado(s). Desative-a.`,
    );
  }
  await categoria.deleteOne();
};

module.exports = { listaCategorias, criaCategoria, atualizaCategoria, removeCategoria };
