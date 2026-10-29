/*
 * The intro tour: a few cards, each pointing at one control and saying what it
 * does. It opens by itself on a first visit and again from the "?" button in
 * the panel header. Ported from the Little Ice Age viewer's js/tour.js, as a
 * classic script like the rest of js/.
 *
 * Each step names its target by selector and is skipped when the target is not
 * on the page, so the tour never points at nothing. The highlighted control
 * sits in a cut-out of the dimmed page; the card is placed beside it wherever
 * there is room.
 */

(function (A) {
  "use strict";

  const { map } = A.map;
  const { el, h } = A.ui;

  const SEEN_KEY = "alpice-viewer-tour-seen";
  const GAP_PX = 12;
  const MARGIN_PX = 10;
  const SPOT_PAD_PX = 6;
  const HINT_MS = 6000;

  /* A phone or tablet: no mouse to describe. */
  const touchOnly = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  /* The example the "details" step opens by itself: the Gurten-stadial lateral moraine of the Aare
   * glacier near Bern, five ¹⁰Be ages and a mapped ice-margin line. */
  // #!!!! EDIT HERE THE TOUR EXAMPLE !!!!
  const EXAMPLE_EVENT = "ICEM-Wuethrich2018-A";
  const EXAMPLE_VIEW = { center: [7.474, 46.858], zoom: 12.3 };

  /* What the map looked like before the example, restored when the step is left. */
  let before = null;

  function showExample() {
    const event = A.layers.byEventId.get(EXAMPLE_EVENT);
    if (!event) return;
    const box = el("show-events");
    before = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), events: box.checked };
    if (!box.checked) box.click();
    map.once("moveend", () => {
      // Next may have been pressed during the flight: then the step is gone.
      if (!before) return;
      A.popup.show({ kind: "event", feature: event }, null);
      // The card moves beside the popup once it exists; the popup then pans
      // itself into view, which the "move" listener in startTour() follows.
      requestAnimationFrame(place);
    });
    map.flyTo({ ...EXAMPLE_VIEW, pitch: 0, bearing: 0, duration: 3000, essential: true });
  }

  /* Leaving the example: close its popup and fly back out to the view from before. */
  function hideExample() {
    if (!before) return;
    const { events, ...view } = before;
    before = null;
    A.popup.close();
    if (!events && el("show-events").checked) el("show-events").click();
    map.flyTo({ ...view, duration: 2000, essential: true });
  }

  // #!!!! EDIT HERE THE TOUR TEXT !!!!
  const STEPS = [
    {
      title: "AlpIce-1: dated glacier fluctuations in the Alps",
      text:
        "This viewer visualizes the AlpIce-1 database: a compilation of published surface-exposure " +
        "and radiocarbon ages constraining build-up, culmination and decay of past glaciers from the " +
        "Last Glacial Maximum through the Holocene across the entire European Alps. Skip the tour, or " +
        "click next to see how the viewer works.",
    },
    {
      target: ".maplibregl-ctrl-3d",
      title: "3D terrain",
      text: "Press 3D to tilt the map.",
    },
    {
      target: ".maplibregl-ctrl-top-right .maplibregl-ctrl-group",
      title: "Moving around",
      text: () =>
        touchOnly()
          ? "Pinch with two fingers to zoom. To tilt, drag two fingers up or down; to rotate, " +
            "twist them. The compass resets the view to north."
          : "Zoom with the buttons or the scroll wheel. To rotate and tilt, drag with the right " +
            "mouse button or hold Ctrl while dragging. The compass resets the view to north.",
    },
    {
      target: "#layers-section",
      title: "Ages, events and landforms",
      // From Kamleitner et al. (2026) and the README of the event ages (Data S6).
      text: [
        "Individual ages: Single cosmogenic nuclide (¹⁰Be, ³⁶Cl) surface exposure ages and radiocarbon ages, " +
          "homogenized, quality controlled and evaluated for their palaeoglaciological context.",
        "Event ages: a single age estimate representing the timing of a specific palaeoglacial " +
          "event (e.g. glacier advance, ice-margin stabilization, deglaciation), derived from one or more " +
          "surface exposure or radiocarbon ages, evaluated in their stratigraphic and geomorphological context.",
        "Landform catalogue: dated glacial and non-glacial landforms (ice margins, rock glaciers, " +
          "rock avalanche deposits and others) that link compiled ages to geomorphic features. Undated " +
          "landforms are included when part of a dated assemblage, e.g. a set of moraines.",
      ],
    },
    {
      // Opens the example itself, so the popup is on screen while this is read.
      target: ".alpice-popup",
      later: true,
      enter: showExample,
      leave: hideExample,
      title: "Click for the details",
      text: () =>
        `${touchOnly() ? "Tap" : "Click"} on any symbol to open its record, like this dated moraine ` +
        `near Bern. "Overview" shows the age, site, ` +
        `context and reference; "Full record" every column of the AlpIce-1 tables — ` +
        `${touchOnly() ? "tap" : "hover over"} a field name for its description.`,
    },
    {
      target: "#age-section",
      title: "Here colour indicates the age",
      text:
        "Yellow is young, dark blue is old (in thousand years). Drag the two handles to show only " +
        "the ages of one period.",
    },
    {
      target: "#filter-section",
      title: "Filters",
      text:
        "Filter displayed data by dating method, confidence, palaeoglaciological context and site " +
        "type. Every active filter is listed at the top: click one to remove it, or Reset for all.",
    },
    {
      target: "#outlines-section",
      title: "Glacier outlines",
      text:
        "The black line shows the empirically reconstructed ice extent at the Last Glacial Maximum. " +
        "Open this section to switch it off, or to add the Little Ice Age and today's glaciers for comparison.",
    },
    {
      target: "#extras-section",
      title: "Map options",
      text: "Switch between the hillshade and satellite imagery, and switch on place names.",
    },
    {
      target: "#contribute-section",
      title: "Contribute to AlpIce",
      text:
        "Found an error, missing information, or a study that is not yet in AlpIce-1? " +
        "Let us know! Open this section and use the e-mail link to send it to us.",
    },
    {
      target: "#title-section",
      title: "Want to read more?",
      text: "Here you find the link to the scientific publication and the " +
        "AlpIce-1 database. You find all other sources used in this viewer in the Credits section.",
    },
    {
      target: "#tour-open",
      title: "That's it",
      text: "You can replay this tour at any time with this question mark button.",
    },
  ];

  let root = null;
  let steps = [];
  let index = 0;
  let openPanel = () => {};

  function visible(node) {
    return node !== null && node.getClientRects().length > 0;
  }

  function storageGet() {
    try {
      return window.localStorage.getItem(SEEN_KEY);
    } catch {
      return null;
    }
  }

  function storageSet() {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // A private window or blocked storage: the tour simply shows again next time.
    }
  }

  function startTour() {
    closeTour();
    hideHint();
    openPanel();
    // `later` targets only appear once their step has run, so they are kept.
    steps = STEPS.filter((step) => !step.target || step.later || visible(document.querySelector(step.target)));
    index = 0;
    root = h(
      "div",
      { id: "tour", role: "dialog", "aria-modal": "true", "aria-labelledby": "tour-title" },
      h("div", { class: "tour-spot", "aria-hidden": "true" }),
      h("div", { class: "tour-card", tabIndex: -1 }),
    );
    /* A click on the dimmed overlay itself leaves the tour, like "Skip tour". */
    root.addEventListener("click", (event) => {
      if (event.target === root) skipTour();
    });
    document.body.append(root);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    map.on("move", placeSoon);
    showStep();
  }

  function closeTour() {
    if (!root) return;
    root.remove();
    root = null;
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", place);
    map.off("move", placeSoon);
    storageSet();
  }

  /* Leaving before the end: close, then point at the "?" for a few seconds so
   * the reader knows where the tour went. */
  function skipTour() {
    A.stats.track(`tour/skipped-at/${index + 1}`);
    closeTour();
    showHint();
  }

  let hint = null;

  function hideHint() {
    if (!hint) return;
    clearTimeout(hint.timer);
    document.removeEventListener("pointerdown", hideHint, true);
    hint.node.remove();
    hint = null;
  }

  function showHint() {
    hideHint();
    const button = el("tour-open");
    if (!visible(button)) return;
    const node = h("div", { id: "tour-hint", role: "status" }, "Open the tour again here, if you need it.");
    document.body.append(node);
    const r = button.getBoundingClientRect();
    const left = Math.min(
      Math.max(MARGIN_PX, r.left + r.width / 2 - node.offsetWidth / 2),
      window.innerWidth - node.offsetWidth - MARGIN_PX,
    );
    node.style.left = `${left}px`;
    node.style.top = `${r.bottom + 10}px`;
    node.style.setProperty("--arrow-x", `${r.left + r.width / 2 - left}px`);
    hint = { node, timer: setTimeout(hideHint, HINT_MS) };
    document.addEventListener("pointerdown", hideHint, true);
  }

  function go(delta) {
    const next = index + delta;
    if (next < 0) return;
    steps[index].leave?.();
    if (next >= steps.length) {
      A.stats.track("tour/done");
      closeTour();
    } else {
      index = next;
      showStep();
    }
  }

  function onKey(event) {
    if (event.key === "Escape") skipTour();
    else if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
  }

  function showStep() {
    const step = steps[index];
    const last = index === steps.length - 1;
    const card = root.querySelector(".tour-card");
    // Through h(), which skips the absent buttons rather than printing "null".
    card.replaceChildren(...h("div", {},
      h("p", { class: "tour-count" }, `${index + 1} / ${steps.length}`),
      h("h2", { id: "tour-title" }, step.title),
      // A list of strings is shown as paragraphs.
      [typeof step.text === "function" ? step.text() : step.text].flat().map((text) => h("p", { class: "tour-text" }, text)),
      step.action
        ? h(
            "button",
            {
              type: "button",
              class: "tour-action",
              onclick: () => {
                step.action.run();
                go(1);
              },
            },
            step.action.label,
          )
        : null,
      h(
        "div",
        { class: "tour-nav" },
        last ? null : h("button", { type: "button", class: "tour-skip", onclick: skipTour }, "Skip tour"),
        index > 0 ? h("button", { type: "button", onclick: () => go(-1) }, "Back") : null,
        h("button", { type: "button", class: "tour-next", onclick: () => go(1) }, last ? "Done" : "Next"),
      ),
    ).childNodes);
    step.enter?.();
    const target = step.target ? document.querySelector(step.target) : null;
    // The panel scrolls, so a control near its bottom is brought into view first.
    target?.scrollIntoView({ block: "nearest" });
    place();
    card.focus({ preventScroll: true });
  }

  /* A popup in the spotlight moves with the map, but MapLibre repositions it
   * in its own "move" handler, which may run after this one: measure a frame
   * later. */
  function placeSoon() {
    requestAnimationFrame(place);
  }

  /* The spotlight is a padded box over the target whose enormous shadow is the
   * dimmed page; with no target it shrinks to nothing and the card is centred.
   * Otherwise the card goes to whichever side of the target has room. */
  function place() {
    if (!root) return;
    const step = steps[index];
    const spot = root.querySelector(".tour-spot");
    const card = root.querySelector(".tour-card");
    const target = step.target ? document.querySelector(step.target) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;

    if (!visible(target)) {
      Object.assign(spot.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: "0px", height: "0px" });
      card.style.left = `${Math.max(MARGIN_PX, (vw - cw) / 2)}px`;
      card.style.top = `${Math.max(MARGIN_PX, (vh - ch) / 2)}px`;
      return;
    }

    const r = target.getBoundingClientRect();
    Object.assign(spot.style, {
      left: `${r.left - SPOT_PAD_PX}px`,
      top: `${r.top - SPOT_PAD_PX}px`,
      width: `${r.width + 2 * SPOT_PAD_PX}px`,
      height: `${r.height + 2 * SPOT_PAD_PX}px`,
    });

    const pad = SPOT_PAD_PX + GAP_PX;
    const candidates = [
      { left: r.right + pad, top: r.top, fits: r.right + pad + cw <= vw - MARGIN_PX },
      { left: r.left - pad - cw, top: r.top, fits: r.left - pad - cw >= MARGIN_PX },
      { left: r.left, top: r.bottom + pad, fits: r.bottom + pad + ch <= vh - MARGIN_PX },
      { left: r.left, top: r.top - pad - ch, fits: r.top - pad - ch >= MARGIN_PX },
    ];
    const choice = candidates.find((c) => c.fits) ?? candidates[2];
    const clamp = (value, max) => Math.min(Math.max(value, MARGIN_PX), Math.max(MARGIN_PX, max));
    card.style.left = `${clamp(choice.left, vw - cw - MARGIN_PX)}px`;
    card.style.top = `${clamp(choice.top, vh - ch - MARGIN_PX)}px`;
  }

  /* `openPanel` expands the panel first, since on a phone it starts collapsed
   * and most of the steps point inside it. The automatic start waits a moment
   * so the map controls exist and the layout has settled. */
  function init(options = {}) {
    openPanel = options.openPanel ?? openPanel;
    el("tour-open").addEventListener("click", () => {
      A.stats.track("tour/open");
      startTour();
    });
    if (storageGet() === null) setTimeout(startTour, 600);
  }

  A.tour = { init, start: startTour, close: closeTour };
})((window.AlpIce = window.AlpIce || {}));
