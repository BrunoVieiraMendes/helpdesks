const { Schema } = require('mongoose');

// Empresa (organização) dos clientes. Cada cliente pode pertencer a uma empresa,
// e o chamado guarda a empresa do solicitante no momento da abertura.
const EmpresaSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da empresa é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 120,
    },
    cnpj: {
      type: String,
      trim: true,
      maxlength: 18,
      match: [/^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})?$/, 'CNPJ inválido'],
    },
    telefone: {
      type: String,
      trim: true,
      maxlength: 30,
    },
    observacoes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

EmpresaSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = EmpresaSchema;
