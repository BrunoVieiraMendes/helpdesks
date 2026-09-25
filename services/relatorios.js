// Indicadores e relatórios: agregações sobre os chamados que o usuário pode ver,
// no período e com os filtros escolhidos (equipe, serviço, responsável, prioridade, categoria).
const mongoose = require('mongoose');

const { Chamado, Usuario, Equipe, Servico, Categoria } = require('../models');
const { STATUS, ROTULOS_STATUS, ROTULOS_PRIORIDADE } = require('../constants');
const { erroDeValidacao, dataIsoValida } = require('../utils');
const { montaFiltroDeChamados } = require('./lista-chamados');
const { STATUS_ABERTOS } = require('./regras-chamado');
const { obtemConfiguracao } = require('./configuracao');
const { POPULA_CHAMADO } = require('./busca-chamado');

const DIA = 24 * 60 * 60 * 1000;
const MAXIMO_DE_DIAS = 366;
const STATUS_COM_RELOGIO = [STATUS.NOVO, STATUS.EM_ATENDIMENTO];
// filtros da fila aceitos nos relatórios (status e busca ficam de fora: o período manda)
const FILTROS = ['equipe', 'servico', 'responsavel', 'prioridade', 'categoria'];

// "-03:00" a partir do deslocamento em minutos (usado nas datas do MongoDB)
const fusoTexto = (minutos) => {
  const sinal = minutos < 0 ? '-' : '+';
  const abs = Math.abs(minutos);
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
};

// meia-noite local da data AAAA-MM-DD
const inicioLocal = (dataIso, fusoMinutos) =>
  new Date(Date.parse(`${dataIso}T00:00:00Z`) - fusoMinutos * 60 * 1000);

const hojeLocal = (fusoMinutos) =>
  new Date(Date.now() + fusoMinutos * 60 * 1000).toISOString().slice(0, 10);

