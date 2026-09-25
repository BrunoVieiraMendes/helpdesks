const express = require('express');

const v1Router = require('./v1');
const paginasRouter = require('./paginas');

const router = express.Router();

router.use('/v1', v1Router);
router.use('/', paginasRouter);

module.exports = router;
