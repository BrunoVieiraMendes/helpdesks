const { Schema } = require('mongoose');

// Equipe de atendimento (ex.: Suporte, TI, Auditoria).
// Os membros ficam em Usuario.equipes: um agente pode estar em várias equipes
// e o JWT carrega o usuário a cada requisição, então mudanças valem na hora.
const EquipeSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da equipe é obrigatório'],
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

EquipeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = EquipeSchema;
