const express = require('express');

const { autoriza } = require('../../middlewares');
const { ehAdmin } = require('../../services/permissoes');
const { rota } = require('../../utils');
const { PAPEIS } = require('../../constants');

/**
 * Monta as rotas REST de um cadastro simples (services/cadastros.js):
 *   GET    /       lista os ativos (admin: ?todos=true inclui os inativos)
 *   POST   /       cria (admin)
 *   PATCH  /:id    atualiza, ativa ou desativa (admin)
 *   DELETE /:id    remove se não estiver em uso; senão 409 (admin)
 * @param {{ lista: Function, cria: Function, atualiza: Function, remove: Function }} servico
 * @param {{ chave: string, plural: string, removido: string, leitura: string[], filtraLeitura?: (itens: any[], usuario: any) => Promise<any[]> | any[] }} opcoes
 *   filtraLeitura: recorta a lista para quem não é da equipe (ex.: o cliente)
 */
const rotasDeCadastro = (servico, { chave, plural, removido, leitura, filtraLeitura }) => {
  const router = express.Router();
  const somenteAdmin = autoriza(PAPEIS.ADMIN);

  router.get(
    '/',
    autoriza(...leitura),
    rota(async (req, res) => {
      const todos = req.query.todos === 'true' && ehAdmin(req.user);
      const itens = await servico.lista({ todos });
      res.json({
        sucesso: true,
        [plural]: filtraLeitura ? await filtraLeitura(itens, req.user) : itens,
      });
    }),
  );

  router.post(
    '/',
    somenteAdmin,
    rota(async (req, res) => {
      res.status(201).json({ sucesso: true, [chave]: await servico.cria(req.body || {}) });
    }),
  );

  router.patch(
    '/:id',
    somenteAdmin,
    rota(async (req, res) => {
      res.json({ sucesso: true, [chave]: await servico.atualiza(req.params.id, req.body || {}) });
    }),
  );

  router.delete(
    '/:id',
    somenteAdmin,
    rota(async (req, res) => {
      await servico.remove(req.params.id);
      res.json({ sucesso: true, mensagem: removido });
    }),
  );

  return router;
};

