/**
 * Envolve um handler async do Express e repassa qualquer erro para o
 * error handler central, evitando try/catch repetido em cada rota.
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} handler
 * @returns {import('express').RequestHandler}
 */
const rota = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = rota;
