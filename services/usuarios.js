const bcrypt = require('bcrypt');
const createError = require('http-errors');

const { Usuario, Equipe, Chamado, Interacao, Perfil, Cargo, Classificacao } = require('../models');
const { PAPEIS } = require('../constants');
const { erroDeValidacao, listaDaQuery, escapaRegex } = require('../utils');
const { idValido, validaEmpresa } = require('./valida-referencias');

const SENHA_MINIMA = 6;
const POPULA_EQUIPES = [
  { path: 'equipes', select: 'nome ativa' },
  { path: 'empresa', select: 'nome ativa' },
  { path: 'perfil', select: 'nome tipo ativo' },
  { path: 'cargo', select: 'nome ativo' },
  { path: 'classificacao', select: 'nome ativa' },
];

/**
 * Garante que o id é de um registro ativo (ou o que a pessoa já tinha). Retorna o id ou null.
 * @param {import('mongoose').Model<any>} Model
 * @param {string} campo
 * @param {any} id
 * @param {any} atual  valor que a pessoa já tem (continua aceito mesmo se foi desativado)
 * @param {Record<string, any>} [filtro]  condição extra (ex.: tipo do perfil)
 */
const validaRelacao = async (Model, campo, id, atual, filtro = {}) => {
  if (id === null || id === undefined || id === '') return null;
  if (!idValido(id)) throw erroDeValidacao({ [campo]: 'Valor inválido' });
  if (atual && String(atual) === String(id)) return atual;
  const ativo = Model.schema.path('ativa') ? 'ativa' : 'ativo';
  const existe = await Model.exists({ _id: id, [ativo]: true, ...filtro });
  if (!existe)
    throw erroDeValidacao({ [campo]: 'Não encontrado, inativo ou não se aplica a este perfil' });
  return id;
};

// perfil de acesso precisa ser do mesmo tipo da pessoa; admin não usa perfil
const validaPerfil = (id, papel, atual) =>
  papel === PAPEIS.ADMIN ? null : validaRelacao(Perfil, 'perfil', id, atual, { tipo: papel });

// empresa só vale para clientes; agentes e admins ficam sem
const empresaDoUsuario = async (empresa, papel) =>
  papel === PAPEIS.CLIENTE ? ((await validaEmpresa(empresa))?._id ?? null) : null;

const validaSenha = (senha) => {
  if (typeof senha !== 'string' || senha.length < SENHA_MINIMA) {
    throw erroDeValidacao({ senha: `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres` });
  }
};

const validaPapel = (papel) => {
  if (!Object.values(PAPEIS).includes(papel)) throw erroDeValidacao({ papel: 'Papel inválido' });
};

/**
 * Valida a lista de equipes de um usuário. Cliente não participa de equipes.
 * @param {any} equipes
 * @param {string} papel
 * @returns {Promise<any[]>}
 */
const validaEquipesDoUsuario = async (equipes, papel) => {
  if (papel === PAPEIS.CLIENTE) return [];
  const ids = [...new Set(listaDaQuery(equipes))];
  if (ids.some((id) => !idValido(id))) throw erroDeValidacao({ equipes: 'Equipe inválida' });
  const encontradas = await Equipe.countDocuments({ _id: { $in: ids } });
  if (encontradas !== ids.length) throw erroDeValidacao({ equipes: 'Equipe não encontrada' });
  return ids;
};

const buscaUsuario = async (id) => {
  if (!idValido(id)) throw createError(404, 'Usuário não encontrado');
  const usuario = await Usuario.findById(id);
  if (!usuario) throw createError(404, 'Usuário não encontrado');
  return usuario;
};

const serializa = async (id) => Usuario.findById(id).select('-__v').populate(POPULA_EQUIPES).lean();

/**
 * Lista usuários (equipe). Filtros: ?papel=agente,admin&ativo=true&equipe=<id>&busca=ana
 * @param {Record<string, any>} query
 */
const listaUsuarios = async (query = {}) => {
  const filtro = {};

  const papeis = listaDaQuery(query.papel);
  papeis.forEach(validaPapel);
  if (papeis.length) filtro.papel = { $in: papeis };

  if (query.ativo !== undefined && query.ativo !== '') filtro.ativo = query.ativo === 'true';

  const equipes = listaDaQuery(query.equipe);
  if (equipes.some((id) => !idValido(id))) throw erroDeValidacao({ equipe: 'Equipe inválida' });
  if (equipes.length) filtro.equipes = { $in: equipes };

  const empresas = listaDaQuery(query.empresa);
  if (empresas.some((id) => !idValido(id))) throw erroDeValidacao({ empresa: 'Empresa inválida' });
  if (empresas.length) filtro.empresa = { $in: empresas };

  const busca = String(query.busca ?? '').trim();
  if (busca) {
    const regex = { $regex: escapaRegex(busca), $options: 'i' };
    filtro.$or = [{ nome: regex }, { email: regex }];
  }

  return Usuario.find(filtro)
    .select('-__v')
    .populate(POPULA_EQUIPES)
    .sort({ nome: 1 })
    .limit(500)
    .lean();
};

