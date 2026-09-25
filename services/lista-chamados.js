const mongoose = require('mongoose');

const { Chamado } = require('../models');
const { ROTULOS_STATUS, ROTULOS_PRIORIDADE, STATUS } = require('../constants');
const {
  erroDeValidacao,
  lePaginacao,
  metaPaginacao,
  listaDaQuery,
  escapaRegex,
} = require('../utils');
const { ehEquipe, equipesDoUsuario, filtroDeVisibilidade } = require('./permissoes');
const { POPULA_CHAMADO, leNumeroDoChamado } = require('./busca-chamado');

const ORDENACOES = {
  atualizacao: { updatedAt: -1, _id: -1 },
  prioridade: { pesoPrioridade: -1, updatedAt: -1, _id: -1 },
  recentes: { createdAt: -1, _id: -1 },
  antigos: { createdAt: 1, _id: 1 },
};

// campos da listagem (descrição fica de fora para a resposta ser leve)
// (campos adicionais só no detalhe, onde o que o cliente não pode ver é filtrado)
const CAMPOS_LISTA = '-descricao -__v -camposAdicionais';

const validaEnum = (campo, valores, rotulos) => {
  const invalidos = valores.filter((v) => !rotulos[v]);
  if (invalidos.length)
    throw erroDeValidacao({ [campo]: `Valor inválido: ${invalidos.join(', ')}` });
};

const filtroDeIds = (campo, valores, usuario) => {
  const ids = valores.map((v) => {
    if (v === 'eu') return usuario._id;
    if (v === 'nenhum') return null;
    if (!mongoose.isValidObjectId(v)) throw erroDeValidacao({ [campo]: `Valor inválido: ${v}` });
    return new mongoose.Types.ObjectId(v);
  });
  return ids.length === 1 ? ids[0] : { $in: ids };
};

// Status em que o relógio corre (Pendente fica pausado; Resolvido/Fechado já pararam).
const STATUS_COM_RELOGIO = [STATUS.NOVO, STATUS.EM_ATENDIMENTO];

/**
 * ?sla=vencido     -> prazo de solução estourado e relógio correndo
 * ?sla=sem_resposta -> 1ª resposta atrasada (ninguém da equipe respondeu no prazo)
 * @param {string[]} valores
 */
const filtroDeSla = (valores) => {
  const agora = new Date();
  const invalidos = valores.filter((v) => !['vencido', 'sem_resposta'].includes(v));
  if (invalidos.length) throw erroDeValidacao({ sla: `Valor inválido: ${invalidos.join(', ')}` });

  // os dois filtros juntos pedem os chamados que atendem a qualquer um deles
  const condicoes = [];
  if (valores.includes('vencido')) {
    condicoes.push({ status: { $in: STATUS_COM_RELOGIO }, 'sla.prazoSolucao': { $lt: agora } });
  }
  if (valores.includes('sem_resposta')) {
    condicoes.push({
      status: { $in: STATUS_COM_RELOGIO },
      'sla.primeiraRespostaEm': null,
      'sla.prazoPrimeiraResposta': { $lt: agora },
    });
  }
  return condicoes.length === 1 ? condicoes[0] : { $or: condicoes };
};

/**
 * Traduz a query string em filtro do MongoDB, aplicando o RBAC.
 * Filtros aceitam múltiplos valores: ?status=novo,pendente&prioridade=alta
 * - responsavel: id, "eu" ou "nenhum"
 * - equipe: id(s) ou "minhas"; servico: id(s)
 * - busca: número do chamado (#1024) ou trecho do título
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {{ ignorarStatus?: boolean }} [opcoes]
 */
