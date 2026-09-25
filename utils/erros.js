const createError = require('http-errors');
const mongoose = require('mongoose');

/**
 * Converte qualquer erro em { status, mensagem } para o error handler.
 * Services lançam http-errors (createError(404, '...')); erros do Mongoose
 * viram 422 (validação) ou 400 (id mal formado).
 * @param {any} err
 * @returns {{ status: number, mensagem: string, detalhes?: object }}
 */
const normalizaErro = (err) => {
  if (createError.isHttpError(err)) {
    return { status: err.status, mensagem: err.message, detalhes: err.detalhes };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const detalhes = Object.fromEntries(
      Object.entries(err.errors).map(([campo, e]) => [campo, e.message]),
    );
    return { status: 422, mensagem: 'Dados inválidos', detalhes };
  }

  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, mensagem: `Valor inválido para o campo ${err.path}` };
  }

  if (err && err.code === 11000) {
    const campo = Object.keys(err.keyValue || {})[0] || 'campo';
    return { status: 409, mensagem: `Já existe um registro com esse ${campo}` };
  }

  if (err && err.type === 'entity.parse.failed') {
    return { status: 400, mensagem: 'JSON inválido no corpo da requisição' };
  }

  return { status: 500, mensagem: 'Erro interno no servidor' };
};

/**
 * Cria um http-error de validação (422) com detalhes por campo.
 * @param {Record<string, string>} detalhes
 */
const erroDeValidacao = (detalhes) => {
  const erro = createError(422, 'Dados inválidos');
  erro.detalhes = detalhes;
  return erro;
};

module.exports = { normalizaErro, erroDeValidacao };
