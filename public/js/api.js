// Cliente HTTP da API /v1: guarda o JWT, padroniza erros e trata sessão expirada.
/* exported Api */
var Api = (function () {
  var CHAVE_TOKEN = 'helpdesk.jwt';
  var CHAVE_USUARIO = 'helpdesk.usuario';

  function le(chave) {
    try {
      return localStorage.getItem(chave);
    } catch (_e) {
      return null;
    }
  }
  function grava(chave, valor) {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, valor);
    } catch (_e) {
      /* navegação privada: segue só com a sessão em memória */
    }
  }

  var memoria = { token: le(CHAVE_TOKEN), usuario: null };
  try {
    memoria.usuario = JSON.parse(le(CHAVE_USUARIO) || 'null');
  } catch (_e) {
    memoria.usuario = null;
  }

  function salvaSessao(jwt, usuario) {
    memoria.token = jwt;
    memoria.usuario = usuario;
    grava(CHAVE_TOKEN, jwt);
    grava(CHAVE_USUARIO, JSON.stringify(usuario));
  }

  function encerraSessao(motivo) {
    memoria.token = null;
    memoria.usuario = null;
    grava(CHAVE_TOKEN, null);
    grava(CHAVE_USUARIO, null);
    window.location.href = '/login' + (motivo ? '?motivo=' + motivo : '');
  }

  /** Erro com status HTTP e detalhes por campo vindos da API */
  function ErroApi(mensagem, status, detalhes) {
    var erro = new Error(mensagem);
    erro.status = status;
    erro.detalhes = detalhes || null;
    return erro;
  }

  function monta(query) {
    if (!query) return '';
    var params = new URLSearchParams();
    Object.keys(query).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      params.set(k, Array.isArray(v) ? v.join(',') : v);
    });
    var s = params.toString();
    return s ? '?' + s : '';
  }

  async function req(metodo, caminho, opcoes) {
    opcoes = opcoes || {};
    var cabecalhos = { Accept: 'application/json' };
    if (opcoes.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (memoria.token) cabecalhos.Authorization = 'Bearer ' + memoria.token;

    var resposta;
    try {
      resposta = await fetch('/v1' + caminho + monta(opcoes.query), {
        method: metodo,
        headers: cabecalhos,
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      });
    } catch (_e) {
      throw ErroApi('Não foi possível conectar ao servidor. Verifique sua conexão.', 0);
    }

    var dados = null;
    try {
      dados = await resposta.json();
    } catch (_e) {
      dados = null;
    }

    if (resposta.status === 401 && caminho !== '/auth') {
      encerraSessao('expirou');
      throw ErroApi('Sessão expirada', 401);
    }
    if (!resposta.ok || (dados && dados.sucesso === false)) {
      throw ErroApi(
        (dados && dados.erro) || 'Erro inesperado (' + resposta.status + ')',
        resposta.status,
        dados && dados.detalhes,
      );
    }
    return dados;
  }

  var EQUIPE = ['agente', 'admin'];
  var pedidoEu = null;

  return {
    get: function (caminho, query) {
      return req('GET', caminho, { query: query });
    },
    post: function (caminho, corpo) {
      return req('POST', caminho, { corpo: corpo || {} });
    },
    del: function (caminho) {
      return req('DELETE', caminho);
    },
    patch: function (caminho, corpo) {
      return req('PATCH', caminho, { corpo: corpo || {} });
    },
    put: function (caminho, corpo) {
      return req('PUT', caminho, { corpo: corpo || {} });
    },
    login: async function (email, senha) {
      var dados = await req('POST', '/auth', { corpo: { email: email, senha: senha } });
      salvaSessao(dados.jwt, dados.usuario);
      return dados.usuario;
    },
    sair: function () {
      // avisa que saiu (fica offline na hora) antes de apagar o token
      var saindo = window.Presenca ? window.Presenca.sai() : Promise.resolve();
      var limite = new Promise(function (resolve) {
        setTimeout(resolve, 800);
      });
      Promise.race([saindo, limite]).then(function () {
        encerraSessao();
      });
    },
    usuario: function () {
      return memoria.usuario;
    },
    /**
     * Usuário logado com o perfil de acesso e as permissões atuais (uma chamada por página).
     * @returns {Promise<{ _id: string, nome: string, papel: string, perfil: any, permissoes: Record<string, boolean> }>}
     */
    eu: function () {
      pedidoEu =
        pedidoEu ||
        req('GET', '/usuarios/eu').then(function (dados) {
          salvaSessao(memoria.token, dados.usuario);
          return dados.usuario;
        });
      return pedidoEu;
    },
    /** A permissão do perfil de acesso está liberada? (admin sempre pode) */
    pode: function (usuario, permissao) {
      if (!usuario) return false;
      if (usuario.papel === 'admin') return true;
      return Boolean(usuario.permissoes && usuario.permissoes[permissao]);
    },
    ehEquipe: function (usuario) {
      usuario = usuario || memoria.usuario;
      return Boolean(usuario) && EQUIPE.indexOf(usuario.papel) !== -1;
    },
    inicial: function (usuario) {
      return EQUIPE.indexOf(usuario.papel) !== -1 ? '/inicio' : '/portal';
    },
    /**
     * Garante sessão e papel permitido para a página; redireciona se não tiver.
     * @param {'equipe'|'cliente'|'todos'} quem
     */
    exigeLogin: function (quem) {
      var u = memoria.usuario;
      if (!memoria.token || !u) {
        window.location.replace('/login');
        return null;
      }
      var equipe = EQUIPE.indexOf(u.papel) !== -1;
      if ((quem === 'equipe' && !equipe) || (quem === 'cliente' && equipe)) {
        window.location.replace(this.inicial(u));
        return null;
      }
      return u;
    },
  };
})();
