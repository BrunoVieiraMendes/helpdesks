const mongoose = require('mongoose');

/**
 * Próximo valor de uma sequência atômica (coleção contadores).
 * @param {string} nome  ex.: 'codigo:Tag'
 * @returns {Promise<number>}
 */
const proximoCodigo = async (nome) => {
  const contador = await mongoose
    .model('Contador')
    .findOneAndUpdate({ _id: nome }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return contador.seq;
};

/**
 * Plugin: Id numérico legível ("Id" das listas do painel, como no Movidesk).
 * Gerado ao criar pelo Mongoose; registros inseridos por fora (seed, bancos antigos)
 * recebem o código em preencheCodigos().
 * @param {import('mongoose').Schema} schema
 */
const codigoSequencial = (schema) => {
  schema.add({ codigo: { type: Number, immutable: true } });
  schema.index({ codigo: 1 }, { unique: true, sparse: true });

  schema.pre('save', async function () {
    if (this.isNew && this.codigo === undefined) {
      this.codigo = await proximoCodigo(`codigo:${this.constructor.modelName}`);
    }
  });
};

/**
 * Dá código aos registros que ainda não têm, na ordem de criação.
 * O update é condicional: rodar duas vezes ao mesmo tempo não repete códigos.
 * @param {import('mongoose').Model<any>} Model
 * @returns {Promise<number>} quantos receberam código
 */
const preencheCodigos = async (Model) => {
  const semCodigo = await Model.find({ codigo: { $exists: false } })
    .select('_id')
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  let preenchidos = 0;
  for (const { _id } of semCodigo) {
    const codigo = await proximoCodigo(`codigo:${Model.modelName}`);
    // direto na coleção: o Mongoose ignora $set em campo immutable
    const { modifiedCount } = await Model.collection.updateOne(
      { _id, codigo: { $exists: false } },
      { $set: { codigo } },
    );
    preenchidos += modifiedCount;
  }
  return preenchidos;
};

module.exports = { codigoSequencial, preencheCodigos, proximoCodigo };
