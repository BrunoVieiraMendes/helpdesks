const createError = require('http-errors');

const { Chamado } = require('../models');
const { STATUS, ROTULOS_STATUS, ROTULOS_PRIORIDADE, PESOS_PRIORIDADE } = require('../constants');
const { erroDeValidacao } = require('../utils');
const { ehEquipe, atendeEquipe, pode } = require('./permissoes');
const { validaTransicao, slaParaMudancaDeStatus } = require('./regras-chamado');
const { slaParaAlteracao } = require('./sla');
const {
  vazio,
  validaResponsavel,
  validaCategoria,
  validaServico,
  validaEquipe,
  validaTags,
  justificativasDoStatus,
  validaJustificativa,
} = require('./valida-referencias');
const registraEventos = require('./registra-eventos');
const { validaCamposAdicionais, registraCamposAlterados } = require('./campos-adicionais');
const { detalhaChamado } = require('./busca-chamado');
const { notificaEquipeDoChamado } = require('./notificacoes-do-sistema');

// campo alterado -> permissão do perfil de acesso exigida
const PERMISSAO_POR_CAMPO = {
  prioridade: ['alterarPrioridade', 'alterar a prioridade'],
  equipe: ['transferirChamados', 'transferir chamados'],
  servico: ['transferirChamados', 'transferir chamados'],
};

const exigePermissoes = (mudancas, usuario) => {
  for (const campo of Object.keys(mudancas)) {
    const regra = PERMISSAO_POR_CAMPO[campo];
    if (regra && !pode(usuario, regra[0])) {
      throw createError(403, `Seu perfil de acesso não permite ${regra[1]}`);
    }
  }
};

const mesmoValor = (a, b) => String(a ?? '') === String(b ?? '');
const mesmasTags = (a, b) =>
  (a || []).map(String).sort().join() === (b || []).map(String).sort().join();

/**
 * Campos adicionais que de fato mudam, validados contra o serviço/categoria finais do chamado.
 * @returns {Promise<{ campo: string, de: any, para: any }[]>}
 */
const alteracoesDeCampos = async (chamado, entrada, mudancas, usuario) => {
  const atuais = chamado.camposAdicionais || {};
  const validos = await validaCamposAdicionais(
    entrada,
    {
      servico: mudancas.servico ?? chamado.servico,
      categoria: 'categoria' in mudancas ? mudancas.categoria : chamado.categoria,
      atuais,
    },
    usuario,
  );
  return Object.entries(validos)
    .filter(([id, para]) => !mesmoValor(atuais[id], para))
    .map(([campo, para]) => ({ campo, de: atuais[campo] ?? null, para }));
};

/**
 * Justificativa do status final do chamado.
 * - Mudou de status: a justificativa anterior deixa de valer. Se o novo status tiver
 *   justificativas cadastradas, uma delas é obrigatória (exceto em mudanças automáticas).
 * - Mesmo status: permite trocar o motivo (ex.: Pendente aguardando cliente -> fornecedor).
 * @returns {Promise<any>} id da justificativa, null ou undefined (sem alteração)
 */
const resolveJustificativa = async (chamado, dados, statusFinal, { automatico }) => {
  const mudouStatus = statusFinal !== chamado.status;
  if (!mudouStatus && !('justificativa' in dados)) return undefined;

  const informada = await validaJustificativa(dados.justificativa, statusFinal);
  if (!informada && !automatico && (await justificativasDoStatus(statusFinal)).length) {
    throw erroDeValidacao({
      justificativa: `Informe a justificativa para o status ${ROTULOS_STATUS[statusFinal]}`,
    });
  }
  return informada?._id ?? null;
};

/**
 * Normaliza e valida os campos enviados, devolvendo só o que de fato mudou.
 *
 * Ordem importa: serviço/equipe são resolvidos antes do responsável, porque o
 * responsável precisa ser membro da equipe final do chamado.
 * - Trocar o serviço leva o chamado para a equipe do novo serviço (salvo se a equipe vier junto).
 * - Transferir de equipe tira o responsável atual se ele não fizer parte da nova equipe.
 * @returns {Promise<Record<string, any>>}
 */
const calculaMudancas = async (chamado, dados, opcoes) => {
  const mudancas = {};
  const muda = (campo, valor) => {
    if (!mesmoValor(chamado[campo], valor)) mudancas[campo] = valor;
  };

  if ('status' in dados) muda('status', dados.status);

  if ('prioridade' in dados) {
    if (!ROTULOS_PRIORIDADE[dados.prioridade]) {
      throw erroDeValidacao({ prioridade: `Prioridade inválida: ${dados.prioridade}` });
    }
    muda('prioridade', dados.prioridade);
  }

  if ('categoria' in dados) {
    muda('categoria', (await validaCategoria(dados.categoria ?? null))?._id ?? null);
  }

  if ('servico' in dados) {
    const servico = await validaServico(dados.servico);
    muda('servico', servico._id);
    if (!('equipe' in dados) && mudancas.servico) muda('equipe', servico.equipe);
  }

  if ('equipe' in dados) muda('equipe', (await validaEquipe(dados.equipe))._id);

  const equipeFinal = mudancas.equipe ?? chamado.equipe;

  if ('responsavel' in dados) {
    muda(
      'responsavel',
      (await validaResponsavel(dados.responsavel ?? null, equipeFinal))?._id ?? null,
    );
  } else if (mudancas.equipe && chamado.responsavel) {
    // transferência: o responsável atual continua só se também atender a nova equipe
    const atual = await validaResponsavel(chamado.responsavel, equipeFinal).catch(() => null);
    if (!atual) mudancas.responsavel = null;
  }

  if ('tags' in dados) {
    const tags = await validaTags(vazio(dados.tags) ? [] : dados.tags, chamado.tags || []);
    if (!mesmasTags(chamado.tags, tags)) mudancas.tags = tags;
  }

  const justificativa = await resolveJustificativa(
    chamado,
    dados,
    mudancas.status ?? chamado.status,
    opcoes,
  );
  if (justificativa !== undefined) muda('justificativa', justificativa);

  return mudancas;
};

