const { Schema } = require('mongoose');
const { SLA_PADRAO, EXPEDIENTE_PADRAO } = require('../constants');

const HORA = [/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM)'];

const ExpedienteSchema = new Schema(
  {
    dias: {
      type: [{ type: Number, min: 0, max: 6 }],
      default: () => [...EXPEDIENTE_PADRAO.dias],
    },
    inicio: { type: String, match: HORA, default: EXPEDIENTE_PADRAO.inicio },
    fim: { type: String, match: HORA, default: EXPEDIENTE_PADRAO.fim },
    // deslocamento do fuso em relação ao UTC, em minutos (Brasília = -180)
    fusoMinutos: { type: Number, min: -720, max: 840, default: EXPEDIENTE_PADRAO.fusoMinutos },
  },
  { _id: false },
);

const minutos = { type: Number, min: [1, 'O prazo deve ser de pelo menos 1 minuto'] };
const PrazoSchema = new Schema({ primeiraResposta: minutos, solucao: minutos }, { _id: false });

const SlaSchema = new Schema(
  Object.fromEntries(
    Object.entries(SLA_PADRAO).map(([prioridade, prazo]) => [
      prioridade,
      { type: PrazoSchema, default: () => ({ ...prazo }) },
    ]),
  ),
  { _id: false },
);

const PesquisaSchema = new Schema(
  {
    ativa: { type: Boolean, default: true },
    pergunta: {
      type: String,
      trim: true,
      maxlength: 200,
      default: 'Como você avalia o atendimento deste chamado?',
    },
  },
  { _id: false },
);

// Documento único (_id 'geral') com os parâmetros da conta.
const ConfiguracaoSchema = new Schema(
  {
    _id: { type: String, default: 'geral' },
    nomeEmpresa: { type: String, trim: true, maxlength: 120, default: 'Help Desk' },
    diasFechamentoAutomatico: {
      type: Number,
      min: [1, 'Mínimo de 1 dia'],
      max: [90, 'Máximo de 90 dias'],
      default: () => Number(process.env.DIAS_PARA_FECHAMENTO_AUTOMATICO) || 3,
    },
    expediente: { type: ExpedienteSchema, default: () => ({}) },
    sla: { type: SlaSchema, default: () => ({}) },
    pesquisa: { type: PesquisaSchema, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

module.exports = ConfiguracaoSchema;
