const { Schema } = require('mongoose');
const { STATUS, PRIORIDADES, PESOS_PRIORIDADE } = require('../constants');

const SlaSchema = new Schema(
  {
    // 1ª resposta PÚBLICA de alguém da equipe
    primeiraRespostaEm: { type: Date, default: null },
    // zerado se o chamado for reaberto
    resolvidoEm: { type: Date, default: null },
    fechadoEm: { type: Date, default: null },
    // prazos calculados em horário útil a partir do acordo da urgência (Acordos > SLA)
    prazoPrimeiraResposta: { type: Date, default: null },
    prazoSolucao: { type: Date, default: null },
    // relógio parado (status Pendente): início da pausa atual e total já pausado
    pausadoEm: { type: Date, default: null },
    minutosPausados: { type: Number, default: 0 },
  },
  { _id: false },
);

// Pesquisa de satisfação respondida pelo solicitante após a solução
const AvaliacaoSchema = new Schema(
  {
    nota: { type: Number, min: 1, max: 5, required: true },
    comentario: { type: String, trim: true, maxlength: 1000, default: '' },
    em: { type: Date, required: true },
  },
  { _id: false },
);

const ChamadoSchema = new Schema(
  {
    numero: {
      type: Number,
      required: true,
      unique: true,
      immutable: true,
    },
    titulo: {
      type: String,
      required: [true, 'Título é obrigatório'],
      trim: true,
      minlength: [3, 'Título muito curto'],
      maxlength: [150, 'Título deve ter no máximo 150 caracteres'],
    },
    descricao: {
      type: String,
      required: [true, 'Descrição é obrigatória'],
      trim: true,
      maxlength: [20000, 'Descrição muito longa'],
    },
    solicitante: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      immutable: true,
    },
    responsavel: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
    categoria: {
      type: Schema.Types.ObjectId,
      ref: 'Categoria',
      default: null,
    },
    // serviço escolhido no catálogo
    servico: {
      type: Schema.Types.ObjectId,
      ref: 'Servico',
      default: null,
    },
    // equipe responsável (vem do serviço; pode ser transferida)
    equipe: {
      type: Schema.Types.ObjectId,
      ref: 'Equipe',
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.NOVO,
    },
    prioridade: {
      type: String,
      enum: Object.values(PRIORIDADES),
      default: PRIORIDADES.NORMAL,
    },
    pesoPrioridade: {
      type: Number,
      min: 1,
      max: 4,
    },
    // empresa do solicitante na abertura
    empresa: {
      type: Schema.Types.ObjectId,
      ref: 'Empresa',
      default: null,
    },
    tags: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Tag',
      },
    ],
    // motivo do status atual (ex.: por que está Pendente)
    justificativa: {
      type: Schema.Types.ObjectId,
      ref: 'Justificativa',
      default: null,
    },
    sla: {
      type: SlaSchema,
      default: () => ({}),
    },
    avaliacao: {
      type: AvaliacaoSchema,
      default: null,
    },
    // valores dos campos adicionais: _id do campo -> valor (texto, número, data AAAA-MM-DD, booleano ou _id da pessoa)
    camposAdicionais: {
      type: Map,
      of: Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }, // createdAt = abertura, updatedAt = última atualização
);

// mantém o peso sempre coerente com a prioridade em saves
ChamadoSchema.pre('validate', function (next) {
  this.pesoPrioridade = PESOS_PRIORIDADE[this.prioridade];
  next();
});

// Índices pensados para as consultas reais do sistema:
// Meus Chamados (portal do cliente)
ChamadoSchema.index({ solicitante: 1, updatedAt: -1 });
// fila / colunas do Kanban: status + ordem por prioridade e recência
ChamadoSchema.index({ status: 1, pesoPrioridade: -1, updatedAt: -1 });
// filtro por responsável e "meus atendimentos"
ChamadoSchema.index({ responsavel: 1, status: 1, updatedAt: -1 });
// fila da equipe: agentes só enxergam chamados das suas equipes
ChamadoSchema.index({ equipe: 1, status: 1, pesoPrioridade: -1, updatedAt: -1 });
// filtros por tag e por empresa
ChamadoSchema.index({ tags: 1, updatedAt: -1 });
ChamadoSchema.index({ empresa: 1, updatedAt: -1 });
// SLA vencido / em risco: chamados abertos pelo prazo de solução
ChamadoSchema.index({ status: 1, 'sla.prazoSolucao': 1 });

ChamadoSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = ChamadoSchema;
