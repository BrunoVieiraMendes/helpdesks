const express = require('express');
const swaggerUI = require('swagger-ui-express');

const { autentica } = require('../../middlewares');
const swaggerConfig = require('./docs');
const statusRouter = require('./status');
const authRouter = require('./auth');
const usuariosRouter = require('./usuarios');
const categoriasRouter = require('./categorias');
const chamadosRouter = require('./chamados');
const equipesRouter = require('./equipes');
const servicosRouter = require('./servicos');
const configuracoesRouter = require('./configuracoes');
const inicioRouter = require('./inicio');
const relatoriosRouter = require('./relatorios');
const notificacoesRouter = require('./notificacoes');
const presencaRouter = require('./presenca');
const whatsappRouter = require('./whatsapp');
const rotasDeCadastro = require('./cadastros');
const {
  empresas,
  tags,
  justificativas,
  feriados,
  macros,
  perfis,
  cargos,
  classificacoes,
  camposAdicionais,
  regrasExibicao,
  avisos,
  avisosDoUsuario,
} = require('../../services');
const { ehEquipe, ehAdmin } = require('../../services/permissoes');
const { PAPEIS, PAPEIS_DA_EQUIPE } = require('../../constants');

const router = express.Router();

// públicas
router.use('/status', statusRouter);
router.use('/auth', authRouter);
// webhook do WhatsApp: chamado pela Meta (autenticado pela assinatura, não por login)
router.use('/whatsapp', whatsappRouter);
router.use('/docs', swaggerUI.serve);
router.get('/docs', swaggerUI.setup(swaggerConfig));
router.get('/docs.json', (_req, res) => res.json(swaggerConfig));

// autenticadas (o RBAC fino fica em cada rota via autoriza())
router.use('/usuarios', autentica, usuariosRouter);
router.use('/categorias', autentica, categoriasRouter);
router.use('/chamados', autentica, chamadosRouter);
router.use('/equipes', autentica, equipesRouter);
router.use('/servicos', autentica, servicosRouter);
router.use('/configuracoes', autentica, configuracoesRouter);
router.use('/inicio', autentica, inicioRouter);
router.use('/relatorios', autentica, relatoriosRouter);
router.use('/notificacoes', autentica, notificacoesRouter);
router.use('/presenca', autentica, presencaRouter);

// cadastros simples do painel de configurações (a equipe lê; só o admin altera)
const cadastros = [
  ['/empresas', empresas, 'empresa', 'empresas', 'Empresa removida', PAPEIS_DA_EQUIPE],
  ['/tags', tags, 'tag', 'tags', 'Tag removida', PAPEIS_DA_EQUIPE],
  [
    '/justificativas',
    justificativas,
    'justificativa',
    'justificativas',
    'Justificativa removida',
    PAPEIS_DA_EQUIPE,
  ],
  ['/feriados', feriados, 'feriado', 'feriados', 'Feriado removido', [PAPEIS.ADMIN]],
  ['/macros', macros, 'macro', 'macros', 'Macro removida', PAPEIS_DA_EQUIPE],
  ['/perfis', perfis, 'perfil', 'perfis', 'Perfil removido', [PAPEIS.ADMIN]],
  ['/cargos', cargos, 'cargo', 'cargos', 'Cargo removido', [PAPEIS.ADMIN]],
  [
    '/classificacoes',
    classificacoes,
    'classificacao',
    'classificacoes',
    'Classificação removida',
    [PAPEIS.ADMIN],
  ],
];
for (const [caminho, servico, chave, plural, removido, leitura] of cadastros) {
  router.use(caminho, autentica, rotasDeCadastro(servico, { chave, plural, removido, leitura }));
}

// Campos adicionais e regras para exibição: todos leem (a tela de abertura do chamado
// monta o formulário com eles), mas o cliente só recebe o que é visível para ele.
const camposDoCliente = (campos) => campos.filter((c) => c.visivelParaCliente);
router.use(
  '/campos-adicionais',
  autentica,
  rotasDeCadastro(camposAdicionais, {
    chave: 'campo',
    plural: 'campos',
    removido: 'Campo removido',
    leitura: Object.values(PAPEIS),
    filtraLeitura: (campos, usuario) => (ehEquipe(usuario) ? campos : camposDoCliente(campos)),
  }),
);
router.use(
  '/regras-exibicao',
  autentica,
  rotasDeCadastro(regrasExibicao, {
    chave: 'regra',
    plural: 'regras',
    removido: 'Regra removida',
    leitura: Object.values(PAPEIS),
    filtraLeitura: async (regras, usuario) => {
      if (ehEquipe(usuario)) return regras;
      const visiveis = new Set(
        camposDoCliente(await camposAdicionais.lista()).map((c) => String(c._id)),
      );
      return regras
        .map((r) => ({ ...r, campos: r.campos.filter((id) => visiveis.has(String(id))) }))
        .filter((r) => r.campos.length);
    },
  }),
);

// Mural de avisos: o admin gerencia; os demais recebem só os avisos válidos para o seu público
router.use(
  '/avisos',
  autentica,
  rotasDeCadastro(avisos, {
    chave: 'aviso',
    plural: 'avisos',
    removido: 'Aviso removido',
    leitura: Object.values(PAPEIS),
    filtraLeitura: (itens, usuario) => (ehAdmin(usuario) ? itens : avisosDoUsuario(usuario)),
  }),
);

module.exports = router;
