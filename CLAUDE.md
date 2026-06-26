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
- **PR (merged/open)**: uma sessão com PR **não tem `[role="status"]`** na linha — o estado vem de um badge separado `[role="img"]` cujo `aria-label` é `#21, #4 · Merged` (mergeado) ou `#861 · Open` (aberto). `currentPR()` retorna `'merged'` / `'open'` / `null`, filtrando por `\bMerged\b` / `\bOpen\b` (merged tem prioridade — não coexistem). Cuidado: outros `[role="img"]` na linha são avatares (ex.: `Bruno Picinini`).
- Cor do merged (`#b796ff`) = o roxo nativo do Claude (`rgb(183,150,255)`). PR aberto usa um teal próprio (`#2dd4bf`) — não o verde do app (`rgb(50,215,75)`), de propósito, pra **não** colidir visualmente com o verde de `running` (`#22c55e`).
- **Prioridade: status vivo > PR (merged/open).** Se a linha tem status vivo, ele ganha; só cai pra roxo/teal quando não há status e existe o badge. (Na prática não coexistem, mas se um dia coexistirem, running/awaiting é mais útil de ver.)
- O nome da sessão (header editável) é `button.cursor-text`.

Recolorir o favicon: carrega `claude.ai/favicon.ico` (mesma origem → canvas não "tainta"), desenha num canvas e usa `globalCompositeOperation = 'source-in'` pra trocar a cor mantendo a forma. Cada cor é gerada 1x e fica em cache.

## scripts/session-notepad.user.js
Painel lateral de notas por sessão. Atalho `Ctrl+Shift+S` (ou botão injetado na barra de ações) — toggle. `Esc` **não** fecha (de propósito, v2.22: o Bruno usa `Esc` pra outras coisas e não quer recolher as notas sem querer — fechar é via `×`, botão ou `Ctrl+Shift+S`). Redimensionável (largura salva em `localStorage` key `cc-notes:w`, padrão 750px).

**Template padrão:** sessão ainda sem nota salva abre com o template `# STATUS` / `# PRs` / `# CLICKUP` / `# LINKS` / `# NOTES` (const `TEMPLATE`, via `loadNote()` = `load(id) || TEMPLATE`). É só exibição — não grava no `localStorage` até o usuário editar (o `input`/`blur` salva o que estiver no editor). Nota vazia (nunca salva ou esvaziada) reexibe o template.

**Auto-open (layout por modo):** toggle no header (switch ao lado do `×`), estado em `localStorage` key `cc-notes:autostart` (`'1'`/`'0'`), **default on** (ausência = ligado; só fica off se gravar `'0'`). Quando ligado, o `applyMode()` ajusta o layout conforme a URL:
- **Em sessão** (`/code/session_…`, há `sessionId`): abre as notas (via `setOpen(true, false)` — **sem** focar o editor, não rouba o foco da página) e **esconde a sidebar** (colapsa).
- **Na home** (`/code` sem sessão): **fecha** as notas e **mostra a sidebar**.

Detalhes do `applyMode`: as **notas** só agem na *transição* de modo (não reabre se você fechou na mesma página). A **sidebar** é controlada clicando no botão nativo do app (passa pelo handler — atualiza React + store persistida), e a aplicação é *self-correcting*: só marca como aplicada quando o estado visível já bate com o desejado (se um clique não pegar, o próximo tick reclica). O toggle manual (`Ctrl+Shift+S`/botão) continua focando o editor normalmente.

