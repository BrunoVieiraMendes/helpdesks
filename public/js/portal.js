(function () {
  var usuario = Api.exigeLogin('cliente');
  if (!usuario) return;
  Ui.navbar(usuario);

  var ABERTOS = ['novo', 'em_atendimento', 'pendente'];
  // daEmpresa: o perfil de acesso libera os chamados de toda a empresa do cliente
  var estado = { filtro: 'abertos', pagina: 1, daEmpresa: false };
  var conteudo = Ui.$('#conteudo');

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
      '</span></td>' +
      (estado.daEmpresa
        ? '<td class="ocultar-mobile">' +
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
      '<td title="' +
      Ui.data(c.updatedAt) +
      '">' +
      Ui.relativo(c.updatedAt) +
      '</td>' +
      '<td class="ocultar-mobile suave">' +
      Ui.data(c.createdAt) +
      '</td>' +
      '</tr>'
    );
  }

  async function carrega() {
    conteudo.innerHTML = Ui.carregando('Carregando seus chamados...');
    try {
      var r = await Api.get('/chamados', {
        status: estado.filtro === 'abertos' ? ABERTOS : null,
        pagina: estado.pagina,
        porPagina: 15,
      });

      if (!r.chamados.length) {
        conteudo.innerHTML = Ui.vazio(
          estado.filtro === 'abertos'
            ? 'Nenhum chamado em aberto'
            : 'Você ainda não abriu chamados',
          'Precisa de ajuda? Clique em "Abrir Novo Chamado".',
        );
      } else {
        conteudo.innerHTML =
          '<table><thead><tr><th>Nº</th><th>Título</th>' +
          (estado.daEmpresa ? '<th class="ocultar-mobile">Solicitante</th>' : '') +
          '<th>Status</th><th class="ocultar-mobile">Serviço</th>' +
          '<th>Atualizado</th><th class="ocultar-mobile">Aberto em</th></tr></thead><tbody>' +
          r.chamados.map(linha).join('') +
          '</tbody></table>';
      }
      Ui.paginacao(Ui.$('#paginacao'), r.paginacao, function (p) {
        estado.pagina = p;
        carrega();
      });
    } catch (e) {
      conteudo.innerHTML = Ui.erro(e.message, 'tentar-novamente');
      Ui.$('#tentar-novamente').addEventListener('click', carrega);
    }
  }

  conteudo.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-numero]');
    if (tr) window.location.href = '/chamados/' + tr.getAttribute('data-numero');
  });

  document.querySelectorAll('[data-filtro]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('[data-filtro]').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      estado.filtro = chip.getAttribute('data-filtro');
      estado.pagina = 1;
      carrega();
    });
  });

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

  Api.eu()
    .then(function (eu) {
      estado.daEmpresa = Api.pode(eu, 'verChamadosDaEmpresa');
      if (estado.daEmpresa) {
        Ui.$('h1').textContent = 'Chamados da empresa';
        Ui.$('h1 + p').textContent = 'Os seus chamados e os dos seus colegas de empresa.';
      }
    })
    .catch(function () {
      /* segue com a lista padrão */
    })
    .then(carrega);
})();
