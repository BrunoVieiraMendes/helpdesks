const { Schema } = require('mongoose');

// Registro de cada e-mail lido da caixa de entrada: evita processar duas vezes a mesma
// mensagem (Message-ID) e mostra ao admin o que aconteceu com ela. Some depois de 90 dias.
const EmailRecebidoSchema = new Schema(
  {
    messageId: { type: String, required: true },
    de: { type: String, default: '' },
    nome: { type: String, default: '' },
    assunto: { type: String, default: '' },
    // novo-chamado | resposta | ignorado | erro
    resultado: { type: String, required: true },
    numero: { type: Number, default: null },
    detalhe: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EmailRecebidoSchema.index({ messageId: 1 }, { unique: true });
EmailRecebidoSchema.index({ createdAt: -1 });
EmailRecebidoSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

EmailRecebidoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = EmailRecebidoSchema;
