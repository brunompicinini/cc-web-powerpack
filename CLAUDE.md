# CLAUDE.md — cc-web-powerpack

Userscripts (Tampermonkey) que melhoram o **Claude Code Web** (`claude.ai/code`).
Repo público: `brunompicinini/cc-web-powerpack`, branch default `main`.

## Fluxo de trabalho (publicar uma atualização)
- **Edite no clone local canônico**, não em cópias soltas: `~/Documents/GitHub/cc-web-powerpack` (a antiga pasta "Web Empire" está aposentada).
- Edite o `.user.js` → **suba o `@version`** → `git commit` + `git push` na `main`.
- O Tampermonkey puxa de `raw.../main/...` no auto‑update (checa 1x/dia). Pra testar na hora: reinstale pela raw com cache‑buster `?cb=N`.

## Estrutura
- `scripts/*.user.js` — um userscript por arquivo (nome do arquivo termina em `.user.js`).
- `README.md` — instalação (Tampermonkey + toggle "Allow User Scripts" do Chrome 138+) e auto‑update.
- `CLAUDE.md` — este arquivo.

## Convenções
- Cada script tem cabeçalho `// ==UserScript== ... ==/UserScript==`.
- `@match https://claude.ai/code*`, `@run-at document-start`. `@grant`: favicon usa `none`; **notepad usa `GM_openInTab`** (pra abrir link em aba de background de forma confiável — ver abaixo). Com `@grant` != none o script roda no sandbox do Tampermonkey (DOM/`history`/`location`/`localStorage` continuam reais; só não enxerga vars JS da página).
- **Auto‑update:** `@downloadURL` e `@updateURL` apontam para a raw de `main`:
  `https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/<arquivo>.user.js`
- **Toda mudança publicada exige subir o `@version`** — é o gatilho do auto‑update do Tampermonkey.
- Filename e a parte final das URLs raw têm que bater (senão o auto‑update quebra).
- Cuidado com caracteres invisíveis usados de propósito nos regex (zero-width `​-‍﻿` no favicon; nbsp ` ` no notepad). Não "limpar" sem querer.

## scripts/session-status-favicon.user.js
Recolore o favicon real do Claude conforme o status da sessão aberta e troca o título da aba pelo nome da sessão.

Fatos do DOM do Claude Code Web (descobertos inspecionando a página) que o script depende:
- A lista de sessões fica em `aside.dframe-sidebar`; cada linha é um `[data-row]`; a aberta tem `[data-selected]`.
- **Status vivo** vem de um `[role="status"]` dentro da linha, no `aria-label`: `Running` / `Awaiting input` / `Ready`.
- **Merged**: uma sessão de PR mergeado **não tem `[role="status"]`** na linha. O estado vem de um badge separado `[role="img"]` cujo `aria-label` contém `Merged` (ex.: `#21, #4 · Merged`). Cuidado: outros `[role="img"]` na linha são avatares (ex.: `Bruno Picinini`) — filtre por `\bMerged\b`.
- Cor do merged usada (`#b796ff`) = o roxo nativo do Claude (`rgb(183,150,255)`).
- **Prioridade: status vivo > merged.** Se a linha tem status vivo, ele ganha; só cai pra roxo quando não há status e existe o badge Merged. (Na prática não coexistem, mas se um dia coexistirem, running/awaiting é mais útil de ver.)
- O nome da sessão (header editável) é `button.cursor-text`.

Recolorir o favicon: carrega `claude.ai/favicon.ico` (mesma origem → canvas não "tainta"), desenha num canvas e usa `globalCompositeOperation = 'source-in'` pra trocar a cor mantendo a forma. Cada cor é gerada 1x e fica em cache.

## scripts/session-notepad.user.js
Painel lateral de notas por sessão. Atalho `Ctrl+Shift+S` (ou botão injetado na barra de ações), `Esc` fecha. Redimensionável (largura salva em `localStorage` key `cc-notes:w`, padrão 750px).

**Template padrão:** sessão ainda sem nota salva abre com o template `# STATUS` / `# PRs` / `# CLICKUP` / `# LINKS` / `# NOTES` (const `TEMPLATE`, via `loadNote()` = `load(id) || TEMPLATE`). É só exibição — não grava no `localStorage` até o usuário editar (o `input`/`blur` salva o que estiver no editor). Nota vazia (nunca salva ou esvaziada) reexibe o template.

