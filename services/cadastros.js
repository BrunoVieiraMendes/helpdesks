// Cadastros simples do painel de configurações (empresas, tags, justificativas,
// feriados, macros, perfis de acesso, cargos e classificações). Todos seguem a mesma regra dos demais cadastros:
// listar (ativos ou todos), criar, editar, ativar/desativar e remover apenas o
// que não está em uso (o que tem histórico só pode ser desativado).
const createError = require('http-errors');

const {
  Empresa,
  Tag,
  Justificativa,
  Feriado,
  Macro,
  Usuario,
  Chamado,
  Perfil,
  Cargo,
  Classificacao,
  CampoAdicional,
  RegraExibicao,
  Servico,
  Categoria,
  Aviso,
} = require('../models');
const {
  ROTULOS_STATUS,
  ROTULOS_PRIORIDADE,
  STATUS,
  TIPOS_DE_PERFIL,
  TIPOS_DE_CAMPO,
  ALVOS_DE_CAMPO,
  PUBLICOS_DE_AVISO,
} = require('../constants');
const { normalizaPermissoes } = require('./perfis');
const { erroDeValidacao, listaDaQuery, dataIsoValida } = require('../utils');
const {
  idValido,
  vazio,
  validaEquipe,
  validaTags,
  validaJustificativa,
  justificativasDoStatus,
} = require('./valida-referencias');

/**
 * @param {{
 *   Model: import('mongoose').Model<any>,
 *   rotulo: string,
 *   feminino?: boolean,
 *   campos: string[],
 *   campoAtivo?: string,
 *   ordenacao?: Record<string, 1|-1>,
 *   popula?: any,
 *   preparar?: (valores: Record<string, any>, atual: any) => Promise<void> | void,
 *   emUso?: (doc: any) => Promise<string|null>,
 *   enriquece?: (itens: any[]) => Promise<any[]>,
 *   aposSalvar?: (doc: any) => Promise<void>,
 * }} cfg
 */
const criaCadastro = ({
  Model,
  rotulo,
  feminino = false,
  campos,
  campoAtivo = 'ativo',
  ordenacao = { nome: 1 },
  popula,
  preparar,
  emUso,
  enriquece,
  aposSalvar,
}) => {
  const artigo = feminino ? 'a' : 'o';
  const naoEncontrado = () => createError(404, `${rotulo} não encontrad${artigo}`);

  const busca = async (id) => {
    if (!idValido(id)) throw naoEncontrado();
    const doc = await Model.findById(id);
    if (!doc) throw naoEncontrado();
    return doc;
  };

  const consulta = (q) => (popula ? q.populate(popula) : q).select('-__v').lean();
  const serializa = (id) => consulta(Model.findById(id));

  // só os campos permitidos e enviados; o de ativo vira booleano
  const valoresDe = async (dados, atual) => {
    const valores = {};
    for (const campo of campos) {
      if (dados[campo] !== undefined) valores[campo] = dados[campo];
    }
    if (valores[campoAtivo] !== undefined) valores[campoAtivo] = Boolean(valores[campoAtivo]);
    if (preparar) await preparar(valores, atual);
    return valores;
  };

  return {
    /** @param {{ todos?: boolean }} [opcoes] */
    lista: async ({ todos = false } = {}) => {
      const itens = await consulta(Model.find(todos ? {} : { [campoAtivo]: true }).sort(ordenacao));
      return enriquece ? enriquece(itens) : itens;
    },
    /** @param {Record<string, any>} dados */
    cria: async (dados) => {
      const doc = await Model.create(await valoresDe(dados, null));
      if (aposSalvar) await aposSalvar(doc);
      return serializa(doc._id);
    },
    /**
     * @param {string} id
     * @param {Record<string, any>} dados
     */
    atualiza: async (id, dados) => {
      const doc = await busca(id);
      doc.set(await valoresDe(dados, doc));
      await doc.save();
      if (aposSalvar) await aposSalvar(doc);
      return serializa(doc._id);
    },
    /** @param {string} id */
    remove: async (id) => {
      const doc = await busca(id);
      const motivo = emUso ? await emUso(doc) : null;
      if (motivo) {
        throw createError(
          409,
          `${rotulo} "${doc.nome}" ${motivo}. Desabilite-${artigo} em vez de remover.`,
        );
      }
      await doc.deleteOne();
    },
  };
};

