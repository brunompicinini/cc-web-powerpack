# CC Web Power Pack

Coleção de **userscripts** (Tampermonkey) que melhoram o **Claude Code Web** — `claude.ai/code`.

Cada script fica em [`scripts/`](scripts/), termina em `.user.js` e instala direto pela URL **raw** do GitHub, com **auto‑atualização** (a cada `git push`, o Tampermonkey puxa a nova versão).

---

## Scripts

| Script | O que faz |
| --- | --- |
| [`session-status-favicon.user.js`](scripts/session-status-favicon.user.js) | Recolore o **favicon** da aba conforme o status da sessão aberta — 🟢 running, 🟡 awaiting input, 🔵 ready, 🟣 merged — e troca o **título da aba** pelo nome da sessão. |

---

## Instalação

### 1. Tampermonkey
Instale a extensão [Tampermonkey](https://www.tampermonkey.net/) no Chrome (ou outro Chromium).

### 2. Ligar "Allow User Scripts" (Chrome 138+)
A partir do Chrome 138 a permissão de user scripts foi separada do *Developer Mode* global. Sem isso o script **instala mas não roda**:

1. Abra `chrome://extensions`
2. Abra os **detalhes** do Tampermonkey
3. Ligue o toggle **"Allow User Scripts"**

> Em versões antigas, o equivalente era ligar o *Developer Mode* global. Um aviso de "developer mode required" às vezes aparece bugado — se os scripts já estão rodando, pode ignorar.

### 3. Instalar o script
Abra a **raw URL** do script (termina em `.user.js`) e o Tampermonkey intercepta com a tela de **Install**:

- **Session Status Favicon + Title** →
  `https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-status-favicon.user.js`

Clique em **Install**. Pronto.

---

## Auto‑atualização

Cada script traz no cabeçalho:

```js
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/<arquivo>.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/<arquivo>.user.js
```

O Tampermonkey checa o `@updateURL` periodicamente. Quando o `@version` no repositório for maior que o instalado, ele baixa a nova versão sozinho. **Para publicar uma atualização: edite o script, suba o `@version`, e dê `git push`.**

---

## Desenvolvimento

- Um script por arquivo em `scripts/`, sempre terminando em `.user.js`.
- Mantenha `@downloadURL` / `@updateURL` apontando para a raw da branch `main`.
- **Suba o `@version`** a cada mudança publicada — é o que dispara o auto‑update.
- Veja [`CLAUDE.md`](CLAUDE.md) para convenções e detalhes do DOM do Claude Code Web.
