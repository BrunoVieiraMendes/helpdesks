// Criptografia simétrica (AES-256-GCM) para segredos guardados no banco, como as senhas das
// contas de e-mail. A chave vem de CHAVE_CRIPTOGRAFIA (qualquer texto longo) ou, na falta dela,
// é derivada de JWT_SECRET_KEY. Trocar a chave invalida os segredos já gravados.
const crypto = require('crypto');

const VERSAO = 'v1';

const chave = () => {
  const base = process.env.CHAVE_CRIPTOGRAFIA || process.env.JWT_SECRET_KEY;
  if (!base) throw new Error('Defina CHAVE_CRIPTOGRAFIA (ou JWT_SECRET_KEY) no .env');
  return crypto.createHash('sha256').update(`helpdesk:${base}`).digest();
};

/**
 * @param {string} texto
 * @returns {string} "v1:iv:tag:dados" (base64)
 */
const cifra = (texto) => {
  const iv = crypto.randomBytes(12);
  const cifrador = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  return [VERSAO, iv, cifrador.getAuthTag(), dados]
    .map((p) => (Buffer.isBuffer(p) ? p.toString('base64') : p))
    .join(':');
};

/**
 * @param {string} valor  saída de cifra()
 * @returns {string | null} null se vazio ou se não der para decifrar (ex.: chave trocada)
 */
const decifra = (valor) => {
  if (!valor) return null;
  try {
    const [versao, iv, tag, dados] = String(valor).split(':');
    if (versao !== VERSAO) return null;
    const decifrador = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
    decifrador.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decifrador.update(Buffer.from(dados, 'base64')),
      decifrador.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

module.exports = { cifra, decifra };
