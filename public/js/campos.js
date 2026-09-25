// Campos adicionais nas telas do chamado (abertura e detalhe).
// A regra de exibição é a mesma de services/campos-adicionais.js (a API valida de novo).
/* exported CamposAdicionais */
var CamposAdicionais = (function () {
  function idDe(x) {
    return x && typeof x === 'object' ? String(x._id) : String(x || '');
  }

  function vazio(v) {
    return v === null || v === undefined || v === '';
  }

  // condições vazias valem para qualquer valor
  function regraCasa(regra, ctx) {
    if (
      regra.servicos.length &&
      !regra.servicos.some(function (id) {
        return idDe(id) === idDe(ctx.servico);
      })
    ) {
      return false;
    }
    if (
      regra.categorias.length &&
      !regra.categorias.some(function (id) {
        return idDe(id) === idDe(ctx.categoria);
      })
    ) {
      return false;
    }
    var cond = regra.condicaoCampo;
    if (cond && cond.campo) {
      var valor = (ctx.valores || {})[idDe(cond.campo)];
      if (vazio(valor) || cond.valores.indexOf(String(valor)) === -1) return false;
    }
    return true;
  }

  /**
   * Campos que aparecem, com a obrigatoriedade final.
   * @param {{ campos: any[], regras: any[] }} defs
   * @param {{ servico?: any, categoria?: any, valores?: Record<string, any> }} ctx
   * @returns {{ campo: any, obrigatorio: boolean }[]}
   */
  function visiveis(defs, ctx) {
    var citados = {};
    defs.regras.forEach(function (r) {
      r.campos.forEach(function (c) {
        citados[idDe(c)] = true;
      });
    });
    return defs.campos
      .map(function (campo) {
        var id = idDe(campo);
        if (!citados[id]) return { campo: campo, obrigatorio: campo.obrigatorio };
        var casadas = defs.regras.filter(function (r) {
          return (
            r.campos.some(function (c) {
              return idDe(c) === id;
            }) && regraCasa(r, ctx)
          );
        });
        if (!casadas.length) return null;
        return {
          campo: campo,
          obrigatorio:
            campo.obrigatorio ||
            casadas.some(function (r) {
              return r.tornarObrigatorios;
            }),
        };
      })
      .filter(Boolean);
  }

  // pessoas que podem ser escolhidas no campo ("agente" inclui admins)
  function pessoasDoCampo(campo, pessoas) {
    var tipos = campo.pessoasDe || [];
    return (pessoas || []).filter(function (p) {
      if (!tipos.length) return true;
      var tipo = p.papel === 'admin' ? 'agente' : p.papel;
      return tipos.indexOf(tipo) !== -1;
    });
  }

  /**
   * HTML de um campo (rótulo + controle). O nome camposAdicionais.<id> casa com os erros da API.
   * @param {{ campo: any, obrigatorio: boolean }} item
   * @param {any} valor
   * @param {{ pessoas?: any[], desabilitado?: boolean, prefixo?: string }} [opcoes]
   */
  function html(item, valor, opcoes) {
    opcoes = opcoes || {};
    var campo = item.campo;
    var id = idDe(campo);
    var domId = (opcoes.prefixo || 'ca') + '-' + id;
    var atributos =
      ' id="' +
      domId +
      '" name="camposAdicionais.' +
      id +
      '" data-campo-adicional="' +
      id +
      '" data-tipo-campo="' +
      campo.tipo +
      '"' +
      (item.obrigatorio ? ' required' : '') +
      (opcoes.desabilitado ? ' disabled' : '');
    var v = vazio(valor) ? '' : valor;
    var controle;

    if (campo.tipo === 'textoLongo') {
      controle = '<textarea rows="3"' + atributos + '>' + Ui.esc(v) + '</textarea>';
    } else if (campo.tipo === 'lista') {
      controle =
        '<select' +
        atributos +
        '>' +
        Ui.opcoes(
          campo.opcoes.map(function (o) {
            return { valor: o, rotulo: o };
          }),
          v,
          'Selecione...',
        ) +
        '</select>';
    } else if (campo.tipo === 'simNao') {
      controle =
        '<select' +
        atributos +
        '>' +
        Ui.opcoes(
          [
            { valor: 'true', rotulo: 'Sim' },
            { valor: 'false', rotulo: 'Não' },
          ],
          v === '' ? '' : String(v),
          'Selecione...',
        ) +
        '</select>';
    } else if (campo.tipo === 'pessoa') {
      controle =
        '<select' +
        atributos +
        '>' +
        Ui.opcoes(
          pessoasDoCampo(campo, opcoes.pessoas).map(function (p) {
            return { valor: p._id, rotulo: p.nome };
          }),
          v,
          'Selecione...',
        ) +
        '</select>';
    } else {
      var tipoInput = { numero: 'number', data: 'date' }[campo.tipo] || 'text';
      controle =
        '<input type="' +
        tipoInput +
        '"' +
        (tipoInput === 'number' ? ' step="any"' : '') +
        atributos +
        ' value="' +
        Ui.esc(v) +
        '" />';
    }

    return (
      '<div class="campo campo-adicional" data-campo="camposAdicionais.' +
      id +
      '"><label for="' +
      domId +
      '">' +
      Ui.esc(campo.nome) +
      (item.obrigatorio
        ? ' <span class="marca-obrigatorio" aria-label="obrigatório">*</span>'
        : '') +
      '</label>' +
      controle +
      (campo.ajuda ? '<span class="ajuda">' + Ui.esc(campo.ajuda) + '</span>' : '') +
      '</div>'
    );
  }

  /**
   * Valores dos controles de um container: _id do campo -> valor ('' = vazio).
   * @param {HTMLElement} container
   */
  function le(container) {
    var valores = {};
    container.querySelectorAll('[data-campo-adicional]').forEach(function (el) {
      var id = el.getAttribute('data-campo-adicional');
      valores[id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return valores;
  }

  /**
   * Valor legível (detalhe do chamado, somente leitura).
   * @param {any} campo
   * @param {any} valor
   * @param {Record<string, string>} [nomes]  nomes das pessoas escolhidas
   */
  function texto(campo, valor, nomes) {
    if (vazio(valor)) return '—';
    if (campo.tipo === 'simNao') return valor ? 'Sim' : 'Não';
    if (campo.tipo === 'data') return String(valor).split('-').reverse().join('/');
    if (campo.tipo === 'pessoa') return (nomes && nomes[String(valor)]) || '—';
    return String(valor);
  }

  return { visiveis: visiveis, html: html, le: le, texto: texto, pessoasDoCampo: pessoasDoCampo };
})();