Fatos do DOM da sidebar (Cmd+B nativo): a sidebar é `aside.dframe-sidebar` (aberta ≈280px, colapsada ≈28px). O estado fica na store persistida `localStorage['dframe-store']` em `state.collapsed` (bool) — **flag global, não por página**, por isso o script precisa gerenciar nas transições. Botões: aberta tem `[aria-label="Collapse sidebar"]` (dentro do aside); colapsada tem `[aria-label="Open sidebar"]`. Não mexer no `dframe-store` direto (a store React já está hidratada na memória; só o clique no botão sincroniza o estado visível). Nota salva por sessão em `localStorage` key `cc-notes:<sessionId>` (debounce 300ms). Links viram clicáveis (linkify). Editor é `contentEditable=plaintext-only` pra newline sair como `\n` literal. O linkify roda no `blur` (clicar fora) e ao abrir/trocar de sessão — **não** roda no `input` de propósito (re-renderizar a cada tecla pularia o caret / dobraria newline). `linkify` é round-trip idempotente, então rodar no blur é seguro. O blur **só re-renderiza num blur "real"** — `val !== lastRendered && document.hasFocus()` (v2.20). `lastRendered` é atualizado dentro do `setText`. A guarda `document.hasFocus()` é o discriminador: `true` quando o foco vai pra outro elemento da **mesma página** (aí re-renderiza pra linkificar); `false` quando o foco sai da página (troca de aba/janela) — aí **não** reescreve o `innerHTML`, então o Chrome preserva o caret ao voltar, **mesmo depois de editar**. É robusto à intermitência do tab-switch: se o `blur` não disparar, o DOM também fica intacto; se disparar, o `hasFocus()` falso pula o re-render. Custo: URL recém-digitada só vira link no próximo blur real / troca de sessão. Re-render destrói a seleção porque recria os nodes; trocar de **sessão** ainda perde o caret (camada 2, não feita). **Clique normal** num link abre **sempre** em **aba de fundo** (`active:false`, não troca de aba); **Cmd/Ctrl+click** abre **e foca** (`active:true`). Ambos via `GM_openInTab` (`openTab`). Não há guard de "fora de edição": o editor fica focado por padrão, então exigir `!editing` fazia o clique normal não fazer nada (bug v2.11). Custo: pra editar o texto de um link, posicione o caret por fora dele. Importante: o clique sintético com modificador num `<a>` **foi testado e NÃO abre em background** (abre em foreground) — por isso `GM_openInTab` e o `@grant`. O header mostra `Notes (v…) · <nome do chat>` — versão lida de `GM_info.script.version` (single source) e o nome do chat de `button.cursor-text` (header editável do Claude, inclui o prefixo `[id]`; mesma fonte que o favicon usa). O nome é atualizado no `tick` via `syncName()` (acompanha troca de sessão e rename); só aparece em sessão. O `·` é um **span próprio** e o espaço dos dois lados vem do `gap: 6px` do container flex (espaço no texto não serve: flex item descarta whitespace inicial e o trailing fica frágil). Na home o `syncName` esconde separador **e** nome com `display:none` (tira o gap junto, sem sobrar espaço depois do badge). Nome longo trunca com reticências (`text-overflow: ellipsis`) sem empurrar o toggle/`×`.

O **handle de resize** (pill) fica escondido (`opacity: 0`) e só aparece no hover da borda ou durante o arraste (flags `gripHover`/`gripDrag` → `syncGrip`). Fica ~5px pra fora da borda (estilo Diff do Claude Code) via `marginLeft` negativo no `handle`.

Fatos do DOM:
- `sessionId` vem do path: `/session_[A-Za-z0-9]+/`.
- A barra onde o botão é injetado é achada por `button[aria-label="Share"|"Session actions"|"Diff"]`, subindo pro `span.epitaxy-titlebar-fade` (ou parent).
- O conteúdo principal que é "empurrado" pelo painel é `#dframe-main` (ajusta `style.right`).

## scripts/session-switch-hotkey.user.js
`Cmd+Alt+[` (anterior/cima) e `Cmd+Alt+]` (próxima/baixo) trocam a sessão aberta andando na lista da sidebar — réplica do `Cmd+Shift+[ / ]` do navegador Dia (que o Bruno não quis usar no Chrome porque já usa pra trocar de aba). Script mínimo: só um `keydown` em captura, sem painel/observer.

