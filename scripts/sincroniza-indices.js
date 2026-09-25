// Equivalente às "migrations" no MongoDB: cria/remove índices para que o
// banco fique igual ao que está declarado nos schemas.
// Uso: npm run db:indices
require('dotenv').config();

const models = require('../models');
const { logger } = require('../utils');

(async () => {
  try {
    await models.connect();

    for (const nome of models.NOMES_DOS_MODELS) {
      const removidos = await models[nome].syncIndexes();
      const indices = await models[nome].listIndexes();
      logger.info(
        `${nome}: ${indices.map((i) => i.name).join(', ')}` +
          (removidos.length ? ` (removidos: ${removidos.join(', ')})` : ''),
      );
    }
  } catch (e) {
    logger.error(`Falha ao sincronizar índices: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await models.disconnect();
  }
})();
