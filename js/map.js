/*
 * The map itself: the basemap, layer ordering, the place labels, the shaded
 * relief and the 3D view. Adapted from the Little Ice Age viewer's js/map.js,
 * without its LIA terrain blending and globe sky.
 *
 * The basemap is today's terrain: a hillshade by default, Esri World Imagery
 * on request. Both read from tile endpoints that answer any origin, so they
 * also work from a page opened from disk. The place labels come from
 * Protomaps' hosted API, whose key is tied to listed origins; from disk they
 * come from Esri's reference tiles instead.
 */

(function (A) {
  "use strict";

  const { config } = A;
  const { setStatus } = A.ui;

  const RELIEF_BACKGROUND_LAYER = "relief-background";
  const RELIEF_LAYER = "relief-hillshade";
  const IMAGERY_LAYER = "world-imagery";
  const SHADE_LAYER = "imagery-hillshade";
  const LABELS_RASTER_LAYER = "reference-labels";
  const TERRAIN_SOURCE = "terrain";
  const MAX_PITCH = 85;

  /* ---------- style ---------- */

  /* The labels are the only part of the Protomaps style kept: the ground is
   * the hillshade or the imagery. Every label face is pushed to white over a
   * black halo, which reads over both. */
  function protomapsLabelLayers() {
    if (config.fromDisk || !window.basemaps) return [];
    const flavor = { ...basemaps.namedFlavor(config.basemapFlavor) };
    for (const field of [
      "roads_label_minor", "roads_label_major", "ocean_label", "subplace_label",
      "city_label", "state_label", "country_label", "address_label",
    ]) {
      flavor[field] = "#f8fafc";
      if (`${field}_halo` in flavor) flavor[`${field}_halo`] = "#000000";
    }
    return basemaps
      .layers("protomaps", flavor, { lang: "en", labelsOnly: true })
      .filter((layer) => layer.type === "symbol");
  }

  const labelLayers = protomapsLabelLayers();

  const RELIEF_PAINT = {
    "hillshade-method": "igor",
    "hillshade-illumination-direction": 315,
    "hillshade-exaggeration": 0.6,
    "hillshade-highlight-color": "rgba(255, 255, 255, 0.85)",
    "hillshade-shadow-color": "rgba(52, 58, 70, 0.75)",
    "hillshade-accent-color": "rgba(52, 58, 70, 0.35)",
  };

  /* Over imagery, a hillshade that only darkens: transparent highlights and
   * black shadows act like a multiply blend, which MapLibre does not have. */
  function shadePaint(strength) {
    return {
      "hillshade-method": "igor",
      "hillshade-illumination-direction": 315,
      "hillshade-exaggeration": 0.5,
      "hillshade-highlight-color": "rgba(255, 255, 255, 0)",
      "hillshade-shadow-color": `rgba(0, 0, 0, ${strength.toFixed(3)})`,
      "hillshade-accent-color": `rgba(0, 0, 0, ${(strength * 0.5).toFixed(3)})`,
    };
  }

  const sources = {
    [TERRAIN_SOURCE]: {
      type: "raster-dem",
      url: config.terrainTilejson,
      tileSize: 512,
      encoding: "terrarium",
    },
    "world-imagery": {
      type: "raster",
      tiles: [config.worldImageryUrl],
      tileSize: 256,
      maxzoom: 19,
      // A mosaic: the capture date varies by place and zoom (Esri's imagery
      // metadata, sampled across the Alps in October 2026).
      attribution:
        "© Esri, Vantor, Earthstar Geographics, and the GIS User Community; " +
        "images from different years, in the Alps mostly 2021–2025",
    },
  };
  if (labelLayers.length) {
    sources.protomaps = {
      type: "vector",
      url: config.basemapUrl,
      attribution:
        '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>' +
        ' | <a href="https://protomaps.com">Protomaps</a>',
    };
  } else {
    sources["reference-labels"] = {
      type: "raster",
      tiles: [config.referenceLabelsUrl],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Labels © Esri",
    };
  }

  const style = {
    version: 8,
    projection: { type: "globe" },
    glyphs: `${config.basemapAssets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${config.basemapAssets}/sprites/v4/${config.basemapFlavor}`,
    sources,
    layers: [
      { id: RELIEF_BACKGROUND_LAYER, type: "background", paint: { "background-color": "#eeeee8" } },
      { id: IMAGERY_LAYER, type: "raster", source: "world-imagery", layout: { visibility: "none" } },
      { id: RELIEF_LAYER, type: "hillshade", source: TERRAIN_SOURCE, paint: RELIEF_PAINT },
      {
        id: SHADE_LAYER,
        type: "hillshade",
        source: TERRAIN_SOURCE,
        layout: { visibility: "none" },
        paint: shadePaint(0.3),
      },
      // Off on arrival; the "Place labels" box in Map options shows them.
      ...(labelLayers.length
        ? labelLayers.map((layer) => ({ ...layer, layout: { ...layer.layout, visibility: "none" } }))
        : [{ id: LABELS_RASTER_LAYER, type: "raster", source: "reference-labels", layout: { visibility: "none" } }]),
    ],
  };

  function createMap() {
    try {
      return new maplibregl.Map({
        container: "map",
        style,
        center: config.initialView.center,
        zoom: config.initialView.zoom,
        minZoom: config.initialView.minZoom,
        maxZoom: config.initialView.maxZoom,
        maxPitch: MAX_PITCH,
        hash: true,
        attributionControl: false,
      });
    } catch (error) {
      setStatus("map", "This browser cannot draw the map: it has no WebGL2.", "error");
      throw error;
    }
  }

  const map = createMap();
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      // "© Mapterhorn" comes with the terrain tilejson; adding it here showed it twice.
      customAttribution: '<a href="https://maplibre.org">MapLibre</a>',
    }),
    "bottom-right",
  );

  /* MapLibre opens the compact attribution on arrival; start folded, every
   * credit is also in the panel's Credits section. */
  function foldAttribution() {
    map
      .getContainer()
      .querySelector(".maplibregl-ctrl-attrib.maplibregl-compact")
      ?.classList.remove("maplibregl-compact-show");
  }
  foldAttribution();
  map.once("load", foldAttribution);

  map.on("error", (event) => {
    if (event.error) console.warn("maplibre:", event.error.message);
  });

  const styleReady = new Promise((resolve) => map.once("style.load", resolve));

  /* ---------- layer ordering ---------- */

  /* Data layers go above the basemap and below the labels. */
  const firstLabelLayer = () =>
    labelLayers.length ? labelLayers[0].id : LABELS_RASTER_LAYER;

  function addData(layer) {
    map.addLayer(layer, firstLabelLayer());
  }

  /* ---------- basemap ---------- */

  const state = { basemap: "relief", shade: true, shadeStrength: 0.3 };

  function show(id, on) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }

  async function setBasemap(value) {
    A.stats.track(`basemap/${value}`);
    state.basemap = value;
    await styleReady;
    const imagery = value === "imagery";
    show(IMAGERY_LAYER, imagery);
    show(RELIEF_LAYER, !imagery);
    show(SHADE_LAYER, imagery && state.shade);
  }

  async function setImageryShade(on, strength = state.shadeStrength) {
    state.shade = on;
    state.shadeStrength = strength;
    await styleReady;
    show(SHADE_LAYER, state.basemap === "imagery" && on);
    for (const [property, value] of Object.entries(shadePaint(strength))) {
      map.setPaintProperty(SHADE_LAYER, property, value);
    }
  }

  async function setLabels(on) {
    await styleReady;
    for (const layer of labelLayers) show(layer.id, on);
    show(LABELS_RASTER_LAYER, on);
  }

  /* ---------- 3D ---------- */

  const THREE_D_PITCH = 60;
  const view = { threeD: false };
  let threeDButton = null;

  async function setThreeD(on, { tilt = true } = {}) {
    view.threeD = on;
    syncThreeDButton();
    await styleReady;
    map.setTerrain(on ? { source: TERRAIN_SOURCE, exaggeration: 1 } : null);
    if (tilt) map.easeTo({ pitch: on ? THREE_D_PITCH : 0, duration: 600 });
  }

  class ThreeDControl {
    onAdd() {
      this.container = document.createElement("div");
      this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      threeDButton = document.createElement("button");
      threeDButton.type = "button";
      threeDButton.className = "maplibregl-ctrl-3d";
      threeDButton.addEventListener("click", () => {
        A.stats.track(`3d/${view.threeD ? "off" : "on"}`);
        setThreeD(!view.threeD);
      });
      this.container.append(threeDButton);
      syncThreeDButton();
      return this.container;
    }

    onRemove() {
      this.container.remove();
      threeDButton = null;
    }
  }

  /* The button names what the next press does: "3D" while flat, "2D" once tilted. */
  function syncThreeDButton() {
    if (!threeDButton) return;
    const action = view.threeD ? "Disable 3D terrain" : "Enable 3D terrain";
    threeDButton.textContent = view.threeD ? "2D" : "3D";
    threeDButton.title = action;
    threeDButton.setAttribute("aria-label", action);
    threeDButton.setAttribute("aria-pressed", String(view.threeD));
  }

  map.addControl(new ThreeDControl(), "top-right");

  /* A shared link copied while tilted comes back tilted, with terrain under it. */
  if (map.getPitch() > 0) setThreeD(true, { tilt: false });

  A.map = { map, styleReady, addData, setBasemap, setImageryShade, setLabels, setThreeD };
})((window.AlpIce = window.AlpIce || {}));
