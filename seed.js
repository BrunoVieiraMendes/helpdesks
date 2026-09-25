// Popula o banco para o primeiro acesso. Idempotente: pode rodar mais de uma vez.
// Uso: npm run seed
require('dotenv').config();

const bcrypt = require('bcrypt');

const models = require('./models');
const {
  Usuario,
  Categoria,
  Chamado,
  Interacao,
  Equipe,
  Servico,
  Empresa,
  Tag,
  Justificativa,
  Feriado,
  Macro,
  Perfil,
  Cargo,
  Classificacao,
  CampoAdicional,
  RegraExibicao,
  Aviso,
} = models;
const { PAPEIS, PESOS_PRIORIDADE, STATUS_QUE_PAUSAM_SLA } = require('./constants');
const proximoNumeroDeChamado = require('./services/proximo-numero');
const { obtemConfiguracao, carregaCalendario } = require('./services/configuracao');
const { calculaPrazos } = require('./services/sla');
const { logger } = require('./utils');

const SENHA_PADRAO = 'helpdesk123';

const EQUIPES = [
  { nome: 'Suporte', descricao: 'Atendimento de primeiro nível, dúvidas e erros no sistema' },
  { nome: 'TI', descricao: 'Infraestrutura, acessos, rede e equipamentos' },
  { nome: 'Auditoria', descricao: 'Conformidade, controles e solicitações de auditoria' },
];

// serviços do catálogo -> equipe que atende
const SERVICOS = [
  {
    nome: 'Suporte ao Sistema',
    equipe: 'Suporte',
    cor: '#2458d6',
    descricao: 'Dúvidas de uso, erros e lentidão no sistema',
  },
  {
    nome: 'Financeiro',
    equipe: 'Suporte',
    cor: '#1f8a4c',
    descricao: 'Boletos, notas fiscais e cobranças',
  },
  {
    nome: 'Acessos e Senhas',
    equipe: 'TI',
    cor: '#7a3fd1',
    descricao: 'Criação de usuários, bloqueios e troca de senha',
  },
  {
    nome: 'Infraestrutura de TI',
    equipe: 'TI',
    cor: '#b86a00',
    descricao: 'Rede, computadores, impressoras e servidores',
  },
  {
    nome: 'Auditoria',
    equipe: 'Auditoria',
    cor: '#c62f3a',
    descricao: 'Relatórios, evidências e controles internos',
  },
];

const USUARIOS = [
  { chave: 'admin', nome: 'Admin do Sistema', email: 'admin@helpdesk.com', papel: PAPEIS.ADMIN },
  {
    chave: 'ana',
    nome: 'Ana Souza',
    email: 'ana@helpdesk.com',
    papel: PAPEIS.AGENTE,
    equipes: ['Suporte', 'Auditoria'],
    cargo: 'Analista de Suporte',
    classificacao: 'Funcionário Interno',
  },
  {
    chave: 'carlos',
    nome: 'Carlos Lima',
    email: 'carlos@helpdesk.com',
    papel: PAPEIS.AGENTE,
    equipes: ['TI', 'Suporte'],
    perfil: 'Agentes Supervisores',
    cargo: 'Coordenador de Atendimento',
    classificacao: 'Funcionário Interno',
  },
  {
    chave: 'joao',
    nome: 'João Pereira',
    email: 'joao@cliente.com',
    papel: PAPEIS.CLIENTE,
    empresa: 'Acme Ltda',
    classificacao: 'Cliente',
  },
  {
    chave: 'maria',
    nome: 'Maria Oliveira',
    email: 'maria@cliente.com',
    papel: PAPEIS.CLIENTE,
    empresa: 'Globex Comércio',
    perfil: 'Clientes Gestores',
    cargo: 'Gerente Financeiro',
    classificacao: 'Cliente',
  },
];

const CATEGORIAS = [
  { nome: 'Acesso e Login', descricao: 'Problemas de senha, bloqueio e permissões' },
  { nome: 'Financeiro', descricao: 'Boletos, notas fiscais e cobranças' },
  { nome: 'Bug', descricao: 'Comportamento inesperado do sistema' },
  { nome: 'Dúvida', descricao: 'Dúvidas de uso e orientações' },
  { nome: 'Sugestão', descricao: 'Pedidos de melhoria' },
];

