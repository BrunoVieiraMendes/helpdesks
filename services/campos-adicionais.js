// Campos adicionais do chamado: quais aparecem (regras para exibição), validação
// dos valores e registro das alterações na timeline.
// A mesma regra de exibição roda no navegador (public/js/campos.js) para montar a tela;
// a API valida de novo aqui.
const mongoose = require('mongoose');

const { CampoAdicional, RegraExibicao, Usuario, Interacao } = require('../models');
const { PAPEIS, TIPOS_INTERACAO } = require('../constants');
const { erroDeValidacao, dataIsoValida } = require('../utils');
const { ehEquipe } = require('./permissoes');

const LIMITES_DE_TEXTO = { texto: 500, textoLongo: 5000 };
const vazio = (v) => v === null || v === undefined || v === '';
const mesmoId = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * Campos e regras ativos do chamado.
 * @returns {Promise<{ campos: any[], regras: any[] }>}
 */
const carregaDefinicoes = async () => {
  const [campos, regras] = await Promise.all([
    CampoAdicional.find({ alvo: 'chamado', ativo: true }).sort({ ordem: 1, nome: 1 }).lean(),
    RegraExibicao.find({ alvo: 'chamado', ativo: true }).lean(),
  ]);
  return { campos, regras };
};

/**
 * A regra casa com o chamado? Condições vazias valem para qualquer valor.
 * @param {any} regra
 * @param {{ servico?: any, categoria?: any, valores?: Record<string, any> }} contexto
 */
const regraCasa = (regra, { servico, categoria, valores = {} }) => {
  if (regra.servicos?.length && !regra.servicos.some((id) => mesmoId(id, servico))) return false;
  if (regra.categorias?.length && !regra.categorias.some((id) => mesmoId(id, categoria))) {
    return false;
  }
  const cond = regra.condicaoCampo;
  if (cond?.campo) {
    const valor = valores[String(cond.campo)];
    if (vazio(valor) || !(cond.valores || []).includes(String(valor))) return false;
  }
  return true;
};

/**
 * Campos que aparecem para o chamado, com a obrigatoriedade final.
 * - campo que nenhuma regra ativa cita: sempre aparece;
 * - campo citado por regras: só aparece se alguma delas casar (e pode ficar obrigatório por ela);
 * - cliente só vê campos marcados como visíveis para o cliente.
 * @param {{ campos: any[], regras: any[] }} definicoes
 * @param {{ servico?: any, categoria?: any, valores?: Record<string, any> }} contexto
 * @param {{ paraCliente?: boolean }} [opcoes]
 * @returns {{ campo: any, obrigatorio: boolean }[]}
 */
const camposVisiveis = ({ campos, regras }, contexto, { paraCliente = false } = {}) => {
  const citados = new Set(regras.flatMap((r) => r.campos.map(String)));
  return campos
    .filter((campo) => !paraCliente || campo.visivelParaCliente)
    .map((campo) => {
      const id = String(campo._id);
      if (!citados.has(id)) return { campo, obrigatorio: campo.obrigatorio };
      const casadas = regras.filter(
        (r) => r.campos.some((c) => mesmoId(c, id)) && regraCasa(r, contexto),
      );
      if (!casadas.length) return null;
      return { campo, obrigatorio: campo.obrigatorio || casadas.some((r) => r.tornarObrigatorios) };
    })
    .filter(Boolean);
};

/**
 * Converte o valor digitado para o formato guardado. null = vazio.
 * @returns {Promise<any>}  lança erro de validação com a mensagem do campo
 */
const normalizaValor = async (campo, valor) => {
  if (vazio(valor)) return null;
  const erro = (mensagem) => {
    throw erroDeValidacao({ [`camposAdicionais.${campo._id}`]: mensagem });
  };

  switch (campo.tipo) {
    case 'texto':
    case 'textoLongo': {
      const texto = String(valor).trim();
      if (texto.length > LIMITES_DE_TEXTO[campo.tipo]) {
        erro(`Máximo de ${LIMITES_DE_TEXTO[campo.tipo]} caracteres`);
      }
      return texto || null;
    }
    case 'numero': {
      const numero = Number(String(valor).replace(',', '.'));
      if (!Number.isFinite(numero)) erro('Informe um número');
      return numero;
    }
    case 'data':
      if (!dataIsoValida(String(valor))) erro('Data inválida');
      return String(valor);
    case 'simNao':
      if (![true, false, 'true', 'false', 'sim', 'nao'].includes(valor)) erro('Escolha Sim ou Não');
      return valor === true || valor === 'true' || valor === 'sim';
    case 'lista':
      if (!(campo.opcoes || []).includes(String(valor))) erro('Escolha uma das opções da lista');
      return String(valor);
    case 'pessoa': {
      if (!mongoose.isValidObjectId(valor)) erro('Pessoa inválida');
      const papeis = campo.pessoasDe?.length
        ? campo.pessoasDe.flatMap((t) => (t === 'agente' ? [PAPEIS.AGENTE, PAPEIS.ADMIN] : [t]))
        : Object.values(PAPEIS);
      const existe = await Usuario.exists({ _id: valor, ativo: true, papel: { $in: papeis } });
      if (!existe) erro('Pessoa não encontrada ou não pode ser escolhida neste campo');
      return String(valor);
    }
    default:
      return erro('Tipo de campo desconhecido');
  }
};

