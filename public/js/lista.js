// Fila de chamados no layout do Movidesk: painel de visualizações à esquerda,
// título da visualização com a contagem, OPÇÕES, busca, filtros e a tabela.
// Os filtros ficam na URL (?status=...&responsavel=eu), então a tela pode ser
// recarregada, favoritada e compartilhada.
(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  Ui.navbar(usuario);

  var ABERTOS = ['novo', 'em_atendimento', 'pendente'];
  var MINIMO_BUSCA = 3;

  // visualizações prontas (equivalem a combinações de filtros)
  var VISOES = [
    { id: 'todos', nome: 'Todos os tickets', filtros: {} },
    {
      id: 'meus',
      nome: 'Meus tickets não resolvidos',
      filtros: { responsavel: 'eu', status: ABERTOS },
    },
    {
      id: 'equipe',
      nome: 'Tickets não resolvidos com minha equipe',
      filtros: { equipe: 'minhas', status: ABERTOS },
    },
    { id: 'abertos', nome: 'Todos os tickets não resolvidos', filtros: { status: ABERTOS } },
    {
      id: 'sem-responsavel',
      nome: 'Tickets não atribuídos',
      filtros: { responsavel: 'nenhum', status: ABERTOS },
    },
    { id: 'kanban', nome: 'Todos os tickets não resolvidos - Kanban', href: '/agente/kanban' },
    {
      id: 'parados',
      nome: 'Tickets parados sob minha responsabilidade',
      dica: 'Sem atualização há mais de 24 horas',
      filtros: { responsavel: 'eu', status: ABERTOS, parado: '24' },
    },
    { id: 'sla', nome: 'Tickets com SLA vencido', filtros: { sla: ['vencido'] } },
    {
      id: 'resposta',
      nome: 'Tickets com 1ª resposta atrasada',
      filtros: { sla: ['sem_resposta'] },
    },
    {
      id: 'resolvidos',
      nome: 'Tickets resolvidos e fechados',
      filtros: { status: ['resolvido', 'fechado'] },
    },
  ];

  var CHAVE_PESSOAIS = 'helpdesk.visoes.' + usuario._id;
  var CHAVE_PAINEL = 'helpdesk.fila.painel';
  var CHAVE_POR_PAGINA = 'helpdesk.fila.porPagina';

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

  var conteudo = Ui.$('#conteudo');
  var estado = {
    filtros: Filtros.daUrl(),
    pagina: 1,
    porPagina: le(CHAVE_POR_PAGINA, 20),
    selecionados: [],
    chamados: [],
    pessoais: le(CHAVE_PESSOAIS, []),
  };
  var requisicaoAtual = 0;

  // ---------------------------------------------------------------- visualizações
  // compara filtros ignorando busca e ordenação (buscar dentro de uma visualização não a "desmarca")
  function assinatura(f) {
    return Object.keys(f || {})
      .filter(function (k) {
        return k !== 'busca' && k !== 'ordenar' && f[k] && (!Array.isArray(f[k]) || f[k].length);
      })
      .sort()
      .map(function (k) {
        return k + '=' + (Array.isArray(f[k]) ? f[k].slice().sort().join(',') : f[k]);
      })
      .join('&');
  }

  function visaoAtual() {
    var a = assinatura(estado.filtros);
    var todas = VISOES.filter(function (v) {
      return v.filtros;
    }).concat(estado.pessoais);
    return (
      todas.filter(function (v) {
        return assinatura(v.filtros) === a;
      })[0] || null
    );
  }

  function itemVisao(v, atual, pessoal, indice) {
    var ativo = atual && atual === v;
    var conteudoItem =
      '<span class="nome-visao">' +
      Ui.esc(v.nome) +
      '</span>' +
      (v.dica ? '<span class="dica-visao">' + Ui.esc(v.dica) + '</span>' : '');
    if (v.href) {
      return (
        '<a class="item-visao" href="' +
        v.href +
        '" title="' +
        Ui.esc(v.nome) +
        '">' +
        conteudoItem +
        '</a>'
      );
    }
    return (
      '<div class="linha-visao' +
      (ativo ? ' ativa' : '') +
      '"><button type="button" class="item-visao" ' +
      (pessoal ? 'data-visao-pessoal="' + indice + '"' : 'data-visao="' + v.id + '"') +
      (ativo ? ' aria-current="true"' : '') +
      ' title="' +
      Ui.esc(v.nome) +
      '">' +
      conteudoItem +
      '</button>' +
      (pessoal
        ? '<button type="button" class="remove-visao" data-remove-visao="' +
          indice +
          '" title="Excluir visualização" aria-label="Excluir visualização ' +
          Ui.esc(v.nome) +
          '">×</button>'
        : '') +
      '</div>'
    );
  }

  function desenhaVisoes() {
    var atual = visaoAtual();
    Ui.$('#visoes-padrao').innerHTML = VISOES.map(function (v) {
      return itemVisao(v, atual, false);
    }).join('');
    Ui.$('#visoes-pessoais').innerHTML = estado.pessoais.length
      ? estado.pessoais
          .map(function (v, i) {
            return itemVisao(v, atual, true, i);
          })
          .join('')
      : '<p class="vazio-visoes">Filtre a fila e use <strong>Opções &gt; Salvar como visualização pessoal</strong>.</p>';
    Ui.$('#titulo-visao').textContent = atual ? atual.nome : 'Filtro personalizado';
    document.title = (atual ? atual.nome : 'Fila de chamados') + ' · Help Desk';

    // quantos filtros estão ligados (fora a busca e a ordenação)
    var n = assinatura(estado.filtros) ? assinatura(estado.filtros).split('&').length : 0;
    var contador = Ui.$('#contador-filtros');
    contador.hidden = !n;
    contador.textContent = n;
  }

  // ---------------------------------------------------------------- aplicar filtros
  var painelFiltros = Ui.$('#filtros');

  // (re)monta a barra de filtros a partir da URL; um elemento novo evita ouvintes duplicados
  function montaFiltros() {
    var novo = painelFiltros.cloneNode(false);
    painelFiltros.parentNode.replaceChild(novo, painelFiltros);
    painelFiltros = novo;
    Filtros.monta(painelFiltros, {
      comStatus: true,
      comOrdenacao: true,
      semBusca: true,
      aoMudar: function (f) {
        // a busca é da própria tela: o painel de filtros não a conhece
        if (estado.filtros.busca) f.busca = estado.filtros.busca;
        else delete f.busca;
        Filtros.paraUrl(f);
        estado.filtros = f;
        estado.pagina = 1;
        desenhaVisoes();
        carrega();
      },
    });
  }

  function aplica(filtros, opcoes) {
    estado.filtros = filtros;
    estado.pagina = 1;
    estado.selecionados = [];
    Filtros.paraUrl(filtros);
    if (!opcoes || !opcoes.semRemontar) montaFiltros();
    Ui.$('#busca-fila').value = filtros.busca || '';
    desenhaVisoes();
    carrega();
  }

  function copia(f) {
    return JSON.parse(JSON.stringify(f || {}));
  }

  // ---------------------------------------------------------------- tabela
  var ORDENS_DA_COLUNA = {
    aberto: ['recentes', 'antigos'],
    urgencia: ['prioridade'],
  };

  function cabecalho(titulo, coluna, classe) {
    var ordens = ORDENS_DA_COLUNA[coluna];
    var atual = estado.filtros.ordenar || 'atualizacao';
    var th = '<th' + (classe ? ' class="' + classe + '"' : '');
    if (!ordens) return th + '>' + titulo + '</th>';
    var ativa = ordens.indexOf(atual) !== -1;
    var seta = ativa ? (atual === 'antigos' ? '↑' : '↓') : '';
    return (
      th +
      (ativa ? ' aria-sort="' + (atual === 'antigos' ? 'ascending' : 'descending') + '"' : '') +
      '><button type="button" class="ordena" data-ordena-coluna="' +
      coluna +
      '" title="Ordenar">' +
      titulo +
      (seta ? ' <span class="seta">' + seta + '</span>' : '') +
      '</button></th>'
    );
  }

  function urgencia(p) {
    return (
      '<span class="barra-urgencia urgencia-' +
      p +
      '" title="Urgência: ' +
      Ui.esc(HD.rotulosPrioridade[p]) +
      '"></span><span class="sr-only">' +
      Ui.esc(HD.rotulosPrioridade[p]) +
      '</span>'
    );
  }

  function linha(c) {
    var marcado = estado.selecionados.indexOf(c.numero) !== -1;
    var corServico = c.servico ? Ui.corSegura(c.servico.cor) : 'var(--cor-borda-forte)';
    return (
      '<tr data-numero="' +
      c.numero +
      '"' +
      (marcado ? ' class="selecionada"' : '') +
      '>' +
      '<td class="selecao"><input type="checkbox" data-seleciona="' +
      c.numero +
      '" aria-label="Selecionar chamado ' +
      c.numero +
      '"' +
      (marcado ? ' checked' : '') +
      ' /></td>' +
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
      '</a>' +
      (c.tags && c.tags.length ? '<div class="tags-linha">' + Ui.tags(c.tags) + '</div>' : '') +
      '</td>' +
      '<td class="data-fila" title="Atualizado ' +
      Ui.esc(Ui.relativo(c.updatedAt)) +
      '">' +
      Ui.data(c.createdAt) +
      '</td>' +
      '<td class="cliente-fila">' +
      Ui.esc(c.solicitante ? c.solicitante.nome : '—') +
      (c.empresa ? '<div class="suave pequeno">' + Ui.esc(c.empresa.nome) + '</div>' : '') +
      '</td>' +
      '<td class="responsavel-fila">' +
      (c.responsavel ? Ui.esc(c.responsavel.nome) : '<span class="suave">Sem responsável</span>') +
      (c.equipe ? '<div class="suave pequeno">' + Ui.esc(c.equipe.nome) + '</div>' : '') +
      '</td>' +
      '<td class="ocultar-mobile">' +
      (c.categoria ? Ui.esc(c.categoria.nome) : '<span class="suave">—</span>') +
      '</td>' +
      '<td class="coluna-urgencia">' +
      urgencia(c.prioridade) +
      '</td>' +
      '<td>' +
      Ui.badgeStatus(c.status) +
      '</td>' +
      '<td>' +
      Ui.sla(c) +
      '</td>' +
      '<td class="ocultar-mobile justificativa-fila">' +
      (c.justificativa ? Ui.esc(c.justificativa.nome) : '') +
      '</td>' +
      '</tr>'
    );
  }

  function tabela() {
    var todos =
      estado.chamados.length &&
      estado.chamados.every(function (c) {
        return estado.selecionados.indexOf(c.numero) !== -1;
      });
    return (
      '<table class="tabela-chamados"><thead><tr>' +
      '<th class="selecao"><input type="checkbox" data-seleciona-todos aria-label="Selecionar todos da página"' +
      (todos ? ' checked' : '') +
      ' /></th>' +
      '<th>Nº</th><th class="coluna-tipo"><span class="sr-only">Serviço</span></th>' +
      '<th>Assunto</th>' +
      cabecalho('Aberto em', 'aberto') +
      '<th>Cliente</th><th>Responsável</th><th class="ocultar-mobile">Categoria</th>' +
      cabecalho('Urgência', 'urgencia', 'coluna-urgencia') +
      '<th>Status</th><th>SLA</th><th class="ocultar-mobile">Justificativa</th>' +
      '</tr></thead><tbody>' +
      estado.chamados.map(linha).join('') +
      '</tbody></table>'
    );
  }

  function atualizaOpcoes() {
    var n = estado.selecionados.length;
    Ui.$('#botao-opcoes').innerHTML =
      'Opções' +
      (n ? ' <span class="qtd-selecionada">' + n + '</span>' : '') +
      ' <span aria-hidden="true">⋮</span>';
    Ui.$('[data-opcao="assumir"]').disabled = !n;
  }

  async function carrega() {
    var minha = ++requisicaoAtual; // descarta respostas antigas quando o filtro muda rápido
    if (!estado.chamados.length) conteudo.innerHTML = Ui.carregando('Carregando fila...');
    else conteudo.classList.add('recarregando');
    try {
      var r = await Api.get(
        '/chamados',
        Object.assign({}, estado.filtros, { pagina: estado.pagina, porPagina: estado.porPagina }),
      );
      if (minha !== requisicaoAtual) return;
      conteudo.classList.remove('recarregando');
      estado.chamados = r.chamados;
      var p = r.paginacao;
      var ini = (p.pagina - 1) * p.porPagina + 1;
      var fim = Math.min(p.pagina * p.porPagina, p.total);
      Ui.$('#resumo').textContent = p.total
        ? 'Exibindo de ' + ini + ' até ' + fim + ' de um total de ' + p.total + ' registro(s)'
        : 'Nenhum registro encontrado';

      conteudo.innerHTML = r.chamados.length
        ? tabela()
        : Ui.vazio(
            'Nenhum chamado por aqui',
            estado.filtros.busca
              ? 'Nada encontrado para "' + estado.filtros.busca + '". Tente outro termo.'
              : 'Ajuste os filtros ou escolha outra visualização.',
          );
      atualizaOpcoes();

      Ui.paginacao(Ui.$('#paginacao'), p, function (pagina) {
        estado.pagina = pagina;
        carrega();
        Ui.$('.tabela-fila').scrollIntoView({ block: 'start' });
      });
    } catch (e) {
      if (minha !== requisicaoAtual) return;
      conteudo.classList.remove('recarregando');
      Ui.$('#paginacao').innerHTML = '';
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  // ---------------------------------------------------------------- eventos da tabela
  conteudo.addEventListener('change', function (e) {
    var caixa = e.target.closest('[data-seleciona]');
    if (caixa) {
      var n = Number(caixa.getAttribute('data-seleciona'));
      estado.selecionados = caixa.checked
        ? estado.selecionados.concat(n)
        : estado.selecionados.filter(function (x) {
            return x !== n;
          });
      caixa.closest('tr').classList.toggle('selecionada', caixa.checked);
      var todos = conteudo.querySelector('[data-seleciona-todos]');
      if (todos) {
        todos.checked = estado.chamados.every(function (c) {
          return estado.selecionados.indexOf(c.numero) !== -1;
        });
      }
      atualizaOpcoes();
      return;
    }
    if (e.target.closest('[data-seleciona-todos]')) {
      var numeros = estado.chamados.map(function (c) {
        return c.numero;
      });
      estado.selecionados = e.target.checked
        ? Array.from(new Set(estado.selecionados.concat(numeros)))
        : estado.selecionados.filter(function (x) {
            return numeros.indexOf(x) === -1;
          });
      conteudo.innerHTML = tabela();
      atualizaOpcoes();
    }
  });

  conteudo.addEventListener('click', function (e) {
    var ordena = e.target.closest('[data-ordena-coluna]');
    if (ordena) {
      var coluna = ordena.getAttribute('data-ordena-coluna');
      var atual = estado.filtros.ordenar || 'atualizacao';
      var ordem =
        coluna === 'aberto'
          ? atual === 'recentes'
            ? 'antigos'
            : 'recentes'
          : atual === 'prioridade'
            ? 'atualizacao'
            : 'prioridade';
      aplica(Object.assign(copia(estado.filtros), { ordenar: ordem }));
      return;
    }
    if (e.target.closest('a, input, button, label')) return;
    var tr = e.target.closest('tr[data-numero]');
    if (tr) window.location.href = '/chamados/' + tr.getAttribute('data-numero');
  });

  // ---------------------------------------------------------------- painel de visualizações
  Ui.$('#fila-layout').addEventListener('click', function (e) {
    var padrao = e.target.closest('[data-visao]');
    if (padrao) {
      var v = VISOES.filter(function (x) {
        return x.id === padrao.getAttribute('data-visao');
      })[0];
      aplica(copia(v.filtros));
      return;
    }
    var pessoal = e.target.closest('[data-visao-pessoal]');
    if (pessoal) {
      aplica(copia(estado.pessoais[Number(pessoal.getAttribute('data-visao-pessoal'))].filtros));
      return;
    }
    var remove = e.target.closest('[data-remove-visao]');
    if (remove) {
      var i = Number(remove.getAttribute('data-remove-visao'));
      if (!window.confirm('Excluir a visualização "' + estado.pessoais[i].nome + '"?')) return;
      estado.pessoais.splice(i, 1);
      grava(CHAVE_PESSOAIS, estado.pessoais);
      desenhaVisoes();
    }
  });

  function mostraPainel(visivel) {
    Ui.$('#fila-layout').classList.toggle('sem-painel', !visivel);
    Ui.$('#mostrar-visoes').hidden = visivel;
    Ui.$('#recolher-visoes').setAttribute('aria-expanded', String(visivel));
    grava(CHAVE_PAINEL, visivel);
  }
  Ui.$('#recolher-visoes').addEventListener('click', function () {
    mostraPainel(false);
  });
  Ui.$('#mostrar-visoes').addEventListener('click', function () {
    mostraPainel(true);
  });

  // ---------------------------------------------------------------- busca, filtros e opções
  var campoBusca = Ui.$('#busca-fila');
  function buscaAgora() {
    var termo = campoBusca.value.trim();
    // número do chamado busca na hora; texto a partir de 3 caracteres
    if (termo && termo.length < MINIMO_BUSCA && !/^#?\d+$/.test(termo)) return;
    if ((estado.filtros.busca || '') === termo) return;
    var f = copia(estado.filtros);
    if (termo) f.busca = termo;
    else delete f.busca;
    aplica(f, { semRemontar: true });
  }
  campoBusca.addEventListener('input', Ui.debounce(buscaAgora, 350));
  campoBusca.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') buscaAgora();
  });
  Ui.$('#botao-buscar').addEventListener('click', buscaAgora);

  var botaoFiltros = Ui.$('#botao-filtros');
  botaoFiltros.addEventListener('click', function () {
    var abrir = painelFiltros.hidden;
    painelFiltros.hidden = !abrir;
    botaoFiltros.setAttribute('aria-expanded', String(abrir));
    botaoFiltros.classList.toggle('ativo', abrir);
  });

  function limpaTudo() {
    campoBusca.value = '';
    aplica({});
  }
  Ui.$('#botao-limpar').addEventListener('click', limpaTudo);

  Ui.$('#por-pagina').value = String(estado.porPagina);
  Ui.$('#por-pagina').addEventListener('change', function (e) {
    estado.porPagina = Number(e.target.value);
    estado.pagina = 1;
    grava(CHAVE_POR_PAGINA, estado.porPagina);
    carrega();
  });

  var botaoOpcoes = Ui.$('#botao-opcoes');
  var menuOpcoes = Ui.$('#menu-opcoes');
  botaoOpcoes.addEventListener('click', function (e) {
    e.stopPropagation();
    menuOpcoes.hidden = !menuOpcoes.hidden;
    botaoOpcoes.setAttribute('aria-expanded', String(!menuOpcoes.hidden));
  });
  document.addEventListener('click', function (e) {
    if (!menuOpcoes.hidden && !e.target.closest('.menu-opcoes')) {
      menuOpcoes.hidden = true;
      botaoOpcoes.setAttribute('aria-expanded', 'false');
    }
  });

  async function assumeSelecionados() {
    var numeros = estado.selecionados.slice();
    var falhas = [];
    for (var i = 0; i < numeros.length; i++) {
      try {
        await Api.post('/chamados/' + numeros[i] + '/assumir', {});
      } catch (e) {
        falhas.push(
          '#' + numeros[i] + ': ' + (e.detalhes ? Object.values(e.detalhes)[0] : e.message),
        );
      }
    }
    var feitos = numeros.length - falhas.length;
    if (feitos) Ui.toast(feitos + ' chamado(s) atribuído(s) a você', 'sucesso');
    if (falhas.length) Ui.toast(falhas.join(' | '), 'erro');
    estado.selecionados = [];
    carrega();
  }

  function salvaVisao() {
    var nome = window.prompt('Nome da visualização pessoal:', '');
    if (nome === null) return;
    nome = nome.trim().slice(0, 60);
    if (!nome) return Ui.toast('Informe um nome para a visualização', 'erro');
    var filtros = copia(estado.filtros);
    delete filtros.busca;
    estado.pessoais.push({ nome: nome, filtros: filtros });
    grava(CHAVE_PESSOAIS, estado.pessoais);
    desenhaVisoes();
    Ui.toast('Visualização "' + nome + '" salva', 'sucesso');
  }

  menuOpcoes.addEventListener('click', function (e) {
    var b = e.target.closest('[data-opcao]');
    if (!b || b.disabled) return;
    menuOpcoes.hidden = true;
    var opcao = b.getAttribute('data-opcao');
    if (opcao === 'assumir') assumeSelecionados();
    if (opcao === 'salvar') salvaVisao();
    if (opcao === 'kanban') window.location.href = '/agente/kanban' + window.location.search;
    if (opcao === 'limpar') limpaTudo();
  });

  // ---------------------------------------------------------------- início
  // telas estreitas começam com o painel recolhido
  mostraPainel(le(CHAVE_PAINEL, window.innerWidth > 900));
  campoBusca.value = estado.filtros.busca || '';
  montaFiltros();
  desenhaVisoes();
  carrega();
})();