const quantos = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
const juntaUsos = (usos) => {
  const lista = usos.filter(Boolean);
  return lista.length ? `está em uso por ${lista.join(' e ')}` : null;
};

// ---------------------------------------------------------------- empresas
const empresas = criaCadastro({
  Model: Empresa,
  rotulo: 'Empresa',
  feminino: true,
  campos: ['nome', 'cnpj', 'telefone', 'observacoes', 'ativa'],
  campoAtivo: 'ativa',
  emUso: async (empresa) => {
    const [clientes, chamados] = await Promise.all([
      Usuario.countDocuments({ empresa: empresa._id }),
      Chamado.countDocuments({ empresa: empresa._id }),
    ]);
    return juntaUsos([
      clientes && quantos(clientes, 'cliente', 'clientes'),
      chamados && quantos(chamados, 'chamado', 'chamados'),
    ]);
  },
  // total de clientes de cada empresa (coluna da tela de administração)
  enriquece: async (itens) => {
    const totais = await Usuario.aggregate([
      { $match: { empresa: { $in: itens.map((e) => e._id) } } },
      { $group: { _id: '$empresa', total: { $sum: 1 } } },
    ]);
    const porId = new Map(totais.map((t) => [String(t._id), t.total]));
    return itens.map((e) => ({ ...e, totalClientes: porId.get(String(e._id)) || 0 }));
  },
});

// ---------------------------------------------------------------- tags
const tags = criaCadastro({
  Model: Tag,
  rotulo: 'Tag',
  feminino: true,
  campos: ['nome', 'cor', 'ativa'],
  campoAtivo: 'ativa',
  emUso: async (tag) => {
    const [chamados, macros] = await Promise.all([
      Chamado.countDocuments({ tags: tag._id }),
      Macro.countDocuments({ 'acoes.adicionarTags': tag._id }),
    ]);
    return juntaUsos([
      chamados && quantos(chamados, 'chamado', 'chamados'),
      macros && quantos(macros, 'macro', 'macros'),
    ]);
  },
});

// ---------------------------------------------------------------- justificativas
const justificativas = criaCadastro({
  Model: Justificativa,
  rotulo: 'Justificativa',
  feminino: true,
  campos: ['nome', 'status', 'ativa'],
  campoAtivo: 'ativa',
  preparar: (valores) => {
    if (valores.status === undefined) return;
    valores.status = [...new Set(listaDaQuery(valores.status))];
    const invalidos = valores.status.filter((s) => !ROTULOS_STATUS[s] || s === STATUS.NOVO);
    if (invalidos.length)
      throw erroDeValidacao({ status: `Status inválido: ${invalidos.join(', ')}` });
  },
  emUso: async (justificativa) => {
    const [chamados, macros] = await Promise.all([
      Chamado.countDocuments({ justificativa: justificativa._id }),
      Macro.countDocuments({ 'acoes.justificativa': justificativa._id }),
    ]);
    return juntaUsos([
      chamados && quantos(chamados, 'chamado', 'chamados'),
      macros && quantos(macros, 'macro', 'macros'),
    ]);
  },
});

// ---------------------------------------------------------------- feriados
const feriados = criaCadastro({
  Model: Feriado,
  rotulo: 'Feriado',
  campos: ['nome', 'data', 'recorrente', 'ativo'],
  ordenacao: { data: 1 },
  preparar: (valores) => {
    if (valores.recorrente !== undefined) valores.recorrente = Boolean(valores.recorrente);
    if (valores.data !== undefined && !dataIsoValida(valores.data)) {
      throw erroDeValidacao({ data: 'Data inválida' });
    }
  },
});

// ---------------------------------------------------------------- macros
const nulo = (v) => (vazio(v) ? null : v);

