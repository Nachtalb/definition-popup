// Definition Popup — content script.
// Watches for text selections, asks the background worker to look the word up,
// and renders a small floating card next to the cursor. Selecting a word inside
// an existing popup stacks a new popup on top of it; clicking anywhere outside
// closes all popups at once.

(() => {
  const ROOT_ID = "__definition_popup_root__";
  const MAX_WORD_LENGTH = 50;
  // A single word, optionally joined by separators (hyphen, apostrophe, period, underscore).
  // Trailing separators (e.g. the final "." in "U.S.A.") are allowed.
  // Examples: "aversion", "well-known", "state-of-the-art", "don't", "U.S.A."
  const WORD_PATTERN = /^[\p{L}\p{M}\p{N}]+(?:[-'’._]+[\p{L}\p{M}\p{N}]*)*$/u;

  /** @type {HTMLDivElement[]} popups, oldest first */
  let popups = [];
  // Per-popup request counter — used to ignore stale background responses.
  const popupSeqs = new WeakMap();

  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("scroll", onWindowScroll, true);
  window.addEventListener("resize", removeAllPopups, true);

  // ---------- Event handlers ----------------------------------------------

  function onMouseUp(_e) {
    // Defer slightly so the selection has settled.
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!isLookupCandidate(text)) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) return;

      // If the selection sits inside an existing popup, stack a new one on top.
      // Otherwise close any popups and start fresh.
      const insidePopup = isInsideAnyPopup(sel.anchorNode);
      if (!insidePopup) removeAllPopups();

      const popup = createPopup();
      showPopupAt(popup, rect);
      doLookup(popup, text);
    }, 10);
  }

  function onMouseDown(e) {
    // Click outside every popup → dismiss everything.
    if (popups.length > 0 && !isInsideAnyPopup(e.target)) {
      removeAllPopups();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") removeAllPopups();
  }

  // Close on page/document scroll, but ignore scroll events that originate
  // inside any popup (scrolling its body, clicking its scrollbar, etc.).
  function onWindowScroll(e) {
    if (e.target instanceof Node && isInsideAnyPopup(e.target)) return;
    removeAllPopups();
  }

  // Wheel events over a popup never reach the page. If that popup's body can
  // scroll in the wheel direction we let the browser handle it (just stop
  // propagation); otherwise we preventDefault so the page underneath stays put.
  function onPopupWheel(e) {
    e.stopPropagation();
    const popup = e.currentTarget;
    const body = popup.querySelector(".dp-body");
    if (!body) {
      e.preventDefault();
      return;
    }
    const dy = e.deltaY;
    const canScrollDown = body.scrollTop + body.clientHeight < body.scrollHeight - 1;
    const canScrollUp = body.scrollTop > 0;
    if ((dy > 0 && !canScrollDown) || (dy < 0 && !canScrollUp) || dy === 0) {
      e.preventDefault();
    }
  }

  // ---------- Popup lifecycle ---------------------------------------------

  function isLookupCandidate(text) {
    if (!text) return false;
    if (text.length > MAX_WORD_LENGTH) return false;
    if (!WORD_PATTERN.test(text)) return false;
    if (!/\p{L}/u.test(text)) return false;
    return true;
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function createPopup() {
    const root = ensureRoot();
    const popup = document.createElement("div");
    popup.className = "dp-popup";
    popup.addEventListener("mousedown", (e) => e.stopPropagation());
    popup.addEventListener("scroll", (e) => e.stopPropagation(), true);
    popup.addEventListener("wheel", onPopupWheel, { passive: false });
    root.appendChild(popup);
    popups.push(popup);
    popupSeqs.set(popup, 0);
    return popup;
  }

  function removePopup(popup) {
    const i = popups.indexOf(popup);
    if (i < 0) return;
    popups.splice(i, 1);
    if (popup.parentNode) popup.parentNode.removeChild(popup);
    popupSeqs.delete(popup);
  }

  function removeAllPopups() {
    while (popups.length) removePopup(popups[popups.length - 1]);
  }

  function isInsideAnyPopup(node) {
    if (!(node instanceof Node)) return false;
    return popups.some((p) => p === node || p.contains(node));
  }

  function nextSeq(popup) {
    const next = (popupSeqs.get(popup) || 0) + 1;
    popupSeqs.set(popup, next);
    return next;
  }

  function isAlive(popup, seq) {
    return popups.includes(popup) && popupSeqs.get(popup) === seq;
  }

  function showPopupAt(popup, rect) {
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

  // ---------- Lookups -----------------------------------------------------

  function doLookup(popup, word) {
    renderLoading(popup, word);
    const seq = nextSeq(popup);
    chrome.runtime.sendMessage({ action: "lookup", word }, (response) => {
      if (!isAlive(popup, seq)) return;
      if (chrome.runtime.lastError) {
        renderError(popup, word, chrome.runtime.lastError.message || "Lookup failed.");
        return;
      }
      if (!response) {
        renderError(popup, word, "No response from background script.");
        return;
      }
      if (response.source === "dictionary") renderDictionary(popup, response.word, response.data);
      else if (response.source === "urban") renderUrban(popup, response.word, response.data);
      else if (response.source === "error") renderError(popup, word, response.error);
      else renderEmpty(popup, word);
    });
  }

  // Switch a popup from a dictionary view to its UD view for the same word.
  function switchToUrban(popup, word, dictData, cachedUrban) {
    const back = () => renderDictionary(popup, word, dictData, { cachedUrban });

    if (cachedUrban) {
      renderUrban(popup, word, cachedUrban, { onBack: back, fromDictionary: true });
      return;
    }

    renderLoading(popup, word);
    const seq = nextSeq(popup);
    chrome.runtime.sendMessage({ action: "lookup", word, force: "urban" }, (response) => {
      if (!isAlive(popup, seq)) return;
      if (chrome.runtime.lastError) {
        renderError(popup, word, chrome.runtime.lastError.message || "Lookup failed.");
        return;
      }
      if (response && response.source === "urban") {
        const backCached = () => renderDictionary(popup, word, dictData, { cachedUrban: response.data });
        renderUrban(popup, word, response.data, { onBack: backCached, fromDictionary: true });
      } else if (response && response.source === "error") {
        renderError(popup, word, response.error);
      } else {
        // Empty UD result — keep the back button so the user can return.
        popup.innerHTML = "";
        popup.appendChild(header(popup, word, "Urban Dictionary", "dp-badge-urban"));
        const body = el("div", "dp-body");
        body.appendChild(el("p", null, `No Urban Dictionary entries for “${word}”.`));
        popup.appendChild(body);
        const footer = footerEl();
        footer.appendChild(footerButton("← Back to dictionary", back));
        popup.appendChild(footer);
      }
    });
  }

  // ---------- Renderers ---------------------------------------------------

  function header(popup, word, sourceLabel, sourceClass) {
    const div = el("div", "dp-header");
    div.appendChild(el("div", "dp-word", word));
    if (sourceLabel) {
      const badge = el("div", `dp-badge ${sourceClass || ""}`, sourceLabel);
      div.appendChild(badge);
    }
    const close = el("button", "dp-close", "×");
    close.title = "Close";
    close.addEventListener("click", () => removePopup(popup));
    div.appendChild(close);
    return div;
  }

  function renderLoading(popup, word) {
    popup.innerHTML = "";
    popup.appendChild(header(popup, word, "Looking up…", "dp-badge-loading"));
    popup.appendChild(el("div", "dp-body dp-loading", "Searching dictionary…"));
  }

  function renderError(popup, word, message) {
    popup.innerHTML = "";
    popup.appendChild(header(popup, word, "Error", "dp-badge-error"));
    popup.appendChild(el("div", "dp-body", message));
  }

  function renderEmpty(popup, word) {
    popup.innerHTML = "";
    popup.appendChild(header(popup, word, "Not found", "dp-badge-error"));
    const body = el("div", "dp-body");
    body.appendChild(el("p", null, `No entry found for “${word}” in the dictionary or on Urban Dictionary.`));
    popup.appendChild(body);
  }

  function renderDictionary(popup, word, data, opts = {}) {
    popup.innerHTML = "";
    popup.appendChild(header(popup, data.word || word, "Dictionary", "dp-badge-dict"));

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

    popup.appendChild(body);

    const sourceUrl = data.source && data.source.url
      ? data.source.url
      : `https://en.wiktionary.org/wiki/${encodeURIComponent(data.word || word)}`;
    const footer = footerEl();
    const slangBtn = footerButton("Also on Urban Dictionary →", () => {
      switchToUrban(popup, word, data, opts.cachedUrban);
    });
    footer.appendChild(slangBtn);
    footer.appendChild(footerAnchor(sourceUrl, "Open on Wiktionary"));
    popup.appendChild(footer);
  }

  function renderUrban(popup, word, defs, opts = {}) {
    popup.innerHTML = "";
    popup.appendChild(header(popup, defs[0]?.word || word, "Urban Dictionary", "dp-badge-urban"));

    const body = el("div", "dp-body");
    if (opts.fromDictionary) {
      body.appendChild(el("div", "dp-note", "Slang results from Urban Dictionary."));
    } else {
      body.appendChild(el("div", "dp-note", "No standard dictionary entry — showing slang results."));
    }

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

    popup.appendChild(body);

    const footer = footerEl();
    if (opts.onBack) {
      footer.appendChild(footerButton("← Back to dictionary", opts.onBack));
    }
    footer.appendChild(footerAnchor(
      `https://www.urbandictionary.com/define.php?term=${encodeURIComponent(defs[0]?.word || word)}`,
      "Open on Urban Dictionary"
    ));
    popup.appendChild(footer);
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

  function footerEl() {
    return el("div", "dp-footer");
  }

  function footerAnchor(url, label) {
    const a = document.createElement("a");
    a.className = "dp-footer-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    return a;
  }

  function footerButton(label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dp-footer-btn";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
