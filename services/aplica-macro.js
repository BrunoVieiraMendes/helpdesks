const createError = require('http-errors');

const { Chamado, Macro } = require('../models');
const { idValido } = require('./valida-referencias');
const { pode } = require('./permissoes');
const atualizaChamado = require('./atualiza-chamado');
const { adicionaInteracao } = require('./interacoes');
const { detalhaChamado } = require('./busca-chamado');

/**
 * Traduz as ações da macro nos campos aceitos por atualizaChamado.
 * @param {any} acoes
 * @param {any} chamado
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const camposDaMacro = (acoes, chamado, usuario) => {
  const campos = {};
  if (!acoes) return campos;
  if (acoes.status) campos.status = acoes.status;
  if (acoes.justificativa) campos.justificativa = acoes.justificativa;
  if (acoes.prioridade) campos.prioridade = acoes.prioridade;
  if (acoes.equipe) campos.equipe = acoes.equipe;
  if (acoes.atribuirAMim) campos.responsavel = usuario._id;
  if (acoes.adicionarTags?.length) {
    const atuais = (chamado.tags || []).map(String);
    campos.tags = [...new Set([...atuais, ...acoes.adicionarTags.map(String)])];
  }
  return campos;
};

/**
 * Aplica uma macro: primeiro as ações (status, prioridade, equipe, responsável, tags),
 * depois a mensagem (pública ou nota interna). O agente pode editar o texto antes de enviar.
 * As ações vêm primeiro porque são validadas: se algo for inválido nada é gravado.
 * @param {any} chamado
 * @param {string} macroId
 * @param {{ mensagem?: string }} dados  texto final (se omitido, usa o texto da macro)
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const aplicaMacro = async (chamado, macroId, dados, usuario) => {
  if (!pode(usuario, 'aplicarMacros')) {
    throw createError(403, 'Seu perfil de acesso não permite aplicar macros');
  }
  if (!idValido(macroId)) throw createError(404, 'Macro não encontrada');
  const macro = await Macro.findOne({ _id: macroId, ativa: true }).lean();
  if (!macro) throw createError(404, 'Macro não encontrada ou inativa');

  const campos = camposDaMacro(macro.acoes, chamado, usuario);
  if (Object.keys(campos).length) await atualizaChamado(chamado, campos, usuario);

  const mensagem = String(dados.mensagem ?? macro.mensagem ?? '').trim();
  if (mensagem) {
    const atual = await Chamado.findById(chamado._id).lean();
    await adicionaInteracao(atual, { mensagem, tipo: macro.tipo }, usuario);
  }

  return detalhaChamado(chamado._id, usuario);
};

module.exports = aplicaMacro;
