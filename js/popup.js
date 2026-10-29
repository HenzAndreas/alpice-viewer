/*
 * The popup: what a click on an age, an event or a landform shows.
 *
 * Two views, switched in the popup and remembered for the next one:
 *   Easy      the age, the site, its context and the reference;
 *   Advanced  every column of the AlpIce-1 table, grouped as in the Excel
 *             files, with the README's description of each field on hover.
 *
 * The advanced columns of individual ages are in data/alpice-details.js,
 * loaded the first time someone asks for them. An event links to the ages it
 * was computed from, and each age back to its event.
 */

(function (A) {
  "use strict";

  const { map } = A.map;
  const { h, externalLink, loadScript, ka, setStatus, clearStatus } = A.ui;
  const layers = A.layers;
  const DATA = window.ALPICE_DATA || {};
  const REFERENCES = DATA.references || {};
  const FIELDS = DATA.fields || {};
  const DESCRIPTIONS = DATA.descriptions || {};

  /* Fields documented only in the GIS READMEs (Data S6), not the Excel ones. */
  const GIS_FIELDS = {
    site_names: ["Site names", "Geographic names of dated site/landform."],
    source: ["Mapping source", "Source of digital mapping (original publication, manually digitized, provided by authors upon request)."],
    samp_10Be: ["10Be samples", "10Be surface exposure samples/ages available from the landform. Sample names as used in source publication."],
    samp_36Cl: ["36Cl samples", "36Cl surface exposure samples/ages available from the landform. Sample names as used in source publication."],
  };

  const METHOD_NAMES = {
    "10Be": "¹⁰Be exposure age",
    "36Cl": "³⁶Cl exposure age",
    "14C": "Radiocarbon age",
    TCN: "TCN exposure event age",
  };

  /* ---------- view mode ---------- */

  let mode = "easy";
  try {
    if (localStorage.getItem("alpice-popup-mode") === "advanced") mode = "advanced";
  } catch {
    /* Storage blocked: start in the easy view. */
  }

  function setMode(value) {
    mode = value;
    try {
      localStorage.setItem("alpice-popup-mode", value);
    } catch {
      /* Not remembered then. */
    }
  }

  /* ---------- details on demand ---------- */

  function loadDetails() {
    if (DATA.details) return Promise.resolve();
    setStatus("details", "Loading the full AlpIce-1 tables…");
    return loadScript("data/alpice-details.js").then(
      () => clearStatus("details"),
      (error) => {
        setStatus("details", "Could not load data/alpice-details.js.", "error");
        throw error;
      },
    );
  }

  /* ---------- formatting ---------- */

  function sampleAge(p) {
    if (p.r_exp_age !== undefined) {
      return p.r_ext_err !== undefined ? `${ka(p.r_exp_age)} ± ${ka(p.r_ext_err)} ka` : `${ka(p.r_exp_age)} ka`;
    }
    if (p.recal_min !== undefined && p.recal_max !== undefined) {
      return `${ka(p.recal_min)}–${ka(p.recal_max)} ka cal BP`;
    }
    return "no recalculated age";
  }

  function eventAge(p) {
    if (p.e_age_min !== undefined && p.e_age_max !== undefined) {
      return `${ka(p.e_age_min)}–${ka(p.e_age_max)} ka cal BP`;
    }
    if (p.e_age !== undefined) {
      return `${ka(p.e_age)} +${ka(p.e_pos_err ?? 0)} / −${ka(p.e_neg_err ?? 0)} ka`;
    }
    return "not dated";
  }

  const AGE_NOTE = {
    TCN: "Exposure age before sample collection, external 1σ error.",
    "14C": "95.4 % calibrated range (IntCal20), years before 1950.",
    TCN_EVENT: "Mean of the high- and medium-confidence ages; error from the 16th–84th percentile.",
  };

  function swatch(age) {
    const colour = age === undefined ? layers.NO_AGE_COLOUR : colourAt(age);
    return h("span", { class: "swatch", style: { background: colour } });
  }

  function colourAt(age) {
    const stops = layers.AGE_STOPS;
    if (age <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (age <= stops[i][0]) {
        const [a0, c0] = stops[i - 1];
        const [a1, c1] = stops[i];
        return mix(c0, c1, (age - a0) / (a1 - a0));
      }
    }
    return stops[stops.length - 1][1];
  }

  function mix(c0, c1, t) {
    const parse = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const [a, b] = [parse(c0), parse(c1)];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  }

  /* ---------- field descriptions ---------- */

  /* The easy view's labels and the AlpIce-1 field each one shows, for its
   * description. "Context" shows pc_cat with its sub-classes. */
  const ROW_FIELDS = {
    Site: "site_name",
    "Site type": "site_type",
    Sample: "samp_name",
    Confidence: "confid_ra",
    Context: "pc_cat",
    Palaeoglacier: "pgl_name",
    Event: "event",
    Reference: "orig_ref",
    "Compiled in": "comp_ref",
    "Date-ID": "date_ID",
    "Site-ID": "site_ID",
    Ages: "confid_no",
    Mapping: "source",
  };

  const fieldInfo = (short) => (FIELDS[short] || GIS_FIELDS[short] || [])[1] || null;

  /* A label with a description gets a small info box on hover, and on tap
   * where there is no hover. The browser's own `title` tooltip took a second
   * to appear, vanished on the slightest move and never showed on touch. */
  function fieldLabel(label, info) {
    return h("span", { class: "pop-key", "data-info": info || null, tabindex: info ? "0" : null }, label);
  }

  const tip = h("div", { class: "info-tip", role: "tooltip", hidden: true });
  document.body.append(tip);
  let tipFor = null;

  function showTip(target) {
    tipFor = target;
    tip.textContent = target.dataset.info;
    tip.hidden = false;
    const box = target.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    const below = box.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? box.top - height - 6 : below;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTip() {
    tipFor = null;
    tip.hidden = true;
  }

  // Popup field names, and the filter chips and labels in the panel.
  const infoTarget = (event) => event.target.closest?.('[data-info]:not([data-info=""])');
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = infoTarget(event);
    if (target) showTip(target);
  });
  document.addEventListener("pointerout", (event) => {
    if (event.pointerType === "mouse" && infoTarget(event)) hideTip();
  });
  document.addEventListener("click", (event) => {
    const target = infoTarget(event);
    if (target && target !== tipFor) showTip(target);
    else hideTip();
  });
  document.addEventListener("focusin", (event) => {
    const target = infoTarget(event);
    if (target) showTip(target);
  });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("scroll", hideTip, true);

  /* A row of the easy view; left out when there is nothing to show. */
  /* `label` may be [label, info] for a description other than the field's. */
  function row(label, ...values) {
    const shown = values.flat().filter((v) => v !== undefined && v !== null && v !== "");
    if (!shown.length) return null;
    const parts = [];
    shown.forEach((v, i) => {
      if (i) parts.push(", ");
      parts.push(v);
    });
    const [name, info] = Array.isArray(label) ? label : [label, fieldInfo(ROW_FIELDS[label])];
    return h("div", { class: "pop-row" }, fieldLabel(name, info), h("span", { class: "pop-val" }, parts));
  }

  function references(text) {
    if (!text) return null;
    const parts = REFERENCES[text] || [{ short: text }];
    return h(
      "span",
      {},
      parts.flatMap((ref, i) => {
        const link = ref.doi ? externalLink(ref.doi, ref.short) : document.createTextNode(ref.short);
        if (ref.full && link.nodeType === 1) link.title = ref.full;
        return i ? ["; ", link] : [link];
      }),
    );
  }

  /* Element.append() would write a null as the text "null". */
  function add(parent, ...nodes) {
    parent.append(...nodes.flat().filter((node) => node !== null && node !== undefined && node !== false));
  }

  /* "ice margin (ICEM)": the code is how the Site-IDs and the site-type
   * filter name the type. */
  const SITE_NAMES = Object.fromEntries((DATA.siteTypes || []).map((type) => [type.code, type.name]));
  const siteType = (p) => (p.site_type && p.st ? `${p.site_type} (${p.st})` : p.site_type);

  /* The Site-ID's description, with its own code spelled out. */
  function siteIdInfo(siteId) {
    const codes = String(siteId || "")
      .split("_")
      .map((part) => part.split("-")[0])
      .filter((code, i, all) => SITE_NAMES[code] && all.indexOf(code) === i);
    const spelled = codes.map((code) => `${code} = ${SITE_NAMES[code]}`).join(", ");
    return [spelled && `${spelled}.`, fieldInfo("site_ID")].filter(Boolean).join(" ");
  }

  function joinNonEmpty(values, separator = " · ") {
    return values.filter((v) => v !== undefined && v !== null && v !== "").join(separator) || undefined;
  }

  function linkButton(label, onClick, age) {
    return h("button", { type: "button", class: "pop-link", onclick: onClick }, age !== false ? swatch(age) : null, label);
  }

  /* ---------- the popup ---------- */

  const popup = new maplibregl.Popup({ maxWidth: "380px", className: "alpice-popup", focusAfterOpen: false });
  popup.on("close", () => {
    layers.select(null);
    hideTip();
  });

  let history = [];

  /* `hits` is [{kind, feature}]; several hits open as a list to choose from. */
  function open(lngLat, hits) {
    history = [];
    if (!hits.length) return popup.remove();
    if (hits.length === 1) return show(hits[0], lngLat);
    showList(hits, lngLat);
  }

  function render(content, lngLat) {
    popup.setDOMContent(content);
    if (lngLat) popup.setLngLat(lngLat);
    if (!popup.isOpen()) popup.addTo(map);
    requestAnimationFrame(keepInView);
  }

  /* MapLibre places the popup above or below its point but does not move the
   * map, so a tall popup near an edge runs off screen. Pan just enough. */
  function keepInView() {
    const node = popup.getElement();
    if (!node) return;
    const box = node.getBoundingClientRect();
    const frame = map.getContainer().getBoundingClientRect();
    const margin = 10;
    let dy = 0;
    if (box.top < frame.top + margin) dy = box.top - frame.top - margin;
    else if (box.bottom > frame.bottom - margin) dy = Math.min(box.bottom - frame.bottom + margin, box.top - frame.top - margin);
    if (dy) map.panBy([0, dy], { duration: 300 });
  }

  function showList(hits, lngLat) {
    layers.select(null);
    const items = hits.map((hit) => {
      const p = hit.feature.properties;
      const label =
        hit.kind === "sample"
          ? joinNonEmpty([sampleAge(p), p.m, p.samp_name])
          : hit.kind === "event"
            ? joinNonEmpty(["Event", eventAge(p), p.site_names || p.site_name])
            : joinNonEmpty(["Landform", p.site_type, p.site_names]);
      return linkButton(
        label,
        () => {
          history.push(() => showList(hits, lngLat));
          show(hit, lngLat);
        },
        hit.kind === "landform" ? false : p.age,
      );
    });
    render(h("div", {}, h("div", { class: "pop-head" }, `${hits.length} features here`), h("div", { class: "pop-list" }, items)), lngLat);
  }

  function anchorOf(kind, feature, lngLat) {
    if (feature.geometry.type === "Point") return feature.geometry.coordinates;
    if (kind === "event" && !lngLat) return feature.properties.rep;
    return lngLat;
  }

  function show(hit, lngLat) {
    const { kind, feature } = hit;
    A.stats.track(`popup/${kind}/${mode === "easy" ? "overview" : "full-record"}`);
    layers.select(kind, feature);
    const anchor = anchorOf(kind, feature, lngLat);
    const body = h("div", {});
    const back = history.length
      ? h("button", { type: "button", class: "pop-back", onclick: () => history.pop()() }, "‹ Back")
      : null;
    const tabs = h(
      "div",
      { class: "segmented pop-tabs", role: "radiogroup", "aria-label": "Detail level" },
      ["easy", "advanced"].map((value) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(mode === value),
            onclick: () => {
              setMode(value);
              show(hit, lngLat);
            },
          },
          value === "easy" ? "Overview" : "Full record",
        ),
      ),
    );
    body.append(h("div", { class: "pop-bar" }, back, tabs));
    const content = h("div", { class: "pop-body" });
    body.append(content);
    render(body, anchor);

    const fill = kind === "sample" ? fillSample : kind === "event" ? fillEvent : fillLandform;
    fill(content, feature.properties, hit, lngLat);
  }

  /* Opening a linked feature from inside a popup keeps a way back. */
  function follow(fromHit, fromLngLat, toKind, feature) {
    history.push(() => show(fromHit, fromLngLat));
    show({ kind: toKind, feature }, null);
  }

  /* ---------- individual ages ---------- */

  function fillSample(content, p, hit, lngLat) {
    const isTcn = p.m !== "14C";
    add(content, 
      h("div", { class: "pop-head" }, METHOD_NAMES[p.m] || p.m),
      h("div", { class: "pop-age" }, swatch(p.age), sampleAge(p)),
      h("div", { class: "pop-note" }, isTcn ? AGE_NOTE.TCN : AGE_NOTE["14C"]),
    );
    const events = (p.events || []).map((eid) => layers.byEventId.get(eid)).filter(Boolean);
    const eventLinks = events.map((event) =>
      linkButton(`Event age ${eventAge(event.properties)}`, () => follow(hit, lngLat, "event", event), event.properties.age),
    );

    if (mode === "advanced") {
      add(content, h("div", { class: "pop-loading" }, "Loading…"));
      loadDetails()
        .then(() => {
          content.querySelector(".pop-loading")?.remove();
          add(content, detailsTable(p));
          if (eventLinks.length) add(content, h("div", { class: "pop-head" }, "Contributes to event age"), h("div", { class: "pop-list" }, eventLinks));
          // The table arrived after the popup was placed, and made it taller.
          requestAnimationFrame(keepInView);
        })
        .catch(() => {
          const node = content.querySelector(".pop-loading");
          if (node) node.textContent = "The full table could not be loaded.";
        });
      return;
    }

    add(content, 
      row("Site", p.site_name, joinNonEmpty([p.region, p.country], ", ")),
      row("Site type", siteType(p)),
      row("Sample", joinNonEmpty([p.samp_name, p.sample_tp, p.elevation !== undefined ? `${p.elevation} m a.s.l.` : undefined, p.sample_dp !== undefined ? `depth ${p.sample_dp} cm` : undefined])),
      row("Confidence", p.confid_ra),
      row("Context", joinNonEmpty([p.pc_cat, p.pc_subcat, p.pc_time], " · ")),
      row("Palaeoglacier", joinNonEmpty([p.pgl_name, p.pgl_stad], " · ")),
      row("Event", p.event),
      row("Reference", references(p.orig_ref)),
      row("Compiled in", references(p.comp_ref)),
      row("Date-ID", p.date_ID),
    );
    if (eventLinks.length) add(content, h("div", { class: "pop-head" }, "Contributes to event age"), h("div", { class: "pop-list" }, eventLinks));
  }

  /* Every Excel column for one age, under its group heading. */
  function detailsTable(p) {
    const schema = DATA.detailSchemas?.[p.m] || [];
    const values = DATA.details?.[p.date_ID] || [];
    const wrap = h("div", { class: "pop-table" });
    let group = null;
    schema.forEach((column, i) => {
      const value = values[i];
      if (value === null || value === undefined) return;
      if (column.group !== group) {
        group = column.group;
        wrap.append(h("div", { class: "pop-group" }, group || ""));
      }
      const label = fieldLabel(column.label, column.description || DESCRIPTIONS[column.label]);
      const shown = column.short === "orig_ref" || column.short === "comp_ref" ? references(value) : String(value);
      wrap.append(h("div", { class: "pop-row" }, label, h("span", { class: "pop-val" }, shown)));
    });
    wrap.append(h("div", { class: "pop-note" }, "A hyphen or blank in AlpIce-1 means not available or not applicable; those fields are left out."));
    return wrap;
  }

  /* ---------- event ages ---------- */

  const EVENT_HIDDEN = new Set(["geom", "eid", "age", "age_lo", "age_hi", "samples", "rep"]);

  function fillEvent(content, p, hit, lngLat) {
    const isTcn = p.method !== "14C";
    const geom = { point: "point", line: "mapped line", polygon: "mapped polygon" }[p.geom];
    add(content, 
      h("div", { class: "pop-head" }, isTcn ? METHOD_NAMES.TCN : "Radiocarbon event age"),
      h("div", { class: "pop-age" }, swatch(p.age), eventAge(p)),
      h("div", { class: "pop-note" }, isTcn ? AGE_NOTE.TCN_EVENT : AGE_NOTE["14C"]),
    );

    const members = (p.samples || []).map((id) => layers.byDateId.get(id)).filter(Boolean);
    const memberLinks = members.map((sample) =>
      linkButton(
        joinNonEmpty([sample.properties.samp_name, sampleAge(sample.properties), sample.properties.confid_ra]),
        () => follow(hit, lngLat, "sample", sample),
        sample.properties.age,
      ),
    );

    if (mode === "advanced") {
      const wrap = h("div", { class: "pop-table" });
      for (const [key, value] of Object.entries(p)) {
        if (EVENT_HIDDEN.has(key)) continue;
        const [label, description] = FIELDS[key] || GIS_FIELDS[key] || [key, ""];
        const shown = key === "orig_ref" || key === "comp_ref" ? references(value) : String(value);
        wrap.append(h("div", { class: "pop-row" }, fieldLabel(label, description), h("span", { class: "pop-val" }, shown)));
      }
      add(wrap, row("Geometry", geom), row("Event ID", p.eid));
      add(content, wrap);
    } else {
      add(content, 
        row("Site", p.site_names || p.site_name, p.region),
        row(["Site type · geometry", fieldInfo("site_type")], joinNonEmpty([siteType(p), geom], " · ")),
        row("Context", joinNonEmpty([p.pc_cat, p.pc_subcat, p.pc_time], " · ")),
        row("Palaeoglacier", joinNonEmpty([p.pgl_name, p.pgl_stad], " · ")),
        row("Ages", isTcn ? p.confid_no : p.confid_ra),
        row("Mapping", p.source),
        row("Reference", references(p.orig_ref)),
        row("Compiled in", references(p.comp_ref)),
        isTcn ? row(["Site-ID", siteIdInfo(p.site_ID)], p.site_ID) : row("Date-ID", p.date_ID),
      );
    }
    if (memberLinks.length) {
      add(content, 
        h("div", { class: "pop-head" }, isTcn ? `Contributing individual ages (${memberLinks.length})` : "Defining age"),
        h("div", { class: "pop-list" }, memberLinks),
      );
    }
  }

  /* ---------- landform catalogue ---------- */

  function fillLandform(content, p, hit, lngLat) {
    const event = layers.byEventId.get(p.site_ID);
    add(content, 
      h("div", { class: "pop-head" }, `Landform · ${p.site_type || p.layer}`),
      h("div", { class: "pop-age" }, p.dated ? [swatch(p.e_age), eventAge(p)] : "Not dated"),
      p.dated ? null : h("div", { class: "pop-note" }, "Mapped in the source study, included for completeness."),
    );
    if (mode === "advanced") {
      const wrap = h("div", { class: "pop-table" });
      for (const [key, value] of Object.entries(p)) {
        if (key === "dated" || key === "layer") continue;
        const [label, description] = FIELDS[key] || GIS_FIELDS[key] || [key, ""];
        const shown = key === "orig_ref" ? references(value) : String(value);
        wrap.append(h("div", { class: "pop-row" }, fieldLabel(label, description), h("span", { class: "pop-val" }, shown)));
      }
      add(content, wrap);
    } else {
      add(content, 
        row("Site", p.site_names),
        row("Context", joinNonEmpty([p.pc_cat, p.pc_subcat, p.pc_time], " · ")),
        row("Palaeoglacier", joinNonEmpty([p.pgl_name, p.pgl_stad], " · ")),
        row("Ages", p.confid_no),
        row("Mapping", p.source),
        row("Reference", references(p.orig_ref)),
        row(["Site-ID", siteIdInfo(p.site_ID)], p.site_ID),
      );
    }
    if (event) {
      add(content, h("div", { class: "pop-list" }, linkButton("Open the event age", () => follow(hit, lngLat, "event", event), event.properties.age)));
    }
  }

  A.popup = { open, show, close: () => popup.remove(), colourAt, loadDetails };
})((window.AlpIce = window.AlpIce || {}));
