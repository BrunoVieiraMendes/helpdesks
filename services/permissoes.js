const { PAPEIS, PAPEIS_DA_EQUIPE, STATUS, PERMISSOES } = require('../constants');

/** @typedef {{ _id: any, nome: string, email: string, papel: string, equipes?: any[], empresa?: any, permissoes?: Record<string, boolean> }} UsuarioLogado */

/** @param {UsuarioLogado} usuario */
const ehEquipe = (usuario) => Boolean(usuario) && PAPEIS_DA_EQUIPE.includes(usuario.papel);

/** @param {UsuarioLogado} usuario */
const ehAdmin = (usuario) => Boolean(usuario) && usuario.papel === PAPEIS.ADMIN;

/** @param {UsuarioLogado} usuario */
const equipesDoUsuario = (usuario) => (usuario && usuario.equipes) || [];

/**
 * O usuário tem a permissão do perfil de acesso? Admin sempre tem.
 * As permissões vêm em req.user (carregadas na autenticação); se não vierem, vale o padrão do sistema.
 * @param {UsuarioLogado & { permissoes?: Record<string, boolean> }} usuario
 * @param {string} permissao  chave de constants.PERMISSOES
 */
const pode = (usuario, permissao) => {
  if (!usuario) return false;
  if (ehAdmin(usuario)) return true;
  if (usuario.permissoes && permissao in usuario.permissoes) {
    return Boolean(usuario.permissoes[permissao]);
  }
  return Boolean(PERMISSOES[usuario.papel]?.[permissao]?.padrao);
};

/**
 * Admin atende qualquer equipe; agente só as equipes das quais é membro.
 * @param {UsuarioLogado} usuario
 * @param {any} equipeId
 */
const atendeEquipe = (usuario, equipeId) =>
  ehAdmin(usuario) ||
  (ehEquipe(usuario) && equipesDoUsuario(usuario).some((e) => String(e) === String(equipeId)));

/**
 * Filtro do MongoDB com os chamados que o usuário pode ver:
 * - admin, ou agente com "Ver chamados de todas as equipes": todos
 * - agente: chamados das suas equipes + os que estão sob sua responsabilidade
 * - cliente: os que ele abriu (e os da empresa dele, se o perfil permitir)
 * @param {UsuarioLogado} usuario
 */
const filtroDeVisibilidade = (usuario) => {
  if (ehAdmin(usuario)) return {};
  if (ehEquipe(usuario)) {
    if (pode(usuario, 'verTodosChamados')) return {};
    return {
      $or: [{ equipe: { $in: equipesDoUsuario(usuario) } }, { responsavel: usuario._id }],
    };
  }
  if (usuario.empresa && pode(usuario, 'verChamadosDaEmpresa')) {
    return { $or: [{ solicitante: usuario._id }, { empresa: usuario.empresa }] };
  }
  return { solicitante: usuario._id };
};

/**
 * O que o usuário pode fazer neste chamado. Enviado junto com o detalhe
 * para a tela habilitar/desabilitar controles (a API valida de novo em cada ação).
 * @param {{ status: string, solicitante: any, avaliacao?: any }} chamado
 * @param {UsuarioLogado} usuario
 * @param {{ pesquisa?: { ativa: boolean } }} [contexto]
 */
const permissoesDoChamado = (chamado, usuario, { pesquisa } = {}) => {
  const fechado = chamado.status === STATUS.FECHADO;
  const equipe = ehEquipe(usuario);

  return {
    podeEditar: equipe && !fechado,
    podeAssumir: equipe && !fechado,
    podeResponder: !fechado,
    podeNotaInterna: equipe && !fechado,
    podeReabrir: fechado && equipe && pode(usuario, 'reabrirChamados'),
    podeTransferir: equipe && !fechado && pode(usuario, 'transferirChamados'),
    podeAlterarPrioridade: equipe && !fechado && pode(usuario, 'alterarPrioridade'),
    podeAplicarMacros: equipe && !fechado && pode(usuario, 'aplicarMacros'),
    verNotasInternas: equipe,
    podeAvaliar: podeAvaliar(chamado, usuario, pesquisa),
  };
};

/**
 * Pesquisa de satisfação: só o solicitante, uma única vez, depois de Resolvido/Fechado.
 * @param {{ status: string, solicitante: any, avaliacao?: any }} chamado
 * @param {UsuarioLogado} usuario
 * @param {{ ativa: boolean }} [pesquisa]
 */
const podeAvaliar = (chamado, usuario, pesquisa) =>
  Boolean(pesquisa?.ativa) &&
  !ehEquipe(usuario) &&
  pode(usuario, 'avaliarAtendimento') &&
  [STATUS.RESOLVIDO, STATUS.FECHADO].includes(chamado.status) &&
  !chamado.avaliacao &&
  String(chamado.solicitante?._id ?? chamado.solicitante) === String(usuario._id);

module.exports = {
  ehEquipe,
  ehAdmin,
  equipesDoUsuario,
  pode,
  atendeEquipe,
  filtroDeVisibilidade,
  permissoesDoChamado,
  podeAvaliar,
};
