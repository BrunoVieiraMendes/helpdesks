const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');
const {
  STATUS,
  PRIORIDADES,
  PAPEIS,
  TIPOS_INTERACAO,
  PERMISSOES,
  TIPOS_DE_PERFIL,
  TIPOS_DE_CAMPO,
  ALVOS_DE_CAMPO,
  PUBLICOS_DE_AVISO,
} = require('../../constants');

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` });
const id = { type: 'string', example: '66f2b1c0a1e60a140b49e591' };
const data = { type: 'string', format: 'date-time' };
const sucesso = { type: 'boolean', example: true };

const schemas = {
  Erro: {
    type: 'object',
    properties: {
      sucesso: { type: 'boolean', example: false },
      erro: { type: 'string', example: 'Mensagem de erro' },
      detalhes: {
        type: 'object',
        additionalProperties: { type: 'string' },
        example: { titulo: 'Título é obrigatório' },
      },
    },
  },
  Paginacao: {
    type: 'object',
    properties: {
      pagina: { type: 'integer', example: 1 },
      porPagina: { type: 'integer', example: 20 },
      total: { type: 'integer', example: 57 },
      totalPaginas: { type: 'integer', example: 3 },
    },
  },
  UsuarioResumo: {
    type: 'object',
    properties: {
      _id: id,
      nome: { type: 'string', example: 'Ana Souza' },
      email: { type: 'string' },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'senha'],
    properties: {
      email: { type: 'string', format: 'email', example: 'ana@helpdesk.com' },
      senha: { type: 'string', format: 'password', example: 'helpdesk123' },
    },
  },
  LoginResponse: {
    type: 'object',
    properties: {
      sucesso,
      jwt: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      usuario: {
        type: 'object',
        properties: {
          _id: id,
          nome: { type: 'string' },
          email: { type: 'string' },
          papel: { type: 'string', enum: Object.values(PAPEIS) },
        },
      },
    },
  },
  NovoUsuario: {
    type: 'object',
    required: ['nome', 'email', 'senha'],
    properties: {
      nome: { type: 'string', example: 'Pedro Alves' },
      email: { type: 'string', format: 'email', example: 'pedro@cliente.com' },
      senha: { type: 'string', minLength: 6, example: 'senha123' },
      papel: { type: 'string', enum: Object.values(PAPEIS), default: PAPEIS.CLIENTE },
      equipes: { type: 'array', items: id, description: 'agente/admin' },
      empresa: { ...id, nullable: true, description: 'somente cliente' },
      perfil: {
        ...id,
        nullable: true,
        description: 'perfil de acesso do mesmo tipo (null = padrão)',
      },
      cargo: { ...id, nullable: true },
      classificacao: { ...id, nullable: true },
    },
  },
  AtualizaUsuario: {
    type: 'object',
    properties: {
      nome: { type: 'string' },
      papel: { type: 'string', enum: Object.values(PAPEIS) },
      ativo: { type: 'boolean' },
      senha: { type: 'string', minLength: 6 },
      equipes: { type: 'array', items: id, description: 'agente/admin' },
      empresa: { ...id, nullable: true, description: 'somente cliente' },
      perfil: {
        ...id,
        nullable: true,
        description: 'perfil de acesso do mesmo tipo (null = padrão)',
      },
      cargo: { ...id, nullable: true },
      classificacao: { ...id, nullable: true },
    },
  },
  Categoria: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Financeiro' },
      descricao: { type: 'string', example: 'Boletos e notas fiscais' },
      ativa: { type: 'boolean', example: true },
    },
  },
  Equipe: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Suporte' },
      descricao: { type: 'string', example: 'Atendimento de primeiro nível' },
      ativa: { type: 'boolean', example: true },
    },
  },
  Servico: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Infraestrutura de TI' },
      descricao: { type: 'string', example: 'Rede, computadores e impressoras' },
      equipe: { ...id, description: 'equipe que atende o serviço' },
      cor: { type: 'string', example: '#2458d6' },
      ordem: { type: 'integer', example: 1 },
      ativo: { type: 'boolean', example: true },
    },
  },
  NovoChamado: {
    type: 'object',
    required: ['titulo', 'descricao', 'servico'],
    properties: {
      titulo: { type: 'string', maxLength: 150, example: 'Erro ao emitir boleto' },
      descricao: { type: 'string', example: 'Ao clicar em emitir aparece erro 500.' },
      servico: { ...id, description: 'serviço do catálogo; define a equipe que vai atender' },
      categoria: id,
      prioridade: {
        type: 'string',
        enum: Object.values(PRIORIDADES),
        description: 'somente equipe',
      },
      solicitante: { ...id, description: 'somente equipe: abrir em nome de um cliente' },
      responsavel: { ...id, description: 'somente equipe' },
      camposAdicionais: {
        type: 'object',
        additionalProperties: true,
        description: '_id do campo -> valor. Obrigatórios visíveis (pelas regras) são exigidos',
      },
    },
  },
  Empresa: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Acme Ltda' },
      cnpj: { type: 'string', example: '12.345.678/0001-90' },
      telefone: { type: 'string', example: '(11) 4000-1234' },
      observacoes: { type: 'string' },
      ativa: { type: 'boolean', example: true },
    },
  },
  Perfil: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Agentes N1' },
      tipo: {
        type: 'string',
        enum: TIPOS_DE_PERFIL,
        description: '"Perfil de": agente ou cliente',
      },
      padrao: {
        type: 'boolean',
        description: 'aplicado a quem não tem perfil; só um padrão por tipo',
      },
      permissoes: {
        type: 'object',
        description:
          'chave -> liberada. Agente: ' +
          Object.keys(PERMISSOES.agente).join(', ') +
          '. Cliente: ' +
          Object.keys(PERMISSOES.cliente).join(', '),
        additionalProperties: { type: 'boolean' },
        example: { verTodosChamados: false, reabrirChamados: true },
      },
      ativo: { type: 'boolean', example: true },
    },
  },
  Cargo: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Analista de Suporte' },
      ativo: { type: 'boolean', example: true },
    },
  },
  Classificacao: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Revenda / Parceiro' },
      ativa: { type: 'boolean', example: true },
    },
  },
  CampoAdicional: {
    type: 'object',
    properties: {
      codigo: { type: 'integer', readOnly: true, description: 'Id numérico exibido nas listas' },
      nome: { type: 'string', example: 'Causa raiz' },
      tipo: {
        type: 'string',
        enum: Object.keys(TIPOS_DE_CAMPO),
        description: Object.entries(TIPOS_DE_CAMPO)
          .map(([k, v]) => `${k} = ${v}`)
          .join('; '),
      },
      alvo: { type: 'string', enum: Object.keys(ALVOS_DE_CAMPO), default: 'chamado' },
      opcoes: {
        type: 'array',
        items: { type: 'string' },
        description: 'tipo lista (também aceita texto com uma opção por linha)',
      },
      pessoasDe: {
        type: 'array',
        items: { type: 'string', enum: TIPOS_DE_PERFIL },
        description: 'tipo pessoa; vazio = todos',
      },
      obrigatorio: { type: 'boolean' },
      visivelParaCliente: { type: 'boolean', description: 'o cliente vê e preenche ao abrir' },
      ajuda: { type: 'string' },
      ordem: { type: 'integer' },
      ativo: { type: 'boolean' },
    },
  },
  RegraExibicao: {
    type: 'object',
    description:
      'Quando o chamado atende às condições (vazias = qualquer valor), exibe os campos. Campo citado por regras só aparece quando alguma casa.',
    properties: {
      codigo: { type: 'integer', readOnly: true },
      nome: { type: 'string', example: 'Criticidade para Infraestrutura' },
      alvo: { type: 'string', enum: Object.keys(ALVOS_DE_CAMPO), default: 'chamado' },
      servicos: { type: 'array', items: id },
      categorias: { type: 'array', items: id },
      condicaoCampo: {
        type: 'object',
        nullable: true,
        properties: {
          campo: { ...id, description: 'campo do tipo lista de valores' },
          valores: { type: 'array', items: { type: 'string' } },
        },
      },
      campos: { type: 'array', items: id, description: 'campos exibidos' },
      tornarObrigatorios: { type: 'boolean' },
      ativo: { type: 'boolean' },
    },
  },
  Aviso: {
    type: 'object',
    properties: {
      codigo: { type: 'integer', readOnly: true },
      nome: { type: 'string', example: 'Manutenção programada', description: 'título' },
      mensagem: {
        type: 'string',
        example: 'O sistema ficará fora do ar no sábado, das 8h às 10h.',
      },
      publico: { type: 'string', enum: Object.keys(PUBLICOS_DE_AVISO), default: 'equipe' },
      validoAte: {
        type: 'string',
        nullable: true,
        example: '2026-12-31',
        description: 'AAAA-MM-DD',
      },
      ativo: { type: 'boolean' },
    },
  },
  Tag: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Cliente VIP' },
      cor: { type: 'string', example: '#c62f3a' },
      ativa: { type: 'boolean', example: true },
    },
  },
  Justificativa: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Aguardando retorno do cliente' },
      status: {
        type: 'array',
        items: { type: 'string', enum: Object.values(STATUS) },
        example: [STATUS.PENDENTE],
      },
      ativa: { type: 'boolean', example: true },
    },
  },
  Feriado: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Natal' },
      data: { type: 'string', example: '2026-12-25', description: 'AAAA-MM-DD' },
      recorrente: { type: 'boolean', example: true, description: 'repete todo ano' },
      ativo: { type: 'boolean', example: true },
    },
  },
  Macro: {
    type: 'object',
    properties: {
      nome: { type: 'string', example: 'Solicitar print do erro' },
      mensagem: { type: 'string', example: 'Olá! Pode nos enviar um print da tela com o erro?' },
      tipo: { type: 'string', enum: [TIPOS_INTERACAO.PUBLICA, TIPOS_INTERACAO.INTERNA] },
      acoes: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            nullable: true,
            enum: Object.values(STATUS).filter((s) => s !== STATUS.FECHADO),
          },
          justificativa: { ...id, nullable: true },
          prioridade: { type: 'string', nullable: true, enum: Object.values(PRIORIDADES) },
          equipe: { ...id, nullable: true },
          atribuirAMim: { type: 'boolean' },
          adicionarTags: { type: 'array', items: id },
        },
      },
      ativa: { type: 'boolean', example: true },
    },
  },
  Configuracao: {
    type: 'object',
    properties: {
      nomeEmpresa: { type: 'string', example: 'Help Desk' },
      diasFechamentoAutomatico: { type: 'integer', example: 3 },
      expediente: {
        type: 'object',
        properties: {
          dias: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3, 4, 5] },
          inicio: { type: 'string', example: '08:00' },
          fim: { type: 'string', example: '18:00' },
          fusoMinutos: { type: 'integer', example: -180 },
        },
      },
      sla: {
        type: 'object',
        description: 'prazos em minutos úteis por prioridade',
        properties: Object.fromEntries(
          Object.values(PRIORIDADES).map((p) => [
            p,
            {
              type: 'object',
              properties: {
                primeiraResposta: { type: 'integer', example: 120 },
                solucao: { type: 'integer', example: 480 },
              },
            },
          ]),
        ),
      },
      pesquisa: {
        type: 'object',
        properties: {
          ativa: { type: 'boolean' },
          pergunta: { type: 'string' },
        },
      },
    },
  },
  AtualizaChamado: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: Object.values(STATUS) },
      justificativa: {
        ...id,
        nullable: true,
        description: 'obrigatória quando o status de destino tem justificativas cadastradas',
      },
      tags: { type: 'array', items: id },
      camposAdicionais: {
        type: 'object',
        additionalProperties: true,
        description: '_id do campo -> valor (null apaga)',
      },
      prioridade: { type: 'string', enum: Object.values(PRIORIDADES) },
      responsavel: {
        ...id,
        nullable: true,
        description: 'precisa ser membro da equipe do chamado',
      },
      categoria: { ...id, nullable: true },
      servico: { ...id, description: 'trocar o serviço move o chamado para a equipe dele' },
      equipe: { ...id, description: 'transferência de equipe' },
    },
  },
  Chamado: {
    type: 'object',
    properties: {
      _id: id,
      numero: { type: 'integer', example: 1024 },
      titulo: { type: 'string' },
      descricao: { type: 'string' },
      solicitante: ref('UsuarioResumo'),
      responsavel: { ...ref('UsuarioResumo'), nullable: true },
      categoria: {
        type: 'object',
        nullable: true,
        properties: { _id: id, nome: { type: 'string' } },
      },
      status: { type: 'string', enum: Object.values(STATUS) },
      prioridade: { type: 'string', enum: Object.values(PRIORIDADES) },
      pesoPrioridade: { type: 'integer', example: 3 },
      empresa: {
        type: 'object',
        nullable: true,
        properties: { _id: id, nome: { type: 'string' } },
      },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          properties: { _id: id, nome: { type: 'string' }, cor: { type: 'string' } },
        },
      },
      justificativa: {
        type: 'object',
        nullable: true,
        properties: { _id: id, nome: { type: 'string' } },
      },
      sla: {
        type: 'object',
        properties: {
          primeiraRespostaEm: { ...data, nullable: true },
          resolvidoEm: { ...data, nullable: true },
          fechadoEm: { ...data, nullable: true },
          prazoPrimeiraResposta: { ...data, nullable: true },
          prazoSolucao: { ...data, nullable: true },
          pausadoEm: {
            ...data,
            nullable: true,
            description: 'preenchido enquanto o chamado está Pendente',
          },
          minutosPausados: { type: 'integer' },
        },
      },
      avaliacao: {
        type: 'object',
        nullable: true,
        properties: {
          nota: { type: 'integer', minimum: 1, maximum: 5 },
          comentario: { type: 'string' },
          em: data,
        },
      },
      createdAt: data,
      updatedAt: data,
      permissoes: {
        type: 'object',
        properties: {
          podeEditar: { type: 'boolean' },
          podeAssumir: { type: 'boolean' },
          podeResponder: { type: 'boolean' },
          podeNotaInterna: { type: 'boolean' },
          podeReabrir: { type: 'boolean' },
          podeTransferir: { type: 'boolean' },
          podeAlterarPrioridade: { type: 'boolean' },
          podeAplicarMacros: { type: 'boolean' },
          verNotasInternas: { type: 'boolean' },
          podeAvaliar: { type: 'boolean' },
        },
      },
    },
  },
  ChamadoResponse: { type: 'object', properties: { sucesso, chamado: ref('Chamado') } },
  ListaChamadosResponse: {
    type: 'object',
    properties: {
      sucesso,
      chamados: { type: 'array', items: ref('Chamado') },
      paginacao: ref('Paginacao'),
    },
  },
  NovaInteracao: {
    type: 'object',
    required: ['mensagem'],
    properties: {
      mensagem: { type: 'string', example: 'Olá! Pode me enviar um print do erro?' },
      tipo: {
        type: 'string',
        enum: [TIPOS_INTERACAO.PUBLICA, TIPOS_INTERACAO.INTERNA],
        default: TIPOS_INTERACAO.PUBLICA,
      },
    },
  },
};

const erroJson = (descricao) => ({
  description: descricao,
  content: { 'application/json': { schema: ref('Erro') } },
});

const swaggerBase = {
  openapi: '3.0.0',
  info: {
    title: 'API do Help Desk',
    description:
      'Fila de chamados com portal do cliente, lista, Kanban e timeline. Todas as falhas seguem o formato `Erro`.',
    version: '0.1.0',
  },
  tags: [
    { name: 'status', description: 'Saúde da API' },
    { name: 'autenticação', description: 'Login' },
    { name: 'usuários', description: 'Usuários e papéis' },
    { name: 'equipes', description: 'Equipes de atendimento e seus membros' },
    { name: 'serviços', description: 'Catálogo de serviços (cada um encaminha para uma equipe)' },
    { name: 'categorias', description: 'Categorias de chamado' },
    {
      name: 'cadastros',
      description: 'Empresas, tags, justificativas, feriados e macros (painel de configurações)',
    },
    { name: 'configurações', description: 'Expediente, SLA, pesquisa de satisfação e parâmetros' },
    { name: 'chamados', description: 'Abertura, fila, Kanban e alterações' },
    { name: 'timeline', description: 'Respostas públicas e notas internas' },
    { name: 'relatórios', description: 'Indicadores e relatório de chamados (CSV)' },
    {
      name: 'notificações',
      description: 'Sino da barra do topo: avisos de chamados novos e transferidos para a equipe',
    },
  ],
  components: {
    securitySchemes: { auth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas,
    parameters: {
      NumeroChamado: {
        in: 'path',
        name: 'numero',
        required: true,
        schema: { type: 'integer', example: 1024 },
        description: 'Número legível do chamado',
      },
    },
    responses: {
      NaoAutorizado: erroJson('JWT ausente, inválido ou expirado'),
      Proibido: erroJson('Papel sem permissão para esta ação'),
      Invalido: erroJson('Dados inválidos (veja `detalhes`)'),
    },
  },
};

module.exports = swaggerJSDoc({
  failOnErrors: true,
  definition: swaggerBase,
  // o glob exige "/" mesmo no Windows (com "\" nenhuma rota era encontrada)
  apis: [path.join(__dirname, '*.js').split(path.sep).join('/')],
});
