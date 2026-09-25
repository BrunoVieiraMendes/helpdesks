const { Usuario, Empresa, Equipe, Chamado } = require('../models');
const { PAPEIS, PAPEIS_DA_EQUIPE, STATUS } = require('../constants');
const { STATUS_ABERTOS } = require('./regras-chamado');

/**
 * Números do painel de configurações (quadro "Pessoas" e situação da fila).
 */
const resumoDaConta = async () => {
  const agora = new Date();
  const [clientes, empresas, equipes, agentes, abertos, slaVencido, avaliacoes] = await Promise.all(
    [
      Usuario.countDocuments({ papel: PAPEIS.CLIENTE, ativo: true }),
      Empresa.countDocuments({ ativa: true }),
      Equipe.countDocuments({ ativa: true }),
      Usuario.countDocuments({ papel: { $in: PAPEIS_DA_EQUIPE }, ativo: true }),
      Chamado.countDocuments({ status: { $in: STATUS_ABERTOS } }),
      Chamado.countDocuments({
        status: { $in: [STATUS.NOVO, STATUS.EM_ATENDIMENTO] },
        'sla.prazoSolucao': { $lt: agora },
      }),
      Chamado.aggregate([
        { $match: { 'avaliacao.nota': { $gte: 1 } } },
        { $group: { _id: null, media: { $avg: '$avaliacao.nota' }, total: { $sum: 1 } } },
      ]),
    ],
  );

  return {
    pessoas: { clientes, empresas, equipes, agentesAtivos: agentes },
    fila: {
      abertos,
      slaVencido,
      mediaAvaliacao: avaliacoes[0] ? Math.round(avaliacoes[0].media * 10) / 10 : null,
      totalAvaliacoes: avaliacoes[0]?.total ?? 0,
    },
  };
};

module.exports = resumoDaConta;
