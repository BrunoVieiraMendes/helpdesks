(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  Ui.navbar(usuario);

  var conteudo = Ui.$('#conteudo');
  var estado = {
    filtros: Filtros.daUrl(),
    colunas: [],
    arrastando: null,
    limite: 50,
    justificativas: [],
    eu: usuario, // trocado pelo usuário com as permissões atuais do perfil
  };
  var requisicaoAtual = 0;

  function podeMover(de, para) {
    if (de === para) return false;
    if (de === 'fechado' && !Api.pode(estado.eu, 'reabrirChamados')) return false;
    return (HD.transicoes[de] || []).indexOf(para) !== -1;
  }

  function justificativasPara(status) {
    return estado.justificativas
      .filter(function (j) {
        return j.status.indexOf(status) !== -1;
      })
      .map(function (j) {
        return { valor: j._id, rotulo: j.nome };
      });
  }

  function card(c) {
    return (
      '<article class="card" draggable="true" data-numero="' +
      c.numero +
      '" data-status="' +
      c.status +
      '" data-prioridade="' +
      c.prioridade +
      '">' +
      '<div class="topo"><span class="numero">#' +
      c.numero +
      '</span>' +
      Ui.prioridade(c.prioridade) +
      '</div>' +
      '<div class="titulo-card">' +
      Ui.esc(c.titulo) +
      '</div>' +
      '<div class="tags-card">' +
      Ui.equipe(c.equipe) +
      (c.servico ? '<span class="tag">' + Ui.esc(c.servico.nome) + '</span>' : '') +
      Ui.tags(c.tags) +
      '</div>' +
      (c.status === 'resolvido' || c.status === 'fechado'
        ? ''
        : '<div class="sla-card">' + Ui.sla(c) + '</div>') +
      '<div class="rodape"><span>' +
      Ui.esc(c.solicitante ? c.solicitante.nome : '') +
      ' · ' +
      Ui.relativo(c.updatedAt) +
      '</span>' +
      Ui.avatar(c.responsavel) +
      '</div>' +
      '</article>'
    );
  }

  function coluna(col) {
    var faltam = col.total - col.chamados.length;
    return (
      '<section class="coluna" data-status="' +
      col.status +
      '">' +
      '<header><span>' +
      Ui.esc(col.rotulo) +
      '</span><span class="contagem">' +
      col.total +
      '</span></header>' +
      '<div class="cartoes">' +
      col.chamados.map(card).join('') +
      (faltam > 0
        ? '<div class="mais">+ ' + faltam + ' chamado(s) — refine os filtros ou use a Lista</div>'
        : '') +
      '</div></section>'
    );
  }

  function renderiza() {
    conteudo.innerHTML = '<div class="quadro">' + estado.colunas.map(coluna).join('') + '</div>';
  }

  async function carrega(silencioso) {
    var minha = ++requisicaoAtual;
    if (!silencioso) conteudo.innerHTML = Ui.carregando('Carregando quadro...');
    try {
      var r = await Api.get(
        '/chamados/kanban',
        Object.assign({}, estado.filtros, { status: null, ordenar: null, limite: estado.limite }),
      );
      if (minha !== requisicaoAtual || estado.arrastando) return;
      estado.colunas = r.colunas;
      renderiza();
    } catch (e) {
      if (minha !== requisicaoAtual || silencioso) return;
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', function () {
        carrega();
      });
    }
  }

  // ---------- estado local (para atualização otimista e reversão) ----------
  function acha(numero) {
    for (var i = 0; i < estado.colunas.length; i++) {
      var col = estado.colunas[i];
      for (var j = 0; j < col.chamados.length; j++) {
        if (col.chamados[j].numero === numero)
          return { coluna: col, indice: j, chamado: col.chamados[j] };
      }
    }
    return null;
  }
  function colunaDe(status) {
    return estado.colunas.filter(function (c) {
      return c.status === status;
    })[0];
  }
  function move(numero, para, chamadoAtualizado) {
    var atual = acha(numero);
    if (!atual) return;
    atual.coluna.chamados.splice(atual.indice, 1);
    atual.coluna.total -= 1;
    var destino = colunaDe(para);
    destino.chamados.unshift(
      chamadoAtualizado || Object.assign({}, atual.chamado, { status: para }),
    );
    destino.total += 1;
  }

  // ---------- drag and drop (HTML5 nativo) ----------
  conteudo.addEventListener('dragstart', function (e) {
    var el = e.target.closest('.card');
    if (!el) return;
    estado.arrastando = {
      numero: Number(el.getAttribute('data-numero')),
      de: el.getAttribute('data-status'),
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(estado.arrastando.numero));
    setTimeout(function () {
      el.classList.add('arrastando');
    }, 0);
  });

  conteudo.addEventListener('dragend', function (e) {
    var el = e.target.closest('.card');
    if (el) el.classList.remove('arrastando');
    document.querySelectorAll('.coluna').forEach(function (c) {
      c.classList.remove('alvo', 'proibido');
    });
    estado.arrastando = null;
  });

  conteudo.addEventListener('dragover', function (e) {
    var col = e.target.closest('.coluna');
    if (!col || !estado.arrastando) return;
    var para = col.getAttribute('data-status');
    var ok = podeMover(estado.arrastando.de, para);
    document.querySelectorAll('.coluna').forEach(function (c) {
      c.classList.remove('alvo', 'proibido');
    });
    if (para !== estado.arrastando.de) col.classList.add(ok ? 'alvo' : 'proibido');
    if (ok) {
      e.preventDefault(); // habilita o drop
      e.dataTransfer.dropEffect = 'move';
    }
  });

  conteudo.addEventListener('drop', async function (e) {
    var col = e.target.closest('.coluna');
    if (!col || !estado.arrastando) return;
    e.preventDefault();

    var numero = estado.arrastando.numero;
    var de = estado.arrastando.de;
    var para = col.getAttribute('data-status');
    estado.arrastando = null;
    if (!podeMover(de, para)) return;

    // status que exige motivo (ex.: Pendente): pergunta antes de mover
    var corpo = { status: para };
    var motivos = justificativasPara(para);
    if (motivos.length) {
      var escolhida = await Ui.escolhe({
        titulo: 'Mover #' + numero + ' para ' + HD.rotulosStatus[para],
        rotulo: 'Justificativa',
        opcoes: motivos,
        confirmar: 'Mover',
      });
      if (!escolhida) return;
      corpo.justificativa = escolhida;
    }

    // otimista: move já na tela; se a API recusar, volta
    move(numero, para);
    renderiza();
    var el = conteudo.querySelector('.card[data-numero="' + numero + '"]');
    if (el) el.classList.add('salvando');

    try {
      var r = await Api.patch('/chamados/' + numero, corpo);
      var atual = acha(numero);
      if (atual) atual.coluna.chamados[atual.indice] = r.chamado;
      renderiza();
      Ui.toast('#' + numero + ' movido para ' + HD.rotulosStatus[para], 'sucesso');
    } catch (erro) {
      move(numero, de);
      renderiza();
      Ui.toast(erro.message, 'erro');
      if (erro.status === 409) carrega(true);
    }
  });

  conteudo.addEventListener('click', function (e) {
    var el = e.target.closest('.card');
    if (el) window.location.href = '/chamados/' + el.getAttribute('data-numero');
  });

  Filtros.monta(Ui.$('#filtros'), {
    comStatus: false,
    comOrdenacao: false,
    aoMudar: function (f) {
      estado.filtros = f;
      carrega();
    },
  });

  // mantém o quadro atualizado com o trabalho dos outros agentes
  setInterval(function () {
    if (!document.hidden && !estado.arrastando) carrega(true);
  }, 60000);
  window.addEventListener('focus', function () {
    if (!estado.arrastando) carrega(true);
  });

  Api.eu()
    .then(function (eu) {
      estado.eu = eu;
    })
    .catch(function () {
      /* sem as permissões, a API recusa o que não for permitido */
    });

  Api.get('/justificativas')
    .then(function (r) {
      estado.justificativas = r.justificativas;
    })
    .catch(function () {
      /* sem a lista, a API pede a justificativa e o card volta com a mensagem */
    });

  carrega();
})();
