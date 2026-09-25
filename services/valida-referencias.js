const mongoose = require('mongoose');
const { Usuario, Categoria, Equipe, Servico, Tag, Justificativa, Empresa } = require('../models');
const { PAPEIS_DA_EQUIPE, PAPEIS, ROTULOS_STATUS } = require('../constants');
const { erroDeValidacao, listaDaQuery } = require('../utils');

const idValido = (id) => mongoose.isValidObjectId(id);
const vazio = (v) => v === null || v === undefined || v === '';

/**
 * Garante que o id é de um agente/admin ativo que atende a equipe do chamado
 * (admin atende qualquer equipe). Retorna { _id, nome, papel, equipes } ou null.
 * @param {any} id
 * @param {any} [equipeId]  equipe do chamado; se informada, o agente precisa ser membro
 */
const validaResponsavel = async (id, equipeId) => {
  if (vazio(id)) return null;
  if (!idValido(id)) throw erroDeValidacao({ responsavel: 'Responsável inválido' });

  const usuario = await Usuario.findOne({ _id: id, ativo: true, papel: { $in: PAPEIS_DA_EQUIPE } })
    .select('nome papel equipes')
    .lean();
  if (!usuario) throw erroDeValidacao({ responsavel: 'Responsável deve ser um agente ativo' });

  const membro = (usuario.equipes || []).some((e) => String(e) === String(equipeId));
  if (equipeId && usuario.papel !== PAPEIS.ADMIN && !membro) {
    throw erroDeValidacao({ responsavel: `${usuario.nome} não faz parte da equipe deste chamado` });
  }
  return usuario;
};

/**
 * Garante que o id é de um cliente ativo. Retorna { _id, nome }.
 * @param {any} id
 */
const validaSolicitante = async (id) => {
  if (!idValido(id)) throw erroDeValidacao({ solicitante: 'Solicitante inválido' });
  const usuario = await Usuario.findOne({ _id: id, ativo: true, papel: PAPEIS.CLIENTE })
    .select('nome empresa')
    .lean();
  if (!usuario) throw erroDeValidacao({ solicitante: 'Solicitante deve ser um cliente ativo' });
  return usuario;
};

/**
 * Garante que a categoria existe e está ativa. Retorna { _id, nome } ou null.
 * @param {any} id
 */
const validaCategoria = async (id) => {
  if (vazio(id)) return null;
  if (!idValido(id)) throw erroDeValidacao({ categoria: 'Categoria inválida' });

  const categoria = await Categoria.findOne({ _id: id, ativa: true }).select('nome').lean();
  if (!categoria) throw erroDeValidacao({ categoria: 'Categoria não encontrada ou inativa' });
  return categoria;
};

/**
 * Garante que a equipe existe e está ativa. Retorna { _id, nome }.
 * @param {any} id
 * @param {string} [campo]
 */
const validaEquipe = async (id, campo = 'equipe') => {
  if (vazio(id) || !idValido(id)) throw erroDeValidacao({ [campo]: 'Equipe inválida' });
  const equipe = await Equipe.findOne({ _id: id, ativa: true }).select('nome').lean();
  if (!equipe) throw erroDeValidacao({ [campo]: 'Equipe não encontrada ou inativa' });
  return equipe;
};

/**
 * Garante que o serviço existe, está ativo e a equipe dele também.
 * Retorna { _id, nome, equipe }.
 * @param {any} id
 */
const validaServico = async (id) => {
  if (vazio(id)) throw erroDeValidacao({ servico: 'Escolha um serviço' });
  if (!idValido(id)) throw erroDeValidacao({ servico: 'Serviço inválido' });

  const servico = await Servico.findOne({ _id: id, ativo: true }).select('nome equipe').lean();
  if (!servico) throw erroDeValidacao({ servico: 'Serviço não encontrado ou inativo' });

  const equipeAtiva = await Equipe.exists({ _id: servico.equipe, ativa: true });
  if (!equipeAtiva)
    throw erroDeValidacao({ servico: 'Este serviço está temporariamente indisponível' });
  return servico;
};

/**
 * Garante que todas as tags existem e estão ativas. Retorna os ids sem repetição.
 * Tags inativas que o chamado já tinha continuam aceitas (para não sumirem ao editar).
 * @param {any} ids
 * @param {any[]} [jaNoChamado]
 * @returns {Promise<any[]>}
 */
const validaTags = async (ids, jaNoChamado = []) => {
  const lista = [...new Set(listaDaQuery(ids))];
  if (lista.some((id) => !idValido(id))) throw erroDeValidacao({ tags: 'Tag inválida' });

  const mantidas = new Set(jaNoChamado.map(String));
  const encontradas = await Tag.find({ _id: { $in: lista } })
    .select('ativa')
    .lean();
  const aceitas = encontradas.filter((t) => t.ativa || mantidas.has(String(t._id)));
  if (aceitas.length !== lista.length) {
    throw erroDeValidacao({ tags: 'Tag não encontrada ou inativa' });
  }
  return lista.map((id) => new mongoose.Types.ObjectId(id));
};

/**
 * Justificativas ativas cadastradas para o status.
 * @param {string} status
 */
const justificativasDoStatus = (status) =>
  Justificativa.find({ status, ativa: true }).select('nome').sort({ nome: 1 }).lean();

/**
 * Garante que a justificativa existe, está ativa e vale para o status. Retorna { _id, nome } ou null.
 * @param {any} id
 * @param {string} status
 */
const validaJustificativa = async (id, status) => {
  if (vazio(id)) return null;
  if (!idValido(id)) throw erroDeValidacao({ justificativa: 'Justificativa inválida' });
  const justificativa = await Justificativa.findOne({ _id: id, ativa: true, status })
    .select('nome')
    .lean();
  if (!justificativa) {
    throw erroDeValidacao({
      justificativa: `Justificativa não se aplica ao status ${ROTULOS_STATUS[status] || status}`,
    });
  }
  return justificativa;
};

/**
 * Garante que a empresa existe e está ativa. Retorna { _id, nome } ou null.
 * @param {any} id
 */
const validaEmpresa = async (id) => {
  if (vazio(id)) return null;
  if (!idValido(id)) throw erroDeValidacao({ empresa: 'Empresa inválida' });
  const empresa = await Empresa.findOne({ _id: id, ativa: true }).select('nome').lean();
  if (!empresa) throw erroDeValidacao({ empresa: 'Empresa não encontrada ou inativa' });
  return empresa;
};

module.exports = {
  idValido,
  vazio,
  validaResponsavel,
  validaSolicitante,
  validaCategoria,
  validaEquipe,
  validaServico,
  validaTags,
  justificativasDoStatus,
  validaJustificativa,
  validaEmpresa,
};
