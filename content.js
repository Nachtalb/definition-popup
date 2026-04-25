// Definition Popup — content script.
// Watches for text selections, asks the background worker to look the word up,
// and renders a small floating card next to the cursor.

(() => {
  const POPUP_ID = "__definition_popup_root__";
  const MAX_PHRASE_LENGTH = 60;
  const MAX_WORD_COUNT = 3;

  let popup = null;
  let lastQuery = "";
  let requestSeq = 0;

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", removePopup, true);
  window.addEventListener("resize", removePopup, true);

  function onMouseUp(e) {
    // Don't react to clicks inside our own popup.
    if (popup && popup.contains(e.target)) return;

    // Defer slightly so the selection has settled.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!isLookupCandidate(text)) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      lastQuery = text;
      const seq = ++requestSeq;
      showPopupAt(rect, text);
      renderLoading(text);

      chrome.runtime.sendMessage({ action: "lookup", word: text }, (response) => {
        if (seq !== requestSeq) return; // a newer query has superseded this one
        if (chrome.runtime.lastError) {
          renderError(text, chrome.runtime.lastError.message || "Lookup failed.");
          return;
        }
        if (!response) {
          renderError(text, "No response from background script.");
          return;
        }
        if (response.source === "dictionary") renderDictionary(response.word, response.data);
        else if (response.source === "urban") renderUrban(response.word, response.data);
        else if (response.source === "error") renderError(text, response.error);
        else renderEmpty(text);
      });
    }, 10);
  }

  function onMouseDown(e) {
    if (popup && !popup.contains(e.target)) removePopup();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") removePopup();
  }

  function isLookupCandidate(text) {
    if (!text) return false;
    if (text.length > MAX_PHRASE_LENGTH) return false;
    const words = text.split(/\s+/);
    if (words.length > MAX_WORD_COUNT) return false;
    // Require at least one letter — skip pure punctuation/numbers.
    if (!/[A-Za-z]/.test(text)) return false;
    return true;
  }

  function ensurePopup() {
    if (popup && document.body.contains(popup)) return popup;
    popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.className = "dp-popup";
    popup.addEventListener("mousedown", (e) => e.stopPropagation());
    document.body.appendChild(popup);
    return popup;
  }

  function showPopupAt(rect, _word) {
    ensurePopup();
    // Position below the selection by default; flip above if it would overflow.
    const margin = 8;
    const popupWidth = 360;
    const popupMaxHeight = 420;

    let left = window.scrollX + rect.left;
    let top = window.scrollY + rect.bottom + margin;

    const viewportRight = window.scrollX + window.innerWidth;
    if (left + popupWidth + margin > viewportRight) {
      left = Math.max(window.scrollX + margin, viewportRight - popupWidth - margin);
    }

    const viewportBottom = window.scrollY + window.innerHeight;
    if (top + popupMaxHeight > viewportBottom) {
      const above = window.scrollY + rect.top - popupMaxHeight - margin;
      if (above > window.scrollY + margin) top = above;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.width = `${popupWidth}px`;
    popup.style.maxHeight = `${popupMaxHeight}px`;
  }

  function removePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
    requestSeq++;
  }

  // ---------- Renderers ---------------------------------------------------

  function header(word, sourceLabel, sourceClass) {
    const div = el("div", "dp-header");
    div.appendChild(el("div", "dp-word", word));
    if (sourceLabel) {
      const badge = el("div", `dp-badge ${sourceClass || ""}`, sourceLabel);
      div.appendChild(badge);
    }
    const close = el("button", "dp-close", "×");
    close.title = "Close";
    close.addEventListener("click", removePopup);
    div.appendChild(close);
    return div;
  }

  function renderLoading(word) {
    const root = ensurePopup();
    root.innerHTML = "";
    root.appendChild(header(word, "Looking up…", "dp-badge-loading"));
    root.appendChild(el("div", "dp-body dp-loading", "Searching dictionary…"));
  }

  function renderError(word, message) {
    const root = ensurePopup();
    root.innerHTML = "";
    root.appendChild(header(word, "Error", "dp-badge-error"));
    root.appendChild(el("div", "dp-body", message));
  }

  function renderEmpty(word) {
    const root = ensurePopup();
    root.innerHTML = "";
    root.appendChild(header(word, "Not found", "dp-badge-error"));
    const body = el("div", "dp-body");
    body.appendChild(el("p", null, `No entry found for “${word}” in the dictionary or on Urban Dictionary.`));
    root.appendChild(body);
  }

  function renderDictionary(word, data) {
    const root = ensurePopup();
    root.innerHTML = "";
    root.appendChild(header(data.word || word, "Dictionary", "dp-badge-dict"));

    const body = el("div", "dp-body");

    // Pronunciations: pick a representative IPA if available.
    const ipa = collectFirstIpa(data);
    if (ipa) body.appendChild(el("div", "dp-phonetic", ipa));

    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const entry of entries.slice(0, 4)) {
      const block = el("div", "dp-entry");
      if (entry.partOfSpeech) {
        block.appendChild(el("div", "dp-pos", entry.partOfSpeech));
      }
      const senses = Array.isArray(entry.senses) ? entry.senses : [];
      const ol = el("ol", "dp-senses");
      for (const sense of senses.slice(0, 4)) {
        const li = el("li", "dp-sense");
        if (sense.definition) li.appendChild(el("span", "dp-def", sense.definition));
        const examples = Array.isArray(sense.examples) ? sense.examples : [];
        if (examples.length > 0) {
          const ex = el("div", "dp-example", `“${examples[0]}”`);
          li.appendChild(ex);
        }
        ol.appendChild(li);
      }
      if (ol.children.length > 0) block.appendChild(ol);
      body.appendChild(block);
    }

    root.appendChild(body);
    const sourceUrl = data.source && data.source.url
      ? data.source.url
      : `https://en.wiktionary.org/wiki/${encodeURIComponent(data.word || word)}`;
    root.appendChild(footerLink(sourceUrl, "Open on Wiktionary"));
  }

  function renderUrban(word, defs) {
    const root = ensurePopup();
    root.innerHTML = "";
    root.appendChild(header(defs[0]?.word || word, "Urban Dictionary", "dp-badge-urban"));

    const body = el("div", "dp-body");
    body.appendChild(el("div", "dp-note", "No standard dictionary entry — showing slang results."));

    for (const d of defs.slice(0, 3)) {
      const block = el("div", "dp-entry dp-urban");
      block.appendChild(formatRichText(d.definition, "dp-def"));
      if (d.example) {
        const ex = formatRichText(d.example, "dp-example");
        block.appendChild(ex);
      }

      const meta = el("div", "dp-meta");
      if (d.thumbs_up != null || d.thumbs_down != null) {
        const votes = el("span", "dp-votes");
        votes.appendChild(el("span", "dp-up", `▲ ${formatNumber(d.thumbs_up)}`));
        votes.appendChild(el("span", "dp-down", `▼ ${formatNumber(d.thumbs_down)}`));
        meta.appendChild(votes);
      }
      if (d.contributor) {
        meta.appendChild(el("span", "dp-contrib", d.contributor));
      }
      if (meta.children.length > 0) block.appendChild(meta);

      body.appendChild(block);
    }

    root.appendChild(body);
    root.appendChild(footerLink(
      `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(defs[0]?.word || word)}`,
      "Open on Urban Dictionary"
    ));
  }

  // ---------- Helpers ------------------------------------------------------

  function collectFirstIpa(data) {
    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const e of entries) {
      const prons = Array.isArray(e.pronunciations) ? e.pronunciations : [];
      for (const p of prons) {
        if (p.type === "ipa" && p.text) return p.text;
      }
    }
    return null;
  }

  function formatNumber(n) {
    if (n == null) return "—";
    return n.toLocaleString();
  }

  function formatRichText(text, className) {
    const div = el("div", className);
    const lines = text.split(/\n+/);
    lines.forEach((line, i) => {
      if (i > 0) div.appendChild(document.createElement("br"));
      div.appendChild(document.createTextNode(line));
    });
    return div;
  }

  function footerLink(url, label) {
    const f = el("div", "dp-footer");
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    f.appendChild(a);
    return f;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