const somaDias = (dataIso, dias) =>
  new Date(Date.parse(`${dataIso}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);

/**
 * Lê o período (?de=AAAA-MM-DD&ate=AAAA-MM-DD, padrão: últimos 30 dias) e o anterior, de mesmo tamanho.
 * @param {Record<string, any>} query
 * @param {number} fusoMinutos
 */
const lePeriodo = (query, fusoMinutos) => {
  const hoje = hojeLocal(fusoMinutos);
  const ate = query.ate || hoje;
  const de = query.de || somaDias(ate, -29);
  if (!dataIsoValida(de) || !dataIsoValida(ate)) {
    throw erroDeValidacao({ periodo: 'Datas inválidas (use AAAA-MM-DD)' });
  }
  if (de > ate) throw erroDeValidacao({ periodo: 'A data inicial é depois da final' });
  const dias = Math.round((Date.parse(ate) - Date.parse(de)) / DIA) + 1;
  if (dias > MAXIMO_DE_DIAS) {
    throw erroDeValidacao({ periodo: `Escolha um período de até ${MAXIMO_DE_DIAS} dias` });
  }
  const inicio = inicioLocal(de, fusoMinutos);
  const fim = inicioLocal(somaDias(ate, 1), fusoMinutos);
  const anteriorDe = somaDias(de, -dias);
  return {
    de,
    ate,
    dias,
    inicio,
    fim,
    anterior: {
      de: anteriorDe,
      ate: somaDias(de, -1),
      inicio: inicioLocal(anteriorDe, fusoMinutos),
      fim: inicio,
    },
  };
};

// junta o filtro base (visibilidade + filtros da tela) com condições do indicador
const e = (base, filtro) => ({ $and: [base, filtro] });
const noIntervalo = (campo, { inicio, fim }) => ({ [campo]: { $gte: inicio, $lt: fim } });
const percentual = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : null);
// horas com uma casa decimal
const emHoras = (ms) => (ms === null || ms === undefined ? null : Math.round(ms / 360000) / 10);

/** Nomes de documentos referenciados (equipes, serviços, pessoas...) por id. */
const nomesPorId = async (Model, ids) => {
  const validos = ids.filter((id) => id && mongoose.isValidObjectId(id));
  const docs = await Model.find({ _id: { $in: validos } })
    .select('nome')
    .lean();
  return new Map(docs.map((d) => [String(d._id), d.nome]));
};

/**
 * Agrupa chamados por um campo de referência e devolve [{ id, nome, total }] em ordem decrescente.
 * O que passar de `limite` vira "Outros".
 */
const contaPorReferencia = async (filtro, campo, Model, { vazio, limite = 8 } = {}) => {
  const grupos = await Chamado.aggregate([
    { $match: filtro },
    { $group: { _id: `$${campo}`, total: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  const nomes = await nomesPorId(
    Model,
    grupos.map((g) => g._id),
  );
  const itens = grupos.map((g) => ({
    id: g._id ? String(g._id) : null,
    nome: g._id ? nomes.get(String(g._id)) || '(removido)' : vazio,
    total: g.total,
  }));
  if (itens.length <= limite) return itens;
  const outros = itens.slice(limite - 1).reduce((soma, i) => soma + i.total, 0);
  return [...itens.slice(0, limite - 1), { id: 'outros', nome: 'Outros', total: outros }];
};

/**
 * Todos os indicadores da tela, calculados sobre o mesmo recorte.
 * @param {Record<string, any>} query  de, ate + filtros da fila
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const indicadores = async (query, usuario) => {
  const configuracao = await obtemConfiguracao();
  const fuso = configuracao.expediente.fusoMinutos;
  const timezone = fusoTexto(fuso);
  const periodo = lePeriodo(query, fuso);
  const filtrosDaTela = Object.fromEntries(FILTROS.map((f) => [f, query[f]]));
  const base = montaFiltroDeChamados(filtrosDaTela, usuario, { ignorarStatus: true });
  const agora = new Date();

  const abertosNoPeriodo = e(base, noIntervalo('createdAt', periodo));
  const resolvidosNoPeriodo = e(base, noIntervalo('sla.resolvidoEm', periodo));
  const avaliadosNoPeriodo = e(base, noIntervalo('avaliacao.em', periodo));

  const [
    abertos,
    abertosAntes,
    resolvidos,
    resolvidosAntes,
    backlogPorStatus,
    serieAbertos,
    serieResolvidos,
    porServico,
    porEquipe,
    porCategoria,
    porPrioridade,
    mapaDeCalor,
    temposResposta,
    temposSolucao,
    slaResolvidos,
    slaResposta,
    slaSemanal,
    slaPorPrioridade,
    vencidosAgora,
    agentes,
    equipes,
    satisfacao,
    comentarios,
  ] = await Promise.all([
    Chamado.countDocuments(abertosNoPeriodo),
    Chamado.countDocuments(e(base, noIntervalo('createdAt', periodo.anterior))),
    Chamado.countDocuments(resolvidosNoPeriodo),
    Chamado.countDocuments(e(base, noIntervalo('sla.resolvidoEm', periodo.anterior))),
    Chamado.aggregate([
      { $match: e(base, { status: { $in: STATUS_ABERTOS } }) },
      { $group: { _id: '$status', total: { $sum: 1 } } },
    ]),
    Chamado.aggregate([
      { $match: abertosNoPeriodo },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone } },
          total: { $sum: 1 },
        },
      },
    ]),
    Chamado.aggregate([
      { $match: resolvidosNoPeriodo },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$sla.resolvidoEm', timezone } },
          total: { $sum: 1 },
        },
      },
    ]),
    contaPorReferencia(abertosNoPeriodo, 'servico', Servico, { vazio: 'Sem serviço' }),
    contaPorReferencia(abertosNoPeriodo, 'equipe', Equipe, { vazio: 'Sem equipe' }),
    contaPorReferencia(abertosNoPeriodo, 'categoria', Categoria, { vazio: 'Sem categoria' }),
    Chamado.aggregate([
      { $match: abertosNoPeriodo },
      { $group: { _id: '$prioridade', total: { $sum: 1 } } },
    ]),
    // dia da semana (1 = domingo) x hora de abertura
    Chamado.aggregate([
      { $match: abertosNoPeriodo },
      {
        $group: {
          _id: {
            dia: { $dayOfWeek: { date: '$createdAt', timezone } },
            hora: { $hour: { date: '$createdAt', timezone } },
          },
          total: { $sum: 1 },
        },
      },
    ]),
    Chamado.aggregate([
      { $match: e(abertosNoPeriodo, { 'sla.primeiraRespostaEm': { $ne: null } }) },
      {
        $group: {
          _id: null,
          media: { $avg: { $subtract: ['$sla.primeiraRespostaEm', '$createdAt'] } },
        },
      },
    ]),
    Chamado.aggregate([
      { $match: resolvidosNoPeriodo },
      {
        $group: { _id: null, media: { $avg: { $subtract: ['$sla.resolvidoEm', '$createdAt'] } } },
      },
    ]),
    // solução dentro do prazo (chamados resolvidos no período que tinham prazo)
    Chamado.aggregate([
      { $match: e(resolvidosNoPeriodo, { 'sla.prazoSolucao': { $ne: null } }) },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          noPrazo: {
            $sum: { $cond: [{ $lte: ['$sla.resolvidoEm', '$sla.prazoSolucao'] }, 1, 0] },
          },
        },
      },
    ]),
    // 1ª resposta: no prazo, atrasada (respondida depois ou sem resposta e prazo vencido)
    Chamado.aggregate([
      { $match: e(abertosNoPeriodo, { 'sla.prazoPrimeiraResposta': { $ne: null } }) },
      {
        $group: {
          _id: null,
          noPrazo: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$sla.primeiraRespostaEm', null] },
                    { $lte: ['$sla.primeiraRespostaEm', '$sla.prazoPrimeiraResposta'] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          atrasadas: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $gt: ['$sla.primeiraRespostaEm', '$sla.prazoPrimeiraResposta'] },
                    {
                      $and: [
                        { $eq: ['$sla.primeiraRespostaEm', null] },
                        { $lt: ['$sla.prazoPrimeiraResposta', agora] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    // SLA de solução por semana (segunda-feira como início)
    Chamado.aggregate([
      { $match: e(resolvidosNoPeriodo, { 'sla.prazoSolucao': { $ne: null } }) },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: {
                $dateTrunc: {
                  date: '$sla.resolvidoEm',
                  unit: 'week',
                  timezone,
                  startOfWeek: 'monday',
                },
              },
              timezone,
            },
          },
          noPrazo: {
            $sum: { $cond: [{ $lte: ['$sla.resolvidoEm', '$sla.prazoSolucao'] }, 1, 0] },
          },
          fora: { $sum: { $cond: [{ $gt: ['$sla.resolvidoEm', '$sla.prazoSolucao'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Chamado.aggregate([
      { $match: e(resolvidosNoPeriodo, { 'sla.prazoSolucao': { $ne: null } }) },
      {
        $group: {
          _id: '$prioridade',
          total: { $sum: 1 },
          noPrazo: {
            $sum: { $cond: [{ $lte: ['$sla.resolvidoEm', '$sla.prazoSolucao'] }, 1, 0] },
          },
          tempo: { $avg: { $subtract: ['$sla.resolvidoEm', '$createdAt'] } },
        },
      },
    ]),
    Chamado.countDocuments(
      e(base, { status: { $in: STATUS_COM_RELOGIO }, 'sla.prazoSolucao': { $lt: agora } }),
    ),
    // desempenho por responsável: resolvidos no período, tempo, SLA, backlog e avaliações
    Chamado.aggregate([
      {
        $match: e(base, {
          responsavel: { $ne: null },
          $or: [
            noIntervalo('sla.resolvidoEm', periodo),
            { status: { $in: STATUS_ABERTOS } },
            noIntervalo('avaliacao.em', periodo),
          ],
        }),
      },
      {
        $project: {
          responsavel: 1,
          resolvido: {
            $and: [
              { $gte: ['$sla.resolvidoEm', periodo.inicio] },
              { $lt: ['$sla.resolvidoEm', periodo.fim] },
            ],
          },
          aberto: { $in: ['$status', STATUS_ABERTOS] },
          avaliado: {
            $and: [
              { $gte: ['$avaliacao.em', periodo.inicio] },
              { $lt: ['$avaliacao.em', periodo.fim] },
            ],
          },
          tempo: { $subtract: ['$sla.resolvidoEm', '$createdAt'] },
          noPrazo: { $lte: ['$sla.resolvidoEm', '$sla.prazoSolucao'] },
          temPrazo: { $ne: [{ $ifNull: ['$sla.prazoSolucao', null] }, null] },
          nota: '$avaliacao.nota',
        },
      },
      {
        $group: {
          _id: '$responsavel',
          resolvidos: { $sum: { $cond: ['$resolvido', 1, 0] } },
          emAberto: { $sum: { $cond: ['$aberto', 1, 0] } },
          tempo: { $avg: { $cond: ['$resolvido', '$tempo', null] } },
          comPrazo: { $sum: { $cond: [{ $and: ['$resolvido', '$temPrazo'] }, 1, 0] } },
          noPrazo: {
            $sum: { $cond: [{ $and: ['$resolvido', '$temPrazo', '$noPrazo'] }, 1, 0] },
          },
          nota: { $avg: { $cond: ['$avaliado', '$nota', null] } },
          avaliacoes: { $sum: { $cond: ['$avaliado', 1, 0] } },
        },
      },
    ]),
    // desempenho por equipe
    Chamado.aggregate([
      {
        $match: e(base, {
          $or: [
            noIntervalo('createdAt', periodo),
            noIntervalo('sla.resolvidoEm', periodo),
            { status: { $in: STATUS_ABERTOS } },
          ],
        }),
      },
      {
        $project: {
          equipe: 1,
          aberto: {
            $and: [{ $gte: ['$createdAt', periodo.inicio] }, { $lt: ['$createdAt', periodo.fim] }],
          },
          resolvido: {
            $and: [
              { $gte: ['$sla.resolvidoEm', periodo.inicio] },
              { $lt: ['$sla.resolvidoEm', periodo.fim] },
            ],
          },
          backlog: { $in: ['$status', STATUS_ABERTOS] },
          tempo: { $subtract: ['$sla.resolvidoEm', '$createdAt'] },
          noPrazo: { $lte: ['$sla.resolvidoEm', '$sla.prazoSolucao'] },
          temPrazo: { $ne: [{ $ifNull: ['$sla.prazoSolucao', null] }, null] },
        },
      },
      {
        $group: {
          _id: '$equipe',
          abertos: { $sum: { $cond: ['$aberto', 1, 0] } },
          resolvidos: { $sum: { $cond: ['$resolvido', 1, 0] } },
          emAberto: { $sum: { $cond: ['$backlog', 1, 0] } },
          tempo: { $avg: { $cond: ['$resolvido', '$tempo', null] } },
          comPrazo: { $sum: { $cond: [{ $and: ['$resolvido', '$temPrazo'] }, 1, 0] } },
          noPrazo: {
            $sum: { $cond: [{ $and: ['$resolvido', '$temPrazo', '$noPrazo'] }, 1, 0] },
          },
        },
      },
    ]),
    Chamado.aggregate([
      { $match: avaliadosNoPeriodo },
      { $group: { _id: '$avaliacao.nota', total: { $sum: 1 } } },
    ]),
    Chamado.find(e(avaliadosNoPeriodo, { 'avaliacao.comentario': { $nin: [null, ''] } }))
      .select('numero titulo avaliacao solicitante responsavel')
      .populate([
        { path: 'solicitante', select: 'nome' },
        { path: 'responsavel', select: 'nome' },
      ])
      .sort({ 'avaliacao.em': -1 })
      .limit(8)
      .lean(),
  ]);

  // série diária completa (dias sem chamados valem zero)
  const porDia = (grupos) => new Map(grupos.map((g) => [g._id, g.total]));
  const diasAbertos = porDia(serieAbertos);
  const diasResolvidos = porDia(serieResolvidos);
  const serie = Array.from({ length: periodo.dias }, (_, i) => {
    const data = somaDias(periodo.de, i);
    return { data, abertos: diasAbertos.get(data) || 0, resolvidos: diasResolvidos.get(data) || 0 };
  });

  const [nomesAgentes, nomesEquipes] = await Promise.all([
    nomesPorId(
      Usuario,
      agentes.map((a) => a._id),
    ),
    nomesPorId(
      Equipe,
      equipes.map((q) => q._id),
    ),
  ]);

  const notas = Object.fromEntries(
    [1, 2, 3, 4, 5].map((n) => [n, satisfacao.find((s) => s._id === n)?.total || 0]),
  );
  const totalAvaliacoes = Object.values(notas).reduce((a, b) => a + b, 0);
  const somaNotas = Object.entries(notas).reduce((soma, [n, qtd]) => soma + Number(n) * qtd, 0);
  const sla = slaResolvidos[0] || { total: 0, noPrazo: 0 };
  const resposta = slaResposta[0] || { noPrazo: 0, atrasadas: 0 };

  return {
    periodo: {
      de: periodo.de,
      ate: periodo.ate,
      dias: periodo.dias,
      anterior: { de: periodo.anterior.de, ate: periodo.anterior.ate },
    },
    resumo: {
      abertos,
      abertosAntes,
      resolvidos,
      resolvidosAntes,
      emAberto: backlogPorStatus.reduce((soma, g) => soma + g.total, 0),
      vencidosAgora,
      horasPrimeiraResposta: emHoras(temposResposta[0]?.media),
      horasSolucao: emHoras(temposSolucao[0]?.media),
      slaSolucao: percentual(sla.noPrazo, sla.total),
      slaPrimeiraResposta: percentual(resposta.noPrazo, resposta.noPrazo + resposta.atrasadas),
      notaMedia: totalAvaliacoes ? Math.round((somaNotas / totalAvaliacoes) * 10) / 10 : null,
    },
    serie,
    backlog: STATUS_ABERTOS.map((s) => ({
      status: s,
      nome: ROTULOS_STATUS[s],
      total: backlogPorStatus.find((g) => g._id === s)?.total || 0,
    })),
    porServico,
    porEquipe,
    porCategoria,
    porPrioridade: Object.keys(ROTULOS_PRIORIDADE)
      .reverse()
      .map((p) => ({
        id: p,
        nome: ROTULOS_PRIORIDADE[p],
        total: porPrioridade.find((g) => g._id === p)?.total || 0,
      })),
    mapaDeCalor: mapaDeCalor.map((g) => ({ dia: g._id.dia, hora: g._id.hora, total: g.total })),
    sla: {
      solucao: {
        total: sla.total,
        noPrazo: sla.noPrazo,
        percentual: percentual(sla.noPrazo, sla.total),
      },
      primeiraResposta: {
        noPrazo: resposta.noPrazo,
        atrasadas: resposta.atrasadas,
        percentual: percentual(resposta.noPrazo, resposta.noPrazo + resposta.atrasadas),
      },
      vencidosAgora,
      semanas: slaSemanal.map((s) => ({ semana: s._id, noPrazo: s.noPrazo, fora: s.fora })),
      porPrioridade: Object.keys(ROTULOS_PRIORIDADE)
        .reverse()
        .map((p) => {
          const g = slaPorPrioridade.find((x) => x._id === p);
          return {
            id: p,
            nome: ROTULOS_PRIORIDADE[p],
            total: g?.total || 0,
            noPrazo: g?.noPrazo || 0,
            percentual: g ? percentual(g.noPrazo, g.total) : null,
            horasSolucao: emHoras(g?.tempo),
            meta: configuracao.sla[p]
              ? Math.round((configuracao.sla[p].solucao / 60) * 10) / 10
              : null,
          };
        }),
    },
    agentes: agentes
      .map((a) => ({
        id: String(a._id),
        nome: nomesAgentes.get(String(a._id)) || '(removido)',
        resolvidos: a.resolvidos,
        emAberto: a.emAberto,
        horasSolucao: emHoras(a.tempo),
        sla: percentual(a.noPrazo, a.comPrazo),
        nota: a.nota === null ? null : Math.round(a.nota * 10) / 10,
        avaliacoes: a.avaliacoes,
      }))
      .sort((x, y) => y.resolvidos - x.resolvidos || y.emAberto - x.emAberto),
    equipes: equipes
      .map((q) => ({
        id: q._id ? String(q._id) : null,
        nome: q._id ? nomesEquipes.get(String(q._id)) || '(removida)' : 'Sem equipe',
        abertos: q.abertos,
        resolvidos: q.resolvidos,
        emAberto: q.emAberto,
        horasSolucao: emHoras(q.tempo),
        sla: percentual(q.noPrazo, q.comPrazo),
      }))
      .sort((x, y) => y.abertos - x.abertos),
    satisfacao: {
      total: totalAvaliacoes,
      media: totalAvaliacoes ? Math.round((somaNotas / totalAvaliacoes) * 10) / 10 : null,
      csat: percentual(notas[4] + notas[5], totalAvaliacoes),
      taxaResposta: percentual(totalAvaliacoes, resolvidos),
      notas,
      comentarios: comentarios.map((c) => ({
        numero: c.numero,
        titulo: c.titulo,
        nota: c.avaliacao.nota,
        comentario: c.avaliacao.comentario,
        em: c.avaliacao.em,
        solicitante: c.solicitante?.nome || '—',
        responsavel: c.responsavel?.nome || null,
      })),
    },
  };
};

// ---------------------------------------------------------------- relatório de chamados (lista + CSV)
const BASES = { abertos: 'createdAt', resolvidos: 'sla.resolvidoEm' };

const filtroDoRelatorio = async (query, usuario) => {
  const { expediente } = await obtemConfiguracao();
  const periodo = lePeriodo(query, expediente.fusoMinutos);
  const campo = BASES[query.base] || BASES.abertos;
  const filtros = Object.fromEntries([...FILTROS, 'status'].map((f) => [f, query[f]]));
  const base = montaFiltroDeChamados(filtros, usuario);
  return { filtro: e(base, noIntervalo(campo, periodo)), campo, periodo };
};

/**
 * Chamados do período (abertos ou resolvidos nele), paginados.
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const relatorioDeChamados = async (query, usuario) => {
  const { filtro, campo } = await filtroDoRelatorio(query, usuario);
  const porPagina = Math.min(Math.max(parseInt(query.porPagina, 10) || 25, 1), 100);
  const pagina = Math.max(parseInt(query.pagina, 10) || 1, 1);
  const [total, chamados] = await Promise.all([
    Chamado.countDocuments(filtro),
    Chamado.find(filtro)
      .select('-descricao -__v -camposAdicionais')
      .sort({ [campo]: -1, _id: -1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina)
      .populate(POPULA_CHAMADO)
      .lean(),
  ]);
  return {
    chamados,
    paginacao: {
      pagina,
      porPagina,
      total,
      totalPaginas: Math.max(Math.ceil(total / porPagina), 1),
    },
  };
};

const LIMITE_CSV = 10000;

// célula CSV (ponto e vírgula, como o Excel em português espera)
const celula = (valor) => {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/**
 * CSV com os chamados do período (até 10.000 linhas), com BOM para o Excel abrir em UTF-8.
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @returns {Promise<{ nome: string, conteudo: string }>}
 */
const csvDeChamados = async (query, usuario) => {
  const { filtro, campo, periodo } = await filtroDoRelatorio(query, usuario);
  const { expediente } = await obtemConfiguracao();
  const fuso = expediente.fusoMinutos * 60 * 1000;
  const data = (d) =>
    d ? new Date(new Date(d).getTime() + fuso).toISOString().slice(0, 16).replace('T', ' ') : '';
  const horas = (a, b) =>
    a && b
      ? (Math.round((new Date(b) - new Date(a)) / 360000) / 10).toString().replace('.', ',')
      : '';

  const chamados = await Chamado.find(filtro)
    .select('-descricao -__v -camposAdicionais')
    .sort({ [campo]: -1 })
    .limit(LIMITE_CSV)
    .populate(POPULA_CHAMADO)
    .lean();

  const cabecalho = [
    'Número',
    'Título',
    'Status',
    'Urgência',
    'Solicitante',
    'Empresa',
    'Serviço',
    'Categoria',
    'Equipe',
    'Responsável',
    'Aberto em',
    '1ª resposta em',
    'Horas até a 1ª resposta',
    'Prazo de solução',
    'Resolvido em',
    'Horas até a solução',
    'SLA de solução',
    'Nota',
    'Comentário da avaliação',
  ];
  const linhas = chamados.map((c) => {
    const s = c.sla || {};
    let situacao = '';
    if (s.prazoSolucao && s.resolvidoEm) {
      situacao = new Date(s.resolvidoEm) <= new Date(s.prazoSolucao) ? 'No prazo' : 'Fora do prazo';
    } else if (
      s.prazoSolucao &&
      new Date(s.prazoSolucao) < new Date() &&
      STATUS_COM_RELOGIO.includes(c.status)
    ) {
      situacao = 'Vencido';
    }
    return [
      c.numero,
      c.titulo,
      ROTULOS_STATUS[c.status],
      ROTULOS_PRIORIDADE[c.prioridade],
      c.solicitante?.nome,
      c.empresa?.nome,
      c.servico?.nome,
      c.categoria?.nome,
      c.equipe?.nome,
      c.responsavel?.nome,
      data(c.createdAt),
      data(s.primeiraRespostaEm),
      horas(c.createdAt, s.primeiraRespostaEm),
      data(s.prazoSolucao),
      data(s.resolvidoEm),
      horas(c.createdAt, s.resolvidoEm),
      situacao,
      c.avaliacao?.nota,
      c.avaliacao?.comentario,
    ]
      .map(celula)
      .join(';');
  });

  return {
    nome: `chamados_${query.base === 'resolvidos' ? 'resolvidos' : 'abertos'}_${periodo.de}_a_${periodo.ate}.csv`,
    conteudo: '\uFEFF' + [cabecalho.map(celula).join(';'), ...linhas].join('\r\n'),
  };
};

// ---------------------------------------------------------------- CSV dos indicadores
// número no formato do Excel em português (vírgula decimal); vazio quando não há valor
const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
const dataBr = (dataIso) => dataIso.split('-').reverse().join('/');
const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Um único CSV com todas as seções dos indicadores (mesmo período e filtros da tela).
 * Cada seção começa com uma linha de título e termina com uma linha em branco.
 * @param {Record<string, any>} query
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @returns {Promise<{ nome: string, conteudo: string }>}
 */
const csvDeIndicadores = async (query, usuario) => {
  const d = await indicadores(query, usuario);
  const r = d.resumo;
  const linhas = [];
  const secao = (titulo, cabecalho, dados) => {
    linhas.push([titulo], cabecalho, ...dados, []);
  };

  // filtros aplicados, com nomes legíveis
  const idResponsavel = query.responsavel === 'eu' ? String(usuario._id) : query.responsavel;
  const [equipes, servicos, pessoas] = await Promise.all([
    nomesPorId(Equipe, [query.equipe]),
    nomesPorId(Servico, [query.servico]),
    nomesPorId(Usuario, [idResponsavel]),
  ]);
  secao(
    'Indicadores do Help Desk',
    ['Item', 'Valor'],
    [
      ['Período', `${dataBr(d.periodo.de)} a ${dataBr(d.periodo.ate)}`],
      ['Comparado com', `${dataBr(d.periodo.anterior.de)} a ${dataBr(d.periodo.anterior.ate)}`],
      ['Equipe', query.equipe ? equipes.get(String(query.equipe)) || query.equipe : 'Todas'],
      ['Serviço', query.servico ? servicos.get(String(query.servico)) || query.servico : 'Todos'],
      ['Agente', idResponsavel ? pessoas.get(String(idResponsavel)) || idResponsavel : 'Todos'],
      [
        'Urgência',
        query.prioridade ? ROTULOS_PRIORIDADE[query.prioridade] || query.prioridade : 'Todas',
      ],
      ['Gerado em', new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
    ],
  );

  secao(
    'Resumo',
    ['Indicador', 'Período', 'Período anterior'],
    [
      ['Chamados abertos', r.abertos, r.abertosAntes],
      ['Chamados resolvidos', r.resolvidos, r.resolvidosAntes],
      ['Em aberto agora', r.emAberto, ''],
      ['Com SLA vencido agora', r.vencidosAgora, ''],
      ['Tempo médio da 1ª resposta (horas corridas)', num(r.horasPrimeiraResposta), ''],
      ['Tempo médio de solução (horas corridas)', num(r.horasSolucao), ''],
      ['SLA de solução cumprido (%)', num(r.slaSolucao), ''],
      ['1ª resposta no prazo (%)', num(r.slaPrimeiraResposta), ''],
      ['Nota média de satisfação (1 a 5)', num(r.notaMedia), ''],
    ],
  );

  secao(
    'Abertos e resolvidos por dia',
    ['Dia', 'Abertos', 'Resolvidos'],
    d.serie.map((s) => [dataBr(s.data), s.abertos, s.resolvidos]),
  );
  secao(
    'Em aberto por status (agora)',
    ['Status', 'Chamados'],
    d.backlog.map((b) => [b.nome, b.total]),
  );
  secao(
    'Abertos por urgência',
    ['Urgência', 'Chamados'],
    d.porPrioridade.map((p) => [p.nome, p.total]),
  );
  secao(
    'Abertos por serviço',
    ['Serviço', 'Chamados'],
    d.porServico.map((i) => [i.nome, i.total]),
  );
  secao(
    'Abertos por equipe',
    ['Equipe', 'Chamados'],
    d.porEquipe.map((i) => [i.nome, i.total]),
  );
  secao(
    'Abertos por categoria',
    ['Categoria', 'Chamados'],
    d.porCategoria.map((i) => [i.nome, i.total]),
  );

  // mapa de calor: segunda a domingo x 0h a 23h
  const horasDoDia = Array.from({ length: 24 }, (_v, h) => `${h}h`);
  secao(
    'Chamados abertos por dia da semana e hora',
    ['Dia', ...horasDoDia],
    [2, 3, 4, 5, 6, 7, 1].map((dia) => [
      DIAS_DA_SEMANA[dia - 1],
      ...horasDoDia.map(
        (_h, hora) => d.mapaDeCalor.find((m) => m.dia === dia && m.hora === hora)?.total || 0,
      ),
    ]),
  );

  secao(
    'Solução no prazo por semana',
    ['Semana (início)', 'No prazo', 'Fora do prazo', '% no prazo'],
    d.sla.semanas.map((s) => {
      const total = s.noPrazo + s.fora;
      return [dataBr(s.semana), s.noPrazo, s.fora, total ? num(percentual(s.noPrazo, total)) : ''];
    }),
  );
  secao(
    'SLA por urgência',
    [
      'Urgência',
      'Meta de solução (horas úteis)',
      'Resolvidos',
      'No prazo',
      '% no prazo',
      'Tempo médio (horas corridas)',
    ],
    d.sla.porPrioridade.map((p) => [
      p.nome,
      num(p.meta),
      p.total,
      p.noPrazo,
      num(p.percentual),
      num(p.horasSolucao),
    ]),
  );

  secao(
    'Desempenho por equipe',
    [
      'Equipe',
      'Abertos',
      'Resolvidos',
      'Em aberto agora',
      'Tempo médio de solução (horas)',
      'SLA cumprido (%)',
    ],
    d.equipes.map((q) => [
      q.nome,
      q.abertos,
      q.resolvidos,
      q.emAberto,
      num(q.horasSolucao),
      num(q.sla),
    ]),
  );
  secao(
    'Desempenho por agente',
    [
      'Agente',
      'Resolvidos',
      'Em aberto agora',
      'Tempo médio de solução (horas)',
      'SLA cumprido (%)',
      'Nota média',
      'Avaliações',
    ],
    d.agentes.map((a) => [
      a.nome,
      a.resolvidos,
      a.emAberto,
      num(a.horasSolucao),
      num(a.sla),
      num(a.nota),
      a.avaliacoes,
    ]),
  );

  const s = d.satisfacao;
  secao(
    'Satisfação',
    ['Indicador', 'Valor'],
    [
      ['Avaliações recebidas', s.total],
      ['Nota média (1 a 5)', num(s.media)],
      ['Clientes satisfeitos - CSAT, notas 4 e 5 (%)', num(s.csat)],
      ['Taxa de resposta (%)', num(s.taxaResposta)],
      ...[5, 4, 3, 2, 1].map((n) => [`Notas ${n}`, s.notas[n]]),
    ],
  );
  secao(
    'Comentários recentes',
    ['Chamado', 'Título', 'Nota', 'Comentário', 'Cliente', 'Responsável', 'Data'],
    s.comentarios.map((c) => [
      c.numero,
      c.titulo,
      c.nota,
      c.comentario,
      c.solicitante,
      c.responsavel || '',
      new Date(c.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    ]),
  );

  return {
    nome: `indicadores_${d.periodo.de}_a_${d.periodo.ate}.csv`,
    conteudo: '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n'),
  };
};

module.exports = { indicadores, relatorioDeChamados, csvDeChamados, csvDeIndicadores, lePeriodo };
