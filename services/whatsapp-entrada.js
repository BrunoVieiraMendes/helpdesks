// Mensagens recebidas pelo WhatsApp (avisos do webhook da Meta) viram chamados ou respostas.
//
// - Número sem cadastro: vira cliente (ou a mensagem é ignorada, conforme a configuração).
// - Cliente com chamado do WhatsApp ainda não fechado: a mensagem entra nesse chamado
//   (se ele estava Resolvido ou Pendente, volta para Em Atendimento).
// - Sem chamado em andamento: abre um chamado novo no serviço padrão.
// - Cada mensagem é processada uma única vez (id da Meta guardado em MensagemWhatsapp).
// - Os avisos de entrega (enviada, entregue, lida, falhou) atualizam as mensagens enviadas.
const crypto = require('crypto');

const { Chamado, Usuario, MensagemWhatsapp } = require('../models');
const { PAPEIS, STATUS, TIPOS_INTERACAO } = require('../constants');
const { logger, decifra, lePaginacao, metaPaginacao } = require('../utils');
const { ehEquipe } = require('./permissoes');
const { acessoDoUsuario } = require('./perfis');
const { obtemConfigWhatsapp, anotaNaConfigWhatsapp } = require('./whatsapp-config');
const { marcaComoLida, explicaErroDaMeta } = require('./whatsapp-api');
const { entregaPendentes, avisaNoChamado } = require('./whatsapp-saida');
const { variantesDoNumero, formataNumero } = require('./whatsapp-numero');

// require tardio: evita ciclos (cria-chamado/interacoes carregam muitos serviços)
const criaChamado = (...args) => require('./cria-chamado')(...args);
const adicionaInteracao = (...args) => require('./interacoes').adicionaInteracao(...args);
const criaUsuario = (...args) => require('./usuarios').criaUsuario(...args);

const LIMITE_DESCRICAO = 20000;

// ---------------------------------------------------------------- assinatura
/**
 * Confere se o aviso veio mesmo da Meta: X-Hub-Signature-256 = "sha256=" + HMAC do corpo
 * com a chave secreta do app.
 * @param {Buffer} corpoBruto
 * @param {string} assinatura
 * @param {string} segredo
 */
const assinaturaValida = (corpoBruto, assinatura, segredo) => {
  if (!corpoBruto || !assinatura || !segredo) return false;
  const esperada = `sha256=${crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex')}`;
  const a = Buffer.from(String(assinatura));
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ---------------------------------------------------------------- conteúdo
const ANEXOS = {
  image: 'uma imagem',
  video: 'um vídeo',
  audio: 'um áudio',
  document: 'um documento',
  sticker: 'uma figurinha',
};

/** Texto da mensagem, ou o motivo para ignorá-la. */
const conteudoDaMensagem = (msg) => {
  switch (msg.type) {
    case 'text':
      return { texto: msg.text?.body || '' };
    case 'button':
      return { texto: msg.button?.text || '' };
    case 'interactive':
      return {
        texto: msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '',
      };
    case 'location': {
      const l = msg.location || {};
      return {
        texto: [
          'Localização enviada pelo cliente:',
          [l.name, l.address].filter(Boolean).join(' - '),
          `https://maps.google.com/?q=${l.latitude},${l.longitude}`,
        ]
          .filter(Boolean)
          .join('\n'),
      };
    }
    case 'contacts':
      return {
        texto: `Contato compartilhado: ${(msg.contacts || [])
          .map((c) => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(' '))
          .join('; ')}`,
      };
    case 'reaction':
      return { ignorar: 'reação a uma mensagem' };
    default: {
      const anexo = ANEXOS[msg.type];
      if (!anexo) return { ignorar: `tipo de mensagem não suportado (${msg.type})` };
      const dados = msg[msg.type] || {};
      const legenda = dados.caption || '';
      const arquivo = dados.filename ? ` (${dados.filename})` : '';
      return {
        texto:
          (legenda ? `${legenda}\n\n` : '') +
          `[O cliente enviou ${anexo}${arquivo} pelo WhatsApp. Anexos não são importados: ` +
          'se precisar do arquivo, peça para enviar pelo portal.]',
      };
    }
  }
};

const tituloDaMensagem = (texto) => {
  const linha = String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('['));
  if (!linha || linha.length < 3) return 'Atendimento pelo WhatsApp';
  return linha.length > 80 ? `${linha.slice(0, 77).trim()}...` : linha;
};

// ---------------------------------------------------------------- remetente
const usuarioLogadoDe = async (usuario) => {
  const { perfil, permissoes } = await acessoDoUsuario(usuario);
  return { ...usuario, perfilEfetivo: perfil, permissoes };
};