// perfis de acesso (sem perfil, vale o padrão do tipo)
const PERFIS = [
  { nome: 'Agentes', tipo: 'agente', padrao: true, permissoes: {} },
  {
    nome: 'Agentes Supervisores',
    tipo: 'agente',
    permissoes: { reabrirChamados: true },
  },
  { nome: 'Clientes', tipo: 'cliente', padrao: true, permissoes: {} },
  { nome: 'Clientes Gestores', tipo: 'cliente', permissoes: { verChamadosDaEmpresa: true } },
];

const CARGOS = [
  { nome: 'Analista de Suporte' },
  { nome: 'Analista de Infraestrutura' },
  { nome: 'Coordenador de Atendimento' },
  { nome: 'Gerente Financeiro' },
];

const CLASSIFICACOES = [
  { nome: 'Cliente' },
  { nome: 'Funcionário Interno' },
  { nome: 'Funcionário Externo' },
  { nome: 'Revenda / Parceiro' },
];

// campos adicionais do chamado (os nomes das regras abaixo apontam para eles)
const CAMPOS_ADICIONAIS = [
  {
    nome: 'Criticidade do chamado',
    tipo: 'lista',
    opcoes: ['Baixa', 'Média', 'Alta', 'Crítica'],
    visivelParaCliente: true,
    ajuda: 'Quanto o problema afeta o seu trabalho',
    ordem: 0,
  },
  {
    nome: 'Código de Licença',
    tipo: 'texto',
    visivelParaCliente: true,
    ajuda: 'Aparece em Ajuda > Sobre',
    ordem: 1,
  },
  { nome: 'Dados da VPN', tipo: 'textoLongo', ordem: 2 },
  {
    nome: 'Causa Raiz',
    tipo: 'lista',
    opcoes: ['Falha de software', 'Falha de infraestrutura', 'Erro de uso', 'Configuração'],
    ordem: 3,
  },
  { nome: 'Atendido por', tipo: 'pessoa', pessoasDe: ['agente'], ordem: 4 },
];

// regras para exibição: serviços, campos da condição e campos exibidos por nome
const REGRAS_EXIBICAO = [
  {
    nome: 'Dados de VPN',
    servicos: ['Infraestrutura de TI', 'Acessos e Senhas'],
    campos: ['Dados da VPN'],
  },
  {
    nome: 'Causa Raiz',
    servicos: ['Suporte ao Sistema', 'Infraestrutura de TI'],
    campos: ['Causa Raiz'],
  },
  {
    nome: 'Criticidade do Chamado',
    condicaoCampo: { campo: 'Criticidade do chamado', valores: ['Alta', 'Crítica'] },
    campos: ['Atendido por'],
    tornarObrigatorios: true,
  },
];

// mural de avisos (Início da equipe e portal do cliente)
const AVISOS = [
  {
    nome: 'Bem-vindo ao novo Help Desk',
    mensagem:
      'Os chamados agora têm SLA em horário útil, campos adicionais e pesquisa de satisfação. Qualquer dúvida, fale com o admin.',
    publico: 'equipe',
  },
  {
    nome: 'Manutenção programada',
    mensagem:
      'O sistema pode ficar instável no sábado, das 8h às 10h, por causa de uma atualização.',
    publico: 'todos',
  },
];

const EMPRESAS = [
  { nome: 'Acme Ltda', cnpj: '12.345.678/0001-90', telefone: '(11) 4000-1234' },
  { nome: 'Globex Comércio', cnpj: '98.765.432/0001-10', telefone: '(21) 3000-5678' },
];

const TAGS = [
  { nome: 'Cliente VIP', cor: '#c62f3a' },
  { nome: 'Recorrente', cor: '#b86a00' },
  { nome: 'Melhoria', cor: '#0e7c86' },
];

const JUSTIFICATIVAS = [
  { nome: 'Aguardando retorno do cliente', status: ['pendente'] },
  { nome: 'Aguardando fornecedor', status: ['pendente'] },
];

