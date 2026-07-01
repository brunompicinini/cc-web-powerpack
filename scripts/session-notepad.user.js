// ==UserScript==
// @name         Claude Code Web — Notepad por sessão
// @namespace    bruno.uptide
// @version      2.23
// @description  Painel lateral de notas por sessão no Claude Code Web (empurra o conteúdo, estilo Diff). Atalho Ctrl+Shift+S, redimensionável, links clicáveis. Nota salva por sessionId no localStorage.
// @author       Bruno Picinini
// @match        https://claude.ai/code*
// @run-at       document-start
// @grant        GM_openInTab
// @noframes
// @homepageURL  https://github.com/brunompicinini/cc-web-powerpack
// @supportURL   https://github.com/brunompicinini/cc-web-powerpack/issues
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-notepad.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-notepad.user.js
// ==/UserScript==

(function ccNotesUserscript() {
  'use strict';
  if (window.ccNotesLoaded) return;
  window.ccNotesLoaded = true;

  const BTN_MARK = 'data-cc-notes-btn';
  const DRAWER_ID = 'cc-notes-drawer';
  const KEY = 'cc-notes:', W_KEY = 'cc-notes:w';
  const ICON_REST = 'rgba(255,255,255,0.7)', ICON_HOVER = 'rgba(255,255,255,1)';
  const MUTED = 'rgba(255,255,255,0.55)', BRIGHT = 'hsl(60 14% 97%)';
  const ACCENT = '#0099ff'; // azul do botão ativo + links (igual ao Claude Code Web)
  const MINW = 300, DEFW = 750; // largura padrao 750px; sem teto fixo (limita so a janela)

  // template padrao pra notas novas (sessao ainda sem nota salva) — exibido, salva so quando o usuario editar
  const TEMPLATE = '# STATUS\n\n\n# PRs\n\n\n# CLICKUP\n\n\n# LINKS\n\n\n# NOTES';
  const sid = () => (location.pathname.match(/session_[A-Za-z0-9]+/u) || [])[0] || null;
  const load = id => { try { return localStorage.getItem(KEY + id) || ''; } catch { return ''; } };
  const loadNote = id => load(id) || TEMPLATE; // nota da sessao, ou template padrao se vazia
  const save = (id, v) => { try { localStorage.setItem(KEY + id, v); } catch { /* ignore */ } };
  const maxW = () => window.innerWidth - 40;
  const getW = () => { const w = parseInt(localStorage.getItem(W_KEY) || DEFW, 10); return Math.min(maxW(), Math.max(MINW, isNaN(w) ? DEFW : w)); };
  const setW = w => { try { localStorage.setItem(W_KEY, String(Math.round(w))); } catch { /* ignore */ } };
  // autostart: abre o painel sozinho ao carregar a pagina. Default = on (so fica off se o usuario gravar '0').
  const A_KEY = 'cc-notes:autostart';
  const getAuto = () => { try { return localStorage.getItem(A_KEY) !== '0'; } catch { return true; } };
  const setAuto = on => { try { localStorage.setItem(A_KEY, on ? '1' : '0'); } catch { /* ignore */ } };

  // ícone notebook-pen (Lucide), 13px, herda a cor da barra
  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>';

  // CSS: placeholder + link (se a CSP bloquear <style>, links seguem com estilo inline da linkify)
  const st = document.createElement('style'); st.id = 'cc-notes-style';
  st.textContent = '#cc-notes-editor:empty:before{content:attr(data-ph);color:rgba(255,255,255,0.3);pointer-events:none;}#cc-notes-editor a{color:' + ACCENT + ';text-decoration:underline;cursor:pointer;}#cc-notes-editor:focus{outline:none;}';
  (document.head || document.documentElement).appendChild(st);

  let drawer = null, editor = null, currentId = null, saveT = null, btnRef = null, nameEl = null, sepEl = null;
  let lastRendered = null; // ultimo texto renderizado no editor; blur so re-renderiza se mudou (preserva o caret ao trocar de aba sem editar)
  let lastMode = null, sidebarApplied = false; // controle do layout por modo (sessao vs home)

  const escHtml = s => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  // newline fica como \n literal (editor usa white-space: pre-wrap) -> round-trip idempotente.
  // a URL ja vem escapada por escHtml; tira a pontuacao final que normalmente nao faz parte do link
  // (ex.: markdown "(url)." -> link "url" + texto ")."). O set exclui ';' pra nao cortar entidades (&amp; etc).
  const linkify = t => escHtml(t || '').replace(/https?:\/\/[^\s<]+/gu, m => {
    const u = m.replace(/[.,!?)\]}]+$/u, ''), tail = m.slice(u.length);
    return '<a href="' + u + '" target="_blank" rel="noopener" style="color:' + ACCENT + ';text-decoration:underline">' + u + '</a>' + tail;
  });
  const getText = () => editor.innerText.replace(/\u00a0/gu, ' ');
  const setText = t => { editor.innerHTML = linkify(t); lastRendered = t; };
  // versao atual lida do Tampermonkey (GM_info), com fallback caso indisponivel.
  const VERSION = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '2.20';
  // abre link em nova aba. active=false => background (nao troca de aba); active=true => abre e foca.
  // GM_openInTab e a forma confiavel de background: o clique sintetico com modificador NAO funciona (testado, abriu em foreground).
  const openTab = (url, active) => { if (typeof GM_openInTab === 'function') GM_openInTab(url, { active, insert: true, setParent: true }); else window.open(url, '_blank', 'noopener'); };
  // nome do chat = header editavel do Claude (button.cursor-text), inclui o prefixo [id]. Mesma fonte que o script do favicon usa.
  const sessionName = () => { const b = document.querySelector('button.cursor-text'); return b ? (b.textContent || '').trim() : ''; };

  // Empurra o conteudo principal pra abrir espaco pro painel (ajusta style.right). O Claude Code Web renomeou o
  // container de id #dframe-main pra <main class="dframe-content"> (mesma pegada: position:absolute; left:0; right:0;
  // setar right encolhe a largura). Tenta o id antigo primeiro (caso revertam) e cai pro novo. Sem ele o painel fica por cima.
  function squeeze(on, w) { const m = document.getElementById('dframe-main') || document.querySelector('main.dframe-content'); if (m) m.style.right = on ? (w + 'px') : ''; }

  function buildDrawer() {
    if (document.getElementById(DRAWER_ID)) return;
    const w = getW();
    drawer = document.createElement('div'); drawer.id = DRAWER_ID;
    Object.assign(drawer.style, {
      position: 'fixed', top: '0', right: '0', bottom: '0', width: w + 'px', display: 'none',
      flexDirection: 'row', background: 'rgb(31,31,30)', borderLeft: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '-8px 0 24px rgba(0,0,0,0.22)', zIndex: '2147483600',
      font: '13px "Anthropic Sans", system-ui, sans-serif'
    });

    // handle de redimensionar (borda esquerda)
    const handle = document.createElement('div');
    Object.assign(handle.style, { flex: '0 0 10px', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '-10px', zIndex: '1' });
    const grip = document.createElement('div');
    Object.assign(grip.style, { width: '4px', height: '42px', borderRadius: '4px', background: '#FFFFFF29', opacity: '0', transition: 'opacity .3s ease' });
    handle.appendChild(grip);
    // grip some por padrao; aparece so no hover da borda ou enquanto arrasta
    let gripHover = false, gripDrag = false;
    const syncGrip = () => { grip.style.opacity = (gripHover || gripDrag) ? '1' : '0'; };
    handle.addEventListener('mouseenter', () => { gripHover = true; syncGrip(); });
    handle.addEventListener('mouseleave', () => { gripHover = false; syncGrip(); });
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); document.body.style.userSelect = 'none';
      gripDrag = true; syncGrip();
      const move = ev => { const nw = Math.min(maxW(), Math.max(MINW, window.innerWidth - ev.clientX)); drawer.style.width = nw + 'px'; squeeze(true, nw); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; setW(parseInt(drawer.style.width, 10)); gripDrag = false; syncGrip(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });

    const col = document.createElement('div');
    Object.assign(col.style, { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0' });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px 18px', color: MUTED, fontSize: '12px', userSelect: 'none', flex: '0 0 auto' });
    const left = document.createElement('div');
    Object.assign(left.style, { display: 'flex', alignItems: 'center', minWidth: '0', flex: '1', overflow: 'hidden', gap: '6px' });
    const lbl = document.createElement('span'); lbl.textContent = 'Notes (v' + VERSION + ')';
    Object.assign(lbl.style, { fontWeight: '600', flex: '0 0 auto', whiteSpace: 'nowrap' });
    // nome do chat: "Notes (vX) · [id] nome". O separador e um span proprio; o gap do container da os 6px dos DOIS lados do ·
    // (espaco no texto nao serve: flex item descarta whitespace inicial e o trailing fica fragil). Nome trunca com reticencias.
    sepEl = document.createElement('span'); sepEl.textContent = '·';
    Object.assign(sepEl.style, { fontWeight: '600', flex: '0 0 auto' });
    nameEl = document.createElement('span');
    Object.assign(nameEl.style, { fontWeight: '600', minWidth: '0', flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    left.appendChild(lbl); left.appendChild(sepEl); left.appendChild(nameEl);

    // toggle "Auto-open" (default on): em sessao abre as notas e esconde a sidebar; na home faz o oposto (sem notas, com sidebar). Estado em A_KEY.
    const auto = document.createElement('button'); auto.type = 'button';
    auto.setAttribute('aria-label', 'Auto-open notes on load'); auto.title = 'Em sessao: abre as notas e esconde a sidebar. Na home: fecha as notas e mostra a sidebar.';
    Object.assign(auto.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '0', color: MUTED, cursor: 'pointer', padding: '0', fontSize: '11px', fontWeight: '600', userSelect: 'none' });
    const autoLbl = document.createElement('span'); autoLbl.textContent = 'Auto-open';
    const track = document.createElement('span');
    Object.assign(track.style, { position: 'relative', width: '26px', height: '15px', borderRadius: '999px', background: 'rgba(255,255,255,0.18)', transition: 'background .2s ease', flex: '0 0 auto' });
    const knob = document.createElement('span');
    Object.assign(knob.style, { position: 'absolute', top: '2px', left: '2px', width: '11px', height: '11px', borderRadius: '50%', background: '#fff', transition: 'transform .2s ease' });
    track.appendChild(knob); auto.appendChild(autoLbl); auto.appendChild(track);
    const syncAuto = () => { const on = getAuto(); track.style.background = on ? ACCENT : 'rgba(255,255,255,0.18)'; knob.style.transform = on ? 'translateX(11px)' : 'translateX(0)'; };
    auto.addEventListener('click', () => { setAuto(!getAuto()); syncAuto(); lastMode = null; sidebarApplied = false; applyMode(); }); // flip aplica na hora
    syncAuto();

    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
    Object.assign(close.style, { background: 'transparent', border: '0', color: MUTED, fontSize: '18px', lineHeight: '1', cursor: 'pointer', padding: '0 4px', borderRadius: '6px' });
    close.addEventListener('mouseenter', () => { close.style.color = BRIGHT; });
    close.addEventListener('mouseleave', () => { close.style.color = MUTED; });
    close.addEventListener('click', () => setOpen(false));

    const right = document.createElement('div');
    Object.assign(right.style, { display: 'flex', alignItems: 'center', gap: '12px', flex: '0 0 auto', marginLeft: '12px' });
    right.appendChild(auto); right.appendChild(close);
    header.appendChild(left); header.appendChild(right);
    syncName();

    editor = document.createElement('div'); editor.id = 'cc-notes-editor';
    // plaintext-only: Enter insere \n literal (NAO cria <div>/<br>), entao innerText nao dobra newline ao salvar
    editor.contentEditable = 'plaintext-only'; editor.spellcheck = false;
    editor.setAttribute('data-ph', 'Markdown notes for this session…');
    Object.assign(editor.style, { flex: '1', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: BRIGHT, padding: '4px 18px 18px 18px', lineHeight: '1.55', outline: 'none' });
    // salva sob currentId (a sessao cuja nota esta carregada no editor), NAO sob sid() fresco: numa troca de sessao
    // a URL pode mudar antes do syncSession recarregar, e sid() apontaria pra nova sessao -> gravaria o texto antigo nela.
    editor.addEventListener('input', () => { const id = currentId; if (!id) return; const val = getText(); clearTimeout(saveT); saveT = setTimeout(() => save(id, val), 300); });
    // ao perder o foco (clicar fora), salva na hora e re-linkifica — sem precisar recolher/reabrir o painel.
    // seguro fora do 'input' pq sem caret nao ha risco de pular cursor / dobrar newline (linkify e round-trip idempotente).
    // so re-renderiza num blur "real" (foco indo pra outro elemento da MESMA pagina, document.hasFocus()===true).
    // se o documento perdeu o foco (troca de aba/janela, hasFocus===false), NAO reescreve o innerHTML -> o caret sobrevive ao voltar,
    // mesmo depois de editar. robusto a intermitencia do tab-switch: se o blur nao disparar, o DOM tambem fica intacto.
    // o linkify do que foi digitado fica pro proximo blur real / troca de sessao. (val !== lastRendered evita re-render redundante.)
    editor.addEventListener('blur', () => { const id = currentId; const val = getText(); if (id) { clearTimeout(saveT); save(id, val); } if (val !== lastRendered && document.hasFocus()) setText(val); });
    // clique num link SEMPRE abre (o editor fica focado por padrao, entao nao da pra exigir "fora de edicao").
    // pra editar o texto de um link, posicione o caret clicando fora dele / pelas setas.
    editor.addEventListener('mousedown', e => {
      const a = e.target.closest && e.target.closest('a'); if (!a) return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) openTab(a.href, true);   // cmd/ctrl+click: abre e FOCA
      else openTab(a.href, false);                          // clique normal: background, sem trocar
    });

    col.appendChild(header); col.appendChild(editor);
    drawer.appendChild(handle); drawer.appendChild(col);
    document.body.appendChild(drawer);
  }

  const isOpen = () => drawer && drawer.style.display !== 'none';
  function syncBtnColor() { if (btnRef) btnRef.style.color = isOpen() ? ACCENT : ICON_REST; }
  function setOpen(open, focus = true) {
    if (!drawer) buildDrawer();
    if (open) { const id = sid(); currentId = id; const w = getW(); drawer.style.width = w + 'px'; setText(id ? loadNote(id) : ''); drawer.style.display = 'flex'; squeeze(true, w); if (focus) editor.focus(); }
    else { drawer.style.display = 'none'; squeeze(false); }
    syncBtnColor();
  }
  const toggle = () => setOpen(!isOpen());

  function makeButton() {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.setAttribute(BTN_MARK, '1'); btn.setAttribute('aria-label', 'Notes'); btn.setAttribute('title', 'Notes (Ctrl+Shift+S)');
    Object.assign(btn.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', padding: '0', border: '0', background: 'transparent', color: ICON_REST, cursor: 'pointer', borderRadius: '6px', flex: '0 0 auto' });
    btn.innerHTML = ICON;
    btn.addEventListener('mouseenter', () => { if (!isOpen()) btn.style.color = ICON_HOVER; });
    btn.addEventListener('mouseleave', () => syncBtnColor());
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
    btnRef = btn;
    return btn;
  }
  function findBar() { const a = document.querySelector('button[aria-label="Share"], button[aria-label="Session actions"], button[aria-label="Diff"]'); return a ? (a.closest('span.epitaxy-titlebar-fade') || a.parentElement) : null; }
  function injectButton() { const bar = findBar(); if (!bar || bar.querySelector('[' + BTN_MARK + ']')) return; bar.insertBefore(makeButton(), bar.firstChild); }
  function syncSession() { const id = sid(); if (id !== currentId) { currentId = id; if (isOpen()) setText(id ? loadNote(id) : ''); } }
  // mostra o nome do chat ao lado do badge (so em sessao); atualiza ao trocar de sessao ou renomear.
  // mostra "· nome" so em sessao; esconde o separador junto (display none tira tambem o gap, sem espaco sobrando depois do badge na home)
  function syncName() {
    if (!nameEl) return;
    const inSession = !!sid();
    const n = inSession ? sessionName() : '';
    // em sessao, ignora leitura vazia transitoria (durante o rename via Ctrl+Shift+R o button.cursor-text vira <input>) -> mantem o ultimo nome, sem piscar
    if (inSession && !n) return;
    if (nameEl.textContent !== n) nameEl.textContent = n;
    const show = n ? '' : 'none';
    if (sepEl && sepEl.style.display !== show) sepEl.style.display = show;
    if (nameEl.style.display !== show) nameEl.style.display = show;
  }

  // Layout por modo (so com Auto-open ligado): sessao => notas abertas + sidebar escondida; home => notas fechadas + sidebar visivel.
  // Notas: aplicadas so na transicao de modo (nao reabre se o usuario fechou na mesma pagina).
  // Sidebar: a flag 'collapsed' do app e global/persistida (dframe-store), entao gerencio nas transicoes via clique no botao do app (passa pelo handler nativo).
  function applyMode() {
    const mode = sid() ? 'session' : 'home';
    if (mode !== lastMode) {
      lastMode = mode; sidebarApplied = false;
      if (getAuto()) {
        if (mode === 'session') { if (!isOpen()) setOpen(true, false); } // sem roubar o foco
        else if (isOpen()) setOpen(false);
      }
    }
    if (getAuto() && !sidebarApplied) {
      const want = mode === 'session';                                    // session => colapsada; home => aberta
      const collapsed = !!document.querySelector('[aria-label="Open sidebar"]');   // botao "Open" so existe quando colapsada
      const expanded = !!document.querySelector('[aria-label="Collapse sidebar"]'); // "Collapse" so quando aberta
      if (!collapsed && !expanded) return;                                // sidebar ainda nao montou; tenta no proximo tick
      if (want === collapsed) { sidebarApplied = true; return; }          // ja esta como queremos
      const btn = document.querySelector(want ? '[aria-label="Collapse sidebar"]' : '[aria-label="Open sidebar"]');
      if (btn) btn.click();                                               // nao marca applied: o proximo tick confirma o novo estado
    }
  }

  function tick() { injectButton(); syncSession(); applyMode(); syncName(); if (isOpen()) squeeze(true, parseInt(drawer.style.width, 10) || getW()); }

  function start() {
    if (!document.body) { setTimeout(start, 50); return; }
    buildDrawer(); tick(); // applyMode (dentro do tick) decide notas+sidebar conforme o modo
    let pend = false;
    const schedule = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; tick(); }, 150); };
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true });
    setInterval(tick, 1000);
    window.addEventListener('resize', () => { if (isOpen()) { const w = Math.min(getW(), window.innerWidth - 40); drawer.style.width = w + 'px'; squeeze(true, w); } });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') { e.preventDefault(); e.stopPropagation(); toggle(); } // e.code (tecla fisica): robusto em layout nao-latino
      // Esc NAO fecha o painel de proposito: o Bruno usa Esc pra outras coisas e nao quer que recolha as notas sem querer.
    }, true);
    ['pushState', 'replaceState'].forEach(m => { const o = history[m]; history[m] = function reassigned(...args) { const r = o.apply(this, args); setTimeout(tick, 60); return r; }; });
    addEventListener('popstate', () => setTimeout(tick, 60));
  }
  start();
})();
