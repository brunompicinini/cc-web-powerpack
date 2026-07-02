// ==UserScript==
// @name         Claude Code Web — Switch Session Hotkey (⌘⌥[ / ⌘⌥]) + Rename (⌃⇧R)
// @namespace    bruno.uptide
// @version      1.8
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

(function ccSwitchSessionHotkey() {
  'use strict';
  if (window.ccSwitchLoaded) return;
  window.ccSwitchLoaded = true;

  // Mac? (navigator.platform e deprecated mas confiavel pra Mac; userAgent de fallback.) Usado pra gatear o rename:
  // no Windows/Linux Ctrl+Shift+R e o hard-reload do navegador e o preventDefault em captura nao o segura.
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent || '');

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

  // Renomeia a sessão aberta. O título no header é o button.cursor-text (mesma fonte que o favicon/notepad usam);
  // clicar nele entra no modo de edição inline (vira um <input> focado, com o nome todo já selecionado, pronto pra
  // digitar). Testado: .click() sintético dispara o handler do React e abre o input. Não existe atalho global nativo
  // pro rename — o "R" que aparece no menu ⋮ é só o acelerador do menu (vale com o menu aberto), não um hotkey global.
  // Se já estiver renomeando (input aberto, button ausente), o querySelector dá null e o `if (title)` simplesmente não faz nada.
  function rename() {
    const title = document.querySelector('button.cursor-text');
    if (!title) return;
    title.click();
    // O rename abre com TODO o nome selecionado. Se o nome tem prefixo de tag (começa com "["), reposiciona a
    // seleção pro TEXTO DENTRO dos colchetes — SEM os "[" "]" (ex.: "[ESPERAR VENDAS]" => seleciona "ESPERAR VENDAS")
    // — pronto pra digitar a tag nova por cima. Sem tag, deixa a seleção total padrão (retoma o nome inteiro).
    // Eventos de teclado sintéticos NÃO movem o caret; usamos a Selection API direto. O <input> aparece async
    // (re-render do React), então re-tenta até ele focar. Testado ao vivo: setSelectionRange sobrevive ao re-render.
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

  // Abre/fecha o painel de uso do plano (Plan usage / 5-hour limit / Weekly / Usage credits). É o botão nativo
  // no canto inferior direito, ao lado de "Opus 4.8"/effort — identificado por aria-label que começa com "Usage:"
  // (o label carrega o %, ex.: "Usage: plan 46%", por isso o prefixo). O .click() é toggle (abre e fecha). Existe
  // tanto na home quanto em sessão, então não precisa de guard de sessão.
  function usage() {
    const btn = document.querySelector('button[aria-label^="Usage:"]');
    if (btn) btn.click();
  }

  // Abre/fecha um painel que virou item do menu "Session actions" (o ⋮ da barra de acoes). Mudanca do app
  // (jul/2026): "Artifacts" e "Background tasks" NAO sao mais botoes diretos da barra — agora sao itens
  // role="menuitemcheckbox" DENTRO desse menu (por isso o antigo lookup por aria-label do botao parou de achar).
  // Fluxo: abre o menu (click no trigger "Session actions"), acha o item VISIVEL pelo texto e clica (o .click()
  // dispara o toggle do painel no React). Depois fecha o menu: o menuitemcheckbox do Radix NAO fecha o menu ao
  // selecionar, entao re-clicamos o trigger se ele seguir expandido.
  // Sinais/pegadinhas descobertos inspecionando ao vivo:
  //  - Estado aberto/fechado = aria-expanded do trigger. Existe um [role="menu"] PERSISTENTE escondido no DOM
  //    (forceMount do Radix), entao checar a existencia do menu enganaria (sempre "aberto"); aria-expanded reflete
  //    o estado visual real.
  //  - O item so fica montado no DOM enquanto o menu esta aberto (desmonta ao fechar), por isso o poll com retry
  //    apos abrir o menu — e o offsetParent no findItem garante pegar o item VISIVEL, nao um residual escondido.
  //  - Escape/click-fora sinteticos NAO fecham o menu do Radix (ele ouve eventos reais do SO); re-clicar o trigger
  //    fecha de forma confiavel.
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
        setTimeout(() => { if (trigger.getAttribute('aria-expanded') === 'true') trigger.click(); }, 80);
        return;
      }
      if (tries-- > 0) setTimeout(step, 25);
    };
    setTimeout(step, isOpen() ? 0 : 40);
  }

  // e.code (tecla física) e não e.key: no Mac, Alt+[ vira "“" e Alt+] vira "‘" — code continua BracketLeft/Right.
  // (Idem Ctrl+Shift+R: e.code === 'KeyR' é robusto.) Captura (true) pra agir antes de qualquer handler da página.
  document.addEventListener('keydown', e => {
    // Trocar sessão: exige exatamente Cmd+Alt (sem Ctrl/Shift).
    if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey) {
      if (e.code === 'BracketRight') { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.code === 'BracketLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
      return;
    }
    // Renomear: Ctrl+Shift+R (sem Cmd/Alt), SÓ no Mac. No Mac o reload nativo é Cmd+Shift+R (Ctrl+Shift+R fica livre);
    // no Windows/Linux Ctrl+Shift+R é o hard-reload e o preventDefault em captura não o segura — então lá não capturamos.
    if (isMac && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyR') {
      e.preventDefault(); e.stopPropagation(); rename();
    }
    // Painel de uso do plano: Ctrl+Shift+C (sem Cmd/Alt), SÓ no Mac. No Win/Linux Ctrl+Shift+C abre o inspetor do
    // DevTools e o preventDefault em captura não o segura — então lá não capturamos (mesmo motivo do rename).
    if (isMac && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyC') {
      e.preventDefault(); e.stopPropagation(); usage();
    }
    // Painel Background tasks: Ctrl+Shift+B (sem Cmd/Alt), SO no Mac. No Win/Linux Ctrl+Shift+B alterna a barra de
    // favoritos do Chrome e o preventDefault em captura nao o segura — entao la nao capturamos (mesmo motivo do rename/usage).
    if (isMac && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyB') {
      e.preventDefault(); e.stopPropagation(); togglePanel(/^Background tasks$/i);
    }
    // Painel Artifacts: Ctrl+Shift+A (sem Cmd/Alt), SO no Mac. No Mac o select-all e Cmd+A (Ctrl+Shift+A fica livre);
    // no Win/Linux Ctrl+Shift+A abre a busca de abas do Chrome e o preventDefault em captura nao o segura — entao la nao capturamos.
    if (isMac && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.code === 'KeyA') {
      e.preventDefault(); e.stopPropagation(); togglePanel(/^Artifacts$/i);
    }
  }, true);
})();
