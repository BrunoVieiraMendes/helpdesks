const { Schema } = require('mongoose');
const { PAPEIS } = require('../constants');

const UsuarioSchema = new Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      minlength: [2, 'Nome muito curto'],
      maxlength: 120,
    },
    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'E-mail inválido'],
    },
    senha: {
      type: String,
      required: true,
      select: false, // hash bcrypt, nunca sai nas consultas por padrão
    },
    papel: {
      type: String,
      enum: Object.values(PAPEIS),
      default: PAPEIS.CLIENTE,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    // equipes de atendimento das quais o agente/admin faz parte
    equipes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Equipe',
      },
    ],
    // empresa do cliente (agentes e admins não têm)
    empresa: {
      type: Schema.Types.ObjectId,
      ref: 'Empresa',
      default: null,
    },
    // perfil de acesso (null = perfil padrão do tipo); admin não usa perfil
    perfil: {
      type: Schema.Types.ObjectId,
      ref: 'Perfil',
      default: null,
    },
    cargo: {
      type: Schema.Types.ObjectId,
      ref: 'Cargo',
      default: null,
    },
    classificacao: {
      type: Schema.Types.ObjectId,
      ref: 'Classificacao',
      default: null,
    },
    // presença (agentes/admins): o navegador avisa a cada minuto enquanto o sistema está aberto.
    // vistoEm = último sinal; ativoEm = último sinal com a pessoa mexendo no sistema.
    // Fora das consultas por padrão: só a tela "Agentes online" lê.
    presenca: {
      type: new Schema(
        { vistoEm: { type: Date, default: null }, ativoEm: { type: Date, default: null } },
        { _id: false },
      ),
      default: undefined,
      select: false,
    },
  },
  { timestamps: true },
);

// listar agentes ativos (select de responsável, filtros)
UsuarioSchema.index({ papel: 1, ativo: 1 });
// membros de uma equipe
UsuarioSchema.index({ equipes: 1 });
// clientes de uma empresa
UsuarioSchema.index({ empresa: 1 });
// pessoas de um perfil de acesso (trava de remoção e contagem na tela)
UsuarioSchema.index({ perfil: 1 });

// nunca expõe o hash, mesmo se ele tiver sido selecionado explicitamente
UsuarioSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.senha;
    delete ret.__v;
    return ret;
  },
});

module.exports = UsuarioSchema;
