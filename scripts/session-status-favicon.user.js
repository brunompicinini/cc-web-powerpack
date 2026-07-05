// ==UserScript==
// @name         Claude Code Web — Session Status Favicon + Title
// @namespace    bruno.uptide
// @version      2.7
// @description  Favicon = session status (green=running, teal=open PR, yellow=awaiting input, blue=ready, purple=merged), recoloring Claude's real icon. Tab title = session name.
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
  // 1) STATUS ON THE FAVICON
  // ============================================================
  const COLORS = { running: '#22c55e', awaiting: '#f5b301', ready: '#4a9eff', merged: '#b796ff', open: '#2dd4bf' }; // null = keep the original coral
  const KEY = { 'Running': 'running', 'Awaiting input': 'awaiting', 'Ready': 'ready' };

  const statusEls = () =>
    [...document.querySelectorAll('[data-row] button')].filter(b => b.querySelector('[role="status"]'));
  const norm = s => (s || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  function currentLabel() {
    const btns = statusEls();
    // 1) open session (marked in the sidebar)
    let row = btns.find(b => b.closest('[data-row]')?.hasAttribute('data-selected'));
    // 2) fallback: match by the header name (e.g. after reload, when the row isn't marked)
    if (!row) {
      const name = (document.querySelector('button.cursor-text') || {}).textContent;
      if (name) { const n = norm(name); row = btns.find(b => norm(b.textContent) === n); }
    }
    if (!row) return null; // no open session / not in the list => no status
    const s = row.querySelector('[role="status"]');
    return s ? s.getAttribute('aria-label') : null;
  }

  // Session with a PR (no live [role="status"] on the row) — the state comes from a separate badge
  // [role="img"] whose aria-label is "#21, #4 · Merged" (merged) or "#861 · Open" (open).
  // Since there's no status, we match only by the selected row (data-selected).
  // Returns 'merged' | 'open' | null (merged wins — in practice they don't coexist).
  function currentPR() {
    const row = document.querySelector('[data-row][data-selected]');
    if (!row) return null;
    const labels = [...row.querySelectorAll('[role="img"]')].map(i => i.getAttribute('aria-label') || '');
    if (labels.some(a => /\bMerged\b/i.test(a))) return 'merged';
    if (labels.some(a => /\bOpen\b/i.test(a))) return 'open';
    return null;
  }

  // recolors Claude's real icon. Loads claude.ai's own favicon.ico
  // (same origin => the canvas doesn't get "tainted"), draws it on a canvas and uses source-in
  // to swap the color while keeping the shape. Each color is generated once and cached.
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
      k = 'default'; // home / list => Claude's original icon
    } else {
      const lbl = currentLabel();
      if (lbl) k = KEY[norm(lbl)] || 'default'; // norm: the aria-label may carry spaces/zero-width chars and break the lookup
      else { const pr = currentPR(); if (pr) k = pr; // no status on the row + PR badge => purple (merged) / teal (open)
             else { if (lastKey) return; k = 'default'; } } // session still loading: keep the last one
    }
    if (k === lastKey) return;
    if (cache[k] === undefined) {
      const data = await tint(k === 'default' ? null : COLORS[k]);
      if (!data) return; // transient failure loading favicon.ico: do NOT cache nor advance lastKey -> retry next tick
      cache[k] = data;
    }
    lastKey = k; // only advance once we have the icon in hand (avoids getting stuck on a key whose tint failed / arrived out of order)
    setFavicon(cache[k]);
  }

  // ============================================================
  // 2) SESSION NAME IN THE TITLE
  // ============================================================
  // The app's native title is "Claude Code". Here we swap it for the session name
  // (the editable button at the top). React doesn't keep reverting it, so no war:
  // we only re-apply when the name changes or when the app resets the title (e.g. navigation).
  function sessionName() {
    const b = document.querySelector('button.cursor-text');
    const n = b && b.textContent.trim();
    return n || null;
  }
  let lastSetTitle = null;
  function applyTitle() {
    if (!onSessionPage()) {
      // home: if the title is still the name WE set (the app didn't reset it), restore the default.
      // only acts when the stale title is exactly ours -> if the app already changed it, no war.
      if (lastSetTitle && document.title === lastSetTitle) { document.title = 'Claude Code'; lastSetTitle = null; }
      return;
    }
    const n = sessionName();
    if (n && document.title !== n) { document.title = n; lastSetTitle = n; }
  }

  function applyAll() { applyFavicon(); applyTitle(); }

  // ============================================================
  // triggers: scoped observers + 1s safety net + SPA navigation
  // ============================================================
  let pend = false;
  const schedule = () => { if (pend) return; pend = true; setTimeout(() => { pend = false; applyAll(); }, 120); };
  const mo = new MutationObserver(schedule);
  // At document-start the sidebar aside and the editable header don't exist yet (React mounts them later), so a single
  // observe() in start() caught nothing and only the 1s poll acted. We bind idempotently and retry on the interval until
  // each node appears. (The header becomes an <input> on rename; re-binding after rename is handled by the poll/title observer.)
  const bound = { aside: false, hdr: false, title: false };
  function bindObservers() {
    if (!bound.aside) { const a = document.querySelector('aside.dframe-sidebar'); if (a) { mo.observe(a, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'data-selected'] }); bound.aside = true; } }
    if (!bound.hdr) { const h = document.querySelector('button.cursor-text'); if (h) { mo.observe(h, { subtree: true, childList: true, characterData: true }); bound.hdr = true; } }
    if (!bound.title) { const t = document.querySelector('title'); if (t) { mo.observe(t, { childList: true, characterData: true }); bound.title = true; } }
  }
  function start() {
    if (!document.head) return setTimeout(start, 50);
    bindObservers();
    setInterval(() => { bindObservers(); applyAll(); }, 1000);
    ['pushState', 'replaceState'].forEach(m => {
      const o = history[m];
      history[m] = function () { const r = o.apply(this, arguments); setTimeout(applyAll, 60); return r; };
    });
    addEventListener('popstate', () => setTimeout(applyAll, 60));
    applyAll();
  }
  start();
})();