**Auto-open (layout por modo):** toggle no header (switch ao lado do `×`), estado em `localStorage` key `cc-notes:autostart` (`'1'`/`'0'`), **default on** (ausência = ligado; só fica off se gravar `'0'`). Quando ligado, o `applyMode()` ajusta o layout conforme a URL:
- **Em sessão** (`/code/session_…`, há `sessionId`): abre as notas (via `setOpen(true, false)` — **sem** focar o editor, não rouba o foco da página) e **esconde a sidebar** (colapsa).
- **Na home** (`/code` sem sessão): **fecha** as notas e **mostra a sidebar**.

Detalhes do `applyMode`: as **notas** só agem na *transição* de modo (não reabre se você fechou na mesma página). A **sidebar** é controlada clicando no botão nativo do app (passa pelo handler — atualiza React + store persistida), e a aplicação é *self-correcting*: só marca como aplicada quando o estado visível já bate com o desejado (se um clique não pegar, o próximo tick reclica). O toggle manual (`Ctrl+Shift+S`/botão) continua focando o editor normalmente.

Fatos do DOM da sidebar (Cmd+B nativo): a sidebar é `aside.dframe-sidebar` (aberta ≈280px, colapsada ≈28px). O estado fica na store persistida `localStorage['dframe-store']` em `state.collapsed` (bool) — **flag global, não por página**, por isso o script precisa gerenciar nas transições. Botões: aberta tem `[aria-label="Collapse sidebar"]` (dentro do aside); colapsada tem `[aria-label="Open sidebar"]`. Não mexer no `dframe-store` direto (a store React já está hidratada na memória; só o clique no botão sincroniza o estado visível). Nota salva por sessão em `localStorage` key `cc-notes:<sessionId>` (debounce 300ms). Links viram clicáveis (linkify). Editor é `contentEditable=plaintext-only` pra newline sair como `\n` literal. O linkify roda no `blur` (clicar fora) e ao abrir/trocar de sessão — **não** roda no `input` de propósito (re-renderizar a cada tecla pularia o caret / dobraria newline). `linkify` é round-trip idempotente, então rodar no blur é seguro. **Clique normal** num link abre **sempre** em **aba de fundo** (`active:false`, não troca de aba); **Cmd/Ctrl+click** abre **e foca** (`active:true`). Ambos via `GM_openInTab` (`openTab`). Não há guard de "fora de edição": o editor fica focado por padrão, então exigir `!editing` fazia o clique normal não fazer nada (bug v2.11). Custo: pra editar o texto de um link, posicione o caret por fora dele. Importante: o clique sintético com modificador num `<a>` **foi testado e NÃO abre em background** (abre em foreground) — por isso `GM_openInTab` e o `@grant`. O header mostra `Notes (v…) · <nome do chat>` — versão lida de `GM_info.script.version` (single source) e o nome do chat de `button.cursor-text` (header editável do Claude, inclui o prefixo `[id]`; mesma fonte que o favicon usa). O nome é atualizado no `tick` via `syncName()` (acompanha troca de sessão e rename); só aparece em sessão. O nome trunca com reticências (`text-overflow: ellipsis`) e o separador usa `gap` do container — não espaço no texto, porque flex item descarta whitespace inicial.

O **handle de resize** (pill) fica escondido (`opacity: 0`) e só aparece no hover da borda ou durante o arraste (flags `gripHover`/`gripDrag` → `syncGrip`). Fica ~5px pra fora da borda (estilo Diff do Claude Code) via `marginLeft` negativo no `handle`.

Fatos do DOM:
- `sessionId` vem do path: `/session_[A-Za-z0-9]+/`.
- A barra onde o botão é injetado é achada por `button[aria-label="Share"|"Session actions"|"Diff"]`, subindo pro `span.epitaxy-titlebar-fade` (ou parent).
- O conteúdo principal que é "empurrado" pelo painel é `#dframe-main` (ajusta `style.right`).

## Testar/lintar
- Não é um projeto Node; não há build. Edição manual do `.user.js`.
- Lint opcional com ESLint (flat config), regras de formatação + `no-undef` com globals de browser. Globals usados: `window, document, location, localStorage, history, setTimeout, setInterval, clearTimeout, MutationObserver, Image, addEventListener, Promise`. Notepad também usa `GM_openInTab` e `GM_info` (Tampermonkey).
