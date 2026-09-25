// Helpers de interface compartilhados pelas páginas.
/* exported Ui */
var Ui = (function () {
  var PAPEIS = { cliente: 'Cliente', agente: 'Agente', admin: 'Admin' };

  function esc(valor) {
    return String(valor === undefined || valor === null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(seletor, raiz) {
    return (raiz || document).querySelector(seletor);
  }

  var fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  var rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

  function data(iso) {
    return iso ? fmtData.format(new Date(iso)) : '—';
  }

  function relativo(iso) {
    if (!iso) return '—';
    var seg = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    var abs = Math.abs(seg);
    if (abs < 60) return 'agora';
    if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
    if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), 'day');
    return data(iso);
  }

  function duracao(inicioIso, fimIso) {
    if (!inicioIso || !fimIso) return '—';
    var min = Math.max(Math.round((new Date(fimIso) - new Date(inicioIso)) / 60000), 0);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    if (h < 48) return h + 'h ' + (min % 60) + 'min';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  function badgeStatus(status) {
    return (
      '<span class="badge status-' + esc(status) + '">' + esc(HD.rotulosStatus[status]) + '</span>'
    );
  }

  function prioridade(p) {
    return (
      '<span class="prioridade prioridade-' +
      esc(p) +
      '">' +
      esc(HD.rotulosPrioridade[p]) +
      '</span>'
    );
  }

  function iniciais(nome) {
    if (!nome) return '?';
    var partes = String(nome).trim().split(/\s+/);
    return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  function avatar(pessoa) {
    return pessoa
      ? '<span class="avatar" title="' +
          esc(pessoa.nome) +
          '">' +
          esc(iniciais(pessoa.nome)) +
          '</span>'
      : '<span class="avatar vazio" title="Sem responsável">—</span>';
  }

  // cor vem do cadastro do serviço; só aceita #RRGGBB para não injetar CSS
  function corSegura(cor) {
    return /^#[0-9a-fA-F]{6}$/.test(cor || '') ? cor : '#2458d6';
  }

  /** Ícone (iniciais na cor do serviço) + nome. */
  function servico(s) {
    if (!s) return '<span class="suave">—</span>';
    return (
      '<span class="servico-cel"><span class="icone-servico" style="--cor-servico:' +
      corSegura(s.cor) +
      '">' +
      esc(iniciais(s.nome)) +
      '</span>' +
      esc(s.nome) +
      '</span>'
    );
  }

  function equipe(e) {
    return e ? '<span class="tag">' + esc(e.nome) + '</span>' : '<span class="suave">—</span>';
  }

  /** Tag do chamado na cor cadastrada. */
  function tag(t) {
    if (!t) return '';
    return (
      '<span class="tag-cor" style="--cor-tag:' + corSegura(t.cor) + '">' + esc(t.nome) + '</span>'
    );
  }

  function tags(lista) {
    return (lista || []).map(tag).join('');
  }

  /**
   * Situação do prazo de solução.
   * @returns {{ classe: string, rotulo: string, titulo: string } | null}
   */
  function situacaoSla(c) {
    var s = c.sla || {};
    if (!s.prazoSolucao) return null;
    var prazo = new Date(s.prazoSolucao).getTime();
    var titulo = 'Prazo de solução: ' + data(s.prazoSolucao);

    if (s.resolvidoEm) {
      return new Date(s.resolvidoEm).getTime() <= prazo
        ? { classe: 'cumprido', rotulo: 'SLA cumprido', titulo: titulo }
        : { classe: 'violado', rotulo: 'SLA estourado', titulo: titulo };
    }
    if (s.pausadoEm) {
      return { classe: 'pausado', rotulo: 'SLA pausado', titulo: titulo + ' (relógio parado)' };
    }
    var agora = Date.now();
    if (agora > prazo) {
      return { classe: 'vencido', rotulo: 'Venceu ' + relativo(s.prazoSolucao), titulo: titulo };
    }
    var total = prazo - new Date(c.createdAt).getTime();
    var restante = total > 0 ? ((prazo - agora) / total) * 100 : 100;
    return {
      classe: restante <= HD.percentualSlaEmRisco ? 'risco' : 'ok',
      rotulo: 'Vence ' + relativo(s.prazoSolucao),
      titulo: titulo,
    };
  }

  function sla(c) {
    var s = situacaoSla(c);
    if (!s) return '<span class="suave">—</span>';
    return (
      '<span class="sla-badge sla-' +
      s.classe +
      '" title="' +
      esc(s.titulo) +
      '">' +
      esc(s.rotulo) +
      '</span>'
    );
  }

  function estrelas(nota) {
    var n = Math.max(0, Math.min(5, Number(nota) || 0));
    return (
      '<span class="estrelas" aria-label="' +
      n +
      ' de 5 estrelas">' +
      '★★★★★'.slice(0, n) +
      '<span class="apagadas">' +
      '★★★★★'.slice(n) +
      '</span></span>'
    );
  }

  /**
   * Pergunta com uma lista de opções num diálogo (ex.: justificativa ao mudar o status).
   * Resolve com o valor escolhido ou null se o usuário cancelar.
   * @param {{ titulo: string, texto?: string, rotulo: string, opcoes: { valor: string, rotulo: string }[], confirmar?: string }} cfg
   * @returns {Promise<string|null>}
   */
  function escolhe(cfg) {
    return new Promise(function (resolve) {
      var dialogo = document.createElement('dialog');
      dialogo.className = 'modal';
      dialogo.innerHTML =
        '<form method="dialog"><h2>' +
        esc(cfg.titulo) +
        '</h2>' +
        (cfg.texto ? '<p class="suave" style="margin-top:-8px">' + esc(cfg.texto) + '</p>' : '') +
        '<div class="campo"><label for="escolha-valor">' +
        esc(cfg.rotulo) +
        '</label><select id="escolha-valor" required>' +
        opcoes(cfg.opcoes, '', 'Selecione...') +
        '</select></div>' +
        '<div class="acoes-form"><button class="botao" type="button" data-cancelar>Cancelar</button>' +
        '<button class="botao primario" type="submit">' +
        esc(cfg.confirmar || 'Confirmar') +
        '</button></div></form>';
      document.body.appendChild(dialogo);

      var select = dialogo.querySelector('select');
      var encerrado = false;
      // resolve na hora da ação (o evento "close" do <dialog> pode chegar atrasado)
      function encerra(valor) {
        if (encerrado) return;
        encerrado = true;
        if (dialogo.open) dialogo.close();
        dialogo.remove();
        resolve(valor);
      }
      dialogo.querySelector('[data-cancelar]').addEventListener('click', function () {
        encerra(null);
      });
      dialogo.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (!select.value) {
          select.focus();
          return;
        }
        encerra(select.value);
      });
      // Esc ou fechamento por outro meio
      dialogo.addEventListener('close', function () {
        encerra(null);
      });
      dialogo.showModal();
      select.focus();
    });
  }

  /**
   * Pede a resposta ao cliente para resolver/fechar (e a justificativa, se o status tiver).
   * O botão só libera com a resposta preenchida. Resolve { resposta, justificativa } ou null.
   * @param {{ titulo: string, texto?: string, confirmar?: string, justificativas?: { valor: string, rotulo: string }[] }} cfg
   */
  function pedeResposta(cfg) {
    return new Promise(function (resolve) {
      var motivos = cfg.justificativas || [];
      var dialogo = document.createElement('dialog');
      dialogo.className = 'modal modal-resposta';
      dialogo.innerHTML =
        '<form method="dialog" novalidate><h2>' +
        esc(cfg.titulo) +
        '</h2>' +
        (cfg.texto ? '<p class="suave" style="margin-top:-8px">' + esc(cfg.texto) + '</p>' : '') +
        '<div class="campo"><label for="resposta-cliente">Resposta ao cliente <span class="obrigatorio">*</span></label>' +
        '<textarea id="resposta-cliente" rows="6" maxlength="20000" placeholder="Explique a solução para o cliente..."></textarea>' +
        '<span class="ajuda">Publicada no chamado e enviada por e-mail ao cliente.</span></div>' +
        (motivos.length
          ? '<div class="campo"><label for="resposta-justificativa">Justificativa</label><select id="resposta-justificativa">' +
            opcoes(motivos, '', 'Selecione...') +
            '</select></div>'
          : '') +
        '<div class="acoes-form"><button class="botao" type="button" data-cancelar>Cancelar</button>' +
        '<button class="botao primario" type="submit" disabled>' +
        esc(cfg.confirmar || 'Responder e resolver') +
        '</button></div></form>';
      document.body.appendChild(dialogo);

      var texto = dialogo.querySelector('textarea');
      var select = dialogo.querySelector('select');
      var botao = dialogo.querySelector('[type=submit]');
      var encerrado = false;
      function atualiza() {
        botao.disabled = !texto.value.trim() || Boolean(select && !select.value);
      }
      function encerra(valor) {
        if (encerrado) return;
        encerrado = true;
        if (dialogo.open) dialogo.close();
        dialogo.remove();
        resolve(valor);
      }
      texto.addEventListener('input', atualiza);
      if (select) select.addEventListener('change', atualiza);
      texto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !botao.disabled) {
          dialogo.querySelector('form').requestSubmit();
        }
      });
      dialogo.querySelector('[data-cancelar]').addEventListener('click', function () {
        encerra(null);
      });
      dialogo.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (botao.disabled) return;
        encerra({ resposta: texto.value.trim(), justificativa: select ? select.value : undefined });
      });
      dialogo.addEventListener('close', function () {
        encerra(null);
      });
      dialogo.showModal();
      texto.focus();
    });
  }

  /** Resolver, ou fechar um chamado ainda não resolvido, exige resposta ao cliente. */
  function exigeResposta(de, para) {
    return para === 'resolvido' || (para === 'fechado' && de !== 'resolvido');
  }

  function carregando(texto) {
    return (
      '<div class="estado"><div class="spinner"></div><span>' +
      esc(texto || 'Carregando...') +
      '</span></div>'
    );
  }

  function vazio(titulo, texto) {
    return (
      '<div class="estado"><strong>' +
      esc(titulo) +
      '</strong><span>' +
      esc(texto || '') +
      '</span></div>'
    );
  }

  function erro(mensagem, idBotao) {
    return (
      '<div class="estado erro"><strong>Não foi possível carregar</strong><span>' +
      esc(mensagem) +
      '</span>' +
      (idBotao
        ? '<button class="botao pequeno" id="' + esc(idBotao) + '">Tentar novamente</button>'
        : '') +
      '</div>'
    );
  }

  function toast(mensagem, tipo) {
    var area = $('.toasts');
    if (!area) {
      area = document.createElement('div');
      area.className = 'toasts';
      area.setAttribute('role', 'status');
      document.body.appendChild(area);
    }
    var el = document.createElement('div');
    el.className = 'toast ' + (tipo || '');
    el.textContent = mensagem;
    area.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 4200);
  }

  /** Coloca um botão em estado de carregamento; devolve função para restaurar. */
  function ocupado(botao, texto) {
    var original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="spinner"></span>' + esc(texto || 'Salvando...');
    return function () {
      botao.disabled = false;
      botao.innerHTML = original;
    };
  }

  /** Mostra erros por campo (detalhes da API 422) dentro de um formulário. */
  function errosDeCampo(form, detalhes) {
    form.querySelectorAll('.campo').forEach(function (c) {
      c.classList.remove('invalido');
      var e = c.querySelector('.erro-campo');
      if (e) e.remove();
    });
    Object.keys(detalhes || {}).forEach(function (nome) {
      var input = form.querySelector('[name="' + nome + '"]');
      var campo = input && input.closest('.campo');
      if (!campo) return;
      campo.classList.add('invalido');
      var msg = document.createElement('span');
      msg.className = 'erro-campo';
      msg.textContent = detalhes[nome];
      campo.appendChild(msg);
    });
  }

  function opcoes(lista, selecionado, rotuloVazio) {
    var html =
      rotuloVazio !== undefined ? '<option value="">' + esc(rotuloVazio) + '</option>' : '';
    return (
      html +
      lista
        .map(function (o) {
          return (
            '<option value="' +
            esc(o.valor) +
            '"' +
            (String(o.valor) === String(selecionado || '') ? ' selected' : '') +
            '>' +
            esc(o.rotulo) +
            '</option>'
          );
        })
        .join('')
    );
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  // ícones de traço do menu lateral
  var ICONES_MENU = {
    inicio: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    fila: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="12.5" width="4" height="6" rx="1.5"/><rect x="17" y="12.5" width="4" height="6" rx="1.5"/><path d="M19 18.5v.5a3 3 0 0 1-3 3h-2.5"/><rect x="10.5" y="20.8" width="3" height="2.4" rx="1.2"/>',
    relatorios: '<path d="M3 17l5-6 4 4 8-9"/><path d="M15 6h5v5"/>',
    kanban:
      '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    novo: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    pessoas:
      '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2.2.6 3.6 2.4 4 5.2"/>',
    config:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    ajuda:
      '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
    sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  };

  function itemMenu(item) {
    var icone = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONES_MENU[item.icone] + '</svg>';
    var conteudo = icone + '<span class="rotulo-menu">' + esc(item.texto) + '</span>';
    if (item.acao) {
      return (
        '<button type="button" class="item-menu" data-menu="' +
        item.acao +
        '" title="' +
        esc(item.texto) +
        '">' +
        conteudo +
        '</button>'
      );
    }
    return (
      '<a class="item-menu' +
      (item.ativo ? ' ativo' : '') +
      '" href="' +
      item.href +
      '" title="' +
      esc(item.texto) +
      '"' +
      (item.ativo ? ' aria-current="page"' : '') +
      (item.externo ? ' target="_blank" rel="noopener"' : '') +
      '>' +
      conteudo +
      '</a>'
    );
  }

  // logo da empresa (Configurações > Empresa e parâmetros) ou o "HD" padrão
  function logoHtml() {
    return HD.marca.logo
      ? '<img class="imagem-logo" src="' +
          esc(HD.marca.logo) +
          '" alt="' +
          esc(HD.marca.nome) +
          '" />'
      : '<span class="logo">HD</span>';
  }

  /** Menu lateral (ícones) e barra do topo conforme o papel do usuário logado. */
  function navbar(usuario) {
    var menu = $('#menu-lateral');
    var area = document.body.getAttribute('data-area');
    var aba = document.body.getAttribute('data-aba');
    if (!menu || !usuario) return;
    var equipe = Api.ehEquipe(usuario);
    var admin = usuario.papel === 'admin';
    var secao = window.location.hash.replace('#', '');

    var principais = equipe
      ? [
          { href: '/inicio', texto: 'Início', icone: 'inicio', ativo: area === 'inicio' },
          {
            href: '/agente',
            texto: 'Fila de chamados',
            icone: 'fila',
            ativo: aba === 'lista' || area === 'chamado',
          },
          {
            href: '/agente/quadro',
            texto: 'Quadro de chamados',
            icone: 'kanban',
            ativo: aba === 'kanban',
          },
        ].concat(
          Api.pode(usuario, 'verRelatorios')
            ? [
                {
                  href: '/relatorios',
                  texto: 'Indicadores e relatórios',
                  icone: 'relatorios',
                  ativo: area === 'relatorios',
                },
              ]
            : [],
          admin
            ? [
                {
                  href: '/admin/configuracoes#usuarios',
                  texto: 'Pessoas',
                  icone: 'pessoas',
                  ativo: area === 'admin' && secao === 'usuarios',
                },
              ]
            : [],
        )
      : [
          {
            href: '/portal',
            texto: 'Meus chamados',
            icone: 'fila',
            ativo: (area === 'portal' && aba !== 'novo') || area === 'chamado',
          },
          { href: '/chamados/novo', texto: 'Abrir chamado', icone: 'novo', ativo: aba === 'novo' },
        ];

    var rodape = (
      admin
        ? [
            {
              href: '/admin',
              texto: 'Configurações',
              icone: 'config',
              ativo: area === 'admin' && secao !== 'usuarios',
            },
          ]
        : []
    ).concat(
      equipe
        ? [{ href: '/v1/docs', texto: 'Documentação da API', icone: 'ajuda', externo: true }]
        : [],
      [{ acao: 'sair', texto: 'Sair', icone: 'sair' }],
    );

    menu.innerHTML =
      '<a class="marca-lateral" href="/" title="' +
      esc(HD.marca.nome) +
      '">' +
      logoHtml() +
      '</a>' +
      '<nav class="itens-menu">' +
      principais.map(itemMenu).join('') +
      '</nav><div class="itens-menu rodape-menu">' +
      rodape.map(itemMenu).join('') +
      '</div>';

    menu.querySelector('[data-menu="sair"]').addEventListener('click', function () {
      Api.sair();
    });

    // configurações "Pessoas" mudam só o hash: atualiza o item ativo
    if (area === 'admin' && !navbar.ouvindoHash) {
      navbar.ouvindoHash = true;
      window.addEventListener('hashchange', function () {
        navbar(usuario);
      });
    }

    $('#navbar-usuario').innerHTML =
      '<span class="nome-usuario"><strong>' +
      esc(usuario.nome) +
      '</strong><span class="papel">' +
      esc(PAPEIS[usuario.papel]) +
      '</span></span>' +
      avatar(usuario).replace('class="avatar"', 'class="avatar grande"');

    // equipe: abas das páginas abertas; cliente: nome da central
    if (equipe) Abas.abre(null, { admin: admin });
    if (equipe && window.Notificacoes) Notificacoes.inicia();
    if (window.BuscaGlobal) BuscaGlobal.inicia(usuario);
    else $('#abas').innerHTML = '<span class="titulo-topo">Central de atendimento</span>';
  }

  function paginacao(el, meta, aoMudar) {
    if (!meta || meta.total === 0) {
      el.innerHTML = '';
      return;
    }
    var ini = (meta.pagina - 1) * meta.porPagina + 1;
    var fim = Math.min(meta.pagina * meta.porPagina, meta.total);
    el.innerHTML =
      '<span>' +
      ini +
      '–' +
      fim +
      ' de ' +
      meta.total +
      '</span>' +
      '<div class="acoes">' +
      '<button class="botao pequeno" data-pag="' +
      (meta.pagina - 1) +
      '"' +
      (meta.pagina <= 1 ? ' disabled' : '') +
      '>Anterior</button>' +
      '<button class="botao pequeno" data-pag="' +
      (meta.pagina + 1) +
      '"' +
      (meta.pagina >= meta.totalPaginas ? ' disabled' : '') +
      '>Próxima</button>' +
      '</div>';
    el.querySelectorAll('[data-pag]').forEach(function (b) {
      b.addEventListener('click', function () {
        aoMudar(Number(b.getAttribute('data-pag')));
      });
    });
  }

  return {
    esc: esc,
    $: $,
    data: data,
    relativo: relativo,
    duracao: duracao,
    badgeStatus: badgeStatus,
    prioridade: prioridade,
    avatar: avatar,
    corSegura: corSegura,
    servico: servico,
    equipe: equipe,
    tag: tag,
    tags: tags,
    situacaoSla: situacaoSla,
    sla: sla,
    estrelas: estrelas,
    escolhe: escolhe,
    pedeResposta: pedeResposta,
    exigeResposta: exigeResposta,
    iniciais: iniciais,
    carregando: carregando,
    vazio: vazio,
    erro: erro,
    toast: toast,
    ocupado: ocupado,
    errosDeCampo: errosDeCampo,
    opcoes: opcoes,
    debounce: debounce,
    navbar: navbar,
    logoHtml: logoHtml,
    paginacao: paginacao,
  };
})();
