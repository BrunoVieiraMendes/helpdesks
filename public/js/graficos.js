// Gráficos dos indicadores, em SVG/HTML puro (sem biblioteca).
// Regras: traços finos, grade discreta, um único eixo, legenda para 2+ séries,
// tooltip no hover/foco (crosshair nas linhas) e tabela equivalente para cada gráfico.
/* exported Graficos */
var Graficos = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var numero = new Intl.NumberFormat('pt-BR');

  // ---------------------------------------------------------------- tooltip único da página
  var dica = null;
  function tooltip() {
    if (!dica) {
      dica = document.createElement('div');
      dica.className = 'dica-grafico';
      dica.setAttribute('role', 'status');
      dica.hidden = true;
      document.body.appendChild(dica);
    }
    return dica;
  }

  /**
   * @param {string} titulo
   * @param {{ nome: string, valor: string, cor?: string, forma?: 'linha'|'caixa' }[]} linhas
   * @param {number} x  posição na página
   * @param {number} y
   */
  function mostraDica(titulo, linhas, x, y) {
    var t = tooltip();
    t.textContent = '';
    var cab = document.createElement('div');
    cab.className = 'titulo-dica';
    cab.textContent = titulo;
    t.appendChild(cab);
    linhas.forEach(function (l) {
      var linha = document.createElement('div');
      linha.className = 'linha-dica';
      if (l.cor) {
        var chave = document.createElement('span');
        chave.className = 'chave-dica ' + (l.forma || 'linha');
        chave.style.background = l.cor;
        linha.appendChild(chave);
      }
      var valor = document.createElement('strong');
      valor.textContent = l.valor;
      linha.appendChild(valor);
      var nome = document.createElement('span');
      nome.textContent = l.nome;
      linha.appendChild(nome);
      t.appendChild(linha);
    });
    t.hidden = false;
    var largura = t.offsetWidth;
    var esquerda = x + 14 + largura > window.innerWidth - 8 ? x - largura - 14 : x + 14;
    t.style.left = Math.max(8, esquerda) + 'px';
    t.style.top = y + 14 + window.scrollY + 'px';
  }

  function escondeDica() {
    if (dica) dica.hidden = true;
  }

  // ---------------------------------------------------------------- utilitários
  function el(nome, atributos, pai) {
    var e = document.createElementNS(NS, nome);
    Object.keys(atributos || {}).forEach(function (k) {
      e.setAttribute(k, atributos[k]);
    });
    if (pai) pai.appendChild(e);
    return e;
  }

  function texto(pai, x, y, conteudo, atributos) {
    var t = el('text', Object.assign({ x: x, y: y }, atributos || {}), pai);
    t.textContent = conteudo;
    return t;
  }

  // escala "bonita": 0 até um teto redondo, com ~4 divisões
  function escala(maximo) {
    if (!maximo || maximo <= 0) return { teto: 4, passo: 1 };
    var bruto = maximo / 4;
    var potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    var passo = [1, 2, 2.5, 5, 10]
      .map(function (m) {
        return m * potencia;
      })
      .filter(function (p) {
        return p >= bruto;
      })[0];
    if (passo < 1) passo = 1;
    return { teto: Math.ceil(maximo / passo) * passo, passo: passo };
  }

  // coluna/barra com 4px arredondados só na ponta (reta na base)
  function caminhoColuna(x, y, largura, altura) {
    var r = Math.min(4, largura / 2, altura);
    if (altura <= 0) return '';
    return (
      'M' +
      x +
      ',' +
      (y + altura) +
      'V' +
      (y + r) +
      'Q' +
      x +
      ',' +
      y +
      ' ' +
      (x + r) +
      ',' +
      y +
      'H' +
      (x + largura - r) +
      'Q' +
      (x + largura) +
      ',' +
      y +
      ' ' +
      (x + largura) +
      ',' +
      (y + r) +
      'V' +
      (y + altura) +
      'Z'
    );
  }

  function legenda(series, forma) {
    var div = document.createElement('div');
    div.className = 'legenda-grafico';
    series.forEach(function (s) {
      var item = document.createElement('span');
      var chave = document.createElement('span');
      chave.className = 'chave-legenda ' + (forma || 'linha');
      chave.style.background = s.cor;
      item.appendChild(chave);
      item.appendChild(document.createTextNode(s.nome));
      div.appendChild(item);
    });
    return div;
  }

  // redesenha ao mudar a largura do cartão
  function responsivo(container, desenha) {
    desenha();
    if (!window.ResizeObserver) return;
    var largura = container.clientWidth;
    var obs = new ResizeObserver(function () {
      if (Math.abs(container.clientWidth - largura) < 4) return;
      largura = container.clientWidth;
      desenha();
    });
    obs.observe(container);
  }

  // ---------------------------------------------------------------- linhas no tempo
  /**
   * @param {HTMLElement} container
   * @param {{ rotulos: string[], rotuloDica?: (i: number) => string, rotuloEixo?: (i: number) => string,
   *   series: { nome: string, cor: string, valores: number[] }[] }} cfg
   */
  function linhas(container, cfg) {
    responsivo(container, function () {
      container.textContent = '';
      var largura = Math.max(container.clientWidth, 280);
      var altura = 260;
      var m = { topo: 16, dir: 44, base: 28, esq: 40 };
      var w = largura - m.esq - m.dir;
      var h = altura - m.topo - m.base;
      var n = cfg.rotulos.length;
      var maximo = Math.max.apply(
        null,
        cfg.series.map(function (s) {
          return Math.max.apply(null, s.valores.concat(0));
        }),
      );
      var e = escala(maximo);
      var x = function (i) {
        return m.esq + (n <= 1 ? w / 2 : (i * w) / (n - 1));
      };
      var y = function (v) {
        return m.topo + h - (v / e.teto) * h;
      };

      var svg = el('svg', {
        viewBox: '0 0 ' + largura + ' ' + altura,
        width: largura,
        height: altura,
        class: 'svg-grafico',
        role: 'img',
        'aria-label':
          cfg.series
            .map(function (s) {
              return s.nome;
            })
            .join(' e ') + ' por dia',
      });

      // grade horizontal e eixo Y
      for (var v = 0; v <= e.teto; v += e.passo) {
        el(
          'line',
          { x1: m.esq, x2: m.esq + w, y1: y(v), y2: y(v), class: v === 0 ? 'eixo' : 'grade' },
          svg,
        );
        texto(svg, m.esq - 8, y(v) + 4, numero.format(v), {
          class: 'rotulo-eixo',
          'text-anchor': 'end',
        });
      }
      // rótulos do eixo X (no máximo ~7)
      var saltos = Math.max(1, Math.ceil(n / 7));
      for (var i = 0; i < n; i += saltos) {
        texto(svg, x(i), altura - 8, (cfg.rotuloEixo || String)(i), {
          class: 'rotulo-eixo',
          'text-anchor': 'middle',
        });
      }

      cfg.series.forEach(function (s) {
        var d = s.valores
          .map(function (valor, j) {
            return (j ? 'L' : 'M') + x(j) + ',' + y(valor);
          })
          .join('');
        el('path', { d: d, class: 'linha-serie', stroke: s.cor }, svg);
      });

      // ponto e valor no fim de cada série (rótulo seletivo)
      var ultimo = n - 1;
      var fins = cfg.series.map(function (s) {
        return { s: s, y: y(s.valores[ultimo]) };
      });
      fins.forEach(function (f, k) {
        el('circle', { cx: x(ultimo), cy: f.y, r: 4, fill: f.s.cor, class: 'ponto-serie' }, svg);
        // afasta rótulos que colidem
        var ty = f.y + 4;
        if (k > 0 && Math.abs(ty - (fins[k - 1].ty || 0)) < 14)
          ty = fins[k - 1].ty + (ty >= fins[k - 1].ty ? 14 : -14);
        f.ty = ty;
        texto(svg, x(ultimo) + 8, ty, numero.format(f.s.valores[ultimo]), {
          class: 'rotulo-valor',
        });
      });

      // crosshair: linha vertical + marcadores no índice mais próximo
      var mira = el(
        'line',
        { y1: m.topo, y2: m.topo + h, class: 'mira', visibility: 'hidden' },
        svg,
      );
      var marcadores = cfg.series.map(function (s) {
        return el('circle', { r: 5, fill: s.cor, class: 'ponto-serie', visibility: 'hidden' }, svg);
      });
      var area = el(
        'rect',
        {
          x: m.esq,
          y: m.topo,
          width: w,
          height: h,
          class: 'area-hover',
          tabindex: 0,
          'aria-label': 'Explorar valores por dia',
        },
        svg,
      );
      var atual = ultimo;

      function mostra(indice, px, py) {
        atual = Math.max(0, Math.min(n - 1, indice));
        mira.setAttribute('x1', x(atual));
        mira.setAttribute('x2', x(atual));
        mira.setAttribute('visibility', 'visible');
        cfg.series.forEach(function (s, k) {
          marcadores[k].setAttribute('cx', x(atual));
          marcadores[k].setAttribute('cy', y(s.valores[atual]));
          marcadores[k].setAttribute('visibility', 'visible');
        });
        mostraDica(
          (cfg.rotuloDica || String)(atual),
          cfg.series.map(function (s) {
            return { nome: s.nome, valor: numero.format(s.valores[atual]), cor: s.cor };
          }),
          px,
          py,
        );
      }
      function esconde() {
        mira.setAttribute('visibility', 'hidden');
        marcadores.forEach(function (mk) {
          mk.setAttribute('visibility', 'hidden');
        });
        escondeDica();
      }
      area.addEventListener('pointermove', function (ev) {
        var caixa = svg.getBoundingClientRect();
        var escalaX = largura / caixa.width;
        var px = (ev.clientX - caixa.left) * escalaX;
        mostra(Math.round(((px - m.esq) / w) * (n - 1)), ev.clientX, ev.clientY);
      });
      area.addEventListener('pointerleave', esconde);
      area.addEventListener('blur', esconde);
      area.addEventListener('keydown', function (ev) {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        var caixa = svg.getBoundingClientRect();
        var proximo = atual + (ev.key === 'ArrowRight' ? 1 : -1);
        mostra(
          proximo,
          caixa.left + (x(Math.max(0, Math.min(n - 1, proximo))) / largura) * caixa.width,
          caixa.top + 20,
        );
      });
      area.addEventListener('focus', function () {
        var caixa = svg.getBoundingClientRect();
        mostra(atual, caixa.left + (x(atual) / largura) * caixa.width, caixa.top + 20);
      });

      container.appendChild(svg);
      if (cfg.series.length > 1) container.appendChild(legenda(cfg.series, 'linha'));
    });
  }

  // ---------------------------------------------------------------- barras horizontais (HTML)
  /**
   * Uma série: todas as barras na mesma cor; valor na ponta.
   * @param {HTMLElement} container
   * @param {{ itens: { nome: string, total: number, href?: string, detalhe?: string }[], cor: string,
   *   formata?: (v: number) => string, unidade?: string }} cfg
   */
  function barras(container, cfg) {
    container.textContent = '';
    if (!cfg.itens.length) {
      container.innerHTML = '<p class="sem-dados">Sem dados no período.</p>';
      return;
    }
    var formata = cfg.formata || numero.format;
    var maximo = Math.max.apply(
      null,
      cfg.itens.map(function (i) {
        return i.total;
      }),
    );
    var lista = document.createElement('div');
    lista.className = 'barras-h';
    cfg.itens.forEach(function (item) {
      var linha = document.createElement(item.href ? 'a' : 'div');
      linha.className = 'linha-barra';
      if (item.href) linha.href = item.href;
      linha.tabIndex = 0;
      var nome = document.createElement('span');
      nome.className = 'nome-barra';
      nome.textContent = item.nome;
      var trilho = document.createElement('span');
      trilho.className = 'trilho-barra';
      var barra = document.createElement('span');
      barra.className = 'barra';
      barra.style.width = maximo
        ? Math.max((item.total / maximo) * 100, item.total ? 1.5 : 0) + '%'
        : '0';
      barra.style.background = cfg.cor;
      trilho.appendChild(barra);
      var valor = document.createElement('span');
      valor.className = 'valor-barra';
      valor.textContent = formata(item.total);
      linha.appendChild(nome);
      linha.appendChild(trilho);
      linha.appendChild(valor);

      function dicaDaBarra(ev) {
        var r = linha.getBoundingClientRect();
        mostraDica(
          item.nome,
          [
            {
              nome: item.detalhe || cfg.unidade || '',
              valor: formata(item.total),
              cor: cfg.cor,
              forma: 'caixa',
            },
          ],
          ev.clientX || r.right - 80,
          ev.clientY || r.top,
        );
      }
      linha.addEventListener('pointermove', dicaDaBarra);
      linha.addEventListener('focus', dicaDaBarra);
      linha.addEventListener('pointerleave', escondeDica);
      linha.addEventListener('blur', escondeDica);
      lista.appendChild(linha);
    });
    container.appendChild(lista);
  }

  // ---------------------------------------------------------------- colunas empilhadas
  /**
   * @param {HTMLElement} container
   * @param {{ rotulos: string[], series: { nome: string, cor: string, valores: number[] }[] }} cfg
   */
  function colunasEmpilhadas(container, cfg) {
    responsivo(container, function () {
      container.textContent = '';
      if (!cfg.rotulos.length) {
        container.innerHTML = '<p class="sem-dados">Sem dados no período.</p>';
        return;
      }
      var largura = Math.max(container.clientWidth, 280);
      var altura = 240;
      var m = { topo: 16, dir: 12, base: 28, esq: 40 };
      var w = largura - m.esq - m.dir;
      var h = altura - m.topo - m.base;
      var n = cfg.rotulos.length;
      var totais = cfg.rotulos.map(function (_r, i) {
        return cfg.series.reduce(function (soma, s) {
          return soma + s.valores[i];
        }, 0);
      });
      var e = escala(Math.max.apply(null, totais.concat(0)));
      var faixa = w / n;
      var grossura = Math.min(24, faixa * 0.6);
      var y = function (v) {
        return m.topo + h - (v / e.teto) * h;
      };

      var svg = el('svg', {
        viewBox: '0 0 ' + largura + ' ' + altura,
        width: largura,
        height: altura,
        class: 'svg-grafico',
        role: 'img',
        'aria-label':
          'Colunas empilhadas: ' +
          cfg.series
            .map(function (s) {
              return s.nome;
            })
            .join(', '),
      });
      for (var v = 0; v <= e.teto; v += e.passo) {
        el(
          'line',
          { x1: m.esq, x2: m.esq + w, y1: y(v), y2: y(v), class: v === 0 ? 'eixo' : 'grade' },
          svg,
        );
        texto(svg, m.esq - 8, y(v) + 4, numero.format(v), {
          class: 'rotulo-eixo',
          'text-anchor': 'end',
        });
      }
      var saltos = Math.max(1, Math.ceil(n / 8));

      cfg.rotulos.forEach(function (rotulo, i) {
        var cx = m.esq + faixa * i + (faixa - grossura) / 2;
        var base = y(0);
        var grupo = el('g', { class: 'coluna-hover', tabindex: 0 }, svg);
        cfg.series.forEach(function (s, k) {
          var valor = s.valores[i];
          if (!valor) return;
          var alturaSeg = (valor / e.teto) * h;
          var topo = base - alturaSeg;
          // 2px de respiro entre segmentos; só o último leva a ponta arredondada
          var ultimoComValor = cfg.series.slice(k + 1).every(function (x) {
            return !x.valores[i];
          });
          var hSeg = Math.max(alturaSeg - (k > 0 ? 2 : 0), 0);
          if (ultimoComValor) {
            el('path', { d: caminhoColuna(cx, topo, grossura, hSeg), fill: s.cor }, grupo);
          } else {
            el('rect', { x: cx, y: topo, width: grossura, height: hSeg, fill: s.cor }, grupo);
          }
          base = topo;
        });
        // alvo de hover maior que a coluna
        el(
          'rect',
          { x: m.esq + faixa * i, y: m.topo, width: faixa, height: h, fill: 'transparent' },
          grupo,
        );
        if (i % saltos === 0) {
          texto(svg, m.esq + faixa * i + faixa / 2, altura - 8, rotulo, {
            class: 'rotulo-eixo',
            'text-anchor': 'middle',
          });
        }
        function dicaDaColuna(ev) {
          var r = grupo.getBoundingClientRect();
          mostraDica(
            rotulo + ' · ' + numero.format(totais[i]) + ' no total',
            cfg.series.map(function (s) {
              return {
                nome: s.nome,
                valor: numero.format(s.valores[i]),
                cor: s.cor,
                forma: 'caixa',
              };
            }),
            ev.clientX || r.right,
            ev.clientY || r.top,
          );
        }
        grupo.addEventListener('pointermove', dicaDaColuna);
        grupo.addEventListener('focus', dicaDaColuna);
        grupo.addEventListener('pointerleave', escondeDica);
        grupo.addEventListener('blur', escondeDica);
      });

      container.appendChild(svg);
      container.appendChild(legenda(cfg.series, 'caixa'));
    });
  }

  // ---------------------------------------------------------------- mapa de calor (HTML)
  var RAMPA = ['#f1f5fb', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

  /**
   * @param {HTMLElement} container
   * @param {{ linhas: string[], colunas: string[], valor: (l: number, c: number) => number }} cfg
   */
  function calor(container, cfg) {
    container.textContent = '';
    var maximo = 0;
    cfg.linhas.forEach(function (_l, li) {
      cfg.colunas.forEach(function (_c, ci) {
        maximo = Math.max(maximo, cfg.valor(li, ci));
      });
    });
    var grade = document.createElement('div');
    grade.className = 'mapa-calor';
    grade.style.gridTemplateColumns = '44px repeat(' + cfg.colunas.length + ', minmax(14px, 1fr))';

    grade.appendChild(document.createElement('span'));
    cfg.colunas.forEach(function (c, ci) {
      var cab = document.createElement('span');
      cab.className = 'rotulo-eixo cab-calor';
      cab.textContent = ci % 3 === 0 ? c : '';
      grade.appendChild(cab);
    });
    cfg.linhas.forEach(function (l, li) {
      var nome = document.createElement('span');
      nome.className = 'rotulo-eixo';
      nome.textContent = l;
      grade.appendChild(nome);
      cfg.colunas.forEach(function (c, ci) {
        var v = cfg.valor(li, ci);
        var passo =
          v === 0 || !maximo ? 0 : Math.max(1, Math.ceil((v / maximo) * (RAMPA.length - 1)));
        var celula = document.createElement('span');
        celula.className = 'celula-calor';
        celula.style.background = RAMPA[passo];
        celula.tabIndex = 0;
        function dicaDaCelula(ev) {
          var r = celula.getBoundingClientRect();
          mostraDica(
            l + ', ' + c,
            [
              {
                nome: v === 1 ? 'chamado aberto' : 'chamados abertos',
                valor: numero.format(v),
                cor: RAMPA[Math.max(passo, 2)],
                forma: 'caixa',
              },
            ],
            ev.clientX || r.right,
            ev.clientY || r.top,
          );
        }
        celula.addEventListener('pointermove', dicaDaCelula);
        celula.addEventListener('focus', dicaDaCelula);
        celula.addEventListener('pointerleave', escondeDica);
        celula.addEventListener('blur', escondeDica);
        grade.appendChild(celula);
      });
    });
    container.appendChild(grade);

    // escala da rampa
    var escalaEl = document.createElement('div');
    escalaEl.className = 'escala-calor';
    escalaEl.innerHTML = '<span>Menos</span>';
    RAMPA.forEach(function (cor) {
      var s = document.createElement('span');
      s.className = 'passo-calor';
      s.style.background = cor;
      escalaEl.appendChild(s);
    });
    var mais = document.createElement('span');
    mais.textContent = 'Mais (máx. ' + numero.format(maximo) + ')';
    escalaEl.appendChild(mais);
    container.appendChild(escalaEl);
  }

  // ---------------------------------------------------------------- tabela equivalente
  /**
   * @param {HTMLElement} container
   * @param {string[]} cabecalho
   * @param {(string|number)[][]} linhasTabela
   */
  function tabela(container, cabecalho, linhasTabela) {
    container.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'tabela-container tabela-grafico';
    var t = document.createElement('table');
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    cabecalho.forEach(function (c, i) {
      var th = document.createElement('th');
      th.textContent = c;
      if (i > 0) th.className = 'numero-tabela';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = document.createElement('tbody');
    linhasTabela.forEach(function (l) {
      var linha = document.createElement('tr');
      l.forEach(function (v, i) {
        var td = document.createElement('td');
        td.textContent =
          typeof v === 'number' ? numero.format(v) : v === null || v === undefined ? '—' : v;
        if (i > 0) td.className = 'numero-tabela';
        linha.appendChild(td);
      });
      tbody.appendChild(linha);
    });
    t.appendChild(tbody);
    wrap.appendChild(t);
    container.appendChild(wrap);
  }

  document.addEventListener('scroll', escondeDica, { passive: true });

  return {
    linhas: linhas,
    barras: barras,
    colunasEmpilhadas: colunasEmpilhadas,
    calor: calor,
    tabela: tabela,
    escondeDica: escondeDica,
  };
})();
