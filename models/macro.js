const { Schema } = require('mongoose');
const { STATUS, PRIORIDADES, TIPOS_INTERACAO } = require('../constants');

// Macro: resposta pronta + ações aplicadas de uma vez no chamado
// (ex.: "Solicitar print" -> responde o cliente e move para Pendente).
const AcoesSchema = new Schema(
  {
    // fechar pela macro não é permitido: o chamado fechado não aceita a resposta da macro
    status: {
      type: String,
      enum: [...Object.values(STATUS).filter((s) => s !== STATUS.FECHADO), null],
      default: null,
    },
    justificativa: { type: Schema.Types.ObjectId, ref: 'Justificativa', default: null },
    prioridade: { type: String, enum: [...Object.values(PRIORIDADES), null], default: null },
    equipe: { type: Schema.Types.ObjectId, ref: 'Equipe', default: null },
    atribuirAMim: { type: Boolean, default: false },
    adicionarTags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  },
  { _id: false },
);

const MacroSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da macro é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    mensagem: {
      type: String,
      trim: true,
      maxlength: [20000, 'Mensagem muito longa'],
      default: '',
    },
    tipo: {
      type: String,
      enum: [TIPOS_INTERACAO.PUBLICA, TIPOS_INTERACAO.INTERNA],
      default: TIPOS_INTERACAO.PUBLICA,
    },
    acoes: {
      type: AcoesSchema,
      default: () => ({}),
    },
    ativa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

MacroSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = MacroSchema;