/**
 * Valida os campos adicionais enviados.
 * - Só aceita campos visíveis para o chamado (e para o público de quem envia); os demais são ignorados.
 * - exigeObrigatorios: na abertura, todo campo obrigatório visível precisa de valor.
 *   Na edição, só impede apagar o valor de um obrigatório.
 * Todos os erros voltam juntos, por campo (camposAdicionais.<id>).
 * @param {Record<string, any> | undefined} entrada
 * @param {{ servico?: any, categoria?: any, atuais?: Record<string, any> }} contexto
 * @param {import('./permissoes').UsuarioLogado} usuario
 * @param {{ exigeObrigatorios?: boolean }} [opcoes]
 * @returns {Promise<Record<string, any>>} _id do campo -> valor normalizado (null = apagar)
 */
const validaCamposAdicionais = async (
  entrada,
  contexto,
  usuario,
  { exigeObrigatorios = false } = {},
) => {
  const recebidos = entrada && typeof entrada === 'object' ? entrada : {};
  const definicoes = await carregaDefinicoes();
  const valores = { ...(contexto.atuais || {}), ...recebidos };
  const visiveis = camposVisiveis(
    definicoes,
    { servico: contexto.servico, categoria: contexto.categoria, valores },
    { paraCliente: !ehEquipe(usuario) },
  );

  const erros = {};
  const resultado = {};
  for (const { campo, obrigatorio } of visiveis) {
    const id = String(campo._id);
    const enviado = id in recebidos;
    if (!enviado && !exigeObrigatorios) continue;
    try {
      const valor = enviado ? await normalizaValor(campo, recebidos[id]) : null;
      if (obrigatorio && valor === null && (enviado || vazio(contexto.atuais?.[id]))) {
        erros[`camposAdicionais.${id}`] = `${campo.nome} é obrigatório`;
        continue;
      }
      if (enviado) resultado[id] = valor;
    } catch (e) {
      if (!e.detalhes) throw e;
      Object.assign(erros, e.detalhes);
    }
  }

  if (Object.keys(erros).length) throw erroDeValidacao(erros);
  return resultado;
};

/**
 * Texto legível de um valor para a timeline.
 * @param {any} campo
 * @param {any} valor
 * @param {Map<string, string>} nomes  nomes das pessoas
 */
const textoDoValor = (campo, valor, nomes) => {
  if (vazio(valor)) return '—';
  if (campo.tipo === 'simNao') return valor ? 'Sim' : 'Não';
  if (campo.tipo === 'data') return String(valor).split('-').reverse().join('/');
  if (campo.tipo === 'pessoa') return nomes.get(String(valor)) || '—';
  const texto = String(valor);
  return texto.length > 80 ? `${texto.slice(0, 77)}...` : texto;
};

/**
 * Grava na timeline um evento por campo adicional alterado (visível só para a equipe).
 * @param {any} chamadoId
 * @param {{ campo: string, de: any, para: any }[]} mudancas  campo = _id do campo adicional
 * @param {{ _id: any, nome: string }} autor
 */
const registraCamposAlterados = async (chamadoId, mudancas, autor) => {
  if (!mudancas.length) return;
  const campos = await CampoAdicional.find({ _id: { $in: mudancas.map((m) => m.campo) } })
    .select('nome tipo')
    .lean();
  const porId = new Map(campos.map((c) => [String(c._id), c]));
  const pessoas = mudancas
    .filter((m) => porId.get(m.campo)?.tipo === 'pessoa')
    .flatMap((m) => [m.de, m.para])
    .filter((v) => !vazio(v));
  const nomes = new Map(
    (
      await Usuario.find({ _id: { $in: pessoas } })
        .select('nome')
        .lean()
    ).map((u) => [String(u._id), u.nome]),
  );

  await Interacao.insertMany(
    mudancas
      .filter((m) => porId.has(m.campo))
      .map(({ campo, de, para }) => {
        const def = porId.get(campo);
        return {
          chamado: chamadoId,
          autor: autor._id,
          tipo: TIPOS_INTERACAO.SISTEMA,
          mensagem: `${autor.nome} alterou ${def.nome}: ${textoDoValor(def, de, nomes)} → ${textoDoValor(def, para, nomes)}`,
          evento: {
            campo: 'campoAdicional',
            de: vazio(de) ? null : String(de),
            para: vazio(para) ? null : String(para),
          },
        };
      }),
  );
};

/**
 * Nomes das pessoas escolhidas em campos do tipo pessoa (para a tela do chamado).
 * @param {Record<string, any> | undefined} valores
 * @returns {Promise<Record<string, string>>}
 */
const nomesDasPessoasDosCampos = async (valores) => {
  const ids = Object.values(valores || {}).filter((v) => mongoose.isValidObjectId(v));
  if (!ids.length) return {};
  const pessoas = await Usuario.find({ _id: { $in: ids } })
    .select('nome')
    .lean();
  return Object.fromEntries(pessoas.map((p) => [String(p._id), p.nome]));
};

module.exports = {
  carregaDefinicoes,
  regraCasa,
  camposVisiveis,
  normalizaValor,
  validaCamposAdicionais,
  registraCamposAlterados,
  nomesDasPessoasDosCampos,
};
