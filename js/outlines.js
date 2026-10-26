/*
 * Glacier outlines for context: the Last Glacial Maximum, the Little Ice Age
 * and today. Lines only, not clickable — their attributes are in the Little
 * Ice Age viewer. Each set is its own data file (built by
 * processing-files/build_alpice_data.py) and is loaded the first time its box
 * is ticked, so the LIA and today outlines cost nothing until asked for.
 *
 * Drawn below the AlpIce-1 layers, so they never cover an age.
 */

(function (A) {
  "use strict";

  const { map } = A.map;
  const { el, loadScript, setStatus, clearStatus } = A.ui;
  const DATA = window.ALPICE_DATA;

  /* Colours as in the Little Ice Age viewer for the LIA and today outlines.
   * The LGM line is black with a light halo, which reads over the hillshade
   * and the satellite imagery alike. */
  // #!!!! EDIT HERE THE OUTLINE LAYERS !!!!
  const OUTLINES = {
    lgm: {
      file: "data/alpice-outlines-lgm.js",
      on: true,
      colour: "#000000",
      casing: "rgba(255, 255, 255, 0.75)",
      width: ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2, 14, 2.8],
    },
    // TEMPORARY: for comparing the two LGM outlines; remove once one is chosen.
    lgm_ehlers: {
      file: "data/alpice-outlines-lgm_ehlers.js",
      on: false,
      colour: "#1d4ed8",
      casing: "rgba(255, 255, 255, 0.75)",
      width: ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2, 14, 2.8],
    },
    lia: {
      file: "data/alpice-outlines-lia.js",
      full: "data/alpice-outlines-lia-full.js",
      on: false,
      colour: "#ffc531",
      casing: "rgba(0, 0, 0, 0.5)",
      width: ["interpolate", ["linear"], ["zoom"], 6, 0.6, 10, 1.2, 14, 2],
    },
    today: {
      file: "data/alpice-outlines-today.js",
      full: "data/alpice-outlines-today-full.js",
      on: false,
      colour: "#ff2d95",
      casing: "rgba(0, 0, 0, 0.5)",
      width: ["interpolate", ["linear"], ["zoom"], 6, 0.6, 10, 1.2, 14, 2],
    },
  };

  /* The same zoom curve, every width plus `extra`: MapLibre only takes a
   * zoom curve at the top of a paint value, not inside arithmetic. */
  const widen = ([op, how, input, ...stops], extra) => [
    op, how, input, ...stops.map((value, i) => (i % 2 ? value + extra : value)),
  ];

  /* LIA and today come in two files: a 10 m-simplified overview, drawn as
   * soon as the box is ticked, and the full resolution (three times larger),
   * fetched and swapped in the first time the map is zoomed in past FULL_ZOOM,
   * where 10 m starts to be a few pixels. Once swapped, it stays. */
  const FULL_ZOOM = 12;
  const full = new Set();

  async function upgrade(key) {
    const spec = OUTLINES[key];
    if (!spec.full || full.has(key) || !spec.on || map.getZoom() < FULL_ZOOM) return;
    full.add(key);
    try {
      await loadScript(spec.full);
    } catch {
      full.delete(key); // the overview stays; a later zoom tries again
      return;
    }
    map.getSource(`outline-${key}`)?.setData(DATA[`outlines_${key}_full`]);
  }

  map.on("zoomend", () => {
    for (const key of Object.keys(OUTLINES)) upgrade(key);
  });

  /* Below the lowest AlpIce-1 layer. */
  const BELOW = "landforms-fill";

  async function ensure(key) {
    const spec = OUTLINES[key];
    const id = `outline-${key}`;
    if (map.getLayer(id)) return id;
    if (!DATA[`outlines_${key}`]) {
      setStatus(id, "Loading glacier outlines…");
      try {
        await loadScript(spec.file);
      } catch (error) {
        setStatus(id, `Could not load ${spec.file}.`, "error");
        throw error;
      }
      clearStatus(id);
    }
    if (map.getLayer(id)) return id; // ticked twice while loading
    map.addSource(id, { type: "geojson", data: DATA[`outlines_${key}`] });
    const before = map.getLayer(BELOW) ? BELOW : undefined;
    map.addLayer(
      {
        id: `${id}-casing`,
        type: "line",
        source: id,
        paint: { "line-color": spec.casing, "line-width": widen(spec.width, 1.8) },
      },
      before,
    );
    map.addLayer({ id, type: "line", source: id, paint: { "line-color": spec.colour, "line-width": spec.width } }, before);
    return id;
  }

  async function setOutline(key, on) {
    OUTLINES[key].on = on;
    await A.map.styleReady;
    if (!on && !map.getLayer(`outline-${key}`)) return;
    const id = await ensure(key);
    // The box may have changed while the file loaded; the last state wins.
    const visibility = OUTLINES[key].on ? "visible" : "none";
    map.setLayoutProperty(id, "visibility", visibility);
    map.setLayoutProperty(`${id}-casing`, "visibility", visibility);
    upgrade(key);
  }

  /* Called once the AlpIce-1 layers exist, so the outlines go below them. */
  function install() {
    for (const key of Object.keys(OUTLINES)) {
      const box = el(`outline-${key}`);
      box.checked = OUTLINES[key].on;
      box.addEventListener("change", () => {
        A.stats.track(`outline/${key}/${box.checked ? "on" : "off"}`);
        setOutline(key, box.checked);
      });
      el(`outline-${key}-swatch`).style.setProperty("--swatch", OUTLINES[key].colour);
      if (OUTLINES[key].on) setOutline(key, true);
    }
  }

  A.outlines = { install, setOutline };
})((window.AlpIce = window.AlpIce || {}));
