// Busca rápida de chamados na barra do topo (todas as telas).
// Número (#1024 ou 1024) abre direto; texto mostra os chamados que o usuário pode ver.
// Atalhos: "/" ou Ctrl+K focam a busca; setas escolhem; Enter abre; Esc fecha.
/* exported BuscaGlobal */
var BuscaGlobal = (function () {
  var MINIMO = 2;
  var LIMITE = 6;
  var LUPA =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  var el = {};
  var estado = { iniciado: false, itens: [], ativo: -1, pedido: 0, equipe: false };

  function numeroDigitado(termo) {
    var m = /^#?\s*(\d{1,9})$/.exec(termo);
    return m ? Number(m[1]) : null;
  }

  function fecha() {
    el.painel.hidden = true;
    el.campo.setAttribute('aria-expanded', 'false');
    estado.ativo = -1;
  }

  function abre() {
    el.painel.hidden = false;
    el.campo.setAttribute('aria-expanded', 'true');
  }

  function marcaAtivo(i) {
    var opcoes = el.painel.querySelectorAll('[data-indice]');
    if (!opcoes.length) return;
    estado.ativo = (i + opcoes.length) % opcoes.length;
    opcoes.forEach(function (o, j) {
      o.classList.toggle('ativo', j === estado.ativo);
      o.setAttribute('aria-selected', String(j === estado.ativo));
    });
    opcoes[estado.ativo].scrollIntoView({ block: 'nearest' });
  }

  // monta a lista de destinos (href) para o teclado e o mouse usarem a mesma lógica
  function desenha(termo, chamados, carregando) {
    var numero = numeroDigitado(termo);
    var itens = [];
    if (numero) {
      itens.push({
        href: '/chamados/' + numero,
        html:
          '<span class="icone-busca">#</span><span>Abrir o chamado <strong>#' +
          numero +
          '</strong></span>',
      });
    }
    chamados.forEach(function (c) {
      if (numero && c.numero === numero) return;
      itens.push({
        href: '/chamados/' + c.numero,
        html:
          '<span class="numero-busca">#' +
          c.numero +
          '</span><span class="texto-busca"><strong>' +
          Ui.esc(c.titulo) +
          '</strong><span>' +
          Ui.esc(c.solicitante ? c.solicitante.nome : '') +
          (c.equipe ? ' · ' + Ui.esc(c.equipe.nome) : '') +
          '</span></span>' +
          Ui.badgeStatus(c.status),
      });
    });
    if (estado.equipe && termo.length >= MINIMO && !numero) {
      itens.push({
        href: '/agente?busca=' + encodeURIComponent(termo),
        html:
          '<span class="icone-busca">' +
          LUPA +
          '</span><span>Ver todos os resultados na fila</span>',
        rodape: true,
      });
    }
    estado.itens = itens;
    estado.ativo = -1;

    var corpo = itens.length
      ? itens
          .map(function (it, i) {
            return (
              '<a class="opcao-busca' +
              (it.rodape ? ' rodape-busca' : '') +
              '" role="option" aria-selected="false" data-indice="' +
              i +
              '" href="' +
              it.href +
              '">' +
              it.html +
              '</a>'
            );
          })
          .join('')
      : '<p class="vazio-busca">' +
        (carregando ? 'Buscando...' : 'Nenhum chamado encontrado para "' + Ui.esc(termo) + '"') +
        '</p>';
    el.painel.innerHTML =
      corpo + (carregando && itens.length ? '<p class="vazio-busca">Buscando...</p>' : '');
    abre();
    if (itens.length) marcaAtivo(0);
  }

  var busca = Ui.debounce(async function (termo) {
    var meu = ++estado.pedido;
    try {
      var r = await Api.get('/chamados', { busca: termo, porPagina: LIMITE });
      if (meu !== estado.pedido || el.campo.value.trim() !== termo) return;
      desenha(termo, r.chamados, false);
    } catch (_e) {
      if (meu === estado.pedido) desenha(termo, [], false);
    }
  }, 250);

  function aoDigitar() {
    var termo = el.campo.value.trim();
    if (!termo || (termo.length < MINIMO && !numeroDigitado(termo))) {
      estado.pedido++;
      fecha();
      return;
    }
    desenha(termo, [], true);
    busca(termo);
  }

  /** Coloca a busca na barra do topo (uma vez por página). */
  function inicia(usuario) {
    var topo = document.querySelector('.barra-topo');
    var alvo = document.getElementById('navbar-usuario');
    if (estado.iniciado || !topo || !alvo) return;
    estado.iniciado = true;
    estado.equipe = Api.ehEquipe(usuario);

    var raiz = document.createElement('div');
    raiz.className = 'busca-topo';
    raiz.setAttribute('role', 'search');
    raiz.innerHTML =
      '<label class="campo-busca-topo">' +
      LUPA +
      '<input type="search" id="busca-topo" placeholder="Buscar chamado por nº ou assunto" autocomplete="off" aria-label="Buscar chamado" role="combobox" aria-autocomplete="list" aria-controls="resultados-busca-topo" aria-expanded="false" />' +
      '<kbd title="Atalho: / ou Ctrl+K">/</kbd></label>' +
      '<div class="painel-busca-topo" id="resultados-busca-topo" role="listbox" hidden></div>';
    // antes do sino e do usuário
    var sino = topo.querySelector('.sino');
    topo.insertBefore(raiz, sino || alvo);

    el = {
      raiz: raiz,
      campo: raiz.querySelector('input'),
      painel: raiz.querySelector('.painel-busca-topo'),
    };

    el.campo.addEventListener('input', aoDigitar);
    el.campo.addEventListener('focus', function () {
      if (el.campo.value.trim()) aoDigitar();
    });
    el.campo.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (el.painel.hidden) aoDigitar();
        else marcaAtivo(estado.ativo + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        marcaAtivo(estado.ativo - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var termo = el.campo.value.trim();
        var numero = numeroDigitado(termo);
        var escolhido = estado.itens[estado.ativo];
        if (numero) window.location.href = '/chamados/' + numero;
        else if (escolhido) window.location.href = escolhido.href;
        else if (estado.equipe && termo.length >= MINIMO) {
          window.location.href = '/agente?busca=' + encodeURIComponent(termo);
        }
      } else if (e.key === 'Escape') {
        fecha();
        el.campo.blur();
      }
    });
    el.painel.addEventListener('mousemove', function (e) {
      var o = e.target.closest('[data-indice]');
      if (o && Number(o.getAttribute('data-indice')) !== estado.ativo) {
        marcaAtivo(Number(o.getAttribute('data-indice')));
      }
    });
    document.addEventListener('click', function (e) {
      if (!raiz.contains(e.target)) fecha();
    });
    // "/" ou Ctrl+K em qualquer lugar (fora de campos de texto)
    document.addEventListener('keydown', function (e) {
      var digitando =
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (
        (e.key === '/' && !digitando) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
      ) {
        e.preventDefault();
        el.campo.focus();
        el.campo.select();
      }
    });
  }

  return { inicia: inicia };
})();
