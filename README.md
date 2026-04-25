# Definition Popup

A small Chrome / Edge extension (Manifest V3). Highlight any word on a page and a Google-style popup appears with its definition. If the word doesn't have a standard dictionary entry, it falls back to Urban Dictionary and shows the top results with their up/down vote counts.

## Features

- Triggers on a single highlighted word (hyphenated or connector-joined words like `well-known`, `don't`, `U.S.A.` are also accepted; phrases with spaces are ignored).
- Primary source: [freedictionaryapi.com](https://freedictionaryapi.com/) — IPA, part of speech, definitions, examples. The "Open on Wiktionary" link in the popup uses the `source.url` returned by the API.
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
