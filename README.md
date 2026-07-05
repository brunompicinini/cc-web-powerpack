# CC Web Power Pack

A collection of **userscripts** (Tampermonkey) that improve **Claude Code Web** — `claude.ai/code`.

Each script lives in [`scripts/`](scripts/), ends in `.user.js`, and installs straight from the GitHub **raw** URL, with **auto-update** (on every `git push`, Tampermonkey pulls the new version).

---

## Scripts

| Script | What it does |
| --- | --- |
| [`session-status-favicon.user.js`](scripts/session-status-favicon.user.js) | Recolors the tab **favicon** based on the open session's status — 🟢 running, 🟡 awaiting input, 🔵 ready, 🟣 merged, teal = open PR — and swaps the **tab title** for the session name. |
| [`session-notepad.user.js`](scripts/session-notepad.user.js) | **Per-session notepad**: a **floating** side panel for notes (its own background, rounded corners and slide-in — like the native panels). Toggle shortcut `Ctrl+S` (Mac) / `Alt+S` (Windows), resizable, clickable links. Saved per `sessionId` in `localStorage`. |
| [`session-shortcuts.user.js`](scripts/session-shortcuts.user.js) | **Keyboard shortcuts.** The modifier is **`Ctrl` on Mac** and **`Alt` on Windows/Linux** (each is the one the browser leaves free). `Mod + [` / `]` move up/down the session list (even when the sidebar is collapsed), `Mod + S` toggles the notepad, `Mod + R` renames the session (selecting the leading status token — a `[tag]` or a status emoji), `Mod + C` opens plan usage, `Mod + D` toggles the Diff, `Mod + B` opens Background tasks, `Mod + A` opens Artifacts. All work on both platforms. |

---

## Installation

### 1. Tampermonkey
Install the [Tampermonkey](https://www.tampermonkey.net/) extension in Chrome (or another Chromium browser).

### 2. Enable "Allow User Scripts" (Chrome 138+)
Starting with Chrome 138 the user-scripts permission was split out from the global *Developer Mode*. Without it the script **installs but doesn't run**:

1. Open `chrome://extensions`
2. Open Tampermonkey's **details**
3. Turn on the **"Allow User Scripts"** toggle

> On older versions the equivalent was turning on the global *Developer Mode*. A "developer mode required" warning sometimes shows up buggy — if the scripts are already running, you can ignore it.

### 3. Install the scripts
Open each script's **raw URL** (ends in `.user.js`) and Tampermonkey intercepts it with the **Install** screen:

- **Session Status Favicon + Title** →
  `https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-status-favicon.user.js`
- **Session Notepad** →
  `https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-notepad.user.js`
- **Shortcuts** →
  `https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/session-shortcuts.user.js`

Click **Install**. Done.

---

## Auto-update

Each script carries in its header:

```js
// @downloadURL  https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/<file>.user.js
// @updateURL    https://raw.githubusercontent.com/brunompicinini/cc-web-powerpack/main/scripts/<file>.user.js
```

Tampermonkey checks `@updateURL` periodically. When the `@version` in the repo is higher than the installed one, it downloads the new version by itself. **To publish an update: edit the script, bump `@version`, and `git push`.**

---

## Development

- One script per file in `scripts/`, always ending in `.user.js`.
- Keep `@downloadURL` / `@updateURL` pointing at the raw URL of the `main` branch.
- **Bump `@version`** on every published change — that's what triggers auto-update.
- See [`CLAUDE.md`](CLAUDE.md) for conventions and Claude Code Web DOM details.

---

## License

[MIT](LICENSE) © Bruno Picinini
