// Página Início da equipe (como no Movidesk): saudação, bandeiras de alerta,
// contadores de chamados que expandem, mural de avisos e indicadores do dia.
(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  Ui.navbar(usuario);

  var CHAVE_EXPANDIDOS = 'helpdesk.inicio.expandidos';
  var conteudo = Ui.$('#conteudo');
  Ui.$('#nome-saudacao').textContent = usuario.nome.split(' ')[0];

  var ICONES = {
    fone: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    alfinete: '<path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-4-5 5-1-1 5-5-4-4 1-2 5 1 4-4z"/>',
    hoje: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M16 14h2M8 17h2M12 17h2"/>',
    estrela: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    relogio: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
    ajuda:
      '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
    seta: '<path d="m6 9 6 6 6-6"/>',
    bandeira: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  };
  function svg(nome, classe) {
    return (
      '<svg class="' +
      (classe || 'icone-linha') +
      '" viewBox="0 0 24 24" aria-hidden="true">' +
      ICONES[nome] +
      '</svg>'
    );
  }

  function leExpandidos() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_EXPANDIDOS) || '{}');
    } catch (_e) {
      return {};
    }
  }
  var expandidos = leExpandidos();

  // ---------------------------------------------------------------- bandeiras
  function bandeiras(b) {
    var itens = [
      ['vermelha', b.slaVencido, 'Chamados com SLA vencido', '/agente?sla=vencido'],
      ['preta', b.semResposta, 'Chamados com a 1ª resposta atrasada', '/agente?sla=sem_resposta'],
      [
        'cinza',
        b.semResponsavel,
        'Chamados em aberto sem responsável',
        '/agente?responsavel=nenhum&status=novo,em_atendimento,pendente',
      ],
    ];
    Ui.$('#bandeiras').innerHTML = itens
      .map(function (i) {
        return (
          '<a class="bandeira bandeira-' +
          i[0] +
          '" href="' +
          i[3] +
          '" title="' +
          i[2] +
          ': ' +
          i[1] +
          '"><span class="contagem-bandeira">' +
          i[1] +
          '</span>' +
          svg('bandeira', 'icone-bandeira') +
          '<span class="sr-only">' +
          i[2] +
          '</span></a>'
        );
      })
      .join('');
  }

  // ---------------------------------------------------------------- cartões
  function cartao(cfg) {
    var expansivel = cfg.chave !== undefined;
    var aberto = !expansivel || expandidos[cfg.chave];
    return (
      '<section class="cartao-inicio cor-' +
      cfg.cor +
      (cfg.classe ? ' ' + cfg.classe : '') +
      '">' +
      '<header>' +
      svg(cfg.icone) +
      '<h2>' +
      Ui.esc(cfg.titulo) +
      '</h2>' +
      (cfg.total !== undefined ? '<span class="total-cartao">' + cfg.total + '</span>' : '') +
      (expansivel
        ? '<button type="button" class="expande" data-expande="' +
          cfg.chave +
          '" aria-expanded="' +
          Boolean(aberto) +
          '" aria-label="' +
          (aberto ? 'Recolher ' : 'Expandir ') +
          Ui.esc(cfg.titulo) +
          '">' +
          svg('seta') +
          '</button>'
        : '') +
      '</header>' +
      (aberto ? '<div class="corpo-cartao">' + cfg.corpo + '</div>' : '') +
      (aberto && cfg.link
        ? '<a class="acao-cartao" href="' + cfg.link[1] + '">' + Ui.esc(cfg.link[0]) + '</a>'
        : '') +
      '</section>'
    );
  }

  // Meus tickets / da minha equipe / de todos: uma linha por status, levando à fila filtrada
  function contador(chave, titulo, porStatus, filtro) {
    if (!porStatus) return '';
    var total = HD.status.reduce(function (soma, s) {
      return soma + porStatus[s];
    }, 0);
    var abertos = porStatus.novo + porStatus.em_atendimento + porStatus.pendente;
    return cartao({
      chave: chave,
      titulo: titulo,
      icone: 'fone',
      cor: 'azul',
      total: abertos,
      corpo:
        '<ul class="linhas-status">' +
        HD.status
          .map(function (s) {
            return (
              '<li><a href="/agente?' +
              filtro +
              (filtro ? '&' : '') +
              'status=' +
              s +
              '">' +
              Ui.badgeStatus(s) +
              '<strong>' +
              porStatus[s] +
              '</strong></a></li>'
            );
          })
          .join('') +
        '</ul><p class="suave rodape-contador">' +
        abertos +
        ' em aberto de ' +
        total +
        ' no total</p>',
      link: ['Ver na fila', '/agente' + (filtro ? '?' + filtro : '')],
    });
  }

  function mural(avisos) {
    var corpo = avisos.length
      ? '<ul class="avisos">' +
        avisos
          .map(function (a) {
            return (
              '<li><strong>' +
              Ui.esc(a.nome) +
              '</strong><p>' +
              Ui.esc(a.mensagem) +
              '</p><span class="suave">' +
              Ui.data(a.createdAt) +
              (a.validoAte ? ' · até ' + a.validoAte.split('-').reverse().join('/') : '') +
              '</span></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<div class="mural-vazio">' +
        svg('alfinete', 'icone-grande') +
        '<p>Nenhum aviso para ser exibido</p></div>';
    return cartao({
      titulo: 'Mural de avisos',
      icone: 'alfinete',
      cor: 'laranja',
      classe: 'cartao-mural',
      corpo: corpo,
      link: usuario.papel === 'admin' ? ['Gerenciar avisos', '/admin/configuracoes#avisos'] : null,
    });
  }

  function linha(texto, valor, destaque) {
    return (
      '<p class="linha-indicador' +
      (destaque ? ' destaque' : '') +
      '"><strong>' +
      valor +
      '</strong> ' +
      texto +
      '</p>'
    );
  }

  function renderiza(d) {
    bandeiras(d.bandeiras);
    var c = d.contadores;
    var satisfacao =
      d.satisfacao.media === null
        ? linha('avaliações nos últimos 30 dias', 0)
        : '<p class="nota-inicio">' +
          Ui.estrelas(Math.round(d.satisfacao.media)) +
          ' <strong>' +
          d.satisfacao.media.toLocaleString('pt-BR') +
          '</strong> / 5</p>' +
          linha(
            d.satisfacao.total === 1
              ? 'avaliação nos últimos 30 dias'
              : 'avaliações nos últimos 30 dias',
            d.satisfacao.total,
          );

    conteudo.innerHTML =
      '<div class="grade-inicio">' +
      '<div class="linha-contadores">' +
      contador('meus', 'Meus tickets', c.meus, 'responsavel=eu') +
      contador('equipe', 'Tickets da minha equipe', c.equipe, 'equipe=minhas') +
      contador('todos', 'Tickets de todos os agentes', c.todos, '') +
      '</div>' +
      '<div class="coluna-inicio">' +
      mural(d.avisos) +
      '</div>' +
      '<div class="coluna-inicio">' +
      cartao({
        titulo: 'Atendimento hoje',
        icone: 'hoje',
        cor: 'amarela',
        corpo:
          linha(
            d.hoje.abertos === 1 ? 'chamado aberto hoje' : 'chamados abertos hoje',
            d.hoje.abertos,
          ) +
          linha(
            d.hoje.resolvidos === 1 ? 'chamado resolvido hoje' : 'chamados resolvidos hoje',
            d.hoje.resolvidos,
          ),
        link: ['Ver fila', '/agente?ordenar=recentes'],
      }) +
      cartao({
        titulo: 'Prazos',
        icone: 'relogio',
        cor: 'vinho',
        corpo:
          linha('vencem hoje', d.prazos.hoje, d.prazos.hoje > 0) +
          linha('vencem nos próximos 7 dias', d.prazos.semana) +
          linha('já estão com o SLA vencido', d.bandeiras.slaVencido, d.bandeiras.slaVencido > 0),
        link: ['Ver prioridades', '/agente?ordenar=prioridade&status=novo,em_atendimento'],
      }) +
      '</div>' +
      '<div class="coluna-inicio">' +
      cartao({
        titulo: 'Satisfação',
        icone: 'estrela',
        cor: 'verde',
        corpo: satisfacao,
        link: usuario.papel === 'admin' ? ['Ver pesquisa', '/admin/configuracoes#pesquisa'] : null,
      }) +
      cartao({
        titulo: 'Central de ajuda',
        icone: 'ajuda',
        cor: 'grafite',
        corpo:
          '<p>Atalhos: <strong>Ctrl + Enter</strong> envia a ação do chamado. Macros e campos adicionais ficam no próprio chamado.</p>' +
          '<p>A documentação da API (Swagger) mostra todas as rotas do sistema.</p>',
        link: ['Abrir documentação', '/v1/docs'],
      }) +
      '</div>' +
      '</div>';
  }

  var dados = null;

  conteudo.addEventListener('click', function (e) {
    var botao = e.target.closest('[data-expande]');
    if (!botao || !dados) return;
    var chave = botao.getAttribute('data-expande');
    expandidos[chave] = !expandidos[chave];
    try {
      localStorage.setItem(CHAVE_EXPANDIDOS, JSON.stringify(expandidos));
    } catch (_e) {
      /* preferência só nesta visita */
    }
    renderiza(dados);
  });

  async function carrega() {
    conteudo.innerHTML = Ui.carregando('Carregando indicadores...');
    try {
      dados = await Api.get('/inicio');
      renderiza(dados);
    } catch (e) {
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  // mantém os números atualizados enquanto a página fica aberta
  setInterval(function () {
    if (document.hidden) return;
    Api.get('/inicio')
      .then(function (d) {
        dados = d;
        renderiza(d);
      })
      .catch(function () {
        /* tenta de novo no próximo ciclo */
      });
  }, 120000);

  carrega();
})();
