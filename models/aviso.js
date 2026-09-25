const { Schema } = require('mongoose');
const { PUBLICOS_DE_AVISO } = require('../constants');

// Aviso do mural (página Início da equipe e portal do cliente).
// Aparece enquanto estiver habilitado e dentro da validade.
const AvisoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Título do aviso é obrigatório'],
      trim: true,
      maxlength: 120,
    },
    mensagem: {
      type: String,
      required: [true, 'Escreva a mensagem do aviso'],
      trim: true,
      maxlength: 2000,
    },
    publico: {
      type: String,
      enum: { values: Object.keys(PUBLICOS_DE_AVISO), message: 'Público inválido' },
      default: 'equipe',
    },
    // AAAA-MM-DD; vazio = sem prazo
    validoAte: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)'],
    },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

AvisoSchema.index({ ativo: 1, publico: 1, createdAt: -1 });

AvisoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = AvisoSchema;
