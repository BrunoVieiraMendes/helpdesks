const { Schema } = require('mongoose');
const { TIPOS_DE_PERFIL } = require('../constants');

// Perfil de acesso: conjunto de permissões atribuído a agentes ou a clientes.
// Quem não tem perfil usa o perfil padrão do seu tipo (ou as permissões padrão do sistema).
const PerfilSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome do perfil é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    // "Perfil de": agente ou cliente
    tipo: {
      type: String,
      enum: { values: TIPOS_DE_PERFIL, message: 'Tipo de perfil inválido' },
      required: [true, 'Informe se o perfil é de agente ou de cliente'],
    },
    // aplicado a quem não tem perfil definido (no máximo um por tipo)
    padrao: {
      type: Boolean,
      default: false,
    },
    // chave da permissão (constants.PERMISSOES) -> liberada ou não
    permissoes: {
      type: Map,
      of: Boolean,
      default: () => ({}),
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

PerfilSchema.index({ tipo: 1, padrao: 1 });

PerfilSchema.set('toJSON', {
  flattenMaps: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = PerfilSchema;
