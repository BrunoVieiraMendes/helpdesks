const { Schema } = require('mongoose');

// Item do catálogo de serviços que o cliente escolhe ao abrir um chamado.
// Cada serviço encaminha o chamado para uma equipe.
const ServicoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome do serviço é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 60,
    },
    descricao: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    equipe: {
      type: Schema.Types.ObjectId,
      ref: 'Equipe',
      required: [true, 'Informe a equipe que atende este serviço'],
    },
    cor: {
      type: String,
      default: '#2458d6',
      match: [/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB)'],
    },
    ordem: {
      type: Number,
      default: 0,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// catálogo: serviços ativos na ordem definida pelo admin
ServicoSchema.index({ ativo: 1, ordem: 1 });
ServicoSchema.index({ equipe: 1 });

ServicoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = ServicoSchema;
