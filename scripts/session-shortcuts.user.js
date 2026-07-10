// ==UserScript==
// @name         Claude Code Web — Shortcuts
// @namespace    bruno.uptide
// @version      2.5
// @description  Keyboard shortcuts for Claude Code Web. The modifier is Ctrl on Mac and Alt on Windows/Linux (each is the one the browser leaves free — Mac Chrome uses Cmd, Windows Chrome uses Ctrl). Mod+[ / Mod+] move between sessions (up/down the sidebar list, even when collapsed), Mod+S toggles the Session Notepad, Mod+R renames the open session (selects the leading status token — the text inside [..] brackets, or a leading status emoji — ready to retype), Mod+C toggles plan usage, Mod+D toggles the Diff, Mod+B toggles Background tasks, Mod+A toggles Artifacts (in the ⋮ Session actions menu), and Mod+V quotes the current text selection into the prompt box (drops to a new ☝️ line with the caret ready to reply). All nine work on both platforms. Separately, Ctrl+\ toggles the native sidebar on every platform. Note: on Mac, Ctrl+A / Ctrl+B / Ctrl+D / Ctrl+V shadow the system text-editing keys (line start / back one char / delete forward / page down).
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

// Claude Code Web DOM facts (selectors, aria-labels, roles) and per-function gotchas are documented inline at each function below.
(function ccShortcuts() {
  'use strict';
  if (window.ccShortcutsLoaded) return;
  window.ccShortcutsLoaded = true;

  // Modifier per platform: Ctrl on Mac (browser owns Cmd), Alt on Win/Linux (browser owns Ctrl). Not Alt on Mac: Option+letter types é/ø.
  // Caveat: on Mac Ctrl+A/B/D/V shadow the system text-editing keys (line start / back char / delete forward / page down); no focus guard. Accepted.
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');

  // Sessions in the sidebar = div[data-row] that contains a button[data-row-main-button] (menu items don't). DOM order = visual order.
  const sessionRows = () =>
    [...document.querySelectorAll('div[data-row]')].filter(r => r.querySelector('button[data-row-main-button]'));
  // Open session = the one row with [data-selected] (value "focused"/"open"), follows the route; on home none has it -> -1.
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

  // Selection placement when the rename input opens, so one keystroke swaps the leading status token:
  // "[TAG] Rest" -> TAG; "🟣 Rest" -> the emoji (gated on a trailing space so a normal first word/letter doesn't misfire); else null (keep full selection).
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

  // Artifacts/Background tasks are items of the ⋮ "Session actions" menu (jul/2026: were action-bar buttons, now role="menuitemcheckbox").
  // Open menu -> click the visible item -> close. Radix forceMounts a hidden [role=menu], so use the trigger's aria-expanded, not the menu's existence.
  function togglePanel(labelRe) {
    const trigger = document.querySelector('button[aria-label="Session actions"]');
    if (!trigger) return;
    const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';
    // The item is only mounted while the menu is open (unmounts on close) -> poll after opening; offsetParent picks the visible one, not a hidden residual.
    const findItem = () => [...document.querySelectorAll('[role="menuitemcheckbox"]')]
      .find(e => e.offsetParent && labelRe.test((e.textContent || '').trim()));
    if (!isOpen()) trigger.click();
    let tries = 25;
    const step = () => {
      const it = findItem();
      if (it) {
        it.click();
        setTimeout(() => { if (isOpen()) trigger.click(); }, 80);   // menuitemcheckbox doesn't self-close; Radix ignores synthetic Escape/click-outside, so re-clicking the trigger is the only reliable close
        return;
      }
      if (tries-- > 0) setTimeout(step, 25);
    };
    setTimeout(step, isOpen() ? 0 : 40);
  }

  // Quote-to-comment: page text selection -> prompt box + "\n☝️ ", caret ready to reply. No-op if none; read selection BEFORE focus (focus clears it).
  // TipTap/ProseMirror ignores textContent/innerHTML writes; only ingests text via a synthetic paste (ClipboardEvent + DataTransfer text/plain).
  function quoteToPrompt() {
    const quote = (window.getSelection() ? window.getSelection().toString() : '').trim();
    if (!quote) return;
    const pm = document.querySelector('.epitaxy-prompt-input .ProseMirror') || document.querySelector('.tiptap.ProseMirror');
    if (!pm) return;
    pm.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r = document.createRange(); r.selectNodeContents(pm); r.collapse(false); sel.addRange(r);   // caret to end
    const prefix = pm.textContent.trim() ? '\n' : '';                                                 // don't glue onto an existing draft
    const dt = new DataTransfer();
    // ProseMirror turns each \n into a new paragraph (tight, no blank line; \n\n would add one). ☝️ = U+261D + U+FE0F - keep the FE0F or it renders as a black text glyph.
    dt.setData('text/plain', prefix + quote + '\n☝️ ');
    pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }

  // Require the platform modifier and no others (Win/Linux also needs !ctrl: AltGr reports as Ctrl+Alt, would fire mid-typing).
  // Use e.code (physical key), not e.key (Shift turns [ ] into { }). Capture phase to act first.
  document.addEventListener('keydown', e => {
    // Sidebar toggle: Ctrl+\ everywhere. Runs before the Mod gate; matches only Backslash, so no clash with Mod keys.
    // !alt keeps AltGr (Ctrl+Alt on intl layouts) from firing while typing \; e.key === '\\' fallback = layout-independent (e.g. ABNT2).
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
      case 'KeyV': stop(); quoteToPrompt(); break;                     // quote the selection into the prompt box + ☝️
    }
  }, true);
})();
