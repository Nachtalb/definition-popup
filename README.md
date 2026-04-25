# Definition Popup

A small Chrome / Edge extension (Manifest V3). Highlight any word on a page and a Google-style popup appears with its definition. If the word doesn't have a standard dictionary entry, it falls back to Urban Dictionary and shows the top results with their up/down vote counts.

## Features

- Trigger on any text selection (1–3 words, up to 60 characters).
- Primary source: [freedictionaryapi.com](https://freedictionaryapi.com/) — IPA, part of speech, definitions, examples.
- Fallback: scrapes [urbandictionary.com](https://www.urbandictionary.com/) for the top definitions, fetches live vote counts via the `/ui/votes` endpoint.
- Popup automatically positions near the selection, flips above when there's no room below.
- Click outside or press `Esc` to dismiss.
- Light + dark mode (follows the OS).

## Install (developer mode)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select this folder.
4. Visit any page, highlight a word, and the popup will appear.

The extension requests `host_permissions` only for `freedictionaryapi.com` and `urbandictionary.com`. It does not read or send page contents anywhere else.

## How it works

```
content.js   →  detects selection  →  chrome.runtime.sendMessage({action: "lookup", word})
background.js →  fetch freedictionaryapi.com → if empty, scrape urbandictionary.com
              →  for UD: also fetch /ui/votes?defids=… with header x-up-version: 3.14.2
              →  returns { source: "dictionary" | "urban" | "none", data }
content.js   →  renders the popup card
```

UD's page is server-rendered HTML; `parseUrbanDefinitions` walks the `<div class="definition" data-defid="…" data-word="…">` blocks for the meaning, example, and contributor. `parseVotes` extracts the per-definition up/down counts from the HTML fragment returned by `/ui/votes`.

## Files

- `manifest.json` — Manifest V3 declaration, permissions, content/background scripts.
- `background.js` — service worker; performs lookups (CORS-free).
- `content.js` — selection listener + popup renderer.
- `styles.css` — scoped popup styles, light + dark.
- `icons/` — 16 / 48 / 128 px extension icons.

## Git / GitHub setup

A PowerShell helper is included. From this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-git.ps1 -RepoName Definition
```

It will:

1. Remove any half-initialized `.git` directory.
2. `git init`, add, and commit everything.
3. Create the GitHub repo and push (requires the [GitHub CLI](https://cli.github.com/), authenticated with `gh auth login`).

If you'd rather do it by hand:

```powershell
Remove-Item .git -Recurse -Force        # only if a partial .git exists
git init -b main
git add .
git commit -m "Initial commit"
gh repo create Definition --public --source=. --push
```

## Notes

- The Urban Dictionary parser depends on UD's current HTML structure. If they change class names or layout, `parseUrbanDefinitions` in `background.js` may need updates.
- This extension does not store any browsing data.
