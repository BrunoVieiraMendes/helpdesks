const { Schema } = require('mongoose');

// Conta do WhatsApp (API oficial da Meta — WhatsApp Cloud API). Documento único "whatsapp",
// só o admin lê/altera. O token de acesso e a chave secreta do app ficam cifrados (utils/cifra)
// e nunca voltam para a tela.
const ModeloSchema = new Schema(
  {
    // modelo de mensagem aprovado na Meta, usado para chamar o cliente fora da janela de 24h.
    // Deve ter uma variável ({{1}}), que recebe o número do chamado.
    nome: { type: String, trim: true, maxlength: 512, default: '' },
    idioma: { type: String, trim: true, maxlength: 15, default: 'pt_BR' },
  },
  { _id: false },
);

const AvisosSchema = new Schema(
  {
    // chamado aberto pelo WhatsApp: responde com o número do chamado
    confirmacaoCliente: { type: Boolean, default: true },
    // resposta pública da equipe em chamado aberto pelo WhatsApp: vai para o WhatsApp do cliente
    respostaParaCliente: { type: Boolean, default: true },
  },
  { _id: false },
);

const ConfiguracaoWhatsappSchema = new Schema(
  {
    _id: { type: String, default: 'whatsapp' },
    ativo: { type: Boolean, default: false },
    // "Identificação do número de telefone" (Phone number ID) no painel da Meta
    numeroId: { type: String, trim: true, maxlength: 40, default: '' },
    // "Identificação da conta do WhatsApp Business" (opcional, só informativo)
    contaId: { type: String, trim: true, maxlength: 40, default: '' },
    tokenCifrado: { type: String, default: '' },
    // chave secreta do app: confere a assinatura (X-Hub-Signature-256) de cada aviso da Meta
    segredoCifrado: { type: String, default: '' },
    // texto combinado com a Meta ao cadastrar o webhook (gerado pelo Help Desk)
    tokenVerificacao: { type: String, default: '' },
    versaoApi: { type: String, trim: true, maxlength: 10, default: 'v21.0' },
    // serviço (e portanto a equipe) dos chamados abertos pelo WhatsApp
    servicoPadrao: { type: Schema.Types.ObjectId, ref: 'Servico', default: null },
    // número sem cadastro: cria o cliente (true) ou ignora a mensagem (false)
    criarClientes: { type: Boolean, default: true },
    avisos: { type: AvisosSchema, default: () => ({}) },
    modelo: { type: ModeloSchema, default: () => ({}) },
    // preenchidos pelo "Testar conexão"
    numeroExibicao: { type: String, default: '' },
    nomeVerificado: { type: String, default: '' },
    ultimoRecebimento: { type: Date, default: null },
    ultimoErro: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false },
);

module.exports = ConfiguracaoWhatsappSchema;
