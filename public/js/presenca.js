// Sinal de presença dos agentes (tela "Agentes online" do admin).
// A cada minuto avisa o servidor que o sistema está aberto; "ativo" só quando a aba está
// visível e a pessoa mexeu (mouse, teclado, rolagem ou toque) nos últimos 5 minutos.
/* exported Presenca */
var Presenca = (function () {
  var INTERVALO = 60000;
  var PARADO_APOS = 5 * 60000;
  var iniciado = false;
  var ultimaInteracao = Date.now();

  function ativo() {
    return !document.hidden && Date.now() - ultimaInteracao < PARADO_APOS;
  }

  function envia(dados) {
    Api.post('/presenca', dados).catch(function () {
      /* sem conexão: tenta no próximo minuto */
    });
  }

  function sinal() {
    envia({ ativo: ativo() });
  }

  /** Começa a mandar o sinal (uma vez por página, só para a equipe). */
  function inicia() {
    if (iniciado) return;
    iniciado = true;
    var marca = function () {
      var estavaParado = Date.now() - ultimaInteracao >= PARADO_APOS;
      ultimaInteracao = Date.now();
      // voltou depois de um tempo parado: avisa na hora (não espera o próximo minuto)
      if (estavaParado) sinal();
    };
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (evento) {
      document.addEventListener(evento, marca, { passive: true, capture: true });
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) ultimaInteracao = Date.now();
      sinal();
    });
    sinal();
    setInterval(sinal, INTERVALO);
  }

  /** Ao sair do sistema: fica offline na hora. */
  function sai() {
    if (!iniciado) return Promise.resolve();
    return Api.post('/presenca', { saindo: true }).catch(function () {});
  }

  return { inicia: inicia, sai: sai };
})();
