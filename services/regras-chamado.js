// Regras puras (sem banco) de mudança de status e SLA.
const createError = require('http-errors');
const { STATUS, TRANSICOES_STATUS, ROTULOS_STATUS } = require('../constants');

const STATUS_ABERTOS = [STATUS.NOVO, STATUS.EM_ATENDIMENTO, STATUS.PENDENTE];

/**
 * Lança 422 se a transição não for permitida.
 * @param {string} de
 * @param {string} para
 */
const validaTransicao = (de, para) => {
  if (!ROTULOS_STATUS[para]) {
    throw createError(422, `Status inválido: ${para}`);
  }
  if (!TRANSICOES_STATUS[de].includes(para)) {
    throw createError(
      422,
      `Não é possível mover o chamado de "${ROTULOS_STATUS[de]}" para "${ROTULOS_STATUS[para]}"`,
    );
  }
};

/**
 * Campos de SLA que mudam junto com o status.
 * - Resolvido: grava resolvidoEm
 * - Fechado: grava fechadoEm (e resolvidoEm, se fechou sem passar por Resolvido)
 * - Reaberto (volta a um status aberto): zera resolvidoEm e fechadoEm
 * @param {{ status: string, sla?: { resolvidoEm?: Date|null } }} chamado
 * @param {string} novoStatus
 * @param {Date} agora
 * @returns {Record<string, Date|null>}
 */
const slaParaMudancaDeStatus = (chamado, novoStatus, agora) => {
  if (novoStatus === STATUS.RESOLVIDO) {
    return { 'sla.resolvidoEm': agora, 'sla.fechadoEm': null };
  }

  if (novoStatus === STATUS.FECHADO) {
    return {
      'sla.fechadoEm': agora,
      ...(!chamado.sla?.resolvidoEm && { 'sla.resolvidoEm': agora }),
    };
  }

  if (STATUS_ABERTOS.includes(novoStatus) && !STATUS_ABERTOS.includes(chamado.status)) {
    return { 'sla.resolvidoEm': null, 'sla.fechadoEm': null };
  }

  return {};
};

module.exports = { STATUS_ABERTOS, validaTransicao, slaParaMudancaDeStatus };
