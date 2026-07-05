// ==UserScript==
// @name         Claude Code Web — Shortcuts
// @namespace    bruno.uptide
// @version      2.0
// @description  Keyboard shortcuts for Claude Code Web. Ctrl+Shift+[ / Ctrl+Shift+] move between sessions (up/down the sidebar list, even when collapsed) and Ctrl+Shift+S toggles the Session Notepad — these work on every platform. Ctrl+Shift+R renames the open session (selects the leading status token — the text inside [..] brackets, or a leading status emoji — ready to retype), Ctrl+Shift+C toggles the plan-usage panel, Ctrl+Shift+B toggles Background tasks and Ctrl+Shift+A toggles Artifacts (in the ⋮ Session actions menu) — these four are Mac-only, since on Windows/Linux they collide with reserved Chrome shortcuts (reload, DevTools, bookmarks bar, tab search) that a page can't override.
// @author       Bruno Picinini
// @match        https://claude.ai/code*
// @run-at       document-start
// @grant        none
// @noframes
// @homepageURL  https://github.com/brunompicinini/cc-web-powerpack
// @supportURL   https://github.com/brunompicinini/cc-web-powerpack/issues
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-shortcuts.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-shortcuts.user.js
// ==/UserScript==

// Claude Code Web DOM facts and the gotchas of each function are documented in the repo's CLAUDE.md.
(function ccShortcuts() {
  'use strict';
  if (window.ccShortcutsLoaded) return;
  window.ccShortcutsLoaded = true;

  // Mac gate for the combos that collide with a reserved Chrome shortcut on Win/Linux (R=reload, C=DevTools, B=bookmarks
  // bar, A=tab search) — a page's preventDefault can't hold those. The switch keys and notepad toggle aren't bound by
  // Chrome, so they run on every platform.
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');

  // Sessions in the sidebar = div[data-row] that contains a button[data-row-main-button] (menu items don't). DOM order = visual order.
  const sessionRows = () =>
    [...document.querySelectorAll('div[data-row]')].filter(r => r.querySelector('button[data-row-main-button]'));
  // Open session = row with [data-selected]; on home none has it -> -1.
  const currentIdx = rows => rows.findIndex(r => r.hasAttribute('data-selected'));

  // dir +1 (next/down) | -1 (previous/up). Clamps at the ends. Clicking the main-button navigates (works when collapsed).
  function go(dir) {
    const rows = sessionRows();
    if (!rows.length) return;
    const cur = currentIdx(rows);
    let t;
    if (cur === -1) t = dir > 0 ? 0 : rows.length - 1;       // home: ] opens the first, [ opens the last
    else { t = cur + dir; if (t < 0 || t >= rows.length) return; }
    const btn = rows[t] && rows[t].querySelector('button[data-row-main-button]');
    if (btn) btn.click();
  }

  // First grapheme cluster of s (emoji-safe: a colored circle, ZWJ sequence, flag, etc. counts as one).
  function firstGrapheme(s) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      for (const seg of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) return seg.segment;
      return '';
    }
    const m = s.match(/^\p{Extended_Pictographic}/u);   // fallback (Intl.Segmenter missing): just the leading pictographic code point
    return m ? m[0] : (s.match(/^./u) || [''])[0];
  }
  const isEmoji = g => /\p{Extended_Pictographic}/u.test(g);

  // Where to place the selection when the rename input opens, so one keystroke swaps the leading "status" token:
  //  - "[TAG] Rest" -> selects TAG (inside the brackets, without [ ])
  //  - "🟣 Rest"    -> selects the leading status emoji
  //  - otherwise    -> null (keep the full selection the rename opened with)
  function statusRange(v) {
    if (v[0] === '[') { const end = v.indexOf(']'); return end !== -1 ? [1, end] : null; }
    const g = firstGrapheme(v);
    if (g && v[g.length] === ' ' && isEmoji(g)) return [0, g.length];
    return null;
  }

  // Rename: clicking the title (button.cursor-text) opens the inline name input. Then reposition the selection onto the
  // leading status token (Selection API; synthetic key events don't move the caret). The <input> is async (React re-render) -> retry.
  function rename() {
    const title = document.querySelector('button.cursor-text');
    if (!title) return;
    title.click();
    let tries = 12;
    const place = () => {
      const inp = document.activeElement;
      if (inp && inp.tagName === 'INPUT' && typeof inp.selectionStart === 'number') {
        const r = statusRange(inp.value);
        if (r) inp.setSelectionRange(r[0], r[1]);
      } else if (tries-- > 0) setTimeout(place, 30);
    };
    setTimeout(place, 0);
  }

  // Toggle the plan-usage panel: bottom-right button whose aria-label starts with "Usage:" (it carries the %).
  function usage() {
    const btn = document.querySelector('button[aria-label^="Usage:"]');
    if (btn) btn.click();
  }

  // Toggle the Session Notepad panel by clicking the button the notepad userscript injects into the action bar
  // ([data-cc-notes-btn]). Pure DOM, no cross-script event. Only present in a session — where the notepad is used.
  function toggleNotes() {
    const btn = document.querySelector('[data-cc-notes-btn]');
    if (btn) btn.click();
  }

  // Toggle a panel that lives in the ⋮ "Session actions" menu (Artifacts, Background tasks): open the menu, click the
  // visible item by text, then close the menu (re-click the trigger). aria-expanded on the trigger = the real menu state.
  function togglePanel(labelRe) {
    const trigger = document.querySelector('button[aria-label="Session actions"]');
    if (!trigger) return;
    const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';
    const findItem = () => [...document.querySelectorAll('[role="menuitemcheckbox"]')]
      .find(e => e.offsetParent && labelRe.test((e.textContent || '').trim()));
    if (!isOpen()) trigger.click();
    let tries = 25;
    const step = () => {
      const it = findItem();
      if (it) {
        it.click();
        setTimeout(() => { if (isOpen()) trigger.click(); }, 80);   // Radix menuitemcheckbox doesn't close the menu by itself
        return;
      }
      if (tries-- > 0) setTimeout(step, 25);
    };
    setTimeout(step, isOpen() ? 0 : 40);
  }

  // Use e.code (physical key), not e.key: with Shift, "[" / "]" report as "{" / "}". Capture phase to act before the page.
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey)) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    // Not bound by Chrome -> these work on every platform:
    if (e.code === 'BracketRight') { stop(); go(1); return; }        // next session (down)
    if (e.code === 'BracketLeft') { stop(); go(-1); return; }        // previous session (up)
    if (e.code === 'KeyS') { stop(); toggleNotes(); return; }        // toggle the Session Notepad
    // Collide with reserved Chrome shortcuts on Win/Linux (unblockable by a page) -> Mac only:
    if (!isMac) return;
    if (e.code === 'KeyR') { stop(); rename(); }
    else if (e.code === 'KeyC') { stop(); usage(); }
    else if (e.code === 'KeyB') { stop(); togglePanel(/^Background tasks$/i); }
    else if (e.code === 'KeyA') { stop(); togglePanel(/^Artifacts$/i); }
  }, true);
})();
