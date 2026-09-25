const mongoose = require('mongoose');
const createError = require('http-errors');

const { Chamado } = require('../models');
const { PRIORIDADES } = require('../constants');
const { erroDeValidacao } = require('../utils');
const { ehEquipe, pode } = require('./permissoes');
const {
  validaCategoria,
  validaResponsavel,
  validaSolicitante,
  validaServico,
} = require('./valida-referencias');
const proximoNumeroDeChamado = require('./proximo-numero');
const { prazosIniciais } = require('./sla');
const { validaCamposAdicionais } = require('./campos-adicionais');
const { detalhaChamado } = require('./busca-chamado');
const { enfileira } = require('../workers/filas');
const { notificaEquipeDoChamado } = require('./notificacoes-do-sistema');

// executa uma validação acumulando os erros por campo (para o formulário mostrar todos de uma vez)
const coleta = async (erros, validacao) => {
  try {
    return await validacao();
  } catch (e) {
    if (e.detalhes) Object.assign(erros, e.detalhes);
    else if (e instanceof mongoose.Error.ValidationError) {
      for (const [campo, erro] of Object.entries(e.errors)) erros[campo] = erro.message;
    } else throw e;
    return null;
  }
};

/**
 * Abre um chamado. O serviço escolhido no catálogo define a equipe que vai atender.
 * - Cliente: sempre é o solicitante; prioridade fica "normal" (a triagem é da equipe).
 * - Agente/Admin: pode abrir em nome de um cliente, definir prioridade e responsável
 *   (o responsável precisa ser da equipe do serviço).
 * @param {{ titulo?: string, descricao?: string, servico?: string, categoria?: string, prioridade?: string, solicitante?: string, responsavel?: string, camposAdicionais?: Record<string, any> }} dados
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {{ porEmail?: boolean }} [opcoes]  porEmail: aberto por e-mail (campos adicionais obrigatórios
 *   não são exigidos, porque quem escreve o e-mail não tem como preenchê-los)
 */
const criaChamado = async (dados, usuario, { porEmail = false } = {}) => {
  if (!ehEquipe(usuario) && !pode(usuario, 'abrirChamados')) {
    throw createError(403, 'Seu perfil de acesso não permite abrir chamados. Fale com o suporte.');
  }
  const erros = {};
  const servico = await coleta(erros, () => validaServico(dados.servico));
  const categoria = await coleta(erros, () => validaCategoria(dados.categoria));

  const chamado = new Chamado({
    titulo: dados.titulo,
    descricao: dados.descricao,
    servico: servico?._id ?? null,
    equipe: servico?.equipe ?? null,
    categoria: categoria?._id ?? null,
    solicitante: usuario._id,
    empresa: ehEquipe(usuario) ? null : (usuario.empresa ?? null),
    prioridade: PRIORIDADES.NORMAL,
    origem: porEmail ? 'email' : 'sistema',
  });

  if (ehEquipe(usuario)) {
    if (dados.solicitante && !pode(usuario, 'abrirEmNomeDeCliente')) {
      erros.solicitante = 'Seu perfil de acesso não permite abrir chamados em nome de clientes';
    } else if (dados.solicitante) {
      const solicitante = await coleta(erros, () => validaSolicitante(dados.solicitante));
      if (solicitante) {
        chamado.solicitante = solicitante._id;
        chamado.empresa = solicitante.empresa ?? null;
      }
    }
    if (dados.prioridade && dados.prioridade !== chamado.prioridade) {
      if (pode(usuario, 'alterarPrioridade')) chamado.prioridade = dados.prioridade;
      else erros.prioridade = 'Seu perfil de acesso não permite definir a prioridade';
    }
    if (dados.responsavel && servico) {
      const responsavel = await coleta(erros, () =>
        validaResponsavel(dados.responsavel, servico.equipe),
      );
      if (responsavel) chamado.responsavel = responsavel._id;
    }
  }

  // campos adicionais visíveis para o serviço/categoria escolhidos (obrigatórios exigidos)
  const campos = await coleta(erros, () =>
    validaCamposAdicionais(
      dados.camposAdicionais,
      { servico: servico?._id, categoria: categoria?._id },
      usuario,
      { exigeObrigatorios: !porEmail },
    ),
  );
  const preenchidos = Object.entries(campos || {}).filter(([, valor]) => valor !== null);
  if (preenchidos.length) chamado.camposAdicionais = Object.fromEntries(preenchidos);

  // valida antes de consumir um número da sequência
  await coleta(erros, () => chamado.validate({ pathsToSkip: ['numero'] }));
  if (Object.keys(erros).length) throw erroDeValidacao(erros);

  // prazos de SLA contados a partir da abertura, conforme o acordo da urgência
  const agora = new Date();
  const prazos = await prazosIniciais(agora, chamado.prioridade);
  chamado.createdAt = agora;
  chamado.sla.prazoPrimeiraResposta = prazos.prazoPrimeiraResposta;
  chamado.sla.prazoSolucao = prazos.prazoSolucao;

  chamado.numero = await proximoNumeroDeChamado();
  await chamado.save();

  await enfileira('notificacoes', { tipo: 'novo-chamado', chamadoId: String(chamado._id) });
  // sino dos agentes da equipe (funciona mesmo sem Redis)
  await notificaEquipeDoChamado('novo-chamado', chamado._id, usuario);

  return detalhaChamado(chamado._id, usuario);
};

module.exports = criaChamado;
