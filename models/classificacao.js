const { Schema } = require('mongoose');

// Classificação da pessoa (ex.: Cliente, Funcionário Interno, Revenda / Parceiro).
const ClassificacaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da classificação é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

ClassificacaoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = ClassificacaoSchema;