/**
 * Altera status, justificativa, prioridade, responsável, categoria, serviço, equipe
 * (transferência), tags ou campos adicionais.
 *
 * - Chamado fechado é somente leitura; só admin reabre (status -> em_atendimento).
 * - Ir para "Em Atendimento" sem responsável atribui o chamado a quem moveu.
 * - Atualiza os campos de SLA junto com o status (Pendente pausa o relógio)
 *   e recalcula os prazos quando a prioridade muda.
 * - Grava um evento na timeline para cada campo alterado.
 * - Update condicional (compare-and-set) nos campos alterados: se outra pessoa
 *   mexeu no mesmo campo entre a leitura e a escrita, responde 409.
 *
 * @param {any} chamado  documento lean atual
 * @param {Record<string, any>} dados
 * @param {import('./permissoes').UsuarioLogado | null} usuario  quem está alterando
 * @param {{ automatico?: boolean }} [opcoes]  automatico = regra do sistema (ex.: cliente respondeu), ignora checagem de papel
 */
const atualizaChamado = async (chamado, dados, usuario, { automatico = false } = {}) => {
  const fechado = chamado.status === STATUS.FECHADO;
  const reabrindo = fechado && dados.status && dados.status !== STATUS.FECHADO;

  if (!automatico) {
    if (!ehEquipe(usuario)) throw createError(403, 'Você não tem permissão para esta ação');
    if (reabrindo && !pode(usuario, 'reabrirChamados')) {
      throw createError(403, 'Seu perfil de acesso não permite reabrir chamados fechados');
    }
    if (fechado && !reabrindo) {
      throw createError(409, 'Chamado fechado é somente leitura. Reabra-o para fazer alterações');
    }
  }

  const mudancas = await calculaMudancas(chamado, dados, { automatico });
  const campos =
    'camposAdicionais' in dados
      ? await alteracoesDeCampos(chamado, dados.camposAdicionais, mudancas, usuario)
      : [];
  if (!Object.keys(mudancas).length && !campos.length) {
    return detalhaChamado(chamado._id, usuario);
  }
  if (!automatico) exigePermissoes(mudancas, usuario);

  const agora = new Date();
  const $set = { ...mudancas, updatedAt: agora };
  const $unset = {};
  for (const { campo, para } of campos) {
    if (para === null) $unset[`camposAdicionais.${campo}`] = '';
    else $set[`camposAdicionais.${campo}`] = para;
  }

  if (mudancas.status) validaTransicao(chamado.status, mudancas.status);
  // pausa/retomada do relógio e novos prazos quando muda a urgência
  Object.assign($set, await slaParaAlteracao(chamado, mudancas, agora));

  if (mudancas.status) {
    Object.assign($set, slaParaMudancaDeStatus(chamado, mudancas.status, agora));

    const ficaSemResponsavel = !chamado.responsavel && !('responsavel' in mudancas);
    const podeAssumir =
      ehEquipe(usuario) && atendeEquipe(usuario, mudancas.equipe ?? chamado.equipe);
    if (mudancas.status === STATUS.EM_ATENDIMENTO && ficaSemResponsavel && podeAssumir) {
      mudancas.responsavel = usuario._id;
      $set.responsavel = usuario._id;
    }
  }

  if (mudancas.prioridade) $set.pesoPrioridade = PESOS_PRIORIDADE[mudancas.prioridade];

  // compare-and-set: só grava se os campos alterados ainda têm o valor que lemos
  const filtro = { _id: chamado._id };
  for (const campo of Object.keys(mudancas)) filtro[campo] = chamado[campo] ?? null;

  const atualizado = await Chamado.findOneAndUpdate(
    filtro,
    { $set, ...(Object.keys($unset).length && { $unset }) },
    { new: true, runValidators: true },
  ).lean();
  if (!atualizado) {
    throw createError(409, 'O chamado foi alterado por outra pessoa. Recarregue e tente novamente');
  }

  await registraEventos(
    chamado._id,
    Object.entries(mudancas)
      // a justificativa que só "caiu" junto com a troca de status não precisa de evento próprio
      .filter(([campo, para]) => campo !== 'justificativa' || para)
      .map(([campo, para]) => ({ campo, de: chamado[campo] ?? null, para })),
    usuario,
  );
  await registraCamposAlterados(chamado._id, campos, usuario);
  if (mudancas.equipe) await notificaEquipeDoChamado('chamado-transferido', chamado._id, usuario);

  return detalhaChamado(chamado._id, usuario);
};

module.exports = atualizaChamado;
