// Gera chamados históricos de demonstração para os indicadores e relatórios.
// Tudo o que é criado leva a tag "Demonstração", e dá para apagar depois.
//
// Uso:
//   npm run demo:relatorios                      400 chamados nos últimos 90 dias
//   npm run demo:relatorios -- --quantidade 800 --dias 180
//   npm run demo:relatorios -- --remover         apaga os chamados de demonstração
//
// Usa as equipes, serviços, categorias, clientes e agentes que já existem (rode o seed antes).
require('dotenv').config();

const models = require('../models');
const { Chamado, Interacao, Servico, Categoria, Usuario, Tag } = models;
const { PAPEIS, PESOS_PRIORIDADE, STATUS } = require('../constants');
const proximoNumeroDeChamado = require('../services/proximo-numero');
const { obtemConfiguracao, carregaCalendario } = require('../services/configuracao');
const { calculaPrazos } = require('../services/sla');
const { logger } = require('../utils');

const NOME_DA_TAG = 'Demonstração';
const HORA = 60 * 60 * 1000;

const argumento = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? padrao : Number(process.argv[i + 1]) || padrao;
};

// ---------------------------------------------------------------- sorteios
const sorteia = (lista) => lista[Math.floor(Math.random() * lista.length)];
const sorteiaPeso = (pesos) => {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [valor, peso] of Object.entries(pesos)) {
    r -= peso;
    if (r <= 0) return valor;
  }
  return Object.keys(pesos)[0];
};
// tempo com cauda longa (a maioria rápida, alguns bem demorados)
const exponencial = (media) => -Math.log(1 - Math.random()) * media;

// horário de abertura realista: mais em dias úteis e no horário comercial (Brasília)
const momentoDeAbertura = (dias) => {
  for (;;) {
    const quando = new Date(Date.now() - Math.random() * dias * 24 * HORA);
    const local = new Date(quando.getTime() - 3 * HORA);
    const diaUtil = local.getUTCDay() >= 1 && local.getUTCDay() <= 5;
    const hora = local.getUTCHours();
    const comercial = hora >= 8 && hora < 19;
    const chance = (diaUtil ? 1 : 0.15) * (comercial ? 1 : 0.12);
    if (Math.random() < chance) return quando;
  }
};

const PRIORIDADES = { baixa: 25, normal: 45, alta: 20, urgente: 10 };
// horas médias até a 1ª resposta e até a solução, por urgência
const RITMO = {
  urgente: { resposta: 0.6, solucao: 5 },
  alta: { resposta: 1.5, solucao: 12 },
  normal: { resposta: 3, solucao: 26 },
  baixa: { resposta: 6, solucao: 50 },
};
const NOTAS = { 5: 46, 4: 30, 3: 12, 2: 7, 1: 5 };

const TITULOS = [
  'Erro ao emitir nota fiscal',
  'Não consigo acessar o sistema',
  'Lentidão na tela de pedidos',
  'Solicito criação de usuário',
  'Boleto com valor divergente',
  'Impressora não imprime',
  'Relatório não exporta para Excel',
  'Senha expirada',
  'VPN não conecta',
  'Dúvida sobre fechamento do mês',
  'Integração com o ERP falhando',
  'E-mail não chega para os clientes',
  'Liberação de acesso a pasta de rede',
  'Tela branca ao abrir o módulo financeiro',
  'Solicitação de relatório de auditoria',
  'Computador reiniciando sozinho',
];
const RESPOSTAS = [
  'Olá! Já estamos verificando, retorno em breve.',
  'Recebemos o seu chamado e já estamos analisando.',
  'Pode nos enviar um print do erro, por favor?',
  'Estamos trabalhando nisso e atualizamos assim que tivermos novidades.',
];
const SOLUCOES = [
  'Ajuste realizado. Pode verificar, por favor?',
  'Problema corrigido e testado aqui. Qualquer coisa é só responder.',
  'Acesso liberado conforme solicitado.',
  'Configuração corrigida, o sistema já está normal.',
];
const COMENTARIOS = {
  5: [
    'Atendimento excelente, muito rápido!',
    'Resolveram tudo na primeira resposta.',
    'Muito atenciosos.',
  ],
  4: ['Bom atendimento.', 'Resolvido, mas demorou um pouco.'],
  3: ['Resolveu, mas precisei insistir.'],
  2: ['Demorou muito para resolver.'],
  1: ['Péssima experiência, tive que reabrir.'],
};

// ---------------------------------------------------------------- geração
const carregaBase = async () => {
  const [servicos, categorias, clientes, equipe] = await Promise.all([
    Servico.find({ ativo: true }).select('_id equipe').lean(),
    Categoria.find({ ativa: true }).select('_id').lean(),
    Usuario.find({ papel: PAPEIS.CLIENTE, ativo: true }).select('_id empresa').lean(),
    Usuario.find({ papel: { $in: [PAPEIS.AGENTE, PAPEIS.ADMIN] }, ativo: true })
      .select('_id papel equipes')
      .lean(),
  ]);
  if (!servicos.length || !clientes.length || !equipe.length) {
    throw new Error('Cadastre serviços, clientes e agentes antes (rode "npm run seed").');
  }
  return { servicos, categorias, clientes, equipe };
};

// agente da equipe do serviço (ou um admin, se a equipe não tiver membros)
const responsavelPara = (equipeId, pessoas) => {
  const membros = pessoas.filter(
    (p) =>
      p.papel === PAPEIS.AGENTE && (p.equipes || []).some((e) => String(e) === String(equipeId)),
  );
  return sorteia(membros.length ? membros : pessoas)._id;
};

