/*
 * Entry point: wires the panel to the map and the data layers.
 */

(function (A) {
  "use strict";

  const { el, h, thousands, setStatus } = A.ui;
  const { map, setBasemap, setImageryShade, setLabels } = A.map;
  const layers = A.layers;
  const DATA = window.ALPICE_DATA;

  if (!DATA || !DATA.samples) {
    setStatus("data", "The AlpIce-1 data (data/alpice-core.js) could not be loaded.", "error");
  }

  /* ---------- panel collapse ---------- */

  const panel = el("panel");
  const toggle = el("panel-toggle");
  function setExpanded(open) {
    panel.classList.toggle("expanded", open);
    panel.classList.toggle("collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector(".chevron").classList.toggle("closed", !open);
  }
  // The panel covers most of a phone screen, so there it opens collapsed.
  setExpanded(!window.matchMedia("(max-width: 640px)").matches);
  toggle.addEventListener("click", () => {
    const open = !panel.classList.contains("expanded");
    A.stats.track(`panel/${open ? "open" : "close"}`);
    setExpanded(open);
  });

  /* The contribution address, put together here so it is not in the HTML. */
  el("contribute-mail").addEventListener("click", () => A.stats.track("contribute/e-mail"));
  el("contribute-mail").href = `mailto:${["alpice", "geo.uzh.ch"].join("@")}?subject=AlpIce-1`;

  /* Collapsible sections: Glacier outlines, Map options, Contribute, Credits. */
  for (const button of document.querySelectorAll("[data-section]")) {
    const body = el(button.dataset.section);
    button.addEventListener("click", () => {
      const open = body.hidden;
      if (open) A.stats.track(`section/${button.dataset.section}`);
      body.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
      button.querySelector(".chevron").classList.toggle("closed", !open);
    });
  }

  /* ---------- layers ---------- */

  for (const group of ["samples", "events", "landforms"]) {
    const box = el(`show-${group}`);
    box.checked = layers.visible[group];
    box.addEventListener("change", () => {
      A.stats.track(`layer/${group}/${box.checked ? "on" : "off"}`);
      layers.setVisible(group, box.checked);
    });
  }

  /* The filters (age, method, confidence, context, site type) are wired in
   * js/filters.js. */

  /* ---------- legend ---------- */

  const max = layers.AGE_MAX_KA;
  const stops = layers.AGE_STOPS.map(([age, colour]) => `${colour} ${(age / 1000 / max) * 100}%`);
  // Old ages on the left, young on the right, as the age track (dir="rtl" in index.html).
  el("legend-bar").style.background = `linear-gradient(to left, ${stops.join(", ")})`;
  const ticks = el("legend-ticks");
  for (let k = 0; k <= max; k += 5) {
    ticks.append(h("span", { style: { right: `${(k / max) * 100}%` } }, k === max ? `${k}+` : String(k)));
  }

  /* ---------- counts ---------- */

  layers.onCounts((counts) => {
    for (const group of ["samples", "events", "landforms"]) {
      const [shown, total] = counts[group];
      el(`count-${group}`).textContent = shown === total ? thousands(total) : `${thousands(shown)} / ${thousands(total)}`;
    }
  });

  /* ---------- map options ---------- */

  const basemapButtons = el("basemap-style").querySelectorAll("button");
  for (const button of basemapButtons) {
    button.addEventListener("click", () => {
      for (const other of basemapButtons) other.setAttribute("aria-checked", String(other === button));
      setBasemap(button.dataset.value);
      el("shade-rows").hidden = button.dataset.value !== "imagery";
    });
  }

  const shade = el("imagery-shade");
  const shadeStrength = el("shade-strength");
  const applyShade = () => {
    el("shade-strength-value").textContent = `${shadeStrength.value}%`;
    setImageryShade(shade.checked, Number(shadeStrength.value) / 100);
  };
  shade.addEventListener("change", () => {
    A.stats.track(`imagery-shade/${shade.checked ? "on" : "off"}`);
    applyShade();
  });
  shadeStrength.addEventListener("input", applyShade);
  shadeStrength.addEventListener("change", () => A.stats.track("imagery-shade/strength"));

  el("labels").addEventListener("change", (event) => {
    A.stats.track(`labels/${event.target.checked ? "on" : "off"}`);
    setLabels(event.target.checked);
  });

  /* Links leaving the page (paper, data, the studies in the popups), by
   * address. One listener, so links built later in popups count too. */
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href^='http']");
    if (link) A.stats.track(`link/${link.hostname}${link.pathname}`);
  });

  /* ---------- clicks ---------- */

  map.on("click", (event) => A.popup.open(event.lngLat, layers.hitsAt(event.point)));
  map.on("mousemove", (event) => {
    map.getCanvas().style.cursor = layers.hitsAt(event.point).length ? "pointer" : "";
  });

  /* ---------- go ---------- */

  const meta = DATA?.meta;
  if (meta) {
    el("data-note").textContent =
      `${thousands(meta.counts.samples)} ages with coordinates; ` +
      `${meta.counts.samples_without_coordinates} radiocarbon ages without coordinates are not on the map.`;
  }
  // The outlines go below the AlpIce-1 layers, so they wait for them.
  layers.install().then(() => A.outlines.install());
  A.tour.init({ openPanel: () => setExpanded(true) });
})((window.AlpIce = window.AlpIce || {}));
