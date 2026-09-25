// E-mails recebidos na caixa do Help Desk viram chamados (ou respostas de chamados).
//
// - Assunto com [#1024] de um chamado que o remetente pode ver: a mensagem vira resposta nele.
// - Sem número (ou número de chamado de outra pessoa): abre um chamado novo no serviço padrão.
// - Remetente sem cadastro: vira cliente (ou o e-mail é ignorado, conforme a configuração).
// - Respostas automáticas, devoluções e e-mails enviados pelo próprio Help Desk são ignorados,
//   para não criar laços de e-mail.
// - Cada mensagem é processada uma única vez (Message-ID guardado em EmailRecebido).
const crypto = require('crypto');
const { simpleParser } = require('mailparser');

const { Chamado, Usuario, EmailRecebido } = require('../models');
const { PAPEIS, STATUS, TIPOS_INTERACAO } = require('../constants');
const { logger, lePaginacao, metaPaginacao } = require('../utils');
const { ehEquipe, filtroDeVisibilidade } = require('./permissoes');
const { acessoDoUsuario } = require('./perfis');
const { obtemConfigEmail } = require('./email-config');
const { MARCADOR_DE_RESPOSTA } = require('./envia-email');

// require tardio: evita ciclos (cria-chamado/interacoes carregam muitos serviços)
const criaChamado = (...args) => require('./cria-chamado')(...args);
const adicionaInteracao = (...args) => require('./interacoes').adicionaInteracao(...args);
const criaUsuario = (...args) => require('./usuarios').criaUsuario(...args);

const REMETENTES_AUTOMATICOS =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|nao-?responda|bounce[s]?)(\+.*)?@/i;
const PREFIXOS_DE_ASSUNTO = /^\s*((re|res|fw|fwd|enc|tr|aw|wg)\s*(\[\d+\])?\s*:\s*)+/i;
const LIMITE_DESCRICAO = 20000;