const cadastraCliente = async (numero, nome) => {
  // e-mail de marcação (.invalid nunca recebe e-mails): o cadastro exige um e-mail
  const email = `whatsapp.${numero}@clientes.invalid`;
  const existente = await Usuario.findOne({ email }).lean();
  if (existente) {
    await Usuario.updateOne({ _id: existente._id }, { $set: { whatsapp: numero } });
    return Usuario.findById(existente._id).lean();
  }
  const criado = await criaUsuario({
    nome:
      String(nome || '')
        .trim()
        .slice(0, 100) || `Cliente ${formataNumero(numero)}`,
    email,
    // senha aleatória: o cliente conversa pelo WhatsApp (a equipe pode liberar o portal depois)
    senha: crypto.randomBytes(18).toString('base64url'),
    papel: PAPEIS.CLIENTE,
    whatsapp: numero,
  });
  return Usuario.findById(criado._id).lean();
};

// ---------------------------------------------------------------- processamento
// mensagens do mesmo número são processadas uma de cada vez (evita dois chamados abertos juntos)
const filaPorNumero = new Map();
const umDeCadaVez = (numero, tarefa) => {
  const anterior = filaPorNumero.get(numero) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(tarefa);
  filaPorNumero.set(numero, atual);
  atual.finally(() => {
    if (filaPorNumero.get(numero) === atual) filaPorNumero.delete(numero);
  });
  return atual;
};

/**
 * Processa uma mensagem recebida.
 * @param {{ waId: string, numero: string, nome?: string, tipo: string, conteudo: { texto?: string, ignorar?: string }, em?: Date, simulada?: boolean }} m
 * @returns {Promise<{ resultado: string, detalhe: string, numero?: number }>}
 */
