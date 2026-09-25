const { logger } = require('../utils');

const fechamentoAutomaticoWorker = async () => {
  const { fechaResolvidos } = require('../services');
  const total = await fechaResolvidos();
  logger.info(`Fechamento automático: ${total} chamado(s) fechado(s)`);
  return total;
};

module.exports = fechamentoAutomaticoWorker;
