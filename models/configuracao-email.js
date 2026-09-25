const { Schema } = require('mongoose');

// Contas de e-mail do Help Desk (documento único "email", só o admin lê/altera).
// Fica separado de Configuracao para que nenhum endpoint que lê os parâmetros gerais
// leve junto as credenciais. As senhas ficam cifradas (utils/cifra).

const SEGURANCAS = ['nenhuma', 'starttls', 'ssl'];

const EnvioSchema = new Schema(
  {
    ativo: { type: Boolean, default: false },
    host: { type: String, trim: true, maxlength: 200, default: '' },
    porta: { type: Number, min: 1, max: 65535, default: 587 },
    seguranca: { type: String, enum: SEGURANCAS, default: 'starttls' },
    usuario: { type: String, trim: true, maxlength: 200, default: '' },
    senhaCifrada: { type: String, default: '' },
    remetenteNome: { type: String, trim: true, maxlength: 120, default: 'Help Desk' },
    remetenteEmail: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const RecebimentoSchema = new Schema(
  {
    ativo: { type: Boolean, default: false },
    host: { type: String, trim: true, maxlength: 200, default: '' },
    porta: { type: Number, min: 1, max: 65535, default: 993 },
    ssl: { type: Boolean, default: true },
    usuario: { type: String, trim: true, maxlength: 200, default: '' },
    senhaCifrada: { type: String, default: '' },
    pasta: { type: String, trim: true, maxlength: 120, default: 'INBOX' },
    // endereço que os clientes usam para escrever (vai no "Responder para" dos e-mails)
    endereco: { type: String, trim: true, lowercase: true, maxlength: 200, default: '' },
    // serviço (e portanto a equipe) dos chamados abertos por e-mail
    servicoPadrao: { type: Schema.Types.ObjectId, ref: 'Servico', default: null },
    // remetente sem cadastro: cria o cliente (true) ou ignora o e-mail (false)
    criarClientes: { type: Boolean, default: true },
    intervaloMinutos: { type: Number, min: 1, max: 60, default: 2 },
    ultimaVerificacao: { type: Date, default: null },
    ultimoErro: { type: String, default: '' },
  },
  { _id: false },
);

const AvisosSchema = new Schema(
  {
    // novo chamado: e-mail para os agentes da equipe
    novoChamadoEquipe: { type: Boolean, default: true },
    // novo chamado: confirmação para o cliente
    confirmacaoCliente: { type: Boolean, default: true },
    // resposta pública da equipe: e-mail para o cliente
    respostaParaCliente: { type: Boolean, default: true },
    // resposta do cliente: e-mail para o responsável
    respostaParaResponsavel: { type: Boolean, default: true },
  },
  { _id: false },
);

const ConfiguracaoEmailSchema = new Schema(
  {
    _id: { type: String, default: 'email' },
    envio: { type: EnvioSchema, default: () => ({}) },
    recebimento: { type: RecebimentoSchema, default: () => ({}) },
    avisos: { type: AvisosSchema, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

ConfiguracaoEmailSchema.statics.SEGURANCAS = SEGURANCAS;

module.exports = ConfiguracaoEmailSchema;
