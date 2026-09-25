const { logger } = require('../utils');

const notificacoesWorker = async (job) => {
  // require tardio: evita ciclo services -> workers/filas -> services
  const { processaNotificacao } = require('../services');
  logger.debug(`Processando notificação ${job.data.tipo}`);
  await processaNotificacao(job.data);
};

module.exports = notificacoesWorker;
