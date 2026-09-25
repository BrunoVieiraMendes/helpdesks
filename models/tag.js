const { Schema } = require('mongoose');

// Etiquetas livres que a equipe coloca nos chamados (ex.: "cliente vip", "recorrente").
const TagSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da tag é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 40,
    },
    cor: {
      type: String,
      default: '#5f6b7e',
      match: [/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB)'],
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

TagSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = TagSchema;
