require('dotenv').config();

const path = require('path');
const createError = require('http-errors');
const express = require('express');
const passport = require('passport');

require('./routes/v1/auth/jwt');

const { logger, normalizaErro } = require('./utils');
const { connect, preencheCodigosDosCadastros } = require('./models');
const { iniciaLeituraDeEmails } = require('./services');
const { agendaTarefas } = require('./workers');
const { workersAtivos, desativaFilas } = require('./workers/filas');
const router = require('./routes');

const app = express();

// views (EJS) e arquivos estáticos do frontend
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public')));

// configurando autenticacao
app.use(passport.initialize());

// configurando formatos de parâmetros
app.use(
  express.json({
    limit: '1mb',
    // webhook do WhatsApp: guarda o corpo original para conferir a assinatura da Meta
    verify: (req, _res, buf) => {
      if (req.originalUrl.startsWith('/v1/whatsapp/webhook')) req.corpoBruto = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// declarando rotas
app.use('/', router);

// caso nenhuma rota de match, redireciona para a 404
app.use((_req, _res, next) => {
  next(createError(404, 'Rota não encontrada'));
});

// error handler central: toda falha sai no mesmo formato { sucesso: false, erro }
app.use((err, req, res, _next) => {
  const { status, mensagem, detalhes } = normalizaErro(err);

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);
  } else {
    logger.debug(`${req.method} ${req.originalUrl} -> ${status} ${mensagem}`);
  }

  // páginas (não-API) recebem uma tela simples em vez de JSON
  if (!req.originalUrl.startsWith('/v1') && req.accepts('html')) {
    return res.status(status).render('erro', { status, mensagem });
  }

  res.status(status).json({ sucesso: false, erro: mensagem, ...(detalhes && { detalhes }) });
});

const TEMPO_MAXIMO_REDIS_MS = 10000;

// Filas (e-mails e fechamento automático) são opcionais: se o Redis estiver
// fora do ar, o Help Desk continua funcionando e apenas avisa no log.
const iniciaWorkers = async () => {
  if (!workersAtivos()) {
    logger.info('Workers desativados (WORKERS_ATIVOS=false)');
    return;
  }
  try {
    await Promise.race([
      agendaTarefas(),
      new Promise((_resolve, rejeita) =>
        setTimeout(() => rejeita(new Error('tempo esgotado')), TEMPO_MAXIMO_REDIS_MS),
      ),
    ]);
    logger.info('Filas conectadas ao Redis');
  } catch (e) {
    logger.warn(
      `Redis indisponível em ${process.env.REDIS_URL} (${e.message}). ` +
        'O Help Desk segue funcionando, mas sem e-mails e sem fechamento automático. ' +
        'Inicie o Redis e reinicie o servidor para ativá-los.',
    );
    await desativaFilas();
  }
};

const inicia = async () => {
  await connect();

  // cadastros antigos (ou criados pelo seed) recebem o Id numérico das listas
  const codigos = await preencheCodigosDosCadastros();
  if (codigos) logger.info(`Id numérico atribuído a ${codigos} registro(s) de cadastro`);

  const porta = Number(process.env.PORTA) || 3000;
  app.listen(porta, () => {
    logger.info(`Servidor ouvindo na porta ${porta}`);
  });

  iniciaWorkers();
  // chamados por e-mail: lê a caixa IMAP configurada em Configurações > E-mail
  iniciaLeituraDeEmails();
};

// só sobe o servidor quando executado diretamente (permite importar o app em testes)
if (require.main === module) {
  inicia().catch((e) => {
    logger.error(`Falha ao iniciar: ${e.stack || e.message}`);
    process.exit(1);
  });
}

module.exports = app;
