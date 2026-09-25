const { Schema } = require('mongoose');

// Dia sem expediente: o relógio do SLA não corre.
// A data fica como texto (AAAA-MM-DD) para não sofrer com fuso horário.
const FeriadoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome do feriado é obrigatório'],
      trim: true,
      maxlength: 80,
    },
    data: {
      type: String,
      required: [true, 'Data é obrigatória'],
      unique: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)'],
    },
    // repete todo ano no mesmo dia e mês (ex.: Natal)
    recorrente: {
      type: Boolean,
      default: false,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

FeriadoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = FeriadoSchema;
