const { Schema } = require('mongoose');

// Cada mensagem de WhatsApp que entrou ou saiu. Serve para:
// - não processar duas vezes a mesma mensagem (a Meta reenvia avisos);
// - acompanhar a entrega das mensagens enviadas (enviada, entregue, lida, falhou);
// - guardar respostas que esperam a janela de 24h reabrir;
// - mostrar ao admin o que aconteceu com cada mensagem. Some depois de 90 dias.
const MensagemWhatsappSchema = new Schema(
  {
    // id da mensagem na Meta (wamid...). Mensagens que ainda não saíram não têm.
    waId: { type: String, default: undefined },
    direcao: { type: String, enum: ['entrada', 'saida'], required: true },
    // número do cliente (só dígitos, com DDI)
    numero: { type: String, required: true },
    nome: { type: String, default: '' },
    // text, image, document, audio... (entrada) | texto, modelo (saída)
    tipo: { type: String, default: 'text' },
    texto: { type: String, default: '', maxlength: 5000 },
    // entrada: processando | novo-chamado | resposta | ignorado | erro
    // saída: aguardando (fora da janela de 24h) | enviada | entregue | lida | falha
    resultado: { type: String, required: true },
    chamado: { type: Schema.Types.ObjectId, ref: 'Chamado', default: null },
    numeroChamado: { type: Number, default: null },
    interacao: { type: Schema.Types.ObjectId, ref: 'Interacao', default: null },
    detalhe: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true },
);

MensagemWhatsappSchema.index({ waId: 1 }, { unique: true, sparse: true });
MensagemWhatsappSchema.index({ createdAt: -1 });
// respostas esperando o cliente escrever de novo
MensagemWhatsappSchema.index({ numero: 1, resultado: 1, createdAt: 1 });
MensagemWhatsappSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

MensagemWhatsappSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = MensagemWhatsappSchema;
