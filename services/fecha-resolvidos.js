const { Chamado, Interacao } = require('../models');
const { STATUS, TIPOS_INTERACAO } = require('../constants');
const { logger } = require('../utils');
const { obtemConfiguracao } = require('./configuracao');

const LOTE = 200;

/**
 * Fecha automaticamente chamados que estão "Resolvido" há mais de N dias
 * (Configurações > Parâmetros; o padrão vem de DIAS_PARA_FECHAMENTO_AUTOMATICO), como o Movidesk faz.
 * @returns {Promise<number>} quantidade de chamados fechados
 */
const fechaResolvidos = async () => {
  const { diasFechamentoAutomatico: dias } = await obtemConfiguracao();
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  let fechados = 0;

  const candidatos = await Chamado.find({
    status: STATUS.RESOLVIDO,
    'sla.resolvidoEm': { $lte: limite },
  })
    .select('_id numero')
    .limit(LOTE)
    .lean();

  for (const { _id, numero } of candidatos) {
    const agora = new Date();
    // condicional: se alguém reabriu no meio do caminho, não fecha
    const { modifiedCount } = await Chamado.updateOne(
      { _id, status: STATUS.RESOLVIDO },
      { $set: { status: STATUS.FECHADO, 'sla.fechadoEm': agora, justificativa: null } },
    );
    if (!modifiedCount) continue;

    await Interacao.create({
      chamado: _id,
      autor: null,
      tipo: TIPOS_INTERACAO.SISTEMA,
      mensagem: `Chamado fechado automaticamente após ${dias} dia(s) em Resolvido`,
      evento: { campo: 'status', de: STATUS.RESOLVIDO, para: STATUS.FECHADO },
    });
    fechados += 1;
    logger.info(`Chamado #${numero} fechado automaticamente`);
  }

  return fechados;
};

module.exports = fechaResolvidos;
