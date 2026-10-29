/*
 * The filter panel: age range, method, confidence, palaeoglaciological
 * context and site type, the summary that names every active filter, and the
 * "Colour by" switch with its legend.
 *
 * The filter values live in A.layers.filters, which decides what is drawn;
 * this file only edits them and calls refresh(). Every change goes through
 * changed(), so the controls, the summary and the map never disagree.
 *
 * A click narrows down rather than switching off: with nothing filtered, the
 * first click on a value shows only that value; further clicks add values;
 * clicking a selected value removes it again, and removing the last one shows
 * everything. See toggle().
 */

(function (A) {
  "use strict";

  const { el, h, thousands } = A.ui;
  const layers = A.layers;
  const { filters, ALL, SCHEMES } = layers;
  const DATA = window.ALPICE_DATA || {};
  const FIELDS = DATA.fields || {};
  const fieldInfo = (short) => (FIELDS[short] || [])[1] || null;

  const METHOD_LABELS = { "10Be": "¹⁰Be", "36Cl": "³⁶Cl", "14C": "¹⁴C" };
  const METHOD_INFO = {
    "10Be": "Beryllium-10 surface exposure ages, and the TCN events built from them.",
    "36Cl": "Chlorine-36 surface exposure ages, and the TCN events built from them.",
    "14C": "Radiocarbon ages and radiocarbon events.",
  };
  const CONFIDENCE_INFO = {
    unaccepted: "Did not pass the AlpIce-1 quality control.",
  };
  /* Table 5 of Kamleitner et al. (2026), shortened. */
  // #!!!! EDIT HERE THE CONTEXT DESCRIPTIONS !!!!
  const CONTEXT_INFO = {
    "ice free":
      "Dated material testifies ice-free conditions, no (morpho)stratigraphic relation to glacial " +
      "deposits observed, e.g. TCN-dated mass wasting event or rock-glacier formation, radiocarbon " +
      "age from organics in a lake core or archaeological artefacts.",
    "ice advance":
      "Dated material constrains the timing of ice build-up: ice cover postdates the age, e.g. " +
      "radiocarbon age from bones in advance gravels underlying till, or from organics within basal till.",
    "ice retreat":
      "Dated material records ice-free conditions following ice cover, e.g. TCN-dated isolated " +
      "erratic boulder, radiocarbon age from organics at the base of a peat core above till.",
    "ice retreat/readvance":
      "Dated material specifies ice-free conditions in between two phases of ice cover, e.g. " +
      "radiocarbon age from a buried palaeosol within a lateral moraine.",
    "ice margin":
      "Dated material relates to glacier stabilization at an ice-marginal position, e.g. TCN " +
      "surface exposure age from a moraine boulder, radiocarbon age from organics in an ice-contact deposit.",
    "bedrock exposure":
      "Age records the cumulative length of exposure on site, e.g. TCN surface exposure age from " +
      "glacially polished bedrock. Simple (minimum age for deglaciation) and complex exposure " +
      "scenarios are possible.",
    "ice cover":
      "Dated material indicates glaciated conditions, e.g. radiocarbon age from organic matter in an ice core.",
    ambiguous:
      "Dates from geomorphologically or stratigraphically equivocal situations, or lacking " +
      "sufficient contextual information.",
  };

  /* Ages per site type, for the list. Static totals: they say how much there
   * is of each type, not how much the other filters leave. */
  const siteCounts = {};
  for (const f of DATA.samples?.features ?? []) {
    siteCounts[f.properties.st] = (siteCounts[f.properties.st] || 0) + 1;
  }

  /* Every change ends here. */
  const syncers = [];
  function changed() {
    for (const sync of syncers) sync();
    renderSummary();
    layers.refresh();
  }

  /* One click on a filter value, as described at the top of this file. */
  function toggle(key, value) {
    A.stats.track(`filter/${key}/${value}`);
    const set = filters[key];
    if (set.size === ALL[key].length) {
      set.clear();
      set.add(value);
    } else if (set.has(value)) {
      set.delete(value);
      if (!set.size) for (const v of ALL[key]) set.add(v);
    } else {
      set.add(value);
    }
    changed();
  }

  /* Shown as selected only while the filter narrows anything down: with all
   * values in, no chip is highlighted. */
  const selected = (key, value) => filters[key].size < ALL[key].length && filters[key].has(value);

  /* ---------- chips ---------- */

  /* The colour a chip shows as a dot while the map is coloured by its group. */
  function chipColour(scheme, value) {
    const key = scheme === "method" ? (value === "14C" ? "14C" : "TCN") : value;
    return SCHEMES[scheme].entries.find(([v]) => v === key)?.[2];
  }

  function chips(containerId, key, scheme, labels = {}, infos = {}) {
    const container = el(containerId);
    const buttons = ALL[key].map((value) => {
      const dot = h("span", { class: "chip-dot", style: { background: chipColour(scheme, value) } });
      const button = h(
        "button",
        { type: "button", "data-info": infos[value] || null, onclick: () => toggle(key, value) },
        dot,
        labels[value] || value,
      );
      container.append(button);
      return [value, button, dot];
    });
    syncers.push(() => {
      for (const [value, button, dot] of buttons) {
        button.setAttribute("aria-pressed", String(selected(key, value)));
        dot.hidden = layers.colourMode !== scheme;
      }
    });
  }

  chips("methods", "methods", "method", METHOD_LABELS, METHOD_INFO);
  chips("confidence", "confidence", "confidence", {}, CONFIDENCE_INFO);
  chips("contexts", "contexts", "context", {}, CONTEXT_INFO);
  el("contexts-label").dataset.info = fieldInfo("pc_cat") || "";

  /* ---------- site types ---------- */

  const siteRows = layers.SITE_TYPES.map(({ code, name }) => {
    const button = h(
      "button",
      { type: "button", class: "site-row", onclick: () => toggle("siteTypes", code) },
      h("span", { class: "site-code" }, code),
      h("span", { class: "site-name" }, name),
      h("span", { class: "count" }, siteCounts[code] ? thousands(siteCounts[code]) : "–"),
    );
    el("site-types-list").append(button);
    return [code, button];
  });
  syncers.push(() => {
    for (const [code, button] of siteRows) button.setAttribute("aria-pressed", String(selected("siteTypes", code)));
    const n = filters.siteTypes.size;
    el("site-types-state").textContent = n === ALL.siteTypes.length ? "all" : `${n} of ${ALL.siteTypes.length}`;
    el("site-types-all").hidden = n === ALL.siteTypes.length;
  });
  el("site-types-all").addEventListener("click", () => {
    A.stats.track("filter/siteTypes/all");
    for (const code of ALL.siteTypes) filters.siteTypes.add(code);
    changed();
  });

  /* ---------- age range ---------- */

  const ageMin = el("age-min");
  const ageMax = el("age-max");
  const max = layers.AGE_MAX_KA;
  for (const input of [ageMin, ageMax]) input.max = String(max);

  function readAge(moved) {
    let lo = Number(ageMin.value);
    let hi = Number(ageMax.value);
    if (lo > hi) {
      if (moved === ageMin) hi = lo;
      else lo = hi;
    }
    filters.age[0] = lo;
    filters.age[1] = hi;
    changed();
  }
  ageMin.addEventListener("input", () => readAge(ageMin));
  ageMax.addEventListener("input", () => readAge(ageMax));
  // "change" fires once, when the slider is let go.
  ageMin.addEventListener("change", () => A.stats.track("filter/age/youngest"));
  ageMax.addEventListener("change", () => A.stats.track("filter/age/oldest"));

  // Oldest first, as on the bar (old ages on the left).
  const ageText = () => `${filters.age[1] >= max ? `${max}+` : filters.age[1]} – ${filters.age[0]} ka`;
  syncers.push(() => {
    const [lo, hi] = filters.age;
    ageMin.value = String(lo);
    ageMax.value = String(hi);
    el("age-value").textContent = ageText();
    el("age-track").style.setProperty("--lo", `${(lo / max) * 100}%`);
    el("age-track").style.setProperty("--hi", `${(hi / max) * 100}%`);
  });

  /* ---------- summary ---------- */

  /* What each active filter reads as, and how to clear it. Listing what is
   * kept is shorter than listing what is hidden for most choices, except when
   * almost everything is kept. */
  function describeSet(key, label, names = {}) {
    const set = filters[key];
    const all = ALL[key];
    if (set.size === all.length) return null;
    const kept = all.filter((value) => set.has(value)).map((value) => names[value] || value);
    const hidden = all.filter((value) => !set.has(value)).map((value) => names[value] || value);
    let text;
    if (!kept.length) text = "none";
    else if (hidden.length < kept.length && kept.length > 3) text = `all but ${hidden.join(", ")}`;
    else if (kept.length > 4) text = `${kept.length} of ${all.length}`;
    else text = kept.join(", ");
    return {
      text: `${label}: ${text}`,
      clear: () => {
        for (const value of all) set.add(value);
      },
    };
  }

  function activeFilters() {
    const active = [];
    if (filters.age[0] > 0 || filters.age[1] < max) {
      active.push({
        text: `Age: ${ageText()}`,
        clear: () => {
          filters.age[0] = 0;
          filters.age[1] = max;
        },
      });
    }
    active.push(
      describeSet("methods", "Method", METHOD_LABELS),
      describeSet("confidence", "Confidence"),
      describeSet("contexts", "Context"),
      describeSet("siteTypes", "Site type"),
    );
    return active.filter(Boolean);
  }

  /* What the filters leave, from the last refresh. */
  let counts = null;
  layers.onCounts((latest) => {
    counts = latest;
    renderSummary();
  });

  function countLine() {
    if (!counts) return null;
    const [ages, allAges] = counts.samples;
    const [events, allEvents] = counts.events;
    return h(
      "p",
      { class: ages + events ? "hint filter-count" : "hint filter-count empty" },
      ages + events
        ? `Showing ${thousands(ages)} of ${thousands(allAges)} ages, ${thousands(events)} of ${thousands(allEvents)} events.`
        : "No ages or events match these filters.",
    );
  }

  function renderSummary() {
    const active = activeFilters();
    el("filters-reset").hidden = !active.length;
    el("filter-status").classList.toggle("active", active.length > 0);
    const summary = el("filter-summary");
    if (!active.length) {
      summary.replaceChildren(h("p", { class: "hint" }, "None: all ages and events are shown."));
      return;
    }
    summary.replaceChildren(
      countLine() || "",
      ...active.map(({ text, clear }) =>
        h(
          "button",
          {
            type: "button",
            class: "filter-tag",
            title: "Remove this filter",
            onclick: () => {
              A.stats.track("filter/remove-one");
              clear();
              changed();
            },
          },
          text,
          h("span", { class: "filter-x", "aria-hidden": "true" }, "×"),
        ),
      ),
    );
  }

  el("filters-reset").addEventListener("click", () => {
    A.stats.track("filter/reset");
    layers.resetFilters();
    changed();
  });

  /* ---------- colour by ---------- */

  const colourButtons = el("colour-by").querySelectorAll("button");
  for (const button of colourButtons) {
    button.addEventListener("click", () => {
      A.stats.track(`colour/${button.dataset.value}`);
      layers.setColourMode(button.dataset.value);
      changed();
    });
  }
  syncers.push(() => {
    const mode = layers.colourMode;
    for (const button of colourButtons) button.setAttribute("aria-checked", String(button.dataset.value === mode));
    // The age gradient is the legend only while the map is coloured by age.
    el("legend-bar").hidden = mode !== "age";
    el("age-colour-note").hidden = mode !== "age";
    const legend = el("category-legend");
    legend.hidden = mode === "age";
    if (mode === "age") return;
    const scheme = SCHEMES[mode];
    const entries = scheme.entries.map(([, label, colour]) => [label, colour]);
    if (scheme.fallbackLabel) entries.push([scheme.fallbackLabel, scheme.fallback]);
    legend.replaceChildren(
      ...entries.map(([label, colour]) =>
        h("span", { class: "legend-item" }, h("span", { class: "swatch", style: { background: colour } }), label),
      ),
      h("p", { class: "hint" }, "Colours as in Fig. 3 of Kamleitner et al. (2026)."),
    );
  });

  A.filters = { changed };
  changed();
})((window.AlpIce = window.AlpIce || {}));