// feriados nacionais de data fixa (os móveis podem ser adicionados na tela de Feriados)
const FERIADOS = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
].map(([dia, nome]) => ({ nome, data: `${new Date().getFullYear()}-${dia}`, recorrente: true }));

// referências por nome (resolvidas depois que tags/justificativas/equipes existem)
const MACROS = [
  {
    nome: 'Solicitar print do erro',
    tipo: 'publica',
    mensagem:
      'Olá! Para seguirmos com a análise, pode nos enviar um print da tela com o erro e o horário aproximado em que aconteceu?',
    acoes: { status: 'pendente', justificativa: 'Aguardando retorno do cliente' },
  },
  {
    nome: 'Resolvido - confirmar com o cliente',
    tipo: 'publica',
    mensagem:
      'Olá! O problema foi corrigido. Pode confirmar se está tudo certo por aí? Se não respondermos em alguns dias, o chamado será encerrado automaticamente.',
    acoes: { status: 'resolvido' },
  },
  {
    nome: 'Escalar para TI',
    tipo: 'interna',
    mensagem:
      'Escalando para a equipe de TI: problema de infraestrutura, fora do escopo do Suporte.',
    acoes: { equipe: 'TI', prioridade: 'alta', adicionarTags: ['Recorrente'] },
  },
];

const horasAtras = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

// chamados de demonstração: um pouco de cada status para a Lista e o Kanban
const chamadosDeExemplo = (u, c, s) => [
  {
    titulo: 'Não consigo acessar o sistema após trocar a senha',
    descricao: 'Troquei a senha ontem e desde então aparece "credenciais inválidas".',
    solicitante: u.joao,
    categoria: c['Acesso e Login'],
    servico: s['Acessos e Senhas'],
    prioridade: 'urgente',
    status: 'novo',
    criadoHa: 2,
    tags: ['Cliente VIP'],
    interacoes: [],
  },
  {
    titulo: 'Boleto de setembro com valor divergente',
    descricao: 'O boleto veio com R$ 50,00 a mais do que o contratado.',
    solicitante: u.maria,
    categoria: c['Financeiro'],
    servico: s['Financeiro'],
    prioridade: 'alta',
    status: 'novo',
    criadoHa: 5,
    interacoes: [],
  },
  {
    titulo: 'Erro 500 ao exportar relatório em PDF',
    descricao: 'Ao clicar em Exportar > PDF a tela mostra erro 500.',
    solicitante: u.joao,
    categoria: c['Bug'],
    servico: s['Suporte ao Sistema'],
    prioridade: 'alta',
    status: 'em_atendimento',
    responsavel: u.ana,
    criadoHa: 26,
    interacoes: [
      {
        autor: u.ana,
        tipo: 'publica',
        mensagem: 'Olá João! Já estou analisando, consegue me dizer o período do relatório?',
        ha: 24,
      },
      { autor: u.joao, tipo: 'publica', mensagem: 'Período de 01/08 a 31/08.', ha: 23 },
      {
        autor: u.ana,
        tipo: 'interna',
        mensagem: 'Reproduzi em homologação. Timeout na geração com muitos registros.',
        ha: 20,
      },
    ],
  },
  {
    titulo: 'Como cadastrar um novo usuário na minha empresa?',
    descricao: 'Preciso dar acesso para um colega do time.',
    solicitante: u.maria,
    categoria: c['Dúvida'],
    servico: s['Acessos e Senhas'],
    prioridade: 'baixa',
    status: 'pendente',
    justificativa: 'Aguardando retorno do cliente',
    responsavel: u.carlos,
    criadoHa: 48,
    pausadoHa: 46,
    interacoes: [
      {
        autor: u.carlos,
        tipo: 'publica',
        mensagem:
          'Oi Maria! Você tem perfil de gestora na conta? Se sim, vá em Configurações > Usuários.',
        ha: 46,
      },
    ],
  },
  {
    titulo: 'Nota fiscal não chegou por e-mail',
    descricao: 'A NF de agosto não foi enviada para o financeiro.',
    solicitante: u.joao,
    categoria: c['Financeiro'],
    servico: s['Financeiro'],
    prioridade: 'normal',
    status: 'resolvido',
    responsavel: u.carlos,
    criadoHa: 72,
    resolvidoHa: 60,
    interacoes: [
      {
        autor: u.carlos,
        tipo: 'publica',
        mensagem: 'Reenviei a NF para financeiro@cliente.com. Pode confirmar o recebimento?',
        ha: 70,
      },
    ],
  },
  {
    titulo: 'Sugestão: modo escuro no painel',
    descricao: 'Seria ótimo ter um tema escuro para uso à noite.',
    solicitante: u.maria,
    categoria: c['Sugestão'],
    servico: s['Suporte ao Sistema'],
    prioridade: 'baixa',
    status: 'fechado',
    responsavel: u.ana,
    criadoHa: 240,
    resolvidoHa: 200,
    fechadoHa: 150,
    tags: ['Melhoria'],
    avaliacao: { nota: 5, comentario: 'Atendimento rápido e atencioso!', ha: 199 },
    interacoes: [
      {
        autor: u.ana,
        tipo: 'publica',
        mensagem: 'Obrigada pela sugestão! Encaminhamos para o time de produto.',
        ha: 230,
      },
    ],
  },
  {
    titulo: 'Lentidão na tela de pedidos',
    descricao: 'A listagem de pedidos demora mais de 30 segundos para carregar.',
    solicitante: u.maria,
    categoria: c['Bug'],
    servico: s['Infraestrutura de TI'],
    prioridade: 'normal',
    status: 'em_atendimento',
    responsavel: u.carlos,
    criadoHa: 10,
    tags: ['Recorrente'],
    interacoes: [
      {
        autor: u.carlos,
        tipo: 'publica',
        mensagem: 'Estamos investigando. Obrigado pela paciência!',
        ha: 8,
      },
    ],
  },
  {
    titulo: 'Relatório de acessos do trimestre para auditoria',
    descricao:
      'Precisamos do relatório de quem acessou o módulo financeiro entre julho e setembro.',
    solicitante: u.maria,
    categoria: c['Dúvida'],
    servico: s['Auditoria'],
    prioridade: 'alta',
    status: 'novo',
    criadoHa: 3,
    interacoes: [],
  },
];