const gera = async (quantidade, dias) => {
  const base = await carregaBase();
  const configuracao = await obtemConfiguracao();
  const calendario = await carregaCalendario(configuracao);
  await Tag.updateOne(
    { nome: NOME_DA_TAG },
    { $setOnInsert: { nome: NOME_DA_TAG, cor: '#5f6b7e' } },
    { upsert: true },
  );
  const tag = await Tag.findOne({ nome: NOME_DA_TAG }).select('_id').lean();
  const agora = Date.now();

  for (let i = 0; i < quantidade; i += 1) {
    const criadoEm = momentoDeAbertura(dias);
    const idadeHoras = (agora - criadoEm.getTime()) / HORA;
    const prioridade = sorteiaPeso(PRIORIDADES);
    const ritmo = RITMO[prioridade];
    const servico = sorteia(base.servicos);
    const cliente = sorteia(base.clientes);
    const responsavel = responsavelPara(servico.equipe, base.equipe);

    // 1ª resposta e solução (se já deu tempo de acontecer)
    const horasResposta = exponencial(ritmo.resposta);
    const respondido = horasResposta < idadeHoras && Math.random() < 0.96;
    const horasSolucao = Math.max(horasResposta + 0.3, exponencial(ritmo.solucao));
    const resolvido = respondido && horasSolucao < idadeHoras && Math.random() < 0.92;
    const fechado = resolvido && idadeHoras - horasSolucao > 72;

    let status = STATUS.NOVO;
    if (fechado) status = STATUS.FECHADO;
    else if (resolvido) status = STATUS.RESOLVIDO;
    else if (respondido) status = Math.random() < 0.3 ? STATUS.PENDENTE : STATUS.EM_ATENDIMENTO;

    const respostaEm = respondido ? new Date(criadoEm.getTime() + horasResposta * HORA) : null;
    const resolvidoEm = resolvido ? new Date(criadoEm.getTime() + horasSolucao * HORA) : null;
    const prazos = calculaPrazos({ criadoEm, prioridade }, configuracao, calendario);
    const nota = resolvido && Math.random() < 0.55 ? Number(sorteiaPeso(NOTAS)) : null;
    const avaliadoEm = nota
      ? new Date(Math.min(agora, resolvidoEm.getTime() + exponencial(10) * HORA))
      : null;

    const numero = await proximoNumeroDeChamado();
    const { insertedId } = await Chamado.collection.insertOne({
      numero,
      titulo: sorteia(TITULOS),
      descricao: 'Chamado gerado para demonstração dos indicadores.',
      solicitante: cliente._id,
      empresa: cliente.empresa || null,
      responsavel: status === STATUS.NOVO ? null : responsavel,
      categoria: base.categorias.length ? sorteia(base.categorias)._id : null,
      servico: servico._id,
      equipe: servico.equipe,
      status,
      prioridade,
      pesoPrioridade: PESOS_PRIORIDADE[prioridade],
      tags: [tag._id],
      justificativa: null,
      sla: {
        primeiraRespostaEm: respostaEm,
        resolvidoEm,
        fechadoEm: fechado ? new Date(resolvidoEm.getTime() + 72 * HORA) : null,
        prazoPrimeiraResposta: prazos.prazoPrimeiraResposta,
        prazoSolucao: prazos.prazoSolucao,
        pausadoEm: status === STATUS.PENDENTE ? respostaEm : null,
        minutosPausados: 0,
      },
      avaliacao: nota
        ? {
            nota,
            comentario: Math.random() < 0.4 ? sorteia(COMENTARIOS[nota]) : '',
            em: avaliadoEm,
          }
        : null,
      createdAt: criadoEm,
      updatedAt: avaliadoEm || resolvidoEm || respostaEm || criadoEm,
    });

    const interacoes = [];
    if (respondido) {
      interacoes.push({
        autor: responsavel,
        tipo: 'publica',
        mensagem: sorteia(RESPOSTAS),
        createdAt: respostaEm,
      });
    }
    if (resolvido) {
      interacoes.push({
        autor: responsavel,
        tipo: 'publica',
        mensagem: sorteia(SOLUCOES),
        createdAt: resolvidoEm,
      });
    }
    if (interacoes.length) {
      await Interacao.collection.insertMany(
        interacoes.map((it) => ({ ...it, chamado: insertedId })),
      );
    }
  }
  return quantidade;
};

const remove = async () => {
  const tag = await Tag.findOne({ nome: NOME_DA_TAG }).select('_id').lean();
  if (!tag) return 0;
  const ids = await Chamado.find({ tags: tag._id }).distinct('_id');
  await Interacao.deleteMany({ chamado: { $in: ids } });
  const { deletedCount } = await Chamado.deleteMany({ _id: { $in: ids } });
  await Tag.deleteOne({ _id: tag._id });
  return deletedCount;
};

(async () => {
  if (process.env.NODE_ENV === 'production') {
    logger.error('Dados de demonstração não são gerados com NODE_ENV=production');
    process.exitCode = 1;
    return;
  }
  try {
    await models.connect();
    if (process.argv.includes('--remover')) {
      logger.info(`${await remove()} chamado(s) de demonstração removidos`);
    } else {
      const quantidade = argumento('quantidade', 400);
      const dias = argumento('dias', 90);
      await gera(quantidade, dias);
      logger.info(
        `${quantidade} chamados de demonstração criados nos últimos ${dias} dias (tag "${NOME_DA_TAG}"). Para apagar: npm run demo:relatorios -- --remover`,
      );
    }
  } catch (e) {
    logger.error(`Falha: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await models.disconnect();
  }
})();