/**
 * Cria usuário (admin).
 * @param {{ nome?: string, email?: string, senha?: string, papel?: string, equipes?: string[], empresa?: string, perfil?: string, cargo?: string, classificacao?: string }} dados
 */
const criaUsuario = async ({
  nome,
  email,
  senha,
  papel = PAPEIS.CLIENTE,
  equipes = [],
  empresa = null,
  perfil = null,
  cargo = null,
  classificacao = null,
}) => {
  validaSenha(senha);
  validaPapel(papel);

  const usuario = await Usuario.create({
    nome,
    email,
    papel,
    equipes: await validaEquipesDoUsuario(equipes, papel),
    empresa: await empresaDoUsuario(empresa, papel),
    perfil: await validaPerfil(perfil, papel, null),
    cargo: await validaRelacao(Cargo, 'cargo', cargo, null),
    classificacao: await validaRelacao(Classificacao, 'classificacao', classificacao, null),
    senha: await bcrypt.hash(senha, 10),
  });

  return serializa(usuario._id);
};

/**
 * Atualiza nome, e-mail, papel, equipes, empresa, perfil de acesso, cargo, classificação, ativo ou senha (admin).
 * Admin não pode se rebaixar nem se desativar.
 * @param {string} id
 * @param {{ nome?: string, email?: string, papel?: string, ativo?: boolean, senha?: string, equipes?: string[], empresa?: string, perfil?: string, cargo?: string, classificacao?: string }} dados
 * @param {import('./permissoes').UsuarioLogado} quemAltera
 */
const atualizaUsuario = async (id, dados, quemAltera) => {
  const usuario = await buscaUsuario(id);

  const ehEleProprio = String(usuario._id) === String(quemAltera._id);
  if (ehEleProprio && (dados.ativo === false || (dados.papel && dados.papel !== PAPEIS.ADMIN))) {
    throw createError(422, 'Você não pode desativar nem remover o seu próprio acesso de admin');
  }

  const papelAnterior = usuario.papel;
  if (dados.nome !== undefined) usuario.nome = dados.nome;
  if (dados.email !== undefined) usuario.email = dados.email;
  if (dados.papel !== undefined) {
    validaPapel(dados.papel);
    usuario.papel = dados.papel;
  }
  if (dados.equipes !== undefined || usuario.papel === PAPEIS.CLIENTE) {
    usuario.equipes = await validaEquipesDoUsuario(dados.equipes ?? usuario.equipes, usuario.papel);
  }
  if (dados.empresa !== undefined || usuario.papel !== PAPEIS.CLIENTE) {
    usuario.empresa = await empresaDoUsuario(
      dados.empresa !== undefined ? dados.empresa : usuario.empresa,
      usuario.papel,
    );
  }
  // mudar o papel pode invalidar o perfil (ex.: cliente virou agente)
  if (dados.perfil !== undefined || dados.papel !== undefined) {
    const perfilAtual = usuario.papel === papelAnterior ? usuario.perfil : null;
    const novo = dados.perfil !== undefined ? dados.perfil : perfilAtual;
    usuario.perfil = await validaPerfil(novo, usuario.papel, perfilAtual);
  }
  if (dados.cargo !== undefined) {
    usuario.cargo = await validaRelacao(Cargo, 'cargo', dados.cargo, usuario.cargo);
  }
  if (dados.classificacao !== undefined) {
    usuario.classificacao = await validaRelacao(
      Classificacao,
      'classificacao',
      dados.classificacao,
      usuario.classificacao,
    );
  }
  if (dados.ativo !== undefined) usuario.ativo = Boolean(dados.ativo);
  if (dados.senha !== undefined && dados.senha !== '') {
    validaSenha(dados.senha);
    usuario.senha = await bcrypt.hash(dados.senha, 10);
  }

  await usuario.save();
  return serializa(usuario._id);
};

/**
 * Remove um usuário (admin). Quem já tem histórico (chamados ou mensagens) não
 * pode ser apagado — deve ser desativado, para a timeline continuar íntegra.
 * @param {string} id
 * @param {import('./permissoes').UsuarioLogado} quemRemove
 */
const removeUsuario = async (id, quemRemove) => {
  const usuario = await buscaUsuario(id);
  if (String(usuario._id) === String(quemRemove._id)) {
    throw createError(422, 'Você não pode remover a si mesmo');
  }

  const [temChamados, temInteracoes] = await Promise.all([
    Chamado.exists({ $or: [{ solicitante: usuario._id }, { responsavel: usuario._id }] }),
    Interacao.exists({ autor: usuario._id }),
  ]);
  if (temChamados || temInteracoes) {
    throw createError(
      409,
      `${usuario.nome} possui histórico de atendimento e não pode ser removido. Desative o usuário.`,
    );
  }

  await usuario.deleteOne();
};

module.exports = {
  listaUsuarios,
  criaUsuario,
  atualizaUsuario,
  removeUsuario,
  validaEquipesDoUsuario,
};
