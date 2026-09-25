// Sino da barra do topo (equipe): chamados novos ou transferidos para as equipes do agente.
// Consulta a API a cada 30s com a aba visível; o que chegar de novo vira aviso na tela
// e, se a pessoa permitir, notificação da área de trabalho.
/* exported Notificacoes */
var Notificacoes = (function () {
  var INTERVALO = 30000;
  var SINO =
    '<svg class="icone" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';

  var estado = {
    iniciado: false,
    conhecidas: null, // ids já vistos (null = primeira carga, não alerta o que já existia)
    naoLidas: 0,
    itens: [],
    timer: null,
  };
  var PREFIXO = /^\(\d+\+?\) /;
  var el = {};

  function suportaDesktop() {
    return 'Notification' in window;
  }

  function desenhaContador() {
    var n = estado.naoLidas;
    el.contador.hidden = !n;
    el.contador.textContent = n > 99 ? '99+' : String(n);
    el.botao.setAttribute(
      'aria-label',
      n ? 'Notificações: ' + n + ' não lida' + (n > 1 ? 's' : '') : 'Notificações',
    );
    desenhaTitulo();
  }

  // "(3) Título" na aba do navegador
  function desenhaTitulo() {
    var n = estado.naoLidas;
    var titulo = (n ? '(' + (n > 99 ? '99+' : n) + ') ' : '') + document.title.replace(PREFIXO, '');
    if (document.title !== titulo) document.title = titulo;
  }

  function desenhaLista() {
    el.todas.disabled = !estado.naoLidas;
    if (!estado.itens.length) {
      el.lista.innerHTML =
        '<p class="vazio-sino">Nenhuma notificação por aqui.<br />Avisamos quando chegar chamado para a sua equipe.</p>';
    } else {
      el.lista.innerHTML = estado.itens
        .map(function (n) {
          return (
            '<a class="item-sino' +
            (n.lida ? '' : ' nao-lida') +
            '" href="/chamados/' +
            n.numero +
            '" data-notificacao="' +
            n._id +
            '"><span class="marca-sino" aria-hidden="true"></span><span class="texto-sino"><strong>' +
            Ui.esc(n.titulo) +
            '</strong>' +
            (n.mensagem ? '<span>' + Ui.esc(n.mensagem) + '</span>' : '') +
            '<time datetime="' +
            n.createdAt +
            '">' +
            Ui.relativo(n.createdAt) +
            '</time></span></a>'
          );
        })
        .join('');
    }
    if (!suportaDesktop() || Notification.permission === 'granted') {
      el.desktop.hidden = true;
    } else {
      el.desktop.hidden = false;
      el.desktop.disabled = Notification.permission === 'denied';
      el.desktop.textContent =
        Notification.permission === 'denied'
          ? 'Notificações da área de trabalho bloqueadas no navegador'
          : 'Ativar notificações na área de trabalho';
    }
  }

  function alerta(novas) {
    if (!novas.length) return;
    var desktop = suportaDesktop() && Notification.permission === 'granted';
    // com muitas de uma vez, um aviso só
    var lista =
      novas.length > 3
        ? [
            {
              titulo: novas.length + ' novas notificações',
              mensagem: 'Chamados novos ou transferidos para a sua equipe',
            },
          ]
        : novas;
    lista.forEach(function (n) {
      if (desktop && document.hidden) {
        try {
          var aviso = new Notification(n.titulo, {
            body: n.mensagem || '',
            tag: 'helpdesk-' + (n._id || 'varias'),
          });
          aviso.onclick = function () {
            window.focus();
            if (n.numero) window.location.href = '/chamados/' + n.numero;
            aviso.close();
          };
        } catch (_e) {
          Ui.toast(n.titulo);
        }
      } else {
        Ui.toast(n.titulo);
      }
    });
  }

  async function atualiza() {
    try {
      var r = await Api.get('/notificacoes', { limite: 20 });
      var novas = [];
      if (estado.conhecidas) {
        novas = r.notificacoes.filter(function (n) {
          return !n.lida && !estado.conhecidas[n._id];
        });
      } else {
        estado.conhecidas = {};
      }
      r.notificacoes.forEach(function (n) {
        estado.conhecidas[n._id] = true;
      });
      estado.itens = r.notificacoes;
      estado.naoLidas = r.naoLidas;
      desenhaContador();
      desenhaLista();
      alerta(novas);
    } catch (_e) {
      /* sem conexão: tenta de novo no próximo ciclo */
    }
  }

  function agenda() {
    clearInterval(estado.timer);
    estado.timer = setInterval(function () {
      if (!document.hidden) atualiza();
    }, INTERVALO);
  }

  function abre(aberto) {
    el.painel.hidden = !aberto;
    el.botao.setAttribute('aria-expanded', String(aberto));
    if (aberto) atualiza();
  }

  function aplicaResposta(r) {
    if (r && typeof r.naoLidas === 'number') {
      estado.naoLidas = r.naoLidas;
      desenhaContador();
    }
  }

  /** Monta o sino ao lado do usuário na barra do topo (uma vez por página). */
  function inicia() {
    var usuario = document.getElementById('navbar-usuario');
    if (estado.iniciado || !usuario) return;
    estado.iniciado = true;

    var raiz = document.createElement('div');
    raiz.className = 'sino';
    raiz.innerHTML =
      '<button type="button" class="botao-sino" aria-haspopup="true" aria-expanded="false" aria-controls="painel-sino" title="Notificações">' +
      SINO +
      '<span class="contador-sino" hidden></span></button>' +
      '<div class="painel-sino" id="painel-sino" role="region" aria-label="Notificações" hidden>' +
      '<header><strong>Notificações</strong><button type="button" class="link-sino" data-todas-lidas>Marcar todas como lidas</button></header>' +
      '<div class="lista-sino">' +
      Ui.carregando('Carregando...') +
      '</div>' +
      '<footer><button type="button" class="link-sino" data-desktop hidden></button></footer></div>';
    usuario.parentNode.insertBefore(raiz, usuario);

    el = {
      raiz: raiz,
      botao: raiz.querySelector('.botao-sino'),
      contador: raiz.querySelector('.contador-sino'),
      painel: raiz.querySelector('.painel-sino'),
      lista: raiz.querySelector('.lista-sino'),
      todas: raiz.querySelector('[data-todas-lidas]'),
      desktop: raiz.querySelector('[data-desktop]'),
    };

    el.botao.addEventListener('click', function () {
      abre(el.painel.hidden);
    });
    document.addEventListener('click', function (e) {
      if (!el.painel.hidden && !raiz.contains(e.target)) abre(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.painel.hidden) {
        abre(false);
        el.botao.focus();
      }
    });

    el.lista.addEventListener('click', function (e) {
      var item = e.target.closest('[data-notificacao]');
      if (!item || !item.classList.contains('nao-lida')) return;
      // marca como lida sem segurar a navegação
      Api.post('/notificacoes/' + item.getAttribute('data-notificacao') + '/lida').catch(
        function () {},
      );
    });

    el.todas.addEventListener('click', async function () {
      try {
        aplicaResposta(await Api.post('/notificacoes/lidas', {}));
        estado.itens.forEach(function (n) {
          n.lida = true;
        });
        desenhaLista();
      } catch (e) {
        Ui.toast(e.message, 'erro');
      }
    });

    el.desktop.addEventListener('click', function () {
      Promise.resolve(Notification.requestPermission()).then(function (p) {
        desenhaLista();
        if (p === 'granted')
          Ui.toast('Pronto! Avisaremos mesmo com a aba em segundo plano.', 'sucesso');
      });
    });

    // páginas que trocam o título depois de carregar (ex.: chamado) não perdem o contador
    var tagTitulo = document.querySelector('title');
    if (tagTitulo && window.MutationObserver) {
      new MutationObserver(desenhaTitulo).observe(tagTitulo, { childList: true });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) atualiza();
    });

    atualiza();
    agenda();
  }

  /** Ao abrir um chamado, as notificações dele deixam de contar como não lidas. */
  function lidasDoChamado(chamadoId) {
    if (!estado.iniciado || !chamadoId) return;
    var tem = estado.itens.some(function (n) {
      return !n.lida && n.chamado === chamadoId;
    });
    if (!tem && !estado.naoLidas) return;
    Api.post('/notificacoes/lidas', { chamado: chamadoId })
      .then(function (r) {
        estado.itens.forEach(function (n) {
          if (n.chamado === chamadoId) n.lida = true;
        });
        aplicaResposta(r);
        desenhaLista();
      })
      .catch(function () {});
  }

  return { inicia: inicia, atualiza: atualiza, lidasDoChamado: lidasDoChamado };
})();
