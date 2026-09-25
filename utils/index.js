const { normalizaErro, erroDeValidacao } = require('./erros');
const { lePaginacao, metaPaginacao } = require('./paginacao');

// aceita string separada por vírgula (?status=novo,pendente) ou array (?status=novo&status=pendente)
const listaDaQuery = (valor) => {
  if (valor === undefined || valor === null || valor === '') return [];
  const itens = Array.isArray(valor) ? valor : String(valor).split(',');
  return itens.map((v) => String(v).trim()).filter(Boolean);
};

// data AAAA-MM-DD que existe no calendário (o Date "corrige" 30/02 para 02/03)
const dataIsoValida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto))) return false;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto;
};

// evita que texto de busca vire expressão regular maliciosa
const escapaRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  logger: require('./logger'),
  rota: require('./rota'),
  normalizaErro,
  erroDeValidacao,
  lePaginacao,
  metaPaginacao,
  listaDaQuery,
  escapaRegex,
  dataIsoValida,
  ...require('./cifra'),
};
