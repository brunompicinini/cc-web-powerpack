// ==UserScript==
// @name         Claude Code Web — Notepad por sessão
// @namespace    bruno.uptide
// @version      2.10
// @description  Painel lateral de notas por sessão no Claude Code Web (empurra o conteúdo, estilo Diff). Atalho Ctrl+Shift+S, redimensionável, links clicáveis. Nota salva por sessionId no localStorage.
// @author       Bruno Picinini
// @match        https://claude.ai/code*
// @run-at       document-start
// @grant        none
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

  const sid = () => (location.pathname.match(/session_[A-Za-z0-9]+/u) || [])[0] || null;
  const load = id => { try { return localStorage.getItem(KEY + id) || ''; } catch { return ''; } };
  const save = (id, v) => { try { localStorage.setItem(KEY + id, v); } catch { /* ignore */ } };
  const maxW = () => window.innerWidth - 40;
  const getW = () => { const w = parseInt(localStorage.getItem(W_KEY) || DEFW, 10); return Math.min(maxW(), Math.max(MINW, isNaN(w) ? DEFW : w)); };
  const setW = w => { try { localStorage.setItem(W_KEY, String(Math.round(w))); } catch { /* ignore */ } };

  // ícone notebook-pen (Lucide), 13px, herda a cor da barra
  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>';

  // CSS: placeholder + link (se a CSP bloquear <style>, links seguem com estilo inline da linkify)
  const st = document.createElement('style'); st.id = 'cc-notes-style';
  st.textContent = '#cc-notes-editor:empty:before{content:attr(data-ph);color:rgba(255,255,255,0.3);pointer-events:none;}#cc-notes-editor a{color:' + ACCENT + ';text-decoration:underline;cursor:pointer;}#cc-notes-editor:focus{outline:none;}';
  (document.head || document.documentElement).appendChild(st);

  let drawer = null, editor = null, currentId = null, saveT = null, btnRef = null;

  const escHtml = s => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
  // newline fica como \n literal (editor usa white-space: pre-wrap) -> round-trip idempotente
  const linkify = t => escHtml(t || '').replace(/(?<url>https?:\/\/[^\s<]+)/gu, '<a href="$<url>" target="_blank" rel="noopener" style="color:' + ACCENT + ';text-decoration:underline">$<url></a>');
  const getText = () => editor.innerText.replace(/\u00a0/gu, ' ');
  const setText = t => { editor.innerHTML = linkify(t); };
  // abre em aba de FUNDO (nao troca de aba): clique sintetico com modificador num <a>, igual ao cmd/ctrl+click nativo do Chrome.
  // window.open() sempre traz a aba pra frente -> nao serve. anchor "solto" navega mesmo sem estar no DOM.
  const openBg = url => { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, metaKey: true })); };

  function squeeze(on, w) { const m = document.getElementById('dframe-main'); if (m) m.style.right = on ? (w + 'px') : ''; }

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
    const lbl = document.createElement('span'); lbl.textContent = 'Notes'; lbl.style.fontWeight = '600';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×';
    Object.assign(close.style, { background: 'transparent', border: '0', color: MUTED, fontSize: '18px', lineHeight: '1', cursor: 'pointer', padding: '0 4px', borderRadius: '6px' });
    close.addEventListener('mouseenter', () => { close.style.color = BRIGHT; });
    close.addEventListener('mouseleave', () => { close.style.color = MUTED; });
    close.addEventListener('click', () => setOpen(false));
    header.appendChild(lbl); header.appendChild(close);

    editor = document.createElement('div'); editor.id = 'cc-notes-editor';
    // plaintext-only: Enter insere \n literal (NAO cria <div>/<br>), entao innerText nao dobra newline ao salvar
    editor.contentEditable = 'plaintext-only'; editor.spellcheck = false;
    editor.setAttribute('data-ph', 'Markdown notes for this session…');
    Object.assign(editor.style, { flex: '1', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: BRIGHT, padding: '4px 18px 18px 18px', lineHeight: '1.55', outline: 'none' });
    editor.addEventListener('input', () => { const id = sid(); if (!id) return; const val = getText(); clearTimeout(saveT); saveT = setTimeout(() => save(id, val), 300); });
    // ao perder o foco (clicar fora), salva na hora e re-linkifica — sem precisar recolher/reabrir o painel.
    // seguro fora do 'input' pq sem caret nao ha risco de pular cursor / dobrar newline (linkify e round-trip idempotente).
    editor.addEventListener('blur', () => { const id = sid(); const val = getText(); if (id) { clearTimeout(saveT); save(id, val); } setText(val); });
    editor.addEventListener('mousedown', e => {
      const a = e.target.closest && e.target.closest('a'); if (!a) return;
      const editing = document.activeElement === editor || editor.contains(document.activeElement);
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); openBg(a.href); }                      // cmd/ctrl+click: aba de fundo, sem trocar
      else if (!editing) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }       // clique normal fora de edicao: traz pra frente
    });

    col.appendChild(header); col.appendChild(editor);
    drawer.appendChild(handle); drawer.appendChild(col);
    document.body.appendChild(drawer);
  }

  const isOpen = () => drawer && drawer.style.display !== 'none';
  function syncBtnColor() { if (btnRef) btnRef.style.color = isOpen() ? ACCENT : ICON_REST; }
  function setOpen(open) {
    if (!drawer) buildDrawer();
    if (open) { const id = sid(); currentId = id; const w = getW(); drawer.style.width = w + 'px'; setText(id ? load(id) : ''); drawer.style.display = 'flex'; squeeze(true, w); editor.focus(); }
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
  function syncSession() { const id = sid(); if (id !== currentId) { currentId = id; if (isOpen()) setText(id ? load(id) : ''); } }
  function tick() { injectButton(); syncSession(); if (isOpen()) squeeze(true, parseInt(drawer.style.width, 10) || getW()); }

  function start() {
    if (!document.body) { setTimeout(start, 50); return; }
    buildDrawer(); tick();
    let pend = false;
    const schedule = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; tick(); }, 150); };
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true });
    setInterval(tick, 1000);
    window.addEventListener('resize', () => { if (isOpen()) { const w = Math.min(getW(), window.innerWidth - 40); drawer.style.width = w + 'px'; squeeze(true, w); } });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) { e.preventDefault(); e.stopPropagation(); toggle(); }
      else if (e.key === 'Escape' && isOpen()) setOpen(false);
    }, true);
    ['pushState', 'replaceState'].forEach(m => { const o = history[m]; history[m] = function reassigned(...args) { const r = o.apply(this, args); setTimeout(tick, 60); return r; }; });
    addEventListener('popstate', () => setTimeout(tick, 60));
  }
  start();
})();
