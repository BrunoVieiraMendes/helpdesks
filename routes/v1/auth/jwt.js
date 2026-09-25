const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');

const { Usuario } = require('../../../models');
const { acessoDoUsuario } = require('../../../services/perfis');

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET_KEY,
    },
    async (jwtPayload, done) => {
      try {
        // usuário desativado perde o acesso imediatamente, mesmo com JWT válido
        const usuario = await Usuario.findOne({ _id: jwtPayload.id, ativo: true }).lean();
        if (!usuario) return done(null, false);
        // permissões do perfil de acesso: mudanças no perfil valem na próxima requisição
        const { perfil, permissoes } = await acessoDoUsuario(usuario);
        return done(null, { ...usuario, perfilEfetivo: perfil, permissoes });
      } catch (err) {
        return done(err);
      }
    },
  ),
);
