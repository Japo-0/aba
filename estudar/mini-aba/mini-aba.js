/* Mini aba do /estudar: mostra uma tarefa por vez, com conclusão manual e avanço automático.
 *
 * Roda na aba do livro (pelo javascript do Chrome) e expõe window.__miniAba:
 *   carregar(payload)  recebe o planejamento montado pelo tarefas.py e abre a aba
 *   concluir()         marca a tarefa atual como concluída e passa para a próxima
 *   desfazer()         volta a última conclusão
 *   estado()           o que o /estudar precisa ler: concluídas, tarefa atual, blocos fechados, posição
 *   abrir() / fechar() / minimizar(bool)
 * Alt+Shift+E reabre a aba depois de fechada.
 */
(function () {
  'use strict';
  if (window.__miniAba && window.__miniAba.versao === 1) return;

  var K_POS = 'miniAba:pos', K_FEITAS = 'miniAba:feitas', K_MIN = 'miniAba:min';
  var MARGEM = 16;

  function ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var plano = { id: '', tarefas: [], livroAberto: null };
  var feitas = {};          // id -> horário da conclusão
  var pos = null;           // {x, y, t}: canto superior esquerdo, em px da janela
  var minimizada = !!ler(K_MIN);
  var ultima = null, timerDesfazer = null;

  // ---------- DOM (shadow DOM para não herdar nem vazar estilos da página) ----------
  var host = document.createElement('div');
  host.id = 'mini-aba-estudar';
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;display:none;';
  var raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.card{--bg:#fffdf9;--ink:#1d1b17;--muted:#645f55;--line:#ddd7ca;--accent:#1f4fd8;--accent-ink:#fff;--soft:#eef2fd;' +
    '--c:var(--accent);width:272px;box-sizing:border-box;background:var(--bg);color:var(--ink);' +
    'border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 28px rgba(20,18,12,.18);' +
    'font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}' +
    '@media (prefers-color-scheme:dark){.card{--bg:#1c1d23;--ink:#ecebe6;--muted:#a8a59b;--line:#2f323d;' +
    '--accent:#7ea2ff;--accent-ink:#0d1220;--soft:#232a3d;box-shadow:0 8px 28px rgba(0,0,0,.5)}}' +
    '.top{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;cursor:grab;user-select:none;' +
    '-webkit-user-select:none;touch-action:none;border-bottom:1px solid var(--line)}' +
    '.card.arrastando .top{cursor:grabbing}' +
    '.card.min .top{border-bottom:0}' +
    '.grip{width:8px;height:14px;flex:none;opacity:.45;background:radial-gradient(circle,var(--muted) 1.2px,transparent 1.4px) 0 0/4px 4px}' +
    '.prog{flex:1;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.prog b{color:var(--ink);font-weight:600}' +
    '.ic{all:unset;box-sizing:border-box;width:24px;height:24px;border-radius:6px;display:grid;place-items:center;' +
    'color:var(--muted);cursor:pointer;font-size:15px;line-height:1}' +
    '.ic:hover{background:var(--soft);color:var(--ink)}' +
    '.ic:focus-visible,.ok:focus-visible,.undo:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
    '.barra{height:3px;background:var(--line)}.barra i{display:block;height:100%;width:0;background:var(--c);transition:width .3s}' +
    '.corpo{padding:10px 12px 12px}.card.min .corpo,.card.min .barra{display:none}' +
    '.ctx{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-bottom:4px}' +
    '.ctx::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--c);flex:none}' +
    '.tit{font-size:15px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}' +
    '.det{color:var(--muted);margin-top:2px}.det:empty{display:none}' +
    '.aviso{margin-top:8px;font-size:11.5px;color:var(--muted);background:var(--soft);border-radius:6px;padding:5px 7px}.aviso:empty{display:none}' +
    '.ok{all:unset;box-sizing:border-box;margin-top:10px;width:100%;display:flex;align-items:center;justify-content:center;gap:6px;' +
    'padding:8px 10px;border-radius:8px;background:var(--accent);color:var(--accent-ink);font-weight:600;font-size:13px;cursor:pointer}' +
    '.ok:hover{filter:brightness(1.08)}.ok:active{transform:translateY(1px)}' +
    '.pe{display:flex;justify-content:flex-end;min-height:0}.undo{all:unset;margin-top:6px;font-size:11.5px;color:var(--muted);' +
    'text-decoration:underline;cursor:pointer}.undo[hidden]{display:none}' +
    '.fim{text-align:center;padding:6px 0 2px}.fim .tit{font-size:14px}.fim[hidden],.tarefa[hidden]{display:none}' +
    '</style>' +
    '<section class="card" role="region" aria-label="Tarefa de estudo atual">' +
    '<div class="top" title="Arraste para mover"><span class="grip" aria-hidden="true"></span>' +
    '<span class="prog" aria-live="polite"></span>' +
    '<button class="ic min-bt" type="button" aria-label="Minimizar">–</button>' +
    '<button class="ic fechar-bt" type="button" aria-label="Fechar">×</button></div>' +
    '<div class="barra"><i></i></div>' +
    '<div class="corpo">' +
    '<div class="tarefa"><div class="ctx"></div><div class="tit"></div><div class="det"></div><div class="aviso"></div>' +
    '<button class="ok" type="button"><span aria-hidden="true">✓</span> Marcar como concluído</button></div>' +
    '<div class="fim" hidden><div class="tit">Planejamento concluído</div><div class="det"></div></div>' +
    '<div class="pe"><button class="undo" type="button" hidden>Desfazer</button></div>' +
    '</div></section>';

  var $ = function (s) { return raiz.querySelector(s); };
  var card = $('.card'), topo = $('.top'), prog = $('.prog'), barra = $('.barra i');
  var elTarefa = $('.tarefa'), elFim = $('.fim'), btOk = $('.ok'), btUndo = $('.undo'), btMin = $('.min-bt');

  // eventos dentro da aba não chegam à página (o visualizador do livro não rola nem troca de página por eles)
  ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'wheel', 'touchstart']
    .forEach(function (t) { host.addEventListener(t, function (e) { e.stopPropagation(); }); });

  // ---------- tarefas ----------
  function indiceAtual() {
    for (var i = 0; i < plano.tarefas.length; i++) if (!feitas[plano.tarefas[i].id]) return i;
    return -1;
  }

  var COR = { 'Matemática': '--mat', 'Física': '--fis', 'Química': '--qui', 'Biologia': '--bio' };
  var CORES = { '--mat': ['#2447c0', '#7ea2ff'], '--fis': ['#b43c08', '#ff9a5c'], '--qui': ['#0b7a5c', '#4fd1a5'], '--bio': ['#7a3fb0', '#c59bff'] };
  var escuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function corDa(t) {
    var materia = (t.contexto || '').split(' · ')[0], c = CORES[COR[materia]];
    return c ? c[escuro && escuro.matches ? 1 : 0] : '';
  }

  function render() {
    var total = plano.tarefas.length, i = indiceAtual();
    var n = 0;
    for (var j = 0; j < total; j++) if (feitas[plano.tarefas[j].id]) n++;
    barra.style.width = total ? (100 * n / total) + '%' : '0';
    if (i < 0) {
      prog.innerHTML = total ? '<b>Concluído</b> · ' + total + ' de ' + total : 'Sem tarefas';
      elTarefa.hidden = true; elFim.hidden = false;
      elFim.querySelector('.det').textContent = total ? total + (total > 1 ? ' tarefas feitas' : ' tarefa feita') : 'Nada para hoje.';
      card.style.removeProperty('--c');
    } else {
      var t = plano.tarefas[i];
      prog.innerHTML = '<b>Tarefa ' + (i + 1) + ' de ' + total + '</b>' + (total - i - 1 ? ' · faltam ' + (total - i - 1) : ' · última');
      elTarefa.hidden = false; elFim.hidden = true;
      $('.ctx').textContent = t.contexto || '';
      $('.tit').textContent = t.titulo;
      $('.tit').title = t.titulo;
      $('.det').textContent = t.detalhe || '';
      $('.aviso').textContent = plano.livroAberto && t.livro && t.livro !== plano.livroAberto
        ? 'Outro livro: ' + t.livro + (t.pagina ? ', p. ' + t.pagina : '') + '. Diga “abrir” no chat.' : '';
      var c = corDa(t);
      if (c) card.style.setProperty('--c', c); else card.style.removeProperty('--c');
    }
    btUndo.hidden = !ultima;
    card.classList.toggle('min', minimizada);
    btMin.textContent = minimizada ? '▢' : '–';
    btMin.setAttribute('aria-label', minimizada ? 'Expandir' : 'Minimizar');
    posicionar();
  }

  function salvarFeitas() {
    var guardadas = ler(K_FEITAS) || {};
    for (var id in feitas) guardadas[id] = feitas[id];
    for (var g in guardadas) if (!feitas[g] && plano.tarefas.some(function (t) { return t.id === g; })) delete guardadas[g];
    // só guarda os últimos 14 dias
    var corte = Date.now() - 14 * 864e5;
    for (var k in guardadas) if (guardadas[k] < corte) delete guardadas[k];
    gravar(K_FEITAS, guardadas);
  }

  function concluir() {
    var i = indiceAtual();
    if (i < 0) return estado();
    var t = plano.tarefas[i];
    feitas[t.id] = Date.now();
    ultima = t.id;
    salvarFeitas();
    clearTimeout(timerDesfazer);
    timerDesfazer = setTimeout(function () { ultima = null; render(); }, 8000);
    render();
    var prox = plano.tarefas[indiceAtual()];
    if (prox && prox.pagina && prox.livro && prox.livro === plano.livroAberto && prox.pagina !== t.pagina) irParaPagina(prox.pagina);
    if (!elTarefa.hidden) btOk.focus({ preventScroll: true });
    return estado();
  }

  function desfazer() {
    if (!ultima) return estado();
    delete feitas[ultima];
    ultima = null;
    clearTimeout(timerDesfazer);
    salvarFeitas();
    render();
    return estado();
  }

  // Troca a página no visualizador do Poliedro quando a próxima tarefa é no mesmo livro.
  // É só uma tentativa: se não achar o campo de página, nada muda e o /estudar troca a página.
  function irParaPagina(n) {
    var docs = [document];
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {}
    });
    for (var d = 0; d < docs.length; d++) {
      var campos = docs[d].querySelectorAll('input:not([type]),input[type=text],input[type=number]');
      for (var i = 0; i < campos.length; i++) {
        var c = campos[i];
        if (!c.offsetParent || !/^\s*\d+\s*(\/\s*\d+)?\s*$/.test(c.value)) continue;
        var vizinho = (c.parentElement && c.parentElement.textContent) || '';
        if (!/\/\s*\d+/.test(vizinho + c.value) && !/Anterior|Próxima/i.test((c.closest('div,nav,footer') || {}).textContent || '')) continue;
        var proto = Object.getPrototypeOf(c), setter = Object.getOwnPropertyDescriptor(proto, 'value');
        c.focus();
        if (setter && setter.set) setter.set.call(c, String(n)); else c.value = String(n);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        c.dispatchEvent(new Event('change', { bubbles: true }));
        ['keydown', 'keypress', 'keyup'].forEach(function (tipo) {
          c.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        });
        c.blur();
        return true;
      }
    }
    return false;
  }

  // ---------- posição e arraste ----------
  function limitar(x, y) {
    var r = host.getBoundingClientRect();
    var maxX = Math.max(0, window.innerWidth - r.width), maxY = Math.max(0, window.innerHeight - r.height);
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
  }

  function posicionar() {
    if (host.style.display === 'none') return;
    var alvo = pos || { x: window.innerWidth - host.getBoundingClientRect().width - MARGEM, y: MARGEM };
    var p = limitar(alvo.x, alvo.y);
    host.style.left = p.x + 'px';
    host.style.top = p.y + 'px';
  }

  var arraste = null, quadro = 0;
  topo.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    var r = host.getBoundingClientRect();
    arraste = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, ativo: false, x: r.left, y: r.top };
    // captura já no pointerdown: mesmo um movimento rápido que sai da barra continua o arraste
    try { topo.setPointerCapture(e.pointerId); } catch (er) {}
    e.preventDefault();  // não seleciona texto da página durante o arraste
  });
  topo.addEventListener('pointermove', function (e) {
    if (!arraste || e.pointerId !== arraste.id) return;
    if (!arraste.ativo) {
      // limiar de 4 px: um clique simples na barra não move a aba
      if (Math.abs(e.clientX - arraste.sx) + Math.abs(e.clientY - arraste.sy) < 4) return;
      arraste.ativo = true;
      card.classList.add('arrastando');
    }
    var p = limitar(e.clientX - arraste.dx, e.clientY - arraste.dy);
    arraste.x = p.x; arraste.y = p.y;
    if (!quadro) quadro = requestAnimationFrame(function () {
      quadro = 0;
      if (!arraste) return;
      host.style.left = arraste.x + 'px';
      host.style.top = arraste.y + 'px';
    });
  });
  function soltar(e) {
    if (!arraste || e.pointerId !== arraste.id) return;
    if (arraste.ativo) {
      pos = { x: arraste.x, y: arraste.y, t: Date.now() };
      host.style.left = pos.x + 'px';
      host.style.top = pos.y + 'px';
      gravar(K_POS, pos);
      card.classList.remove('arrastando');
    }
    try { topo.releasePointerCapture(e.pointerId); } catch (er) {}
    arraste = null;
  }
  topo.addEventListener('pointerup', soltar);
  topo.addEventListener('pointercancel', soltar);
  window.addEventListener('resize', posicionar);

  // ---------- controles ----------
  btOk.addEventListener('click', concluir);
  btUndo.addEventListener('click', desfazer);
  btMin.addEventListener('click', function () { minimizar(!minimizada); });
  $('.fechar-bt').addEventListener('click', fechar);
  window.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && (e.key === 'E' || e.key === 'e' || e.code === 'KeyE')) {
      e.preventDefault();
      if (host.style.display === 'none') abrir(); else fechar();
    }
  }, true);

  function minimizar(v) { minimizada = !!v; gravar(K_MIN, minimizada); render(); return estado(); }
  function abrir() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    host.style.display = 'block';
    render();
    return estado();
  }
  function fechar() { host.style.display = 'none'; return estado(); }

  function carregar(payload) {
    plano = { id: payload.id || '', tarefas: payload.tarefas || [], livroAberto: payload.livroAberto || null };
    feitas = {};
    var guardadas = ler(K_FEITAS) || {};
    plano.tarefas.forEach(function (t) { if (guardadas[t.id]) feitas[t.id] = guardadas[t.id]; });
    (payload.feitas || []).forEach(function (id) { if (!feitas[id]) feitas[id] = Date.now(); });
    salvarFeitas();
    // a posição mais recente vence: a desta página ou a que o /estudar trouxe da aba anterior
    var local = ler(K_POS);
    pos = [local, payload.pos].filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); })
      .sort(function (a, b) { return (b.t || 0) - (a.t || 0); })[0] || null;
    ultima = null;
    return abrir();
  }

  function estado() {
    var i = indiceAtual(), blocos = {}, fechados = [];
    plano.tarefas.forEach(function (t) {
      if (!(t.bloco in blocos)) blocos[t.bloco] = true;
      if (!feitas[t.id]) blocos[t.bloco] = false;
    });
    for (var b in blocos) if (blocos[b]) fechados.push(b);
    return {
      plano: plano.id,
      total: plano.tarefas.length,
      feitas: plano.tarefas.filter(function (t) { return feitas[t.id]; }).map(function (t) { return t.id; }),
      indice: i < 0 ? null : i + 1,
      atual: i < 0 ? null : plano.tarefas[i],
      blocosConcluidos: fechados,
      livroAberto: plano.livroAberto,
      pos: pos,
      minimizada: minimizada,
      visivel: host.style.display !== 'none'
    };
  }

  window.__miniAba = {
    versao: 1, carregar: carregar, concluir: concluir, desfazer: desfazer, estado: estado,
    abrir: abrir, fechar: fechar, minimizar: minimizar, irParaPagina: irParaPagina
  };
})();
