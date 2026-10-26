/*
 * Shared browser-side furniture: safe DOM construction, the status line and
 * number formatting.
 *
 * Nothing here knows about the map. Everything that ends up on the page goes
 * through `h()` or `textContent`: the AlpIce-1 tables are data the page does
 * not author, and a site name or comment containing markup must not be able to
 * become markup. Taken from the Little Ice Age viewer's js/ui.js.
 */

(function (A) {
  "use strict";

  const el = (id) => document.getElementById(id);

  /* Minimal hyperscript. Children are appended as nodes or as text — never
   * parsed. Known properties are set on the element, anything else becomes an
   * attribute. */
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key === "style") Object.assign(node.style, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child);
    }
    return node;
  }

  /* Only the schemes a citation link can legitimately use become links. */
  const SAFE_URL_SCHEME = /^(?:https?:|mailto:)/i;

  function externalLink(url, label) {
    const text = String(label ?? url ?? "");
    if (!SAFE_URL_SCHEME.test(String(url ?? ""))) return document.createTextNode(text);
    return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, text);
  }

  /* ---------- status line ---------- */

  const STATUS_RANK = { info: 0, busy: 1, error: 2 };
  const statusEntries = new Map();

  function setStatus(key, message, level = "busy") {
    statusEntries.delete(key);
    if (message) statusEntries.set(key, { message, level });
    let top = null;
    for (const entry of statusEntries.values()) {
      if (!top || STATUS_RANK[entry.level] >= STATUS_RANK[top.level]) top = entry;
    }
    const node = el("status");
    if (!node) return;
    node.hidden = !top;
    node.textContent = top ? top.message : "";
    node.dataset.level = top ? top.level : "";
  }

  /* ---------- data on demand ---------- */

  /* A data file loaded the first time it is needed. A script tag rather than
   * fetch(), which a page opened from disk may not use. One promise per file,
   * so a second request waits for the first; a failed load can be retried. */
  const scripts = new Map();

  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(
        src,
        new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = src;
          script.onload = resolve;
          script.onerror = () => {
            scripts.delete(src);
            reject(new Error(`Could not load ${src}`));
          };
          document.head.append(script);
        }),
      );
    }
    return scripts.get(src);
  }

  /* ---------- numbers ---------- */

  /* Years -> "15.53 ka". Ages below 1 ka keep two decimals too, so a column of
   * them lines up. */
  const ka = (years) => (years / 1000).toFixed(2);
  const thousands = (n) => Number(n).toLocaleString("en-GB");

  A.ui = { el, h, externalLink, loadScript, setStatus, clearStatus: (key) => setStatus(key, ""), ka, thousands };
})((window.AlpIce = window.AlpIce || {}));
