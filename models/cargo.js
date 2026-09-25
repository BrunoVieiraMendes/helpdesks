const { Schema } = require('mongoose');

// Cargo da pessoa na empresa (ex.: Analista de Suporte, Gerente Financeiro).
const CargoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome do cargo é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

CargoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = CargoSchema;
