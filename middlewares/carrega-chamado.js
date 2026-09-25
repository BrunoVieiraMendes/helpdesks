const { buscaChamadoAcessivel } = require('../services');
const { rota } = require('../utils');

/**
 * Carrega o chamado de :numero em req.chamado, aplicando a regra de acesso
 * (cliente só enxerga os próprios; chamado alheio responde 404, sem revelar que existe).
 */
const carregaChamado = rota(async (req, _res, next) => {
  req.chamado = await buscaChamadoAcessivel(req.params.numero, req.user);
  next();
});

module.exports = carregaChamado;
