const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const createError = require('http-errors');

const { Usuario } = require('../models');
const { acessoDoUsuario } = require('./perfis');

/**
 * Autentica por e-mail e senha e devolve o JWT + dados públicos do usuário.
 * A mensagem de erro é sempre a mesma para não revelar quais e-mails existem.
 * @param {string} email
 * @param {string} senha
 */
const logaUsuario = async (email, senha) => {
  if (!email || !senha) {
    throw createError(422, 'Informe e-mail e senha');
  }

  const credenciaisInvalidas = createError(401, 'E-mail ou senha inválidos');

  const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim(), ativo: true })
    .select('+senha')
    .lean();
  if (!usuario) throw credenciaisInvalidas;

  const senhaValida = await bcrypt.compare(String(senha), usuario.senha);
  if (!senhaValida) throw credenciaisInvalidas;

  const token = jwt.sign({ id: usuario._id, papel: usuario.papel }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRA_EM || '8h',
  });

  return {
    jwt: token,
    usuario: {
      _id: usuario._id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      ...(await acessoDoUsuario(usuario)),
    },
  };
};

module.exports = logaUsuario;
