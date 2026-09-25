const createError = require('http-errors');

/**
 * Restringe a rota aos papéis informados. Deve vir depois de `autentica`.
 * @example router.post('/', autoriza('admin'), handler)
 * @param {...string} papeis
 * @returns {import('express').RequestHandler}
 */
const autoriza =
  (...papeis) =>
  (req, _res, next) => {
    if (!req.user) return next(createError(401, 'Não autenticado'));
    if (!papeis.includes(req.user.papel)) {
      return next(createError(403, 'Você não tem permissão para esta ação'));
    }
    return next();
  };

module.exports = autoriza;
