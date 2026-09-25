const createError = require('http-errors');

const { Chamado, Interacao } = require('../models');
const { TIPOS_INTERACAO } = require('../constants');
const { erroDeValidacao } = require('../utils');
const { podeAvaliar } = require('./permissoes');
const { obtemConfiguracao } = require('./configuracao');
const { detalhaChamado } = require('./busca-chamado');

/**
 * Pesquisa de satisfação: o solicitante dá uma nota de 1 a 5 (e um comentário opcional)
 * depois que o chamado é resolvido. Cada chamado recebe uma única avaliação.
 * @param {any} chamado
 * @param {{ nota?: any, comentario?: string }} dados
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const avaliaChamado = async (chamado, { nota, comentario = '' }, usuario) => {
  const { pesquisa } = await obtemConfiguracao();
  if (!podeAvaliar(chamado, usuario, pesquisa)) {
    throw createError(
      chamado.avaliacao ? 409 : 403,
      chamado.avaliacao
        ? 'Este chamado já foi avaliado'
        : 'A avaliação fica disponível para o solicitante depois que o chamado é resolvido',
    );
  }

  const valor = Number(nota);
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) {
    throw erroDeValidacao({ nota: 'Escolha uma nota de 1 a 5' });
  }

  const avaliacao = {
    nota: valor,
    comentario: String(comentario).trim().slice(0, 1000),
    em: new Date(),
  };
  // condicional: duas abas avaliando ao mesmo tempo gravam só uma vez
  const { modifiedCount } = await Chamado.updateOne(
    { _id: chamado._id, avaliacao: null },
    { $set: { avaliacao } },
    { timestamps: false },
  );
  if (!modifiedCount) throw createError(409, 'Este chamado já foi avaliado');

  await Interacao.create({
    chamado: chamado._id,
    autor: usuario._id,
    tipo: TIPOS_INTERACAO.SISTEMA,
    mensagem: `${usuario.nome} avaliou o atendimento: ${'★'.repeat(valor)}${'☆'.repeat(5 - valor)} (${valor}/5)`,
    evento: { campo: 'avaliacao', de: null, para: String(valor) },
  });

  return detalhaChamado(chamado._id, usuario);
};

module.exports = avaliaChamado;