const semeiaUsuarios = async (equipes, empresas, pessoas) => {
  const hash = await bcrypt.hash(SENHA_PADRAO, 10);
  const porChave = {};

  for (const {
    chave,
    equipes: nomesEquipes = [],
    empresa,
    perfil,
    cargo,
    classificacao,
    ...dados
  } of USUARIOS) {
    await Usuario.updateOne(
      { email: dados.email },
      {
        $set: { nome: dados.nome, papel: dados.papel, ativo: true },
        $setOnInsert: { senha: hash },
      },
      { upsert: true, runValidators: true },
    );
    // só define as equipes de quem ainda não tem nenhuma (não desfaz ajustes feitos pelo admin)
    await Usuario.updateOne(
      { email: dados.email, $or: [{ equipes: { $exists: false } }, { equipes: { $size: 0 } }] },
      { $set: { equipes: nomesEquipes.map((n) => equipes[n]) } },
    );
    // idem para empresa, perfil, cargo e classificação
    const relacoes = {
      empresa: empresa && empresas[empresa],
      perfil: perfil && pessoas.perfis[perfil],
      cargo: cargo && pessoas.cargos[cargo],
      classificacao: classificacao && pessoas.classificacoes[classificacao],
    };
    for (const [campo, valor] of Object.entries(relacoes)) {
      if (!valor) continue;
      await Usuario.updateOne(
        { email: dados.email, $or: [{ [campo]: null }, { [campo]: { $exists: false } }] },
        { $set: { [campo]: valor } },
      );
    }
    const usuario = await Usuario.findOne({ email: dados.email }).select('_id').lean();
    porChave[chave] = usuario._id;
  }

  return porChave;
};

