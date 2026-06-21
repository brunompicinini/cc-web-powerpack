// ==UserScript==
// @name         Claude Code Web — Session Status Favicon + Title
// @namespace    bruno.uptide
// @version      2.4
// @description  Favicon = status da sessão (verde=running, amarelo=awaiting input, azul=ready, roxo=merged), recolorindo o ícone real do Claude. Título da aba = nome da sessão.
// @author       Bruno Picinini
// @match        https://claude.ai/code*
// @run-at       document-start
// @grant        none
// @noframes
// @homepageURL  https://github.com/brunompicinini/cc-web-powerpack
// @supportURL   https://github.com/brunompicinini/cc-web-powerpack/issues
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-status-favicon.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-status-favicon.user.js
// ==/UserScript==

(function () {
  'use strict';

  const onSessionPage = () => /\/code\/session/.test(location.pathname);

  // ============================================================
  // 1) STATUS no FAVICON
  // ============================================================
  const COLORS = { running: '#22c55e', awaiting: '#f5b301', ready: '#4a9eff', merged: '#b796ff' }; // null = mantém o coral original
  const KEY = { 'Running': 'running', 'Awaiting input': 'awaiting', 'Ready': 'ready' };

  const statusEls = () =>
    [...document.querySelectorAll('[data-row] button')].filter(b => b.querySelector('[role="status"]'));
  const norm = s => (s || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  function currentLabel() {
    const btns = statusEls();
    // 1) sessão aberta (marcada na sidebar)
    let row = btns.find(b => b.closest('[data-row]')?.hasAttribute('data-selected'));
    // 2) fallback: casa pelo nome do header (ex.: após reload, quando a linha não vem marcada)
    if (!row) {
      const name = (document.querySelector('button.cursor-text') || {}).textContent;
      if (name) { const n = norm(name); row = btns.find(b => norm(b.textContent) === n); }
    }
    if (!row) return null; // sem sessão aberta / não está na lista => sem status
    const s = row.querySelector('[role="status"]');
    return s ? s.getAttribute('aria-label') : null;
  }

  // Sessão com PR mergeado NÃO tem [role="status"] na linha — o estado vem de um
  // badge [role="img"] cujo aria-label contém "Merged" (ex.: "#21, #4 · Merged").
  // Como não há status, casamos só pela linha selecionada (data-selected).
  function currentMerged() {
    const row = document.querySelector('[data-row][data-selected]');
    if (!row) return false;
    return [...row.querySelectorAll('[role="img"]')]
      .some(i => /\bMerged\b/i.test(i.getAttribute('aria-label') || ''));
  }

  // recolore o ícone real do Claude. Carrega o favicon.ico da própria claude.ai
  // (mesma origem => canvas não "contamina"), desenha no canvas e usa source-in
  // pra trocar a cor mantendo a forma. Cada cor é gerada 1x e fica em cache.
  const cache = {};
  function tint(color) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 64, 64);
        if (color) { x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 64, 64); }
        res(c.toDataURL('image/png'));
      };
      img.onerror = () => res(null);
      img.src = 'https://claude.ai/favicon.ico?cb=statusfav';
    });
  }
  function setFavicon(href) {
    if (!href) return;
    document.querySelectorAll('link[rel~="icon"]:not([data-status-fav]),link[rel="shortcut icon"]:not([data-status-fav])')
      .forEach(l => l.remove());
    let l = document.querySelector('link[data-status-fav]');
    if (!l) {
      l = document.createElement('link');
      l.rel = 'icon'; l.type = 'image/png'; l.setAttribute('data-status-fav', '1');
      document.head.appendChild(l);
    }
    l.href = href;
  }

  let lastKey = null;
  async function applyFavicon() {
    let k;
    if (!onSessionPage()) {
      k = 'default'; // home / lista => ícone original do Claude
    } else {
      const lbl = currentLabel();
      if (lbl) k = KEY[lbl] || 'default';
      else if (currentMerged()) k = 'merged'; // sem status na linha + badge Merged => roxo
      else { if (lastKey) return; k = 'default'; } // sessão ainda carregando: mantém o último
    }
    if (k === lastKey) return;
    lastKey = k;
    if (cache[k] === undefined) cache[k] = await tint(k === 'default' ? null : COLORS[k]);
    setFavicon(cache[k]);
  }

  // ============================================================
  // 2) NOME da sessão no TÍTULO
  // ============================================================
  // O título nativo do app é "Claude Code". Aqui trocamos pelo nome da sessão
  // (o botão editável do topo). O React não fica revertendo, então sem guerra:
  // só re-aplicamos quando o nome muda ou quando o app reseta o título (ex.: navegação).
  function sessionName() {
    const b = document.querySelector('button.cursor-text');
    const n = b && b.textContent.trim();
    return n || null;
  }
  function applyTitle() {
    if (!onSessionPage()) return; // home: deixa o "Claude Code" do app
    const n = sessionName();
    if (n && document.title !== n) document.title = n;
  }

  function applyAll() { applyFavicon(); applyTitle(); }

  // ============================================================
  // disparos: observers escopados + rede de segurança 1s + navegação SPA
  // ============================================================
  let pend = false;
  const schedule = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; applyAll(); }, 120); };
  const mo = new MutationObserver(schedule);
  function start() {
    if (!document.head) return setTimeout(start, 50);
    const aside = document.querySelector('aside.dframe-sidebar');
    if (aside) mo.observe(aside, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'data-selected'] });
    const hdr = document.querySelector('button.cursor-text');
    if (hdr) mo.observe(hdr, { subtree: true, childList: true, characterData: true });
    const titleEl = document.querySelector('title');
    if (titleEl) mo.observe(titleEl, { childList: true, characterData: true });
    setInterval(applyAll, 1000);
    ['pushState', 'replaceState'].forEach(m => {
      const o = history[m];
      history[m] = function () { const r = o.apply(this, arguments); setTimeout(applyAll, 60); return r; };
    });
    addEventListener('popstate', () => setTimeout(applyAll, 60));
    applyAll();
  }
  start();
})();
