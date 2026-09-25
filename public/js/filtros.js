// Barra de filtros compartilhada entre a Lista e o Quadro de chamados.
// Mantém os filtros na URL (?status=novo,pendente&responsavel=eu...) para
// que a visão possa ser recarregada, favoritada e compartilhada.
/* exported Filtros */
var Filtros = (function () {
  var CHAVES = [
    'status',
    'prioridade',
    'sla',
    'equipe',
    'servico',
    'responsavel',
    'empresa',
    'tag',
    'busca',
    'ordenar',
    'parado',
  ];
  var SITUACOES_SLA = { vencido: 'SLA vencido', sem_resposta: '1ª resposta atrasada' };

  function daUrl() {
    var p = new URLSearchParams(window.location.search);
    var f = {};
    CHAVES.forEach(function (k) {
      var v = p.get(k);
      if (!v) return;
      f[k] = k === 'status' || k === 'prioridade' || k === 'sla' ? v.split(',') : v;
    });
    return f;
  }

  function paraUrl(f) {
    var p = new URLSearchParams();
    CHAVES.forEach(function (k) {
      var v = f[k];
      if (v && (!Array.isArray(v) || v.length)) p.set(k, Array.isArray(v) ? v.join(',') : v);
    });
    var s = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : ''));
  }

  function chips(nome, rotulos, selecionados) {
    return Object.keys(rotulos)
      .map(function (valor) {
        var ativo = (selecionados || []).indexOf(valor) !== -1;
        return (
          '<button type="button" class="chip" data-chip="' +
          nome +
          '" data-valor="' +
          valor +
          '" aria-pressed="' +
          ativo +
          '">' +
          Ui.esc(rotulos[valor]) +
          '</button>'
        );
      })
      .join('');
  }

  /**
   * @param {HTMLElement} el  container da barra
   * @param {{ comStatus?: boolean, comOrdenacao?: boolean, semBusca?: boolean, aoMudar: (filtros: object) => void }} opcoes
   *   semBusca: a tela tem a própria busca (a lista de chamados)
   */
  async function monta(el, opcoes) {
    var f = daUrl();

    el.innerHTML =
      (opcoes.comStatus
        ? '<div class="grupo"><span>Status</span><div class="chips">' +
          chips('status', HD.rotulosStatus, f.status) +
          '</div></div>'
        : '') +
      '<div class="grupo"><span>Prioridade</span><div class="chips">' +
      chips('prioridade', HD.rotulosPrioridade, f.prioridade) +
      '</div></div>' +
      '<div class="grupo"><span>Prazo</span><div class="chips">' +
      chips('sla', SITUACOES_SLA, f.sla) +
      '</div></div>' +
      '<div class="grupo"><span>Equipe</span><select name="equipe" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Serviço</span><select name="servico" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Responsável</span><select name="responsavel" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Empresa</span><select name="empresa" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Tag</span><select name="tag" disabled><option>Carregando...</option></select></div>' +
      (opcoes.comOrdenacao
        ? '<div class="grupo"><span>Ordenar por</span><select name="ordenar">' +
          Ui.opcoes(
            [
              { valor: 'atualizacao', rotulo: 'Última atualização' },
              { valor: 'prioridade', rotulo: 'Prioridade' },
              { valor: 'recentes', rotulo: 'Mais recentes' },
              { valor: 'antigos', rotulo: 'Mais antigos' },
            ],
            f.ordenar || 'atualizacao',
          ) +
          '</select></div>'
        : '') +
      (opcoes.semBusca
        ? ''
        : '<div class="grupo busca"><span>Buscar</span><input name="busca" type="search" placeholder="#1024 ou trecho do título" value="' +
          Ui.esc(f.busca || '') +
          '" /></div>') +
      '<div class="grupo"><span>&nbsp;</span><button type="button" class="botao" data-limpar>Limpar</button></div>';

    function dispara() {
      paraUrl(f);
      opcoes.aoMudar(Object.assign({}, f));
    }

    el.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (chip) {
        var nome = chip.getAttribute('data-chip');
        var valor = chip.getAttribute('data-valor');
        var lista = f[nome] || [];
        var ativo = lista.indexOf(valor) !== -1;
        f[nome] = ativo
          ? lista.filter(function (v) {
              return v !== valor;
            })
          : lista.concat(valor);
        chip.setAttribute('aria-pressed', String(!ativo));
        dispara();
      }
      if (e.target.closest('[data-limpar]')) {
        // a busca da própria tela (semBusca) continua valendo
        f = opcoes.semBusca && f.busca ? { busca: f.busca } : {};
        el.querySelectorAll('[data-chip]').forEach(function (c) {
          c.setAttribute('aria-pressed', 'false');
        });
        el.querySelectorAll('select').forEach(function (s) {
          s.value = s.name === 'ordenar' ? 'atualizacao' : '';
        });
        var campoBusca = el.querySelector('[name="busca"]');
        if (campoBusca) campoBusca.value = '';
        dispara();
      }
    });

    el.querySelectorAll('select').forEach(function (s) {
      s.addEventListener('change', function () {
        f[s.name] = s.value || undefined;
        dispara();
      });
    });

    if (!opcoes.semBusca) {
      el.querySelector('[name="busca"]').addEventListener(
        'input',
        Ui.debounce(function (e) {
          f.busca = e.target.value.trim() || undefined;
          dispara();
        }, 350),
      );
    }

    function preenche(nome, opcoes, rotuloVazio) {
      var select = el.querySelector('[name="' + nome + '"]');
      select.innerHTML = Ui.opcoes(opcoes, f[nome], rotuloVazio);
      select.disabled = false;
    }

    // opções dependentes da API
    try {
      var usuario = Api.usuario();
      var r = await Promise.all([
        Api.get('/usuarios', { papel: 'agente,admin', ativo: 'true' }),
        Api.get('/equipes'),
        Api.get('/servicos', usuario.papel === 'admin' ? { todos: 'true' } : null),
        Api.get('/empresas'),
        Api.get('/tags'),
        Api.eu(),
      ]);
      // só o admin vê (e filtra) todas as equipes
      var veTodas = r[5].papel === 'admin';

      // agente só enxerga a fila das equipes dele
      var equipes = r[1].equipes.filter(function (e) {
        return (
          veTodas ||
          e.membros.some(function (m) {
            return m._id === usuario._id;
          })
        );
      });
      preenche(
        'equipe',
        [{ valor: 'minhas', rotulo: 'Minhas equipes' }].concat(
          equipes.map(function (e) {
            return { valor: e._id, rotulo: e.nome };
          }),
        ),
        'Todas',
      );

      var idsEquipes = equipes.map(function (e) {
        return e._id;
      });
      preenche(
        'servico',
        r[2].servicos
          .filter(function (s) {
            return veTodas || (s.equipe && idsEquipes.indexOf(s.equipe._id) !== -1);
          })
          .map(function (s) {
            return { valor: s._id, rotulo: s.nome };
          }),
        'Todos',
      );

      preenche(
        'responsavel',
        [
          { valor: 'eu', rotulo: 'Meus chamados' },
          { valor: 'nenhum', rotulo: 'Sem responsável' },
        ].concat(
          r[0].usuarios.map(function (u) {
            return { valor: u._id, rotulo: u.nome };
          }),
        ),
        'Todos',
      );

      preenche(
        'empresa',
        r[3].empresas.map(function (e) {
          return { valor: e._id, rotulo: e.nome };
        }),
        'Todas',
      );
      preenche(
        'tag',
        r[4].tags.map(function (t) {
          return { valor: t._id, rotulo: t.nome };
        }),
        'Todas',
      );
    } catch (e) {
      Ui.toast('Falha ao carregar filtros: ' + e.message, 'erro');
    }

    return f;
  }

  return { monta: monta, daUrl: daUrl, paraUrl: paraUrl };
})();
