(function () {
  var usuario = Api.exigeLogin('todos');
  if (!usuario) return;
  Ui.navbar(usuario);

  var form = Ui.$('#form-chamado');
  var aviso = Ui.$('#aviso');
  var catalogo = Ui.$('#catalogo');
  var equipe = Api.ehEquipe(usuario);
  var estado = {
    servicos: [],
    equipes: [],
    admins: [],
    escolhido: null,
    eu: usuario,
    // campos adicionais: definições, pessoas para "Lista de pessoas" e valores digitados
    defs: { campos: [], regras: [] },
    pessoas: [],
    valores: {},
  };
  var areaCampos = Ui.$('#campos-adicionais');

  // redesenha os campos que as regras mostram para o serviço/categoria/valores atuais
  function desenhaCampos() {
    Object.assign(estado.valores, CamposAdicionais.le(areaCampos));
    var itens = CamposAdicionais.visiveis(estado.defs, {
      servico: form.servico.value,
      categoria: form.categoria.value,
      valores: estado.valores,
    });
    areaCampos.innerHTML = itens.length
      ? '<p class="passo">Informações adicionais</p>' +
        itens
          .map(function (item) {
            return CamposAdicionais.html(item, estado.valores[item.campo._id], {
              pessoas: estado.pessoas,
            });
          })
          .join('')
      : '';
  }

  // um valor de lista pode mostrar/esconder outros campos
  areaCampos.addEventListener('change', function (e) {
    if (e.target.matches('select[data-campo-adicional]')) desenhaCampos();
  });

  function cardServico(s) {
    return (
      '<button type="button" class="servico-card" data-servico="' +
      s._id +
      '" aria-pressed="' +
      String(estado.escolhido === s._id) +
      '" style="--cor-servico:' +
      Ui.corSegura(s.cor) +
      '">' +
      '<span class="icone">' +
      Ui.esc(Ui.iniciais(s.nome)) +
      '</span>' +
      '<span><strong>' +
      Ui.esc(s.nome) +
      '</strong>' +
      '<span class="desc">' +
      Ui.esc(s.descricao || '') +
      '</span>' +
      '<span class="equipe-destino">Atendido por: ' +
      Ui.esc(s.equipe ? s.equipe.nome : '—') +
      '</span></span>' +
      '</button>'
    );
  }

  function renderizaCatalogo() {
    catalogo.innerHTML = estado.servicos.length
      ? estado.servicos.map(cardServico).join('')
      : Ui.vazio('Nenhum serviço disponível', 'Peça ao administrador para cadastrar os serviços.');
  }

  // responsáveis possíveis: membros da equipe do serviço + admins
  function opcoesResponsavel(servico) {
    var eq = estado.equipes.filter(function (e) {
      return servico && servico.equipe && e._id === servico.equipe._id;
    })[0];
    var vistos = {};
    var pessoas = (eq ? eq.membros : []).concat(estado.admins).filter(function (p) {
      if (!p.ativo || vistos[p._id]) return false;
      vistos[p._id] = true;
      return true;
    });
    form.responsavel.innerHTML = Ui.opcoes(
      pessoas.map(function (p) {
        return { valor: p._id, rotulo: p.nome + (p.papel === 'admin' ? ' (admin)' : '') };
      }),
      '',
      'Ninguém (vai para a fila da equipe)',
    );
  }

  function escolhe(id) {
    var s = estado.servicos.filter(function (x) {
      return x._id === id;
    })[0];
    if (!s) return;
    estado.escolhido = id;
    form.servico.value = id;
    renderizaCatalogo();
    desenhaCampos();

    Ui.$('#servico-escolhido').innerHTML =
      '<span>' +
      Ui.servico(s) +
      ' <span class="suave">→ equipe ' +
      Ui.esc(s.equipe.nome) +
      '</span></span>' +
      '<button type="button" class="botao pequeno" id="trocar-servico">Trocar</button>';
    Ui.$('#trocar-servico').addEventListener('click', function () {
      Ui.$('#passo-servico').classList.remove('oculto');
      Ui.$('#passo-servico').scrollIntoView({ behavior: 'smooth' });
    });

    if (equipe) opcoesResponsavel(s);
    Ui.$('#passo-servico').classList.add('oculto');
    form.classList.remove('oculto');
    form.titulo.focus();
  }

  // a categoria também entra nas regras para exibição
  form.categoria.addEventListener('change', desenhaCampos);

  catalogo.addEventListener('click', function (e) {
    var card = e.target.closest('[data-servico]');
    if (card) escolhe(card.getAttribute('data-servico'));
  });

  async function carrega() {
    catalogo.innerHTML = Ui.carregando('Carregando serviços...');
    try {
      // permissões do perfil de acesso (podem ter mudado depois do login)
      estado.eu = await Api.eu();
      if (!equipe && !Api.pode(estado.eu, 'abrirChamados')) {
        catalogo.innerHTML = Ui.vazio(
          'Seu perfil de acesso não permite abrir chamados',
          'Fale com o responsável pelo atendimento da sua empresa.',
        );
        return;
      }

      var pedidos = [Api.get('/servicos'), Api.get('/categorias')];
      var defs = await Promise.all([Api.get('/campos-adicionais'), Api.get('/regras-exibicao')]);
      estado.defs = { campos: defs[0].campos, regras: defs[1].regras };
      // só a equipe lista pessoas; o cliente não vê campos do tipo "Lista de pessoas" preenchíveis
      if (
        equipe &&
        estado.defs.campos.some(function (c) {
          return c.tipo === 'pessoa';
        })
      ) {
        estado.pessoas = (await Api.get('/usuarios', { ativo: 'true' })).usuarios;
      }
      if (equipe) {
        pedidos.push(Api.get('/usuarios', { papel: 'cliente', ativo: 'true' }));
        pedidos.push(Api.get('/equipes'));
        pedidos.push(Api.get('/usuarios', { papel: 'admin', ativo: 'true' }));
      }
      var r = await Promise.all(pedidos);
      estado.servicos = r[0].servicos;
      renderizaCatalogo();

      form.categoria.innerHTML = Ui.opcoes(
        r[1].categorias.map(function (c) {
          return { valor: c._id, rotulo: c.nome };
        }),
        '',
        'Selecione (opcional)',
      );

      if (equipe) {
        estado.equipes = r[3].equipes;
        estado.admins = r[4].usuarios;
        Ui.$('#campos-equipe').classList.remove('oculto');
        // campos que o perfil de acesso pode bloquear
        form.solicitante.closest('.campo').hidden = !Api.pode(estado.eu, 'abrirEmNomeDeCliente');
        form.prioridade.closest('.campo').hidden = !Api.pode(estado.eu, 'alterarPrioridade');
        form.solicitante.innerHTML = Ui.opcoes(
          r[2].usuarios.map(function (u) {
            return { valor: u._id, rotulo: u.nome + ' (' + u.email + ')' };
          }),
          '',
          '—',
        );
        form.prioridade.innerHTML = Ui.opcoes(
          Object.keys(HD.rotulosPrioridade).map(function (p) {
            return { valor: p, rotulo: HD.rotulosPrioridade[p] };
          }),
          'normal',
        );
        form.prioridade.classList.add('seletor-urgencia');
        form.prioridade.setAttribute('data-urgencia', 'normal');
      }

      // atalho: /chamados/novo?servico=<id>
      var pre = new URLSearchParams(window.location.search).get('servico');
      if (pre) escolhe(pre);
    } catch (e) {
      catalogo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    aviso.innerHTML = '';

    var dados = {
      servico: form.servico.value,
      titulo: form.titulo.value.trim(),
      descricao: form.descricao.value.trim(),
      categoria: form.categoria.value || undefined,
      camposAdicionais: CamposAdicionais.le(areaCampos),
    };
    if (equipe) {
      dados.solicitante = form.solicitante.value || undefined;
      if (Api.pode(estado.eu, 'alterarPrioridade')) dados.prioridade = form.prioridade.value;
      dados.responsavel = form.responsavel.value || undefined;
    }

    var locais = {};
    if (dados.titulo.length < 3) locais.titulo = 'Informe um título com pelo menos 3 caracteres';
    if (!dados.descricao) locais.descricao = 'Descreva o problema';
    Ui.errosDeCampo(form, locais);
    if (Object.keys(locais).length) return;

    var restaura = Ui.ocupado(Ui.$('#botao-enviar'), 'Enviando...');
    try {
      var r = await Api.post('/chamados', dados);
      window.location.href = '/chamados/' + r.chamado.numero + '?criado=1';
    } catch (erro) {
      restaura();
      Ui.errosDeCampo(form, erro.detalhes);
      var extra = erro.detalhes && erro.detalhes.servico ? ' (' + erro.detalhes.servico + ')' : '';
      aviso.innerHTML = '<div class="alerta erro">' + Ui.esc(erro.message + extra) + '</div>';
    }
  });

  carrega();
})();
