(function () {
  var form = Ui.$('#form-login');
  var aviso = Ui.$('#aviso');
  var params = new URLSearchParams(window.location.search);

  // já logado: vai direto para a área certa
  var atual = Api.usuario();
  if (atual && params.get('motivo') !== 'expirou') {
    window.location.replace(Api.inicial(atual));
    return;
  }

  if (params.get('motivo') === 'expirou') {
    aviso.innerHTML = '<div class="alerta info">Sua sessão expirou. Entre novamente.</div>';
  }

  document.querySelectorAll('.contas-teste button').forEach(function (b) {
    b.addEventListener('click', function () {
      form.email.value = b.getAttribute('data-email');
      form.senha.value = 'helpdesk123';
      form.senha.focus();
    });
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    aviso.innerHTML = '';
    if (!form.email.value || !form.senha.value) {
      aviso.innerHTML = '<div class="alerta erro">Informe e-mail e senha.</div>';
      return;
    }
    var restaura = Ui.ocupado(Ui.$('#botao-entrar'), 'Entrando...');
    try {
      var usuario = await Api.login(form.email.value.trim(), form.senha.value);
      window.location.replace(Api.inicial(usuario));
    } catch (erro) {
      restaura();
      aviso.innerHTML = '<div class="alerta erro">' + Ui.esc(erro.message) + '</div>';
    }
  });
})();
