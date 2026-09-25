const Queue = require('bull');
const { logger } = require('../utils');

// Filas criadas sob demanda: com WORKERS_ATIVOS=false (ou Redis indisponível na
// inicialização) nenhuma conexão com o Redis é mantida.
const filas = new Map();
let desativadas = false;

const workersAtivos = () => !desativadas && process.env.WORKERS_ATIVOS !== 'false';

// evita inundar o log enquanto o ioredis tenta reconectar
let ultimoErroLogado = 0;
const logaErroDeFila = (nome) => (err) => {
  if (Date.now() - ultimoErroLogado < 30000) return;
  ultimoErroLogado = Date.now();
  logger.error(`Fila "${nome}": ${err.message}`);
};

/** @param {string} nome */
const obtemFila = (nome) => {
  if (!filas.has(nome)) {
    const fila = new Queue(nome, process.env.REDIS_URL);
    fila.on('error', logaErroDeFila(nome)); // sem listener, um erro do Redis derrubaria o processo
    filas.set(nome, fila);
  }
  return filas.get(nome);
};

/**
 * Desliga as filas e para as tentativas de reconexão (usado quando o Redis
 * não está disponível na inicialização).
 */
const desativaFilas = async () => {
  desativadas = true;
  const limite = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await Promise.all(
    [...filas.values()].map((fila) =>
      Promise.race([fila.close(true).catch(() => {}), limite(2000)]),
    ),
  );
  filas.clear();
};

/**
 * Enfileira um job sem bloquear nem derrubar a requisição: o chamado/resposta
 * já foi salvo e a notificação é secundária.
 * @param {string} nome
 * @param {Record<string, any>} dados
 */
const enfileira = (nome, dados) => {
  if (!workersAtivos()) return;
  obtemFila(nome)
    .add(dados, { attempts: 3, backoff: 5000, removeOnComplete: true })
    .catch((e) => logger.error(`Falha ao enfileirar job em "${nome}": ${e.message}`));
};

module.exports = { obtemFila, enfileira, workersAtivos, desativaFilas };
