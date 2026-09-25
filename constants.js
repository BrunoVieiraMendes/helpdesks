// Regras de domínio centralizadas. Tudo que é enum no banco nasce aqui,
// assim models, services, validações e telas usam a mesma fonte.

const PAPEIS = Object.freeze({
  CLIENTE: 'cliente',
  AGENTE: 'agente',
  ADMIN: 'admin',
});

// papéis que atendem chamados (enxergam a fila e notas internas)
const PAPEIS_DA_EQUIPE = Object.freeze([PAPEIS.AGENTE, PAPEIS.ADMIN]);

const STATUS = Object.freeze({
  NOVO: 'novo',
  EM_ATENDIMENTO: 'em_atendimento',
  PENDENTE: 'pendente',
  RESOLVIDO: 'resolvido',
  FECHADO: 'fechado',
});

const ROTULOS_STATUS = Object.freeze({
  novo: 'Novo',
  em_atendimento: 'Em Atendimento',
  pendente: 'Pendente',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
});

// Transições permitidas para a equipe. Voltar para "novo" não é permitido:
// um chamado só é novo enquanto ninguém mexeu nele.
// Reabrir um chamado fechado é exclusivo do admin (checado no service).
const TRANSICOES_STATUS = Object.freeze({
  novo: ['em_atendimento', 'pendente', 'resolvido', 'fechado'],
  em_atendimento: ['pendente', 'resolvido', 'fechado'],
  pendente: ['em_atendimento', 'resolvido', 'fechado'],
  resolvido: ['em_atendimento', 'fechado'],
  fechado: ['em_atendimento'],
});

const PRIORIDADES = Object.freeze({
  BAIXA: 'baixa',
  NORMAL: 'normal',
  ALTA: 'alta',
  URGENTE: 'urgente',
});

const ROTULOS_PRIORIDADE = Object.freeze({
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
});

// peso numérico para ordenar a fila (ordenar pelo texto daria a ordem errada)
const PESOS_PRIORIDADE = Object.freeze({
  baixa: 1,
  normal: 2,
  alta: 3,
  urgente: 4,
});

const TIPOS_INTERACAO = Object.freeze({
  PUBLICA: 'publica',
  INTERNA: 'interna',
  SISTEMA: 'sistema',
});

// Enquanto o chamado está nesses status o relógio do SLA de solução fica parado
// (ex.: aguardando retorno do cliente). O tempo pausado empurra o prazo para frente.
const STATUS_QUE_PAUSAM_SLA = Object.freeze([STATUS.PENDENTE]);

// Prazos padrão do SLA por urgência, em minutos ÚTEIS (dentro do expediente).
const SLA_PADRAO = Object.freeze({
  urgente: { primeiraResposta: 60, solucao: 4 * 60 },
  alta: { primeiraResposta: 2 * 60, solucao: 8 * 60 },
  normal: { primeiraResposta: 4 * 60, solucao: 16 * 60 },
  baixa: { primeiraResposta: 8 * 60, solucao: 40 * 60 },
});

// Expediente padrão: segunda a sexta, 08h às 18h, horário de Brasília (UTC-3, sem horário de verão).
const EXPEDIENTE_PADRAO = Object.freeze({
  dias: [1, 2, 3, 4, 5], // 0 = domingo ... 6 = sábado
  inicio: '08:00',
  fim: '18:00',
  fusoMinutos: -180,
});

// faixa restante do prazo (em %) a partir da qual o SLA fica "em risco"
const PERCENTUAL_SLA_EM_RISCO = 25;

// Permissões configuráveis nos Perfis de acesso, por tipo de perfil.
// "padrao" é o comportamento de quem não tem perfil (e não há perfil padrão cadastrado).
// Admin não usa perfil: tem todas as permissões.
const PERMISSOES = Object.freeze({
  agente: Object.freeze({
    abrirEmNomeDeCliente: { rotulo: 'Abrir chamados em nome de clientes', padrao: true },
    alterarPrioridade: { rotulo: 'Alterar a prioridade dos chamados', padrao: true },
    transferirChamados: { rotulo: 'Transferir chamados de equipe ou serviço', padrao: true },
    reabrirChamados: { rotulo: 'Reabrir chamados fechados', padrao: false },
    aplicarMacros: { rotulo: 'Aplicar macros', padrao: true },
    verRelatorios: { rotulo: 'Ver indicadores e relatórios', padrao: true },
  }),
  cliente: Object.freeze({
    abrirChamados: { rotulo: 'Abrir chamados', padrao: true },
    verChamadosDaEmpresa: { rotulo: 'Ver os chamados de toda a sua empresa', padrao: false },
    avaliarAtendimento: { rotulo: 'Responder a pesquisa de satisfação', padrao: true },
  }),
});

// tipos de perfil de acesso ("Perfil de" no Movidesk)
const TIPOS_DE_PERFIL = Object.freeze(Object.keys(PERMISSOES));

// Para quem o aviso do mural aparece
const PUBLICOS_DE_AVISO = Object.freeze({
  equipe: 'Equipe',
  clientes: 'Clientes',
  todos: 'Todos',
});

// Tipos de campo adicional (rótulos iguais aos do Movidesk)
const TIPOS_DE_CAMPO = Object.freeze({
  texto: 'Texto de uma linha',
  textoLongo: 'Texto com várias linhas',
  numero: 'Número',
  data: 'Data',
  simNao: 'Sim ou não',
  lista: 'Lista de valores',
  pessoa: 'Lista de pessoas',
});

// Onde o campo adicional é usado ("Campo para" / "Regra para")
const ALVOS_DE_CAMPO = Object.freeze({
  chamado: 'Ticket',
});

// Notificações do sino (barra do topo)
const TIPOS_DE_NOTIFICACAO = Object.freeze({
  'novo-chamado': 'Novo chamado na equipe',
  'chamado-transferido': 'Chamado transferido para a equipe',
});

// primeiro número legível gerado será NUMERO_INICIAL + 1 (#1001)
const NUMERO_INICIAL_CHAMADO = 1000;

const PAGINACAO = Object.freeze({
  PADRAO: 20,
  MAXIMO: 100,
});

module.exports = {
  PAPEIS,
  PAPEIS_DA_EQUIPE,
  STATUS,
  ROTULOS_STATUS,
  TRANSICOES_STATUS,
  PRIORIDADES,
  ROTULOS_PRIORIDADE,
  PESOS_PRIORIDADE,
  TIPOS_INTERACAO,
  STATUS_QUE_PAUSAM_SLA,
  SLA_PADRAO,
  EXPEDIENTE_PADRAO,
  PERCENTUAL_SLA_EM_RISCO,
  PERMISSOES,
  TIPOS_DE_PERFIL,
  TIPOS_DE_CAMPO,
  ALVOS_DE_CAMPO,
  PUBLICOS_DE_AVISO,
  TIPOS_DE_NOTIFICACAO,
  NUMERO_INICIAL_CHAMADO,
  PAGINACAO,
};