const montaFiltroDeChamados = (query, usuario, { ignorarStatus = false } = {}) => {
  const filtro = {};

  const status = listaDaQuery(query.status);
  if (status.length && !ignorarStatus) {
    validaEnum('status', status, ROTULOS_STATUS);
    filtro.status = status.length === 1 ? status[0] : { $in: status };
  }

  const prioridades = listaDaQuery(query.prioridade);
  if (prioridades.length) {
    validaEnum('prioridade', prioridades, ROTULOS_PRIORIDADE);
    filtro.prioridade = prioridades.length === 1 ? prioridades[0] : { $in: prioridades };
  }

  const categorias = listaDaQuery(query.categoria);
  if (categorias.length) filtro.categoria = filtroDeIds('categoria', categorias, usuario);

  const servicos = listaDaQuery(query.servico);
  if (servicos.length) filtro.servico = filtroDeIds('servico', servicos, usuario);

  const tags = listaDaQuery(query.tag);
  if (tags.length) filtro.tags = filtroDeIds('tag', tags, usuario);

  // condições com $or (ou que repetem campos, como status) ficam em $and para não se sobrescreverem
  const condicoes = [];

  const sla = listaDaQuery(query.sla);
  if (sla.length) condicoes.push(filtroDeSla(sla));

  // RBAC: cliente só os próprios, agente só os das suas equipes, admin todos.
  // Aplicado sempre, independentemente do que vier na query.
  const visibilidade = filtroDeVisibilidade(usuario);
  if (Object.keys(visibilidade).length) condicoes.push(visibilidade);

  if (ehEquipe(usuario)) {
    const responsaveis = listaDaQuery(query.responsavel);
    if (responsaveis.length) filtro.responsavel = filtroDeIds('responsavel', responsaveis, usuario);

    const solicitantes = listaDaQuery(query.solicitante);
    if (solicitantes.length) filtro.solicitante = filtroDeIds('solicitante', solicitantes, usuario);

    const empresas = listaDaQuery(query.empresa);
    if (empresas.length) filtro.empresa = filtroDeIds('empresa', empresas, usuario);

    // ?equipe=minhas | <id>,<id>
    const equipes = listaDaQuery(query.equipe);
    if (equipes.includes('minhas')) {
      filtro.equipe = { $in: equipesDoUsuario(usuario) };
    } else if (equipes.length) {
      filtro.equipe = filtroDeIds('equipe', equipes, usuario);
    }
  }

  const busca = String(query.busca ?? '').trim();
  if (busca) {
    const numero = /^#?\d+$/.test(busca) ? leNumeroDoChamado(busca) : null;
    condicoes.push({
      $or: [
        { titulo: { $regex: escapaRegex(busca), $options: 'i' } },
        ...(numero ? [{ numero }] : []),
      ],
    });
  }

  if (condicoes.length) filtro.$and = condicoes;
  return filtro;
};

/**
 * Listagem paginada com filtros combinados.
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const listaChamados = async (query, usuario) => {
  const filtro = montaFiltroDeChamados(query, usuario);
  const paginacao = lePaginacao(query);
  const ordem = ORDENACOES[query.ordenar] || ORDENACOES.atualizacao;

  const [total, chamados] = await Promise.all([
    Chamado.countDocuments(filtro),
    Chamado.find(filtro)
      .select(CAMPOS_LISTA)
      .sort(ordem)
      .skip(paginacao.pular)
      .limit(paginacao.porPagina)
      .populate(POPULA_CHAMADO)
      .lean(),
  ]);

  return { chamados, paginacao: metaPaginacao(total, paginacao) };
};

/**
 * Quadro Kanban: uma coluna por status, com total e os primeiros chamados de cada uma
 * (ordenados por prioridade e recência — usa o índice status+pesoPrioridade+updatedAt).
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const quadroKanban = async (query, usuario) => {
  const filtroBase = montaFiltroDeChamados(query, usuario, { ignorarStatus: true });
  const limite = Math.min(Math.max(parseInt(query.limite, 10) || 30, 1), 100);

  const colunas = await Promise.all(
    Object.values(STATUS).map(async (status) => {
      const filtro = { ...filtroBase, status };
      const [total, chamados] = await Promise.all([
        Chamado.countDocuments(filtro),
        Chamado.find(filtro)
          .select(CAMPOS_LISTA)
          .sort(ORDENACOES.prioridade)
          .limit(limite)
          .populate(POPULA_CHAMADO)
          .lean(),
      ]);
      return { status, rotulo: ROTULOS_STATUS[status], total, chamados };
    }),
  );

  return { colunas, limitePorColuna: limite };
};

module.exports = { montaFiltroDeChamados, listaChamados, quadroKanban, ORDENACOES };
