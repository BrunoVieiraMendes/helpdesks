const { STATUS } = require('../constants');
const atualizaChamado = require('./atualiza-chamado');

/**
 * Agente assume o chamado: vira o responsável e, se estiver "Novo", passa para "Em Atendimento".
 * @param {any} chamado
 * @param {import('./permissoes').UsuarioLogado} usuario
 */
const assumeChamado = (chamado, usuario) =>
  atualizaChamado(
    chamado,
    {
      responsavel: usuario._id,
      ...(chamado.status === STATUS.NOVO && { status: STATUS.EM_ATENDIMENTO }),
    },
    usuario,
  );

module.exports = assumeChamado;
