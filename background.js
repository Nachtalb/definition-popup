// Definition Popup — background service worker.
// Handles cross-origin lookups so the content script never has to deal with CORS.

const DICT_ENDPOINT = "https://freedictionaryapi.com/api/v1/entries/en/";
const UD_PAGE = "https://www.urbandictionary.com/define.php?term=";
const UD_VOTES = "https://www.urbandictionary.com/ui/votes?defids=";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.action === "lookup" && typeof msg.word === "string") {
    lookupWord(msg.word, { force: msg.force })
      .then(sendResponse)
      .catch((err) => sendResponse({ source: "error", error: String(err) }));
    return true; // keep channel open for async response
  }
});

async function lookupWord(rawWord, opts = {}) {
  const word = rawWord.trim();
  if (!word) return { source: "none" };

  // 1. Try the standard dictionary first (skipped when force === "urban").
  if (opts.force !== "urban") {
    const dict = await tryDictionary(word);
    if (dict) return { source: "dictionary", word, data: dict };
  }

  // 2. Urban Dictionary (scrape page + fetch vote counts).
  const urban = await tryUrbanDictionary(word);
  if (urban && urban.length > 0) {
    return { source: "urban", word, data: urban };
  }

  return { source: "none", word };
}

async function tryDictionary(word) {
  try {
    const r = await fetch(DICT_ENDPOINT + encodeURIComponent(word.toLowerCase()), {
      headers: { Accept: "application/json" }
    });
    if (!r.ok) return null;
    const json = await r.json();
    if (!json || !json.entries || json.entries.length === 0) return null;
    return json;
  } catch (_e) {
    return null;
  }
}

async function tryUrbanDictionary(word) {
  let html;
  try {
    const r = await fetch(UD_PAGE + encodeURIComponent(word), {
      headers: { Accept: "text/html" }
    });
    if (!r.ok) return null;
    html = await r.text();
  } catch (_e) {
    return null;
  }

  const defs = parseUrbanDefinitions(html);
  if (defs.length === 0) return null;

  // Limit how many votes we fetch — top 5 is plenty for the popup.
  const top = defs.slice(0, 5);
  const ids = top.map((d) => d.defid).filter(Boolean);
  if (ids.length > 0) {
    try {
      const r = await fetch(UD_VOTES + ids.join(","), {
        headers: { "x-up-version": "3.14.2" }
      });
      if (r.ok) {
        const voteHtml = await r.text();
        const votes = parseVotes(voteHtml);
        for (const d of top) {
          const v = votes[d.defid];
          if (v) {
            d.thumbs_up = v.up;
            d.thumbs_down = v.down;
          }
        }
      }
    } catch (_e) {
      // votes are non-critical
    }
  }

  return top;
}

// Parse UD's server-rendered HTML. Each definition lives in
// <div class="definition ..." data-defid="N" data-word="W">…</div>
// containing .meaning, .example and .contributor blocks.
function parseUrbanDefinitions(html) {
  const out = [];
  const blockRe = /<div[^>]*class="definition[^"]*"[^>]*data-defid="(\d+)"[^>]*data-word="([^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*class="definition[^"]*"[^>]*data-defid=|<\/main>|<footer)/g;

  let m;
  while ((m = blockRe.exec(html)) !== null) {
    const defid = m[1];
    const word = decodeEntities(m[2]);
    const inner = m[3];

    const meaning = pickInnerText(inner, /<div[^>]*class="[^"]*\bmeaning\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const example = pickInnerText(inner, /<div[^>]*class="[^"]*\bexample\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const contributor = pickInnerText(inner, /<div[^>]*class="[^"]*\bcontributor\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);

    if (meaning) {
      out.push({
        defid,
        word,
        definition: meaning,
        example,
        contributor,
        thumbs_up: null,
        thumbs_down: null
      });
    }
  }
  return out;
}

function pickInnerText(html, regex) {
  const m = regex.exec(html);
  if (!m) return "";
  // Replace <br> with newlines, strip remaining tags, collapse whitespace.
  return decodeEntities(
    m[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Vote fragments are a sequence of <div id="vote-buttons-N"> blocks. Inside each,
// a form with direction "up" then a form with direction "down". The numeric count
// is in the trailing <span class="text-xs ...">NUMBER</span>.
function parseVotes(html) {
  const result = {};
  const sectionRe = /id="vote-buttons-(\d+)"([\s\S]*?)(?=id="vote-buttons-\d+"|$)/g;
  let m;
  while ((m = sectionRe.exec(html)) !== null) {
    const id = m[1];
    const section = m[2];
    const upMatch = /direction"\s+value="up"[\s\S]*?<span[^>]*>(\d[\d,]*)<\/span>/.exec(section);
    const downMatch = /direction"\s+value="down"[\s\S]*?<span[^>]*>(\d[\d,]*)<\/span>/.exec(section);
    result[id] = {
      up: upMatch ? parseInt(upMatch[1].replace(/,/g, ""), 10) : null,
      down: downMatch ? parseInt(downMatch[1].replace(/,/g, ""), 10) : null
    };
  }
  return result;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