/**
 * Cria o que ainda não existe (pela chave) sem alterar o que o admin já ajustou.
 * @returns {Promise<Record<string, any>>} valor da chave -> _id
 */
const semeiaPorChave = async (Model, itens, chave = 'nome') => {
  const porChave = {};
  for (const item of itens) {
    await Model.updateOne({ [chave]: item[chave] }, { $setOnInsert: item }, { upsert: true });
    porChave[item[chave]] = (
      await Model.findOne({ [chave]: item[chave] })
        .select('_id')
        .lean()
    )._id;
  }
  return porChave;
};

const semeiaRegrasExibicao = (campos, servicos) =>
  semeiaPorChave(
    RegraExibicao,
    REGRAS_EXIBICAO.map((regra) => ({
      nome: regra.nome,
      servicos: (regra.servicos || []).map((n) => servicos[n]._id),
      categorias: [],
      condicaoCampo: regra.condicaoCampo
        ? { campo: campos[regra.condicaoCampo.campo], valores: regra.condicaoCampo.valores }
        : null,
      campos: regra.campos.map((n) => campos[n]),
      tornarObrigatorios: Boolean(regra.tornarObrigatorios),
    })),
  );

const semeiaMacros = (equipes, tags, justificativas) =>
  semeiaPorChave(
    Macro,
    MACROS.map(({ acoes, ...macro }) => ({
      ...macro,
      acoes: {
        status: acoes.status ?? null,
        prioridade: acoes.prioridade ?? null,
        justificativa: acoes.justificativa ? justificativas[acoes.justificativa] : null,
        equipe: acoes.equipe ? equipes[acoes.equipe] : null,
        atribuirAMim: Boolean(acoes.atribuirAMim),
        adicionarTags: (acoes.adicionarTags || []).map((nome) => tags[nome]),
      },
    })),
  );

// Chamados de antes do SLA/empresas: calcula os prazos, pausa os pendentes e
// associa a empresa do solicitante. Não mexe no updatedAt.
const atualizaChamadosAntigos = async () => {
  const configuracao = await obtemConfiguracao();
  const calendario = await carregaCalendario(configuracao);
  let atualizados = 0;

  const semPrazo = await Chamado.find({
    $or: [{ 'sla.prazoSolucao': null }, { 'sla.prazoSolucao': { $exists: false } }],
  })
    .select('createdAt prioridade status updatedAt sla.pausadoEm')
    .lean();
  for (const c of semPrazo) {
    const prazos = calculaPrazos(
      { criadoEm: c.createdAt, prioridade: c.prioridade },
      configuracao,
      calendario,
    );
    const pausado = STATUS_QUE_PAUSAM_SLA.includes(c.status) && !c.sla?.pausadoEm;
    await Chamado.updateOne(
      { _id: c._id },
      {
        $set: {
          'sla.prazoPrimeiraResposta': prazos.prazoPrimeiraResposta,
          'sla.prazoSolucao': prazos.prazoSolucao,
          ...(pausado && { 'sla.pausadoEm': c.updatedAt }),
        },
      },
      { timestamps: false },
    );
    atualizados += 1;
  }

  const semEmpresa = await Chamado.find({
    $or: [{ empresa: null }, { empresa: { $exists: false } }],
  })
    .select('solicitante')
    .populate('solicitante', 'empresa')
    .lean();
  for (const c of semEmpresa) {
    if (!c.solicitante?.empresa) continue;
    await Chamado.updateOne(
      { _id: c._id },
      { $set: { empresa: c.solicitante.empresa } },
      { timestamps: false },
    );
    atualizados += 1;
  }

  return atualizados;
};

const semeiaCategorias = async () => {
  const porNome = {};
  for (const categoria of CATEGORIAS) {
    const doc = await Categoria.findOneAndUpdate(
      { nome: categoria.nome },
      { $set: categoria },
      { upsert: true, new: true },
    );
    porNome[doc.nome] = doc._id;
  }
  return porNome;
};

