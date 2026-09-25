// Tela de configurações (/admin/configuracoes#secao): cadastros e parâmetros da conta.
(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  if (usuario.papel !== 'admin') {
    window.location.replace('/agente');
    return;
  }
  Ui.navbar(usuario);

  var conteudo = Ui.$('#conteudo');
  var barra = Ui.$('#barra');
  var PAPEIS = { cliente: 'Cliente', agente: 'Agente', admin: 'Admin' };
  var CORES = [
    '#c2410c',
    '#2458d6',
    '#7a3fd1',
    '#1f8a4c',
    '#b86a00',
    '#c62f3a',
    '#0e7c86',
    '#5f6b7e',
  ];
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var FUSOS = [
    { valor: -120, rotulo: 'UTC-2 (Fernando de Noronha)' },
    { valor: -180, rotulo: 'UTC-3 (Brasília)' },
    { valor: -240, rotulo: 'UTC-4 (Amazonas, Mato Grosso)' },
    { valor: -300, rotulo: 'UTC-5 (Acre)' },
  ];
  var dados = {
    equipes: [],
    servicos: [],
    usuarios: [],
    categorias: [],
    empresas: [],
    tags: [],
    justificativas: [],
    feriados: [],
    macros: [],
    perfis: [],
    cargos: [],
    classificacoes: [],
    camposAdicionais: [],
    regrasExibicao: [],
    avisos: [],
  };
  var filtroUsuarios = { busca: '', papel: '', empresa: '' };

  function opcoesDe(lista, rotulo) {
    return lista.map(function (x) {
      return { valor: x._id, rotulo: rotulo ? rotulo(x) : x.nome };
    });
  }
  function comInativo(x) {
    var ativo = x.ativa !== undefined ? x.ativa : x.ativo;
    return x.nome + (ativo === false ? ' (inativa)' : '');
  }

  // ================================================================ modal genérico
  var modal = Ui.$('#modal');
  var formModal = Ui.$('#form-modal');
  var aoSalvarModal = null;
  // registro aberto para edição (habilita o botão Excluir do modal); null = cadastro novo
  var edicaoAtual = null;

  function campoHtml(c) {
    if (c.tipo === 'titulo') return '<h3 class="titulo-secao-form">' + Ui.esc(c.rotulo) + '</h3>';

    var id = 'm-' + c.nome.replace(/\W/g, '-');
    var obrig = c.obrigatorio ? ' required' : '';
    var controle;
    if (c.tipo === 'select') {
      controle =
        '<select id="' +
        id +
        '" name="' +
        c.nome +
        '"' +
        obrig +
        '>' +
        Ui.opcoes(c.opcoes, c.valor, c.vazio) +
        '</select>';
    } else if (c.tipo === 'textarea') {
      controle =
        '<textarea id="' +
        id +
        '" name="' +
        c.nome +
        '" rows="' +
        (c.linhas || 3) +
        '">' +
        Ui.esc(c.valor || '') +
        '</textarea>';
    } else if (c.tipo === 'checkbox') {
      // booleano único: o rótulo fica ao lado da caixa
      return (
        '<div class="campo" data-campo="' +
        c.nome +
        '"' +
        (c.oculto ? ' hidden' : '') +
        '><label class="checkbox-linha"><input type="checkbox" data-unico name="' +
        c.nome +
        '"' +
        (c.valor ? ' checked' : '') +
        ' /> ' +
        Ui.esc(c.rotulo) +
        '</label>' +
        (c.ajuda ? '<span class="ajuda">' + Ui.esc(c.ajuda) + '</span>' : '') +
        '</div>'
      );
    } else if (c.tipo === 'listaSelecao') {
      // lista de pessoas com busca, "selecionar todos" e contador
      var marcados = c.valor || [];
      controle =
        '<div class="lista-selecao" id="' +
        id +
        '">' +
        '<div class="topo-lista-selecao">' +
        '<input type="search" class="busca-lista-selecao" placeholder="' +
        Ui.esc(c.placeholderBusca || 'Buscar por nome ou e-mail') +
        '" aria-label="Buscar na lista" />' +
        '<span class="acoes-lista-selecao"><span class="contador-selecao" aria-live="polite"></span>' +
        '<button type="button" class="link-selecao" data-selecionar-todos>Selecionar todos</button>' +
        '<button type="button" class="link-selecao" data-limpar-selecao>Limpar</button></span>' +
        '</div>' +
        '<div class="itens-lista-selecao" data-grupo="' +
        c.nome +
        '" role="group" aria-label="' +
        Ui.esc(c.rotulo) +
        '">' +
        c.opcoes
          .map(function (o) {
            var marcado = marcados.indexOf(o.valor) !== -1;
            return (
              '<label class="item-selecao' +
              (marcado ? ' marcado' : '') +
              '" data-busca="' +
              Ui.esc(((o.rotulo || '') + ' ' + (o.detalhe || '')).toLowerCase()) +
              '"><input type="checkbox" value="' +
              Ui.esc(o.valor) +
              '"' +
              (marcado ? ' checked' : '') +
              ' />' +
              (o.pessoa ? Ui.avatar(o.pessoa) : '') +
              '<span class="texto-item-selecao"><strong>' +
              Ui.esc(o.rotulo) +
              '</strong>' +
              (o.detalhe ? '<span>' + Ui.esc(o.detalhe) + '</span>' : '') +
              '</span>' +
              (o.selo ? '<span class="selo-item-selecao">' + Ui.esc(o.selo) + '</span>' : '') +
              '</label>'
            );
          })
          .join('') +
        '<p class="vazio-lista-selecao"' +
        (c.opcoes.length ? ' hidden' : '') +
        '>' +
        Ui.esc(c.opcoes.length ? 'Ninguém encontrado' : c.semOpcoes || 'Nada cadastrado') +
        '</p>' +
        '</div></div><input type="hidden" name="' +
        c.nome +
        '" />';
    } else if (c.tipo === 'checkboxes') {
      controle =
        '<div class="checkboxes" id="' +
        id +
        '" data-grupo="' +
        c.nome +
        '">' +
        c.opcoes
          .map(function (o) {
            var marcado = (c.valor || []).indexOf(o.valor) !== -1 ? ' checked' : '';
            return (
              '<label><input type="checkbox" value="' +
              Ui.esc(o.valor) +
              '"' +
              marcado +
              ' /> ' +
              Ui.esc(o.rotulo) +
              '</label>'
            );
          })
          .join('') +
        (c.opcoes.length
          ? ''
          : '<span class="suave">' + Ui.esc(c.semOpcoes || 'Nada cadastrado') + '</span>') +
        '</div><input type="hidden" name="' +
        c.nome +
        '" />';
    } else {
      controle =
        '<input id="' +
        id +
        '" name="' +
        c.nome +
        '" type="' +
        (c.tipo || 'text') +
        '" value="' +
        Ui.esc(c.valor === undefined || c.valor === null ? '' : c.valor) +
        '"' +
        obrig +
        (c.placeholder ? ' placeholder="' + Ui.esc(c.placeholder) + '"' : '') +
        (c.extra || '') +
        ' />';
    }
    return (
      '<div class="campo" data-campo="' +
      c.nome +
      '"' +
      (c.oculto ? ' hidden' : '') +
      '><label for="' +
      id +
      '">' +
      Ui.esc(c.rotulo) +
      '</label>' +
      controle +
      (c.ajuda ? '<span class="ajuda">' + Ui.esc(c.ajuda) + '</span>' : '') +
      '</div>'
    );
  }

  /**
   * @param {{ titulo: string, campos: object[], aoSalvar: (valores: object) => Promise<any>, aoMontar?: (form: HTMLFormElement) => void }} cfg
   */
  function abreModal(cfg) {
    Ui.$('#modal-titulo').textContent = cfg.titulo;
    Ui.$('#modal-aviso').innerHTML = '';
    Ui.$('#modal-campos').innerHTML = cfg.campos.map(campoHtml).join('');
    aoSalvarModal = cfg.aoSalvar;
    Ui.$('#modal-excluir').hidden = !edicaoAtual;
    formModal.querySelectorAll('.lista-selecao').forEach(atualizaListaSelecao);
    if (cfg.aoMontar) cfg.aoMontar(formModal);
    modal.showModal();
    var primeiro = formModal.querySelector('input:not([type=hidden]), select, textarea');
    if (primeiro) primeiro.focus();
  }

  function valoresDoModal() {
    var valores = {};
    Array.prototype.forEach.call(formModal.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        if (el.hasAttribute('data-unico')) valores[el.name] = el.checked;
        return;
      }
      valores[el.name] = el.type === 'number' ? Number(el.value) : el.value;
    });
    formModal.querySelectorAll('[data-grupo]').forEach(function (g) {
      valores[g.getAttribute('data-grupo')] = Array.prototype.map.call(
        g.querySelectorAll('input:checked'),
        function (i) {
          return i.value;
        },
      );
    });
    return valores;
  }

  // ---------------------------------------------------------------- lista de seleção (campo "listaSelecao")
  function atualizaListaSelecao(lista) {
    var itens = lista.querySelectorAll('.item-selecao');
    var n = 0;
    itens.forEach(function (item) {
      var marcado = item.querySelector('input').checked;
      item.classList.toggle('marcado', marcado);
      if (marcado) n += 1;
    });
    lista.querySelector('.contador-selecao').textContent =
      n + (n === 1 ? ' selecionado' : ' selecionados') + ' de ' + itens.length;
  }

  formModal.addEventListener('input', function (e) {
    if (!e.target.classList.contains('busca-lista-selecao')) return;
    var lista = e.target.closest('.lista-selecao');
    var termo = semAcento(e.target.value.trim());
    var visiveis = 0;
    lista.querySelectorAll('.item-selecao').forEach(function (item) {
      var aparece = !termo || semAcento(item.getAttribute('data-busca')).indexOf(termo) !== -1;
      item.hidden = !aparece;
      if (aparece) visiveis += 1;
    });
    var vazio = lista.querySelector('.vazio-lista-selecao');
    vazio.textContent = 'Ninguém encontrado';
    vazio.hidden = visiveis > 0;
  });

  formModal.addEventListener('change', function (e) {
    var lista = e.target.closest('.lista-selecao');
    if (lista && e.target.type === 'checkbox') atualizaListaSelecao(lista);
  });

  formModal.addEventListener('click', function (e) {
    var todos = e.target.closest('[data-selecionar-todos]');
    var limpar = e.target.closest('[data-limpar-selecao]');
    if (!todos && !limpar) return;
    var lista = e.target.closest('.lista-selecao');
    // "selecionar todos" respeita a busca: marca só quem está aparecendo
    lista.querySelectorAll('.item-selecao').forEach(function (item) {
      if (todos && item.hidden) return;
      item.querySelector('input').checked = Boolean(todos);
    });
    atualizaListaSelecao(lista);
  });

  function editaRegistro(tipo, id) {
    var item = acha(tipo, id);
    edicaoAtual = SECOES[tipo].rota ? { tipo: tipo, item: item } : null;
    SECOES[tipo].form(item);
  }

  modal.addEventListener('close', function () {
    edicaoAtual = null;
  });

  // Excluir pelo modal de edição: confirma e, se o registro estiver em uso, a API recusa com o motivo
  Ui.$('#modal-excluir').addEventListener('click', async function () {
    if (!edicaoAtual) return;
    var secao = SECOES[edicaoAtual.tipo];
    var item = edicaoAtual.item;
    var nome = item.nome || item.titulo || 'este registro';
    if (
      !window.confirm(
        'Excluir ' +
          secao.rotulo +
          ' "' +
          nome +
          '"?\n\nEssa ação não pode ser desfeita. Se estiver em uso, a exclusão é recusada e você pode desabilitar o registro.',
      )
    ) {
      return;
    }
    var restaura = Ui.ocupado(Ui.$('#modal-excluir'), 'Excluindo...');
    try {
      await Api.del(secao.rota + '/' + item._id);
      restaura();
      modal.close();
      Ui.toast(nome + ' excluído(a)', 'sucesso');
      renderizaSecao();
    } catch (erro) {
      restaura();
      Ui.$('#modal-aviso').innerHTML =
        '<div class="alerta erro">' +
        Ui.esc(erro.detalhes ? Object.values(erro.detalhes)[0] : erro.message) +
        '</div>';
    }
  });

  Ui.$('#modal-cancelar').addEventListener('click', function () {
    modal.close();
  });

  formModal.addEventListener('submit', async function (e) {
    e.preventDefault();
    Ui.$('#modal-aviso').innerHTML = '';
    Ui.errosDeCampo(formModal, {});
    var restaura = Ui.ocupado(Ui.$('#modal-salvar'), 'Salvando...');
    try {
      await aoSalvarModal(valoresDoModal());
      restaura();
      modal.close();
      Ui.toast('Salvo com sucesso', 'sucesso');
      renderizaSecao();
    } catch (erro) {
      restaura();
      Ui.errosDeCampo(formModal, erro.detalhes);
      Ui.$('#modal-aviso').innerHTML =
        '<div class="alerta erro">' + Ui.esc(erro.message) + '</div>';
    }
  });

  // ================================================================ ações comuns
  function acha(tipo, id) {
    return dados[tipo].filter(function (x) {
      return x._id === id;
    })[0];
  }

  // ================================================================ lista dos cadastros (padrão Movidesk)
  // Contagem de registros, botão +, menu OPÇÕES (ações em lote), busca a partir de
  // 3 caracteres, ordenação por coluna, seleção por checkbox e coluna Habilitado.
  // Clicar na linha abre a edição.
  var MINIMO_BUSCA = 3;
  var ajudaAtual = '';
  var listas = {}; // estado por seção: { busca, ordem: { coluna, crescente }, selecionados }
  var listaAtual = null; // { tipo, colunas, vazio }
  var auxiliarTexto = document.createElement('div');

  function textoDe(html) {
    auxiliarTexto.innerHTML = html;
    return auxiliarTexto.textContent.trim();
  }

  function semAcento(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function estadoDaLista(tipo, colunaPadrao) {
    listas[tipo] = listas[tipo] || {
      busca: '',
      ordem: { coluna: colunaPadrao || 0, crescente: true },
      selecionados: [],
    };
    return listas[tipo];
  }

  // texto de ajuda abaixo da contagem, no cabeçalho da página
  function mostraAjuda(texto) {
    var el = Ui.$('#ajuda-secao');
    el.textContent = texto || '';
    el.hidden = !texto;
  }

  // "Id" numérico na primeira coluna, como no Movidesk
  var COLUNA_ID = {
    titulo: 'Id',
    classe: 'coluna-id',
    valor: function (x) {
      return x.codigo === undefined ? '—' : String(x.codigo);
    },
    ordena: function (x) {
      return x.codigo || 0;
    },
  };

  var ICONE_MAIS =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>';
  var ICONE_HABILITADO =
    '<svg class="icone-habilitado" viewBox="0 0 24 24" aria-label="Habilitado"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>';
  var ICONE_DESABILITADO =
    '<svg class="icone-desabilitado" viewBox="0 0 24 24" aria-label="Desabilitado"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>';

  /**
   * Monta a lista da seção na barra (topo) e no conteúdo.
   * @param {string} tipo  chave de SECOES e de dados
   * @param {{ titulo: string, valor: (item: any) => string, ordena?: (item: any) => any, classe?: string }[]} colunas
   * @param {[string, string]} vazio  título e texto do estado vazio
   * @param {{ html: string, liga?: () => void }} [extras]  botões ou filtros extras no topo
   */
  function tabela(tipo, colunas, vazio, extras) {
    colunas = [COLUNA_ID].concat(colunas);
    listaAtual = { tipo: tipo, colunas: colunas, vazio: vazio };
    // ordena pelo nome (2ª coluna) até o usuário escolher outra
    var estado = estadoDaLista(tipo, 1);
    var secao = SECOES[tipo];
    mostraAjuda(ajudaAtual);

    barra.innerHTML =
      '<div class="lista-acoes">' +
      (extras ? extras.html : '') +
      '<button type="button" class="botao-novo" data-acao="nova" data-tipo="' +
      tipo +
      '" title="Novo(a) ' +
      Ui.esc(secao.rotulo) +
      '" aria-label="Novo(a) ' +
      Ui.esc(secao.rotulo) +
      '">' +
      ICONE_MAIS +
      '</button>' +
      '<div class="menu-opcoes"><button type="button" class="botao-opcoes" id="botao-opcoes" aria-haspopup="true" aria-expanded="false">Opções <span aria-hidden="true">⋮</span></button>' +
      '<div class="menu-lote" id="menu-lote" role="menu" hidden>' +
      '<button type="button" role="menuitem" data-lote="habilitar">Habilitar selecionados</button>' +
      '<button type="button" role="menuitem" data-lote="desabilitar">Desabilitar selecionados</button>' +
      '<button type="button" role="menuitem" data-lote="remover" class="perigo">Remover selecionados</button>' +
      '</div></div>' +
      '<div class="busca-lista"><div class="campo-lupa"><input type="search" id="busca-lista" placeholder="Pesquisar" aria-label="Pesquisar" value="' +
      Ui.esc(estado.busca) +
      '" /><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></div>' +
      '<span class="ajuda">Digite pelo menos ' +
      MINIMO_BUSCA +
      ' caracteres para iniciar a busca.</span></div>' +
      '</div>';

    if (extras && extras.liga) extras.liga();

    var busca = Ui.$('#busca-lista');
    busca.addEventListener(
      'input',
      Ui.debounce(function () {
        estado.busca = busca.value.trim();
        desenhaLinhas();
      }, 200),
    );

    var botaoOpcoes = Ui.$('#botao-opcoes');
    var menu = Ui.$('#menu-lote');
    botaoOpcoes.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      botaoOpcoes.setAttribute('aria-expanded', String(!menu.hidden));
    });

    desenhaLinhas();
  }

  // linhas visíveis: busca (a partir de 3 caracteres) + ordenação
  function linhasVisiveis() {
    var tipo = listaAtual.tipo;
    var estado = estadoDaLista(tipo);
    var colunas = listaAtual.colunas;
    var campoAtivo = SECOES[tipo].campoAtivo;
    var termo = estado.busca.length >= MINIMO_BUSCA ? semAcento(estado.busca) : '';

    var itens = dados[tipo].filter(function (item) {
      if (!termo) return true;
      return colunas.some(function (c) {
        return semAcento(textoDe(c.valor(item))).indexOf(termo) !== -1;
      });
    });

    // a última "coluna" (índice = colunas.length) é Habilitado
    var i = estado.ordem.coluna;
    var chave =
      i >= colunas.length
        ? function (item) {
            return item[campoAtivo] ? 0 : 1;
          }
        : colunas[i].ordena ||
          function (item) {
            return semAcento(textoDe(colunas[i].valor(item)));
          };
    var sinal = estado.ordem.crescente ? 1 : -1;
    return itens.slice().sort(function (a, b) {
      var x = chave(a);
      var y = chave(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sinal;
      return String(x).localeCompare(String(y), 'pt-BR', { numeric: true }) * sinal;
    });
  }

  function cabecalhoOrdenavel(titulo, indice, classe) {
    var ordem = estadoDaLista(listaAtual.tipo).ordem;
    var ativa = ordem.coluna === indice;
    return (
      '<th' +
      (classe ? ' class="' + classe + '"' : '') +
      (ativa ? ' aria-sort="' + (ordem.crescente ? 'ascending' : 'descending') + '"' : '') +
      '><button type="button" class="ordena" data-ordena="' +
      indice +
      '">' +
      (ativa
        ? '<span class="seta" aria-hidden="true">' + (ordem.crescente ? '↑' : '↓') + '</span>'
        : '') +
      titulo +
      '</button></th>'
    );
  }

  function desenhaLinhas() {
    var tipo = listaAtual.tipo;
    var colunas = listaAtual.colunas;
    var estado = estadoDaLista(tipo);
    var campoAtivo = SECOES[tipo].campoAtivo;
    var total = dados[tipo].length;
    var itens = linhasVisiveis();

    // seleção só do que ainda existe
    var ids = dados[tipo].map(function (x) {
      return x._id;
    });
    estado.selecionados = estado.selecionados.filter(function (id) {
      return ids.indexOf(id) !== -1;
    });

    Ui.$('#contagem').textContent = itens.length
      ? 'Exibindo de 1 até ' + itens.length + ' de um total de ' + total + ' registro(s)'
      : total
        ? 'Nenhum registro encontrado de um total de ' + total
        : 'Nenhum registro cadastrado';
    atualizaMenuLote();

    if (!total) {
      conteudo.innerHTML = Ui.vazio(listaAtual.vazio[0], listaAtual.vazio[1]);
      return;
    }
    if (!itens.length) {
      conteudo.innerHTML = Ui.vazio('Nada encontrado', 'Tente outro termo de busca.');
      return;
    }

    var todosMarcados = itens.every(function (x) {
      return estado.selecionados.indexOf(x._id) !== -1;
    });

    conteudo.innerHTML =
      '<section class="cartao tabela-container"><table class="admin-tabela lista-cadastro"><thead><tr>' +
      '<th class="selecao"><input type="checkbox" data-seleciona-todos aria-label="Selecionar todos"' +
      (todosMarcados ? ' checked' : '') +
      ' /></th>' +
      colunas
        .map(function (c, i) {
          return cabecalhoOrdenavel(c.titulo, i, c.classe);
        })
        .join('') +
      cabecalhoOrdenavel('Habilitado', colunas.length, 'coluna-habilitado') +
      '</tr></thead><tbody>' +
      itens
        .map(function (item) {
          var ativo = item[campoAtivo];
          var marcado = estado.selecionados.indexOf(item._id) !== -1;
          return (
            '<tr data-editar="' +
            item._id +
            '" class="' +
            (ativo ? '' : 'inativo') +
            (marcado ? ' selecionada' : '') +
            '" tabindex="0" title="Clique para editar">' +
            '<td class="selecao"><input type="checkbox" data-seleciona="' +
            item._id +
            '" aria-label="Selecionar ' +
            Ui.esc(item.nome) +
            '"' +
            (marcado ? ' checked' : '') +
            ' /></td>' +
            colunas
              .map(function (c) {
                return (
                  '<td' +
                  (c.classe ? ' class="' + c.classe + '"' : '') +
                  '>' +
                  c.valor(item) +
                  '</td>'
                );
              })
              .join('') +
            '<td class="coluna-habilitado">' +
            (ativo ? ICONE_HABILITADO : ICONE_DESABILITADO) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></section>';
  }

  function atualizaMenuLote() {
    var n = estadoDaLista(listaAtual.tipo).selecionados.length;
    var botao = Ui.$('#botao-opcoes');
    if (!botao) return;
    botao.innerHTML =
      'Opções' +
      (n ? ' <span class="qtd-selecionada">' + n + '</span>' : '') +
      ' <span aria-hidden="true">⋮</span>';
    document.querySelectorAll('#menu-lote [data-lote]').forEach(function (b) {
      b.disabled = !n;
    });
  }

  // ações em lote sobre os selecionados: uma requisição por item, relatando as falhas
  async function executaEmLote(acao) {
    var tipo = listaAtual.tipo;
    var secao = SECOES[tipo];
    var estado = estadoDaLista(tipo);
    var alvos = estado.selecionados.map(function (id) {
      return acha(tipo, id);
    });
    if (!alvos.length) return;

    if (
      acao === 'remover' &&
      !window.confirm(
        'Remover ' +
          alvos.length +
          ' registro(s)? Os que estiverem em uso serão mantidos. Essa ação não pode ser desfeita.',
      )
    ) {
      return;
    }

    var falhas = [];
    for (var i = 0; i < alvos.length; i++) {
      var item = alvos[i];
      try {
        if (acao === 'remover') {
          await Api.del(secao.rota + '/' + item._id);
        } else {
          var corpo = {};
          corpo[secao.campoAtivo] = acao === 'habilitar';
          await Api.patch(secao.rota + '/' + item._id, corpo);
        }
      } catch (e) {
        falhas.push(item.nome + ': ' + e.message);
      }
    }

    estado.selecionados = [];
    var feitos = alvos.length - falhas.length;
    var verbo = {
      habilitar: 'habilitado(s)',
      desabilitar: 'desabilitado(s)',
      remover: 'removido(s)',
    }[acao];
    if (feitos) Ui.toast(feitos + ' registro(s) ' + verbo, 'sucesso');
    if (falhas.length) Ui.toast(falhas.join(' | '), 'erro');
    await renderizaSecao();
  }

  // eventos da lista (delegados: a lista é redesenhada a cada mudança)
  conteudo.addEventListener('change', function (e) {
    if (!listaAtual) return;
    var estado = estadoDaLista(listaAtual.tipo);
    var caixa = e.target.closest('[data-seleciona]');
    if (caixa) {
      var id = caixa.getAttribute('data-seleciona');
      estado.selecionados = caixa.checked
        ? estado.selecionados.concat(id)
        : estado.selecionados.filter(function (x) {
            return x !== id;
          });
      desenhaLinhas();
      return;
    }
    if (e.target.closest('[data-seleciona-todos]')) {
      var visiveis = linhasVisiveis().map(function (x) {
        return x._id;
      });
      estado.selecionados = e.target.checked
        ? Array.from(new Set(estado.selecionados.concat(visiveis)))
        : estado.selecionados.filter(function (x) {
            return visiveis.indexOf(x) === -1;
          });
      desenhaLinhas();
    }
  });

  conteudo.addEventListener('click', function (e) {
    if (!listaAtual) return;
    var ordena = e.target.closest('[data-ordena]');
    if (ordena) {
      var ordem = estadoDaLista(listaAtual.tipo).ordem;
      var coluna = Number(ordena.getAttribute('data-ordena'));
      ordem.crescente = ordem.coluna === coluna ? !ordem.crescente : true;
      ordem.coluna = coluna;
      desenhaLinhas();
      return;
    }
    // clique na linha (fora da caixa de seleção e de links) abre a edição
    if (e.target.closest('input, a, button')) return;
    var linha = e.target.closest('tr[data-editar]');
    if (linha) editaRegistro(listaAtual.tipo, linha.getAttribute('data-editar'));
  });

  conteudo.addEventListener('keydown', function (e) {
    if (!listaAtual || e.key !== 'Enter') return;
    var linha = e.target.closest('tr[data-editar]');
    if (linha && e.target === linha)
      editaRegistro(listaAtual.tipo, linha.getAttribute('data-editar'));
  });

  barra.addEventListener('click', function (e) {
    var lote = e.target.closest('[data-lote]');
    if (!lote) return;
    Ui.$('#menu-lote').hidden = true;
    executaEmLote(lote.getAttribute('data-lote'));
  });

  // fecha o menu OPÇÕES ao clicar fora
  document.addEventListener('click', function (e) {
    var menu = Ui.$('#menu-lote');
    if (menu && !menu.hidden && !e.target.closest('.menu-opcoes')) {
      menu.hidden = true;
      Ui.$('#botao-opcoes').setAttribute('aria-expanded', 'false');
    }
  });

  // ================================================================ EQUIPES
  // membros escolhidos no próprio formulário; a API de membros é chamada só para o que mudou
  function formEquipe(eq) {
    var agentes = dados.usuarios.filter(function (u) {
      return u.papel !== 'cliente' && (u.ativo || (eq && idsDosMembros(eq).indexOf(u._id) !== -1));
    });
    abreModal({
      titulo: eq ? 'Editar equipe' : 'Nova equipe',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: eq && eq.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Suporte, TI, Auditoria',
        },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', valor: eq && eq.descricao },
        {
          nome: 'membros',
          rotulo: 'Membros',
          tipo: 'listaSelecao',
          valor: eq ? idsDosMembros(eq) : [],
          opcoes: agentes
            .slice()
            .sort(function (a, b) {
              return a.nome.localeCompare(b.nome, 'pt-BR');
            })
            .map(function (u) {
              return {
                valor: u._id,
                rotulo: u.nome,
                detalhe: u.email,
                pessoa: u,
                selo: u.ativo ? (u.papel === 'admin' ? 'Admin' : 'Agente') : 'Desabilitado',
              };
            }),
          semOpcoes: 'Nenhum agente cadastrado',
          ajuda: 'Os membros veem a fila da equipe. Admins atendem qualquer equipe.',
        },
      ],
      aoSalvar: async function (v) {
        var corpo = { nome: v.nome, descricao: v.descricao };
        var salva = eq
          ? await Api.patch('/equipes/' + eq._id, corpo)
          : await Api.post('/equipes', corpo);
        var id = salva.equipe._id;
        var antes = eq ? idsDosMembros(eq) : [];
        var entram = v.membros.filter(function (m) {
          return antes.indexOf(m) === -1;
        });
        var saem = antes.filter(function (m) {
          return v.membros.indexOf(m) === -1;
        });
        for (var i = 0; i < entram.length; i++) {
          await Api.post('/equipes/' + id + '/membros', { usuario: entram[i] });
        }
        for (var j = 0; j < saem.length; j++) {
          await Api.del('/equipes/' + id + '/membros/' + saem[j]);
        }
      },
    });
  }

  function idsDosMembros(eq) {
    return (eq.membros || []).map(function (m) {
      return m._id;
    });
  }

  async function secaoEquipes() {
    ajudaAtual = 'Agentes só veem os chamados das equipes das quais fazem parte.';
    var r = await Promise.all([
      Api.get('/equipes', { todas: 'true' }),
      Api.get('/usuarios', { papel: 'agente,admin' }),
    ]);
    dados.equipes = r[0].equipes;
    dados.usuarios = r[1].usuarios;
    tabela(
      'equipes',
      [
        {
          titulo: 'Nome',
          valor: function (eq) {
            return Ui.esc(eq.nome);
          },
        },
        {
          titulo: 'Membros',
          classe: 'ocultar-mobile',
          valor: function (eq) {
            return eq.membros.length
              ? '<span class="membros-resumo">' +
                  eq.membros
                    .map(function (m) {
                      return Ui.avatar(m);
                    })
                    .join('') +
                  '</span>'
              : '<span class="suave">Nenhum</span>';
          },
          ordena: function (eq) {
            return eq.membros.length;
          },
        },
        {
          titulo: 'Serviços',
          classe: 'ocultar-mobile',
          valor: function (eq) {
            return (
              eq.servicos
                .map(function (s) {
                  return Ui.esc(s.nome);
                })
                .join(', ') || '<span class="suave">—</span>'
            );
          },
        },
        {
          titulo: 'Em aberto',
          classe: 'coluna-numero',
          valor: function (eq) {
            return String(eq.chamadosAbertos);
          },
          ordena: function (eq) {
            return eq.chamadosAbertos;
          },
        },
      ],
      ['Nenhuma equipe cadastrada', 'Crie equipes como Suporte, TI ou Auditoria.'],
    );
  }

  // ================================================================ SERVIÇOS
  function formServico(sv) {
    var ordemSugerida = dados.servicos.length;
    abreModal({
      titulo: sv ? 'Editar serviço' : 'Novo serviço',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: sv && sv.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Suporte, Auditoria, TI',
        },
        {
          nome: 'descricao',
          rotulo: 'Descrição (aparece para o cliente)',
          tipo: 'textarea',
          valor: sv && sv.descricao,
        },
        {
          nome: 'equipe',
          rotulo: 'Equipe que atende',
          tipo: 'select',
          obrigatorio: true,
          vazio: 'Selecione...',
          valor: sv && sv.equipe && sv.equipe._id,
          opcoes: opcoesDe(dados.equipes, comInativo),
          ajuda: sv
            ? 'Mudar a equipe vale para os chamados novos. Os já abertos podem ser transferidos no chamado.'
            : '',
        },
        {
          nome: 'cor',
          rotulo: 'Cor',
          tipo: 'color',
          valor: (sv && sv.cor) || CORES[ordemSugerida % CORES.length],
        },
        {
          nome: 'ordem',
          rotulo: 'Ordem no catálogo',
          tipo: 'number',
          valor: sv ? sv.ordem : ordemSugerida,
        },
      ],
      aoSalvar: function (v) {
        return sv ? Api.patch('/servicos/' + sv._id, v) : Api.post('/servicos', v);
      },
    });
  }

  async function secaoServicos() {
    ajudaAtual =
      'O cliente escolhe um serviço ao abrir o chamado; ele é encaminhado para a equipe do serviço.';
    var r = await Promise.all([
      Api.get('/servicos', { todos: 'true' }),
      Api.get('/equipes', { todas: 'true' }),
    ]);
    dados.servicos = r[0].servicos;
    dados.equipes = r[1].equipes;
    tabela(
      'servicos',
      [
        { titulo: 'Serviço', valor: Ui.servico },
        {
          titulo: 'Descrição',
          classe: 'ocultar-mobile suave',
          valor: function (s) {
            return Ui.esc(s.descricao || '');
          },
        },
        {
          titulo: 'Equipe',
          valor: function (s) {
            return (
              Ui.equipe(s.equipe) +
              (s.equipe && !s.equipe.ativa ? ' <span class="suave">(inativa)</span>' : '')
            );
          },
        },
        {
          titulo: 'Ordem',
          valor: function (s) {
            return s.ordem;
          },
        },
      ],
      [
        'Nenhum serviço no catálogo',
        'Cadastre serviços para os clientes escolherem ao abrir chamados.',
      ],
    );
  }

  // ================================================================ PESSOAS (usuários)
  // tipo de perfil de acesso de cada papel (admin não usa perfil)
  function tipoDePerfil(papel) {
    return papel === 'admin' ? null : papel;
  }

  // "Perfil padrão (Agentes)" + perfis habilitados do tipo (e o atual, mesmo desabilitado)
  function opcoesDePerfil(papel, atualId) {
    var tipo = tipoDePerfil(papel);
    return dados.perfis
      .filter(function (p) {
        return p.tipo === tipo && (p.ativo || p._id === atualId);
      })
      .map(function (p) {
        return { valor: p._id, rotulo: p.nome + (p.ativo ? '' : ' (desabilitado)') };
      });
  }

  function rotuloPerfilPadrao(papel) {
    var padrao = dados.perfis.filter(function (p) {
      return p.tipo === tipoDePerfil(papel) && p.padrao && p.ativo;
    })[0];
    return 'Perfil padrão' + (padrao ? ' (' + padrao.nome + ')' : ' do sistema');
  }

  function formUsuario(u) {
    var idDe = function (x) {
      return x && (x._id || x);
    };
    var ativosOuAtual = function (lista, atual) {
      return lista.filter(function (x) {
        var ativo = x.ativa !== undefined ? x.ativa : x.ativo;
        return ativo || (atual && idDe(atual) === x._id);
      });
    };
    var papelInicial = u ? u.papel : 'cliente';

    abreModal({
      titulo: u ? 'Editar pessoa' : 'Nova pessoa',
      campos: [
        { nome: 'nome', rotulo: 'Nome', valor: u && u.nome, obrigatorio: true },
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', valor: u && u.email, obrigatorio: true },
        {
          nome: 'senha',
          rotulo: u ? 'Nova senha' : 'Senha',
          tipo: 'password',
          obrigatorio: !u,
          ajuda: u ? 'Deixe em branco para manter a senha atual' : 'Mínimo de 6 caracteres',
        },
        {
          nome: 'papel',
          rotulo: 'Tipo de pessoa',
          tipo: 'select',
          valor: papelInicial,
          opcoes: Object.keys(PAPEIS).map(function (p) {
            return { valor: p, rotulo: PAPEIS[p] };
          }),
        },
        {
          nome: 'perfil',
          rotulo: 'Perfil de acesso',
          tipo: 'select',
          vazio: rotuloPerfilPadrao(papelInicial),
          valor: idDe(u && u.perfil),
          opcoes: opcoesDePerfil(papelInicial, idDe(u && u.perfil)),
          ajuda: 'Define o que a pessoa pode fazer. Administradores têm acesso total.',
        },
        {
          nome: 'empresa',
          rotulo: 'Empresa',
          tipo: 'select',
          vazio: 'Sem empresa',
          valor: idDe(u && u.empresa),
          opcoes: opcoesDe(ativosOuAtual(dados.empresas, u && u.empresa)),
          ajuda: 'Os chamados do cliente ficam associados a esta empresa',
        },
        {
          nome: 'cargo',
          rotulo: 'Cargo',
          tipo: 'select',
          vazio: 'Sem cargo',
          valor: idDe(u && u.cargo),
          opcoes: opcoesDe(ativosOuAtual(dados.cargos, u && u.cargo)),
        },
        {
          nome: 'classificacao',
          rotulo: 'Classificação',
          tipo: 'select',
          vazio: 'Sem classificação',
          valor: idDe(u && u.classificacao),
          opcoes: opcoesDe(ativosOuAtual(dados.classificacoes, u && u.classificacao)),
        },
        {
          nome: 'equipes',
          rotulo: 'Equipes',
          tipo: 'checkboxes',
          valor: u
            ? (u.equipes || []).map(function (e) {
                return e._id;
              })
            : [],
          opcoes: opcoesDe(dados.equipes, comInativo),
          semOpcoes: 'Nenhuma equipe cadastrada',
          ajuda: 'O agente verá a fila das equipes marcadas',
        },
      ],
      aoMontar: function (form) {
        // equipes só para agentes e admins; empresa só para clientes; perfil conforme o tipo
        var papel = form.querySelector('[name="papel"]');
        var perfil = form.querySelector('[name="perfil"]');
        function alterna(trocouTipo) {
          form.querySelector('[data-campo="equipes"]').hidden = papel.value === 'cliente';
          form.querySelector('[data-campo="empresa"]').hidden = papel.value !== 'cliente';
          form.querySelector('[data-campo="perfil"]').hidden = papel.value === 'admin';
          if (trocouTipo) {
            perfil.innerHTML = Ui.opcoes(
              opcoesDePerfil(papel.value, null),
              '',
              rotuloPerfilPadrao(papel.value),
            );
          }
        }
        papel.addEventListener('change', function () {
          alterna(true);
        });
        alterna(false);
      },
      aoSalvar: function (v) {
        if (v.papel === 'cliente') v.equipes = [];
        else v.empresa = null;
        if (v.papel === 'admin') v.perfil = null;
        ['empresa', 'perfil', 'cargo', 'classificacao'].forEach(function (campo) {
          v[campo] = v[campo] || null;
        });
        if (u && !v.senha) delete v.senha;
        return u ? Api.patch('/usuarios/' + u._id, v) : Api.post('/usuarios', v);
      },
    });
  }

  function nomePerfilDe(u) {
    if (u.papel === 'admin') return 'Acesso total';
    return u.perfil
      ? Ui.esc(u.perfil.nome)
      : '<span class="suave">' + Ui.esc(rotuloPerfilPadrao(u.papel)) + '</span>';
  }

  async function carregaUsuarios() {
    dados.usuarios = (
      await Api.get('/usuarios', { papel: filtroUsuarios.papel, empresa: filtroUsuarios.empresa })
    ).usuarios;
    tabela(
      'usuarios',
      [
        {
          titulo: 'Nome',
          valor: function (u) {
            return '<span class="servico-cel">' + Ui.avatar(u) + Ui.esc(u.nome) + '</span>';
          },
        },
        {
          titulo: 'E-mail',
          classe: 'ocultar-mobile',
          valor: function (u) {
            return Ui.esc(u.email);
          },
        },
        {
          titulo: 'Tipo',
          valor: function (u) {
            return '<span class="papel">' + PAPEIS[u.papel] + '</span>';
          },
        },
        { titulo: 'Perfil de acesso', classe: 'ocultar-mobile', valor: nomePerfilDe },
        {
          titulo: 'Cargo',
          classe: 'ocultar-mobile',
          valor: function (u) {
            return u.cargo ? Ui.esc(u.cargo.nome) : '<span class="suave">—</span>';
          },
        },
        {
          titulo: 'Empresa / Equipes',
          valor: function (u) {
            if (u.papel === 'cliente') {
              return u.empresa ? Ui.esc(u.empresa.nome) : '<span class="suave">—</span>';
            }
            return (u.equipes || []).map(Ui.equipe).join(' ') || '<span class="suave">—</span>';
          },
        },
      ],
      ['Nenhuma pessoa encontrada', 'Ajuste os filtros ou cadastre uma nova pessoa.'],
      {
        // filtros do servidor; a busca por nome/e-mail é a da própria lista
        html:
          '<select id="papel-usuario" aria-label="Filtrar por tipo">' +
          Ui.opcoes(
            Object.keys(PAPEIS).map(function (p) {
              return { valor: p, rotulo: PAPEIS[p] };
            }),
            filtroUsuarios.papel,
            'Todos os tipos',
          ) +
          '</select><select id="empresa-usuario" aria-label="Filtrar por empresa">' +
          Ui.opcoes(opcoesDe(dados.empresas), filtroUsuarios.empresa, 'Todas as empresas') +
          '</select>',
        liga: function () {
          function recarrega() {
            carregaUsuarios().catch(function (err) {
              Ui.toast(err.message, 'erro');
            });
          }
          Ui.$('#papel-usuario').addEventListener('change', function (e) {
            filtroUsuarios.papel = e.target.value;
            recarrega();
          });
          Ui.$('#empresa-usuario').addEventListener('change', function (e) {
            filtroUsuarios.empresa = e.target.value;
            recarrega();
          });
        },
      },
    );
  }

  async function secaoUsuarios() {
    ajudaAtual = '';
    var r = await Promise.all([
      Api.get('/equipes', { todas: 'true' }),
      Api.get('/empresas', { todos: 'true' }),
      Api.get('/perfis', { todos: 'true' }),
      Api.get('/cargos', { todos: 'true' }),
      Api.get('/classificacoes', { todos: 'true' }),
    ]);
    dados.equipes = r[0].equipes;
    dados.empresas = r[1].empresas;
    dados.perfis = r[2].perfis;
    dados.cargos = r[3].cargos;
    dados.classificacoes = r[4].classificacoes;
    await carregaUsuarios();
  }

  // ================================================================ PERFIS DE ACESSO
  var TIPOS_PERFIL = { agente: 'Agente', cliente: 'Cliente' };

  function formPerfil(p) {
    var tipoInicial = p ? p.tipo : 'agente';
    var permissoes = (p && p.permissoes) || {};

    // uma caixa por permissão do tipo; sem valor salvo, vale o padrão do sistema
    function caixas(tipo) {
      var catalogo = HD.permissoes[tipo];
      return Object.keys(catalogo)
        .map(function (chave) {
          var marcado =
            chave in permissoes && tipo === tipoInicial
              ? permissoes[chave]
              : catalogo[chave].padrao;
          return (
            '<label><input type="checkbox" value="' +
            chave +
            '"' +
            (marcado ? ' checked' : '') +
            ' /> ' +
            Ui.esc(catalogo[chave].rotulo) +
            '</label>'
          );
        })
        .join('');
    }

    abreModal({
      titulo: p ? 'Editar perfil de acesso' : 'Novo perfil de acesso',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: p && p.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Agentes N1, Clientes gestores',
        },
        {
          nome: 'tipo',
          rotulo: 'Perfil de',
          tipo: 'select',
          valor: tipoInicial,
          opcoes: Object.keys(TIPOS_PERFIL).map(function (t) {
            return { valor: t, rotulo: TIPOS_PERFIL[t] };
          }),
          ajuda:
            p && p.totalPessoas ? 'O tipo não pode mudar enquanto houver pessoas no perfil.' : '',
        },
        {
          nome: 'padrao',
          rotulo: 'Perfil padrão (aplicado a quem não tem perfil definido)',
          tipo: 'checkbox',
          valor: p ? p.padrao : false,
        },
        { tipo: 'titulo', nome: '-', rotulo: 'Permissões' },
        {
          nome: 'permissoes',
          rotulo: 'O que as pessoas deste perfil podem fazer',
          tipo: 'checkboxes',
          valor: [],
          opcoes: [],
        },
      ],
      aoMontar: function (form) {
        var tipo = form.querySelector('[name="tipo"]');
        var grupo = form.querySelector('[data-grupo="permissoes"]');
        grupo.classList.add('lista-permissoes');
        function desenha() {
          grupo.innerHTML = caixas(tipo.value);
        }
        tipo.addEventListener('change', desenha);
        desenha();
      },
      aoSalvar: function (v) {
        // envia todas as permissões do tipo (marcadas = true, demais = false)
        var marcadas = v.permissoes;
        var corpo = { nome: v.nome, tipo: v.tipo, padrao: v.padrao, permissoes: {} };
        Object.keys(HD.permissoes[v.tipo]).forEach(function (chave) {
          corpo.permissoes[chave] = marcadas.indexOf(chave) !== -1;
        });
        return p ? Api.patch('/perfis/' + p._id, corpo) : Api.post('/perfis', corpo);
      },
    });
  }

  async function secaoPerfis() {
    ajudaAtual =
      'Quem não tem perfil definido usa o perfil padrão do seu tipo. Administradores têm acesso total.';
    dados.perfis = (await Api.get('/perfis', { todos: 'true' })).perfis;
    tabela(
      'perfis',
      [
        {
          titulo: 'Nome',
          valor: function (p) {
            return Ui.esc(p.nome);
          },
        },
        {
          titulo: 'Perfil de',
          valor: function (p) {
            return TIPOS_PERFIL[p.tipo];
          },
        },
        {
          titulo: 'Perfil padrão',
          valor: function (p) {
            return p.padrao ? 'Sim' : 'Não';
          },
        },
        {
          titulo: 'Pessoas',
          classe: 'ocultar-mobile',
          valor: function (p) {
            return String(p.totalPessoas);
          },
          ordena: function (p) {
            return p.totalPessoas;
          },
        },
      ],
      ['Nenhum perfil de acesso', 'Sem perfis, todos usam as permissões padrão do sistema.'],
    );
  }

  // ================================================================ CARGOS e CLASSIFICAÇÕES
  // cadastros só com nome: mesmo formulário e mesma lista
  function formSoNome(rotulo, rota, exemplo) {
    return function (item) {
      abreModal({
        titulo: (item ? 'Editar ' : 'Novo(a) ') + rotulo,
        campos: [
          {
            nome: 'nome',
            rotulo: 'Nome',
            valor: item && item.nome,
            obrigatorio: true,
            placeholder: exemplo,
          },
        ],
        aoSalvar: function (v) {
          return item ? Api.patch(rota + '/' + item._id, v) : Api.post(rota, v);
        },
      });
    };
  }

  function secaoSoNome(tipo, rota, vazio) {
    return async function () {
      ajudaAtual = '';
      dados[tipo] = (await Api.get(rota, { todos: 'true' }))[tipo];
      tabela(
        tipo,
        [
          {
            titulo: 'Nome',
            valor: function (x) {
              return Ui.esc(x.nome);
            },
          },
          {
            titulo: 'Pessoas',
            classe: 'ocultar-mobile coluna-numero',
            valor: function (x) {
              return String(x.totalPessoas);
            },
            ordena: function (x) {
              return x.totalPessoas;
            },
          },
        ],
        vazio,
      );
    };
  }

  // ================================================================ EMPRESAS
  function formEmpresa(e) {
    abreModal({
      titulo: e ? 'Editar empresa' : 'Nova empresa',
      campos: [
        { nome: 'nome', rotulo: 'Nome', valor: e && e.nome, obrigatorio: true },
        {
          nome: 'cnpj',
          rotulo: 'CNPJ',
          valor: e && e.cnpj,
          placeholder: '00.000.000/0000-00',
        },
        { nome: 'telefone', rotulo: 'Telefone', valor: e && e.telefone },
        {
          nome: 'observacoes',
          rotulo: 'Observações',
          tipo: 'textarea',
          valor: e && e.observacoes,
        },
      ],
      aoSalvar: function (v) {
        return e ? Api.patch('/empresas/' + e._id, v) : Api.post('/empresas', v);
      },
    });
  }

  async function secaoEmpresas() {
    ajudaAtual = 'Organizações dos clientes. Os chamados guardam a empresa do solicitante.';
    dados.empresas = (await Api.get('/empresas', { todos: 'true' })).empresas;
    tabela(
      'empresas',
      [
        {
          titulo: 'Empresa',
          valor: function (e) {
            return '<strong>' + Ui.esc(e.nome) + '</strong>';
          },
        },
        {
          titulo: 'CNPJ',
          classe: 'ocultar-mobile',
          valor: function (e) {
            return Ui.esc(e.cnpj || '—');
          },
        },
        {
          titulo: 'Telefone',
          classe: 'ocultar-mobile',
          valor: function (e) {
            return Ui.esc(e.telefone || '—');
          },
        },
        {
          titulo: 'Clientes',
          valor: function (e) {
            return (
              '<a href="#usuarios" data-filtra-empresa="' + e._id + '">' + e.totalClientes + '</a>'
            );
          },
        },
      ],
      ['Nenhuma empresa cadastrada', 'Cadastre as empresas e associe seus clientes a elas.'],
    );
  }

  // ================================================================ CATEGORIAS
  function formCategoria(c) {
    abreModal({
      titulo: c ? 'Editar categoria' : 'Nova categoria',
      campos: [
        { nome: 'nome', rotulo: 'Nome', valor: c && c.nome, obrigatorio: true },
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', valor: c && c.descricao },
      ],
      aoSalvar: function (v) {
        return c ? Api.patch('/categorias/' + c._id, v) : Api.post('/categorias', v);
      },
    });
  }

  async function secaoCategorias() {
    ajudaAtual = 'Classificação opcional do chamado (Dúvida, Bug, Sugestão...).';
    dados.categorias = (await Api.get('/categorias', { todas: 'true' })).categorias;
    tabela(
      'categorias',
      [
        {
          titulo: 'Categoria',
          valor: function (c) {
            return Ui.esc(c.nome);
          },
        },
        {
          titulo: 'Descrição',
          classe: 'ocultar-mobile suave',
          valor: function (c) {
            return Ui.esc(c.descricao || '');
          },
        },
      ],
      ['Nenhuma categoria cadastrada', ''],
    );
  }

  // ================================================================ TAGS
  function formTag(t) {
    abreModal({
      titulo: t ? 'Editar tag' : 'Nova tag',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: t && t.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Cliente VIP, Recorrente',
        },
        {
          nome: 'cor',
          rotulo: 'Cor',
          tipo: 'color',
          valor: (t && t.cor) || CORES[dados.tags.length % CORES.length],
        },
      ],
      aoSalvar: function (v) {
        return t ? Api.patch('/tags/' + t._id, v) : Api.post('/tags', v);
      },
    });
  }

  async function secaoTags() {
    ajudaAtual =
      'Etiquetas livres que a equipe coloca nos chamados. Dá para filtrar a fila por tag.';
    dados.tags = (await Api.get('/tags', { todos: 'true' })).tags;
    tabela(
      'tags',
      [{ titulo: 'Tag', valor: Ui.tag }],
      ['Nenhuma tag cadastrada', 'Crie tags como "Cliente VIP" ou "Recorrente".'],
    );
  }

  // ================================================================ JUSTIFICATIVAS
  // status para os quais faz sentido pedir justificativa (chamado nunca volta para Novo)
  var STATUS_COM_JUSTIFICATIVA = HD.status.filter(function (s) {
    return s !== 'novo';
  });

  function formJustificativa(j) {
    abreModal({
      titulo: j ? 'Editar justificativa' : 'Nova justificativa',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: j && j.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Aguardando retorno do cliente',
        },
        {
          nome: 'status',
          rotulo: 'Exigir ao mover para',
          tipo: 'checkboxes',
          valor: j ? j.status : ['pendente'],
          opcoes: STATUS_COM_JUSTIFICATIVA.map(function (s) {
            return { valor: s, rotulo: HD.rotulosStatus[s] };
          }),
          ajuda:
            'Com pelo menos uma justificativa ativa, o agente precisa escolher o motivo ao mover o chamado para esses status.',
        },
      ],
      aoSalvar: function (v) {
        return j ? Api.patch('/justificativas/' + j._id, v) : Api.post('/justificativas', v);
      },
    });
  }

  async function secaoJustificativas() {
    ajudaAtual = 'Motivos exigidos ao mudar o status (ex.: por que o chamado está Pendente).';
    dados.justificativas = (await Api.get('/justificativas', { todos: 'true' })).justificativas;
    tabela(
      'justificativas',
      [
        {
          titulo: 'Justificativa',
          valor: function (j) {
            return Ui.esc(j.nome);
          },
        },
        {
          titulo: 'Exigida em',
          valor: function (j) {
            return j.status.map(Ui.badgeStatus).join(' ');
          },
        },
      ],
      [
        'Nenhuma justificativa cadastrada',
        'Sem justificativas, o chamado muda de status sem pedir motivo.',
      ],
    );
  }

  // ================================================================ STATUS (somente leitura)
  async function secaoStatus() {
    barra.innerHTML = '';
    mostraAjuda(
      'Os status e as transições são fixos no sistema. As justificativas de cada status são configuráveis.',
    );
    dados.justificativas = (await Api.get('/justificativas')).justificativas;
    Ui.$('#contagem').textContent =
      'Exibindo de 1 até ' +
      HD.status.length +
      ' de um total de ' +
      HD.status.length +
      ' registro(s)';
    conteudo.innerHTML =
      '<section class="cartao tabela-container"><table class="admin-tabela lista-cadastro somente-leitura"><thead><tr><th>Status</th><th>Pode ir para</th><th>SLA</th><th>Justificativas</th></tr></thead><tbody>' +
      HD.status
        .map(function (s) {
          var qtd = dados.justificativas.filter(function (j) {
            return j.status.indexOf(s) !== -1;
          }).length;
          var sla =
            HD.statusQuePausamSla.indexOf(s) !== -1
              ? 'Relógio pausado'
              : s === 'resolvido' || s === 'fechado'
                ? 'Encerrado'
                : 'Contando';
          return (
            '<tr><td>' +
            Ui.badgeStatus(s) +
            '</td><td>' +
            (HD.transicoes[s] || []).map(Ui.badgeStatus).join(' ') +
            (s === 'fechado' ? ' <span class="suave">(conforme o perfil de acesso)</span>' : '') +
            '</td><td>' +
            sla +
            '</td><td>' +
            (qtd
              ? '<a href="#justificativas">' + qtd + ' obrigatória(s)</a>'
              : '<span class="suave">Não exige</span>') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></section>';
  }

  // ================================================================ CAMPOS ADICIONAIS
  var TIPOS_CAMPO = HD.tiposDeCampo;
  var ALVOS = HD.alvosDeCampo;
  var TIPOS_PESSOA = { agente: 'Agentes', cliente: 'Clientes' };

  function formCampo(c) {
    abreModal({
      titulo: c ? 'Editar campo adicional' : 'Novo campo adicional',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: c && c.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Causa raiz, Código de licença',
        },
        {
          nome: 'tipo',
          rotulo: 'Tipo',
          tipo: 'select',
          valor: c ? c.tipo : 'texto',
          opcoes: Object.keys(TIPOS_CAMPO).map(function (t) {
            return { valor: t, rotulo: TIPOS_CAMPO[t] };
          }),
        },
        {
          nome: 'alvo',
          rotulo: 'Campo para',
          tipo: 'select',
          valor: c ? c.alvo : 'chamado',
          opcoes: Object.keys(ALVOS).map(function (a) {
            return { valor: a, rotulo: ALVOS[a] };
          }),
        },
        {
          nome: 'opcoes',
          rotulo: 'Valores da lista (um por linha)',
          tipo: 'textarea',
          linhas: 5,
          valor: c ? (c.opcoes || []).join('\n') : '',
        },
        {
          nome: 'pessoasDe',
          rotulo: 'Pessoas que aparecem na lista',
          tipo: 'checkboxes',
          valor: c ? c.pessoasDe || [] : ['agente'],
          opcoes: Object.keys(TIPOS_PESSOA).map(function (t) {
            return { valor: t, rotulo: TIPOS_PESSOA[t] };
          }),
          ajuda: 'Nenhuma marcada = todas as pessoas',
        },
        {
          nome: 'ajuda',
          rotulo: 'Texto de ajuda',
          valor: c && c.ajuda,
          placeholder: 'Aparece abaixo do campo',
        },
        {
          nome: 'ordem',
          rotulo: 'Ordem',
          tipo: 'number',
          valor: c ? c.ordem : dados.camposAdicionais.length,
        },
        { nome: 'obrigatorio', rotulo: 'Obrigatório', tipo: 'checkbox', valor: c && c.obrigatorio },
        {
          nome: 'visivelParaCliente',
          rotulo: 'Visível para o cliente (ele vê e preenche ao abrir o chamado)',
          tipo: 'checkbox',
          valor: c && c.visivelParaCliente,
        },
      ],
      aoMontar: function (form) {
        var tipo = form.querySelector('[name="tipo"]');
        function alterna() {
          form.querySelector('[data-campo="opcoes"]').hidden = tipo.value !== 'lista';
          form.querySelector('[data-campo="pessoasDe"]').hidden = tipo.value !== 'pessoa';
        }
        tipo.addEventListener('change', alterna);
        alterna();
      },
      aoSalvar: function (v) {
        return c ? Api.patch('/campos-adicionais/' + c._id, v) : Api.post('/campos-adicionais', v);
      },
    });
  }

  async function secaoCampos() {
    ajudaAtual =
      'Campos extras do chamado. Sem regra para exibição, o campo aparece sempre; com regra, só quando ela casar.';
    dados.camposAdicionais = (await Api.get('/campos-adicionais', { todos: 'true' })).campos;
    tabela(
      'camposAdicionais',
      [
        {
          titulo: 'Nome',
          valor: function (c) {
            return (
              Ui.esc(c.nome) +
              (c.obrigatorio
                ? ' <span class="marca-obrigatorio" title="Obrigatório">*</span>'
                : '') +
              (c.visivelParaCliente ? ' <span class="tag">cliente</span>' : '')
            );
          },
        },
        {
          titulo: 'Tipo',
          valor: function (c) {
            return TIPOS_CAMPO[c.tipo] || c.tipo;
          },
        },
        {
          titulo: 'Campo para',
          valor: function (c) {
            return ALVOS[c.alvo] || c.alvo;
          },
        },
      ],
      ['Nenhum campo adicional', 'Crie campos como "Causa raiz" ou "Código de licença".'],
    );
  }

  // ================================================================ REGRAS PARA EXIBIÇÃO
  function nomesPorId(lista, ids) {
    return (ids || [])
      .map(function (id) {
        var achado = lista.filter(function (x) {
          return x._id === id;
        })[0];
        return achado ? achado.nome : '—';
      })
      .join(', ');
  }

  function formRegra(r) {
    var cond = (r && r.condicaoCampo) || {};
    var listas = dados.camposAdicionais.filter(function (c) {
      return c.tipo === 'lista';
    });

    abreModal({
      titulo: r ? 'Editar regra para exibição' : 'Nova regra para exibição',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: r && r.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Criticidade para Infraestrutura',
        },
        {
          nome: 'alvo',
          rotulo: 'Regra para',
          tipo: 'select',
          valor: r ? r.alvo : 'chamado',
          opcoes: Object.keys(ALVOS).map(function (a) {
            return { valor: a, rotulo: ALVOS[a] };
          }),
        },
        { tipo: 'titulo', nome: '-', rotulo: 'Quando (em branco = qualquer um)' },
        {
          nome: 'servicos',
          rotulo: 'O serviço for',
          tipo: 'checkboxes',
          valor: (r && r.servicos) || [],
          opcoes: opcoesDe(dados.servicos, comInativo),
          semOpcoes: 'Nenhum serviço cadastrado',
        },
        {
          nome: 'categorias',
          rotulo: 'A categoria for',
          tipo: 'checkboxes',
          valor: (r && r.categorias) || [],
          opcoes: opcoesDe(dados.categorias, comInativo),
          semOpcoes: 'Nenhuma categoria cadastrada',
        },
        {
          nome: 'condicaoCampo.campo',
          rotulo: 'O campo',
          tipo: 'select',
          vazio: 'Qualquer valor de campo',
          valor: cond.campo,
          opcoes: opcoesDe(listas),
          ajuda: 'Só campos do tipo lista de valores',
        },
        {
          nome: 'condicaoCampo.valores',
          rotulo: 'For igual a',
          tipo: 'checkboxes',
          valor: cond.valores || [],
          opcoes: [],
        },
        { tipo: 'titulo', nome: '-', rotulo: 'Então' },
        {
          nome: 'campos',
          rotulo: 'Exibir os campos',
          tipo: 'checkboxes',
          valor: (r && r.campos) || [],
          opcoes: opcoesDe(dados.camposAdicionais, comInativo),
          semOpcoes: 'Cadastre campos adicionais primeiro',
        },
        {
          nome: 'tornarObrigatorios',
          rotulo: 'Tornar esses campos obrigatórios quando a regra valer',
          tipo: 'checkbox',
          valor: r && r.tornarObrigatorios,
        },
      ],
      aoMontar: function (form) {
        // valores possíveis dependem do campo escolhido na condição
        var campo = form.querySelector('[name="condicaoCampo.campo"]');
        var grupo = form.querySelector('[data-grupo="condicaoCampo.valores"]');
        var marcados = cond.valores || [];
        function desenha() {
          var escolhido = listas.filter(function (c) {
            return c._id === campo.value;
          })[0];
          form.querySelector('[data-campo="condicaoCampo.valores"]').hidden = !escolhido;
          grupo.innerHTML = escolhido
            ? escolhido.opcoes
                .map(function (o) {
                  return (
                    '<label><input type="checkbox" value="' +
                    Ui.esc(o) +
                    '"' +
                    (marcados.indexOf(o) !== -1 ? ' checked' : '') +
                    ' /> ' +
                    Ui.esc(o) +
                    '</label>'
                  );
                })
                .join('')
            : '';
        }
        campo.addEventListener('change', function () {
          marcados = [];
          desenha();
        });
        desenha();
      },
      aoSalvar: function (v) {
        var corpo = {
          nome: v.nome,
          alvo: v.alvo,
          servicos: v.servicos,
          categorias: v.categorias,
          campos: v.campos,
          tornarObrigatorios: v.tornarObrigatorios,
          condicaoCampo: v['condicaoCampo.campo']
            ? { campo: v['condicaoCampo.campo'], valores: v['condicaoCampo.valores'] }
            : null,
        };
        return r
          ? Api.patch('/regras-exibicao/' + r._id, corpo)
          : Api.post('/regras-exibicao', corpo);
      },
    });
  }

  function resumoDaRegra(r) {
    var partes = [];
    if (r.servicos.length) partes.push('Serviço: ' + nomesPorId(dados.servicos, r.servicos));
    if (r.categorias.length)
      partes.push('Categoria: ' + nomesPorId(dados.categorias, r.categorias));
    if (r.condicaoCampo && r.condicaoCampo.campo) {
      partes.push(
        nomesPorId(dados.camposAdicionais, [r.condicaoCampo.campo]) +
          ' = ' +
          r.condicaoCampo.valores.join(' ou '),
      );
    }
    return (
      (partes.length ? Ui.esc(partes.join(' · ')) : 'Sempre') +
      ' → ' +
      Ui.esc(nomesPorId(dados.camposAdicionais, r.campos)) +
      (r.tornarObrigatorios ? ' <span class="marca-obrigatorio" title="Obrigatórios">*</span>' : '')
    );
  }

  async function secaoRegras() {
    ajudaAtual = 'Definem quando os campos adicionais aparecem (e se ficam obrigatórios).';
    var r = await Promise.all([
      Api.get('/regras-exibicao', { todos: 'true' }),
      Api.get('/campos-adicionais', { todos: 'true' }),
      Api.get('/servicos', { todos: 'true' }),
      Api.get('/categorias', { todas: 'true' }),
    ]);
    dados.regrasExibicao = r[0].regras;
    dados.camposAdicionais = r[1].campos;
    dados.servicos = r[2].servicos;
    dados.categorias = r[3].categorias;
    tabela(
      'regrasExibicao',
      [
        {
          titulo: 'Nome',
          valor: function (x) {
            return Ui.esc(x.nome);
          },
        },
        { titulo: 'Condição → Campos', classe: 'ocultar-mobile suave', valor: resumoDaRegra },
        {
          titulo: 'Regra para',
          valor: function (x) {
            return ALVOS[x.alvo] || x.alvo;
          },
        },
      ],
      ['Nenhuma regra para exibição', 'Sem regras, todos os campos adicionais aparecem sempre.'],
    );
  }

  // ================================================================ MURAL DE AVISOS
  function formAviso(a) {
    abreModal({
      titulo: a ? 'Editar aviso' : 'Novo aviso',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Título',
          valor: a && a.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Manutenção programada no sábado',
        },
        {
          nome: 'mensagem',
          rotulo: 'Mensagem',
          tipo: 'textarea',
          linhas: 5,
          valor: a && a.mensagem,
        },
        {
          nome: 'publico',
          rotulo: 'Mostrar para',
          tipo: 'select',
          valor: a ? a.publico : 'equipe',
          opcoes: Object.keys(HD.publicosDeAviso).map(function (p) {
            return { valor: p, rotulo: HD.publicosDeAviso[p] };
          }),
          ajuda: 'Equipe: página Início dos agentes. Clientes: portal do cliente.',
        },
        {
          nome: 'validoAte',
          rotulo: 'Exibir até',
          tipo: 'date',
          valor: a && a.validoAte,
          ajuda: 'Em branco = até ser desabilitado',
        },
      ],
      aoSalvar: function (v) {
        v.validoAte = v.validoAte || null;
        return a ? Api.patch('/avisos/' + a._id, v) : Api.post('/avisos', v);
      },
    });
  }

  async function secaoAvisos() {
    ajudaAtual = 'Recados exibidos na página Início da equipe e no portal do cliente.';
    dados.avisos = (await Api.get('/avisos', { todos: 'true' })).avisos;
    tabela(
      'avisos',
      [
        {
          titulo: 'Título',
          valor: function (a) {
            return Ui.esc(a.nome);
          },
        },
        {
          titulo: 'Mostrar para',
          valor: function (a) {
            return HD.publicosDeAviso[a.publico] || a.publico;
          },
        },
        {
          titulo: 'Exibir até',
          valor: function (a) {
            return a.validoAte
              ? a.validoAte.split('-').reverse().join('/')
              : '<span class="suave">Sem prazo</span>';
          },
          ordena: function (a) {
            return a.validoAte || '9999';
          },
        },
      ],
      ['Nenhum aviso no mural', 'Publique recados para a equipe ou para os clientes.'],
    );
  }

  // ================================================================ FERIADOS
  function dataBr(iso, recorrente) {
    var p = iso.split('-');
    return recorrente ? p[2] + '/' + p[1] + ' (todo ano)' : p[2] + '/' + p[1] + '/' + p[0];
  }

  function formFeriado(f) {
    abreModal({
      titulo: f ? 'Editar feriado' : 'Novo feriado',
      campos: [
        { nome: 'nome', rotulo: 'Nome', valor: f && f.nome, obrigatorio: true },
        { nome: 'data', rotulo: 'Data', tipo: 'date', valor: f && f.data, obrigatorio: true },
        {
          nome: 'recorrente',
          rotulo: 'Repetir todo ano nesta data',
          tipo: 'checkbox',
          valor: f ? f.recorrente : false,
        },
      ],
      aoSalvar: function (v) {
        return f ? Api.patch('/feriados/' + f._id, v) : Api.post('/feriados', v);
      },
    });
  }

  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), base dos feriados móveis
  function pascoa(ano) {
    var a = ano % 19;
    var b = Math.floor(ano / 100);
    var c = ano % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31);
    var dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia));
  }

  function feriadosNacionais(ano) {
    function iso(d) {
      return d.toISOString().slice(0, 10);
    }
    function soma(d, dias) {
      return new Date(d.getTime() + dias * 86400000);
    }
    var p = pascoa(ano);
    var fixos = [
      ['01-01', 'Confraternização Universal'],
      ['04-21', 'Tiradentes'],
      ['05-01', 'Dia do Trabalho'],
      ['09-07', 'Independência do Brasil'],
      ['10-12', 'Nossa Senhora Aparecida'],
      ['11-02', 'Finados'],
      ['11-15', 'Proclamação da República'],
      ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
      ['12-25', 'Natal'],
    ].map(function (f) {
      return { nome: f[1], data: ano + '-' + f[0], recorrente: true };
    });
    var moveis = [
      { nome: 'Carnaval', data: iso(soma(p, -48)) },
      { nome: 'Carnaval', data: iso(soma(p, -47)) },
      { nome: 'Sexta-feira Santa', data: iso(soma(p, -2)) },
      { nome: 'Corpus Christi', data: iso(soma(p, 60)) },
    ].map(function (f) {
      return Object.assign(f, { recorrente: false });
    });
    return fixos.concat(moveis);
  }

  async function importaFeriados(ano) {
    // pula o que já existe (mesma data, ou mesmo dia/mês para os recorrentes)
    var existentes = dados.feriados.map(function (f) {
      return f.recorrente ? f.data.slice(5) : f.data;
    });
    var novos = feriadosNacionais(ano).filter(function (f) {
      return existentes.indexOf(f.data) === -1 && existentes.indexOf(f.data.slice(5)) === -1;
    });
    if (!novos.length) {
      Ui.toast('Os feriados nacionais de ' + ano + ' já estão cadastrados', 'sucesso');
      return;
    }
    var falhas = 0;
    for (var i = 0; i < novos.length; i++) {
      try {
        await Api.post('/feriados', novos[i]);
      } catch (_e) {
        falhas += 1;
      }
    }
    Ui.toast(
      novos.length -
        falhas +
        ' feriado(s) adicionados' +
        (falhas ? ', ' + falhas + ' ignorado(s)' : ''),
      falhas ? 'erro' : 'sucesso',
    );
    await renderizaSecao();
  }

  async function secaoFeriados() {
    var ano = new Date().getFullYear();
    ajudaAtual = 'Nos feriados o relógio do SLA não corre.';
    dados.feriados = (await Api.get('/feriados', { todos: 'true' })).feriados;
    tabela(
      'feriados',
      [
        {
          titulo: 'Data',
          valor: function (f) {
            return '<span class="numero">' + dataBr(f.data, f.recorrente) + '</span>';
          },
          // recorrentes ordenam pelo dia/mês, os demais pela data completa
          ordena: function (f) {
            return f.recorrente ? ano + f.data.slice(4) : f.data;
          },
        },
        {
          titulo: 'Feriado',
          valor: function (f) {
            return Ui.esc(f.nome);
          },
        },
      ],
      [
        'Nenhum feriado cadastrado',
        'Use "Adicionar feriados nacionais" para começar com o calendário do ano.',
      ],
      {
        html:
          '<button type="button" class="botao" id="importa-feriados">Feriados nacionais de ' +
          ano +
          '</button>',
        liga: function () {
          Ui.$('#importa-feriados').addEventListener('click', function (e) {
            var restaura = Ui.ocupado(e.currentTarget, 'Adicionando...');
            importaFeriados(ano).finally(restaura);
          });
        },
      },
    );
  }

  // ================================================================ MACROS
  function resumoAcoes(m) {
    var a = m.acoes || {};
    var partes = [];
    if (a.status) {
      partes.push(
        'Status → ' +
          HD.rotulosStatus[a.status] +
          (a.justificativa ? ' (' + Ui.esc(a.justificativa.nome) + ')' : ''),
      );
    }
    if (a.prioridade) partes.push('Prioridade → ' + HD.rotulosPrioridade[a.prioridade]);
    if (a.equipe) partes.push('Equipe → ' + Ui.esc(a.equipe.nome));
    if (a.atribuirAMim) partes.push('Atribuir a quem aplicar');
    if (a.adicionarTags && a.adicionarTags.length) {
      partes.push('Tags: ' + a.adicionarTags.map(Ui.tag).join(' '));
    }
    return partes.length ? partes.join('<br />') : '<span class="suave">Só a mensagem</span>';
  }

  function formMacro(m) {
    var a = (m && m.acoes) || {};
    var idDe = function (x) {
      return x && (x._id || x);
    };
    var statusMacro = HD.status.filter(function (s) {
      return s !== 'novo' && s !== 'fechado';
    });

    abreModal({
      titulo: m ? 'Editar macro' : 'Nova macro',
      campos: [
        {
          nome: 'nome',
          rotulo: 'Nome',
          valor: m && m.nome,
          obrigatorio: true,
          placeholder: 'Ex.: Solicitar print do erro',
        },
        {
          nome: 'tipo',
          rotulo: 'A mensagem será',
          tipo: 'select',
          valor: m ? m.tipo : 'publica',
          opcoes: [
            { valor: 'publica', rotulo: 'Resposta pública (o cliente vê)' },
            { valor: 'interna', rotulo: 'Nota interna' },
          ],
        },
        {
          nome: 'mensagem',
          rotulo: 'Mensagem',
          tipo: 'textarea',
          linhas: 5,
          valor: m && m.mensagem,
          ajuda:
            'O agente pode editar o texto antes de enviar. Deixe em branco para só executar as ações.',
        },
        { tipo: 'titulo', nome: '-', rotulo: 'Ações' },
        {
          nome: 'acoes.status',
          rotulo: 'Mudar status para',
          tipo: 'select',
          vazio: 'Não alterar',
          valor: a.status,
          opcoes: statusMacro.map(function (s) {
            return { valor: s, rotulo: HD.rotulosStatus[s] };
          }),
        },
        {
          nome: 'acoes.justificativa',
          rotulo: 'Justificativa',
          tipo: 'select',
          vazio: 'Nenhuma',
          valor: idDe(a.justificativa),
          opcoes: [],
        },
        {
          nome: 'acoes.prioridade',
          rotulo: 'Mudar prioridade para',
          tipo: 'select',
          vazio: 'Não alterar',
          valor: a.prioridade,
          opcoes: Object.keys(HD.rotulosPrioridade).map(function (p) {
            return { valor: p, rotulo: HD.rotulosPrioridade[p] };
          }),
        },
        {
          nome: 'acoes.equipe',
          rotulo: 'Transferir para a equipe',
          tipo: 'select',
          vazio: 'Não transferir',
          valor: idDe(a.equipe),
          opcoes: opcoesDe(
            dados.equipes.filter(function (e) {
              return e.ativa;
            }),
          ),
        },
        {
          nome: 'acoes.atribuirAMim',
          rotulo: 'Atribuir o chamado a quem aplicar a macro',
          tipo: 'checkbox',
          valor: a.atribuirAMim,
        },
        {
          nome: 'acoes.adicionarTags',
          rotulo: 'Adicionar tags',
          tipo: 'checkboxes',
          valor: (a.adicionarTags || []).map(idDe),
          opcoes: opcoesDe(
            dados.tags.filter(function (t) {
              return (
                t.ativa ||
                (a.adicionarTags || []).some(function (x) {
                  return idDe(x) === t._id;
                })
              );
            }),
          ),
          semOpcoes: 'Nenhuma tag cadastrada',
        },
      ],
      aoMontar: function (form) {
        // justificativas dependem do status escolhido
        var status = form.querySelector('[name="acoes.status"]');
        var just = form.querySelector('[name="acoes.justificativa"]');
        var campoJust = form.querySelector('[data-campo="acoes.justificativa"]');
        function atualiza() {
          var lista = dados.justificativas.filter(function (j) {
            return j.ativa && j.status.indexOf(status.value) !== -1;
          });
          var atual = just.value || idDe(a.justificativa);
          just.innerHTML = Ui.opcoes(opcoesDe(lista), atual, 'Nenhuma');
          campoJust.hidden = !lista.length;
        }
        status.addEventListener('change', atualiza);
        atualiza();
      },
      aoSalvar: function (v) {
        var corpo = {
          nome: v.nome,
          tipo: v.tipo,
          mensagem: v.mensagem,
          acoes: {
            status: v['acoes.status'] || null,
            justificativa: v['acoes.justificativa'] || null,
            prioridade: v['acoes.prioridade'] || null,
            equipe: v['acoes.equipe'] || null,
            atribuirAMim: v['acoes.atribuirAMim'],
            adicionarTags: v['acoes.adicionarTags'],
          },
        };
        return m ? Api.patch('/macros/' + m._id, corpo) : Api.post('/macros', corpo);
      },
    });
  }

  async function secaoMacros() {
    ajudaAtual =
      'Respostas prontas que também executam ações. O agente aplica pelo campo de resposta do chamado.';
    var r = await Promise.all([
      Api.get('/macros', { todos: 'true' }),
      Api.get('/equipes', { todas: 'true' }),
      Api.get('/tags', { todos: 'true' }),
      Api.get('/justificativas', { todos: 'true' }),
    ]);
    dados.macros = r[0].macros;
    dados.equipes = r[1].equipes;
    dados.tags = r[2].tags;
    dados.justificativas = r[3].justificativas;
    tabela(
      'macros',
      [
        {
          titulo: 'Macro',
          valor: function (m) {
            return (
              '<strong>' +
              Ui.esc(m.nome) +
              '</strong><div class="suave recorte">' +
              Ui.esc(m.mensagem || '') +
              '</div>'
            );
          },
        },
        {
          titulo: 'Tipo',
          valor: function (m) {
            return m.tipo === 'interna'
              ? '<span class="rotulo-interna">NOTA INTERNA</span>'
              : 'Pública';
          },
        },
        { titulo: 'Ações', classe: 'ocultar-mobile', valor: resumoAcoes },
      ],
      ['Nenhuma macro cadastrada', 'Crie respostas prontas como "Solicitar print do erro".'],
    );
  }

  // ================================================================ formulários de parâmetros
  var configuracao = null;

  async function carregaConfiguracao() {
    configuracao = (await Api.get('/configuracoes')).configuracao;
    return configuracao;
  }

  /** Salva uma seção dos parâmetros a partir de um <form> inline. */
  function ligaFormulario(form, montaCorpo, mensagem) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      Ui.errosDeCampo(form, {});
      var aviso = form.querySelector('.aviso-form');
      aviso.innerHTML = '';
      var restaura = Ui.ocupado(form.querySelector('[type=submit]'), 'Salvando...');
      try {
        configuracao = (await Api.patch('/configuracoes', montaCorpo(form))).configuracao;
        Ui.toast(mensagem, 'sucesso');
      } catch (erro) {
        Ui.errosDeCampo(form, erro.detalhes);
        aviso.innerHTML = '<div class="alerta erro">' + Ui.esc(erro.message) + '</div>';
      } finally {
        restaura();
      }
    });
  }

  // horas úteis na tela, minutos no banco
  function horas(minutos) {
    return Math.round((minutos / 60) * 100) / 100;
  }
  function minutos(valor) {
    return Math.round(Number(String(valor).replace(',', '.')) * 60);
  }
  function descreveHoras(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return (h ? h + 'h' : '') + (m ? (h ? ' ' : '') + m + 'min' : '') || '0h';
  }

  async function secaoSla() {
    barra.innerHTML =
      '<span class="suave">Prazos contados só dentro do expediente, sem feriados. Pendente pausa o relógio.</span><a class="botao" href="#feriados">Feriados</a>';
    var c = await carregaConfiguracao();
    var e = c.expediente;

    conteudo.innerHTML =
      '<form class="cartao formulario-config" id="form-sla" novalidate>' +
      '<div class="aviso-form"></div>' +
      '<h2>Expediente</h2>' +
      '<div class="campo" data-campo="expediente.dias"><label>Dias de atendimento</label><div class="checkboxes dias-semana">' +
      DIAS.map(function (nome, i) {
        return (
          '<label><input type="checkbox" name="dia" value="' +
          i +
          '"' +
          (e.dias.indexOf(i) !== -1 ? ' checked' : '') +
          ' /> ' +
          nome +
          '</label>'
        );
      }).join('') +
      '</div></div>' +
      '<div class="linha-campos">' +
      '<div class="campo"><label for="exp-inicio">Início</label><input id="exp-inicio" type="time" name="expediente.inicio" value="' +
      Ui.esc(e.inicio) +
      '" required /></div>' +
      '<div class="campo"><label for="exp-fim">Fim</label><input id="exp-fim" type="time" name="expediente.fim" value="' +
      Ui.esc(e.fim) +
      '" required /></div>' +
      '<div class="campo"><label for="exp-fuso">Fuso horário</label><select id="exp-fuso" name="expediente.fusoMinutos">' +
      Ui.opcoes(FUSOS, e.fusoMinutos) +
      '</select></div></div>' +
      '<h2>Urgências e prazos</h2>' +
      '<p class="suave">Em horas úteis a partir da abertura do chamado. Mudar a prioridade recalcula os prazos do chamado.</p>' +
      '<div class="tabela-container"><table class="admin-tabela tabela-sla"><thead><tr><th>Urgência</th><th>1ª resposta (h)</th><th>Solução (h)</th><th class="ocultar-mobile">Resumo</th></tr></thead><tbody>' +
      Object.keys(HD.rotulosPrioridade)
        .slice()
        .reverse()
        .map(function (p) {
          var prazo = c.sla[p];
          return (
            '<tr><td>' +
            Ui.prioridade(p) +
            '</td>' +
            '<td><div class="campo"><input type="number" min="0.1" step="0.25" name="sla.' +
            p +
            '.primeiraResposta" value="' +
            horas(prazo.primeiraResposta) +
            '" /></div></td>' +
            '<td><div class="campo"><input type="number" min="0.1" step="0.25" name="sla.' +
            p +
            '.solucao" value="' +
            horas(prazo.solucao) +
            '" /></div></td>' +
            '<td class="ocultar-mobile suave">Responder em ' +
            descreveHoras(prazo.primeiraResposta) +
            ', resolver em ' +
            descreveHoras(prazo.solucao) +
            ' úteis</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      '<p class="ajuda-rodape suave">Os novos prazos valem para os chamados abertos daqui em diante e para os que tiverem a prioridade alterada.</p>' +
      '<div class="acoes-form"><button class="botao primario" type="submit">Salvar SLA</button></div>' +
      '</form>';

    var form = Ui.$('#form-sla');
    ligaFormulario(
      form,
      function (f) {
        var sla = {};
        Object.keys(HD.rotulosPrioridade).forEach(function (p) {
          sla[p] = {
            primeiraResposta: minutos(f.elements['sla.' + p + '.primeiraResposta'].value),
            solucao: minutos(f.elements['sla.' + p + '.solucao'].value),
          };
        });
        return {
          expediente: {
            dias: Array.prototype.map.call(
              f.querySelectorAll('[name="dia"]:checked'),
              function (i) {
                return Number(i.value);
              },
            ),
            inicio: f.elements['expediente.inicio'].value,
            fim: f.elements['expediente.fim'].value,
            fusoMinutos: Number(f.elements['expediente.fusoMinutos'].value),
          },
          sla: sla,
        };
      },
      'SLA atualizado',
    );
  }

  async function secaoParametros() {
    barra.innerHTML = '';
    var c = await carregaConfiguracao();
    conteudo.innerHTML =
      '<form class="cartao formulario-config" id="form-parametros" novalidate>' +
      '<div class="aviso-form"></div>' +
      '<h2>Empresa</h2>' +
      '<div class="campo"><label for="par-nome">Nome da empresa</label><input id="par-nome" name="nomeEmpresa" value="' +
      Ui.esc(c.nomeEmpresa) +
      '" maxlength="120" /><span class="ajuda">Quem presta o atendimento</span></div>' +
      '<h2>Parâmetros de atendimento</h2>' +
      '<div class="campo"><label for="par-dias">Fechar automaticamente chamados resolvidos após (dias)</label><input id="par-dias" type="number" min="1" max="90" name="diasFechamentoAutomatico" value="' +
      c.diasFechamentoAutomatico +
      '" /><span class="ajuda">Se o cliente não responder nesse período, o chamado Resolvido vira Fechado. Exige o Redis ativo.</span></div>' +
      '<div class="acoes-form"><button class="botao primario" type="submit">Salvar parâmetros</button></div>' +
      '</form>';

    ligaFormulario(
      Ui.$('#form-parametros'),
      function (f) {
        return {
          nomeEmpresa: f.elements.nomeEmpresa.value,
          diasFechamentoAutomatico: Number(f.elements.diasFechamentoAutomatico.value),
        };
      },
      'Parâmetros atualizados',
    );
  }

  async function secaoPesquisa() {
    barra.innerHTML = '';
    var r = await Promise.all([carregaConfiguracao(), Api.get('/configuracoes/resumo')]);
    var p = r[0].pesquisa;
    var fila = r[1].fila;
    conteudo.innerHTML =
      '<div class="grade-pesquisa">' +
      '<form class="cartao formulario-config" id="form-pesquisa" novalidate>' +
      '<div class="aviso-form"></div>' +
      '<h2>Pergunta enviada ao cliente</h2>' +
      '<div class="campo"><label class="checkbox-linha"><input type="checkbox" name="ativa"' +
      (p.ativa ? ' checked' : '') +
      ' /> Pedir avaliação quando o chamado for resolvido</label></div>' +
      '<div class="campo"><label for="pq-pergunta">Pergunta</label><input id="pq-pergunta" name="pesquisa.pergunta" maxlength="200" value="' +
      Ui.esc(p.pergunta) +
      '" /><span class="ajuda">O cliente responde com uma nota de 1 a 5 estrelas e um comentário opcional, na tela do chamado.</span></div>' +
      '<div class="previa-pesquisa"><span class="suave">Prévia</span><strong id="previa-pergunta">' +
      Ui.esc(p.pergunta) +
      '</strong><span class="estrelas" aria-hidden="true">★★★★★</span></div>' +
      '<div class="acoes-form"><button class="botao primario" type="submit">Salvar pesquisa</button></div>' +
      '</form>' +
      '<section class="cartao quadro-numero"><span class="suave">Satisfação média</span><strong>' +
      (fila.mediaAvaliacao === null ? '—' : fila.mediaAvaliacao.toLocaleString('pt-BR')) +
      '</strong><span class="suave">' +
      fila.totalAvaliacoes +
      ' avaliação(ões)</span></section></div>';

    var form = Ui.$('#form-pesquisa');
    form.elements['pesquisa.pergunta'].addEventListener('input', function (e) {
      Ui.$('#previa-pergunta').textContent = e.target.value;
    });
    ligaFormulario(
      form,
      function (f) {
        return {
          pesquisa: {
            ativa: f.elements.ativa.checked,
            pergunta: f.elements['pesquisa.pergunta'].value,
          },
        };
      },
      'Pesquisa de satisfação atualizada',
    );
  }

  // ================================================================ E-MAIL
  // Envio (SMTP), recebimento (IMAP: chamados por e-mail), avisos e o log dos e-mails recebidos.
  var PROVEDORES = {
    gmail: {
      rotulo: 'Gmail / Google Workspace',
      envio: { host: 'smtp.gmail.com', porta: 587, seguranca: 'starttls' },
      recebimento: { host: 'imap.gmail.com', porta: 993, ssl: true },
      dica: 'No Google, use uma "senha de app" (Conta Google > Segurança > Senhas de app).',
    },
    outlook: {
      rotulo: 'Outlook / Microsoft 365',
      envio: { host: 'smtp.office365.com', porta: 587, seguranca: 'starttls' },
      recebimento: { host: 'outlook.office365.com', porta: 993, ssl: true },
      dica: 'No Microsoft 365, o SMTP autenticado e o IMAP precisam estar liberados para a caixa.',
    },
  };
  var ROTULOS_RESULTADO = {
    'novo-chamado': ['Chamado aberto', 'ok'],
    resposta: ['Resposta', 'ok'],
    ignorado: ['Ignorado', 'neutro'],
    duplicado: ['Já processado', 'neutro'],
    erro: ['Erro', 'falha'],
    processando: ['Processando', 'neutro'],
  };

  var EXEMPLO_EMAIL =
    'From: Cliente Exemplo <cliente@exemplo.com>\n' +
    'To: suporte@suaempresa.com\n' +
    'Subject: Não consigo emitir a nota fiscal\n' +
    'Message-ID: <exemplo-' +
    Date.now() +
    '@exemplo.com>\n' +
    'Content-Type: text/plain; charset=utf-8\n\n' +
    'Olá, desde ontem aparece um erro ao emitir a nota fiscal.\n' +
    'Podem ajudar?\n';

  function campoTexto(nome, rotulo, valor, extra) {
    extra = extra || {};
    return (
      '<div class="campo' +
      (extra.classe ? ' ' + extra.classe : '') +
      '"><label for="em-' +
      nome.replace(/\W/g, '-') +
      '">' +
      rotulo +
      '</label><input id="em-' +
      nome.replace(/\W/g, '-') +
      '" name="' +
      nome +
      '" type="' +
      (extra.tipo || 'text') +
      '" value="' +
      Ui.esc(valor === null || valor === undefined ? '' : valor) +
      '"' +
      (extra.placeholder ? ' placeholder="' + Ui.esc(extra.placeholder) + '"' : '') +
      (extra.atributos || '') +
      ' />' +
      (extra.ajuda ? '<span class="ajuda">' + extra.ajuda + '</span>' : '') +
      '</div>'
    );
  }

  function campoSenha(nome, definida) {
    return campoTexto(nome, 'Senha', '', {
      tipo: 'password',
      placeholder: definida
        ? '•••••••• (definida — deixe em branco para manter)'
        : 'Senha da conta',
      atributos: ' autocomplete="new-password"',
      ajuda: definida ? 'A senha fica guardada criptografada e nunca é exibida.' : '',
    });
  }

  function interruptorEmail(nome, rotulo, marcado, ajuda) {
    return (
      '<label class="linha-aviso-email"><span class="interruptor-email"><input type="checkbox" name="' +
      nome +
      '"' +
      (marcado ? ' checked' : '') +
      ' /><span class="trilho-email" aria-hidden="true"></span></span><span><strong>' +
      rotulo +
      '</strong>' +
      (ajuda ? '<span class="suave">' + ajuda + '</span>' : '') +
      '</span></label>'
    );
  }

  function selo(ok, textoOk, textoNao) {
    return (
      '<span class="selo-email ' +
      (ok ? 'ok' : 'off') +
      '">' +
      (ok ? textoOk : textoNao) +
      '</span>'
    );
  }

  function linhaLogEmail(e) {
    var r = ROTULOS_RESULTADO[e.resultado] || [e.resultado, 'neutro'];
    return (
      '<tr><td class="data-log">' +
      Ui.data(e.createdAt) +
      '</td><td>' +
      Ui.esc(e.nome || e.de) +
      '<div class="suave pequeno">' +
      Ui.esc(e.nome ? e.de : '') +
      '</div></td><td class="assunto-log">' +
      Ui.esc(e.assunto || '(sem assunto)') +
      '</td><td><span class="chip-resultado ' +
      r[1] +
      '">' +
      r[0] +
      '</span></td><td>' +
      (e.numero ? '<a href="/chamados/' + e.numero + '">#' + e.numero + '</a>' : '—') +
      '</td><td class="suave detalhe-log-email">' +
      Ui.esc(e.detalhe || '') +
      '</td></tr>'
    );
  }

  async function carregaLogEmail(pagina) {
    var alvo = Ui.$('#log-email');
    if (!alvo) return;
    try {
      var r = await Api.get('/configuracoes/email/recebidos', {
        pagina: pagina || 1,
        porPagina: 15,
      });
      alvo.innerHTML = r.emails.length
        ? '<div class="tabela-container"><table class="admin-tabela tabela-log-email"><thead><tr><th>Recebido em</th><th>De</th><th>Assunto</th><th>Resultado</th><th>Chamado</th><th>Detalhe</th></tr></thead><tbody>' +
          r.emails.map(linhaLogEmail).join('') +
          '</tbody></table></div><div class="paginacao" id="paginacao-log-email"></div>'
        : Ui.vazio(
            'Nenhum e-mail recebido ainda',
            'Quando a caixa de entrada for lida, cada e-mail aparece aqui com o que aconteceu com ele.',
          );
      var pag = Ui.$('#paginacao-log-email');
      if (pag) Ui.paginacao(pag, r.paginacao, carregaLogEmail);
    } catch (e) {
      alvo.innerHTML = Ui.erro(e.message);
    }
  }

  function descricaoRecebimento(r) {
    if (!r.ativo) return 'Desativado';
    if (r.ultimoErro) return 'Erro na última leitura: ' + r.ultimoErro;
    return r.ultimaVerificacao
      ? 'Lida ' + Ui.relativo(r.ultimaVerificacao)
      : 'Aguardando a primeira leitura';
  }

  async function secaoEmail() {
    barra.innerHTML = '';
    var resp = await Promise.all([Api.get('/configuracoes/email'), Api.get('/servicos')]);
    var c = resp[0].email;
    var servicos = resp[1].servicos;
    var env = c.envio;
    var rec = c.recebimento;
    var av = c.avisos;

    conteudo.innerHTML =
      '<div class="grade-email">' +
      '<form class="formulario-email" id="form-email" novalidate autocomplete="off">' +
      '<div class="aviso-form"></div>' +
      // provedor
      '<section class="cartao bloco-email"><div class="cabeca-bloco-email"><h2>Provedor</h2>' +
      '<p class="suave">Preenche servidores, portas e segurança dos provedores mais comuns.</p></div>' +
      '<div class="linha-provedor"><select id="provedor-email" aria-label="Provedor de e-mail"><option value="">Escolha para preencher...</option>' +
      Object.keys(PROVEDORES)
        .map(function (k) {
          return '<option value="' + k + '">' + PROVEDORES[k].rotulo + '</option>';
        })
        .join('') +
      '</select><span class="suave" id="dica-provedor"></span></div></section>' +
      // envio
      '<section class="cartao bloco-email"><div class="cabeca-bloco-email"><h2>Envio de e-mails (SMTP) ' +
      selo(env.ativo, 'Ativo', c.envioPeloEnv ? 'Usando o .env' : 'Desativado') +
      '</h2><p class="suave">Conta usada para avisar a equipe e responder os clientes.</p></div>' +
      interruptorEmail('envio.ativo', 'Enviar e-mails por esta conta', env.ativo) +
      '<div class="grade-campos-email">' +
      campoTexto('envio.host', 'Servidor SMTP', env.host, {
        placeholder: 'smtp.suaempresa.com',
        classe: 'largo',
      }) +
      campoTexto('envio.porta', 'Porta', env.porta, {
        tipo: 'number',
        atributos: ' min="1" max="65535"',
      }) +
      '<div class="campo"><label for="em-envio-seguranca">Segurança</label><select id="em-envio-seguranca" name="envio.seguranca">' +
      Ui.opcoes(
        [
          { valor: 'starttls', rotulo: 'STARTTLS (porta 587)' },
          { valor: 'ssl', rotulo: 'SSL/TLS (porta 465)' },
          { valor: 'nenhuma', rotulo: 'Nenhuma (só rede interna)' },
        ],
        env.seguranca,
      ) +
      '</select></div>' +
      campoTexto('envio.usuario', 'Usuário', env.usuario, {
        placeholder: 'suporte@suaempresa.com',
        atributos: ' autocomplete="off"',
      }) +
      campoSenha('envio.senha', env.senhaDefinida) +
      campoTexto('envio.remetenteNome', 'Nome do remetente', env.remetenteNome, {
        placeholder: 'Suporte da Sua Empresa',
      }) +
      campoTexto('envio.remetenteEmail', 'E-mail do remetente', env.remetenteEmail, {
        tipo: 'email',
        placeholder: 'suporte@suaempresa.com',
      }) +
      '</div></section>' +
      // recebimento
      '<section class="cartao bloco-email"><div class="cabeca-bloco-email"><h2>Chamados por e-mail (IMAP) ' +
      selo(rec.ativo, 'Ativo', 'Desativado') +
      '</h2><p class="suave">O Help Desk lê esta caixa de entrada: cada e-mail novo vira um chamado e as respostas (com [#número] no assunto) entram no chamado certo.</p></div>' +
      interruptorEmail('recebimento.ativo', 'Ler esta caixa e abrir chamados', rec.ativo) +
      '<div class="grade-campos-email">' +
      campoTexto('recebimento.host', 'Servidor IMAP', rec.host, {
        placeholder: 'imap.suaempresa.com',
        classe: 'largo',
      }) +
      campoTexto('recebimento.porta', 'Porta', rec.porta, {
        tipo: 'number',
        atributos: ' min="1" max="65535"',
      }) +
      '<div class="campo campo-check-email"><label class="checkbox-linha"><input type="checkbox" name="recebimento.ssl"' +
      (rec.ssl ? ' checked' : '') +
      ' /> Conexão segura (SSL/TLS)</label></div>' +
      campoTexto('recebimento.usuario', 'Usuário', rec.usuario, {
        placeholder: 'suporte@suaempresa.com',
        atributos: ' autocomplete="off"',
      }) +
      campoSenha('recebimento.senha', rec.senhaDefinida) +
      campoTexto('recebimento.pasta', 'Pasta', rec.pasta, { placeholder: 'INBOX' }) +
      campoTexto('recebimento.endereco', 'Endereço de atendimento', rec.endereco, {
        tipo: 'email',
        placeholder: 'suporte@suaempresa.com',
        ajuda:
          'Vai no "Responder para" dos e-mails, para as respostas dos clientes voltarem para esta caixa. Vazio = o usuário acima.',
        classe: 'largo',
      }) +
      '<div class="campo largo"><label for="em-servico-padrao">Serviço dos chamados abertos por e-mail</label><select id="em-servico-padrao" name="recebimento.servicoPadrao">' +
      Ui.opcoes(
        servicos.map(function (s) {
          return { valor: s._id, rotulo: s.nome + (s.equipe ? ' (' + s.equipe.nome + ')' : '') };
        }),
        rec.servicoPadrao,
        'Selecione...',
      ) +
      '</select><span class="ajuda">Define a equipe que recebe os chamados. A equipe pode reclassificar depois.</span></div>' +
      campoTexto('recebimento.intervaloMinutos', 'Ler a cada (minutos)', rec.intervaloMinutos, {
        tipo: 'number',
        atributos: ' min="1" max="60"',
      }) +
      '<div class="campo campo-check-email largo"><label class="checkbox-linha"><input type="checkbox" name="recebimento.criarClientes"' +
      (rec.criarClientes ? ' checked' : '') +
      ' /> Cadastrar automaticamente quem ainda não é cliente</label><span class="ajuda">Desmarcado, e-mails de remetentes sem cadastro são ignorados (ficam no log).</span></div>' +
      '</div></section>' +
      // avisos
      '<section class="cartao bloco-email"><div class="cabeca-bloco-email"><h2>Avisos por e-mail</h2>' +
      '<p class="suave">Quem recebe e-mail em cada situação.</p></div>' +
      '<div class="lista-avisos-email">' +
      interruptorEmail(
        'avisos.novoChamadoEquipe',
        'Novo chamado para a equipe',
        av.novoChamadoEquipe,
        'Cada agente da equipe do chamado recebe um e-mail.',
      ) +
      interruptorEmail(
        'avisos.confirmacaoCliente',
        'Confirmação de abertura para o cliente',
        av.confirmacaoCliente,
        'Com o número do chamado para acompanhar.',
      ) +
      interruptorEmail(
        'avisos.respostaParaCliente',
        'Chamado respondido: avisar o cliente',
        av.respostaParaCliente,
        'Com a resposta completa. O cliente pode responder o próprio e-mail.',
      ) +
      interruptorEmail(
        'avisos.respostaParaResponsavel',
        'Cliente respondeu: avisar o responsável',
        av.respostaParaResponsavel,
      ) +
      '</div></section>' +
      '<div class="acoes-form rodape-form-email"><button class="botao primario" type="submit">Salvar configurações de e-mail</button></div>' +
      '</form>' +
      // coluna lateral: testes e simulação
      '<aside class="lateral-email">' +
      '<section class="cartao bloco-email"><h2>Situação</h2><ul class="situacao-email">' +
      '<li><span>Envio</span><strong>' +
      (env.ativo ? 'Conta configurada' : c.envioPeloEnv ? 'Variáveis do .env' : 'Desativado') +
      '</strong></li><li><span>Caixa de entrada</span><strong' +
      (rec.ultimoErro ? ' class="texto-perigo"' : '') +
      '>' +
      Ui.esc(descricaoRecebimento(rec)) +
      '</strong></li></ul>' +
      '<div class="campo"><label for="teste-para">Enviar e-mail de teste para</label><input id="teste-para" type="email" value="' +
      Ui.esc(usuario.email) +
      '" /></div>' +
      '<div class="botoes-email"><button type="button" class="botao" id="testar-envio">Testar envio</button>' +
      '<button type="button" class="botao" id="testar-recebimento">Testar recebimento</button>' +
      '<button type="button" class="botao" id="verificar-agora">Verificar caixa agora</button></div>' +
      '<p class="suave pequeno">Salve antes de testar: os testes usam a configuração salva.</p></section>' +
      '<section class="cartao bloco-email"><h2>Simular e-mail recebido</h2>' +
      '<p class="suave pequeno">Cole um e-mail completo (com cabeçalhos) para ver o que o Help Desk faria com ele. O resultado é real: um chamado pode ser aberto.</p>' +
      '<textarea id="simular-email" rows="9" spellcheck="false">' +
      Ui.esc(EXEMPLO_EMAIL) +
      '</textarea><button type="button" class="botao" id="simular">Processar e-mail</button><div id="resultado-simulacao"></div></section>' +
      '</aside></div>' +
      '<section class="cartao bloco-email log-email-cartao"><div class="cabeca-bloco-email"><h2>E-mails recebidos</h2>' +
      '<button type="button" class="botao pequeno" id="atualizar-log-email">Atualizar</button></div><div id="log-email">' +
      Ui.carregando() +
      '</div></section>';

    var form = Ui.$('#form-email');

    Ui.$('#provedor-email').addEventListener('change', function (e) {
      var p = PROVEDORES[e.target.value];
      if (!p) return;
      form.elements['envio.host'].value = p.envio.host;
      form.elements['envio.porta'].value = p.envio.porta;
      form.elements['envio.seguranca'].value = p.envio.seguranca;
      form.elements['recebimento.host'].value = p.recebimento.host;
      form.elements['recebimento.porta'].value = p.recebimento.porta;
      form.elements['recebimento.ssl'].checked = p.recebimento.ssl;
      Ui.$('#dica-provedor').textContent = p.dica;
    });

    // a porta sugerida acompanha a segurança escolhida
    form.elements['envio.seguranca'].addEventListener('change', function (e) {
      var sugestao = { starttls: 587, ssl: 465, nenhuma: 25 }[e.target.value];
      if (['587', '465', '25', ''].indexOf(form.elements['envio.porta'].value) !== -1) {
        form.elements['envio.porta'].value = sugestao;
      }
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      Ui.errosDeCampo(form, {});
      var aviso = form.querySelector('.aviso-form');
      aviso.innerHTML = '';
      var v = function (n) {
        return form.elements[n].value;
      };
      var marcado = function (n) {
        return form.elements[n].checked;
      };
      var corpo = {
        envio: {
          ativo: marcado('envio.ativo'),
          host: v('envio.host'),
          porta: Number(v('envio.porta')),
          seguranca: v('envio.seguranca'),
          usuario: v('envio.usuario'),
          remetenteNome: v('envio.remetenteNome'),
          remetenteEmail: v('envio.remetenteEmail'),
        },
        recebimento: {
          ativo: marcado('recebimento.ativo'),
          host: v('recebimento.host'),
          porta: Number(v('recebimento.porta')),
          ssl: marcado('recebimento.ssl'),
          usuario: v('recebimento.usuario'),
          pasta: v('recebimento.pasta'),
          endereco: v('recebimento.endereco'),
          servicoPadrao: v('recebimento.servicoPadrao') || null,
          intervaloMinutos: Number(v('recebimento.intervaloMinutos')),
          criarClientes: marcado('recebimento.criarClientes'),
        },
        avisos: {
          novoChamadoEquipe: marcado('avisos.novoChamadoEquipe'),
          confirmacaoCliente: marcado('avisos.confirmacaoCliente'),
          respostaParaCliente: marcado('avisos.respostaParaCliente'),
          respostaParaResponsavel: marcado('avisos.respostaParaResponsavel'),
        },
      };
      // senha só vai quando foi digitada (em branco mantém a atual)
      if (v('envio.senha')) corpo.envio.senha = v('envio.senha');
      if (v('recebimento.senha')) corpo.recebimento.senha = v('recebimento.senha');
      var restaura = Ui.ocupado(form.querySelector('[type=submit]'), 'Salvando...');
      try {
        await Api.patch('/configuracoes/email', corpo);
        Ui.toast('Configurações de e-mail salvas', 'sucesso');
        await secaoEmail();
      } catch (erro) {
        restaura();
        // campos de senha: o nome no formulário é "...senha"
        Ui.errosDeCampo(form, erro.detalhes);
        aviso.innerHTML = '<div class="alerta erro">' + Ui.esc(erro.message) + '</div>';
        var primeiro = form.querySelector('.campo.invalido');
        if (primeiro) primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });

    async function acao(botao, texto, fn) {
      var restaura = Ui.ocupado(botao, texto);
      try {
        await fn();
      } catch (e) {
        Ui.toast(e.detalhes ? Object.values(e.detalhes)[0] : e.message, 'erro');
      } finally {
        restaura();
      }
    }

    Ui.$('#testar-envio').addEventListener('click', function (e) {
      acao(e.currentTarget, 'Enviando...', async function () {
        var r = await Api.post('/configuracoes/email/testar-envio', {
          para: Ui.$('#teste-para').value,
        });
        Ui.toast('E-mail de teste enviado para ' + r.para, 'sucesso');
      });
    });
    Ui.$('#testar-recebimento').addEventListener('click', function (e) {
      acao(e.currentTarget, 'Conectando...', async function () {
        var r = await Api.post('/configuracoes/email/testar-recebimento', {});
        Ui.toast(
          'Conectado! ' + r.mensagens + ' mensagem(ns), ' + r.naoLidas + ' não lida(s).',
          'sucesso',
        );
      });
    });
    Ui.$('#verificar-agora').addEventListener('click', function (e) {
      acao(e.currentTarget, 'Lendo...', async function () {
        var r = await Api.post('/configuracoes/email/verificar-agora', {});
        Ui.toast(r.lidas ? r.lidas + ' e-mail(s) processado(s)' : 'Nenhum e-mail novo', 'sucesso');
        carregaLogEmail(1);
      });
    });
    Ui.$('#simular').addEventListener('click', function (e) {
      acao(e.currentTarget, 'Processando...', async function () {
        var r = await Api.post('/configuracoes/email/simular', {
          conteudo: Ui.$('#simular-email').value,
        });
        var rot = ROTULOS_RESULTADO[r.resultado] || [r.resultado, 'neutro'];
        Ui.$('#resultado-simulacao').innerHTML =
          '<div class="resultado-simulacao"><span class="chip-resultado ' +
          rot[1] +
          '">' +
          rot[0] +
          '</span> ' +
          Ui.esc(r.detalhe || '') +
          (r.numero ? ' <a href="/chamados/' + r.numero + '">Abrir #' + r.numero + '</a>' : '') +
          '</div>';
        carregaLogEmail(1);
      });
    });
    Ui.$('#atualizar-log-email').addEventListener('click', function () {
      carregaLogEmail(1);
    });
    carregaLogEmail(1);
  }

  // ================================================================ seções e menu
  // campoAtivo/rota/rotulo/form só existem nos cadastros com Editar/Desativar/Remover
  var SECOES = {
    parametros: {
      grupo: 'Conta',
      titulo: 'Empresa e parâmetros',
      descricao: 'Dados da conta e regras gerais do atendimento.',
      carrega: secaoParametros,
    },
    avisos: {
      grupo: 'Conta',
      titulo: 'Mural de avisos',
      descricao: 'Recados para a equipe e para os clientes.',
      carrega: secaoAvisos,
      form: formAviso,
      rota: '/avisos',
      campoAtivo: 'ativo',
      rotulo: 'aviso',
    },
    feriados: {
      grupo: 'Conta',
      titulo: 'Feriados',
      descricao: 'Dias sem expediente, descontados dos prazos de SLA.',
      carrega: secaoFeriados,
      form: formFeriado,
      rota: '/feriados',
      campoAtivo: 'ativo',
      rotulo: 'feriado',
    },
    usuarios: {
      grupo: 'Pessoas',
      titulo: 'Pessoas',
      descricao: 'Clientes, agentes e administradores.',
      carrega: secaoUsuarios,
      form: formUsuario,
      rota: '/usuarios',
      campoAtivo: 'ativo',
      rotulo: 'pessoa',
    },
    perfis: {
      grupo: 'Pessoas',
      titulo: 'Perfis de acesso',
      descricao: 'O que agentes e clientes podem fazer no sistema.',
      carrega: secaoPerfis,
      form: formPerfil,
      rota: '/perfis',
      campoAtivo: 'ativo',
      rotulo: 'perfil de acesso',
    },
    cargos: {
      grupo: 'Pessoas',
      titulo: 'Cargos',
      descricao: 'Cargos das pessoas na empresa.',
      carrega: secaoSoNome('cargos', '/cargos', [
        'Nenhum cargo cadastrado',
        'Cadastre cargos como "Analista de Suporte" ou "Gerente".',
      ]),
      form: formSoNome('cargo', '/cargos', 'Ex.: Analista de Suporte'),
      rota: '/cargos',
      campoAtivo: 'ativo',
      rotulo: 'cargo',
    },
    classificacoes: {
      grupo: 'Pessoas',
      titulo: 'Classificações',
      descricao: 'Classificações das pessoas (cliente, funcionário, parceiro...).',
      carrega: secaoSoNome('classificacoes', '/classificacoes', [
        'Nenhuma classificação cadastrada',
        'Cadastre classificações como "Cliente" ou "Revenda / Parceiro".',
      ]),
      form: formSoNome('classificação', '/classificacoes', 'Ex.: Revenda / Parceiro'),
      rota: '/classificacoes',
      campoAtivo: 'ativa',
      rotulo: 'classificação',
    },
    camposAdicionais: {
      grupo: 'Campos adicionais',
      titulo: 'Campos adicionais',
      descricao: 'Campos extras preenchidos nos chamados.',
      carrega: secaoCampos,
      form: formCampo,
      rota: '/campos-adicionais',
      campoAtivo: 'ativo',
      rotulo: 'campo adicional',
    },
    regrasExibicao: {
      grupo: 'Campos adicionais',
      titulo: 'Regras para exibição',
      descricao: 'Quando cada campo adicional aparece.',
      carrega: secaoRegras,
      form: formRegra,
      rota: '/regras-exibicao',
      campoAtivo: 'ativo',
      rotulo: 'regra para exibição',
    },
    empresas: {
      grupo: 'Pessoas',
      titulo: 'Empresas',
      descricao: 'Organizações às quais os clientes pertencem.',
      carrega: secaoEmpresas,
      form: formEmpresa,
      rota: '/empresas',
      campoAtivo: 'ativa',
      rotulo: 'empresa',
    },
    equipes: {
      grupo: 'Pessoas',
      titulo: 'Equipes',
      descricao: 'Grupos de atendimento e seus membros.',
      carrega: secaoEquipes,
      form: formEquipe,
      rota: '/equipes',
      campoAtivo: 'ativa',
      rotulo: 'equipe',
    },
    servicos: {
      grupo: 'Chamados',
      titulo: 'Serviços',
      descricao: 'Catálogo que o cliente vê ao abrir um chamado.',
      carrega: secaoServicos,
      form: formServico,
      rota: '/servicos',
      campoAtivo: 'ativo',
      rotulo: 'serviço',
    },
    categorias: {
      grupo: 'Chamados',
      titulo: 'Categorias',
      descricao: 'Tipos de chamado para relatórios e filtros.',
      carrega: secaoCategorias,
      form: formCategoria,
      rota: '/categorias',
      campoAtivo: 'ativa',
      rotulo: 'categoria',
    },
    status: {
      grupo: 'Chamados',
      titulo: 'Status',
      descricao: 'Ciclo de vida do chamado.',
      carrega: secaoStatus,
    },
    justificativas: {
      grupo: 'Chamados',
      titulo: 'Justificativas',
      descricao: 'Motivos exigidos em determinados status.',
      carrega: secaoJustificativas,
      form: formJustificativa,
      rota: '/justificativas',
      campoAtivo: 'ativa',
      rotulo: 'justificativa',
    },
    tags: {
      grupo: 'Chamados',
      titulo: 'Tags',
      descricao: 'Etiquetas livres para organizar chamados.',
      carrega: secaoTags,
      form: formTag,
      rota: '/tags',
      campoAtivo: 'ativa',
      rotulo: 'tag',
    },
    sla: {
      grupo: 'Atendimento',
      titulo: 'SLA e urgências',
      descricao: 'Expediente e prazos de 1ª resposta e solução por urgência.',
      carrega: secaoSla,
    },
    macros: {
      grupo: 'Atendimento',
      titulo: 'Macros',
      descricao: 'Respostas prontas com ações automáticas.',
      carrega: secaoMacros,
      form: formMacro,
      rota: '/macros',
      campoAtivo: 'ativa',
      rotulo: 'macro',
    },
    email: {
      grupo: 'E-mail',
      titulo: 'E-mail',
      descricao: 'Envio de avisos e abertura de chamados por e-mail.',
      carrega: secaoEmail,
    },
    pesquisa: {
      grupo: 'Atendimento',
      titulo: 'Pesquisa de satisfação',
      descricao: 'Avaliação do atendimento pelo cliente.',
      carrega: secaoPesquisa,
    },
  };

  function secaoAtual() {
    var nome = window.location.hash.replace('#', '');
    return SECOES[nome] ? nome : 'usuarios';
  }

  async function renderizaSecao() {
    var nome = secaoAtual();
    var secao = SECOES[nome];
    Abas.abre({
      chave: 'config:' + nome,
      titulo: secao.titulo,
      href: '/admin/configuracoes#' + nome,
      icone: 'config',
    });
    Ui.$('#titulo-secao').textContent = secao.titulo;
    // as listas trocam pela contagem de registros
    Ui.$('#contagem').textContent = secao.descricao;
    mostraAjuda('');
    document.title = secao.titulo + ' · Configurações · Help Desk';

    try {
      if (!conteudo.children.length || conteudo.getAttribute('data-secao') !== nome) {
        barra.innerHTML = '';
        conteudo.innerHTML = Ui.carregando();
      }
      conteudo.setAttribute('data-secao', nome);
      // cada seção com lista redefine a ajuda e a lista atual
      ajudaAtual = '';
      listaAtual = null;
      await secao.carrega();
    } catch (e) {
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', renderizaSecao);
    }
  }

  window.addEventListener('hashchange', function () {
    conteudo.innerHTML = '';
    renderizaSecao();
    window.scrollTo(0, 0);
  });

  // delegação de eventos (as listas são redesenhadas a cada mudança)
  document.addEventListener('click', function (e) {
    var filtraEmpresa = e.target.closest('[data-filtra-empresa]');
    if (filtraEmpresa) {
      filtroUsuarios = {
        busca: '',
        papel: 'cliente',
        empresa: filtraEmpresa.getAttribute('data-filtra-empresa'),
      };
      return; // o próprio link troca para #usuarios
    }

    var b = e.target.closest('[data-acao]');
    if (!b) return;
    // botão + das listas; editar é clicando na linha e o resto fica no menu Opções
    if (b.getAttribute('data-acao') === 'nova') {
      edicaoAtual = null;
      SECOES[b.getAttribute('data-tipo')].form(null);
    }
  });

  renderizaSecao();
})();
