const { Schema } = require('mongoose');
const { TIPOS_DE_NOTIFICACAO } = require('../constants');

// Notificação dentro do sistema (sino da barra do topo), uma por destinatário.
// Some sozinha depois de 90 dias.
const NotificacaoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tipo: {
      type: String,
      enum: { values: Object.keys(TIPOS_DE_NOTIFICACAO), message: 'Tipo de notificação inválido' },
      required: true,
    },
    chamado: { type: Schema.Types.ObjectId, ref: 'Chamado', default: null },
    numero: { type: Number, default: null },
    titulo: { type: String, required: true, maxlength: 200 },
    mensagem: { type: String, default: '', maxlength: 400 },
    // quem causou a notificação (null = sistema)
    autor: { type: Schema.Types.ObjectId, ref: 'Usuario', default: null },
    lida: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// sino: não lidas e as mais recentes de cada pessoa
NotificacaoSchema.index({ usuario: 1, lida: 1, createdAt: -1 });
NotificacaoSchema.index({ usuario: 1, createdAt: -1 });
NotificacaoSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

NotificacaoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = NotificacaoSchema;
