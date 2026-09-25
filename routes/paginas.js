const express = require('express');

const {
  STATUS,
  ROTULOS_STATUS,
  ROTULOS_PRIORIDADE,
  TRANSICOES_STATUS,
  STATUS_QUE_PAUSAM_SLA,
  PERCENTUAL_SLA_EM_RISCO,
  PERMISSOES,
  TIPOS_DE_CAMPO,
  ALVOS_DE_CAMPO,
  PUBLICOS_DE_AVISO,
} = require('../constants');

const router = express.Router();

// Regras de domínio expostas às telas (window.HD), para não duplicar rótulos no front.
const DOMINIO = Object.freeze({
  status: Object.values(STATUS),
  rotulosStatus: ROTULOS_STATUS,
  rotulosPrioridade: ROTULOS_PRIORIDADE,
  transicoes: TRANSICOES_STATUS,
  statusQuePausamSla: STATUS_QUE_PAUSAM_SLA,
  percentualSlaEmRisco: PERCENTUAL_SLA_EM_RISCO,
  // permissões dos perfis de acesso: { agente: { chave: { rotulo, padrao } }, cliente: {...} }
  permissoes: PERMISSOES,
  // campos adicionais: tipo -> rótulo e "campo para"
  tiposDeCampo: TIPOS_DE_CAMPO,
  alvosDeCampo: ALVOS_DE_CAMPO,
  publicosDeAviso: PUBLICOS_DE_AVISO,
});

router.use((_req, res, next) => {
  res.locals.dominio = DOMINIO;
  res.locals.area = '';
  res.locals.aba = '';
  next();
});

// As páginas são "cascas" EJS: os dados vêm da API /v1 pelo JS do navegador,
// que envia o JWT. Todo o controle de acesso é feito pela API.
const pagina =
  (view, titulo, extras = {}) =>
  (req, res) =>
    res.render(view, { titulo, ...extras, params: req.params });

router.get('/', (_req, res) => res.redirect('/login'));
router.get('/login', pagina('login', 'Entrar'));
router.get('/inicio', pagina('inicio', 'Início', { area: 'inicio' }));
router.get('/relatorios', pagina('relatorios', 'Indicadores e relatórios', { area: 'relatorios' }));
router.get('/portal', pagina('portal/meus-chamados', 'Meus Chamados', { area: 'portal' }));
router.get('/agente', pagina('agente/lista', 'Fila de Chamados', { area: 'agente', aba: 'lista' }));
router.get('/agente/kanban', pagina('agente/kanban', 'Kanban', { area: 'agente', aba: 'kanban' }));
router.get('/admin', pagina('admin/painel', 'Configurações', { area: 'admin' }));
router.get(
  '/admin/configuracoes',
  pagina('admin/configuracoes', 'Configurações', { area: 'admin' }),
);
router.get(
  '/chamados/novo',
  pagina('novo-chamado', 'Novo Chamado', { area: 'portal', aba: 'novo' }),
);
router.get('/chamados/:numero', pagina('chamado', 'Chamado', { area: 'chamado' }));

module.exports = router;
