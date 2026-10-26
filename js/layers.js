/*
 * The AlpIce-1 layers: individual ages, event ages and the landform
 * catalogue, their age colouring, the filters and the selection highlight.
 *
 * The data is in data/alpice-core.js (built by
 * processing-files/build_alpice_data.py), already loaded as a script by the
 * time this runs. Filtering is done here in JavaScript and handed to MapLibre
 * with `setData`, rather than as filter expressions, so the counts in the
 * panel and the map come from one predicate.
 */

(function (A) {
  "use strict";

  const { map, styleReady, addData } = A.map;
  const DATA = window.ALPICE_DATA || {};

  /* ---------- age colours ---------- */

  /* Plasma, young to old: bright yellow for the Holocene through red to the
   * deep indigo of the Last Glacial Maximum. Perceptually even, so equal age
   * steps look like equal colour steps, and it reads over the pale hillshade
   * and the imagery alike. Ages beyond the last stop keep its colour. */
  // #!!!! EDIT HERE THE AGE COLOUR SCALE !!!!
  const AGE_STOPS = [
    [0, "#f0f921"],
    [3000, "#fdca26"],
    [6000, "#fb9f3a"],
    [9000, "#ed7953"],
    [12000, "#d8576b"],
    [15000, "#bd3786"],
    [18000, "#9c179e"],
    [21000, "#7201a8"],
    [25000, "#46039f"],
    [30000, "#0d0887"],
  ];
  const NO_AGE_COLOUR = "#9ca3af";
  const AGE_MAX_KA = 30;

  const ageColour = [
    "case",
    ["has", "age"],
    ["interpolate", ["linear"], ["get", "age"], ...AGE_STOPS.flat()],
    NO_AGE_COLOUR,
  ];

  /* ---------- category colours ---------- */

  /* The other ways to colour the symbols, with the colours of Fig. 3 in
   * Kamleitner et al. (2026), read from the figure's legend. Each entry is a
   * value of `field` (filter value, legend label, colour); `fallback` colours
   * records without one. The order is the figure's legend, bottom to top. */
  // #!!!! EDIT HERE THE CATEGORY COLOURS !!!!
  const SCHEMES = {
    method: {
      // Read from `m` or `method`, see colourExpression().
      field: null,
      entries: [
        ["TCN", "TCN (¹⁰Be, ³⁶Cl)", "#f79a81"],
        ["14C", "¹⁴C", "#b6d3ef"],
      ],
      fallback: NO_AGE_COLOUR,
    },
    confidence: {
      field: "confid_ra",
      entries: [
        ["high", "high", "#58585a"],
        ["medium", "medium", "#939598"],
        ["low", "low", "#d1d2d4"],
        ["unaccepted", "unaccepted", "#ffffff"],
      ],
      // TCN events: built from the high- and medium-confidence ages, no single rating.
      fallback: "#a5b4c8",
      fallbackLabel: "TCN event (no single rating)",
    },
    context: {
      field: "ctx",
      entries: [
        ["ice free", "ice free", "#8dcfb0"],
        ["ice advance", "ice advance", "#f0ee78"],
        ["ice retreat", "ice retreat", "#faba7e"],
        ["ice retreat/readvance", "ice retreat/readvance", "#7f7cba"],
        ["ice margin", "ice margin", "#e189b8"],
        ["bedrock exposure", "bedrock exposure", "#506688"],
        ["ice cover", "ice cover", "#fefdee"],
        ["ambiguous", "ambiguous", "#eaebeb"],
      ],
      fallback: NO_AGE_COLOUR,
    },
  };

  /* The paint expression for one way of colouring. TCN and 14C are read from
   * `m` (ages: 10Be, 36Cl, 14C) or `method` (events: TCN, 14C). */
  function colourExpression(mode) {
    if (mode === "age") return ageColour;
    const scheme = SCHEMES[mode];
    const input =
      mode === "method"
        ? ["match", ["coalesce", ["get", "m"], ["get", "method"]], ["10Be", "36Cl", "TCN"], "TCN", "14C", "14C", ""]
        : ["coalesce", ["get", scheme.field], ""];
    return ["match", input, ...scheme.entries.flatMap(([value, , colour]) => [value, colour]), scheme.fallback];
  }

  /* Every paint property that carries the colour. */
  const COLOURED = [
    ["events-fill", "fill-color"],
    ["events-line", "line-color"],
    ["samples", "circle-color"],
    ["events-point", "circle-color"],
    ["events-marker", "circle-color"],
  ];
  let colourMode = "age";

  async function setColourMode(mode) {
    colourMode = mode;
    await styleReady;
    for (const [id, property] of COLOURED) {
      if (map.getLayer(id)) map.setPaintProperty(id, property, colourExpression(mode));
    }
  }

  /* ---------- filters ---------- */

  /* Every filter value there is. A filter is "active" when its set is smaller
   * than this, which is what the summary in the panel lists. */
  const SITE_TYPES = DATA.siteTypes ?? [];
  // #!!!! EDIT HERE THE CONTEXT CLASSES !!!!
  // The classes of Fig. 3C, as in SCHEMES.context: ice-free records with a
  // subclass count as the subclass (`ctx`, from the build).
  const CONTEXTS = SCHEMES.context.entries.map(([value]) => value);
  const ALL = {
    methods: ["10Be", "36Cl", "14C"],
    confidence: ["high", "medium", "low", "unaccepted"],
    siteTypes: SITE_TYPES.map((type) => type.code),
    contexts: CONTEXTS,
  };

  const filters = {
    methods: new Set(ALL.methods),
    confidence: new Set(ALL.confidence),
    siteTypes: new Set(ALL.siteTypes),
    contexts: new Set(ALL.contexts),
    // In ka; the upper end at AGE_MAX_KA means "and older".
    age: [0, AGE_MAX_KA],
  };

  /* In place: the panel's controls hold on to these sets. */
  function resetFilters() {
    for (const key of Object.keys(ALL)) {
      filters[key].clear();
      for (const value of ALL[key]) filters[key].add(value);
    }
    filters.age[0] = 0;
    filters.age[1] = AGE_MAX_KA;
  }
  const visible = { samples: true, events: false, landforms: false };

  const fullAgeRange = () => filters.age[0] <= 0 && filters.age[1] >= AGE_MAX_KA;

  function ageMatches(age) {
    if (age === undefined) return fullAgeRange();
    const lo = filters.age[0] * 1000;
    const hi = filters.age[1] >= AGE_MAX_KA ? Infinity : filters.age[1] * 1000;
    return age >= lo && age <= hi;
  }

  /* One record without a context class goes with the full set only, like an
   * age without a value. */
  const contextMatches = (pc) =>
    pc === undefined ? filters.contexts.size === CONTEXTS.length : filters.contexts.has(pc);

  /* Site type and context, shared by ages and events. */
  const siteMatches = (props) => filters.siteTypes.has(props.st) && contextMatches(props.ctx);

  function sampleMatches(props) {
    return (
      filters.methods.has(props.m) &&
      filters.confidence.has(props.confid_ra) &&
      siteMatches(props) &&
      ageMatches(props.age)
    );
  }

  /* TCN events combine 10Be and 36Cl ages, so either box keeps them. The
   * confidence boxes apply to individual ages only: a TCN event is built from
   * its high- and medium-confidence ages and has no single rating. */
  function eventMatches(props) {
    const method =
      props.method === "14C"
        ? filters.methods.has("14C")
        : filters.methods.has("10Be") || filters.methods.has("36Cl");
    return method && siteMatches(props) && ageMatches(props.age);
  }

  const samples = DATA.samples?.features ?? [];
  const events = DATA.events?.features ?? [];
  const landforms = DATA.landforms?.features ?? [];

  const byDateId = new Map(samples.map((f) => [f.properties.date_ID, f]));
  const byEventId = new Map(events.map((f) => [f.properties.eid, f]));

  /* The event-ages layer is points only: line and polygon events are drawn
   * at their representative (mean sample) location. Their moraine line or
   * landform polygon, coloured by the event age, belongs to the landform
   * layer (group "landforms" below). */
  const eventMarkers = events
    .filter((f) => f.properties.geom !== "point")
    .map((f) => ({
      type: "Feature",
      id: f.id,
      geometry: { type: "Point", coordinates: f.properties.rep },
      properties: f.properties,
    }));

  const collection = (features) => ({ type: "FeatureCollection", features });

  /* ---------- layers ---------- */


  // #!!!! EDIT HERE THE SYMBOLS OF THE DATA LAYERS !!!!
  const LAYERS = [
    {
      id: "landforms-fill",
      type: "fill",
      source: "landforms",
      group: "landforms",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#1f2937", "fill-opacity": 0.12 },
    },
    {
      id: "landforms-casing",
      type: "line",
      source: "landforms",
      group: "landforms",
      paint: { "line-color": "rgba(255, 255, 255, 0.8)", "line-width": 3 },
    },
    {
      id: "landforms-line",
      type: "line",
      source: "landforms",
      group: "landforms",
      filter: ["get", "dated"],
      paint: { "line-color": "#1f2937", "line-width": 1.4 },
    },
    {
      // Undated landforms, mapped in the source studies for completeness.
      id: "landforms-undated",
      type: "line",
      source: "landforms",
      group: "landforms",
      filter: ["!", ["get", "dated"]],
      paint: { "line-color": "#1f2937", "line-width": 1.4, "line-dasharray": [2, 1.5] },
    },
    {
      id: "events-fill",
      type: "fill",
      source: "events",
      group: "landforms",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ageColour, "fill-opacity": 0.45 },
    },
    {
      id: "events-casing",
      type: "line",
      source: "events",
      group: "landforms",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": "#111827", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 6] },
    },
    {
      id: "events-line",
      type: "line",
      source: "events",
      group: "landforms",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": ageColour, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.6, 14, 3.5] },
    },
    {
      id: "samples",
      type: "circle",
      source: "samples",
      group: "samples",
      paint: {
        "circle-color": ageColour,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.6, 10, 4.5, 14, 7],
        "circle-stroke-color": "#111827",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 12, 1],
      },
    },
    {
      id: "events-point",
      type: "circle",
      source: "events",
      group: "events",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": ageColour,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7, 14, 10],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 12, 2],
      },
    },
    {
      id: "events-marker",
      type: "circle",
      source: "event-markers",
      group: "events",
      paint: {
        "circle-color": ageColour,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2],
      },
    },
    {
      id: "highlight-line",
      type: "line",
      source: "highlight",
      filter: ["!=", ["geometry-type"], "Point"],
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 9, 14, 14], "line-opacity": 0.9, "line-blur": 1 },
    },
    {
      id: "highlight-point",
      type: "circle",
      source: "highlight",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 7, 10, 10, 14, 14],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    },
  ];

  /* Clickable, top first: the order hits are listed in the popup. */
  const CLICKABLE = ["events-point", "events-marker", "samples", "events-line", "events-fill", "landforms-line", "landforms-undated", "landforms-fill"];
  const SOURCE_KIND = { samples: "sample", events: "event", "event-markers": "event", landforms: "landform" };

  async function install() {
    await styleReady;
    for (const id of ["samples", "events", "event-markers", "landforms", "highlight"]) {
      map.addSource(id, { type: "geojson", data: collection([]), attribution: id === "samples" ? ATTRIBUTION : undefined });
    }
    for (const { group, ...layer } of LAYERS) {
      // The highlight sits above every data layer; the rest below it in list order.
      addData(layer);
    }
    // The highlight's line is drawn under the data, so the selected line stays in its age colour.
    map.moveLayer("highlight-line", "events-fill");
    applyVisibility();
    refresh();
  }

  const ATTRIBUTION =
    'AlpIce-1: <a href="https://doi.org/10.1111/bor.70084">Kamleitner et al. (2026)</a>';

  function applyVisibility() {
    for (const layer of LAYERS) {
      if (!layer.group || !map.getLayer(layer.id)) continue;
      map.setLayoutProperty(layer.id, "visibility", visible[layer.group] ? "visible" : "none");
    }
  }

  /* ---------- refresh ---------- */

  const listeners = [];
  let frame = 0;

  /* Filtering every feature takes well under a millisecond; re-indexing the
   * sources is what costs, so slider drags are folded into one per frame. */
  function refresh() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const shownSamples = samples.filter((f) => sampleMatches(f.properties));
      const shownEvents = events.filter((f) => eventMatches(f.properties));
      const shownMarkers = eventMarkers.filter((f) => eventMatches(f.properties));
      map.getSource("samples")?.setData(collection(shownSamples));
      map.getSource("events")?.setData(collection(shownEvents));
      map.getSource("event-markers")?.setData(collection(shownMarkers));
      map.getSource("landforms")?.setData(collection(landforms));
      const counts = {
        samples: [shownSamples.length, samples.length],
        events: [shownEvents.length, events.length],
        landforms: [landforms.length, landforms.length],
      };
      for (const listener of listeners) listener(counts);
    });
  }

  /* ---------- selection ---------- */

  function highlight(features) {
    map.getSource("highlight")?.setData(collection(features.filter(Boolean)));
  }

  /* An event is highlighted with the ages it was computed from. */
  function select(kind, feature) {
    if (!feature) return highlight([]);
    if (kind === "event") {
      const members = (feature.properties.samples || []).map((id) => byDateId.get(id));
      const marker = feature.properties.geom === "point" ? null : eventMarkers.find((m) => m.id === feature.id);
      // The moraine or landform only while the landform layer shows it.
      const shape = feature.properties.geom === "point" || visible.landforms ? feature : null;
      highlight([shape, marker, ...members]);
    } else {
      highlight([feature]);
    }
  }

  /* Hits under a click, one per feature, in CLICKABLE order. Rendered features
   * come back with their properties re-serialised (arrays as JSON strings), so
   * the original feature is looked up by id instead. */
  function hitsAt(point) {
    const box = [
      [point.x - 5, point.y - 5],
      [point.x + 5, point.y + 5],
    ];
    const layers = CLICKABLE.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
    const seen = new Set();
    const hits = [];
    for (const rendered of map.queryRenderedFeatures(box, { layers })) {
      const kind = SOURCE_KIND[rendered.source];
      const key = `${kind}:${rendered.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const pool = kind === "sample" ? samples : kind === "event" ? events : landforms;
      const feature = pool[rendered.id];
      if (feature) hits.push({ kind, feature });
    }
    const rank = { event: 0, sample: 1, landform: 2 };
    return hits.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }

  A.layers = {
    install,
    refresh,
    filters,
    resetFilters,
    ALL,
    SITE_TYPES,
    CONTEXTS,
    SCHEMES,
    setColourMode,
    get colourMode() {
      return colourMode;
    },
    visible,
    setVisible(group, on) {
      visible[group] = on;
      applyVisibility();
    },
    onCounts: (listener) => listeners.push(listener),
    hitsAt,
    select,
    byDateId,
    byEventId,
    AGE_STOPS,
    AGE_MAX_KA,
    NO_AGE_COLOUR,
    CLICKABLE,
  };
})((window.AlpIce = window.AlpIce || {}));
