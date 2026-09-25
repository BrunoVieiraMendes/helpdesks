const { Chamado, Interacao, Usuario } = require('../models');
const { PAPEIS_DA_EQUIPE, ROTULOS_PRIORIDADE } = require('../constants');
const { ehEquipe } = require('./permissoes');
const { POPULA_CHAMADO } = require('./busca-chamado');
const { obtemConfigEmail } = require('./email-config');
const enviaEmail = require('./envia-email');
const { logger } = require('../utils');

/**
 * Chamado aberto: confirmação para o cliente e aviso para cada agente da equipe
 * (um e-mail por pessoa, sem expor os endereços uns dos outros).
 */
const notificaNovoChamado = async ({ chamadoId }) => {
  const { avisos } = await obtemConfigEmail();
  const chamado = await Chamado.findById(chamadoId).populate(POPULA_CHAMADO).lean();
  if (!chamado) return;

  if (avisos.confirmacaoCliente && chamado.solicitante?.email) {
    await enviaEmail({
      para: chamado.solicitante.email,
      assunto: `[#${chamado.numero}] Recebemos o seu chamado: ${chamado.titulo}`,
      template: 'novo-chamado',
      dados: { chamado },
      chamado: chamado.numero,
      respondivel: true,
    });
  }

  if (!avisos.novoChamadoEquipe || !chamado.equipe) return;
  const agentes = await Usuario.find({
    equipes: chamado.equipe._id,
    ativo: true,
    papel: { $in: PAPEIS_DA_EQUIPE },
  })
    .select('nome email')
    .lean();

  for (const agente of agentes) {
    try {
      await enviaEmail({
        para: agente.email,
        assunto: `[#${chamado.numero}] Novo chamado na fila ${chamado.equipe.nome}: ${chamado.titulo}`,
        template: 'novo-chamado-equipe',
        dados: { chamado, rotuloUrgencia: ROTULOS_PRIORIDADE[chamado.prioridade] },
        chamado: chamado.numero,
      });
    } catch (e) {
      logger.error(`Falha ao avisar ${agente.email} do chamado #${chamado.numero}: ${e.message}`);
    }
  }
};

/**
 * Resposta pública da equipe -> e-mail para o cliente (ele pode responder o e-mail).
 * Resposta do cliente -> e-mail para o responsável (se houver).
 */
const notificaNovaResposta = async ({ interacaoId }) => {
  const { avisos } = await obtemConfigEmail();
  const interacao = await Interacao.findById(interacaoId).populate('autor', 'nome papel').lean();
  if (!interacao) return;

  const chamado = await Chamado.findById(interacao.chamado).populate(POPULA_CHAMADO).lean();
  if (!chamado) return;

  const daEquipe = ehEquipe(interacao.autor);
  if (daEquipe ? !avisos.respostaParaCliente : !avisos.respostaParaResponsavel) return;
  const destinatario = daEquipe ? chamado.solicitante : chamado.responsavel;
  if (!destinatario?.email) {
    logger.debug(`Chamado #${chamado.numero} sem destinatário para notificar`);
    return;
  }

  await enviaEmail({
    para: destinatario.email,
    assunto: `[#${chamado.numero}] Nova resposta: ${chamado.titulo}`,
    template: 'nova-resposta',
    dados: { chamado, interacao, destinatario },
    chamado: chamado.numero,
    respondivel: daEquipe,
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
