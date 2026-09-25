const { obtemFila } = require('./filas');
const { logger } = require('../utils');
const notificacoesWorker = require('./notificacoes');
const fechamentoAutomaticoWorker = require('./fechamento-automatico');

const agendaTarefas = async () => {
  const notificacoesQueue = obtemFila('notificacoes');
  const fechamentoQueue = obtemFila('fechamento-automatico');

  notificacoesQueue.process(notificacoesWorker);
  fechamentoQueue.process(fechamentoAutomaticoWorker);

  for (const fila of [notificacoesQueue, fechamentoQueue]) {
    fila.on('failed', (job, err) => {
      logger.error(
        `Job ${job.id} da fila "${fila.name}" falhou (tentativa ${job.attemptsMade}): ${err.message}`,
      );
    });
  }

  // limpa agendamentos antigos para não duplicar
  for (const job of await fechamentoQueue.getRepeatableJobs()) {
    await fechamentoQueue.removeRepeatableByKey(job.key);
  }

  // de hora em hora
  await fechamentoQueue.add(
    {},
    {
      repeat: { cron: '0 * * * *' },
      attempts: 3,
      backoff: 5000,
      removeOnComplete: true,
    },
  );
};

module.exports = { agendaTarefas };
