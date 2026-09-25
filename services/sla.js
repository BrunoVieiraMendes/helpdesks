const { STATUS_QUE_PAUSAM_SLA } = require('../constants');
const { somaMinutosUteis, minutosUteisEntre } = require('./expediente');
const { obtemConfiguracao, carregaCalendario } = require('./configuracao');

const pausa = (status) => STATUS_QUE_PAUSAM_SLA.includes(status);

/**
 * Prazos de 1ª resposta e solução contados em horário útil a partir da abertura.
 * O tempo que o chamado passou pausado (Pendente) é somado ao prazo de solução.
 * @param {{ criadoEm: Date, prioridade: string, minutosPausados?: number }} dados
 * @param {any} configuracao
 * @param {import('./expediente').Calendario} calendario
 */
const calculaPrazos = ({ criadoEm, prioridade, minutosPausados = 0 }, configuracao, calendario) => {
  const acordo = configuracao.sla[prioridade];
  return {
    prazoPrimeiraResposta: somaMinutosUteis(criadoEm, acordo.primeiraResposta, calendario),
    prazoSolucao: somaMinutosUteis(criadoEm, acordo.solucao + minutosPausados, calendario),
  };
};

/**
 * Prazos para um chamado novo.
 * @param {Date} criadoEm
 * @param {string} prioridade
 */
const prazosIniciais = async (criadoEm, prioridade) => {
  const configuracao = await obtemConfiguracao();
  const calendario = await carregaCalendario(configuracao);
  return calculaPrazos({ criadoEm, prioridade }, configuracao, calendario);
};

/**
 * Campos de SLA ($set) afetados por uma alteração de status e/ou prioridade.
 * - Entrou em Pendente: pausa o relógio.
 * - Saiu de Pendente: soma o tempo útil pausado e empurra o prazo de solução.
 * - Mudou a prioridade: recalcula os dois prazos com o acordo da nova urgência.
 * @param {any} chamado  documento atual (lean)
 * @param {{ status?: string, prioridade?: string }} mudancas
 * @param {Date} agora
 * @returns {Promise<Record<string, any>>}
 */
const slaParaAlteracao = async (chamado, mudancas, agora) => {
  const $set = {};
  const sla = chamado.sla || {};
  const saiDaPausa = mudancas.status && pausa(chamado.status) && !pausa(mudancas.status);
  const entraNaPausa = mudancas.status && !pausa(chamado.status) && pausa(mudancas.status);

  if (entraNaPausa) $set['sla.pausadoEm'] = agora;
  if (!saiDaPausa && !mudancas.prioridade) return $set;

  const configuracao = await obtemConfiguracao();
  const calendario = await carregaCalendario(configuracao);

  let minutosPausados = sla.minutosPausados || 0;
  if (saiDaPausa && sla.pausadoEm) {
    minutosPausados += minutosUteisEntre(new Date(sla.pausadoEm), agora, calendario);
    $set['sla.pausadoEm'] = null;
    $set['sla.minutosPausados'] = minutosPausados;
  }

  const prazos = calculaPrazos(
    {
      criadoEm: new Date(chamado.createdAt),
      prioridade: mudancas.prioridade || chamado.prioridade,
      minutosPausados,
    },
    configuracao,
    calendario,
  );
  $set['sla.prazoSolucao'] = prazos.prazoSolucao;
  if (mudancas.prioridade) $set['sla.prazoPrimeiraResposta'] = prazos.prazoPrimeiraResposta;
  return $set;
};

module.exports = { calculaPrazos, prazosIniciais, slaParaAlteracao };
