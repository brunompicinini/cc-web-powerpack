// ==UserScript==
// @name         Claude Code Web — Shortcuts
// @namespace    bruno.uptide
// @version      2.3
// @description  Keyboard shortcuts for Claude Code Web. The modifier is Ctrl on Mac and Alt on Windows/Linux (each is the one the browser leaves free — Mac Chrome uses Cmd, Windows Chrome uses Ctrl). Mod+[ / Mod+] move between sessions (up/down the sidebar list, even when collapsed), Mod+S toggles the Session Notepad, Mod+R renames the open session (selects the leading status token — the text inside [..] brackets, or a leading status emoji — ready to retype), Mod+C toggles plan usage, Mod+D toggles the Diff, Mod+B toggles Background tasks and Mod+A toggles Artifacts (in the ⋮ Session actions menu). All eight work on both platforms. Separately, Ctrl+\ toggles the native sidebar on every platform. Note: on Mac, Ctrl+A / Ctrl+B / Ctrl+D shadow the system text-editing keys (line start / back one char / delete forward).
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

  // Modifier per platform: Ctrl on Mac (the browser owns Cmd, so plain Ctrl is free), Alt on Windows/Linux (the browser
  // owns Ctrl there — Ctrl+Shift+letter collides with reserved combos a page can't override: reload, DevTools, bookmarks
  // bar, tab search — while Alt+key is free). Can't use Alt on Mac: Option(Alt)+letter types special chars (é, ø).
  // Caveat: on Mac, Ctrl+A / Ctrl+B / Ctrl+D shadow the macOS text-editing bindings (line start / back one char / delete
  // forward); the handler has no focus guard (rename/switch must work from anywhere), so that trade lands even while typing. See CLAUDE.md.
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

  // Toggle the Diff view: the action-bar "Diff" button (the same one the app opens with its native Ctrl+Shift+D).
  function diff() {
    const btn = document.querySelector('button[aria-label="Diff"]');
    if (btn) btn.click();
  }

  // Toggle the Session Notepad panel by clicking the button the notepad userscript injects into the action bar
  // ([data-cc-notes-btn]). Pure DOM, no cross-script event. Only present in a session — where the notepad is used.
  function toggleNotes() {
    const btn = document.querySelector('[data-cc-notes-btn]');
    if (btn) btn.click();
  }

  // Toggle the native sidebar (open/collapse). The app renders exactly one of these buttons at a time:
  // [aria-label="Collapse sidebar"] when it's open, [aria-label="Open sidebar"] when collapsed. Click whichever exists.
  function toggleSidebar() {
    const btn = document.querySelector('[aria-label="Collapse sidebar"], [aria-label="Open sidebar"]');
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

  // Require the platform modifier and no others. On Win/Linux we require !ctrl too, because AltGr (the right Alt on
  // international layouts) reports as Ctrl+Alt — without that guard AltGr+letter would fire a shortcut mid-typing.
  // Use e.code (physical key), not e.key: with Alt/Shift the printed char changes but the code doesn't. Capture phase to act first.
  document.addEventListener('keydown', e => {
    // Sidebar toggle: Ctrl+\ on every platform (Bruno's muscle memory; on Win/Linux it also mirrors native Ctrl+B). \ isn't
    // a reserved Chrome combo nor a default macOS/Windows system shortcut, so the page can intercept it. On Mac this shares
    // the Mod family's plain-Ctrl modifier, but this check runs first and only matches the Backslash key, so it never
    // collides with the Mod letters/brackets. Match e.code OR e.key so it fires on any keyboard layout.
    const sidebarMod = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (sidebarMod && (e.code === 'Backslash' || e.key === '\\')) {
      e.preventDefault(); e.stopPropagation(); toggleSidebar(); return;
    }

    const mod = isMac
      ? (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey)
      : (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey);
    if (!mod) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.code) {
      case 'BracketRight': stop(); go(1); break;                       // next session (down)
      case 'BracketLeft':  stop(); go(-1); break;                      // previous session (up)
      case 'KeyS': stop(); toggleNotes(); break;                       // toggle the Session Notepad
      case 'KeyR': stop(); rename(); break;                            // rename the open session
      case 'KeyC': stop(); usage(); break;                             // toggle plan usage
      case 'KeyD': stop(); diff(); break;                              // toggle the Diff view
      case 'KeyB': stop(); togglePanel(/^Background tasks$/i); break;  // toggle Background tasks
      case 'KeyA': stop(); togglePanel(/^Artifacts$/i); break;         // toggle Artifacts
    }
  }, true);
})();