const macros = criaCadastro({
  Model: Macro,
  rotulo: 'Macro',
  feminino: true,
  campos: ['nome', 'mensagem', 'tipo', 'acoes', 'ativa'],
  campoAtivo: 'ativa',
  popula: [
    { path: 'acoes.equipe', select: 'nome' },
    { path: 'acoes.justificativa', select: 'nome' },
    { path: 'acoes.adicionarTags', select: 'nome cor' },
  ],
  preparar: async (valores, atual) => {
    if (valores.acoes === undefined) return;
    const a = valores.acoes || {};
    const acoes = {
      status: nulo(a.status),
      prioridade: nulo(a.prioridade),
      equipe: null,
      justificativa: null,
      atribuirAMim: Boolean(a.atribuirAMim),
      adicionarTags: [],
    };

    if (acoes.status && (!ROTULOS_STATUS[acoes.status] || acoes.status === STATUS.FECHADO)) {
      throw erroDeValidacao({ 'acoes.status': 'Status inválido para uma macro' });
    }
    if (acoes.status === STATUS.NOVO) {
      throw erroDeValidacao({ 'acoes.status': 'Um chamado não volta para Novo' });
    }
    if (acoes.prioridade && !ROTULOS_PRIORIDADE[acoes.prioridade]) {
      throw erroDeValidacao({ 'acoes.prioridade': 'Prioridade inválida' });
    }
    if (!vazio(a.equipe)) acoes.equipe = (await validaEquipe(a.equipe, 'acoes.equipe'))._id;
    if (!vazio(a.justificativa)) {
      if (!acoes.status) {
        throw erroDeValidacao({ 'acoes.justificativa': 'Escolha o status da justificativa' });
      }
      acoes.justificativa = (await validaJustificativa(a.justificativa, acoes.status))._id;
    } else if (acoes.status && (await justificativasDoStatus(acoes.status)).length) {
      // a mesma regra da barra lateral: esse status exige justificativa
      throw erroDeValidacao({
        'acoes.justificativa': `O status ${ROTULOS_STATUS[acoes.status]} exige uma justificativa`,
      });
    }
    acoes.adicionarTags = await validaTags(a.adicionarTags, atual?.acoes?.adicionarTags);
    valores.acoes = acoes;
  },
});

// ---------------------------------------------------------------- pessoas: perfis, cargos, classificações
// quantas pessoas usam o cadastro (coluna da tela e trava de remoção)
const usoPorPessoas = (campo) => ({
  emUso: async (doc) => {
    const pessoas = await Usuario.countDocuments({ [campo]: doc._id });
    return pessoas ? `está em uso por ${quantos(pessoas, 'pessoa', 'pessoas')}` : null;
  },
  enriquece: async (itens) => {
    const totais = await Usuario.aggregate([
      { $match: { [campo]: { $in: itens.map((i) => i._id) } } },
      { $group: { _id: `${campo}`, total: { $sum: 1 } } },
    ]);
    const porId = new Map(totais.map((t) => [String(t._id), t.total]));
    return itens.map((i) => ({ ...i, totalPessoas: porId.get(String(i._id)) || 0 }));
  },
});

const perfis = criaCadastro({
  Model: Perfil,
  rotulo: 'Perfil',
  campos: ['nome', 'tipo', 'padrao', 'permissoes', 'ativo'],
  ordenacao: { tipo: 1, nome: 1 },
  preparar: async (valores, atual) => {
    const tipo = valores.tipo ?? atual?.tipo;
    if (!TIPOS_DE_PERFIL.includes(tipo)) {
      throw erroDeValidacao({ tipo: 'Informe se o perfil é de agente ou de cliente' });
    }
    // trocar o tipo deixaria as pessoas do perfil com permissões de outro tipo
    if (atual && valores.tipo !== undefined && valores.tipo !== atual.tipo) {
      const pessoas = await Usuario.countDocuments({ perfil: atual._id });
      if (pessoas) {
        throw erroDeValidacao({
          tipo: `O perfil é usado por ${quantos(pessoas, 'pessoa', 'pessoas')}; não é possível mudar o tipo`,
        });
      }
    }
    if (valores.padrao !== undefined) valores.padrao = Boolean(valores.padrao);
    if (valores.permissoes !== undefined || valores.tipo !== undefined) {
      valores.permissoes = normalizaPermissoes(tipo, valores.permissoes ?? atual?.permissoes);
    }
  },
  // só um perfil padrão por tipo
  aposSalvar: async (perfil) => {
    if (!perfil.padrao) return;
    await Perfil.updateMany(
      { _id: { $ne: perfil._id }, tipo: perfil.tipo, padrao: true },
      { $set: { padrao: false } },
    );
  },
  ...usoPorPessoas('perfil'),
});

