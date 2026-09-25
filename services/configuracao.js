const { Configuracao, Feriado } = require('../models');
const { erroDeValidacao } = require('../utils');
const { ROTULOS_PRIORIDADE } = require('../constants');

const ID = 'geral';

/**
 * Parâmetros da conta (documento único). Cria com os valores padrão no primeiro acesso.
 * @returns {Promise<any>}
 */
const obtemConfiguracao = async () => {
  // sem lean: o Mongoose completa com os defaults campos que ainda não existiam no banco
  const existente = await Configuracao.findById(ID);
  if (existente) return existente.toObject();
  try {
    return (await Configuracao.create({ _id: ID })).toObject();
  } catch (e) {
    // duas requisições criando ao mesmo tempo: a outra venceu
    if (e.code !== 11000) throw e;
    return (await Configuracao.findById(ID)).toObject();
  }
};

const validaSla = (sla) => {
  const erros = {};
  for (const [prioridade, prazo] of Object.entries(sla || {})) {
    if (!ROTULOS_PRIORIDADE[prioridade]) continue;
    const { primeiraResposta, solucao } = prazo || {};
    if (primeiraResposta && solucao && Number(primeiraResposta) > Number(solucao)) {
      erros[`sla.${prioridade}.primeiraResposta`] =
        `${ROTULOS_PRIORIDADE[prioridade]}: a 1ª resposta não pode ter prazo maior que a solução`;
    }
  }
  if (Object.keys(erros).length) throw erroDeValidacao(erros);
};

/**
 * Atualiza os parâmetros (merge por seção: expediente, sla, pesquisa...).
 * Prazos de SLA e expediente valem para chamados abertos ou reclassificados daqui em diante.
 * @param {Record<string, any>} dados
 */
const atualizaConfiguracao = async (dados) => {
  await obtemConfiguracao();
  const doc = await Configuracao.findById(ID);

  if (dados.nomeEmpresa !== undefined) doc.nomeEmpresa = dados.nomeEmpresa;
  if (dados.diasFechamentoAutomatico !== undefined) {
    doc.diasFechamentoAutomatico = Number(dados.diasFechamentoAutomatico);
  }
  if (dados.expediente) {
    const { dias, inicio, fim, fusoMinutos } = dados.expediente;
    if (dias !== undefined) {
      doc.expediente.dias = [...new Set([].concat(dias).map(Number))].sort();
    }
    if (inicio !== undefined) doc.expediente.inicio = inicio;
    if (fim !== undefined) doc.expediente.fim = fim;
    if (fusoMinutos !== undefined) doc.expediente.fusoMinutos = Number(fusoMinutos);
    if (doc.expediente.inicio >= doc.expediente.fim) {
      throw erroDeValidacao({ 'expediente.fim': 'O fim do expediente deve ser depois do início' });
    }
  }
  if (dados.sla) {
    validaSla(dados.sla);
    for (const prioridade of Object.keys(ROTULOS_PRIORIDADE)) {
      const prazo = dados.sla[prioridade];
      if (!prazo) continue;
      for (const campo of ['primeiraResposta', 'solucao']) {
        if (prazo[campo] !== undefined) doc.sla[prioridade][campo] = Number(prazo[campo]);
      }
    }
  }
  if (dados.pesquisa) {
    if (dados.pesquisa.ativa !== undefined) doc.pesquisa.ativa = Boolean(dados.pesquisa.ativa);
    if (dados.pesquisa.pergunta !== undefined) doc.pesquisa.pergunta = dados.pesquisa.pergunta;
  }

  await doc.save();
  return doc.toObject();
};

/**
 * Expediente + feriados ativos, no formato usado por services/expediente.
 * @param {any} [configuracao]  evita buscar de novo se já estiver em mãos
 * @returns {Promise<import('./expediente').Calendario>}
 */
const carregaCalendario = async (configuracao) => {
  const [config, feriados] = await Promise.all([
    configuracao || obtemConfiguracao(),
    Feriado.find({ ativo: true }).select('data recorrente').lean(),
  ]);
  return { expediente: config.expediente, feriados };
};

module.exports = { obtemConfiguracao, atualizaConfiguracao, carregaCalendario };
