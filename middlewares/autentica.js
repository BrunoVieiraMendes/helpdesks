const passport = require('passport');
const createError = require('http-errors');

/**
 * Exige um JWT válido (Authorization: Bearer <jwt>) e coloca o usuário em req.user.
 * Diferente do passport.authenticate puro, responde 401 no formato padrão da API.
 * @type {import('express').RequestHandler}
 */
const autentica = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, usuario) => {
    if (err) return next(err);
    if (!usuario)
      return next(createError(401, 'Sessão inválida ou expirada. Faça login novamente'));
    req.user = usuario;
    return next();
  })(req, res, next);
};

module.exports = autentica;
