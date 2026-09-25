const { Schema } = require('mongoose');
const { TIPOS_DE_CAMPO, ALVOS_DE_CAMPO, TIPOS_DE_PERFIL } = require('../constants');

// Campo personalizado preenchido no chamado (ex.: "Causa raiz", "Código de licença").
// Os valores ficam em Chamado.camposAdicionais, pelo _id do campo.
// Sem regra para exibição que o cite, o campo aparece sempre.
const CampoAdicionalSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome do campo é obrigatório'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    tipo: {
      type: String,
      enum: { values: Object.keys(TIPOS_DE_CAMPO), message: 'Tipo de campo inválido' },
      required: [true, 'Escolha o tipo do campo'],
    },
    // "Campo para"
    alvo: {
      type: String,
      enum: Object.keys(ALVOS_DE_CAMPO),
      default: 'chamado',
    },
    // tipo lista: valores que podem ser escolhidos
    opcoes: [{ type: String, trim: true, maxlength: 120 }],
    // tipo pessoa: de quem é a lista (agente, cliente); vazio = todos
    pessoasDe: [{ type: String, enum: TIPOS_DE_PERFIL }],
    obrigatorio: { type: Boolean, default: false },
    // o cliente vê o campo e o preenche ao abrir o chamado
    visivelParaCliente: { type: Boolean, default: false },
    ajuda: { type: String, trim: true, maxlength: 200, default: '' },
    ordem: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CampoAdicionalSchema.index({ alvo: 1, ativo: 1, ordem: 1 });

CampoAdicionalSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = CampoAdicionalSchema;
