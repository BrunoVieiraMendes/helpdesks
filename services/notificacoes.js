const { Chamado, Interacao, Usuario } = require('../models');
const { PAPEIS_DA_EQUIPE } = require('../constants');
const { ehEquipe } = require('./permissoes');
const { POPULA_CHAMADO } = require('./busca-chamado');
const enviaEmail = require('./envia-email');
const { logger } = require('../utils');

/**
 * Chamado aberto: confirmação para o solicitante e aviso para os agentes da equipe.
 */
const notificaNovoChamado = async ({ chamadoId }) => {
  const chamado = await Chamado.findById(chamadoId).populate(POPULA_CHAMADO).lean();
  if (!chamado) return;

  await enviaEmail({
    para: chamado.solicitante.email,
    assunto: `[#${chamado.numero}] Recebemos o seu chamado`,
    template: 'novo-chamado',
    dados: { chamado },
  });

  if (!chamado.equipe) return;
  const agentes = await Usuario.find({
    equipes: chamado.equipe._id,
    ativo: true,
    papel: { $in: PAPEIS_DA_EQUIPE },
  })
    .select('nome email')
    .lean();

  if (!agentes.length) return;
  await enviaEmail({
    para: agentes.map((a) => a.email).join(', '),
    assunto: `[#${chamado.numero}] Novo chamado na fila ${chamado.equipe.nome}: ${chamado.titulo}`,
    template: 'novo-chamado-equipe',
    dados: { chamado },
  });
};

/**
 * Resposta pública da equipe -> avisa o cliente.
 * Resposta do cliente -> avisa o responsável (se houver).
 */
const notificaNovaResposta = async ({ interacaoId }) => {
  const interacao = await Interacao.findById(interacaoId).populate('autor', 'nome papel').lean();
  if (!interacao) return;

  const chamado = await Chamado.findById(interacao.chamado).populate(POPULA_CHAMADO).lean();
  if (!chamado) return;

  const destinatario = ehEquipe(interacao.autor) ? chamado.solicitante : chamado.responsavel;
  if (!destinatario) {
    logger.debug(`Chamado #${chamado.numero} sem destinatário para notificar`);
    return;
  }

  await enviaEmail({
    para: destinatario.email,
    assunto: `[#${chamado.numero}] Nova resposta: ${chamado.titulo}`,
    template: 'nova-resposta',
    dados: { chamado, interacao, destinatario },
  });
};

const PROCESSADORES = {
  'novo-chamado': notificaNovoChamado,
  'nova-resposta': notificaNovaResposta,
};

/** @param {{ tipo: string } & Record<string, any>} dados */
const processaNotificacao = async (dados) => {
  const processador = PROCESSADORES[dados.tipo];
  if (!processador) throw new Error(`Tipo de notificação desconhecido: ${dados.tipo}`);
  await processador(dados);
};

module.exports = processaNotificacao;