const cargos = criaCadastro({
  Model: Cargo,
  rotulo: 'Cargo',
  campos: ['nome', 'ativo'],
  ...usoPorPessoas('cargo'),
});

const classificacoes = criaCadastro({
  Model: Classificacao,
  rotulo: 'Classificação',
  feminino: true,
  campos: ['nome', 'ativa'],
  campoAtivo: 'ativa',
  ...usoPorPessoas('classificacao'),
});

// ---------------------------------------------------------------- campos adicionais e regras para exibição
// opções da lista: array ou texto com uma opção por linha
const leOpcoes = (valor) =>
  [
    ...new Set(
      (Array.isArray(valor) ? valor : String(valor ?? '').split(/\r?\n/))
        .map((o) => String(o).trim())
        .filter(Boolean),
    ),
  ].slice(0, 200);

const camposAdicionais = criaCadastro({
  Model: CampoAdicional,
  rotulo: 'Campo',
  campos: [
    'nome',
    'tipo',
    'alvo',
    'opcoes',
    'pessoasDe',
    'obrigatorio',
    'visivelParaCliente',
    'ajuda',
    'ordem',
    'ativo',
  ],
  ordenacao: { ordem: 1, nome: 1 },
  preparar: async (valores, atual) => {
    const tipo = valores.tipo ?? atual?.tipo;
    if (!TIPOS_DE_CAMPO[tipo]) throw erroDeValidacao({ tipo: 'Escolha o tipo do campo' });
    if (valores.alvo !== undefined && !ALVOS_DE_CAMPO[valores.alvo]) {
      throw erroDeValidacao({ alvo: 'Destino do campo inválido' });
    }
    // trocar o tipo invalidaria os valores já preenchidos nos chamados
    if (atual && valores.tipo !== undefined && valores.tipo !== atual.tipo) {
      const usados = await Chamado.countDocuments({
        [`camposAdicionais.${atual._id}`]: { $exists: true },
      });
      if (usados) {
        throw erroDeValidacao({
          tipo: `O campo já foi preenchido em ${quantos(usados, 'chamado', 'chamados')}; não é possível mudar o tipo`,
        });
      }
    }
    for (const campo of ['obrigatorio', 'visivelParaCliente']) {
      if (valores[campo] !== undefined) valores[campo] = Boolean(valores[campo]);
    }
    if (valores.ordem !== undefined) valores.ordem = Number(valores.ordem) || 0;

    // opções só para listas; "pessoas de" só para listas de pessoas
    if (tipo === 'lista') {
      if (valores.opcoes !== undefined || !atual) valores.opcoes = leOpcoes(valores.opcoes);
      const opcoes = valores.opcoes ?? atual?.opcoes ?? [];
      if (!opcoes.length) throw erroDeValidacao({ opcoes: 'Informe pelo menos uma opção' });
    } else {
      valores.opcoes = [];
    }
    valores.pessoasDe =
      tipo === 'pessoa'
        ? listaDaQuery(valores.pessoasDe ?? atual?.pessoasDe).filter((t) =>
            TIPOS_DE_PERFIL.includes(t),
          )
        : [];
  },
  emUso: async (campo) => {
    const [chamados, regras] = await Promise.all([
      Chamado.countDocuments({ [`camposAdicionais.${campo._id}`]: { $exists: true } }),
      RegraExibicao.countDocuments({
        $or: [{ campos: campo._id }, { 'condicaoCampo.campo': campo._id }],
      }),
    ]);
    return juntaUsos([
      chamados && quantos(chamados, 'chamado', 'chamados'),
      regras && quantos(regras, 'regra para exibição', 'regras para exibição'),
    ]);
  },
});

