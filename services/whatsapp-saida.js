// Mensagens do Help Desk para o WhatsApp do cliente (chamados abertos pelo WhatsApp).
//
// Regra da Meta: texto livre só até 24h depois da última mensagem do cliente (a "janela").
// Fora dela, a resposta fica guardada ("aguardando") e é entregue assim que o cliente escrever
// de novo. Se houver um modelo aprovado configurado, ele é enviado para chamar o cliente.
// Toda falha vira um aviso no histórico do chamado, para a equipe saber.
const { Chamado, Interacao, MensagemWhatsapp, Usuario } = require('../models');
const { STATUS, TIPOS_INTERACAO } = require('../constants');
const { logger } = require('../utils');
const { ehEquipe } = require('./permissoes');
const { obtemConfigWhatsapp } = require('./whatsapp-config');
const { enviaTexto, enviaModelo } = require('./whatsapp-api');

// margem de 10 minutos antes das 24h da Meta
const JANELA_MS = 24 * 60 * 60 * 1000 - 10 * 60 * 1000;
// respostas guardadas há mais tempo que isso não são mais entregues
const VALIDADE_DAS_PENDENTES_MS = 7 * 24 * 60 * 60 * 1000;

const dentroDaJanela = (usuario) =>
  Boolean(usuario?.whatsappMensagemEm) &&
  Date.now() - new Date(usuario.whatsappMensagemEm).getTime() < JANELA_MS;

/** Aviso no histórico do chamado (só a equipe vê). */
const avisaNoChamado = (chamadoId, mensagem) =>
  Interacao.create({
    chamado: chamadoId,
    autor: null,
    tipo: TIPOS_INTERACAO.SISTEMA,
    mensagem: mensagem.slice(0, 1000),
    evento: { campo: 'whatsapp', de: null, para: null },
  }).catch((e) => logger.error(`Falha ao registrar aviso do WhatsApp: ${e.message}`));

const primeiroNome = (nome) => String(nome || '').split(/\s+/)[0] || '';

/**
 * Envia (ou guarda para depois) uma mensagem para o cliente do chamado.
 * @param {{ chamado: any, texto: string, interacaoId?: any, chamarForaDaJanela?: boolean }} opcoes
 *   chamarForaDaJanela: fora das 24h, envia o modelo aprovado para chamar o cliente
 */
const entregaAoCliente = async ({ chamado, texto, interacaoId = null, chamarForaDaJanela }) => {
  const config = await obtemConfigWhatsapp();
  if (!config.ativo) return;
  const cliente = await Usuario.findById(chamado.solicitante?._id || chamado.solicitante)
    .select('nome whatsapp +whatsappMensagemEm')
    .lean();
  if (!cliente?.whatsapp) {
    await avisaNoChamado(
      chamado._id,
      'Resposta não enviada pelo WhatsApp: o cliente não tem número de WhatsApp no cadastro',
    );
    return;
  }

  const registro = {
    direcao: 'saida',
    numero: cliente.whatsapp,
    nome: cliente.nome,
    tipo: 'texto',
    texto: texto.slice(0, 5000),
    chamado: chamado._id,
    numeroChamado: chamado.numero,
    interacao: interacaoId,
  };

  if (dentroDaJanela(cliente)) {
    try {
      const waId = await enviaTexto(cliente.whatsapp, texto, config);
      await MensagemWhatsapp.create({ ...registro, waId, resultado: 'enviada' });
      return;
    } catch (e) {
      // a Meta às vezes considera a janela fechada antes de nós: guarda para depois
      if (e.codigoMeta !== 131047) {
        await MensagemWhatsapp.create({ ...registro, resultado: 'falha', detalhe: e.message });
        await avisaNoChamado(chamado._id, `Mensagem não enviada pelo WhatsApp: ${e.message}`);
        return;
      }
    }
  }

  // fora da janela: guarda e, se possível, chama o cliente com o modelo aprovado
  const jaChamado = await MensagemWhatsapp.exists({
    numero: cliente.whatsapp,
    direcao: 'saida',
    tipo: 'modelo',
    createdAt: { $gte: new Date(Date.now() - JANELA_MS) },
  });
  await MensagemWhatsapp.create({
    ...registro,
    resultado: 'aguardando',
    detalhe: 'Cliente sem mensagens há mais de 24h: será entregue quando ele escrever',
  });

  let aviso =
    'O cliente não escreve pelo WhatsApp há mais de 24 horas, e a Meta só permite mensagens livres dentro desse prazo. ' +
    'A resposta será entregue assim que ele mandar uma nova mensagem.';
  if (chamarForaDaJanela && config.modelo?.nome && !jaChamado) {
    try {
      const waId = await enviaModelo(cliente.whatsapp, [String(chamado.numero)], config);
      await MensagemWhatsapp.create({
        ...registro,
        tipo: 'modelo',
        texto: `Modelo "${config.modelo.nome}" (chamado #${chamado.numero})`,
        waId,
        resultado: 'enviada',
      });
      aviso += ` Enviamos o modelo "${config.modelo.nome}" para chamá-lo.`;
    } catch (e) {
      aviso += ` O modelo "${config.modelo.nome}" não pôde ser enviado: ${e.message}`;
    }
  } else if (chamarForaDaJanela && !config.modelo?.nome) {
    aviso += ' Para chamá-lo, configure um modelo aprovado em Configurações > WhatsApp.';
  }
  if (chamarForaDaJanela) await avisaNoChamado(chamado._id, aviso);
};

