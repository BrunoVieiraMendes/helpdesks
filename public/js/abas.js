// Abas das páginas abertas pela equipe (como no Movidesk): chamados e configurações
// visitados viram abas no topo; o "+" abre um novo chamado ou o painel de configurações.
// Ficam no navegador (localStorage), por usuário do computador.
/* exported Abas */
var Abas = (function () {
  var CHAVE = 'helpdesk.abas';
  var CHAVE_ANTIGA = 'helpdesk.config.abas'; // versão anterior: só configurações
  var MAXIMO = 12;

  var ICONES = {
    config:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    chamado:
      '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="12.5" width="4" height="6" rx="1.5"/><rect x="17" y="12.5" width="4" height="6" rx="1.5"/><path d="M19 18.5v.5a3 3 0 0 1-3 3h-2.5"/><rect x="10.5" y="20.8" width="3" height="2.4" rx="1.2"/>',
    mais: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  };

  function svg(nome) {
    return (
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONES[nome] || ICONES.config) + '</svg>'
    );
  }

  function le() {
    try {
      var abas = JSON.parse(localStorage.getItem(CHAVE) || 'null');
      if (Array.isArray(abas)) return abas;
      // migra as abas de configuração da versão anterior
      var antigas = JSON.parse(localStorage.getItem(CHAVE_ANTIGA) || '[]');
      return (Array.isArray(antigas) ? antigas : []).map(function (a) {
        return {
          chave: 'config:' + a.secao,
          titulo: a.titulo,
          href: '/admin/configuracoes#' + a.secao,
          icone: 'config',
        };
      });
    } catch (_e) {
      return [];
    }
  }

  function grava(abas) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(abas));
      localStorage.removeItem(CHAVE_ANTIGA);
    } catch (_e) {
      /* sem armazenamento: as abas valem só nesta página */
    }
  }

  var estado = { abas: le(), atual: null, admin: false };

  function desenha() {
    var nav = document.getElementById('abas');
    if (!nav) return;
    // a linha do topo fica azul quando a aba ativa é um chamado
    var ativa = estado.abas.filter(function (a) {
      return a.chave === estado.atual;
    })[0];
    nav.parentElement.classList.toggle('em-chamado', Boolean(ativa && ativa.icone === 'chamado'));
    nav.innerHTML =
      estado.abas
        .map(function (a) {
          var ativa = a.chave === estado.atual;
          return (
            '<div class="aba-topo aba-' +
            Ui.esc(a.icone) +
            (ativa ? ' ativa' : '') +
            '"><a href="' +
            Ui.esc(a.href) +
            '"' +
            (ativa ? ' aria-current="page"' : '') +
            ' title="' +
            Ui.esc(a.titulo) +
            '">' +
            svg(a.icone) +
            '<span>' +
            Ui.esc(a.titulo) +
            '</span></a><button type="button" class="fecha-aba" data-fecha-aba="' +
            Ui.esc(a.chave) +
            '" aria-label="Fechar ' +
            Ui.esc(a.titulo) +
            '" title="Fechar">×</button></div>'
          );
        })
        .join('') +
      '<div class="aba-mais-menu"><button type="button" class="aba-mais" id="aba-mais" aria-haspopup="true" aria-expanded="false" title="Nova aba" aria-label="Nova aba">' +
      svg('mais') +
      '</button><div class="menu-lote" id="menu-aba-mais" role="menu" hidden>' +
      '<a role="menuitem" href="/chamados/novo">Novo chamado</a>' +
      '<a role="menuitem" href="/agente">Fila de chamados</a>' +
      (estado.admin ? '<a role="menuitem" href="/admin">Todas as configurações</a>' : '') +
      '</div></div>';
  }

  document.addEventListener('click', function (e) {
    var menu = document.getElementById('menu-aba-mais');
    var mais = e.target.closest('#aba-mais');
    if (mais && menu) {
      menu.hidden = !menu.hidden;
      mais.setAttribute('aria-expanded', String(!menu.hidden));
      return;
    }
    if (menu && !menu.hidden && !e.target.closest('.aba-mais-menu')) menu.hidden = true;

    var fecha = e.target.closest('[data-fecha-aba]');
    if (!fecha) return;
    e.preventDefault();
    var chave = fecha.getAttribute('data-fecha-aba');
    var indice = estado.abas.findIndex(function (a) {
      return a.chave === chave;
    });
    estado.abas = estado.abas.filter(function (a) {
      return a.chave !== chave;
    });
    grava(estado.abas);

    // fechou a aba desta página: vai para a vizinha (ou para a fila)
    if (chave === estado.atual) {
      var vizinha = estado.abas[Math.min(indice, estado.abas.length - 1)];
      window.location.href = vizinha ? vizinha.href : '/agente';
      return;
    }
    desenha();
  });

  return {
    /**
     * Desenha as abas; com `aba`, marca esta página como aberta (cria a aba se preciso).
     * @param {{ chave: string, titulo: string, href: string, icone: 'config'|'chamado' } | null} aba
     * @param {{ admin?: boolean }} [opcoes]
     */
    abre: function (aba, opcoes) {
      estado.abas = le();
      if (opcoes && opcoes.admin !== undefined) estado.admin = opcoes.admin;
      estado.atual = aba ? aba.chave : null;
      if (aba) {
        var existente = estado.abas.filter(function (a) {
          return a.chave === aba.chave;
        })[0];
        if (existente) Object.assign(existente, aba);
        else estado.abas.push(aba);
        if (estado.abas.length > MAXIMO) estado.abas = estado.abas.slice(-MAXIMO);
        grava(estado.abas);
      }
      desenha();
    },
  };
})();
