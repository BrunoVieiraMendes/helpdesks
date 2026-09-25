// Cálculo de tempo útil (expediente e feriados), sem acesso ao banco.
//
// As datas são convertidas para o "horário local" do expediente deslocando o
// timestamp pelo fuso (fusoMinutos) e lidas com getUTC*. Assim o cálculo não
// depende do fuso do servidor.

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;
// trava de segurança: nenhum prazo passa de ~10 anos de dias corridos
const MAXIMO_DE_DIAS = 3660;

/** @typedef {{ dias: number[], inicio: string, fim: string, fusoMinutos: number }} Expediente */
/** @typedef {{ expediente: Expediente, feriados: { data: string, recorrente?: boolean }[] }} Calendario */

const minutosDoDia = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

const doisDigitos = (n) => String(n).padStart(2, '0');
const chaveDoDia = (local) =>
  `${local.getUTCFullYear()}-${doisDigitos(local.getUTCMonth() + 1)}-${doisDigitos(local.getUTCDate())}`;

/**
 * Prepara o calendário para consultas rápidas.
 * Expediente sem dias ou com início >= fim é tratado como 24x7.
 * @param {Calendario} calendario
 */
const preparaCalendario = ({ expediente, feriados = [] }) => {
  const inicio = minutosDoDia(expediente.inicio);
  const fim = minutosDoDia(expediente.fim);
  const valido = expediente.dias?.length > 0 && inicio < fim;

  const datas = new Set();
  const recorrentes = new Set();
  for (const f of feriados) {
    if (f.recorrente) recorrentes.add(f.data.slice(5));
    else datas.add(f.data);
  }

  return {
    corrido: !valido,
    fuso: (expediente.fusoMinutos || 0) * MINUTO,
    dias: new Set(expediente.dias),
    inicio: inicio * MINUTO,
    fim: fim * MINUTO,
    ehFeriado: (local) => {
      const chave = chaveDoDia(local);
      return datas.has(chave) || recorrentes.has(chave.slice(5));
    },
  };
};

const inicioDoDia = (local) => new Date(Math.floor(local.getTime() / DIA) * DIA);

// janela de expediente [abre, fecha) do dia, ou null se não é dia útil
const janelaDoDia = (cal, dia) => {
  if (!cal.dias.has(dia.getUTCDay()) || cal.ehFeriado(dia)) return null;
  return { abre: dia.getTime() + cal.inicio, fecha: dia.getTime() + cal.fim };
};

/**
 * Soma N minutos úteis a uma data.
 * Ex.: sexta 17h + 120 min (expediente 8h-18h, seg-sex) = segunda 09h.
 * @param {Date} inicio
 * @param {number} minutos
 * @param {Calendario} calendario
 * @returns {Date}
 */
const somaMinutosUteis = (inicio, minutos, calendario) => {
  const cal = preparaCalendario(calendario);
  if (cal.corrido || minutos <= 0)
    return new Date(inicio.getTime() + Math.max(minutos, 0) * MINUTO);

  let agora = inicio.getTime() + cal.fuso; // "horário local" em ms
  let restante = minutos * MINUTO;

  for (let i = 0; i < MAXIMO_DE_DIAS; i += 1) {
    const dia = inicioDoDia(new Date(agora));
    const janela = janelaDoDia(cal, dia);
    if (janela) {
      const de = Math.max(agora, janela.abre);
      if (de < janela.fecha) {
        const disponivel = janela.fecha - de;
        if (restante <= disponivel) return new Date(de + restante - cal.fuso);
        restante -= disponivel;
      }
    }
    agora = dia.getTime() + DIA;
  }
  throw new Error('Não foi possível calcular o prazo: expediente sem dias úteis');
};

/**
 * Minutos úteis entre duas datas (0 se fim <= início).
 * @param {Date} inicio
 * @param {Date} fim
 * @param {Calendario} calendario
 * @returns {number}
 */
const minutosUteisEntre = (inicio, fim, calendario) => {
  if (fim <= inicio) return 0;
  const cal = preparaCalendario(calendario);
  if (cal.corrido) return Math.round((fim - inicio) / MINUTO);

  const de = inicio.getTime() + cal.fuso;
  const ate = fim.getTime() + cal.fuso;
  let total = 0;

  for (let dia = inicioDoDia(new Date(de)).getTime(); dia < ate; dia += DIA) {
    const janela = janelaDoDia(cal, new Date(dia));
    if (!janela) continue;
    const sobreposicao = Math.min(ate, janela.fecha) - Math.max(de, janela.abre);
    if (sobreposicao > 0) total += sobreposicao;
  }
  return Math.round(total / MINUTO);
};

module.exports = { somaMinutosUteis, minutosUteisEntre };
