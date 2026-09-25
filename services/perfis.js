// Resolve as permissões efetivas de um usuário a partir do perfil de acesso.
const { Perfil } = require('../models');
const { PAPEIS, PERMISSOES } = require('../constants');

/**
 * Permissões padrão do sistema para um tipo de perfil.
 * @param {string} tipo  agente | cliente
 * @returns {Record<string, boolean>}
 */
const permissoesPadrao = (tipo) =>
  Object.fromEntries(Object.entries(PERMISSOES[tipo] || {}).map(([k, v]) => [k, v.padrao]));

/**
 * Mantém só as permissões conhecidas do tipo, como booleanos.
 * @param {string} tipo
 * @param {Record<string, any> | Map<string, any> | null | undefined} valores
 */
const normalizaPermissoes = (tipo, valores) => {
  const origem = valores instanceof Map ? Object.fromEntries(valores) : valores || {};
  return Object.fromEntries(
    Object.keys(PERMISSOES[tipo] || {})
      .filter((k) => origem[k] !== undefined)
      .map((k) => [k, Boolean(origem[k])]),
  );
};

/**
 * Perfil que vale para o usuário e as permissões resultantes.
 * - admin: todas as permissões, sem perfil;
 * - perfil próprio ativo do mesmo tipo; senão o perfil padrão do tipo; senão os padrões do sistema.
 * @param {{ papel: string, perfil?: any }} usuario
 * @returns {Promise<{ perfil: { _id: any, nome: string } | null, permissoes: Record<string, boolean> }>}
 */
const acessoDoUsuario = async (usuario) => {
  if (usuario.papel === PAPEIS.ADMIN) {
    const todas = Object.values(PERMISSOES).flatMap((grupo) => Object.keys(grupo));
    return { perfil: null, permissoes: Object.fromEntries(todas.map((k) => [k, true])) };
  }

  const tipo = usuario.papel;
  const campos = 'nome permissoes';
  const perfil =
    (usuario.perfil &&
      (await Perfil.findOne({ _id: usuario.perfil, tipo, ativo: true }).select(campos).lean())) ||
    (await Perfil.findOne({ tipo, padrao: true, ativo: true }).select(campos).lean());

  return {
    perfil: perfil ? { _id: perfil._id, nome: perfil.nome } : null,
    permissoes: { ...permissoesPadrao(tipo), ...normalizaPermissoes(tipo, perfil?.permissoes) },
  };
};

module.exports = { permissoesPadrao, normalizaPermissoes, acessoDoUsuario };