// ---------------------------------------------------------------- texto
const htmlParaTexto = (html) =>
  String(html || '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const normalizaQuebras = (texto) =>
  String(texto || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// linhas que marcam o começo do histórico citado pelos clientes de e-mail
const INICIO_DO_HISTORICO = [
  /^\s*(em|on)\s.{0,200}(escreveu|wrote)\s*:?\s*$/i,
  /^\s*-{2,}\s*(mensagem original|original message|mensagem encaminhada|forwarded message)/i,
  /^\s*_{10,}\s*$/,
  /^\s*(de|from)\s*:\s.+/i,
];

/**
 * Só a parte nova de uma resposta: corta no marcador "Responda acima desta linha",
 * no começo do histórico ("Em ..., Fulano escreveu:") e remove linhas citadas (">").
 * @param {string} texto
 */
const limpaResposta = (texto) => {
  let linhas = normalizaQuebras(texto).split('\n');
  const marcador = linhas.findIndex((l) => l.includes(MARCADOR_DE_RESPOSTA));
  if (marcador !== -1) linhas = linhas.slice(0, marcador);
  const historico = linhas.findIndex((l, i) => i > 0 && INICIO_DO_HISTORICO.some((r) => r.test(l)));
  if (historico !== -1) linhas = linhas.slice(0, historico);
  return normalizaQuebras(linhas.filter((l) => !/^\s*>/.test(l)).join('\n'));
};

const tituloDoAssunto = (assunto) => {
  const limpo = String(assunto || '')
    .replace(/\[#\d+\]/g, '')
    .replace(PREFIXOS_DE_ASSUNTO, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  return limpo.length >= 3 ? limpo : 'E-mail sem assunto';
};

// ---------------------------------------------------------------- filtros
const cabecalho = (msg, nome) => {
  const v = msg.headers?.get(nome);
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : v.value || v.text || String(v);
};

/** Motivo para ignorar a mensagem, ou null se ela deve ser processada. */
const motivoParaIgnorar = (msg, de, config) => {
  if (!de) return 'mensagem sem remetente';
  if (REMETENTES_AUTOMATICOS.test(de)) return 'remetente automático (devolução/no-reply)';
  const autoSubmitted = cabecalho(msg, 'auto-submitted').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return 'resposta automática (Auto-Submitted)';
  if (/^(bulk|junk|list|auto_reply)$/i.test(cabecalho(msg, 'precedence').trim())) {
    return 'mensagem em massa ou automática (Precedence)';
  }
  if (cabecalho(msg, 'x-autoreply') || cabecalho(msg, 'x-autorespond'))
    return 'resposta automática';
  if (cabecalho(msg, 'x-helpdesk')) return 'e-mail enviado pelo próprio Help Desk';
  const nossos = [
    config.envio.remetenteEmail,
    config.recebimento.usuario,
    config.recebimento.endereco,
  ]
    .filter(Boolean)
    .map((e) => e.toLowerCase());
  if (nossos.includes(de)) return 'e-mail enviado pelo próprio Help Desk';
  return null;
};

// ---------------------------------------------------------------- remetente
const usuarioLogadoDe = async (usuario) => {
  const { perfil, permissoes } = await acessoDoUsuario(usuario);
  return { ...usuario, perfilEfetivo: perfil, permissoes };
};

const nomeDoRemetente = (nome, email) => {
  const limpo = String(nome || '')
    .replace(/["']/g, '')
    .trim();
  if (limpo.length >= 2) return limpo.slice(0, 100);
  const local = email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim();
  return (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 100) || email;
};

// ---------------------------------------------------------------- processamento
const registra = (messageId, dados) =>
  EmailRecebido.updateOne({ messageId }, { $set: dados }).catch((e) =>
    logger.error(`Falha ao registrar e-mail recebido: ${e.message}`),
  );

/**
 * Processa uma mensagem já interpretada (mailparser).
 * @returns {Promise<{ resultado: string, numero?: number, detalhe: string }>}
 */
const processaMensagem = async (msg) => {
  const config = await obtemConfigEmail();
  const remetente = msg.from?.value?.[0] || {};
  const de = String(remetente.address || '')
    .trim()
    .toLowerCase();
  const assunto = String(msg.subject || '').slice(0, 300);
  const messageId =
    msg.messageId ||
    `sem-id-${crypto
      .createHash('sha1')
      .update(`${de}|${assunto}|${msg.date || ''}|${(msg.text || '').slice(0, 500)}`)
      .digest('hex')}`;

  // trava: a mesma mensagem nunca é processada duas vezes (índice único no Message-ID)
  try {
    await EmailRecebido.create({
      messageId,
      de,
      nome: remetente.name || '',
      assunto,
      resultado: 'processando',
    });
  } catch (e) {
    if (e.code === 11000) return { resultado: 'duplicado', detalhe: 'Mensagem já processada' };
    throw e;
  }

  const fim = async (resultado, detalhe, numero = null) => {
    await registra(messageId, { resultado, detalhe: String(detalhe).slice(0, 500), numero });
    return { resultado, detalhe, ...(numero && { numero }) };
  };

  try {
    const motivo = motivoParaIgnorar(msg, de, config);
    if (motivo) return fim('ignorado', motivo);

    const corpo = normalizaQuebras(msg.text || htmlParaTexto(msg.html));
    const anexos = (msg.attachments || []).filter((a) => a.contentDisposition !== 'inline').length;
    const avisoAnexos = anexos
      ? `\n\n[Este e-mail tinha ${anexos} anexo(s), que não são importados.]`
      : '';

    let usuario = await Usuario.findOne({ email: de }).lean();
    if (usuario && !usuario.ativo) return fim('ignorado', 'remetente com cadastro desativado');

    // resposta de um chamado existente
    const referencia = /\[#(\d+)\]/.exec(assunto);
    if (usuario && referencia) {
      const logado = await usuarioLogadoDe(usuario);
      const chamado = await Chamado.findOne({
        numero: Number(referencia[1]),
        ...filtroDeVisibilidade(logado),
      }).lean();
      if (chamado && chamado.status !== STATUS.FECHADO) {
        const resposta = limpaResposta(corpo) || corpo;
        if (!resposta) return fim('ignorado', 'resposta sem texto', chamado.numero);
        await adicionaInteracao(
          chamado,
          {
            mensagem: (resposta + avisoAnexos).slice(0, LIMITE_DESCRICAO),
            tipo: TIPOS_INTERACAO.PUBLICA,
          },
          logado,
        );
        return fim('resposta', `Resposta adicionada ao chamado #${chamado.numero}`, chamado.numero);
      }
      if (chamado && ehEquipe(logado)) {
        return fim(
          'ignorado',
          `Chamado #${chamado.numero} fechado: a equipe responde pelo sistema`,
        );
      }
    }

    // novo chamado
    if (usuario && ehEquipe(usuario)) {
      return fim('ignorado', 'remetente é da equipe: chamados da equipe são abertos pelo sistema');
    }
    if (!config.recebimento.servicoPadrao) {
      return fim('erro', 'Escolha o serviço padrão dos chamados abertos por e-mail');
    }
    if (!usuario) {
      if (!config.recebimento.criarClientes) return fim('ignorado', 'remetente sem cadastro');
      const criado = await criaUsuario({
        nome: nomeDoRemetente(remetente.name, de),
        email: de,
        // senha aleatória: o cliente acompanha por e-mail ou pede acesso ao suporte
        senha: crypto.randomBytes(18).toString('base64url'),
        papel: PAPEIS.CLIENTE,
      });
      usuario = await Usuario.findById(criado._id).lean();
    }

    const fechado =
      referencia &&
      (await Chamado.exists({
        numero: Number(referencia[1]),
        solicitante: usuario._id,
        status: STATUS.FECHADO,
      }));
    const descricao =
      (fechado ? `(Continuação do chamado #${referencia[1]}, que já estava fechado.)\n\n` : '') +
      (limpaResposta(corpo) || corpo || '(E-mail sem texto)') +
      avisoAnexos;

    const chamado = await criaChamado(
      {
        titulo: tituloDoAssunto(assunto),
        descricao: descricao.slice(0, LIMITE_DESCRICAO),
        servico: String(config.recebimento.servicoPadrao),
      },
      await usuarioLogadoDe(usuario),
      { porEmail: true },
    );
    return fim('novo-chamado', `Chamado #${chamado.numero} aberto`, chamado.numero);
  } catch (e) {
    const detalhe = e.detalhes ? Object.values(e.detalhes).join('; ') : e.message;
    logger.error(`Falha ao processar e-mail de ${de} ("${assunto}"): ${detalhe}`);
    return fim('erro', detalhe);
  }
};

/**
 * Processa uma mensagem no formato bruto (RFC 822), como vem da caixa IMAP.
 * @param {Buffer | string} fonte
 */
const processaEmailBruto = async (fonte) => processaMensagem(await simpleParser(fonte));

/** Log dos e-mails recebidos (mais recentes primeiro). */
const listaEmailsRecebidos = async (query = {}) => {
  const paginacao = lePaginacao(query);
  const [total, emails] = await Promise.all([
    EmailRecebido.countDocuments({}),
    EmailRecebido.find({})
      .sort({ createdAt: -1 })
      .skip(paginacao.pular)
      .limit(paginacao.porPagina)
      .lean(),
  ]);
  return { emails, paginacao: metaPaginacao(total, paginacao) };
};

module.exports = {
  processaEmailBruto,
  processaMensagem,
  listaEmailsRecebidos,
  limpaResposta,
  tituloDoAssunto,
};
