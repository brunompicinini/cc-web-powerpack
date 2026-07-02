// ==UserScript==
// @name         Claude Code Web — Switch Session Hotkey (⌘⌥[ / ⌘⌥]) + Rename (⌃⇧R)
// @namespace    bruno.uptide
// @version      1.9
// @description  Cmd+Alt+[ e Cmd+Alt+] trocam a sessão aberta (anda pra cima/baixo na lista da sidebar), igual o Cmd+Shift+[ / ] do navegador Dia. Funciona mesmo com a sidebar colapsada. Ctrl+Shift+R renomeia a sessão aberta (abre o input do título e seleciona o texto dentro do prefixo [..], sem os colchetes — ou tudo, se não houver tag — pronto pra digitar). Ctrl+Shift+C abre/fecha o painel de uso do plano (Plan usage / limites / créditos). Ctrl+Shift+B abre/fecha o painel Background tasks e Ctrl+Shift+A o painel Artifacts (ambos viraram itens do menu ⋮ Session actions).
// @author       Bruno Picinini
// @match        https://claude.ai/code*
// @run-at       document-start
// @grant        none
// @noframes
// @homepageURL  https://github.com/brunompicinini/cc-web-powerpack
// @supportURL   https://github.com/brunompicinini/cc-web-powerpack/issues
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-switch-hotkey.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-switch-hotkey.user.js
// ==/UserScript==

// Detalhes do DOM do Claude Code Web e as pegadinhas de cada função estão documentados no CLAUDE.md do repo.
(function ccSwitchSessionHotkey() {
  'use strict';
  if (window.ccSwitchLoaded) return;
  window.ccSwitchLoaded = true;

  // Mac-only pros Ctrl+Shift+*: no Win/Linux eles são atalhos do Chrome e o preventDefault em captura não os segura.
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');

  // Sessões na sidebar = div[data-row] que tem um button[data-row-main-button] dentro (itens de menu não têm). Ordem no DOM = visual.
  const sessionRows = () =>
    [...document.querySelectorAll('div[data-row]')].filter(r => r.querySelector('button[data-row-main-button]'));
  // Sessão aberta = linha com [data-selected]; na home nenhuma tem -> -1.
  const currentIdx = rows => rows.findIndex(r => r.hasAttribute('data-selected'));

  // dir +1 (próxima/baixo) | -1 (anterior/cima). Clampa nas pontas. Click no main-button navega (funciona colapsada).
  function go(dir) {
    const rows = sessionRows();
    if (!rows.length) return;
    const cur = currentIdx(rows);
    let t;
    if (cur === -1) t = dir > 0 ? 0 : rows.length - 1;       // home: ] abre a 1ª, [ abre a última
    else { t = cur + dir; if (t < 0 || t >= rows.length) return; }
    const btn = rows[t] && rows[t].querySelector('button[data-row-main-button]');
    if (btn) btn.click();
  }

  // Renomeia: click no título (button.cursor-text) abre o input inline. Se o nome tem tag [..], reposiciona a seleção
  // pro texto DENTRO dos colchetes (Selection API; eventos sintéticos não movem o caret). Input é async -> re-tenta.
  function rename() {
    const title = document.querySelector('button.cursor-text');
    if (!title) return;
    title.click();
    let tries = 12;
    const place = () => {
      const inp = document.activeElement;
      if (inp && inp.tagName === 'INPUT' && typeof inp.selectionStart === 'number') {
        const v = inp.value;
        if (v[0] === '[') { const end = v.indexOf(']'); if (end !== -1) inp.setSelectionRange(1, end); }
      } else if (tries-- > 0) setTimeout(place, 30);
    };
    setTimeout(place, 0);
  }

  // Toggle do painel de uso do plano: botão do canto inferior direito, aria-label começa com "Usage:" (carrega o %).
  function usage() {
    const btn = document.querySelector('button[aria-label^="Usage:"]');
    if (btn) btn.click();
  }

  // Toggle de um painel que virou item do menu ⋮ "Session actions" (Artifacts, Background tasks): abre o menu, clica
  // o item visível pelo texto, fecha o menu (re-clica o trigger). aria-expanded do trigger = estado real do menu.
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
        setTimeout(() => { if (isOpen()) trigger.click(); }, 80);   // menuitemcheckbox do Radix não fecha o menu sozinho
        return;
      }
      if (tries-- > 0) setTimeout(step, 25);
    };
    setTimeout(step, isOpen() ? 0 : 40);
  }

  // e.code (tecla física), não e.key: no Mac Alt+[ vira "“". Captura pra agir antes da página.
  document.addEventListener('keydown', e => {
    if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey) {          // trocar sessão: Cmd+Alt+[ / ]
      if (e.code === 'BracketRight') { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.code === 'BracketLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
      return;
    }
    if (isMac && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey) { // Ctrl+Shift+* (só Mac)
      if (e.code === 'KeyR') { e.preventDefault(); e.stopPropagation(); rename(); }
      else if (e.code === 'KeyC') { e.preventDefault(); e.stopPropagation(); usage(); }
      else if (e.code === 'KeyB') { e.preventDefault(); e.stopPropagation(); togglePanel(/^Background tasks$/i); }
      else if (e.code === 'KeyA') { e.preventDefault(); e.stopPropagation(); togglePanel(/^Artifacts$/i); }
    }
  }, true);
})();
