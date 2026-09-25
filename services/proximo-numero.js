const { Contador } = require('../models');
const { NUMERO_INICIAL_CHAMADO } = require('../constants');

/**
 * Gera o próximo número legível de chamado (#1001, #1002...).
 * O $inc é atômico: dois chamados abertos ao mesmo tempo nunca recebem o mesmo número.
 * @returns {Promise<number>}
 */
const proximoNumeroDeChamado = async () => {
  // garante o ponto de partida sem sobrescrever uma sequência existente
  await Contador.updateOne(
    { _id: 'chamado' },
    { $setOnInsert: { seq: NUMERO_INICIAL_CHAMADO } },
    { upsert: true },
  );

  const contador = await Contador.findOneAndUpdate(
    { _id: 'chamado' },
    { $inc: { seq: 1 } },
    { new: true },
  );

  return contador.seq;
};

module.exports = proximoNumeroDeChamado;
