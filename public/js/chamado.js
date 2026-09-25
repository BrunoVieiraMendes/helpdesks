// Tela do chamado no layout do Movidesk: caminho (empresa → solicitante → chamado) com
// status e OPÇÕES no topo, painel à esquerda (abas Público / Interno), editor de ações
// e a lista de ações numeradas, com filtros "Visualizar".
(function () {
  var usuario = Api.exigeLogin('todos');
  if (!usuario) return;
  Ui.navbar(usuario);

  var numero = document.querySelector('main').getAttribute('data-numero');
  var conteudo = Ui.$('#conteudo');
  var equipe = Api.ehEquipe(usuario);
  var CHAVE_VISUALIZAR = 'helpdesk.chamado.visualizar';

  var estado = {
    chamado: null,
    interacoes: [],
    agentes: [],
    categorias: [],
    equipes: [],
    servicos: [],
    tags: [],
    justificativas: [],
    macros: [],
    defs: { campos: [], regras: [] }, // campos adicionais e regras para exibição
    pessoas: [], // opções dos campos "Lista de pessoas"
    macro: null, // macro escolhida no editor
    nota: 0, // estrelas marcadas na pesquisa de satisfação
    modo: 'publica', // tipo da próxima ação
    painel: 'publico', // aba do painel esquerdo
    visualizar: leVisualizar(),
  };

  function leVisualizar() {
    var padrao = { publicas: true, internas: true, historico: false };
    try {
      return Object.assign(padrao, JSON.parse(localStorage.getItem(CHAVE_VISUALIZAR) || '{}'));
    } catch (_e) {
      return padrao;
    }
  }

  function gravaVisualizar() {
    try {
      localStorage.setItem(CHAVE_VISUALIZAR, JSON.stringify(estado.visualizar));
    } catch (_e) {
      /* preferência só nesta visita */
    }
  }

  var ICONES = {
    empresa:
      '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
    chamado:
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    seta: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M13 9l3 3-3 3"/>',
  };
  function icone(nome) {
    return (
      '<svg class="icone-linha" viewBox="0 0 24 24" aria-hidden="true">' + ICONES[nome] + '</svg>'
    );
  }

  // ---------------------------------------------------------------- regras de tela
  function justificativasPara(status) {
    return estado.justificativas.filter(function (j) {
      return j.status.indexOf(status) !== -1;
    });
  }

  // status que dá para escolher agora (o atual + as transições permitidas)
  function opcoesDeStatus(c) {
    var p = c.permissoes;
    return [c.status].concat(HD.transicoes[c.status] || []).filter(function (s) {
      return c.status !== 'fechado' || s === 'fechado' || p.podeReabrir;
    });
  }

  // responsável precisa ser membro da equipe do chamado (admins atendem qualquer equipe)
  function responsaveisPossiveis(c) {
    var equipeId = c.equipe && c.equipe._id;
    var lista = estado.agentes.filter(function (a) {
      return (
        a.papel === 'admin' ||
        (a.equipes || []).some(function (e) {
          return e._id === equipeId;
        })
      );
    });
    // mantém o responsável atual visível mesmo se ele saiu da equipe
    if (
      c.responsavel &&
      !lista.some(function (a) {
        return a._id === c.responsavel._id;
      })
    ) {
      lista.push(c.responsavel);
    }
    return lista;
  }

  function souMembro(equipeId) {
    return (
      usuario.papel === 'admin' ||
      estado.agentes.some(function (a) {
        return (
          a._id === usuario._id &&
          (a.equipes || []).some(function (e) {
            return e._id === equipeId;
          })
        );
      })
    );
  }

  // campos que as regras mostram para o serviço/categoria/valores do chamado
  function camposVisiveisDoChamado(c) {
    return CamposAdicionais.visiveis(estado.defs, {
      servico: c.servico,
      categoria: c.categoria,
      valores: c.camposAdicionais,
    });
  }

  // ---------------------------------------------------------------- topo
  function caminho(c) {
    return (
      '<nav class="caminho-chamado" aria-label="Caminho">' +
      (c.empresa
        ? '<span>' + icone('empresa') + Ui.esc(c.empresa.nome) + '</span>' + icone('seta')
        : '') +
      '<span>' +
      icone('pessoa') +
      Ui.esc(c.solicitante.nome) +
      '</span>' +
      icone('seta') +
      '<strong>' +
      icone('chamado') +
      '#' +
      c.numero +
      '</strong></nav>'
    );
  }

  function statusDoTopo(c) {
    if (!equipe)
      return '<div class="status-topo somente-leitura">' + Ui.badgeStatus(c.status) + '</div>';
    var p = c.permissoes;
    var habilitado = p.podeEditar || p.podeReabrir;
    return (
      '<select class="status-topo campo-chamado" name="status" aria-label="Status"' +
      (habilitado ? '' : ' disabled') +
      '>' +
      Ui.opcoes(
        opcoesDeStatus(c).map(function (s) {
          return { valor: s, rotulo: HD.rotulosStatus[s] };
        }),
        c.status,
      ) +
      '</select>'
    );
  }

  function menuOpcoes(c) {
    var p = c.permissoes;
    var souResponsavel = c.responsavel && c.responsavel._id === usuario._id;
    var itens = [];
    if (equipe && p.podeAssumir && !souResponsavel) itens.push(['assumir', 'Assumir chamado']);
    if (equipe && p.podeTransferir) itens.push(['encaminhar', 'Encaminhar para outra equipe']);
    if (p.podeReabrir) itens.push(['reabrir', 'Reabrir chamado']);
    itens.push(['copiar', 'Copiar link do chamado']);
    itens.push(['voltar', equipe ? 'Voltar para a fila' : 'Voltar para meus chamados']);
    return (
      '<div class="menu-opcoes"><button type="button" class="botao-opcoes" id="opcoes-chamado" aria-haspopup="true" aria-expanded="false">Opções <span aria-hidden="true">⋮</span></button>' +
      '<div class="menu-lote" id="menu-chamado" role="menu" hidden>' +
      itens
        .map(function (i) {
          return (
            '<button type="button" role="menuitem" data-opcao="' + i[0] + '">' + i[1] + '</button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  // ---------------------------------------------------------------- painel esquerdo
  function cartaoSolicitante(c) {
    return (
      '<div class="cartao-solicitante"><span class="bolinha-status status-' +
      Ui.esc(c.status) +
      '" aria-hidden="true"></span><div><strong>' +
      Ui.esc(c.solicitante.nome) +
      '</strong><span>' +
      Ui.esc(c.solicitante.email) +
      '</span>' +
      (c.empresa ? '<span>' + Ui.esc(c.empresa.nome) + '</span>' : '') +
      '</div></div>'
    );
  }

  function selectCampo(nome, rotulo, opcoes, valor, vazioTexto, desabilitado, extraRotulo) {
    return (
      '<div class="campo"><div class="rotulo-com-acao"><label for="pc-' +
      nome +
      '">' +
      rotulo +
      '</label>' +
      (extraRotulo || '') +
      '</div><select id="pc-' +
      nome +
      '" class="campo-chamado" name="' +
      nome +
      '"' +
      (desabilitado ? ' disabled' : '') +
      '>' +
      Ui.opcoes(opcoes, valor, vazioTexto) +
      '</select></div>'
    );
  }

  // só aparece quando o status atual tem motivos cadastrados
  function campoJustificativa(c, dis) {
    var lista = justificativasPara(c.status);
    if (!lista.length && !c.justificativa) return '';
    if (
      c.justificativa &&
      !lista.some(function (j) {
        return j._id === c.justificativa._id;
      })
    ) {
      lista = lista.concat(c.justificativa); // justificativa desativada depois de usada
    }
    return selectCampo(
      'justificativa',
      'Justificativa',
      lista.map(function (j) {
        return { valor: j._id, rotulo: j.nome };
      }),
      c.justificativa && c.justificativa._id,
      c.justificativa ? undefined : 'Selecione...',
      dis,
    );
  }

  function campoTags(c, dis) {
    var marcadas = (c.tags || []).map(function (t) {
      return t._id;
    });
    // tags inativas continuam visíveis no chamado que já as tinha
    var disponiveis = estado.tags.concat(
      (c.tags || []).filter(function (t) {
        return !estado.tags.some(function (x) {
          return x._id === t._id;
        });
      }),
    );
    if (!disponiveis.length) return '';
    return (
      '<div class="campo"><span class="rotulo-campo">Tags</span>' +
      '<details class="seletor-tags"' +
      (dis ? ' data-desabilitado' : '') +
      '><summary>' +
      (marcadas.length ? Ui.tags(c.tags) : '<span class="suave">Adicionar tags</span>') +
      '</summary><div class="opcoes-tags">' +
      disponiveis
        .map(function (t) {
          return (
            '<label><input type="checkbox" name="tag" value="' +
            t._id +
            '"' +
            (marcadas.indexOf(t._id) !== -1 ? ' checked' : '') +
            (dis ? ' disabled' : '') +
            ' /> ' +
            Ui.tag(t) +
            '</label>'
          );
        })
        .join('') +
      '</div></details></div>'
    );
  }

  function camposEditaveis(c, filtro, dis) {
    return camposVisiveisDoChamado(c)
      .filter(function (item) {
        return filtro(item.campo);
      })
      .map(function (item) {
        return CamposAdicionais.html(item, c.camposAdicionais[item.campo._id], {
          pessoas: estado.pessoas,
          desabilitado: dis,
          prefixo: 'pc',
        });
      })
      .join('');
  }

  // SLA e datas (a equipe vê os prazos; o cliente, só as datas)
  function primeiraResposta(c) {
    var s = c.sla;
    if (s.primeiraRespostaEm) {
      var noPrazo =
        !s.prazoPrimeiraResposta ||
        new Date(s.primeiraRespostaEm) <= new Date(s.prazoPrimeiraResposta);
      return (
        Ui.duracao(c.createdAt, s.primeiraRespostaEm) +
        (s.prazoPrimeiraResposta
          ? ' <span class="sla-badge sla-' +
            (noPrazo ? 'cumprido' : 'violado') +
            '">' +
            (noPrazo ? 'no prazo' : 'atrasada') +
            '</span>'
          : '')
      );
    }
    if (s.prazoPrimeiraResposta && new Date(s.prazoPrimeiraResposta) < new Date()) {
      return '<span class="sla-badge sla-vencido">Atrasada</span>';
    }
    return 'Aguardando';
  }

  function sla(c) {
    var s = c.sla;
    var linhas = [
      ['Aberto em', Ui.data(c.createdAt)],
      ['Prazo 1ª resposta', s.prazoPrimeiraResposta ? Ui.data(s.prazoPrimeiraResposta) : '—'],
      ['1ª resposta', primeiraResposta(c)],
      ['Previsão de solução', s.prazoSolucao ? Ui.data(s.prazoSolucao) : '—'],
      ['Situação', Ui.sla(c)],
      ['Resolvido em', s.resolvidoEm ? Ui.data(s.resolvidoEm) : '—'],
      ['Tempo p/ resolver', s.resolvidoEm ? Ui.duracao(c.createdAt, s.resolvidoEm) : '—'],
      ['Fechado em', s.fechadoEm ? Ui.data(s.fechadoEm) : '—'],
    ];
    if (s.minutosPausados) {
      linhas.splice(5, 0, ['Tempo pausado', Math.round(s.minutosPausados / 6) / 10 + 'h úteis']);
    }
    if (!equipe) {
      linhas = linhas.filter(function (l) {
        return ['Aberto em', 'Resolvido em', 'Fechado em'].indexOf(l[0]) !== -1;
      });
    }
    return (
      '<div class="sla"><h3>' +
      (equipe ? 'SLA' : 'Datas') +
      '</h3><dl>' +
      linhas
        .map(function (l) {
          return '<dt>' + l[0] + '</dt><dd>' + l[1] + '</dd>';
        })
        .join('') +
      '</dl></div>'
    );
  }

  function avaliacaoRecebida(c, titulo) {
    if (!c.avaliacao) return '';
    return (
      '<div class="avaliacao-recebida"><h3>' +
      titulo +
      '</h3>' +
      Ui.estrelas(c.avaliacao.nota) +
      (c.avaliacao.comentario
        ? '<blockquote>' + Ui.esc(c.avaliacao.comentario) + '</blockquote>'
        : '') +
      '<span class="suave">' +
      Ui.data(c.avaliacao.em) +
      '</span></div>'
    );
  }

  function abasDoPainel() {
    var abas = equipe
      ? [
          ['publico', 'Público'],
          ['interno', 'Interno'],
        ]
      : [['publico', 'Detalhes']];
    return (
      '<div class="abas-painel" role="tablist">' +
      abas
        .map(function (a) {
          var ativa = estado.painel === a[0];
          return (
            '<button type="button" role="tab" data-painel="' +
            a[0] +
            '" aria-selected="' +
            ativa +
            '">' +
            (ativa ? '<span aria-hidden="true">✓</span>' : '') +
            a[1] +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function painelPublicoEquipe(c) {
    var p = c.permissoes;
    var dis = !p.podeEditar;
    var souResponsavel = c.responsavel && c.responsavel._id === usuario._id;
    var atribuir =
      p.podeAssumir && !souResponsavel
        ? '<button type="button" class="link-acao" data-opcao="assumir">Atribuir para mim</button>'
        : '';

    return (
      cartaoSolicitante(c) +
      selectCampo(
        'servico',
        'Serviço',
        estado.servicos.map(function (sv) {
          return { valor: sv._id, rotulo: sv.nome };
        }),
        c.servico && c.servico._id,
        c.servico ? undefined : '—',
        !p.podeTransferir,
      ) +
      '<div class="linha-dupla">' +
      selectCampo(
        'categoria',
        'Categoria',
        estado.categorias.map(function (a) {
          return { valor: a._id, rotulo: a.nome };
        }),
        c.categoria && c.categoria._id,
        '- Selecione -',
        dis,
      ) +
      selectCampo(
        'prioridade',
        'Urgência',
        Object.keys(HD.rotulosPrioridade).map(function (k) {
          return { valor: k, rotulo: HD.rotulosPrioridade[k] };
        }),
        c.prioridade,
        undefined,
        !p.podeAlterarPrioridade,
      ) +
      '</div>' +
      '<div class="campo"><span class="rotulo-campo">Previsão de solução</span><div class="valor-caixa">' +
      (c.sla.prazoSolucao ? Ui.data(c.sla.prazoSolucao) + ' ' + Ui.sla(c) : '-') +
      '</div></div>' +
      selectCampo(
        'responsavel',
        'Responsável',
        responsaveisPossiveis(c).map(function (a) {
          return { valor: a._id, rotulo: (c.equipe ? c.equipe.nome + ' » ' : '') + a.nome };
        }),
        c.responsavel && c.responsavel._id,
        'Ninguém',
        dis,
        atribuir,
      ) +
      selectCampo(
        'equipe',
        'Equipe',
        estado.equipes.map(function (e) {
          return { valor: e._id, rotulo: e.nome };
        }),
        c.equipe && c.equipe._id,
        c.equipe ? undefined : '—',
        !p.podeTransferir,
      ) +
      campoJustificativa(c, dis) +
      campoTags(c, dis) +
      camposEditaveis(
        c,
        function (campo) {
          return campo.visivelParaCliente;
        },
        dis,
      )
    );
  }

  function painelInternoEquipe(c) {
    var internos = camposEditaveis(
      c,
      function (campo) {
        return !campo.visivelParaCliente;
      },
      !c.permissoes.podeEditar,
    );
    return (
      (internos
        ? '<div class="campos-do-chamado">' + internos + '</div>'
        : '<p class="suave">Nenhum campo interno para este chamado.</p>') +
      '<hr />' +
      sla(c) +
      (c.avaliacao ? '<hr />' + avaliacaoRecebida(c, 'Avaliação do cliente') : '')
    );
  }

  function valorLeitura(rotulo, html) {
    return (
      '<div class="campo"><span class="rotulo-campo">' +
      rotulo +
      '</span><div class="valor-caixa">' +
      html +
      '</div></div>'
    );
  }

  function painelCliente(c) {
    var preenchidos = estado.defs.campos.filter(function (campo) {
      var v = c.camposAdicionais[campo._id];
      return v !== undefined && v !== null && v !== '';
    });
    return (
      cartaoSolicitante(c) +
      valorLeitura('Serviço', Ui.servico(c.servico)) +
      '<div class="linha-dupla">' +
      valorLeitura('Categoria', Ui.esc(c.categoria ? c.categoria.nome : '—')) +
      valorLeitura('Urgência', Ui.prioridade(c.prioridade)) +
      '</div>' +
      valorLeitura('Equipe', Ui.esc(c.equipe ? c.equipe.nome : '—')) +
      valorLeitura(
        'Responsável',
        Ui.esc(c.responsavel ? c.responsavel.nome : 'Aguardando atendimento'),
      ) +
      preenchidos
        .map(function (campo) {
          return valorLeitura(
            Ui.esc(campo.nome),
            Ui.esc(
              CamposAdicionais.texto(campo, c.camposAdicionais[campo._id], c.pessoasDosCampos),
            ),
          );
        })
        .join('') +
      '<hr />' +
      sla(c) +
      (c.avaliacao ? '<hr />' + avaliacaoRecebida(c, 'Sua avaliação') : '')
    );
  }

  function painelEsquerdo(c) {
    var corpo = !equipe
      ? painelCliente(c)
      : estado.painel === 'interno'
        ? painelInternoEquipe(c)
        : painelPublicoEquipe(c);
    return (
      '<aside class="painel-chamado">' +
      abasDoPainel() +
      '<div class="corpo-painel">' +
      corpo +
      '</div></aside>'
    );
  }

  // ---------------------------------------------------------------- editor de ações
  function descreveAcoes(m) {
    var a = m.acoes || {};
    var partes = [];
    if (a.status) {
      partes.push(
        'Status: ' +
          HD.rotulosStatus[a.status] +
          (a.justificativa ? ' (' + a.justificativa.nome + ')' : ''),
      );
    }
    if (a.prioridade) partes.push('Urgência: ' + HD.rotulosPrioridade[a.prioridade]);
    if (a.equipe) partes.push('Equipe: ' + a.equipe.nome);
    if (a.atribuirAMim) partes.push('Atribuir a mim');
    if (a.adicionarTags && a.adicionarTags.length) {
      partes.push(
        'Tags: ' +
          a.adicionarTags
            .map(function (t) {
              return t.nome;
            })
            .join(', '),
      );
    }
    return partes.join(' · ');
  }

  // macro: linha logo abaixo do texto, com o seletor e o resumo do que a macro vai fazer
  function linhaMacro() {
    if (!estado.macros.length) return '';
    var m = estado.macro;
    return (
      '<div class="linha-macro"><select id="seletor-macro" class="seletor-macro" aria-label="Aplicar macro">' +
      Ui.opcoes(
        estado.macros.map(function (x) {
          return { valor: x._id, rotulo: x.nome };
        }),
        m && m._id,
        '⚡ Aplicar macro...',
      ) +
      '</select>' +
      (m
        ? '<span class="acoes-macro">' +
          Ui.esc(descreveAcoes(m) || 'Só a mensagem') +
          ' · ' +
          (m.tipo === 'interna' ? 'ação interna' : 'ação pública') +
          '</span><button type="button" class="botao pequeno" id="cancela-macro">Cancelar macro</button>'
        : '') +
      '</div>'
    );
  }

  function editor(c) {
    var p = c.permissoes;
    if (!p.podeResponder) {
      return (
        '<div class="alerta info editor-fechado">' +
        (equipe
          ? 'Chamado fechado. ' +
            (p.podeReabrir
              ? 'Reabra-o pelo status ou pelo menu Opções para adicionar ações.'
              : 'Somente quem tem permissão pode reabri-lo.')
          : 'Este chamado está fechado. Se precisar de ajuda, abra um novo chamado.') +
        '</div>'
      );
    }
    var interna = estado.modo === 'interna';
    var tipos =
      p.podeNotaInterna && !estado.macro
        ? '<div class="tipo-acao" role="tablist" aria-label="Tipo da ação">' +
          '<button type="button" role="tab" data-modo="publica" aria-selected="' +
          !interna +
          '">Pública</button>' +
          '<button type="button" role="tab" data-modo="interna" aria-selected="' +
          interna +
          '">Interna</button></div>'
        : '';
    // "Manter o status atual" ou mudar o status junto com a ação
    var status =
      equipe && !estado.macro
        ? '<select id="status-envio" class="status-envio" aria-label="Status após a ação">' +
          Ui.opcoes(
            (HD.transicoes[c.status] || []).map(function (s) {
              return { valor: s, rotulo: 'Mudar para ' + HD.rotulosStatus[s] };
            }),
            '',
            'Manter o status atual',
          ) +
          '</select>'
        : '';

    return (
      '<form class="editor-acao' +
      (interna ? ' modo-interna' : '') +
      '" id="form-resposta">' +
      '<div class="area-texto"><textarea name="mensagem" rows="5" placeholder="' +
      (interna
        ? 'Ação interna: visível apenas para a equipe...'
        : equipe
          ? 'Escreva a resposta para o cliente...'
          : 'Escreva sua mensagem...') +
      '"></textarea><span class="contador-palavras" id="contador-palavras">Palavras: 0</span></div>' +
      (p.podeAplicarMacros ? linhaMacro() : '') +
      '<div class="barra-editor">' +
      tipos +
      '<span class="dica-editor">Ctrl + Enter para enviar</span>' +
      status +
      '<button class="botao-adicionar" type="submit" id="botao-responder">' +
      (estado.macro ? 'Aplicar macro' : equipe ? 'Adicionar ação' : 'Enviar') +
      '</button></div></form>'
    );
  }

  // pesquisa de satisfação: aparece para o solicitante depois que o chamado é resolvido
  function pesquisa(c) {
    if (!c.permissoes.podeAvaliar) return '';
    return (
      '<form class="pesquisa-satisfacao" id="form-avaliacao">' +
      '<strong>' +
      Ui.esc(c.perguntaPesquisa || 'Como você avalia o atendimento?') +
      '</strong>' +
      '<div class="seletor-estrelas" role="radiogroup" aria-label="Nota de 1 a 5">' +
      [1, 2, 3, 4, 5]
        .map(function (n) {
          return (
            '<button type="button" role="radio" data-nota="' +
            n +
            '" aria-checked="' +
            (estado.nota === n) +
            '" aria-label="' +
            n +
            (n === 1 ? ' estrela' : ' estrelas') +
            '"' +
            (n <= estado.nota ? ' class="acesa"' : '') +
            '>★</button>'
          );
        })
        .join('') +
      '</div>' +
      '<textarea name="comentario" rows="2" placeholder="Quer deixar um comentário? (opcional)"></textarea>' +
      '<div class="rodape-compositor"><span>Sua opinião ajuda a melhorar o atendimento.</span>' +
      '<button class="botao primario" type="submit" id="botao-avaliar">Enviar avaliação</button></div>' +
      '</form>'
    );
  }

  // ---------------------------------------------------------------- lista de ações
  function filtrosVisualizar() {
    var opcoes = equipe
      ? [
          ['publicas', 'Ações públicas'],
          ['internas', 'Ações internas'],
          ['historico', 'Histórico de alterações'],
        ]
      : [
          ['publicas', 'Mensagens'],
          ['historico', 'Histórico de alterações'],
        ];
    return (
      '<div class="visualizar"><span>Visualizar:</span>' +
      opcoes
        .map(function (o) {
          return (
            '<label><input type="checkbox" data-visualizar="' +
            o[0] +
            '"' +
            (estado.visualizar[o[0]] ? ' checked' : '') +
            ' /> ' +
            o[1] +
            '</label>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  // ações em ordem cronológica, numeradas (a abertura do chamado é a ação 1)
  function acoesNumeradas(c) {
    var n = 0;
    var abertura = {
      _id: 'abertura',
      tipo: 'publica',
      autor: { nome: c.solicitante.nome, papel: 'cliente' },
      mensagem: c.descricao,
      createdAt: c.createdAt,
    };
    return [abertura].concat(estado.interacoes).map(function (i) {
      if (i.tipo === 'sistema') return { item: i };
      n += 1;
      return { item: i, numero: n };
    });
  }

  function cartaoAcao(a) {
    var i = a.item;
    if (i.tipo === 'sistema') {
      return (
        '<div class="evento-historico" title="' +
        Ui.data(i.createdAt) +
        '"><span>' +
        Ui.esc(i.mensagem) +
        '</span><span class="suave">' +
        Ui.data(i.createdAt) +
        '</span></div>'
      );
    }
    var autor = i.autor || { nome: 'Removido', papel: '' };
    var interna = i.tipo === 'interna';
    return (
      '<article class="acao' +
      (interna ? ' interna' : '') +
      '">' +
      Ui.avatar(autor).replace('class="avatar"', 'class="avatar grande"') +
      '<div class="cartao-acao"><header><strong>' +
      Ui.esc(autor.nome) +
      '</strong><span class="suave" title="' +
      Ui.relativo(i.createdAt) +
      '">' +
      Ui.data(i.createdAt) +
      '</span><em>' +
      (interna ? 'Ação interna' : 'Ação pública') +
      '</em><span class="numero-acao">' +
      a.numero +
      '</span></header><div class="texto">' +
      Ui.esc(i.mensagem) +
      '</div></div></article>'
    );
  }

  function listaDeAcoes(c) {
    var v = estado.visualizar;
    var visiveis = acoesNumeradas(c)
      .filter(function (a) {
        var t = a.item.tipo;
        if (t === 'sistema') return v.historico;
        if (t === 'interna') return v.internas;
        return v.publicas;
      })
      .reverse(); // mais recente primeiro, como no Movidesk
    return (
      '<div class="lista-de-acoes" id="timeline">' +
      (visiveis.length
        ? visiveis.map(cartaoAcao).join('')
        : '<p class="suave">Nenhuma ação para os filtros escolhidos.</p>') +
      '</div>'
    );
  }

  function principal(c) {
    return (
      '<section class="principal-chamado">' +
      '<h1>' +
      Ui.esc(c.titulo) +
      '</h1>' +
      '<p class="subtitulo-chamado">Ticket aberto via ' +
      (c.origem === 'email' ? 'e-mail ' : 'sistema ') +
      (c.solicitante ? 'pelo cliente <strong>' + Ui.esc(c.solicitante.nome) + '</strong> ' : '') +
      'em ' +
      Ui.data(c.createdAt) +
      '</p>' +
      '<div class="marcadores-chamado">' +
      Ui.prioridade(c.prioridade) +
      (equipe && c.status !== 'resolvido' && c.status !== 'fechado' ? Ui.sla(c) : '') +
      (c.justificativa
        ? '<span class="justificativa-atual">' + Ui.esc(c.justificativa.nome) + '</span>'
        : '') +
      (equipe ? Ui.tags(c.tags) : '') +
      '</div>' +
      editor(c) +
      pesquisa(c) +
      '<div class="cabecalho-acoes">' +
      filtrosVisualizar() +
      '</div>' +
      listaDeAcoes(c) +
      '</section>'
    );
  }

  function renderiza() {
    var c = estado.chamado;
    document.title = '#' + c.numero + ' ' + c.titulo + ' · Help Desk';
    if (equipe) {
      Abas.abre({
        chave: 'chamado:' + c.numero,
        titulo: '#' + c.numero + ' ' + c.titulo,
        href: '/chamados/' + c.numero,
        icone: 'chamado',
      });
    }
    var rascunho = Ui.$('#form-resposta textarea');
    var texto = rascunho ? rascunho.value : '';

    conteudo.innerHTML =
      '<div class="topo-chamado">' +
      caminho(c) +
      '<div class="acoes-topo">' +
      statusDoTopo(c) +
      menuOpcoes(c) +
      '</div></div>' +
      '<div class="layout-chamado">' +
      painelEsquerdo(c) +
      principal(c) +
      '</div>';

    var novo = Ui.$('#form-resposta textarea');
    if (novo && texto) novo.value = texto; // preserva o rascunho em re-render
    contaPalavras();
    ligaEventos();
  }

  function contaPalavras() {
    var area = Ui.$('#form-resposta textarea');
    var contador = Ui.$('#contador-palavras');
    if (!area || !contador) return;
    var total = area.value.trim() ? area.value.trim().split(/\s+/).length : 0;
    contador.textContent = 'Palavras: ' + total;
  }

  // ---------------------------------------------------------------- dados
  async function carregaTudo() {
    conteudo.innerHTML = Ui.carregando('Carregando chamado...');
    try {
      var pedidos = [
        Api.get('/chamados/' + numero),
        Api.get('/chamados/' + numero + '/interacoes'),
      ];
      if (equipe) {
        pedidos.push(Api.get('/usuarios', { papel: 'agente,admin', ativo: 'true' }));
        pedidos.push(Api.get('/categorias'));
        pedidos.push(Api.get('/equipes'));
        pedidos.push(Api.get('/servicos'));
        pedidos.push(Api.get('/tags'));
        pedidos.push(Api.get('/justificativas'));
        pedidos.push(Api.get('/macros'));
      }
      var defs = Promise.all([Api.get('/campos-adicionais'), Api.get('/regras-exibicao')]);
      var r = await Promise.all(pedidos);
      estado.chamado = r[0].chamado;
      estado.interacoes = r[1].interacoes;
      if (equipe && window.Notificacoes) Notificacoes.lidasDoChamado(estado.chamado._id);
      var d = await defs;
      estado.defs = { campos: d[0].campos, regras: d[1].regras };
      if (
        equipe &&
        estado.defs.campos.some(function (c) {
          return c.tipo === 'pessoa';
        })
      ) {
        estado.pessoas = (await Api.get('/usuarios', { ativo: 'true' })).usuarios;
      }
      if (equipe) {
        estado.agentes = r[2].usuarios;
        estado.categorias = r[3].categorias;
        estado.equipes = r[4].equipes;
        estado.servicos = r[5].servicos;
        estado.tags = r[6].tags;
        estado.justificativas = r[7].justificativas;
        estado.macros = r[8].macros;
      }
      renderiza();
    } catch (e) {
      conteudo.innerHTML =
        e.status === 404
          ? Ui.vazio('Chamado não encontrado', 'Ele não existe ou você não tem acesso a ele.')
          : Ui.erro(e.message, 'tentar-novamente');
      var b = Ui.$('#tentar-novamente');
      if (b) b.addEventListener('click', carregaTudo);
    }
  }

  async function recarrega() {
    var r = await Promise.all([
      Api.get('/chamados/' + numero),
      Api.get('/chamados/' + numero + '/interacoes'),
    ]);
    estado.chamado = r[0].chamado;
    estado.interacoes = r[1].interacoes;
    renderiza();
  }

  // perdeu o acesso (ex.: transferido para uma equipe da qual não faz parte)
  function saiDoChamado() {
    conteudo.innerHTML = Ui.vazio(
      'Chamado transferido',
      'Ele saiu da fila das suas equipes. Voltando para a fila...',
    );
    setTimeout(function () {
      window.location.href = '/agente';
    }, 1800);
  }

  async function altera(campos, rotuloSucesso) {
    document.querySelectorAll('.campo-chamado, .painel-chamado button').forEach(function (el) {
      el.disabled = true;
    });
    try {
      await Api.patch('/chamados/' + numero, campos);
    } catch (e) {
      // erro de validação: mostra a mensagem do campo (ex.: "Causa raiz é obrigatório")
      Ui.toast(e.detalhes ? Object.values(e.detalhes)[0] : e.message, 'erro');
      await recarrega().catch(function () {});
      return;
    }
    try {
      await recarrega();
      Ui.toast(rotuloSucesso || 'Chamado atualizado', 'sucesso');
    } catch (e) {
      if (e.status === 404) saiDoChamado();
      else Ui.toast(e.message, 'erro');
    }
  }

  // ---------------------------------------------------------------- encaminhar para outra equipe
  function nomeDaEquipe(id) {
    var e = estado.equipes.filter(function (x) {
      return x._id === id;
    })[0];
    return e ? e.nome : 'outra equipe';
  }

  function responsavelAtende(equipeId) {
    var c = estado.chamado;
    if (!c.responsavel) return true;
    var agente = estado.agentes.filter(function (a) {
      return a._id === c.responsavel._id;
    })[0];
    if (!agente) return false;
    return (
      agente.papel === 'admin' ||
      (agente.equipes || []).some(function (e) {
        return (e._id || e) === equipeId;
      })
    );
  }

  /**
   * Janela de confirmação do encaminhamento. Só libera o botão depois de escolher a equipe
   * e marcar "Confirmo". Resolve { equipe, motivo } ou null (cancelou).
   * @param {{ destino?: string, fixo?: boolean, nomeServico?: string }} cfg
   */
  function dialogoEncaminhar(cfg) {
    var c = estado.chamado;
    var atual = c.equipe && c.equipe._id;
    var outras = estado.equipes.filter(function (e) {
      return e._id !== atual;
    });
    return new Promise(function (resolve) {
      var d = document.createElement('dialog');
      d.className = 'modal modal-encaminhar';
      d.innerHTML =
        '<form method="dialog" novalidate><h2>Encaminhar chamado #' +
        c.numero +
        '</h2>' +
        '<p class="suave texto-encaminhar">Hoje o chamado está na fila <strong>' +
        Ui.esc(c.equipe ? c.equipe.nome : 'sem equipe') +
        '</strong>.' +
        (cfg.nomeServico
          ? ' Ao trocar o serviço para <strong>' +
            Ui.esc(cfg.nomeServico) +
            '</strong>, ele vai para outra equipe.'
          : '') +
        '</p>' +
        '<div class="campo"><label for="encaminhar-equipe">Encaminhar para a equipe</label>' +
        '<select id="encaminhar-equipe"' +
        (cfg.fixo ? ' disabled' : '') +
        '>' +
        Ui.opcoes(
          outras.map(function (e) {
            return { valor: e._id, rotulo: e.nome };
          }),
          cfg.destino || '',
          'Selecione a equipe...',
        ) +
        '</select></div>' +
        '<div id="avisos-encaminhar"></div>' +
        '<div class="campo"><label for="encaminhar-motivo">Motivo do encaminhamento <span class="suave">(opcional)</span></label>' +
        '<textarea id="encaminhar-motivo" rows="3" maxlength="2000" placeholder="Ex.: problema de rede, precisa da equipe de infraestrutura"></textarea>' +
        '<span class="ajuda">Fica registrado como nota interna para a nova equipe.</span></div>' +
        '<label class="check-confirmacao"><input type="checkbox" id="encaminhar-certeza" /> Confirmo que quero encaminhar este chamado</label>' +
        '<div class="acoes-form"><button class="botao" type="button" data-cancelar>Cancelar</button>' +
        '<button class="botao primario" type="submit" id="encaminhar-ok" disabled>Encaminhar</button></div></form>';
      document.body.appendChild(d);

      var select = d.querySelector('#encaminhar-equipe');
      var certeza = d.querySelector('#encaminhar-certeza');
      var botao = d.querySelector('#encaminhar-ok');
      var encerrado = false;

      function atualiza() {
        var destino = select.value;
        var avisos = [];
        if (destino && !souMembro(destino)) {
          avisos.push(
            'Você não faz parte da equipe <strong>' +
              Ui.esc(nomeDaEquipe(destino)) +
              '</strong>: depois de encaminhar, <strong>deixará de ver este chamado</strong>.',
          );
        }
        if (destino && c.responsavel && !responsavelAtende(destino)) {
          avisos.push(
            'O responsável atual (' +
              Ui.esc(c.responsavel.nome) +
              ') não faz parte dessa equipe e será removido do chamado.',
          );
        }
        d.querySelector('#avisos-encaminhar').innerHTML = avisos
          .map(function (a) {
            return '<div class="alerta aviso-encaminhar">' + a + '</div>';
          })
          .join('');
        botao.disabled = !(destino && certeza.checked);
      }

      function encerra(valor) {
        if (encerrado) return;
        encerrado = true;
        if (d.open) d.close();
        d.remove();
        resolve(valor);
      }

      select.addEventListener('change', atualiza);
      certeza.addEventListener('change', atualiza);
      d.querySelector('[data-cancelar]').addEventListener('click', function () {
        encerra(null);
      });
      d.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        if (botao.disabled) return;
        encerra({
          equipe: select.value,
          motivo: d.querySelector('#encaminhar-motivo').value.trim(),
        });
      });
      d.addEventListener('close', function () {
        encerra(null);
      });
      d.showModal();
      atualiza();
      (cfg.destino ? certeza : select).focus();
    });
  }

  /** Encaminha (equipe ou serviço de outra equipe) depois da confirmação. */
  async function encaminha(cfg) {
    var r = await dialogoEncaminhar(cfg);
    if (!r) return;
    var corpo = cfg.servico ? { servico: cfg.servico } : { equipe: r.equipe };
    if (r.motivo) corpo.motivoEncaminhamento = r.motivo;
    altera(corpo, 'Chamado encaminhado para ' + nomeDaEquipe(r.equipe));
  }

  // pergunta a justificativa quando o status exige; null = cancelou
  async function perguntaJustificativa(status) {
    var motivos = justificativasPara(status);
    if (!motivos.length) return undefined;
    return Ui.escolhe({
      titulo: 'Mover para ' + HD.rotulosStatus[status],
      rotulo: 'Justificativa',
      opcoes: motivos.map(function (j) {
        return { valor: j._id, rotulo: j.nome };
      }),
      confirmar: 'Mover',
    });
  }

  async function assume() {
    try {
      await Api.post('/chamados/' + numero + '/assumir');
      await recarrega();
      Ui.toast('Você assumiu o chamado', 'sucesso');
    } catch (e) {
      Ui.toast(e.message, 'erro');
    }
  }

  // ---------------------------------------------------------------- eventos
  function ligaEventos() {
    // abas do painel
    document.querySelectorAll('[data-painel]').forEach(function (b) {
      b.addEventListener('click', function () {
        estado.painel = b.getAttribute('data-painel');
        renderiza();
      });
    });

    // campo adicional: salva ao sair do campo / escolher na lista
    document.querySelectorAll('.painel-chamado [data-campo-adicional]').forEach(function (el) {
      el.addEventListener('change', function () {
        var campos = {};
        campos[el.getAttribute('data-campo-adicional')] = el.value;
        altera({ camposAdicionais: campos }, 'Campo atualizado');
      });
    });

    // status (topo), serviço, categoria, urgência, responsável, equipe e justificativa
    document.querySelectorAll('select.campo-chamado').forEach(function (s) {
      s.addEventListener('change', async function () {
        var corpo = {};
        corpo[s.name] = s.value || null;

        if (s.name === 'status' && Ui.exigeResposta(estado.chamado.status, s.value)) {
          // resolver/fechar só respondendo o cliente
          var para = s.value;
          s.value = estado.chamado.status;
          var respondido = await Ui.pedeResposta({
            titulo: (para === 'resolvido' ? 'Resolver' : 'Fechar') + ' o chamado #' + numero,
            texto:
              'Para ' + (para === 'resolvido' ? 'resolver' : 'fechar') + ', responda o cliente.',
            confirmar: para === 'resolvido' ? 'Responder e resolver' : 'Responder e fechar',
            justificativas: justificativasPara(para).map(function (j) {
              return { valor: j._id, rotulo: j.nome };
            }),
          });
          if (!respondido) return;
          corpo.status = para;
          corpo.resposta = respondido.resposta;
          if (respondido.justificativa) corpo.justificativa = respondido.justificativa;
          altera(corpo, para === 'resolvido' ? 'Chamado resolvido' : 'Chamado fechado');
          return;
        }
        if (s.name === 'status') {
          var escolhida = await perguntaJustificativa(s.value);
          if (escolhida === null) {
            s.value = estado.chamado.status;
            return;
          }
          if (escolhida) corpo.justificativa = escolhida;
        }

        // mudar de equipe (direto ou por um serviço de outra equipe) é um encaminhamento:
        // só acontece depois da confirmação na janela de encaminhar
        var destino = s.name === 'equipe' ? s.value : null;
        if (s.name === 'servico') {
          var sv = estado.servicos.filter(function (x) {
            return x._id === s.value;
          })[0];
          destino = sv && sv.equipe && sv.equipe._id;
        }
        var atual = estado.chamado.equipe && estado.chamado.equipe._id;
        if (destino && destino !== atual) {
          var escolhido = s.value;
          var nomeServico = s.options[s.selectedIndex].text;
          // volta o campo até confirmar
          s.value =
            s.name === 'equipe' ? atual : estado.chamado.servico && estado.chamado.servico._id;
          encaminha(
            s.name === 'servico'
              ? { destino: destino, fixo: true, servico: escolhido, nomeServico: nomeServico }
              : { destino: destino },
          );
          return;
        }
        var rotulos = { equipe: 'Chamado transferido', status: 'Status atualizado' };
        altera(corpo, rotulos[s.name]);
      });
    });

    document.querySelectorAll('.seletor-tags input[name="tag"]').forEach(function (caixa) {
      caixa.addEventListener('change', function () {
        var marcadas = Array.prototype.map.call(
          document.querySelectorAll('.seletor-tags input[name="tag"]:checked'),
          function (i) {
            return i.value;
          },
        );
        altera({ tags: marcadas }, 'Tags atualizadas').then(function () {
          var aberto = Ui.$('.seletor-tags');
          if (aberto) aberto.open = true; // segue aberto para marcar outras
        });
      });
    });

    // menu OPÇÕES e o link "Atribuir para mim"
    var botaoOpcoes = Ui.$('#opcoes-chamado');
    var menu = Ui.$('#menu-chamado');
    botaoOpcoes.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      botaoOpcoes.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.querySelectorAll('[data-opcao]').forEach(function (b) {
      b.addEventListener('click', function () {
        menu.hidden = true;
        var opcao = b.getAttribute('data-opcao');
        if (opcao === 'assumir') assume();
        if (opcao === 'encaminhar') encaminha({});
        if (opcao === 'reabrir') altera({ status: 'em_atendimento' }, 'Chamado reaberto');
        if (opcao === 'voltar') window.location.href = equipe ? '/agente' : '/portal';
        if (opcao === 'copiar') {
          var link = window.location.origin + '/chamados/' + numero;
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
            .then(function () {
              Ui.toast('Link copiado', 'sucesso');
            })
            .catch(function () {
              window.prompt('Copie o link do chamado:', link);
            });
        }
      });
    });

    // filtros "Visualizar"
    document.querySelectorAll('[data-visualizar]').forEach(function (caixa) {
      caixa.addEventListener('change', function () {
        estado.visualizar[caixa.getAttribute('data-visualizar')] = caixa.checked;
        gravaVisualizar();
        Ui.$('#timeline').outerHTML = listaDeAcoes(estado.chamado);
      });
    });

    var seletorMacro = Ui.$('#seletor-macro');
    if (seletorMacro) {
      seletorMacro.addEventListener('change', function () {
        var escolhida = estado.macros.filter(function (m) {
          return m._id === seletorMacro.value;
        })[0];
        var textoAtual = Ui.$('#form-resposta textarea').value.trim();
        if (
          escolhida &&
          textoAtual &&
          escolhida.mensagem &&
          !window.confirm('Substituir o texto que você já escreveu pela mensagem da macro?')
        ) {
          seletorMacro.value = estado.macro ? estado.macro._id : '';
          return;
        }
        estado.macro = escolhida || null;
        if (estado.macro) estado.modo = estado.macro.tipo;
        renderiza();
        var area = Ui.$('#form-resposta textarea');
        if (estado.macro && estado.macro.mensagem) area.value = estado.macro.mensagem;
        contaPalavras();
        area.focus();
      });
      var cancela = Ui.$('#cancela-macro');
      if (cancela) {
        cancela.addEventListener('click', function () {
          estado.macro = null;
          renderiza();
        });
      }
    }

    var formAvaliacao = Ui.$('#form-avaliacao');
    if (formAvaliacao) {
      formAvaliacao.querySelectorAll('[data-nota]').forEach(function (b) {
        b.addEventListener('click', function () {
          estado.nota = Number(b.getAttribute('data-nota'));
          formAvaliacao.querySelectorAll('[data-nota]').forEach(function (x) {
            var n = Number(x.getAttribute('data-nota'));
            x.classList.toggle('acesa', n <= estado.nota);
            x.setAttribute('aria-checked', String(n === estado.nota));
          });
        });
      });
      formAvaliacao.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!estado.nota) {
          Ui.toast('Escolha de 1 a 5 estrelas', 'erro');
          return;
        }
        var restaura = Ui.ocupado(Ui.$('#botao-avaliar'), 'Enviando...');
        try {
          await Api.post('/chamados/' + numero + '/avaliacao', {
            nota: estado.nota,
            comentario: formAvaliacao.comentario.value,
          });
          await recarrega();
          Ui.toast('Obrigado pela avaliação!', 'sucesso');
        } catch (erro) {
          restaura();
          Ui.toast(erro.message, 'erro');
        }
      });
    }

    document.querySelectorAll('[data-modo]').forEach(function (aba) {
      aba.addEventListener('click', function () {
        estado.modo = aba.getAttribute('data-modo');
        renderiza();
        Ui.$('#form-resposta textarea').focus();
      });
    });

    var form = Ui.$('#form-resposta');
    if (!form) return;
    form.mensagem.addEventListener('input', contaPalavras);
    form.mensagem.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
    });
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var texto = form.mensagem.value.trim();
      var macro = estado.macro;
      var novoStatus = Ui.$('#status-envio') ? Ui.$('#status-envio').value : '';
      // macro sem texto é válida: só executa as ações dela
      if (!texto && !macro) {
        form.mensagem.focus();
        return;
      }

      // resolver/fechar junto com a ação: a própria resposta (pública) é a resposta ao cliente
      var resolveCom = novoStatus && Ui.exigeResposta(estado.chamado.status, novoStatus);
      if (resolveCom && estado.modo === 'interna') {
        Ui.toast(
          'Para ' +
            HD.rotulosStatus[novoStatus].toLowerCase() +
            ', envie uma ação pública (resposta ao cliente).',
          'erro',
        );
        return;
      }

      // status junto com a ação: a justificativa é perguntada antes de enviar
      var corpoStatus = null;
      if (novoStatus) {
        var justificativa = await perguntaJustificativa(novoStatus);
        if (justificativa === null) return;
        corpoStatus = { status: novoStatus };
        if (justificativa) corpoStatus.justificativa = justificativa;
      }

      var restaura = Ui.ocupado(Ui.$('#botao-responder'), 'Enviando...');
      try {
        if (macro) {
          await Api.post('/chamados/' + numero + '/macros/' + macro._id, { mensagem: texto });
        } else if (resolveCom) {
          // uma chamada só: muda o status e publica a resposta
          await Api.patch('/chamados/' + numero, Object.assign({ resposta: texto }, corpoStatus));
          corpoStatus = null;
        } else {
          await Api.post('/chamados/' + numero + '/interacoes', {
            mensagem: texto,
            tipo: estado.modo,
          });
        }
        form.mensagem.value = '';
        if (corpoStatus) {
          // a resposta pode já ter mudado o status (ex.: Novo -> Em Atendimento)
          var atual = (await Api.get('/chamados/' + numero)).chamado;
          if (atual.status !== corpoStatus.status)
            await Api.patch('/chamados/' + numero, corpoStatus);
        }
        estado.macro = null;
        await recarrega();
        Ui.toast(
          macro
            ? 'Macro "' + macro.nome + '" aplicada'
            : estado.modo === 'interna'
              ? 'Ação interna adicionada'
              : equipe
                ? 'Ação adicionada'
                : 'Mensagem enviada',
          'sucesso',
        );
      } catch (erro) {
        restaura();
        if (erro.status === 404) return saiDoChamado();
        Ui.toast(erro.detalhes ? Object.values(erro.detalhes)[0] : erro.message, 'erro');
        await recarrega().catch(function () {});
      }
    });
  }

  // fecha o menu OPÇÕES ao clicar fora
  document.addEventListener('click', function (e) {
    var menu = Ui.$('#menu-chamado');
    if (menu && !menu.hidden && !e.target.closest('.menu-opcoes')) menu.hidden = true;
  });

  if (new URLSearchParams(window.location.search).get('criado')) {
    Ui.toast('Chamado #' + numero + ' aberto com sucesso', 'sucesso');
    window.history.replaceState(null, '', window.location.pathname);
  }

  carregaTudo();
})();
