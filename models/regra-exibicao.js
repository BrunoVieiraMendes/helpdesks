const { Schema } = require('mongoose');
const { ALVOS_DE_CAMPO } = require('../constants');

// Regra para exibição: QUANDO o chamado atende às condições, EXIBE os campos adicionais.
// Um campo citado em alguma regra só aparece quando uma regra dele casar.
// Condições vazias valem para qualquer valor.
const CondicaoDeCampoSchema = new Schema(
  {
    campo: { type: Schema.Types.ObjectId, ref: 'CampoAdicional', required: true },
    valores: [{ type: String, trim: true }],
  },
  { _id: false },
);

const RegraExibicaoSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome da regra é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    // "Regra para"
    alvo: {
      type: String,
      enum: Object.keys(ALVOS_DE_CAMPO),
      default: 'chamado',
    },
    // quando
    servicos: [{ type: Schema.Types.ObjectId, ref: 'Servico' }],
    categorias: [{ type: Schema.Types.ObjectId, ref: 'Categoria' }],
    condicaoCampo: { type: CondicaoDeCampoSchema, default: null },
    // então
    campos: {
      type: [{ type: Schema.Types.ObjectId, ref: 'CampoAdicional' }],
      validate: [(v) => v.length > 0, 'Escolha pelo menos um campo para exibir'],
    },
    tornarObrigatorios: { type: Boolean, default: false },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

RegraExibicaoSchema.index({ alvo: 1, ativo: 1 });
RegraExibicaoSchema.index({ campos: 1 });

RegraExibicaoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = RegraExibicaoSchema;
