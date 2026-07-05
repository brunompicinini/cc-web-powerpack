// ==UserScript==
// @name         Claude Code Web — Session Notepad
// @namespace    bruno.uptide
// @version      2.29
// @description  Per-session notes side panel for Claude Code Web (floating panel with its own background and rounded corners, like the native panels; slide-in with the SAME framer-motion spring as the app, measured frame by frame). Toggle shortcut Ctrl+S (Mac) / Alt+S (Windows), defined in session-shortcuts.user.js; resizable, clickable links. Note saved per sessionId in localStorage.
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

// Claude Code Web DOM facts and the gotchas of each part are documented in the repo's CLAUDE.md.
(function ccNotesUserscript() {
  'use strict';
  if (window.ccNotesLoaded) return;
  window.ccNotesLoaded = true;

  const BTN_MARK = 'data-cc-notes-btn';
  const DRAWER_ID = 'cc-notes-drawer';
  const KEY = 'cc-notes:', W_KEY = 'cc-notes:w';
  const ICON_REST = 'rgba(255,255,255,0.7)', ICON_HOVER = 'rgba(255,255,255,1)';
  const MUTED = 'rgba(255,255,255,0.55)', BRIGHT = 'hsl(60 14% 97%)';
  const ACCENT = '#0099ff'; // blue of the active button + links (same as Claude Code Web)
  const MINW = 300, DEFW = 750; // default width 750px; no fixed cap (only the window limits it)
  // Floating panel like the native ones (Background tasks etc.): elevated background, 8px corners, EDGE inset from the edges.
  // RESERVE=8 (measured) keeps the action bar 12px from the panel, like the native one. Details in CLAUDE.md.
  const PANEL_BG = 'rgb(38,38,38)', RADIUS = 8, EDGE = 9, RESERVE = 8;
  // Slide: the SAME framer-motion spring as the native panels, measured frame by frame and reproduced with a linear() easing
  // (~300ms; enter and exit identical — the native one is symmetric). Measured points and the why in CLAUDE.md.
  const SPRING_MS = 300;
  const SPRING = 'linear(0, 0.074 5.4%, 0.192 10.7%, 0.359 16.4%, 0.471 19.1%, 0.576 21.8%, 0.665 24.8%, 0.741 27.5%, 0.79 30.2%, 0.857 35.9%, 0.896 41.6%, 0.925 47%, 0.943 52.7%, 0.965 61.1%, 0.976 66.4%, 0.986 74.8%, 0.994 86.2%, 1 100%)';
  const SPRING_TR = 'transform ' + SPRING_MS + 'ms ' + SPRING;
  const HIDDEN_TX = 'translateX(calc(100% + 24px))'; // off-screen to the right (the +24 covers the 9px inset + the handle)

  // default template for new notes (session with no saved note yet) — shown, saved only once the user edits
  const TEMPLATE = '# STATUS\n\n\n# PRs\n\n\n# CLICKUP\n\n\n# LINKS\n\n\n# NOTES';
  const sid = () => (location.pathname.match(/session_[A-Za-z0-9]+/u) || [])[0] || null;
  const load = id => { try { return localStorage.getItem(KEY + id) || ''; } catch { return ''; } };
  const loadNote = id => load(id) || TEMPLATE; // the session's note, or the default template if empty
  const save = (id, v) => { try { localStorage.setItem(KEY + id, v); } catch { /* ignore */ } };
  const maxW = () => window.innerWidth - 40;
  const getW = () => { const w = parseInt(localStorage.getItem(W_KEY) || DEFW, 10); return Math.min(maxW(), Math.max(MINW, isNaN(w) ? DEFW : w)); };
  const setW = w => { try { localStorage.setItem(W_KEY, String(Math.round(w))); } catch { /* ignore */ } };
  // autostart: opens the panel by itself on page load. Default = on (only off if the user stores '0').
  const A_KEY = 'cc-notes:autostart';
  const getAuto = () => { try { return localStorage.getItem(A_KEY) !== '0'; } catch { return true; } };
  const setAuto = on => { try { localStorage.setItem(A_KEY, on ? '1' : '0'); } catch { /* ignore */ } };

  // notebook-pen icon (Lucide), 13px, inherits the bar's color
  const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>';

  // CSS: placeholder + link (if the CSP blocks <style>, links still get inline styling from linkify)
  const st = document.createElement('style'); st.id = 'cc-notes-style';
  st.textContent = '#cc-notes-editor:empty:before{content:attr(data-ph);color:rgba(255,255,255,0.3);pointer-events:none;}#cc-notes-editor a{color:' + ACCENT + ';text-decoration:underline;cursor:pointer;}#cc-notes-editor:focus{outline:none;}';
  (document.head || document.documentElement).appendChild(st);

  let drawer = null, col = null, editor = null, currentId = null, saveT = null, btnRef = null, nameEl = null, sepEl = null;
  let openState = false, closeT = null; // logical panel state (independent of display: robust during the exit slide)
  let lastRendered = null; // last text rendered in the editor; blur only re-renders if it changed (preserves the caret when switching tabs without editing)
  let lastMode = null, sidebarApplied = false; // per-mode layout control (session vs home)

  const escHtml = s => s.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  // linkify: the URL comes escaped by escHtml; strips trailing punctuation that isn't part of the link (e.g. "(url)." -> "url" + ").").
  // The set excludes ';' so it doesn't cut entities (&amp; etc). Idempotent round-trip (that's why it's safe to run on blur).
  const linkify = t => escHtml(t || '').replace(/https?:\/\/[^\s<]+/gu, m => {
    const u = m.replace(/[.,!?)\]}]+$/u, ''), tail = m.slice(u.length);
    return '<a href="' + u + '" target="_blank" rel="noopener" style="color:' + ACCENT + ';text-decoration:underline">' + u + '</a>' + tail;
  });
  const getText = () => editor.innerText.replace(/\u00a0/gu, ' ');
  const setText = t => { editor.innerHTML = linkify(t); lastRendered = t; };
  // current version read from Tampermonkey (GM_info), with a fallback if unavailable.
  const VERSION = (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '2.20';
  // opens a link in a new tab. active=false => background; active=true => focus. GM_openInTab is the reliable way to
  // background (a synthetic modifier click does NOT work — tested). That's why the @grant GM_openInTab.
  const openTab = (url, active) => { if (typeof GM_openInTab === 'function') GM_openInTab(url, { active, insert: true, setParent: true }); else window.open(url, '_blank', 'noopener'); };
  // chat name = Claude's editable header (button.cursor-text), includes the [id] prefix. Same source the favicon script uses.
  const sessionName = () => { const b = document.querySelector('button.cursor-text'); return b ? (b.textContent || '').trim() : ''; };

  // Pushes main to open room for the panel (style.right). Tries the old id #dframe-main and falls back to <main.dframe-content>.
  // Reserves w + RESERVE (keeps the bar 12px from the panel — see the constants / CLAUDE.md).
  function squeeze(on, w) { const m = document.getElementById('dframe-main') || document.querySelector('main.dframe-content'); if (m) m.style.right = on ? (w + RESERVE + 'px') : ''; }

  function buildDrawer() {
    if (document.getElementById(DRAWER_ID)) return;
    const w = getW();
    drawer = document.createElement('div'); drawer.id = DRAWER_ID;
    // container only positions/animates (transparent): the visible "card" (elevated bg + corners) is col. EDGE px inset from the edges.
    Object.assign(drawer.style, {
      position: 'fixed', top: EDGE + 'px', right: EDGE + 'px', bottom: EDGE + 'px', width: w + 'px', display: 'none',
      flexDirection: 'row', background: 'transparent', zIndex: '2147483600', willChange: 'transform',
      font: '13px "Anthropic Sans", system-ui, sans-serif'
    });

    // resize handle (left edge)
    const handle = document.createElement('div');
    Object.assign(handle.style, { flex: '0 0 10px', cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '-10px', zIndex: '1' });
    const grip = document.createElement('div');
    Object.assign(grip.style, { width: '4px', height: '42px', borderRadius: '4px', background: '#FFFFFF29', opacity: '0', transition: 'opacity .3s ease' });
    handle.appendChild(grip);
    // grip hidden by default; shows only on edge hover or while dragging
    let gripHover = false, gripDrag = false;
    const syncGrip = () => { grip.style.opacity = (gripHover || gripDrag) ? '1' : '0'; };
    handle.addEventListener('mouseenter', () => { gripHover = true; syncGrip(); });
    handle.addEventListener('mouseleave', () => { gripHover = false; syncGrip(); });
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); document.body.style.userSelect = 'none';
      gripDrag = true; syncGrip();
      const move = ev => { const nw = Math.min(maxW(), Math.max(MINW, window.innerWidth - EDGE - ev.clientX)); drawer.style.width = nw + 'px'; squeeze(true, nw); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.userSelect = ''; setW(parseInt(drawer.style.width, 10)); gripDrag = false; syncGrip(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });

    col = document.createElement('div');
    // the visible card: elevated bg + rounded corners + overflow hidden (clips the editor at the corners). The handle stays OUTSIDE col.
    Object.assign(col.style, { flex: '1', display: 'flex', flexDirection: 'column', minWidth: '0', background: PANEL_BG, borderRadius: RADIUS + 'px', overflow: 'hidden' });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 10px 18px', color: MUTED, fontSize: '12px', userSelect: 'none', flex: '0 0 auto' });
    const left = document.createElement('div');
    Object.assign(left.style, { display: 'flex', alignItems: 'center', minWidth: '0', flex: '1', overflow: 'hidden', gap: '6px' });
    const lbl = document.createElement('span'); lbl.textContent = 'Notes (v' + VERSION + ')';
    Object.assign(lbl.style, { fontWeight: '600', flex: '0 0 auto', whiteSpace: 'nowrap' });
    // chat name: "Notes (vX) · name". The · is its own span; the container's gap:6px gives the space on both sides. Name truncates.
    sepEl = document.createElement('span'); sepEl.textContent = '·';
    Object.assign(sepEl.style, { fontWeight: '600', flex: '0 0 auto' });
    nameEl = document.createElement('span');
    Object.assign(nameEl.style, { fontWeight: '600', minWidth: '0', flex: '0 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    left.appendChild(lbl); left.appendChild(sepEl); left.appendChild(nameEl);

    // "Auto-open" toggle (default on): in a session it opens the notes and hides the sidebar; on home it does the opposite (no notes, with sidebar). State in A_KEY.
    const auto = document.createElement('button'); auto.type = 'button';
    auto.setAttribute('aria-label', 'Auto-open notes on load'); auto.title = 'In a session: opens the notes and hides the sidebar. On home: closes the notes and shows the sidebar.';
    Object.assign(auto.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '0', color: MUTED, cursor: 'pointer', padding: '0', fontSize: '11px', fontWeight: '600', userSelect: 'none' });
    const autoLbl = document.createElement('span'); autoLbl.textContent = 'Auto-open';
    const track = document.createElement('span');
    Object.assign(track.style, { position: 'relative', width: '26px', height: '15px', borderRadius: '999px', background: 'rgba(255,255,255,0.18)', transition: 'background .2s ease', flex: '0 0 auto' });
    const knob = document.createElement('span');
    Object.assign(knob.style, { position: 'absolute', top: '2px', left: '2px', width: '11px', height: '11px', borderRadius: '50%', background: '#fff', transition: 'transform .2s ease' });
    track.appendChild(knob); auto.appendChild(autoLbl); auto.appendChild(track);
    const syncAuto = () => { const on = getAuto(); track.style.background = on ? ACCENT : 'rgba(255,255,255,0.18)'; knob.style.transform = on ? 'translateX(11px)' : 'translateX(0)'; };
    auto.addEventListener('click', () => { setAuto(!getAuto()); syncAuto(); lastMode = null; sidebarApplied = false; applyMode(); }); // flip applies immediately
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
    // plaintext-only: Enter inserts a literal \n (does NOT create <div>/<br>), so innerText doesn't double newlines when saving
    editor.contentEditable = 'plaintext-only'; editor.spellcheck = false;
    editor.setAttribute('data-ph', 'Markdown notes for this session…');
    Object.assign(editor.style, { flex: '1', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: BRIGHT, padding: '4px 18px 18px 18px', lineHeight: '1.55', outline: 'none' });
    // saves under currentId (the session loaded in the editor), NOT a fresh sid(): on a switch the URL changes first and it'd save to the wrong session.
    editor.addEventListener('input', () => { const id = currentId; if (!id) return; const val = getText(); clearTimeout(saveT); saveT = setTimeout(() => save(id, val), 300); });
    // blur: saves immediately and re-linkifies. Only re-renders on a "real" blur (focus on the SAME page, document.hasFocus()===true);
    // if the doc lost focus (tab switch), does NOT rewrite the innerHTML -> the caret survives on return. Details in CLAUDE.md.
    editor.addEventListener('blur', () => { const id = currentId; const val = getText(); if (id) { clearTimeout(saveT); save(id, val); } if (val !== lastRendered && document.hasFocus()) setText(val); });
    // a click on a link ALWAYS opens it (the editor is focused by default). To edit a link's text, place the caret outside it.
    editor.addEventListener('mousedown', e => {
      const a = e.target.closest && e.target.closest('a'); if (!a) return;
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) openTab(a.href, true);   // cmd/ctrl+click: opens and FOCUSES
      else openTab(a.href, false);                          // normal click: background, no switch
    });

    col.appendChild(header); col.appendChild(editor);
    drawer.appendChild(handle); drawer.appendChild(col);
    document.body.appendChild(drawer);
  }

  // isOpen uses the logical state (openState), not display: on close, display only becomes 'none' when the exit slide finishes.
  const isOpen = () => openState;
  function syncBtnColor() { if (btnRef) btnRef.style.color = isOpen() ? ACCENT : ICON_REST; }
  function setOpen(open, focus = true) {
    if (!drawer) buildDrawer();
    if (open) {
      clearTimeout(closeT); openState = true;
      const id = sid(); currentId = id; const w = getW();
      drawer.style.width = w + 'px'; setText(id ? loadNote(id) : ''); squeeze(true, w);
      // slide-in: starts off-screen (to the right) without animating, forces reflow, and slides into place with the native spring.
      drawer.style.transition = 'none'; drawer.style.transform = HIDDEN_TX; drawer.style.display = 'flex';
      void drawer.offsetWidth;
      drawer.style.transition = SPRING_TR; drawer.style.transform = 'translateX(0)';
      if (focus) editor.focus();
    } else {
      openState = false;
      // slide-out: the content comes back right away (squeeze off) and the panel slides out ON TOP (reveals the content, no "jump").
      squeeze(false);
      drawer.style.transition = SPRING_TR; drawer.style.transform = HIDDEN_TX;
      clearTimeout(closeT); closeT = setTimeout(() => { drawer.style.display = 'none'; }, SPRING_MS + 60);
    }
    syncBtnColor();
  }
  const toggle = () => setOpen(!isOpen());

  function makeButton() {
    const btn = document.createElement('button'); btn.type = 'button';
    const scMod = /Mac/i.test(navigator.platform || navigator.userAgent || '') ? 'Ctrl' : 'Alt';  // shortcut modifier (matches session-shortcuts.user.js)
    btn.setAttribute(BTN_MARK, '1'); btn.setAttribute('aria-label', 'Notes'); btn.setAttribute('title', 'Notes (' + scMod + '+S)');
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
  // shows the chat's "· name" only in a session (updates on switch/rename); hides the separator too (removes the gap on home).
  function syncName() {
    if (!nameEl) return;
    const inSession = !!sid();
    const n = inSession ? sessionName() : '';
    // ignores a transient empty read in a session (on rename the button.cursor-text becomes an <input>) -> keeps the last name, no flicker
    if (inSession && !n) return;
    if (nameEl.textContent !== n) nameEl.textContent = n;
    const show = n ? '' : 'none';
    if (sepEl && sepEl.style.display !== show) sepEl.style.display = show;
    if (nameEl.style.display !== show) nameEl.style.display = show;
  }

  // Per-mode layout (only when Auto-open is on): session => notes open + sidebar hidden; home => the opposite.
  // Notes only act on the mode transition. Sidebar: the 'collapsed' flag is global (dframe-store), managed via a click on the native button. Details in CLAUDE.md.
  function applyMode() {
    const mode = sid() ? 'session' : 'home';
    if (mode !== lastMode) {
      lastMode = mode; sidebarApplied = false;
      if (getAuto()) {
        if (mode === 'session') { if (!isOpen()) setOpen(true, false); } // without stealing focus
        else if (isOpen()) setOpen(false);
      }
    }
    if (getAuto() && !sidebarApplied) {
      const want = mode === 'session';                                    // session => collapsed; home => open
      const collapsed = !!document.querySelector('[aria-label="Open sidebar"]');   // the "Open" button only exists when collapsed
      const expanded = !!document.querySelector('[aria-label="Collapse sidebar"]'); // "Collapse" only when open
      if (!collapsed && !expanded) return;                                // sidebar not mounted yet; try next tick
      if (want === collapsed) { sidebarApplied = true; return; }          // already how we want it
      const btn = document.querySelector(want ? '[aria-label="Collapse sidebar"]' : '[aria-label="Open sidebar"]');
      if (btn) btn.click();                                               // doesn't mark applied: the next tick confirms the new state
    }
  }

  function tick() { injectButton(); syncSession(); applyMode(); syncName(); if (isOpen()) squeeze(true, parseInt(drawer.style.width, 10) || getW()); }

  function start() {
    if (!document.body) { setTimeout(start, 50); return; }
    buildDrawer(); tick(); // applyMode (inside tick) decides notes+sidebar according to the mode
    let pend = false;
    const schedule = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; tick(); }, 150); };
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true });
    setInterval(tick, 1000);
    window.addEventListener('resize', () => { if (isOpen()) { const w = Math.min(getW(), window.innerWidth - 40); drawer.style.width = w + 'px'; squeeze(true, w); } });
    // The toggle shortcut (Ctrl+S on Mac / Alt+S on Windows) lives in session-shortcuts.user.js now — it clicks this
    // panel's injected button ([data-cc-notes-btn]). Esc intentionally does NOT close the panel (Bruno uses Esc for other things).
    ['pushState', 'replaceState'].forEach(m => { const o = history[m]; history[m] = function reassigned(...args) { const r = o.apply(this, args); setTimeout(tick, 60); return r; }; });
    addEventListener('popstate', () => setTimeout(tick, 60));
  }
  start();
})();
