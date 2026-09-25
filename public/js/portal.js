// Portal do cliente ("Meus chamados") no mesmo layout da fila da equipe: visualizações à
// esquerda, título com a contagem, busca e a tabela. A visualização e a busca ficam na URL.
(function () {
  var usuario = Api.exigeLogin('cliente');
  if (!usuario) return;
  Ui.navbar(usuario);

  var MINIMO_BUSCA = 3;
  var VISOES = [
    {
      id: 'abertos',
      nome: 'Chamados em aberto',
      dica: 'Novos, em atendimento e pendentes',
      status: ['novo', 'em_atendimento', 'pendente'],
      vazio: 'Nenhum chamado em aberto',
    },
    {
      id: 'aguardando',
      nome: 'Aguardando minha resposta',
      dica: 'A equipe precisa de um retorno seu',
      status: ['pendente'],
      vazio: 'Nada esperando por você',
    },
    {
      id: 'resolvidos',
      nome: 'Resolvidos',
      dica: 'Confira a solução e avalie o atendimento',
      status: ['resolvido'],
      vazio: 'Nenhum chamado resolvido',
    },
    { id: 'fechados', nome: 'Fechados', status: ['fechado'], vazio: 'Nenhum chamado fechado' },
    {
      id: 'todos',
      nome: 'Todos os meus chamados',
      status: null,
      vazio: 'Você ainda não abriu chamados',
    },
  ];
  var CHAVE_PAINEL = 'helpdesk.portal.painel';
  var CHAVE_POR_PAGINA = 'helpdesk.portal.porPagina';

  function le(chave, padrao) {
    try {
      var v = localStorage.getItem(chave);
      return v === null ? padrao : JSON.parse(v);
    } catch (_e) {
      return padrao;
    }
  }
  function grava(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch (_e) {
      /* navegação privada: vale só nesta visita */
    }
  }

  var params = new URLSearchParams(window.location.search);
  var estado = {
    visao: VISOES.some(function (v) {
      return v.id === params.get('visao');
    })
      ? params.get('visao')
      : 'abertos',
    busca: params.get('busca') || '',
    pagina: 1,
    porPagina: le(CHAVE_POR_PAGINA, 20),
    // o perfil de acesso libera os chamados de toda a empresa do cliente
    daEmpresa: false,
  };
  var conteudo = Ui.$('#conteudo');
  var requisicaoAtual = 0;

  function visaoAtual() {
    return VISOES.filter(function (v) {
      return v.id === estado.visao;
    })[0];
  }

  function paraUrl() {
    var p = new URLSearchParams();
    if (estado.visao !== 'abertos') p.set('visao', estado.visao);
    if (estado.busca) p.set('busca', estado.busca);
    var s = p.toString();
    window.history.replaceState(null, '', window.location.pathname + (s ? '?' + s : ''));
  }

  // ---------------------------------------------------------------- painel de visualizações
  function desenhaVisoes() {
    Ui.$('#visoes').innerHTML = VISOES.map(function (v) {
      var ativa = v.id === estado.visao;
      return (
        '<div class="linha-visao' +
        (ativa ? ' ativa' : '') +
        '"><button type="button" class="item-visao" data-visao="' +
        v.id +
        '"' +
        (ativa ? ' aria-current="true"' : '') +
        '><span class="nome-visao">' +
        Ui.esc(v.nome) +
        '</span>' +
        (v.dica ? '<span class="dica-visao">' + Ui.esc(v.dica) + '</span>' : '') +
        '</button></div>'
      );
    }).join('');
    Ui.$('#titulo-visao').textContent = visaoAtual().nome;
    document.title = visaoAtual().nome + ' · ' + HD.marca.nome;
  }

  // lembrar = escolha da pessoa (o tamanho da tela no primeiro acesso não vira preferência)
  function mostraPainel(visivel, lembrar) {
    Ui.$('#fila-layout').classList.toggle('sem-painel', !visivel);
    Ui.$('#mostrar-visoes').hidden = visivel;
    Ui.$('#recolher-visoes').setAttribute('aria-expanded', String(visivel));
    if (lembrar) grava(CHAVE_PAINEL, visivel);
  }

  // ---------------------------------------------------------------- tabela
  function linha(c) {
    var corServico = c.servico ? Ui.corSegura(c.servico.cor) : 'var(--cor-borda-forte)';
    return (
      '<tr data-numero="' +
      c.numero +
      '">' +
      '<td class="numero">' +
      c.numero +
      '</td>' +
      '<td class="coluna-tipo"><span class="barra-tipo" style="--cor-tipo:' +
      corServico +
      '" title="' +
      Ui.esc(c.servico ? 'Serviço: ' + c.servico.nome : 'Sem serviço') +
      '"></span></td>' +
      '<td class="assunto"><a href="/chamados/' +
      c.numero +
      '" title="' +
      Ui.esc(c.titulo) +
      '">' +
      Ui.esc(c.titulo) +
      '</a></td>' +
      (estado.daEmpresa
        ? '<td class="cliente-fila ocultar-mobile">' +
          (c.solicitante && c.solicitante._id === usuario._id
            ? 'Você'
            : Ui.esc(c.solicitante ? c.solicitante.nome : '—')) +
          '</td>'
        : '') +
      '<td>' +
      Ui.badgeStatus(c.status) +
      '</td>' +
      '<td class="ocultar-mobile">' +
      Ui.servico(c.servico) +
      '</td>' +
      '<td class="data-fila" title="' +
      Ui.esc(Ui.data(c.updatedAt)) +
      '">' +
      Ui.relativo(c.updatedAt) +
      '</td>' +
      '<td class="data-fila ocultar-mobile">' +
      Ui.data(c.createdAt) +
      '</td>' +
      '</tr>'
    );
  }

  async function carrega() {
    var minha = ++requisicaoAtual;
    paraUrl();
    if (!conteudo.querySelector('table'))
      conteudo.innerHTML = Ui.carregando('Carregando seus chamados...');
    else conteudo.classList.add('recarregando');
    try {
      var r = await Api.get('/chamados', {
        status: visaoAtual().status,
        busca: estado.busca || undefined,
        pagina: estado.pagina,
        porPagina: estado.porPagina,
      });
      if (minha !== requisicaoAtual) return;
      conteudo.classList.remove('recarregando');
      var p = r.paginacao;
      var ini = (p.pagina - 1) * p.porPagina + 1;
      var fim = Math.min(p.pagina * p.porPagina, p.total);
      Ui.$('#resumo').textContent = p.total
        ? 'Exibindo de ' + ini + ' até ' + fim + ' de um total de ' + p.total + ' registro(s)'
        : 'Nenhum registro encontrado';

      conteudo.innerHTML = r.chamados.length
        ? '<table class="tabela-chamados"><thead><tr><th>Nº</th><th class="coluna-tipo"><span class="sr-only">Serviço</span></th><th>Assunto</th>' +
          (estado.daEmpresa ? '<th class="ocultar-mobile">Solicitante</th>' : '') +
          '<th>Status</th><th class="ocultar-mobile">Serviço</th><th>Atualizado</th><th class="ocultar-mobile">Aberto em</th></tr></thead><tbody>' +
          r.chamados.map(linha).join('') +
          '</tbody></table>'
        : Ui.vazio(
            estado.busca ? 'Nada encontrado para "' + estado.busca + '"' : visaoAtual().vazio,
            estado.busca
              ? 'Tente outro termo ou outra visualização.'
              : 'Precisa de ajuda? Clique em "Abrir novo chamado".',
          );
      Ui.paginacao(Ui.$('#paginacao'), p, function (pagina) {
        estado.pagina = pagina;
        carrega();
      });
    } catch (e) {
      if (minha !== requisicaoAtual) return;
      conteudo.classList.remove('recarregando');
      Ui.$('#paginacao').innerHTML = '';
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  // ---------------------------------------------------------------- eventos
  conteudo.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var tr = e.target.closest('tr[data-numero]');
    if (tr) window.location.href = '/chamados/' + tr.getAttribute('data-numero');
  });

  Ui.$('#visoes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-visao]');
    if (!b) return;
    estado.visao = b.getAttribute('data-visao');
    estado.pagina = 1;
    desenhaVisoes();
    carrega();
  });

  Ui.$('#recolher-visoes').addEventListener('click', function () {
    mostraPainel(false, true);
  });
  Ui.$('#mostrar-visoes').addEventListener('click', function () {
    mostraPainel(true, true);
  });

  var campoBusca = Ui.$('#busca-fila');
  function buscaAgora() {
    var termo = campoBusca.value.trim();
    // número do chamado busca na hora; texto a partir de 3 caracteres
    if (termo && termo.length < MINIMO_BUSCA && !/^#?\d+$/.test(termo)) return;
    if (termo === estado.busca) return;
    estado.busca = termo;
    estado.pagina = 1;
    carrega();
  }
  campoBusca.addEventListener('input', Ui.debounce(buscaAgora, 350));
  campoBusca.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') buscaAgora();
  });
  Ui.$('#botao-buscar').addEventListener('click', buscaAgora);
  Ui.$('#botao-limpar').addEventListener('click', function () {
    campoBusca.value = '';
    buscaAgora();
  });

  Ui.$('#por-pagina').value = String(estado.porPagina);
  Ui.$('#por-pagina').addEventListener('change', function (e) {
    estado.porPagina = Number(e.target.value);
    estado.pagina = 1;
    grava(CHAVE_POR_PAGINA, estado.porPagina);
    carrega();
  });

  // voltando de um chamado excluído
  var excluido = params.get('excluido');
  if (excluido) {
    Ui.toast('Chamado #' + excluido + ' excluído', 'sucesso');
  }

  // avisos do mural para clientes
  Api.get('/avisos')
    .then(function (r) {
      Ui.$('#avisos-portal').innerHTML = r.avisos
        .map(function (a) {
          return (
            '<div class="aviso-portal"><strong>' +
            Ui.esc(a.nome) +
            '</strong><p>' +
            Ui.esc(a.mensagem) +
            '</p></div>'
          );
        })
        .join('');
    })
    .catch(function () {
      /* sem avisos */
    });

  // ---------------------------------------------------------------- início
  mostraPainel(le(CHAVE_PAINEL, window.innerWidth > 900));
  campoBusca.value = estado.busca;
  desenhaVisoes();
  Api.eu()
    .then(function (eu) {
      estado.daEmpresa = Api.pode(eu, 'verChamadosDaEmpresa');
      if (estado.daEmpresa) {
        // gestor da empresa: vê os chamados dos colegas também
        Ui.$('#titulo-painel').textContent = 'Chamados da empresa';
        VISOES[VISOES.length - 1].nome = 'Todos os chamados da empresa';
        desenhaVisoes();
      }
    })
    .catch(function () {
      /* segue com a lista padrão */
    })
    .then(carrega);
})();
