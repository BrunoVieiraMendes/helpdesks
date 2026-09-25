const { Schema } = require('mongoose');

const CategoriaSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da categoria é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 60,
    },
    descricao: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

CategoriaSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = CategoriaSchema;
