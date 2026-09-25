// Presença dos agentes: quem está com o sistema aberto agora.
// O navegador de cada agente/admin manda um sinal a cada minuto (public/js/presenca.js).
// - Online: sinal recente e a pessoa mexeu no sistema nos últimos minutos
// - Ausente: sistema aberto (sinal recente), mas parado ou em outra aba
// - Offline: sem sinal há mais de alguns minutos, ou saiu do sistema
const mongoose = require('mongoose');

const { Usuario, Chamado, Equipe } = require('../models');
const { erroDeValidacao } = require('../utils');
const { PAPEIS_DA_EQUIPE } = require('../constants');
const { ehEquipe } = require('./permissoes');
const { STATUS_ABERTOS } = require('./regras-chamado');

const MINUTO = 60000;
// sem sinal há mais que isso = offline (o sinal vem a cada 60s; folga para atrasos do navegador)
const LIMITE_SINAL_MS = 3 * MINUTO;

/**
 * Registra o sinal de presença do usuário logado (só equipe).
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {{ ativo?: boolean, saindo?: boolean }} dados
 */
const registraPresenca = async (usuario, dados = {}) => {
  if (!ehEquipe(usuario)) return;
  const agora = new Date();
  const $set = dados.saindo
    ? { 'presenca.vistoEm': null, 'presenca.ativoEm': null }
    : { 'presenca.vistoEm': agora, ...(dados.ativo && { 'presenca.ativoEm': agora }) };
  // sem timestamps: o sinal não conta como "alteração do cadastro"
  await Usuario.updateOne({ _id: usuario._id }, { $set }, { timestamps: false });
};

const situacao = (presenca, agora) => {
  const visto = presenca?.vistoEm ? new Date(presenca.vistoEm).getTime() : 0;
  const ativo = presenca?.ativoEm ? new Date(presenca.ativoEm).getTime() : 0;
  if (!visto || agora - visto > LIMITE_SINAL_MS) return 'offline';
  // o navegador só manda "ativo" com interação recente e a aba visível
  return ativo && visto - ativo < MINUTO / 2 ? 'online' : 'ausente';
};

/**
 * Agentes e admins ativos com a situação de presença, equipes e carga (tickets em aberto).
 * @param {{ equipe?: string }} [query]
 */
const listaPresenca = async (query = {}) => {
  const filtro = { ativo: true, papel: { $in: PAPEIS_DA_EQUIPE } };
  if (query.equipe) {
    if (!mongoose.isValidObjectId(query.equipe))
      throw erroDeValidacao({ equipe: 'Equipe inválida' });
    filtro.equipes = query.equipe;
  }
  const [pessoas, equipes] = await Promise.all([
    Usuario.find(filtro).select('nome email papel equipes +presenca').lean(),
    Equipe.find().select('nome').lean(),
  ]);
  const nomes = new Map(equipes.map((e) => [String(e._id), e.nome]));
  const cargas = await Chamado.aggregate([
    {
      $match: { responsavel: { $in: pessoas.map((p) => p._id) }, status: { $in: STATUS_ABERTOS } },
    },
    { $group: { _id: '$responsavel', total: { $sum: 1 } } },
  ]);
  const carga = new Map(cargas.map((c) => [String(c._id), c.total]));

  const agora = Date.now();
  const ORDEM = { online: 0, ausente: 1, offline: 2 };
  const agentes = pessoas
    .map((p) => ({
      _id: p._id,
      nome: p.nome,
      email: p.email,
      papel: p.papel,
      equipes: (p.equipes || []).map((id) => nomes.get(String(id))).filter(Boolean),
      situacao: situacao(p.presenca, agora),
      vistoEm: p.presenca?.vistoEm || null,
      ativoEm: p.presenca?.ativoEm || null,
      emAberto: carga.get(String(p._id)) || 0,
    }))
    .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.nome.localeCompare(b.nome, 'pt-BR'));

  const resumo = { online: 0, ausente: 0, offline: 0 };
  agentes.forEach((a) => {
    resumo[a.situacao] += 1;
  });
  return { agentes, resumo, atualizadoEm: new Date(agora) };
};

module.exports = { registraPresenca, listaPresenca };
