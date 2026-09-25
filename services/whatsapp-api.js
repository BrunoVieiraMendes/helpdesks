// Chamadas à API oficial do WhatsApp (Meta Graph API — WhatsApp Cloud API).
// WHATSAPP_API_URL troca o endereço da Meta (usado nos testes com um servidor falso).
const createError = require('http-errors');

const { decifra } = require('../utils');
const { obtemConfigWhatsapp } = require('./whatsapp-config');

const TEMPO_MAXIMO_MS = 15000;

// erros mais comuns da Meta, explicados para quem configura/atende
const ERROS_CONHECIDOS = {
  190: 'Token de acesso inválido ou expirado. Gere um token permanente (usuário do sistema) na Meta',
  10: 'O token não tem permissão para o WhatsApp (whatsapp_business_messaging)',
  200: 'O token não tem permissão para o WhatsApp (whatsapp_business_messaging)',
  100: 'A Meta recusou os dados enviados (confira a identificação do número de telefone)',
  131047:
    'O cliente não escreve há mais de 24 horas: só é possível chamá-lo com um modelo aprovado',
  131026: 'Não foi possível entregar: o número não tem WhatsApp ou não aceita mensagens da empresa',
  131030: 'Número de teste: cadastre este telefone como destinatário permitido no painel da Meta',
  132000: 'O modelo precisa de uma variável ({{1}}) para o número do chamado',
  132001: 'Modelo de mensagem não encontrado (confira o nome e o idioma aprovados na Meta)',
  131056: 'Muitas mensagens para o mesmo número em pouco tempo. Tente de novo em instantes',
  130429: 'Limite de envios da Meta atingido. Tente de novo em instantes',
  131031: 'Conta do WhatsApp bloqueada ou restrita pela Meta',
  368: 'Conta temporariamente bloqueada pela Meta por violação de políticas',
};

/** Texto amigável para um erro vindo da Meta ({ code, message, error_data }). */
const explicaErroDaMeta = (erro = {}) =>
  ERROS_CONHECIDOS[erro.code] ||
  [erro.title || erro.message, erro.error_data?.details].filter(Boolean).join(': ') ||
  'Erro desconhecido na API do WhatsApp';

const baseDaApi = () =>
  (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');

/**
 * Faz uma chamada à Graph API com o token salvo.
 * @param {'GET' | 'POST'} metodo
 * @param {string} caminho  ex.: "/123456/messages"
 * @param {any} [corpo]
 * @param {any} [config]  configuração já carregada
 */
const chamaApi = async (metodo, caminho, corpo, config) => {
  const c = config || (await obtemConfigWhatsapp());
  const token = decifra(c.tokenCifrado);
  if (!c.numeroId || !token) {
    throw createError(422, 'Preencha a identificação do número e o token de acesso do WhatsApp');
  }
  let resposta;
  try {
    resposta = await fetch(`${baseDaApi()}/${c.versaoApi || 'v21.0'}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(corpo && { 'Content-Type': 'application/json' }),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
  } catch (e) {
    const tempo = e.name === 'TimeoutError' || e.name === 'AbortError';
    throw createError(
      502,
      tempo
        ? 'A API do WhatsApp demorou demais para responder'
        : 'Sem conexão com a API do WhatsApp',
    );
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = createError(502, explicaErroDaMeta(dados.error));
    erro.codigoMeta = dados.error?.code;
    throw erro;
  }
  return dados;
};

/** Confere token e número e devolve o número/nome verificados pela Meta. */
const consultaNumero = async (config) => {
  const c = config || (await obtemConfigWhatsapp());
  const dados = await chamaApi(
    'GET',
    `/${c.numeroId}?fields=display_phone_number,verified_name,quality_rating`,
    null,
    c,
  );
  return {
    numeroExibicao: dados.display_phone_number || '',
    nomeVerificado: dados.verified_name || '',
    qualidade: dados.quality_rating || '',
  };
};

/**
 * Envia texto livre (só funciona dentro da janela de 24h do cliente).
 * @returns {Promise<string>} id da mensagem na Meta
 */
const enviaTexto = async (numero, texto, config) => {
  const c = config || (await obtemConfigWhatsapp());
  const dados = await chamaApi(
    'POST',
    `/${c.numeroId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: numero,
      type: 'text',
      text: { body: String(texto).slice(0, 4096), preview_url: false },
    },
    c,
  );
  return dados.messages?.[0]?.id || null;
};

/**
 * Envia o modelo aprovado configurado (para chamar o cliente fora da janela de 24h).
 * @param {string[]} parametros  valores das variáveis {{1}}, {{2}}... do corpo
 * @returns {Promise<string>} id da mensagem na Meta
 */
const enviaModelo = async (numero, parametros, config) => {
  const c = config || (await obtemConfigWhatsapp());
  if (!c.modelo?.nome) throw createError(422, 'Nenhum modelo de mensagem configurado');
  const dados = await chamaApi(
    'POST',
    `/${c.numeroId}/messages`,
    {
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: c.modelo.nome,
        language: { code: c.modelo.idioma || 'pt_BR' },
        ...(parametros.length && {
          components: [
            {
              type: 'body',
              parameters: parametros.map((p) => ({ type: 'text', text: String(p) })),
            },
          ],
        }),
      },
    },
    c,
  );
  return dados.messages?.[0]?.id || null;
};

/** Marca a mensagem recebida como lida (os dois tracinhos azuis para o cliente). */
const marcaComoLida = async (waId, config) => {
  const c = config || (await obtemConfigWhatsapp());
  await chamaApi(
    'POST',
    `/${c.numeroId}/messages`,
    { messaging_product: 'whatsapp', status: 'read', message_id: waId },
    c,
  );
};

module.exports = { consultaNumero, enviaTexto, enviaModelo, marcaComoLida, explicaErroDaMeta };
