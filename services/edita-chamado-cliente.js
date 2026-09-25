const createError = require('http-errors');

const { Chamado, Interacao, Notificacao } = require('../models');
const { STATUS, TIPOS_INTERACAO } = require('../constants');
const { erroDeValidacao, logger } = require('../utils');
const { detalhaChamado } = require('./busca-chamado');
const { validaServico, validaCategoria, validaResponsavel } = require('./valida-referencias');
const { validaCamposAdicionais, registraCamposAlterados } = require('./campos-adicionais');
const registraEventos = require('./registra-eventos');
const { notificaEquipeDoChamado } = require('./notificacoes-do-sistema');

const idDe = (v) => (v === null || v === undefined ? null : String(v._id ?? v));
const mesmoValor = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Só quem abriu, e só enquanto ninguém da equipe começou a atender (status Novo).
 * @param {any} chamado
 * @param {{ _id: any }} usuario
 */
const garanteQuePodeMexer = (chamado, usuario, acao) => {
  if (idDe(chamado.solicitante) !== String(usuario._id)) {
    throw createError(403, `Só quem abriu o chamado pode ${acao}`);
  }
  if (chamado.status !== STATUS.NOVO) {
    throw createError(
      409,
      `O chamado já está em atendimento e não pode mais ser ${acao === 'editá-lo' ? 'editado' : 'excluído'}. Envie uma mensagem para a equipe.`,
    );
  }
};

