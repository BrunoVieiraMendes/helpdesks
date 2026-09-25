const { Interacao, Usuario, Categoria, Equipe, Servico, Tag, Justificativa } = require('../models');
const { ROTULOS_STATUS, ROTULOS_PRIORIDADE, TIPOS_INTERACAO } = require('../constants');

const NOMES_DOS_CAMPOS = {
  status: 'Status',
  prioridade: 'Prioridade',
  responsavel: 'Responsável',
  categoria: 'Categoria',
  servico: 'Serviço',
  equipe: 'Equipe',
  tags: 'Tags',
  justificativa: 'Justificativa',
};

// cada campo de referência aponta para uma coleção diferente
const COLECOES = {
  responsavel: Usuario,
  categoria: Categoria,
  equipe: Equipe,
  servico: Servico,
  tags: Tag,
  justificativa: Justificativa,
};

// tags é uma lista; os demais campos, um valor só
const comoLista = (valor) => (Array.isArray(valor) ? valor : [valor]).filter(Boolean);

// busca nomes de usuários/categorias/equipes/serviços/tags envolvidos para a mensagem ficar legível
const carregaNomes = async (mudancas) => {
  const ids = (campo) =>
    mudancas
      .filter((m) => m.campo === campo)
      .flatMap((m) => [...comoLista(m.de), ...comoLista(m.para)]);

  const docs = await Promise.all(
    Object.entries(COLECOES).map(([campo, Model]) =>
      Model.find({ _id: { $in: ids(campo) } })
        .select('nome')
        .lean(),
    ),
  );

  return new Map(docs.flat().map((d) => [String(d._id), d.nome]));
};

const rotulo = (campo, valor, nomes) => {
  if (campo === 'tags') {
    const lista = comoLista(valor);
    return lista.length ? lista.map((id) => nomes.get(String(id)) || '—').join(', ') : 'Nenhuma';
  }
  if (valor === null || valor === undefined) return campo === 'responsavel' ? 'Ninguém' : 'Nenhuma';
  if (campo === 'status') return ROTULOS_STATUS[valor];
  if (campo === 'prioridade') return ROTULOS_PRIORIDADE[valor];
  return nomes.get(String(valor)) || '—';
};

const paraTexto = (valor) => {
  if (valor === null || valor === undefined) return null;
  return Array.isArray(valor) ? valor.map(String).join(',') : String(valor);
};

/**
 * Grava na timeline um evento de sistema para cada campo alterado.
 * @param {any} chamadoId
 * @param {{ campo: string, de: any, para: any }[]} mudancas
 * @param {{ _id: any, nome: string } | null} autor  null = automação
 */
const registraEventos = async (chamadoId, mudancas, autor) => {
  if (!mudancas.length) return;

  const nomes = await carregaNomes(mudancas);
  const quem = autor ? autor.nome : 'Sistema';

  await Interacao.insertMany(
    mudancas.map(({ campo, de, para }) => ({
      chamado: chamadoId,
      autor: autor ? autor._id : null,
      tipo: TIPOS_INTERACAO.SISTEMA,
      mensagem: `${quem} alterou ${NOMES_DOS_CAMPOS[campo]}: ${rotulo(campo, de, nomes)} → ${rotulo(campo, para, nomes)}`,
      evento: { campo, de: paraTexto(de), para: paraTexto(para) },
    })),
  );
};

module.exports = registraEventos;
