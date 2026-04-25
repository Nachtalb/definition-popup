# Privacy Policy

_Last updated: 2026-04-25_

This privacy policy describes how the **Definition Popup** browser extension
(the "Extension") handles information when you use it.

## Summary

The Extension does not collect, store, sell, or share any personal data. It
does not use cookies, analytics, advertising, telemetry, or remote logging of
any kind. Everything happens locally in your browser, except for the lookups
described below.

## What is sent to third parties

When — and only when — you highlight a single word in a web page, the Extension
sends that word to one or both of the following services to fetch its
definition:

| Service | URL pattern | Purpose |
| --- | --- | --- |
| Free Dictionary API | `https://freedictionaryapi.com/api/v1/entries/en/<word>` | Standard English dictionary lookup. |
| Urban Dictionary | `https://www.urbandictionary.com/define.php?term=<word>` and `https://www.urbandictionary.com/ui/votes?defids=<ids>` | Slang fallback when the Free Dictionary returns no entry. |

Only the highlighted word is transmitted. No URL of the page you are on, no
page content, no identifiers, and no information about you personally are
sent. Standard HTTP request metadata (your IP address, browser User-Agent,
etc.) is visible to those services exactly as it would be for any normal
browser request — the Extension does not add anything.

The Extension's author has no agreement with, and receives no data back from,
either service. Their respective privacy policies apply to whatever they
choose to log on their end:

- Free Dictionary API: https://freedictionaryapi.com/
- Urban Dictionary: https://www.urbandictionary.com/legal

## What is stored locally

The Extension keeps a small in-memory cache of up to 10 of the most recent
lookup results inside the background service worker so that re-selecting the
same word does not re-hit the network. This cache is wiped whenever the
service worker shuts down (typically after about 30 seconds of inactivity)
and never leaves your machine. The Extension does not write to
`localStorage`, `chrome.storage`, IndexedDB, cookies, or any disk-backed
storage.

## Permissions

- `host_permissions` for `https://freedictionaryapi.com/*` and
  `https://www.urbandictionary.com/*` — required to perform the lookups
  described above without being blocked by the browser's same-origin policy.

The Extension declares no other permissions and reads no information from the
pages you visit beyond the word you actively highlight.

## Children

The Extension is a general-purpose dictionary lookup tool. The Urban
Dictionary fallback may surface content that is not appropriate for minors;
the Extension does not filter or moderate that content.

## Changes

This policy may be updated to reflect changes in the Extension. Material
changes will be reflected in the "Last updated" date at the top of this file.
The current version is always available in the source repository:
<https://github.com/Nachtalb/definition-popup/blob/main/PRIVACY.md>

## Contact

Questions or concerns about privacy:
<https://github.com/Nachtalb/definition-popup/issues>
