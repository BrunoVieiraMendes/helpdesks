(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  Ui.navbar(usuario);

  var conteudo = Ui.$('#conteudo');
  var estado = { filtros: Filtros.daUrl(), pagina: 1 };
  var requisicaoAtual = 0;

  function linha(c) {
    return (
      '<tr data-numero="' +
      c.numero +
      '">' +
      '<td class="numero">#' +
      c.numero +
      '</td>' +
      '<td class="titulo"><span>' +
      Ui.esc(c.titulo) +
      '</span>' +
      (c.tags && c.tags.length ? '<div class="tags-linha">' + Ui.tags(c.tags) + '</div>' : '') +
      '</td>' +
      '<td class="ocultar-mobile">' +
      Ui.esc(c.solicitante ? c.solicitante.nome : '—') +
      (c.empresa ? '<div class="suave pequeno">' + Ui.esc(c.empresa.nome) + '</div>' : '') +
      '</td>' +
      '<td>' +
      Ui.badgeStatus(c.status) +
      '</td>' +
      '<td>' +
      Ui.prioridade(c.prioridade) +
      '</td>' +
      '<td>' +
      Ui.sla(c) +
      '</td>' +
      '<td class="ocultar-mobile">' +
      (c.responsavel ? Ui.esc(c.responsavel.nome) : '<span class="suave">Sem responsável</span>') +
      '</td>' +
      '<td class="ocultar-mobile">' +
      Ui.servico(c.servico) +
      '</td>' +
      '<td class="ocultar-mobile">' +
      Ui.equipe(c.equipe) +
      '</td>' +
      '<td title="' +
      Ui.data(c.updatedAt) +
      '">' +
      Ui.relativo(c.updatedAt) +
      '</td>' +
      '</tr>'
    );
  }

  async function carrega() {
    var minha = ++requisicaoAtual; // descarta respostas antigas quando o filtro muda rápido
    conteudo.innerHTML = Ui.carregando('Carregando fila...');
    try {
      var r = await Api.get(
        '/chamados',
        Object.assign({}, estado.filtros, { pagina: estado.pagina, porPagina: 20 }),
      );
      if (minha !== requisicaoAtual) return;

      Ui.$('#resumo').textContent = r.paginacao.total + ' chamado(s) encontrados';
      conteudo.innerHTML = r.chamados.length
        ? '<table><thead><tr><th>Nº</th><th>Título</th><th class="ocultar-mobile">Solicitante</th><th>Status</th>' +
          '<th>Prioridade</th><th>SLA</th><th class="ocultar-mobile">Responsável</th><th class="ocultar-mobile">Serviço</th><th class="ocultar-mobile">Equipe</th><th>Atualizado</th></tr></thead><tbody>' +
          r.chamados.map(linha).join('') +
          '</tbody></table>'
        : Ui.vazio('Nenhum chamado encontrado', 'Ajuste os filtros para ver outros chamados.');

      Ui.paginacao(Ui.$('#paginacao'), r.paginacao, function (p) {
        estado.pagina = p;
        carrega();
      });
    } catch (e) {
      if (minha !== requisicaoAtual) return;
      Ui.$('#paginacao').innerHTML = '';
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  conteudo.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-numero]');
    if (tr) window.location.href = '/chamados/' + tr.getAttribute('data-numero');
  });

  Filtros.monta(Ui.$('#filtros'), {
    comStatus: true,
    comOrdenacao: true,
    aoMudar: function (f) {
      estado.filtros = f;
      estado.pagina = 1;
      carrega();
    },
  });

  carrega();
})();
