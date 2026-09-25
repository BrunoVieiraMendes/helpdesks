const { PAGINACAO } = require('../constants');

/**
 * Lê ?pagina e ?porPagina da query com limites seguros.
 * @param {{ pagina?: any, porPagina?: any }} query
 * @returns {{ pagina: number, porPagina: number, pular: number }}
 */
const lePaginacao = ({ pagina, porPagina } = {}) => {
  const p = Math.max(parseInt(pagina, 10) || 1, 1);
  const pp = Math.min(Math.max(parseInt(porPagina, 10) || PAGINACAO.PADRAO, 1), PAGINACAO.MAXIMO);
  return { pagina: p, porPagina: pp, pular: (p - 1) * pp };
};

/**
 * Monta o bloco de metadados de paginação devolvido pela API.
 * @param {number} total
 * @param {{ pagina: number, porPagina: number }} paginacao
 */
const metaPaginacao = (total, { pagina, porPagina }) => ({
  pagina,
  porPagina,
  total,
  totalPaginas: Math.max(Math.ceil(total / porPagina), 1),
});

module.exports = { lePaginacao, metaPaginacao };