const semeiaEquipes = async () => {
  const porNome = {};
  for (const equipe of EQUIPES) {
    await Equipe.updateOne({ nome: equipe.nome }, { $setOnInsert: equipe }, { upsert: true });
    porNome[equipe.nome] = (await Equipe.findOne({ nome: equipe.nome }).select('_id').lean())._id;
  }
  return porNome;
};

const semeiaServicos = async (equipes) => {
  const porNome = {};
  for (const [ordem, { equipe, ...servico }] of SERVICOS.entries()) {
    await Servico.updateOne(
      { nome: servico.nome },
      { $setOnInsert: { ...servico, equipe: equipes[equipe], ordem } },
      { upsert: true },
    );
    const doc = await Servico.findOne({ nome: servico.nome }).select('_id equipe').lean();
    porNome[servico.nome] = doc;
  }
  return porNome;
};

// Bancos criados antes das equipes: chamados sem equipe vão para a equipe do
// responsável (se houver) ou para o serviço padrão, para não sumirem da fila.
const migraChamadosSemEquipe = async (servicos) => {
  const padrao = servicos['Suporte ao Sistema'];
  const semEquipe = await Chamado.find({ $or: [{ equipe: null }, { equipe: { $exists: false } }] })
    .select('_id responsavel')
    .populate('responsavel', 'equipes')
    .lean();

  for (const chamado of semEquipe) {
    const equipeDoResponsavel = chamado.responsavel?.equipes?.[0];
    const servico =
      (equipeDoResponsavel &&
        Object.values(servicos).find((s) => String(s.equipe) === String(equipeDoResponsavel))) ||
      padrao;
    await Chamado.updateOne(
      { _id: chamado._id },
      { $set: { servico: servico._id, equipe: servico.equipe } },
      { timestamps: false },
    );
  }
  return semEquipe.length;
};

const semeiaChamados = async (usuarios, categorias, servicos, tags, justificativas) => {
  if ((await Chamado.estimatedDocumentCount()) > 0) {
    logger.info('Chamados já existem, pulando chamados de exemplo');
    return 0;
  }

  const nomesServicos = Object.fromEntries(Object.entries(servicos).map(([n, d]) => [n, d._id]));
  const exemplos = chamadosDeExemplo(usuarios, categorias, nomesServicos);
  const equipeDoServico = Object.fromEntries(
    Object.values(servicos).map((d) => [String(d._id), d.equipe]),
  );
  const empresaDe = Object.fromEntries(
    (
      await Usuario.find({ _id: { $in: Object.values(usuarios) } })
        .select('empresa')
        .lean()
    ).map((u) => [String(u._id), u.empresa ?? null]),
  );
  const configuracao = await obtemConfiguracao();
  const calendario = await carregaCalendario(configuracao);

  for (const ex of exemplos) {
    const criadoEm = horasAtras(ex.criadoHa);
    const prazos = calculaPrazos({ criadoEm, prioridade: ex.prioridade }, configuracao, calendario);
    const respostasPublicasDaEquipe = ex.interacoes
      .filter((i) => i.tipo === 'publica' && String(i.autor) !== String(ex.solicitante))
      .map((i) => i.ha);

    const ultimaAtividade = Math.min(
      ex.criadoHa,
      ...ex.interacoes.map((i) => i.ha),
      ex.resolvidoHa ?? Infinity,
      ex.fechadoHa ?? Infinity,
    );

    // insertOne direto na coleção para poder controlar createdAt/updatedAt da demonstração
    const numero = await proximoNumeroDeChamado();
    const { insertedId } = await Chamado.collection.insertOne({
      numero,
      titulo: ex.titulo,
      descricao: ex.descricao,
      solicitante: ex.solicitante,
      responsavel: ex.responsavel || null,
      categoria: ex.categoria,
      servico: ex.servico,
      equipe: equipeDoServico[String(ex.servico)],
      status: ex.status,
      prioridade: ex.prioridade,
      pesoPrioridade: PESOS_PRIORIDADE[ex.prioridade],
      empresa: empresaDe[String(ex.solicitante)],
      tags: (ex.tags || []).map((nome) => tags[nome]),
      justificativa: ex.justificativa ? justificativas[ex.justificativa] : null,
      sla: {
        primeiraRespostaEm: respostasPublicasDaEquipe.length
          ? horasAtras(Math.max(...respostasPublicasDaEquipe))
          : null,
        resolvidoEm: ex.resolvidoHa ? horasAtras(ex.resolvidoHa) : null,
        fechadoEm: ex.fechadoHa ? horasAtras(ex.fechadoHa) : null,
        prazoPrimeiraResposta: prazos.prazoPrimeiraResposta,
        prazoSolucao: prazos.prazoSolucao,
        pausadoEm: ex.pausadoHa ? horasAtras(ex.pausadoHa) : null,
        minutosPausados: 0,
      },
      avaliacao: ex.avaliacao
        ? {
            nota: ex.avaliacao.nota,
            comentario: ex.avaliacao.comentario,
            em: horasAtras(ex.avaliacao.ha),
          }
        : null,
      createdAt: criadoEm,
      updatedAt: horasAtras(ultimaAtividade),
    });

    if (ex.interacoes.length) {
      await Interacao.collection.insertMany(
        ex.interacoes.map((i) => ({
          chamado: insertedId,
          autor: i.autor,
          tipo: i.tipo,
          mensagem: i.mensagem,
          createdAt: horasAtras(i.ha),
        })),
      );
    }
  }

  return exemplos.length;
};

