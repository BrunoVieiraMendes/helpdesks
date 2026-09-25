const { Schema } = require('mongoose');
const { TIPOS_INTERACAO } = require('../constants');

// Timeline do chamado. Coleção separada (e não array dentro do chamado)
// para não esbarrar no limite de 16 MB por documento, permitir paginação
// e filtrar notas internas na própria consulta.
const EventoSchema = new Schema(
  {
    campo: { type: String, required: true },
    de: { type: String, default: null },
    para: { type: String, default: null },
  },
  { _id: false },
);

const InteracaoSchema = new Schema(
  {
    chamado: {
      type: Schema.Types.ObjectId,
      ref: 'Chamado',
      required: true,
      immutable: true,
    },
    autor: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null, // null = evento do sistema
    },
    tipo: {
      type: String,
      enum: Object.values(TIPOS_INTERACAO),
      required: true,
    },
    mensagem: {
      type: String,
      required: [true, 'Mensagem é obrigatória'],
      trim: true,
      maxlength: [20000, 'Mensagem muito longa'],
    },
    // mensagem que chegou por outro canal (ex.: 'whatsapp'); vazio = pelo sistema
    canal: { type: String, enum: ['email', 'whatsapp'], default: undefined },
    evento: {
      type: EventoSchema,
      default: undefined, // só existe em interações do tipo 'sistema'
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// timeline de um chamado em ordem cronológica
InteracaoSchema.index({ chamado: 1, createdAt: 1 });

InteracaoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = InteracaoSchema;
