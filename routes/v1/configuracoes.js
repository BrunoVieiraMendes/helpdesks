const express = require('express');

const { autoriza } = require('../../middlewares');
const {
  obtemConfiguracao,
  atualizaConfiguracao,
  resumoDaConta,
  configuracaoParaTela,
  atualizaConfigEmail,
  testaEnvio,
  testaRecebimento,
  verificaCaixa,
  processaEmailBruto,
  listaEmailsRecebidos,
  salvaLogo,
  removeLogo,
  configWhatsappParaTela,
  atualizaConfigWhatsapp,
  renovaTokenDeVerificacao,
  simulaMensagemWhatsapp,
  listaMensagensWhatsapp,
} = require('../../services');
const { consultaNumero } = require('../../services/whatsapp-api');
const { anotaNaConfigWhatsapp } = require('../../services/whatsapp-config');
const { normalizaNumero } = require('../../services/whatsapp-numero');
const { erroDeValidacao } = require('../../utils');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

const router = express.Router();

router.use(autoriza(PAPEIS.ADMIN));

/**
 * @openapi
 * /v1/configuracoes:
 *   get:
 *     summary: Parâmetros da conta (admin)
 *     description: Expediente, acordos de SLA por urgência, pesquisa de satisfação e fechamento automático.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Parâmetros
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucesso: { type: boolean }
 *                 configuracao: { $ref: '#/components/schemas/Configuracao' }
 *   patch:
 *     summary: Atualiza parâmetros (admin)
 *     description: >
 *       Envie só as seções que mudaram. Os prazos de SLA e o expediente valem para chamados
 *       abertos (ou com a prioridade alterada) a partir de agora.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Configuracao'
 *     responses:
 *       200:
 *         description: Parâmetros atualizados
 *       422:
 *         $ref: '#/components/responses/Invalido'
 */
router.get(
  '/',
  rota(async (_req, res) => {
    res.json({ sucesso: true, configuracao: await obtemConfiguracao() });
  }),
);

router.patch(
  '/',
  rota(async (req, res) => {
    res.json({ sucesso: true, configuracao: await atualizaConfiguracao(req.body || {}) });
  }),
);

/**
 * @openapi
 * /v1/configuracoes/resumo:
 *   get:
 *     summary: Números do painel de configurações (admin)
 *     description: Clientes, empresas, equipes e agentes ativos; chamados abertos, SLA vencido e média das avaliações.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200:
 *         description: Resumo
 */
router.get(
  '/resumo',
  rota(async (_req, res) => {
    res.json({ sucesso: true, ...(await resumoDaConta()) });
  }),
);

/**
 * @openapi
 * /v1/configuracoes/email:
 *   get:
 *     summary: Contas de e-mail (envio SMTP, recebimento IMAP e avisos) — admin
 *     description: As senhas nunca são devolvidas; vem apenas "senhaDefinida".
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: '{ email: { envio, recebimento, avisos } }' }
 *   patch:
 *     summary: Atualiza as contas de e-mail (por seção). Senha vazia mantém a atual.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: '{ email }' }
 *       422: { description: 'Erros por campo, ex.: { "recebimento.host": "Informe o servidor IMAP" }' }
 * /v1/configuracoes/email/testar-envio:
 *   post:
 *     summary: Envia um e-mail de teste (por padrão, para o admin logado)
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/email/testar-recebimento:
 *   post:
 *     summary: Conecta na caixa de entrada e conta as mensagens
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/email/verificar-agora:
 *   post:
 *     summary: Lê agora os e-mails não lidos da caixa de entrada
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/email/simular:
 *   post:
 *     summary: Processa um e-mail colado (formato bruto) como se tivesse chegado na caixa
 *     description: Para testar a abertura de chamados por e-mail sem uma caixa IMAP.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/email/recebidos:
 *   get:
 *     summary: Log dos e-mails recebidos (90 dias)
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 */
router.get(
  '/email',
  rota(async (_req, res) => {
    res.json({ sucesso: true, email: await configuracaoParaTela() });
  }),
);

router.patch(
  '/email',
  rota(async (req, res) => {
    res.json({ sucesso: true, email: await atualizaConfigEmail(req.body || {}) });
  }),
);

router.post(
  '/email/testar-envio',
  rota(async (req, res) => {
    const para = String(req.body?.para || req.user.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para))
      throw erroDeValidacao({ para: 'E-mail inválido' });
    res.json({ sucesso: true, ...(await testaEnvio(para)) });
  }),
);

router.post(
  '/email/testar-recebimento',
  rota(async (_req, res) => {
    res.json({ sucesso: true, ...(await testaRecebimento()) });
  }),
);

router.post(
  '/email/verificar-agora',
  rota(async (_req, res) => {
    res.json({ sucesso: true, ...(await verificaCaixa({ forcar: true })) });
  }),
);

