// Números de WhatsApp: guardados só com dígitos, com DDI e DDD (ex.: 5511987654321).

/**
 * Normaliza o que foi digitado ("(11) 98765-4321", "+55 11 98765-4321"...).
 * Sem DDI (10 ou 11 dígitos) assume o Brasil (55).
 * @returns {string | null} null se vazio; lança se inválido
 */
const normalizaNumero = (valor) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  const completo = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (completo.length < 10 || completo.length > 15) {
    const erro = new Error('WhatsApp inválido: informe DDI + DDD + número');
    erro.invalido = true;
    throw erro;
  }
  return completo;
};

/**
 * Formas equivalentes do mesmo número. No Brasil a Meta às vezes identifica o celular
 * sem o nono dígito (55 11 8765-4321 no lugar de 55 11 98765-4321), então procuramos os dois.
 * Só vale para celular (os antigos números de 8 dígitos começavam com 6 a 9), para não
 * confundir com um telefone fixo.
 * @param {string} numero  só dígitos
 */
const variantesDoNumero = (numero) => {
  const n = String(numero);
  if (n.startsWith('55') && n.length === 13 && n[4] === '9' && /[6-9]/.test(n[5])) {
    return [n, n.slice(0, 4) + n.slice(5)];
  }
  if (n.startsWith('55') && n.length === 12 && /[6-9]/.test(n[4])) {
    return [n, `${n.slice(0, 4)}9${n.slice(4)}`];
  }
  return [n];
};

/** "5511987654321" -> "+55 11 98765-4321" (só para exibição). */
const formataNumero = (numero) => {
  const n = String(numero || '');
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
  return br ? `+55 ${br[1]} ${br[2]}-${br[3]}` : n ? `+${n}` : '';
};

module.exports = { normalizaNumero, variantesDoNumero, formataNumero };
