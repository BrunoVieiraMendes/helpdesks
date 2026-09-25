// Indicadores e relatórios: filtros numa linha, abas por assunto, indicadores (stat tiles),
// gráficos com tabela equivalente e o relatório de chamados com exportação CSV.
(function () {
  var usuario = Api.exigeLogin('equipe');
  if (!usuario) return;
  Ui.navbar(usuario);

  var conteudo = Ui.$('#conteudo');
  var numero = new Intl.NumberFormat('pt-BR');
  var decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  var DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  // paleta categórica validada (azul, laranja) e cores de status (bom / crítico)
  var COR = { abertos: '#2a78d6', resolvidos: '#eb6834', bom: '#0ca30c', critico: '#d03b3b' };

  var ABAS = [
    ['geral', 'Visão geral'],
    ['sla', 'SLA'],
    ['equipes', 'Equipes e agentes'],
    ['satisfacao', 'Satisfação'],
    ['chamados', 'Relatório de chamados'],
  ].filter(function (a) {
    // desempenho de equipes/agentes e satisfação: só o admin vê
    return usuario.papel === 'admin' || (a[0] !== 'equipes' && a[0] !== 'satisfacao');
  });
  var PERIODOS = [
    ['hoje', 'Hoje'],
    ['7', 'Últimos 7 dias'],
    ['30', 'Últimos 30 dias'],
    ['90', 'Últimos 90 dias'],
    ['mes', 'Este mês'],
    ['mesPassado', 'Mês passado'],
    ['personalizado', 'Personalizado'],
  ];
  var FILTROS = ['equipe', 'servico', 'responsavel', 'prioridade'];

  // ---------------------------------------------------------------- estado (espelhado na URL)
  var params = new URLSearchParams(window.location.search);
  var estado = {
    aba: ABAS.some(function (a) {
      return a[0] === window.location.hash.slice(1);
    })
      ? window.location.hash.slice(1)
      : 'geral',
    periodo: params.get('periodo') || '30',
    de: params.get('de') || '',
    ate: params.get('ate') || '',
    filtros: {},
    dados: null,
    modos: {}, // cartão -> 'tabela' quando o usuário pede a tabela
    relatorio: { base: 'abertos', status: '', pagina: 1 },
    ordemAgentes: { campo: 'resolvidos', crescente: false },
  };
  FILTROS.forEach(function (f) {
    if (params.get(f)) estado.filtros[f] = params.get(f);
  });

  function iso(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  // datas do período escolhido (no fuso do navegador)
  function intervalo() {
    var hoje = new Date();
    var d = new Date(hoje);
    switch (estado.periodo) {
      case 'hoje':
        return { de: iso(hoje), ate: iso(hoje) };
      case 'mes':
        return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) };
      case 'mesPassado':
        return {
          de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
          ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
        };
      case 'personalizado':
        return { de: estado.de || iso(hoje), ate: estado.ate || iso(hoje) };
      default:
        d.setDate(d.getDate() - (Number(estado.periodo) - 1));
        return { de: iso(d), ate: iso(hoje) };
    }
  }

  function consulta() {
    return Object.assign({}, intervalo(), estado.filtros);
  }

  function atualizaUrl() {
    var p = new URLSearchParams();
    p.set('periodo', estado.periodo);
    if (estado.periodo === 'personalizado') {
      p.set('de', estado.de);
      p.set('ate', estado.ate);
    }
    Object.keys(estado.filtros).forEach(function (f) {
      if (estado.filtros[f]) p.set(f, estado.filtros[f]);
    });
    window.history.replaceState(
      null,
      '',
      window.location.pathname + '?' + p.toString() + '#' + estado.aba,
    );
  }

  // ---------------------------------------------------------------- formatos
  function dataBr(dataIso) {
    return dataIso.split('-').reverse().join('/');
  }
  function dataCurta(dataIso) {
    var p = dataIso.split('-');
    return p[2] + '/' + p[1];
  }
  function horas(h) {
    if (h === null || h === undefined) return '—';
    if (h < 1) return Math.round(h * 60) + ' min';
    if (h >= 48) return decimal.format(h / 24) + ' dias';
    return decimal.format(h) + ' h';
  }
  function pct(v) {
    return v === null || v === undefined ? '—' : decimal.format(v) + '%';
  }

  // variação contra o período anterior; "bomSeSobe" decide se a cor é de ganho
  function delta(atual, anterior, bomSeSobe) {
    if (!anterior) return '<span class="delta neutro">sem base no período anterior</span>';
    var variacao = ((atual - anterior) / anterior) * 100;
    var seta = variacao > 0 ? '▲' : variacao < 0 ? '▼' : '■';
    var classe =
      variacao === 0 || bomSeSobe === null ? 'neutro' : variacao > 0 === bomSeSobe ? 'bom' : 'ruim';
    return (
      '<span class="delta ' +
      classe +
      '"><span aria-hidden="true">' +
      seta +
      '</span> ' +
      (variacao > 0 ? '+' : '') +
      decimal.format(variacao) +
      '% vs período anterior</span>'
    );
  }

  function tile(rotulo, valor, extra, href) {
    return (
      '<' +
      (href ? 'a href="' + href + '"' : 'div') +
      ' class="tile-indicador"><span class="rotulo-tile">' +
      rotulo +
      '</span><strong class="valor-tile">' +
      valor +
      '</strong>' +
      (extra || '') +
      '</' +
      (href ? 'a' : 'div') +
      '>'
    );
  }

  // ---------------------------------------------------------------- cartões com gráfico/tabela
  var desenhos = {};
  var BOTAO_CSV =
    '<button type="button" class="alterna-tabela" data-csv-cartao title="Baixar os dados deste quadro em CSV">CSV</button>';

  function cartao(id, titulo, subtitulo, classe) {
    var tabela = estado.modos[id] === 'tabela';
    return (
      '<section class="cartao cartao-grafico ' +
      (classe || '') +
      '"><header><div><h2>' +
      titulo +
      '</h2>' +
      (subtitulo ? '<p>' + subtitulo + '</p>' : '') +
      '</div><div class="acoes-cartao">' +
      BOTAO_CSV +
      '<button type="button" class="alterna-tabela" data-alterna="' +
      id +
      '" aria-pressed="' +
      tabela +
      '">' +
      (tabela ? 'Ver gráfico' : 'Ver tabela') +
      '</button></div></header><div class="corpo-grafico" id="g-' +
      id +
      '"></div></section>'
    );
  }

  function registra(id, grafico, tabela) {
    desenhos[id] = { grafico: grafico, tabela: tabela };
  }

  function desenhaCartoes() {
    Object.keys(desenhos).forEach(function (id) {
      var el = document.getElementById('g-' + id);
      if (!el) return;
      if (estado.modos[id] === 'tabela') desenhos[id].tabela(el);
      else desenhos[id].grafico(el);
    });
  }

  // barras de distribuição (serviço, equipe, categoria...) + a tabela equivalente
  function distribuicao(id, itens, rotulo, linkDe) {
    registra(
      id,
      function (el) {
        Graficos.barras(el, {
          itens: itens.map(function (i) {
            return {
              nome: i.nome,
              total: i.total,
              href: linkDe && i.id && i.id !== 'outros' ? linkDe(i) : null,
              detalhe: 'chamados abertos',
            };
          }),
          cor: COR.abertos,
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          [rotulo, 'Chamados'],
          itens.map(function (i) {
            return [i.nome, i.total];
          }),
        );
      },
    );
  }

  // ---------------------------------------------------------------- abas
  // períodos longos ficam ruidosos por dia: acima de 62 dias, soma por semana (7 dias a partir do início)
  function agrupaSerie(serieDiaria) {
    if (serieDiaria.length <= 62) {
      return {
        porSemana: false,
        pontos: serieDiaria.map(function (s) {
          var dia = new Date(s.data + 'T12:00:00');
          return {
            eixo: dataCurta(s.data),
            dica: DIAS_SEMANA[dia.getDay()] + ', ' + dataBr(s.data),
            tabela: dataBr(s.data),
            abertos: s.abertos,
            resolvidos: s.resolvidos,
          };
        }),
      };
    }
    var pontos = [];
    for (var i = 0; i < serieDiaria.length; i += 7) {
      var semana = serieDiaria.slice(i, i + 7);
      var fim = semana[semana.length - 1].data;
      pontos.push({
        eixo: dataCurta(semana[0].data),
        dica: 'Semana de ' + dataBr(semana[0].data) + ' a ' + dataBr(fim),
        tabela: dataBr(semana[0].data) + ' a ' + dataBr(fim),
        abertos: semana.reduce(function (a, s) {
          return a + s.abertos;
        }, 0),
        resolvidos: semana.reduce(function (a, s) {
          return a + s.resolvidos;
        }, 0),
      });
    }
    return { porSemana: true, pontos: pontos };
  }

  function abaGeral(d) {
    var r = d.resumo;
    var agrupada = agrupaSerie(d.serie);
    var serie = agrupada.pontos;
    registra(
      'volume',
      function (el) {
        Graficos.linhas(el, {
          rotulos: serie.map(function (s) {
            return s.eixo;
          }),
          rotuloEixo: function (i) {
            return serie[i].eixo;
          },
          rotuloDica: function (i) {
            return serie[i].dica;
          },
          series: [
            {
              nome: 'Abertos',
              cor: COR.abertos,
              valores: serie.map(function (s) {
                return s.abertos;
              }),
            },
            {
              nome: 'Resolvidos',
              cor: COR.resolvidos,
              valores: serie.map(function (s) {
                return s.resolvidos;
              }),
            },
          ],
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          [agrupada.porSemana ? 'Semana' : 'Dia', 'Abertos', 'Resolvidos'],
          serie.map(function (s) {
            return [s.tabela, s.abertos, s.resolvidos];
          }),
        );
      },
    );
    registra(
      'backlog',
      function (el) {
        Graficos.barras(el, {
          itens: d.backlog.map(function (b) {
            return {
              nome: b.nome,
              total: b.total,
              href: '/agente?status=' + b.status,
              detalhe: 'chamados agora',
            };
          }),
          cor: COR.abertos,
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          ['Status', 'Chamados'],
          d.backlog.map(function (b) {
            return [b.nome, b.total];
          }),
        );
      },
    );
    distribuicao('servico', d.porServico, 'Serviço', function (i) {
      return '/agente?servico=' + i.id;
    });
    distribuicao('equipe', d.porEquipe, 'Equipe', function (i) {
      return '/agente?equipe=' + i.id;
    });
    distribuicao('categoria', d.porCategoria, 'Categoria');
    distribuicao('urgencia', d.porPrioridade, 'Urgência', function (i) {
      return '/agente?prioridade=' + i.id;
    });

    // dia da semana x hora; linhas de segunda a domingo
    var ordemDias = [2, 3, 4, 5, 6, 7, 1];
    var horasDia = Array.from({ length: 24 }, function (_v, h) {
      return h + 'h';
    });
    var valorCalor = function (li, ci) {
      var achado = d.mapaDeCalor.filter(function (m) {
        return m.dia === ordemDias[li] && m.hora === ci;
      })[0];
      return achado ? achado.total : 0;
    };
    registra(
      'calor',
      function (el) {
        Graficos.calor(el, {
          linhas: ordemDias.map(function (x) {
            return DIAS_SEMANA[x - 1];
          }),
          colunas: horasDia,
          valor: valorCalor,
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          ['Dia'].concat(horasDia),
          ordemDias.map(function (x, li) {
            return [DIAS_SEMANA[x - 1]].concat(
              horasDia.map(function (_h, ci) {
                return valorCalor(li, ci);
              }),
            );
          }),
        );
      },
    );

    return (
      '<div class="tiles">' +
      tile('Chamados abertos', numero.format(r.abertos), delta(r.abertos, r.abertosAntes, null)) +
      tile(
        'Chamados resolvidos',
        numero.format(r.resolvidos),
        delta(r.resolvidos, r.resolvidosAntes, true),
      ) +
      tile(
        'Em aberto agora',
        numero.format(r.emAberto),
        r.vencidosAgora
          ? '<span class="delta ruim"><span aria-hidden="true">⚑</span> ' +
              r.vencidosAgora +
              ' com SLA vencido</span>'
          : '<span class="delta bom"><span aria-hidden="true">✓</span> nenhum com SLA vencido</span>',
        '/agente?status=novo,em_atendimento,pendente',
      ) +
      tile(
        'Tempo médio da 1ª resposta',
        horas(r.horasPrimeiraResposta),
        '<span class="delta neutro">tempo corrido</span>',
      ) +
      tile(
        'Tempo médio de solução',
        horas(r.horasSolucao),
        '<span class="delta neutro">da abertura à solução</span>',
      ) +
      tile(
        'SLA de solução cumprido',
        pct(r.slaSolucao),
        '<span class="delta neutro">dos resolvidos com prazo</span>',
      ) +
      tile(
        'Satisfação',
        r.notaMedia === null ? '—' : decimal.format(r.notaMedia) + ' <small>/ 5</small>',
        r.notaMedia === null
          ? '<span class="delta neutro">sem avaliações</span>'
          : Ui.estrelas(Math.round(r.notaMedia)),
      ) +
      '</div>' +
      '<div class="grade-graficos">' +
      cartao(
        'volume',
        agrupada.porSemana ? 'Abertos e resolvidos por semana' : 'Abertos e resolvidos por dia',
        agrupada.porSemana
          ? 'Períodos longos são somados por semana, a partir do primeiro dia'
          : 'Chamados abertos e resolvidos em cada dia do período',
        'largura-total',
      ) +
      cartao('backlog', 'Em aberto por status', 'Situação atual da fila (independe do período)') +
      cartao('urgencia', 'Abertos por urgência') +
      cartao('servico', 'Abertos por serviço') +
      cartao('equipe', 'Abertos por equipe') +
      cartao('categoria', 'Abertos por categoria') +
      cartao('calor', 'Quando os chamados chegam', 'Chamados abertos por dia da semana e hora') +
      '</div>'
    );
  }

  function abaSla(d) {
    var s = d.sla;
    registra(
      'sla-semanas',
      function (el) {
        Graficos.colunasEmpilhadas(el, {
          rotulos: s.semanas.map(function (x) {
            return 'Sem. ' + dataCurta(x.semana);
          }),
          series: [
            {
              nome: 'No prazo',
              cor: COR.bom,
              valores: s.semanas.map(function (x) {
                return x.noPrazo;
              }),
            },
            {
              nome: 'Fora do prazo',
              cor: COR.critico,
              valores: s.semanas.map(function (x) {
                return x.fora;
              }),
            },
          ],
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          ['Semana (início)', 'No prazo', 'Fora do prazo', '% no prazo'],
          s.semanas.map(function (x) {
            var total = x.noPrazo + x.fora;
            return [
              dataBr(x.semana),
              x.noPrazo,
              x.fora,
              total ? pct(Math.round((x.noPrazo / total) * 1000) / 10) : '—',
            ];
          }),
        );
      },
    );

    var linhasPrioridade = s.porPrioridade
      .map(function (p) {
        var nivel =
          p.percentual === null
            ? 'vazio'
            : p.percentual >= 90
              ? 'bom'
              : p.percentual >= 70
                ? 'alerta'
                : 'ruim';
        return (
          '<tr><td>' +
          Ui.prioridade(p.id) +
          '</td><td class="numero-tabela">' +
          horas(p.meta) +
          '</td><td class="numero-tabela">' +
          numero.format(p.total) +
          '</td><td class="numero-tabela">' +
          horas(p.horasSolucao) +
          '</td><td><div class="medidor"><span class="trilho-medidor"><span class="preenchimento-medidor ' +
          nivel +
          '" style="width:' +
          (p.percentual || 0) +
          '%"></span></span><strong>' +
          pct(p.percentual) +
          '</strong></div></td></tr>'
        );
      })
      .join('');

    return (
      '<div class="tiles">' +
      tile(
        'SLA de solução cumprido',
        pct(s.solucao.percentual),
        '<span class="delta neutro">' +
          numero.format(s.solucao.noPrazo) +
          ' de ' +
          numero.format(s.solucao.total) +
          ' resolvidos com prazo</span>',
      ) +
      tile(
        '1ª resposta no prazo',
        pct(s.primeiraResposta.percentual),
        '<span class="delta neutro">' +
          numero.format(s.primeiraResposta.atrasadas) +
          ' respondidos com atraso</span>',
      ) +
      tile(
        'SLA vencido agora',
        numero.format(s.vencidosAgora),
        s.vencidosAgora
          ? '<span class="delta ruim"><span aria-hidden="true">⚑</span> precisam de atenção</span>'
          : '<span class="delta bom"><span aria-hidden="true">✓</span> tudo em dia</span>',
        '/agente?sla=vencido',
      ) +
      '</div>' +
      '<div class="grade-graficos">' +
      cartao(
        'sla-semanas',
        'Solução no prazo por semana',
        'Chamados resolvidos em cada semana, dentro e fora do prazo',
        'largura-total',
      ) +
      '<section class="cartao cartao-grafico largura-total"><header><div><h2>SLA por urgência</h2><p>Meta de solução configurada em Configurações &gt; SLA (horas úteis)</p></div>' +
      BOTAO_CSV +
      '</header>' +
      '<div class="tabela-container"><table class="tabela-indicadores"><thead><tr><th>Urgência</th><th class="numero-tabela">Meta</th><th class="numero-tabela">Resolvidos</th><th class="numero-tabela">Tempo médio</th><th>No prazo</th></tr></thead><tbody>' +
      linhasPrioridade +
      '</tbody></table></div></section>' +
      '</div>'
    );
  }

  function abaEquipes(d) {
    var maxResolvidos = Math.max.apply(
      null,
      d.agentes
        .map(function (a) {
          return a.resolvidos;
        })
        .concat(1),
    );
    var o = estado.ordemAgentes;
    var agentes = d.agentes.slice().sort(function (x, y) {
      var a = x[o.campo];
      var b = y[o.campo];
      if (a === null) return 1;
      if (b === null) return -1;
      var r = typeof a === 'string' ? a.localeCompare(b, 'pt-BR') : a - b;
      return o.crescente ? r : -r;
    });
    function cab(campo, rotulo, numerico) {
      var ativo = o.campo === campo;
      return (
        '<th' +
        (numerico ? ' class="numero-tabela"' : '') +
        (ativo ? ' aria-sort="' + (o.crescente ? 'ascending' : 'descending') + '"' : '') +
        '><button type="button" class="ordena" data-ordena-agente="' +
        campo +
        '">' +
        (ativo ? '<span class="seta">' + (o.crescente ? '↑' : '↓') + '</span>' : '') +
        rotulo +
        '</button></th>'
      );
    }
    function medidorSla(v) {
      var nivel = v === null ? 'vazio' : v >= 90 ? 'bom' : v >= 70 ? 'alerta' : 'ruim';
      return (
        '<div class="medidor"><span class="trilho-medidor"><span class="preenchimento-medidor ' +
        nivel +
        '" style="width:' +
        (v || 0) +
        '%"></span></span><strong>' +
        pct(v) +
        '</strong></div>'
      );
    }

    return (
      '<div class="grade-graficos">' +
      '<section class="cartao cartao-grafico largura-total"><header><div><h2>Desempenho por equipe</h2><p>Abertos e resolvidos no período; "em aberto" é a situação atual</p></div>' +
      BOTAO_CSV +
      '</header>' +
      '<div class="tabela-container"><table class="tabela-indicadores"><thead><tr><th>Equipe</th><th class="numero-tabela">Abertos</th><th class="numero-tabela">Resolvidos</th><th class="numero-tabela">Em aberto</th><th class="numero-tabela">Tempo médio de solução</th><th>SLA cumprido</th></tr></thead><tbody>' +
      (d.equipes.length
        ? d.equipes
            .map(function (q) {
              return (
                '<tr><td>' +
                (q.id
                  ? '<a href="/agente?equipe=' + q.id + '">' + Ui.esc(q.nome) + '</a>'
                  : Ui.esc(q.nome)) +
                '</td><td class="numero-tabela">' +
                numero.format(q.abertos) +
                '</td><td class="numero-tabela">' +
                numero.format(q.resolvidos) +
                '</td><td class="numero-tabela">' +
                numero.format(q.emAberto) +
                '</td><td class="numero-tabela">' +
                horas(q.horasSolucao) +
                '</td><td>' +
                medidorSla(q.sla) +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="6" class="sem-dados">Sem dados no período.</td></tr>') +
      '</tbody></table></div></section>' +
      '<section class="cartao cartao-grafico largura-total"><header><div><h2>Ranking de agentes</h2><p>Clique nos títulos para ordenar</p></div>' +
      BOTAO_CSV +
      '</header>' +
      '<div class="tabela-container"><table class="tabela-indicadores"><thead><tr>' +
      cab('nome', 'Agente') +
      cab('resolvidos', 'Resolvidos') +
      cab('emAberto', 'Em aberto', true) +
      cab('horasSolucao', 'Tempo médio', true) +
      cab('sla', 'SLA cumprido') +
      cab('nota', 'Satisfação', true) +
      '</tr></thead><tbody>' +
      (agentes.length
        ? agentes
            .map(function (a) {
              return (
                '<tr><td><span class="servico-cel">' +
                Ui.avatar(a) +
                '<a href="/agente?responsavel=' +
                a.id +
                '">' +
                Ui.esc(a.nome) +
                '</a></span></td><td><div class="barra-inline"><span class="trilho-barra"><span class="barra" style="width:' +
                (a.resolvidos / maxResolvidos) * 100 +
                '%;background:' +
                COR.abertos +
                '"></span></span><strong>' +
                numero.format(a.resolvidos) +
                '</strong></div></td><td class="numero-tabela">' +
                numero.format(a.emAberto) +
                '</td><td class="numero-tabela">' +
                horas(a.horasSolucao) +
                '</td><td>' +
                medidorSla(a.sla) +
                '</td><td class="numero-tabela">' +
                (a.nota === null
                  ? '—'
                  : decimal.format(a.nota) + ' <span class="suave">(' + a.avaliacoes + ')</span>') +
                '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="6" class="sem-dados">Nenhum chamado com responsável no período.</td></tr>') +
      '</tbody></table></div></section>' +
      '</div>'
    );
  }

  function abaSatisfacao(d) {
    var s = d.satisfacao;
    var notas = [5, 4, 3, 2, 1].map(function (n) {
      return { id: n, nome: n + (n === 1 ? ' estrela' : ' estrelas'), total: s.notas[n] };
    });
    registra(
      'notas',
      function (el) {
        Graficos.barras(el, {
          itens: notas.map(function (n) {
            return { nome: n.nome, total: n.total, detalhe: 'avaliações' };
          }),
          cor: COR.abertos,
        });
      },
      function (el) {
        Graficos.tabela(
          el,
          ['Nota', 'Avaliações'],
          notas.map(function (n) {
            return [n.nome, n.total];
          }),
        );
      },
    );

    var comentarios = s.comentarios.length
      ? '<ul class="comentarios">' +
        s.comentarios
          .map(function (c) {
            return (
              '<li>' +
              Ui.estrelas(c.nota) +
              '<blockquote>' +
              Ui.esc(c.comentario) +
              '</blockquote><span class="suave">' +
              Ui.esc(c.solicitante) +
              ' · <a href="/chamados/' +
              c.numero +
              '">#' +
              c.numero +
              ' ' +
              Ui.esc(c.titulo) +
              '</a>' +
              (c.responsavel ? ' · atendido por ' + Ui.esc(c.responsavel) : '') +
              ' · ' +
              Ui.data(c.em) +
              '</span></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="sem-dados">Nenhum comentário no período.</p>';

    return (
      '<div class="tiles">' +
      tile(
        'Nota média',
        s.media === null ? '—' : decimal.format(s.media) + ' <small>/ 5</small>',
        s.media === null ? '' : Ui.estrelas(Math.round(s.media)),
      ) +
      tile(
        'Clientes satisfeitos (CSAT)',
        pct(s.csat),
        '<span class="delta neutro">notas 4 e 5</span>',
      ) +
      tile('Avaliações recebidas', numero.format(s.total), '') +
      tile(
        'Taxa de resposta',
        pct(s.taxaResposta),
        '<span class="delta neutro">avaliações ÷ chamados resolvidos</span>',
      ) +
      '</div>' +
      '<div class="grade-graficos">' +
      cartao('notas', 'Distribuição das notas', 'Avaliações recebidas no período') +
      '<section class="cartao cartao-grafico"><header><div><h2>Comentários recentes</h2></div></header><div class="corpo-grafico">' +
      comentarios +
      '</div></section>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------- relatório de chamados
  function abaChamados() {
    var r = estado.relatorio;
    return (
      '<section class="cartao cartao-grafico largura-total">' +
      '<header><div><h2>Relatório de chamados</h2><p>Lista do período com os filtros acima. Exporte para abrir no Excel.</p></div>' +
      '<div class="acoes-relatorio">' +
      '<select id="base-relatorio" aria-label="Considerar a data de">' +
      Ui.opcoes(
        [
          { valor: 'abertos', rotulo: 'Abertos no período' },
          { valor: 'resolvidos', rotulo: 'Resolvidos no período' },
        ],
        r.base,
      ) +
      '</select><select id="status-relatorio" aria-label="Status">' +
      Ui.opcoes(
        HD.status.map(function (s) {
          return { valor: s, rotulo: HD.rotulosStatus[s] };
        }),
        r.status,
        'Todos os status',
      ) +
      '</select><button type="button" class="botao primario" id="exporta-csv">Exportar CSV</button></div></header>' +
      '<div class="tabela-container" id="tabela-relatorio">' +
      Ui.carregando('Carregando chamados...') +
      '</div><div class="paginacao" id="paginacao-relatorio"></div></section>'
    );
  }

  function filtrosDoRelatorio() {
    var r = estado.relatorio;
    return Object.assign(consulta(), { base: r.base, status: r.status || undefined });
  }

  async function carregaRelatorio() {
    var alvo = Ui.$('#tabela-relatorio');
    if (!alvo) return;
    alvo.style.opacity = '0.5';
    try {
      var resp = await Api.get(
        '/relatorios/chamados',
        Object.assign(filtrosDoRelatorio(), { pagina: estado.relatorio.pagina, porPagina: 25 }),
      );
      alvo.style.opacity = '';
      alvo.innerHTML = resp.chamados.length
        ? '<table class="tabela-indicadores tabela-relatorio"><thead><tr><th>Nº</th><th>Título</th><th class="ocultar-mobile">Solicitante</th><th class="ocultar-mobile">Serviço</th><th class="ocultar-mobile">Responsável</th><th>Status</th><th>Urgência</th><th>Aberto em</th><th class="ocultar-mobile">Resolvido em</th><th>SLA</th><th class="numero-tabela">Nota</th></tr></thead><tbody>' +
          resp.chamados
            .map(function (c) {
              return (
                '<tr data-numero="' +
                c.numero +
                '"><td class="numero">#' +
                c.numero +
                '</td><td class="titulo"><span>' +
                Ui.esc(c.titulo) +
                '</span></td><td class="ocultar-mobile">' +
                Ui.esc(c.solicitante ? c.solicitante.nome : '—') +
                '</td><td class="ocultar-mobile">' +
                Ui.esc(c.servico ? c.servico.nome : '—') +
                '</td><td class="ocultar-mobile">' +
                Ui.esc(c.responsavel ? c.responsavel.nome : '—') +
                '</td><td>' +
                Ui.badgeStatus(c.status) +
                '</td><td>' +
                Ui.prioridade(c.prioridade) +
                '</td><td>' +
                Ui.data(c.createdAt) +
                '</td><td class="ocultar-mobile">' +
                Ui.data(c.sla && c.sla.resolvidoEm) +
                '</td><td>' +
                Ui.sla(c) +
                '</td><td class="numero-tabela">' +
                (c.avaliacao ? c.avaliacao.nota + ' ★' : '—') +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table>'
        : Ui.vazio('Nenhum chamado', 'Ajuste o período ou os filtros.');
      Ui.paginacao(Ui.$('#paginacao-relatorio'), resp.paginacao, function (p) {
        estado.relatorio.pagina = p;
        carregaRelatorio();
      });
    } catch (e) {
      alvo.style.opacity = '';
      alvo.innerHTML = Ui.erro(e.message);
    }
  }

  // ---------------------------------------------------------------- exportação CSV
  function baixaBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // CSV gerado no servidor: baixa com o token (o link direto não levaria a autenticação)
  async function exportaCsv(botao, caminho, filtros, nomePadrao) {
    var restaura = Ui.ocupado(botao, 'Gerando...');
    try {
      var q = new URLSearchParams();
      Object.keys(filtros).forEach(function (k) {
        if (filtros[k]) q.set(k, filtros[k]);
      });
      var token = null;
      try {
        token = localStorage.getItem('helpdesk.jwt');
      } catch (_e) {
        token = null;
      }
      var resp = await fetch('/v1/relatorios/' + caminho + '?' + q.toString(), {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (!resp.ok) {
        var erro = await resp.json().catch(function () {
          return {};
        });
        throw new Error(erro.erro || 'Não foi possível gerar o CSV');
      }
      var nome = (resp.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
      baixaBlob(await resp.blob(), nome ? nome[1] : nomePadrao);
      Ui.toast('CSV gerado', 'sucesso');
    } catch (e) {
      Ui.toast(e.message, 'erro');
    } finally {
      restaura();
    }
  }

  // célula CSV (ponto e vírgula, como o Excel em português espera)
  function celulaCsv(texto) {
    return /[";\n\r]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  }

  function nomeDeArquivo(titulo) {
    var p = estado.dados ? estado.dados.periodo : intervalo();
    var base = titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return (base || 'dados') + '_' + p.de + '_a_' + p.ate + '.csv';
  }

  // CSV de um quadro: sai da tabela que o próprio quadro mostra (a do "Ver tabela" nos gráficos)
  function exportaCartao(secao) {
    var corpo = secao.querySelector('.corpo-grafico[id]');
    var id = corpo ? corpo.id.slice(2) : null;
    var tabela;
    if (id && desenhos[id]) {
      var temporario = document.createElement('div');
      desenhos[id].tabela(temporario);
      tabela = temporario.querySelector('table');
    } else {
      tabela = secao.querySelector('table');
    }
    if (!tabela) return Ui.toast('Este quadro não tem dados para exportar', 'erro');
    var linhas = [];
    tabela.querySelectorAll('tr').forEach(function (tr) {
      if (tr.querySelector('[colspan]')) return; // "Sem dados no período"
      linhas.push(
        Array.prototype.map
          .call(tr.children, function (c) {
            var copia = c.cloneNode(true);
            copia.querySelectorAll('.avatar, .seta').forEach(function (x) {
              x.remove();
            });
            var texto = copia.textContent.replace(/\s+/g, ' ').trim();
            return celulaCsv(texto === '—' ? '' : texto);
          })
          .join(';'),
      );
    });
    var titulo = secao.querySelector('h2').textContent;
    baixaBlob(
      new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      nomeDeArquivo(titulo),
    );
  }

  // ---------------------------------------------------------------- render
  function descricaoPeriodo(d) {
    var p = d ? d.periodo : intervalo();
    var partes = ['Período de ' + dataBr(p.de) + ' a ' + dataBr(p.ate)];
    if (d)
      partes.push(
        'comparado a ' + dataBr(d.periodo.anterior.de) + ' – ' + dataBr(d.periodo.anterior.ate),
      );
    Ui.$('#descricao-periodo').textContent = partes.join(', ');
  }

  function desenhaAbas() {
    Ui.$('#abas-relatorio').innerHTML = ABAS.map(function (a) {
      return (
        '<button type="button" role="tab" data-aba-relatorio="' +
        a[0] +
        '" aria-selected="' +
        (estado.aba === a[0]) +
        '">' +
        a[1] +
        '</button>'
      );
    }).join('');
  }

  function renderiza() {
    Graficos.escondeDica();
    desenhaAbas();
    desenhos = {};
    if (estado.aba === 'chamados') {
      conteudo.innerHTML = abaChamados();
      ligaRelatorio();
      carregaRelatorio();
      return;
    }
    var d = estado.dados;
    if (!d) return;
    var html = { geral: abaGeral, sla: abaSla, equipes: abaEquipes, satisfacao: abaSatisfacao }[
      estado.aba
    ](d);
    conteudo.innerHTML = html;
    desenhaCartoes();
  }

  function ligaRelatorio() {
    Ui.$('#base-relatorio').addEventListener('change', function (e) {
      estado.relatorio.base = e.target.value;
      estado.relatorio.pagina = 1;
      carregaRelatorio();
    });
    Ui.$('#status-relatorio').addEventListener('change', function (e) {
      estado.relatorio.status = e.target.value;
      estado.relatorio.pagina = 1;
      carregaRelatorio();
    });
    Ui.$('#exporta-csv').addEventListener('click', function (e) {
      exportaCsv(e.currentTarget, 'chamados.csv', filtrosDoRelatorio(), 'chamados.csv');
    });
  }

  var pedidoAtual = 0;
  async function carrega() {
    var meu = ++pedidoAtual;
    atualizaUrl();
    descricaoPeriodo(null);
    // recarga mantém o quadro anterior esmaecido (sem piscar)
    if (estado.dados) conteudo.classList.add('recarregando');
    else conteudo.innerHTML = Ui.carregando('Calculando indicadores...');
    try {
      var d = await Api.get('/relatorios/indicadores', consulta());
      if (meu !== pedidoAtual) return;
      estado.dados = d;
      estado.relatorio.pagina = 1;
      descricaoPeriodo(d);
      conteudo.classList.remove('recarregando');
      renderiza();
    } catch (e) {
      if (meu !== pedidoAtual) return;
      conteudo.classList.remove('recarregando');
      conteudo.innerHTML = Ui.erro(
        e.detalhes ? Object.values(e.detalhes)[0] : e.message,
        'tentar-novamente',
      );
      var b = Ui.$('#tentar-novamente');
      if (b) b.addEventListener('click', carrega);
    }
  }

  // ---------------------------------------------------------------- filtros
  async function montaFiltros() {
    var el = Ui.$('#filtros-relatorio');
    var p = intervalo();
    el.innerHTML =
      '<div class="grupo"><span>Período</span><select id="f-periodo">' +
      Ui.opcoes(
        PERIODOS.map(function (x) {
          return { valor: x[0], rotulo: x[1] };
        }),
        estado.periodo,
      ) +
      '</select></div>' +
      '<div class="grupo datas-personalizadas"' +
      (estado.periodo === 'personalizado' ? '' : ' hidden') +
      '><span>De / até</span><div class="linha-datas"><input type="date" id="f-de" value="' +
      p.de +
      '" aria-label="Data inicial" /><input type="date" id="f-ate" value="' +
      p.ate +
      '" aria-label="Data final" /></div></div>' +
      '<div class="grupo"><span>Equipe</span><select id="f-equipe" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Serviço</span><select id="f-servico" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Agente</span><select id="f-responsavel" disabled><option>Carregando...</option></select></div>' +
      '<div class="grupo"><span>Urgência</span><select id="f-prioridade">' +
      Ui.opcoes(
        Object.keys(HD.rotulosPrioridade).map(function (k) {
          return { valor: k, rotulo: HD.rotulosPrioridade[k] };
        }),
        estado.filtros.prioridade,
        'Todas',
      ) +
      '</select></div>' +
      '<div class="grupo"><span>&nbsp;</span><button type="button" class="botao" id="f-limpar">Limpar</button></div>';

    Ui.$('#f-periodo').addEventListener('change', function (e) {
      estado.periodo = e.target.value;
      el.querySelector('.datas-personalizadas').hidden = estado.periodo !== 'personalizado';
      if (estado.periodo === 'personalizado') {
        var atual = intervalo();
        estado.de = Ui.$('#f-de').value || atual.de;
        estado.ate = Ui.$('#f-ate').value || atual.ate;
      }
      carrega();
    });
    ['f-de', 'f-ate'].forEach(function (id) {
      Ui.$('#' + id).addEventListener('change', function () {
        estado.de = Ui.$('#f-de').value;
        estado.ate = Ui.$('#f-ate').value;
        if (estado.de && estado.ate) carrega();
      });
    });
    FILTROS.forEach(function (f) {
      Ui.$('#f-' + f).addEventListener('change', function (e) {
        estado.filtros[f] = e.target.value || undefined;
        carrega();
      });
    });
    Ui.$('#f-limpar').addEventListener('click', function () {
      estado.periodo = '30';
      estado.filtros = {};
      montaFiltros();
      carrega();
    });

    try {
      var r = await Promise.all([
        Api.get('/equipes'),
        Api.get('/servicos'),
        Api.get('/usuarios', { papel: 'agente,admin', ativo: 'true' }),
      ]);
      var preenche = function (id, opcoes, vazio) {
        var s = Ui.$('#' + id);
        s.innerHTML = Ui.opcoes(opcoes, estado.filtros[id.slice(2)], vazio);
        s.disabled = false;
      };
      preenche(
        'f-equipe',
        r[0].equipes.map(function (e) {
          return { valor: e._id, rotulo: e.nome };
        }),
        'Todas',
      );
      preenche(
        'f-servico',
        r[1].servicos.map(function (s) {
          return { valor: s._id, rotulo: s.nome };
        }),
        'Todos',
      );
      preenche(
        'f-responsavel',
        [{ valor: 'eu', rotulo: 'Eu' }].concat(
          r[2].usuarios.map(function (u) {
            return { valor: u._id, rotulo: u.nome };
          }),
        ),
        'Todos',
      );
    } catch (e) {
      Ui.toast('Falha ao carregar filtros: ' + e.message, 'erro');
    }
  }

  // ---------------------------------------------------------------- eventos
  Ui.$('#abas-relatorio').addEventListener('click', function (e) {
    var b = e.target.closest('[data-aba-relatorio]');
    if (!b) return;
    estado.aba = b.getAttribute('data-aba-relatorio');
    atualizaUrl();
    renderiza();
  });

  Ui.$('#exporta-indicadores').addEventListener('click', function (e) {
    exportaCsv(e.currentTarget, 'indicadores.csv', consulta(), 'indicadores.csv');
  });

  conteudo.addEventListener('click', function (e) {
    var csv = e.target.closest('[data-csv-cartao]');
    if (csv) {
      exportaCartao(csv.closest('.cartao-grafico'));
      return;
    }
    var alterna = e.target.closest('[data-alterna]');
    if (alterna) {
      var id = alterna.getAttribute('data-alterna');
      estado.modos[id] = estado.modos[id] === 'tabela' ? 'grafico' : 'tabela';
      var tabela = estado.modos[id] === 'tabela';
      alterna.setAttribute('aria-pressed', String(tabela));
      alterna.textContent = tabela ? 'Ver gráfico' : 'Ver tabela';
      var el = document.getElementById('g-' + id);
      if (tabela) desenhos[id].tabela(el);
      else desenhos[id].grafico(el);
      return;
    }
    var ordena = e.target.closest('[data-ordena-agente]');
    if (ordena) {
      var campo = ordena.getAttribute('data-ordena-agente');
      var o = estado.ordemAgentes;
      o.crescente = o.campo === campo ? !o.crescente : campo === 'nome';
      o.campo = campo;
      renderiza();
      return;
    }
    var linha = e.target.closest('tr[data-numero]');
    if (linha && !e.target.closest('a'))
      window.location.href = '/chamados/' + linha.getAttribute('data-numero');
  });

  montaFiltros();
  carrega();
})();