router.post(
  '/email/simular',
  rota(async (req, res) => {
    const conteudo = String(req.body?.conteudo || '');
    if (!conteudo.trim())
      throw erroDeValidacao({ conteudo: 'Cole o e-mail completo (com cabeçalhos)' });
    if (conteudo.length > 2_000_000) throw erroDeValidacao({ conteudo: 'E-mail muito grande' });
    res.json({ sucesso: true, ...(await processaEmailBruto(conteudo)) });
  }),
);

router.get(
  '/email/recebidos',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaEmailsRecebidos(req.query)) });
  }),
);

/**
 * @openapi
 * /v1/configuracoes/logo:
 *   put:
 *     summary: Troca a logo exibida no lugar do "HD" (admin)
 *     description: 'Imagem PNG, JPG ou WebP em data URL (data:image/png;base64,...), até 512 KB.'
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { imagem: { type: string } } }
 *     responses:
 *       200: { description: '{ marca: { nome, logo } }' }
 *       422: { description: Formato ou tamanho inválido }
 *   delete:
 *     summary: Remove a logo (volta ao "HD" padrão)
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 */
router.put(
  '/logo',
  rota(async (req, res) => {
    res.json({ sucesso: true, marca: await salvaLogo(req.body?.imagem) });
  }),
);

router.delete(
  '/logo',
  rota(async (_req, res) => {
    res.json({ sucesso: true, marca: await removeLogo() });
  }),
);

/**
 * @openapi
 * /v1/configuracoes/whatsapp:
 *   get:
 *     summary: Conta do WhatsApp (API oficial da Meta) — admin
 *     description: O token de acesso e a chave secreta nunca são devolvidos; vem apenas tokenDefinido e segredoDefinido.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *   patch:
 *     summary: Atualiza a conta do WhatsApp. Token e chave em branco mantêm os atuais.
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 *     responses:
 *       422: { description: Erros por campo }
 * /v1/configuracoes/whatsapp/testar:
 *   post:
 *     summary: Confere token e número na Meta e mostra o número e o nome verificados
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/whatsapp/token-verificacao:
 *   post:
 *     summary: Gera um novo token de verificação do webhook
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/whatsapp/simular:
 *   post:
 *     summary: Processa uma mensagem como se tivesse chegado pelo WhatsApp
 *     description: Para testar a abertura de chamados sem a Meta. O resultado é real (abre chamado).
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 * /v1/configuracoes/whatsapp/mensagens:
 *   get:
 *     summary: Log das mensagens recebidas e enviadas (90 dias)
 *     tags: [configurações]
 *     security: [{ auth: [] }]
 */
router.get(
  '/whatsapp',
  rota(async (_req, res) => {
    res.json({ sucesso: true, whatsapp: await configWhatsappParaTela() });
  }),
);

router.patch(
  '/whatsapp',
  rota(async (req, res) => {
    res.json({ sucesso: true, whatsapp: await atualizaConfigWhatsapp(req.body || {}) });
  }),
);

router.post(
  '/whatsapp/testar',
  rota(async (_req, res) => {
    try {
      const numero = await consultaNumero();
      await anotaNaConfigWhatsapp({
        numeroExibicao: numero.numeroExibicao,
        nomeVerificado: numero.nomeVerificado,
        ultimoErro: '',
      });
      res.json({ sucesso: true, ...numero });
    } catch (e) {
      await anotaNaConfigWhatsapp({ ultimoErro: e.message });
      throw e;
    }
  }),
);

router.post(
  '/whatsapp/token-verificacao',
  rota(async (_req, res) => {
    res.json({ sucesso: true, whatsapp: await renovaTokenDeVerificacao() });
  }),
);

router.post(
  '/whatsapp/simular',
  rota(async (req, res) => {
    const erros = {};
    let numero = null;
    try {
      numero = normalizaNumero(req.body?.numero);
    } catch (e) {
      erros.numero = e.message;
    }
    if (!numero && !erros.numero) erros.numero = 'Informe o número do cliente';
    const texto = String(req.body?.texto || '').trim();
    if (!texto) erros.texto = 'Escreva a mensagem';
    if (texto.length > 4096) erros.texto = 'Mensagem muito longa';
    if (Object.keys(erros).length) throw erroDeValidacao(erros);
    const nome = String(req.body?.nome || '')
      .trim()
      .slice(0, 100);
    res.json({ sucesso: true, ...(await simulaMensagemWhatsapp({ numero, nome, texto })) });
  }),
);

router.get(
  '/whatsapp/mensagens',
  rota(async (req, res) => {
    res.json({ sucesso: true, ...(await listaMensagensWhatsapp(req.query)) });
  }),
);

module.exports = router;