(async () => {
  try {
    await models.connect();
    await Promise.all(models.NOMES_DOS_MODELS.map((m) => models[m].syncIndexes()));

    const equipes = await semeiaEquipes();
    const servicos = await semeiaServicos(equipes);
    const empresas = await semeiaPorChave(Empresa, EMPRESAS);
    const pessoas = {
      perfis: await semeiaPorChave(Perfil, PERFIS),
      cargos: await semeiaPorChave(Cargo, CARGOS),
      classificacoes: await semeiaPorChave(Classificacao, CLASSIFICACOES),
    };
    const usuarios = await semeiaUsuarios(equipes, empresas, pessoas);
    const categorias = await semeiaCategorias();
    const tags = await semeiaPorChave(Tag, TAGS);
    const justificativas = await semeiaPorChave(Justificativa, JUSTIFICATIVAS);
    await semeiaPorChave(Feriado, FERIADOS, 'data');
    await semeiaMacros(equipes, tags, justificativas);
    const campos = await semeiaPorChave(CampoAdicional, CAMPOS_ADICIONAIS);
    await semeiaRegrasExibicao(campos, servicos);
    await semeiaPorChave(Aviso, AVISOS);
    const totalChamados = await semeiaChamados(
      usuarios,
      categorias,
      servicos,
      tags,
      justificativas,
    );
    const migrados = await migraChamadosSemEquipe(servicos);
    if (migrados) logger.info(`${migrados} chamado(s) antigos associados a uma equipe`);
    const codigos = await models.preencheCodigosDosCadastros();
    if (codigos) logger.info(`Id numérico atribuído a ${codigos} registro(s)`);
    const atualizados = await atualizaChamadosAntigos();
    if (atualizados) logger.info(`${atualizados} ajuste(s) de SLA/empresa em chamados antigos`);

    logger.info(
      `Seed concluído: ${EQUIPES.length} equipes, ${SERVICOS.length} serviços, ${EMPRESAS.length} empresas, ${PERFIS.length} perfis de acesso, ${CARGOS.length} cargos, ${CLASSIFICACOES.length} classificações, ${USUARIOS.length} usuários, ${CATEGORIAS.length} categorias, ${TAGS.length} tags, ${JUSTIFICATIVAS.length} justificativas, ${FERIADOS.length} feriados, ${MACROS.length} macros, ${CAMPOS_ADICIONAIS.length} campos adicionais, ${REGRAS_EXIBICAO.length} regras para exibição, ${totalChamados} chamados de exemplo`,
    );
    logger.info(`Senha de todos os usuários de teste: ${SENHA_PADRAO}`);
  } catch (e) {
    logger.error(`Falha no seed: ${e.stack || e.message}`);
    process.exitCode = 1;
  } finally {
    await models.disconnect();
  }
})();