/**
 * O solicitante corrige o chamado enquanto ele está Novo: título, descrição, serviço
 * (que define a equipe), categoria e campos adicionais que ele vê. Cada mudança fica na timeline.
 * @param {any} chamado  documento lean atual
 * @param {{ titulo?: string, descricao?: string, servico?: string, categoria?: string|null, camposAdicionais?: Record<string, any> }} dados
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const editaChamadoDoCliente = async (chamado, dados, usuario) => {
  garanteQuePodeMexer(chamado, usuario, 'editá-lo');

  const $set = {};
  const $unset = {};
  const erros = {};
  const eventos = []; // { campo, de, para } para a timeline

  if (dados.titulo !== undefined) {
    const titulo = String(dados.titulo).trim();
    if (titulo.length < 3) erros.titulo = 'Título muito curto';
    else if (titulo.length > 150) erros.titulo = 'Título deve ter no máximo 150 caracteres';
    else if (titulo !== chamado.titulo) $set.titulo = titulo;
  }
  if (dados.descricao !== undefined) {
    const descricao = String(dados.descricao).trim();
    if (!descricao) erros.descricao = 'Descrição é obrigatória';
    else if (descricao.length > 20000) erros.descricao = 'Descrição muito longa';
    else if (descricao !== chamado.descricao) $set.descricao = descricao;
  }

  // serviço: define a equipe que vai atender
  let novaEquipe = null;
  if (dados.servico !== undefined && idDe(dados.servico) !== idDe(chamado.servico)) {
    try {
      const servico = await validaServico(dados.servico);
      $set.servico = servico._id;
      eventos.push({ campo: 'servico', de: chamado.servico ?? null, para: servico._id });
      if (idDe(servico.equipe) !== idDe(chamado.equipe)) {
        novaEquipe = servico.equipe;
        $set.equipe = servico.equipe;
        eventos.push({ campo: 'equipe', de: chamado.equipe ?? null, para: servico.equipe });
        // quem já estava de responsável só continua se atender a nova equipe
        if (chamado.responsavel) {
          const continua = await validaResponsavel(chamado.responsavel, servico.equipe).catch(
            () => null,
          );
          if (!continua) {
            $set.responsavel = null;
            eventos.push({ campo: 'responsavel', de: chamado.responsavel, para: null });
          }
        }
      }
    } catch (e) {
      if (!e.detalhes) throw e;
      Object.assign(erros, e.detalhes);
    }
  }

  if (dados.categoria !== undefined && idDe(dados.categoria) !== idDe(chamado.categoria)) {
    try {
      const categoria = await validaCategoria(dados.categoria);
      $set.categoria = categoria ? categoria._id : null;
      eventos.push({ campo: 'categoria', de: chamado.categoria ?? null, para: $set.categoria });
    } catch (e) {
      if (!e.detalhes) throw e;
      Object.assign(erros, e.detalhes);
    }
  }

  // campos adicionais: só os que o cliente vê, para o serviço/categoria finais
  let campos = [];
  if (dados.camposAdicionais !== undefined) {
    const atuais = chamado.camposAdicionais || {};
    try {
      const validos = await validaCamposAdicionais(
        dados.camposAdicionais,
        {
          servico: $set.servico ?? chamado.servico,
          categoria: 'categoria' in $set ? $set.categoria : chamado.categoria,
          atuais,
        },
        usuario,
      );
      campos = Object.entries(validos)
        .filter(([id, para]) => !mesmoValor(atuais[id], para))
        .map(([campo, para]) => ({ campo, de: atuais[campo] ?? null, para }));
      for (const { campo, para } of campos) {
        if (para === null) $unset[`camposAdicionais.${campo}`] = '';
        else $set[`camposAdicionais.${campo}`] = para;
      }
    } catch (e) {
      if (!e.detalhes) throw e;
      Object.assign(erros, e.detalhes);
    }
  }

  if (Object.keys(erros).length) throw erroDeValidacao(erros);
  if (!Object.keys($set).length && !Object.keys($unset).length) {
    return detalhaChamado(chamado._id, usuario);
  }

  // só grava se o chamado ainda estiver Novo (a equipe pode ter assumido nesse meio tempo)
  const atualizado = await Chamado.findOneAndUpdate(
    { _id: chamado._id, status: STATUS.NOVO },
    {
      $set: { ...$set, updatedAt: new Date() },
      ...(Object.keys($unset).length && { $unset }),
    },
    { new: true },
  ).lean();
  if (!atualizado) {
    throw createError(
      409,
      'A equipe acabou de começar o atendimento: o chamado não pode mais ser editado',
    );
  }

  // timeline: texto (título/descrição), campos do chamado e campos adicionais
  if ($set.titulo || $set.descricao) {
    const oQue =
      $set.titulo && $set.descricao
        ? 'o título e a descrição'
        : $set.titulo
          ? 'o título'
          : 'a descrição';
    await Interacao.create({
      chamado: chamado._id,
      autor: usuario._id,
      tipo: TIPOS_INTERACAO.SISTEMA,
      mensagem: `${usuario.nome} editou ${oQue} do chamado`,
      evento: {
        campo: 'conteudo',
        de: $set.titulo ? chamado.titulo : null,
        para: $set.titulo || null,
      },
    });
  }
  await registraEventos(chamado._id, eventos, usuario);
  await registraCamposAlterados(chamado._id, campos, usuario);
  // a nova equipe fica sabendo pelo sino
  if (novaEquipe) await notificaEquipeDoChamado('novo-chamado', chamado._id, usuario);

  return detalhaChamado(chamado._id, usuario);
};

/**
 * O solicitante exclui o próprio chamado enquanto ele está Novo. Apaga também a timeline
 * e os avisos do sino ligados a ele.
 * @param {any} chamado
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const excluiChamadoDoCliente = async (chamado, usuario) => {
  garanteQuePodeMexer(chamado, usuario, 'excluí-lo');
  const { deletedCount } = await Chamado.deleteOne({
    _id: chamado._id,
    status: STATUS.NOVO,
    solicitante: usuario._id,
  });
  if (!deletedCount) {
    throw createError(
      409,
      'A equipe acabou de começar o atendimento: o chamado não pode mais ser excluído',
    );
  }
  await Promise.all([
    Interacao.deleteMany({ chamado: chamado._id }),
    Notificacao.deleteMany({ chamado: chamado._id }),
  ]);
  logger.info(`Chamado #${chamado.numero} excluído pelo solicitante ${usuario.email}`);
  return { mensagem: `Chamado #${chamado.numero} excluído` };
};

module.exports = { editaChamadoDoCliente, excluiChamadoDoCliente };