const processaMensagem = async (m) => {
  try {
    await MensagemWhatsapp.create({
      waId: m.waId,
      direcao: 'entrada',
      numero: m.numero,
      nome: m.nome || '',
      tipo: m.tipo,
      texto: String(m.conteudo.texto || '').slice(0, 5000),
      resultado: 'processando',
    });
  } catch (e) {
    if (e.code === 11000) return { resultado: 'duplicado', detalhe: 'Mensagem já processada' };
    throw e;
  }

  const fim = async (resultado, detalhe, chamado = null) => {
    await MensagemWhatsapp.updateOne(
      { waId: m.waId },
      {
        $set: {
          resultado,
          detalhe: String(detalhe).slice(0, 500),
          chamado: chamado?._id || null,
          numeroChamado: chamado?.numero || null,
        },
      },
    ).catch((e) => logger.error(`Falha ao registrar mensagem do WhatsApp: ${e.message}`));
    return { resultado, detalhe, ...(chamado && { numero: chamado.numero }) };
  };

  try {
    const config = await obtemConfigWhatsapp();
    if (m.conteudo.ignorar) return fim('ignorado', m.conteudo.ignorar);

    let usuario = await Usuario.findOne({ whatsapp: { $in: variantesDoNumero(m.numero) } }).lean();
    if (usuario && !usuario.ativo) return fim('ignorado', 'número de um cadastro desativado');
    if (usuario && ehEquipe(usuario)) {
      return fim('ignorado', 'número de alguém da equipe: a equipe atende pelo sistema');
    }
    if (!usuario) {
      if (!config.criarClientes) return fim('ignorado', 'número sem cadastro');
      if (!config.servicoPadrao) {
        return fim('erro', 'Escolha o serviço dos chamados abertos pelo WhatsApp');
      }
      usuario = await cadastraCliente(m.numero, m.nome);
    }

    // a janela de 24h da Meta conta a partir desta mensagem
    const em = m.em && m.em < new Date() ? m.em : new Date();
    await Usuario.updateOne(
      { _id: usuario._id },
      { $set: { whatsappMensagemEm: em } },
      { timestamps: false },
    );
    // respostas que esperavam o cliente voltar a escrever
    if (!m.simulada) await entregaPendentes(usuario.whatsapp);

    const texto = String(m.conteudo.texto || '').trim() || '(Mensagem sem texto)';
    const logado = await usuarioLogadoDe(usuario);

    const emAndamento = await Chamado.findOne({
      solicitante: usuario._id,
      origem: 'whatsapp',
      status: { $ne: STATUS.FECHADO },
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (emAndamento) {
      await adicionaInteracao(
        emAndamento,
        { mensagem: texto.slice(0, LIMITE_DESCRICAO), tipo: TIPOS_INTERACAO.PUBLICA },
        logado,
        { canal: 'whatsapp' },
      );
      return fim('resposta', `Mensagem adicionada ao chamado #${emAndamento.numero}`, emAndamento);
    }

    if (!config.servicoPadrao)
      return fim('erro', 'Escolha o serviço dos chamados abertos pelo WhatsApp');
    const chamado = await criaChamado(
      {
        titulo: tituloDaMensagem(texto),
        descricao: texto.slice(0, LIMITE_DESCRICAO),
        servico: String(config.servicoPadrao),
      },
      logado,
      { origem: 'whatsapp' },
    );
    return fim('novo-chamado', `Chamado #${chamado.numero} aberto`, chamado);
  } catch (e) {
    const detalhe = e.detalhes ? Object.values(e.detalhes).join('; ') : e.message;
    logger.error(`Falha ao processar mensagem do WhatsApp de ${m.numero}: ${detalhe}`);
    return fim('erro', detalhe);
  }
};

// quanto mais adiante, mais "entregue" (um aviso atrasado não volta o status)
const ORDEM_ENTREGA = { aguardando: 0, enviada: 1, entregue: 2, lida: 3, falha: 4 };
const STATUS_DA_META = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falha' };

/** Aviso de entrega de uma mensagem enviada pelo Help Desk. */
const processaStatus = async (s) => {
  const resultado = STATUS_DA_META[s.status];
  if (!resultado || !s.id) return;
  const msg = await MensagemWhatsapp.findOne({ waId: s.id, direcao: 'saida' }).lean();
  if (!msg || (ORDEM_ENTREGA[msg.resultado] ?? 0) >= ORDEM_ENTREGA[resultado]) return;
  const detalhe = resultado === 'falha' ? explicaErroDaMeta(s.errors?.[0]) : msg.detalhe;
  await MensagemWhatsapp.updateOne({ _id: msg._id }, { $set: { resultado, detalhe } });
  if (resultado === 'falha' && msg.chamado) {
    await avisaNoChamado(msg.chamado, `Mensagem não entregue no WhatsApp do cliente: ${detalhe}`);
  }
};

/**
 * Corpo do webhook da Meta: { object, entry: [{ changes: [{ field, value }] }] }.
 * Só considera avisos do número configurado.
 */
const recebeWebhook = async (corpo) => {
  const config = await obtemConfigWhatsapp();
  if (!config.ativo || corpo?.object !== 'whatsapp_business_account') return;

  for (const entrada of corpo.entry || []) {
    for (const mudanca of entrada.changes || []) {
      const valor = mudanca.value || {};
      if (mudanca.field !== 'messages') continue;
      if (valor.metadata?.phone_number_id && valor.metadata.phone_number_id !== config.numeroId) {
        continue; // outro número do mesmo app
      }
      const nomes = new Map((valor.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));

      for (const msg of valor.messages || []) {
        const numero = String(msg.from || '').replace(/\D/g, '');
        if (!numero || !msg.id) continue;
        const resultado = await umDeCadaVez(numero, () =>
          processaMensagem({
            waId: msg.id,
            numero,
            nome: nomes.get(msg.from) || '',
            tipo: msg.type,
            conteudo: conteudoDaMensagem(msg),
            em: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
          }),
        );
        if (resultado.resultado !== 'duplicado') {
          marcaComoLida(msg.id, config).catch((e) =>
            logger.debug(`Não foi possível marcar a mensagem como lida: ${e.message}`),
          );
        }
      }
      for (const s of valor.statuses || []) {
        await processaStatus(s).catch((e) =>
          logger.error(`Falha ao atualizar a entrega de uma mensagem do WhatsApp: ${e.message}`),
        );
      }
    }
  }
  await anotaNaConfigWhatsapp({ ultimoRecebimento: new Date(), ultimoErro: '' });
};

/** Confere a assinatura do segredo salvo. */
const webhookAutentico = async (corpoBruto, assinatura) => {
  const config = await obtemConfigWhatsapp();
  return assinaturaValida(corpoBruto, assinatura, decifra(config.segredoCifrado));
};

/**
 * Simula uma mensagem recebida (tela de configurações): testa a abertura de chamados sem a Meta.
 * @param {{ numero: string, nome?: string, texto: string }} dados  numero já normalizado
 */
const simulaMensagemWhatsapp = ({ numero, nome, texto }) =>
  umDeCadaVez(numero, () =>
    processaMensagem({
      waId: `simulada-${crypto.randomBytes(12).toString('hex')}`,
      numero,
      nome,
      tipo: 'text',
      conteudo: { texto },
      simulada: true,
    }),
  );

/** Log das mensagens (mais recentes primeiro). ?direcao=entrada|saida */
const listaMensagensWhatsapp = async (query = {}) => {
  const paginacao = lePaginacao(query);
  const filtro = ['entrada', 'saida'].includes(query.direcao) ? { direcao: query.direcao } : {};
  const [total, mensagens] = await Promise.all([
    MensagemWhatsapp.countDocuments(filtro),
    MensagemWhatsapp.find(filtro)
      .sort({ createdAt: -1 })
      .skip(paginacao.pular)
      .limit(paginacao.porPagina)
      .lean(),
  ]);
  return { mensagens, paginacao: metaPaginacao(total, paginacao) };
};

module.exports = {
  assinaturaValida,
  webhookAutentico,
  recebeWebhook,
  simulaMensagemWhatsapp,
  listaMensagensWhatsapp,
  conteudoDaMensagem,
};
