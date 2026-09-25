// Números da página Início da equipe (contadores, bandeiras, hoje, prazos,
// satisfação) e avisos do mural visíveis para cada usuário.
const { Chamado, Aviso } = require('../models');
const { STATUS } = require('../constants');
const { ehEquipe, ehAdmin, equipesDoUsuario, filtroDeVisibilidade } = require('./permissoes');
const { STATUS_ABERTOS } = require('./regras-chamado');
const { obtemConfiguracao } = require('./configuracao');

const DIA = 24 * 60 * 60 * 1000;
// status em que o relógio do SLA corre
const STATUS_COM_RELOGIO = [STATUS.NOVO, STATUS.EM_ATENDIMENTO];

// combina o filtro de visibilidade (que pode ter $or) com outras condições
const dentroDe = (visibilidade, filtro) =>
  Object.keys(visibilidade).length ? { $and: [visibilidade, filtro] } : filtro;

/**
 * Início e fim do dia de hoje no fuso do expediente (Configurações > SLA).
 * @param {number} fusoMinutos
 */
const limitesDoDia = (fusoMinutos) => {
  const fuso = fusoMinutos * 60 * 1000;
  const local = Date.now() + fuso;
  const inicio = new Date(Math.floor(local / DIA) * DIA - fuso);
  return { inicio, fim: new Date(inicio.getTime() + DIA) };
};

/** @returns {Promise<Record<string, number>>} status -> quantidade */
const contaPorStatus = async (filtro) => {
  const grupos = await Chamado.aggregate([
    { $match: filtro },
    { $group: { _id: '$status', total: { $sum: 1 } } },
  ]);
  return Object.fromEntries(
    Object.values(STATUS).map((s) => [s, grupos.find((g) => g._id === s)?.total ?? 0]),
  );
};

/**
 * Avisos do mural para o usuário: habilitados, dentro da validade e do público dele.
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {number} [fusoMinutos]
 */
const avisosDoUsuario = async (usuario, fusoMinutos) => {
  const fuso = fusoMinutos ?? (await obtemConfiguracao()).expediente.fusoMinutos;
  const hoje = new Date(Date.now() + fuso * 60 * 1000).toISOString().slice(0, 10);
  const publico = ehEquipe(usuario) ? 'equipe' : 'clientes';
  return Aviso.find({
    ativo: true,
    publico: { $in: [publico, 'todos'] },
    $or: [{ validoAte: null }, { validoAte: { $gte: hoje } }],
  })
    .select('-__v')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
};

/**
 * Tudo que a página Início mostra, sempre dentro do que o usuário pode ver.
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const painelInicial = async (usuario) => {
  const configuracao = await obtemConfiguracao();
  const agora = new Date();
  const { inicio, fim } = limitesDoDia(configuracao.expediente.fusoMinutos);
  const visibilidade = filtroDeVisibilidade(usuario);
  // só o admin enxerga todas as filas
  const veTodos = ehAdmin(usuario);
  const equipes = equipesDoUsuario(usuario);
  const conta = (filtro) => Chamado.countDocuments(dentroDe(visibilidade, filtro));

  const [
    meus,
    daEquipe,
    todos,
    slaVencido,
    semResposta,
    semResponsavel,
    abertosHoje,
    resolvidosHoje,
    vencemHoje,
    vencemNaSemana,
    avaliacoes,
    avisos,
  ] = await Promise.all([
    contaPorStatus({ responsavel: usuario._id }),
    equipes.length ? contaPorStatus({ equipe: { $in: equipes } }) : null,
    veTodos ? contaPorStatus(dentroDe(visibilidade, {})) : null,
    conta({ status: { $in: STATUS_COM_RELOGIO }, 'sla.prazoSolucao': { $lt: agora } }),
    conta({
      status: { $in: STATUS_COM_RELOGIO },
      'sla.primeiraRespostaEm': null,
      'sla.prazoPrimeiraResposta': { $lt: agora },
    }),
    conta({ status: { $in: STATUS_ABERTOS }, responsavel: null }),
    conta({ createdAt: { $gte: inicio } }),
    conta({ 'sla.resolvidoEm': { $gte: inicio } }),
    conta({ status: { $in: STATUS_COM_RELOGIO }, 'sla.prazoSolucao': { $gte: agora, $lt: fim } }),
    conta({
      status: { $in: STATUS_COM_RELOGIO },
      'sla.prazoSolucao': { $gte: agora, $lt: new Date(inicio.getTime() + 7 * DIA) },
    }),
    Chamado.aggregate([
      {
        $match: dentroDe(visibilidade, {
          'avaliacao.em': { $gte: new Date(agora.getTime() - 30 * DIA) },
        }),
      },
      { $group: { _id: null, media: { $avg: '$avaliacao.nota' }, total: { $sum: 1 } } },
    ]),
    avisosDoUsuario(usuario, configuracao.expediente.fusoMinutos),
  ]);

  return {
    contadores: { meus, equipe: daEquipe, todos },
    bandeiras: { slaVencido, semResposta, semResponsavel },
    hoje: { abertos: abertosHoje, resolvidos: resolvidosHoje },
    prazos: { hoje: vencemHoje, semana: vencemNaSemana },
    satisfacao: {
      media: avaliacoes[0] ? Math.round(avaliacoes[0].media * 10) / 10 : null,
      total: avaliacoes[0]?.total ?? 0,
    },
    avisos,
  };
};

module.exports = { painelInicial, avisosDoUsuario };
