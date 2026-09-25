const { Schema } = require('mongoose');
const { STATUS } = require('../constants');

// Motivo exigido ao mover o chamado para determinados status
// (ex.: Pendente -> "Aguardando retorno do cliente", "Aguardando fornecedor").
// Se existir ao menos uma justificativa ativa para o status, ela passa a ser obrigatória.
const JustificativaSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da justificativa é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    status: {
      type: [{ type: String, enum: Object.values(STATUS) }],
      validate: [(v) => v.length > 0, 'Informe em quais status a justificativa se aplica'],
      default: [STATUS.PENDENTE],
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

JustificativaSchema.index({ status: 1, ativa: 1 });

JustificativaSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = JustificativaSchema;
