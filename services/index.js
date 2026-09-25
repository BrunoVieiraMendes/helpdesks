const { buscaChamadoAcessivel, detalhaChamado } = require('./busca-chamado');
const { listaChamados, quadroKanban } = require('./lista-chamados');
const { listaInteracoes, adicionaInteracao } = require('./interacoes');
const { listaUsuarios, criaUsuario, atualizaUsuario, removeUsuario } = require('./usuarios');
const {
  listaCategorias,
  criaCategoria,
  atualizaCategoria,
  removeCategoria,
} = require('./categorias');
const {
  listaEquipes,
  criaEquipe,
  atualizaEquipe,
  removeEquipe,
  adicionaMembro,
  removeMembro,
} = require('./equipes');
const { listaServicos, criaServico, atualizaServico, removeServico } = require('./servicos');
const cadastros = require('./cadastros');
const { obtemConfiguracao, atualizaConfiguracao } = require('./configuracao');

module.exports = {
  logaUsuario: require('./loga-usuario'),
  // chamados
  criaChamado: require('./cria-chamado'),
  atualizaChamado: require('./atualiza-chamado'),
  assumeChamado: require('./assume-chamado'),
  aplicaMacro: require('./aplica-macro'),
  avaliaChamado: require('./avalia-chamado'),
  buscaChamadoAcessivel,
  detalhaChamado,
  listaChamados,
  quadroKanban,
  // timeline
  listaInteracoes,
  adicionaInteracao,
  // cadastros
  listaUsuarios,
  criaUsuario,
  atualizaUsuario,
  removeUsuario,
  listaCategorias,
  criaCategoria,
  atualizaCategoria,
  removeCategoria,
  listaEquipes,
  criaEquipe,
  atualizaEquipe,
  removeEquipe,
  adicionaMembro,
  removeMembro,
  listaServicos,
  criaServico,
  atualizaServico,
  removeServico,
  // cadastros simples do painel de configurações: { lista, cria, atualiza, remove }
  empresas: cadastros.empresas,
  tags: cadastros.tags,
  justificativas: cadastros.justificativas,
  feriados: cadastros.feriados,
  macros: cadastros.macros,
  perfis: cadastros.perfis,
  cargos: cadastros.cargos,
  classificacoes: cadastros.classificacoes,
  camposAdicionais: cadastros.camposAdicionais,
  regrasExibicao: cadastros.regrasExibicao,
  avisos: cadastros.avisos,
  avisosDoUsuario: require('./inicio').avisosDoUsuario,
  painelInicial: require('./inicio').painelInicial,
  indicadores: require('./relatorios').indicadores,
  relatorioDeChamados: require('./relatorios').relatorioDeChamados,
  csvDeChamados: require('./relatorios').csvDeChamados,
  csvDeIndicadores: require('./relatorios').csvDeIndicadores,
  // parâmetros da conta
  obtemConfiguracao,
  atualizaConfiguracao,
  resumoDaConta: require('./resumo'),
  // tarefas assíncronas
  processaNotificacao: require('./notificacoes'),
  ...require('./notificacoes-do-sistema'),
  configuracaoParaTela: require('./email-config').configuracaoParaTela,
  atualizaConfigEmail: require('./email-config').atualizaConfigEmail,
  processaEmailBruto: require('./email-entrada').processaEmailBruto,
  listaEmailsRecebidos: require('./email-entrada').listaEmailsRecebidos,
  ...require('./email-imap'),
  ...require('./marca'),
  // WhatsApp (API oficial da Meta)
  configWhatsappParaTela: require('./whatsapp-config').configWhatsappParaTela,
  atualizaConfigWhatsapp: require('./whatsapp-config').atualizaConfigWhatsapp,
  renovaTokenDeVerificacao: require('./whatsapp-config').renovaTokenDeVerificacao,
  ...require('./whatsapp-entrada'),
  fechaResolvidos: require('./fecha-resolvidos'),
};