/**
 * O cliente escreveu (janela reaberta): entrega as respostas que estavam guardadas.
 * @param {string} numero
 */
const entregaPendentes = async (numero) => {
  const config = await obtemConfigWhatsapp();
  if (!config.ativo) return 0;
  const pendentes = await MensagemWhatsapp.find({
    numero,
    direcao: 'saida',
    resultado: 'aguardando',
  })
    .sort({ createdAt: 1 })
    .limit(20)
    .lean();
  let entregues = 0;
  for (const p of pendentes) {
    if (Date.now() - new Date(p.createdAt).getTime() > VALIDADE_DAS_PENDENTES_MS) {
      await MensagemWhatsapp.updateOne(
        { _id: p._id },
        { $set: { resultado: 'falha', detalhe: 'Expirou: o cliente não escreveu em 7 dias' } },
      );
      continue;
    }
    try {
      const waId = await enviaTexto(numero, p.texto, config);
      await MensagemWhatsapp.updateOne(
        { _id: p._id },
        {
          $set: {
            resultado: 'enviada',
            waId,
            detalhe: 'Entregue quando o cliente voltou a escrever',
          },
        },
      );
      entregues += 1;
    } catch (e) {
      await MensagemWhatsapp.updateOne(
        { _id: p._id },
        { $set: { resultado: 'falha', detalhe: e.message } },
      );
      if (p.chamado)
        await avisaNoChamado(p.chamado, `Mensagem não enviada pelo WhatsApp: ${e.message}`);
    }
  }
  return entregues;
};

// ---------------------------------------------------------------- avisos (fila de notificações)
/** Chamado aberto pelo WhatsApp: responde com o número do chamado. */
const whatsappNovoChamado = async ({ chamadoId }) => {
  const config = await obtemConfigWhatsapp();
  if (!config.ativo || !config.avisos.confirmacaoCliente) return;
  const chamado = await Chamado.findById(chamadoId).populate('solicitante', 'nome').lean();
  if (!chamado || chamado.origem !== 'whatsapp') return;
  const nome = primeiroNome(chamado.solicitante?.nome);
  await entregaAoCliente({
    chamado,
    texto:
      `Olá${nome ? `, ${nome}` : ''}! Recebemos sua mensagem e abrimos o chamado *#${chamado.numero}*.\n` +
      'Nossa equipe vai responder por aqui mesmo. Se quiser complementar, é só mandar outra mensagem.',
  });
};

/** Resposta pública da equipe num chamado aberto pelo WhatsApp: vai para o cliente. */
const whatsappNovaResposta = async ({ interacaoId }) => {
  const config = await obtemConfigWhatsapp();
  if (!config.ativo || !config.avisos.respostaParaCliente) return;
  const interacao = await Interacao.findById(interacaoId).populate('autor', 'nome papel').lean();
  if (!interacao || interacao.tipo !== TIPOS_INTERACAO.PUBLICA || !ehEquipe(interacao.autor))
    return;
  const chamado = await Chamado.findById(interacao.chamado).lean();
  if (!chamado || chamado.origem !== 'whatsapp') return;

  let texto = `*${interacao.autor.nome}* respondeu o seu chamado *#${chamado.numero}*:\n\n${interacao.mensagem}`;
  if (chamado.status === STATUS.RESOLVIDO) {
    texto +=
      '\n\n✅ Seu chamado foi marcado como *resolvido*. Se ainda precisar de ajuda, é só responder esta mensagem.';
  }
  await entregaAoCliente({ chamado, texto, interacaoId, chamarForaDaJanela: true });
};

module.exports = {
  entregaAoCliente,
  entregaPendentes,
  avisaNoChamado,
  whatsappNovoChamado,
  whatsappNovaResposta,
};
