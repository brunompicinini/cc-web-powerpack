// ==UserScript==
// @name         Claude Code Web — Switch Session Hotkey (⌘⌥[ / ⌘⌥])
// @namespace    bruno.uptide
// @version      1.0
// @description  Cmd+Alt+[ e Cmd+Alt+] trocam a sessão aberta (anda pra cima/baixo na lista da sidebar), igual o Cmd+Shift+[ / ] do navegador Dia. Funciona mesmo com a sidebar colapsada.
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

(function ccSwitchSessionHotkey() {
  'use strict';
  if (window.ccSwitchLoaded) return;
  window.ccSwitchLoaded = true;

  // Linhas de sessão na sidebar: a sidebar mistura itens de menu e sessões, ambos com [data-row].
  // - Itens de menu (New session, Routines, Customize, More) são <button data-row> (sem botão interno).
  // - Sessões são <div data-row> com um <button data-row-main-button> dentro (o clicável que navega).
  // Logo, sessões = div[data-row] que tem o main-button. A ordem no DOM = a ordem visual (cruza os grupos
  // Pinned/Desenvolvendo/Ideias/… de cima pra baixo). Navega via .click() no main-button — dispara o router
  // do React e funciona mesmo com a sidebar COLAPSADA (28px): as linhas seguem no DOM e o clique sintético
  // ignora o clipping visual. (Sessões em grupos colapsados/virtualizados que não estejam no DOM ficam fora.)
  const sessionRows = () =>
    [...document.querySelectorAll('div[data-row]')].filter(r => r.querySelector('button[data-row-main-button]'));

  // Âncora = a sessão aberta. A linha aberta carrega o atributo data-selected (valor "focused", às vezes "open").
  // É só uma por vez e acompanha a navegação/route (confirmado no load fresco e após cada troca). Sem sessão
  // aberta (home) nenhuma linha de sessão tem data-selected -> findIndex devolve -1.
  const currentIdx = rows => rows.findIndex(r => r.hasAttribute('data-selected'));

  // dir = +1 (próxima/baixo, ⌘⌥]) | -1 (anterior/cima, ⌘⌥[). Clampa nas pontas (não dá a volta).
  function go(dir) {
    const rows = sessionRows();
    if (!rows.length) return;
    const cur = currentIdx(rows);
    let t;
    if (cur === -1) t = dir > 0 ? 0 : rows.length - 1;       // na home: ] abre a 1ª, [ abre a última
    else { t = cur + dir; if (t < 0 || t >= rows.length) return; } // ponta: não faz nada
    const btn = rows[t] && rows[t].querySelector('button[data-row-main-button]');
    if (btn) btn.click();
  }

  // e.code (tecla física) e não e.key: no Mac, Alt+[ vira "“" e Alt+] vira "‘" — code continua BracketLeft/Right.
  // Captura (true) pra agir antes de qualquer handler da página; exige exatamente Cmd+Alt (sem Ctrl/Shift).
  document.addEventListener('keydown', e => {
    if (!(e.metaKey && e.altKey) || e.ctrlKey || e.shiftKey) return;
    if (e.code === 'BracketRight') { e.preventDefault(); e.stopPropagation(); go(1); }
    else if (e.code === 'BracketLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
  }, true);
})();