// ids existentes do model (erro no campo se algum não existir)
const idsExistentes = async (Model, valor, campo) => {
  const ids = [...new Set(listaDaQuery(valor))];
  if (ids.some((id) => !idValido(id))) throw erroDeValidacao({ [campo]: 'Valor inválido' });
  const encontrados = await Model.countDocuments({ _id: { $in: ids } });
  if (encontrados !== ids.length) throw erroDeValidacao({ [campo]: 'Registro não encontrado' });
  return ids;
};

const regrasExibicao = criaCadastro({
  Model: RegraExibicao,
  rotulo: 'Regra',
  feminino: true,
  campos: [
    'nome',
    'alvo',
    'servicos',
    'categorias',
    'condicaoCampo',
    'campos',
    'tornarObrigatorios',
    'ativo',
  ],
  preparar: async (valores, atual) => {
    if (valores.alvo !== undefined && !ALVOS_DE_CAMPO[valores.alvo]) {
      throw erroDeValidacao({ alvo: 'Destino da regra inválido' });
    }
    if (valores.servicos !== undefined) {
      valores.servicos = await idsExistentes(Servico, valores.servicos, 'servicos');
    }
    if (valores.categorias !== undefined) {
      valores.categorias = await idsExistentes(Categoria, valores.categorias, 'categorias');
    }
    if (valores.campos !== undefined || !atual) {
      valores.campos = await idsExistentes(CampoAdicional, valores.campos, 'campos');
      if (!valores.campos.length) {
        throw erroDeValidacao({ campos: 'Escolha pelo menos um campo para exibir' });
      }
    }
    if (valores.tornarObrigatorios !== undefined) {
      valores.tornarObrigatorios = Boolean(valores.tornarObrigatorios);
    }

    // condição por campo: só listas de valores, com opções que existem no campo
    if (valores.condicaoCampo !== undefined) {
      const cond = valores.condicaoCampo;
      if (!cond || vazio(cond.campo)) {
        valores.condicaoCampo = null;
      } else {
        const campo = idValido(cond.campo)
          ? await CampoAdicional.findById(cond.campo).select('tipo opcoes').lean()
          : null;
        if (!campo || campo.tipo !== 'lista') {
          throw erroDeValidacao({
            'condicaoCampo.campo': 'Escolha um campo do tipo lista de valores',
          });
        }
        const escolhidos = leOpcoes(cond.valores).filter((v) => campo.opcoes.includes(v));
        if (!escolhidos.length) {
          throw erroDeValidacao({
            'condicaoCampo.valores': 'Escolha pelo menos um valor do campo',
          });
        }
        valores.condicaoCampo = { campo: campo._id, valores: escolhidos };
      }
    }
    const campos = (valores.campos ?? atual?.campos ?? []).map(String);
    const condicao =
      valores.condicaoCampo !== undefined ? valores.condicaoCampo : atual?.condicaoCampo;
    if (condicao?.campo && campos.includes(String(condicao.campo))) {
      throw erroDeValidacao({
        campos: 'O campo usado na condição não pode ser exibido pela própria regra',
      });
    }
  },
});

// ---------------------------------------------------------------- mural de avisos
const avisos = criaCadastro({
  Model: Aviso,
  rotulo: 'Aviso',
  campos: ['nome', 'mensagem', 'publico', 'validoAte', 'ativo'],
  ordenacao: { createdAt: -1 },
  preparar: (valores) => {
    if (valores.publico !== undefined && !PUBLICOS_DE_AVISO[valores.publico]) {
      throw erroDeValidacao({ publico: 'Escolha para quem é o aviso' });
    }
    if (valores.validoAte !== undefined) {
      valores.validoAte = vazio(valores.validoAte) ? null : String(valores.validoAte);
      if (valores.validoAte && !dataIsoValida(valores.validoAte)) {
        throw erroDeValidacao({ validoAte: 'Data inválida' });
      }
    }
  },
});

module.exports = {
  avisos,
  camposAdicionais,
  regrasExibicao,
  criaCadastro,
  empresas,
  tags,
  justificativas,
  feriados,
  macros,
  perfis,
  cargos,
  classificacoes,
};
