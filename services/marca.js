// Marca da empresa: logo (no lugar do "HD") e nome exibidos no sistema.
const { Marca } = require('../models');
const { erroDeValidacao } = require('../utils');
const { obtemConfiguracao } = require('./configuracao');

const ID = 'marca';
const TAMANHO_MAXIMO = 512 * 1024;
const TEMPO_DO_CACHE_MS = 60000;

// assinatura dos formatos aceitos (SVG fica de fora: pode carregar script)
const FORMATOS = {
  'image/png': (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47,
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

let cache = { em: 0, logo: undefined, nome: null };
const limpaCache = () => {
  cache = { em: 0, logo: undefined, nome: null };
};

const carrega = async () => {
  if (cache.logo !== undefined && Date.now() - cache.em < TEMPO_DO_CACHE_MS) return cache;
  const [doc, config] = await Promise.all([Marca.findById(ID).lean(), obtemConfiguracao()]);
  cache = {
    em: Date.now(),
    logo: doc?.logo
      ? { dados: Buffer.from(doc.logo.buffer || doc.logo), tipo: doc.tipo, versao: doc.versao }
      : null,
    nome: config.nomeEmpresa || 'Help Desk',
  };
  return cache;
};

/** O que as telas precisam: nome da empresa e o endereço da logo (ou null = "HD"). */
const resumoDaMarca = async () => {
  const { logo, nome } = await carrega();
  return { nome, logo: logo ? `/marca/logo?v=${logo.versao}` : null };
};

/** Imagem da logo para a rota pública /marca/logo (null se não houver). */
const imagemDaLogo = async () => (await carrega()).logo;

/**
 * Troca a logo. Recebe a imagem como data URL (data:image/png;base64,...).
 * @param {string} dataUrl
 */
const salvaLogo = async (dataUrl) => {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    String(dataUrl || ''),
  );
  if (!m) throw erroDeValidacao({ logo: 'Envie uma imagem PNG, JPG ou WebP' });
  const dados = Buffer.from(m[2], 'base64');
  if (!dados.length) throw erroDeValidacao({ logo: 'Imagem vazia' });
  if (dados.length > TAMANHO_MAXIMO)
    throw erroDeValidacao({ logo: 'A imagem deve ter no máximo 512 KB' });
  if (!FORMATOS[m[1]](dados)) throw erroDeValidacao({ logo: 'O arquivo não é uma imagem válida' });

  await Marca.updateOne(
    { _id: ID },
    { $set: { logo: dados, tipo: m[1], versao: Date.now() } },
    { upsert: true },
  );
  limpaCache();
  return resumoDaMarca();
};

/** Volta para o "HD" padrão. */
const removeLogo = async () => {
  await Marca.updateOne(
    { _id: ID },
    { $set: { logo: null, tipo: null, versao: Date.now() } },
    { upsert: true },
  );
  limpaCache();
  return resumoDaMarca();
};

module.exports = {
  resumoDaMarca,
  imagemDaLogo,
  salvaLogo,
  removeLogo,
  limpaCacheDaMarca: limpaCache,
};
