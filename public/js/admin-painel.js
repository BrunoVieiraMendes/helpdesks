// Painel de configurações (estilo Movidesk): todos os cadastros agrupados, com
// busca "Do que você precisa?" e visão por grupo ou em ordem alfabética.
(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  if (usuario.papel !== 'admin') {
    window.location.replace('/agente');
    return;
  }
  Ui.navbar(usuario);

  // aba = seção de /admin/configuracoes; termos = palavras que a busca também reconhece
  var GRUPOS = [
    {
      nome: 'Conta',
      icone: 'conta',
      itens: [
        {
          nome: 'Empresa e parâmetros',
          aba: 'parametros',
          termos: 'nome conta fechamento automático dias',
        },
        { nome: 'Feriados', aba: 'feriados', termos: 'calendário folga' },
        { nome: 'Mural de avisos', aba: 'avisos', termos: 'recados comunicados início' },
      ],
    },
    {
      nome: 'Pessoas',
      icone: 'pessoas',
      itens: [
        { nome: 'Pessoas', aba: 'usuarios', termos: 'usuários clientes agentes senha' },
        { nome: 'Empresas', aba: 'empresas', termos: 'organização cnpj clientes' },
        { nome: 'Equipes', aba: 'equipes', termos: 'membros fila grupos' },
        { nome: 'Perfis de acesso', aba: 'perfis', termos: 'permissões acesso agente cliente' },
        { nome: 'Cargos', aba: 'cargos', termos: 'função' },
        {
          nome: 'Classificações',
          aba: 'classificacoes',
          termos: 'tipo de pessoa parceiro revenda',
        },
      ],
    },
    {
      nome: 'Chamados',
      icone: 'classificacao',
      itens: [
        { nome: 'Serviços', aba: 'servicos', termos: 'catálogo' },
        { nome: 'Categorias', aba: 'categorias', termos: 'tipo' },
        { nome: 'Status', aba: 'status', termos: 'transições fluxo' },
        { nome: 'Justificativas', aba: 'justificativas', termos: 'motivo pendente' },
        { nome: 'Tags', aba: 'tags', termos: 'etiquetas marcadores' },
      ],
    },
    {
      nome: 'Campos adicionais',
      icone: 'campos',
      itens: [
        { nome: 'Campos', aba: 'camposAdicionais', termos: 'campos personalizados extras' },
        { nome: 'Regras para exibição', aba: 'regrasExibicao', termos: 'condição mostrar campo' },
      ],
    },
    {
      nome: 'E-mail',
      icone: 'email',
      itens: [
        {
          nome: 'Contas e avisos por e-mail',
          aba: 'email',
          termos: 'smtp imap caixa de entrada notificação abrir chamado por email',
        },
        { nome: 'E-mails recebidos', aba: 'email', termos: 'log caixa de entrada' },
      ],
    },
    {
      nome: 'WhatsApp',
      icone: 'whatsapp',
      itens: [
        {
          nome: 'Conta do WhatsApp',
          aba: 'whatsapp',
          termos: 'meta api oficial webhook token número zap mensagem abrir chamado',
        },
        {
          nome: 'Mensagens do WhatsApp',
          aba: 'whatsapp',
          termos: 'log conversas enviadas recebidas zap',
        },
      ],
    },
    {
      nome: 'Atendimento',
      icone: 'acordos',
      itens: [
        {
          nome: 'Agentes online',
          aba: 'online',
          termos: 'presença conectados status quem está disponível',
        },
        {
          nome: 'SLA e urgências',
          aba: 'sla',
          termos: 'prazo expediente horário prioridade acordos',
        },
        { nome: 'Macros', aba: 'macros', termos: 'respostas prontas modelos automação' },
        {
          nome: 'Pesquisa de satisfação',
          aba: 'pesquisa',
          termos: 'avaliação nota csat perguntas',
        },
      ],
    },
  ];

  var CHAVE_MODO = 'helpdesk.painel.modo';
  var estado = { busca: '', modo: 'grupo' };
  try {
    estado.modo = localStorage.getItem(CHAVE_MODO) === 'az' ? 'az' : 'grupo';
  } catch (_e) {
    /* sem armazenamento: começa por grupo */
  }

  var container = Ui.$('#itens-config');
  var campoBusca = Ui.$('#busca-config');

  // compara sem acento e sem diferenciar maiúsculas
  function normaliza(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function combina(item, grupo) {
    if (!estado.busca) return true;
    var alvo = normaliza(item.nome + ' ' + grupo.nome + ' ' + (item.termos || ''));
    return normaliza(estado.busca)
      .split(/\s+/)
      .every(function (palavra) {
        return alvo.indexOf(palavra) !== -1;
      });
  }

  function link(item, extra) {
    return (
      '<a class="item-config" href="/admin/configuracoes#' +
      item.aba +
      '">' +
      Ui.esc(item.nome) +
      (extra || '') +
      '</a>'
    );
  }

  function porGrupo() {
    var html = GRUPOS.map(function (g) {
      var itens = g.itens.filter(function (i) {
        return combina(i, g);
      });
      if (!itens.length) return '';
      return (
        '<section class="grupo-config"><h2>' +
        Icones.svg(g.icone) +
        Ui.esc(g.nome) +
        '</h2><div class="itens">' +
        itens
          .map(function (i) {
            return link(i);
          })
          .join('') +
        '</div></section>'
      );
    }).join('');
    return html ? '<div class="grade-config">' + html + '</div>' : '';
  }

  function alfabetico() {
    var todos = [];
    GRUPOS.forEach(function (g) {
      g.itens.forEach(function (i) {
        if (combina(i, g)) todos.push({ item: i, grupo: g });
      });
    });
    todos.sort(function (a, b) {
      return a.item.nome.localeCompare(b.item.nome, 'pt-BR');
    });
    if (!todos.length) return '';
    return (
      '<div class="lista-az">' +
      todos
        .map(function (t) {
          return link(t.item, '<span class="grupo-do-item">' + Ui.esc(t.grupo.nome) + '</span>');
        })
        .join('') +
      '</div>'
    );
  }

  function renderiza() {
    document.querySelectorAll('[data-modo]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-modo') === estado.modo));
    });
    var html = estado.modo === 'az' ? alfabetico() : porGrupo();
    container.innerHTML =
      html ||
      Ui.vazio(
        'Nenhuma configuração encontrada',
        'Tente outro termo, como "SLA", "feriado" ou "equipe".',
      );
  }

  campoBusca.addEventListener('input', function () {
    estado.busca = campoBusca.value.trim();
    renderiza();
  });

  // Enter na busca abre o primeiro resultado disponível
  campoBusca.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var primeiro = container.querySelector('a.item-config');
    if (primeiro) window.location.href = primeiro.getAttribute('href');
  });

  document.querySelectorAll('[data-modo]').forEach(function (b) {
    b.addEventListener('click', function () {
      estado.modo = b.getAttribute('data-modo');
      try {
        localStorage.setItem(CHAVE_MODO, estado.modo);
      } catch (_e) {
        /* preferência só nesta visita */
      }
      renderiza();
    });
  });

  // ---------------------------------------------------------------- quadros laterais
  document.querySelectorAll('[data-icone]').forEach(function (el) {
    el.innerHTML = Icones.svg(el.getAttribute('data-icone'));
  });

  function numero(n, singular, plural) {
    return '<strong>' + n + '</strong> ' + (n === 1 ? singular : plural);
  }

  async function carregaResumo() {
    var pessoas = Ui.$('#quadro-pessoas .corpo-quadro');
    var fila = Ui.$('#quadro-fila .corpo-quadro');
    try {
      var r = await Api.get('/configuracoes/resumo');
      var p = r.pessoas;
      pessoas.innerHTML =
        '<div class="numeros-pessoas"><ul>' +
        '<li>' +
        numero(p.clientes, 'cliente', 'clientes') +
        '</li>' +
        '<li>' +
        numero(p.empresas, 'empresa', 'empresas') +
        '</li>' +
        '<li>' +
        numero(p.equipes, 'equipe', 'equipes') +
        '</li>' +
        '</ul><div class="destaque"><span class="valor">' +
        p.agentesAtivos +
        '</span><span>' +
        (p.agentesAtivos === 1 ? 'agente ativo' : 'agentes ativos') +
        '</span></div></div>' +
        '<a class="acao-quadro" href="/admin/configuracoes#usuarios">Cadastre mais pessoas</a>';

      var f = r.fila;
      fila.innerHTML =
        '<ul class="indicadores">' +
        '<li><span>Chamados em aberto</span><strong>' +
        f.abertos +
        '</strong></li>' +
        '<li><span>Com SLA vencido</span><strong class="' +
        (f.slaVencido ? 'texto-perigo' : '') +
        '">' +
        f.slaVencido +
        '</strong></li>' +
        '<li><span>Satisfação média</span><strong>' +
        (f.mediaAvaliacao === null
          ? '—'
          : f.mediaAvaliacao.toLocaleString('pt-BR') +
            ' / 5 <span class="suave">(' +
            f.totalAvaliacoes +
            ')</span>') +
        '</strong></li></ul>' +
        (f.slaVencido
          ? '<a class="acao-quadro" href="/agente?sla=vencido">Ver chamados atrasados</a>'
          : '');
    } catch (e) {
      pessoas.innerHTML = '<span class="suave">' + Ui.esc(e.message) + '</span>';
      fila.innerHTML = '';
    }
  }

  renderiza();
  carregaResumo();
})();