/**
 * @openapi
 * /v1/empresas:
 *   get:
 *     summary: Empresas dos clientes (agente/admin)
 *     description: Admin pode enviar `?todos=true` para incluir as inativas. Cada item traz `totalClientes`.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Empresas }
 *   post:
 *     summary: Cria empresa (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Empresa' } } }
 *     responses:
 *       201: { description: Empresa criada }
 * /v1/empresas/{id}:
 *   patch:
 *     summary: Atualiza / desativa empresa (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Empresa' } } }
 *     responses:
 *       200: { description: Empresa atualizada }
 *   delete:
 *     summary: Remove empresa (admin)
 *     description: Só remove se não houver clientes nem chamados ligados a ela; senão 409 (desative).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Empresa removida }
 *       409: { description: Empresa em uso }
 * /v1/tags:
 *   get:
 *     summary: Tags de chamado (agente/admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Tags }
 *   post:
 *     summary: Cria tag (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } }
 *     responses:
 *       201: { description: Tag criada }
 * /v1/tags/{id}:
 *   patch:
 *     summary: Atualiza / desativa tag (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } }
 *     responses:
 *       200: { description: Tag atualizada }
 *   delete:
 *     summary: Remove tag (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Tag removida }
 *       409: { description: Tag em uso }
 * /v1/justificativas:
 *   get:
 *     summary: Justificativas de status (agente/admin)
 *     description: Se um status tiver justificativas ativas, mover o chamado para ele exige informar uma.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Justificativas }
 *   post:
 *     summary: Cria justificativa (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Justificativa' } } }
 *     responses:
 *       201: { description: Justificativa criada }
 * /v1/justificativas/{id}:
 *   patch:
 *     summary: Atualiza / desativa justificativa (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Justificativa' } } }
 *     responses:
 *       200: { description: Justificativa atualizada }
 *   delete:
 *     summary: Remove justificativa (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Justificativa removida }
 *       409: { description: Justificativa em uso }
 * /v1/feriados:
 *   get:
 *     summary: Feriados (admin)
 *     description: Dias sem expediente; o SLA não corre neles.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Feriados }
 *   post:
 *     summary: Cria feriado (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Feriado' } } }
 *     responses:
 *       201: { description: Feriado criado }
 * /v1/feriados/{id}:
 *   patch:
 *     summary: Atualiza / desativa feriado (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Feriado' } } }
 *     responses:
 *       200: { description: Feriado atualizado }
 *   delete:
 *     summary: Remove feriado (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Feriado removido }
 * /v1/macros:
 *   get:
 *     summary: Macros (agente/admin)
 *     description: Respostas prontas com ações. Aplique com POST /v1/chamados/{numero}/macros/{id}.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Macros }
 *   post:
 *     summary: Cria macro (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Macro' } } }
 *     responses:
 *       201: { description: Macro criada }
 * /v1/macros/{id}:
 *   patch:
 *     summary: Atualiza / desativa macro (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Macro' } } }
 *     responses:
 *       200: { description: Macro atualizada }
 *   delete:
 *     summary: Remove macro (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Macro removida }
 * /v1/perfis:
 *   get:
 *     summary: Perfis de acesso (admin)
 *     description: Permissões de agentes ou clientes. Quem não tem perfil usa o padrão do tipo. Cada item traz `totalPessoas`. `?todos=true` inclui os desabilitados.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Perfis de acesso }
 *   post:
 *     summary: Cria perfil de acesso (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Perfil' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/perfis/{id}:
 *   patch:
 *     summary: Atualiza / desabilita perfil de acesso (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Perfil' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove perfil de acesso (admin)
 *     description: Só remove se nenhuma pessoa usar; senão 409 (desabilite).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 *       409: { description: Em uso }
 * /v1/cargos:
 *   get:
 *     summary: Cargos (admin)
 *     description: Cargos das pessoas. Cada item traz `totalPessoas`. `?todos=true` inclui os desabilitados.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Cargos }
 *   post:
 *     summary: Cria cargo (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Cargo' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/cargos/{id}:
 *   patch:
 *     summary: Atualiza / desabilita cargo (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Cargo' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove cargo (admin)
 *     description: Só remove se nenhuma pessoa usar; senão 409 (desabilite).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 *       409: { description: Em uso }
 * /v1/classificacoes:
 *   get:
 *     summary: Classificações (admin)
 *     description: Classificações das pessoas (Cliente, Parceiro...). Cada item traz `totalPessoas`. `?todos=true` inclui os desabilitados.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Classificações }
 *   post:
 *     summary: Cria classificação (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Classificacao' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/classificacoes/{id}:
 *   patch:
 *     summary: Atualiza / desabilita classificação (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Classificacao' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove classificação (admin)
 *     description: Só remove se nenhuma pessoa usar; senão 409 (desabilite).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 *       409: { description: Em uso }
 * /v1/campos-adicionais:
 *   get:
 *     summary: Campos adicionais
 *     description: Todos leem; o cliente recebe só os visíveis para ele. Admin envia `?todos=true` para incluir os desabilitados.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Campos adicionais }
 *   post:
 *     summary: Cria campo adicional (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CampoAdicional' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/campos-adicionais/{id}:
 *   patch:
 *     summary: Atualiza / desabilita campo adicional (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/CampoAdicional' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove campo adicional (admin)
 *     description: Só remove se não estiver em uso; senão 409 (desabilite).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 *       409: { description: Em uso }
 * /v1/regras-exibicao:
 *   get:
 *     summary: Regras para exibição
 *     description: Todos leem (a abertura do chamado usa as regras para montar o formulário).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Regras para exibição }
 *   post:
 *     summary: Cria regra para exibição (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/RegraExibicao' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/regras-exibicao/{id}:
 *   patch:
 *     summary: Atualiza / desabilita regra para exibição (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/RegraExibicao' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove regra para exibição (admin)
 *     description: Só remove se não estiver em uso; senão 409 (desabilite).
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 *       409: { description: Em uso }
 * /v1/avisos:
 *   get:
 *     summary: Mural de avisos
 *     description: Admin recebe todos (`?todos=true` inclui desabilitados); os demais, só os avisos válidos para o seu público.
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     responses:
 *       200: { description: Avisos }
 *   post:
 *     summary: Cria aviso (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Aviso' } } }
 *     responses:
 *       201: { description: Criado }
 * /v1/avisos/{id}:
 *   patch:
 *     summary: Atualiza / desabilita aviso (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       content: { application/json: { schema: { $ref: '#/components/schemas/Aviso' } } }
 *     responses:
 *       200: { description: Atualizado }
 *   delete:
 *     summary: Remove aviso (admin)
 *     tags: [cadastros]
 *     security: [{ auth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Removido }
 */
module.exports = rotasDeCadastro;