`Ctrl+Shift+R` renomeia a sessão aberta (v1.2). Aciona clicando no título do header (`button.cursor-text` — mesma fonte que favicon/notepad usam): clicar nele abre o **input inline** do nome, focado e com o texto todo selecionado. Testado: o `.click()` sintético dispara o handler do React e abre o input; **não** existe atalho global nativo (o `R` do menu `⋮` é só acelerador do menu, não vale com o foco fora dele). **Só no Mac** (`isMac`): no Windows/Linux `Ctrl+Shift+R` é o hard-reload do navegador e o `preventDefault` em captura não o segura. **Sem guard de foco de propósito** — funciona mesmo digitando no prompt/notepad (rename de qualquer lugar é o objetivo).

Depois de abrir, o `rename()` **reposiciona a seleção** (v1.4): se o nome começa com `[`, seleciona o **texto dentro** dos colchetes — **sem** os `[` `]` (ex.: `[ESPERAR VENDAS]` ⇒ seleciona `ESPERAR VENDAS`), via `setSelectionRange(1, indexOf(']'))`, pra digitar a tag nova por cima. Sem tag (não começa com `[`), deixa a seleção total padrão (o rename já abre com tudo selecionado), então retoma o nome inteiro. Eventos de teclado **sintéticos não movem o caret** (só eventos trusted do SO), por isso a **Selection API** direto em vez de "mandar as setas". O `<input>` aparece async (re-render do React), então re-tenta (`document.activeElement` é INPUT com `selectionStart`) até focar; testado ao vivo que a seleção **sobrevive** ao re-render.

Fatos do DOM da sidebar (descobertos inspecionando a página) que o script depende:
- A sidebar mistura **itens de menu** e **sessões**, ambos com `[data-row]`. Itens de menu (New session, Routines, Customize, More) são `<button data-row>` (a própria linha é o botão, sem botão interno). **Sessões** são `<div data-row>` com um `<button data-row-main-button>` dentro — esse main-button é o clicável que navega. Logo, sessões = `div[data-row]` que tem o main-button.
- A ordem das linhas no DOM = a ordem visual, cruzando os grupos (Pinned/Desenvolvendo/Ideias/Waiting/Em Revisão) de cima pra baixo. `go(±1)` anda nessa lista achatada.
- **Sessão aberta (âncora):** a linha aberta carrega `data-selected` (valor `"focused"`, às vezes `"open"` — ver as classes `data-[selected=focused]` / `data-[selected=open]`). É **só uma** por vez e acompanha a route — confirmado no load fresco da página e após cada troca. Na home nenhuma linha de **sessão** tem `data-selected` (o foco roving fica no `New session`, que é botão de menu) → `currentIdx` = -1, e aí `]` abre a 1ª / `[` abre a última.
- **Navega via `.click()` no main-button** (dispara o router do React). **Funciona com a sidebar COLAPSADA** (28px): as linhas seguem no DOM, mantêm `data-selected` e rect real; o clique sintético ignora o clipping visual. Isso importa porque o notepad colapsa a sidebar em modo sessão.
- **Tecla:** usar `e.code` (`BracketLeft`/`BracketRight`, tecla física) e **não** `e.key` — no Mac, `Alt+[` vira `"` e `Alt+]` vira `'`, mas o `code` continua Bracket*. Exige exatamente `metaKey && altKey` (sem Ctrl/Shift). `Cmd+Alt+[ / ]` não é atalho nativo do Chrome (Mac), então não há conflito.
- Limitação aceita: sessões que não estejam no DOM (grupo colapsado / virtualização com lista muito grande) ficam fora do ciclo. Para as listas atuais (~10-15) todas estão renderizadas.

## Testar/lintar
- Não é um projeto Node; não há build. Edição manual do `.user.js`.
- Lint opcional com ESLint (flat config), regras de formatação + `no-undef` com globals de browser. Globals usados: `window, document, location, localStorage, history, setTimeout, setInterval, clearTimeout, MutationObserver, Image, addEventListener, Promise`. Notepad também usa `GM_openInTab` e `GM_info` (Tampermonkey).
