const createError = require('http-errors');

const { Chamado, CampoAdicional } = require('../models');
const { filtroDeVisibilidade, permissoesDoChamado, ehEquipe } = require('./permissoes');
const { obtemConfiguracao } = require('./configuracao');
const { nomesDasPessoasDosCampos } = require('./campos-adicionais');

// campos populados em listagens e no detalhe
const POPULA_CHAMADO = [
  { path: 'solicitante', select: 'nome email whatsapp' },
  { path: 'responsavel', select: 'nome email' },
  { path: 'categoria', select: 'nome' },
  { path: 'servico', select: 'nome cor' },
  { path: 'equipe', select: 'nome' },
  { path: 'empresa', select: 'nome' },
  { path: 'tags', select: 'nome cor' },
  { path: 'justificativa', select: 'nome' },
];

/**
 * Converte "#1024", "1024" ou 1024 em número; retorna null se inválido.
 * @param {any} valor
 */
const leNumeroDoChamado = (valor) => {
  const numero = Number(
    String(valor ?? '')
      .replace(/^#/, '')
      .trim(),
  );
  return Number.isInteger(numero) && numero > 0 ? numero : null;
};

/**
 * Busca o chamado pelo número respeitando o RBAC.
 * Sem acesso ao chamado responde 404 (não revela que o chamado existe).
 * @param {any} numeroInformado
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const buscaChamadoAcessivel = async (numeroInformado, usuario) => {
  const numero = leNumeroDoChamado(numeroInformado);
  const naoEncontrado = createError(404, 'Chamado não encontrado');
  if (!numero) throw naoEncontrado;

  // RBAC: cliente só os próprios; agente só os das suas equipes (ou sob sua responsabilidade)
  const filtro = { numero, ...filtroDeVisibilidade(usuario) };

  const chamado = await Chamado.findOne(filtro).lean();
  if (!chamado) throw naoEncontrado;
  return chamado;
};

/**
 * Valores de campos adicionais que o usuário pode ver: a equipe vê todos;
 * o cliente, só os campos marcados como visíveis para o cliente.
 * @param {Record<string, any> | undefined} valores
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const camposQueOUsuarioVe = async (valores, usuario) => {
  if (!valores) return {};
  if (ehEquipe(usuario)) return valores;
  const visiveis = await CampoAdicional.find({ visivelParaCliente: true }).distinct('_id');
  const ids = new Set(visiveis.map(String));
  return Object.fromEntries(Object.entries(valores).filter(([id]) => ids.has(id)));
};

/**
 * Detalhe completo do chamado (com nomes populados e permissões do usuário).
 * @param {any} chamadoId
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const detalhaChamado = async (chamadoId, usuario) => {
  const [chamado, configuracao] = await Promise.all([
    Chamado.findById(chamadoId).populate(POPULA_CHAMADO).lean(),
    obtemConfiguracao(),
  ]);
  if (!chamado) throw createError(404, 'Chamado não encontrado');
  delete chamado.__v;
  const camposAdicionais = await camposQueOUsuarioVe(chamado.camposAdicionais, usuario);
  return {
    ...chamado,
    camposAdicionais,
    // nomes das pessoas escolhidas em campos do tipo "Lista de pessoas"
    pessoasDosCampos: await nomesDasPessoasDosCampos(camposAdicionais),
    permissoes: permissoesDoChamado(chamado, usuario, { pesquisa: configuracao.pesquisa }),
    // pergunta da pesquisa de satisfação, para a tela do cliente
    ...(configuracao.pesquisa.ativa && { perguntaPesquisa: configuracao.pesquisa.pergunta }),
  };
};

module.exports = { POPULA_CHAMADO, leNumeroDoChamado, buscaChamadoAcessivel, detalhaChamado };
