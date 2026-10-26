/*
 * Deployment endpoints and defaults, and the one place they are resolved.
 *
 * Two layers, in increasing precedence: the built-in defaults below and the
 * optional `site-config.js` a deployment can drop in beside index.html.
 *
 * Every file in js/ is a classic script that adds to `window.AlpIce`, not an
 * ES module: browsers refuse module scripts (and fetch) on pages opened from
 * disk, and the test copy for colleagues is meant to work by double-clicking
 * index.html. Load order is fixed in index.html.
 */

(function (A) {
  "use strict";

  const DEFAULTS = {
    /* Protomaps' hosted API for the place labels. The key only answers on the
     * origins listed for it at https://protomaps.com/account (localhost and
     * the published domain); a page opened from disk falls back to Esri's
     * label tiles, see `referenceLabelsUrl`. */
    basemapUrl: "https://api.protomaps.com/tiles/v4.json?key=54af1e244a8f1599",
    basemapFlavor: "dark",
    basemapAssets: "https://protomaps.github.io/basemaps-assets",
    referenceLabelsUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",

    worldImageryUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

    /* Mapterhorn global terrain, terrarium-encoded: the hillshade and 3D. */
    terrainTilejson: "https://tiles.mapterhorn.com/tilejson.json",

    /* Anonymous click statistics (js/stats.js): a GoatCounter count URL,
     * "https://<code>.goatcounter.com/count". Off when empty. */
    statsUrl: "",

    /* The whole Alpine arc. A #hash in the URL overrides it. */
    initialView: { center: [9.6, 46.2], zoom: 6.1, minZoom: 4, maxZoom: 16 },
  };

  const site = window.ALPICE_CONFIG || {};
  for (const key of Object.keys(site)) {
    if (!(key in DEFAULTS)) console.warn(`site-config.js: unknown setting '${key}'`);
  }

  A.config = {
    ...DEFAULTS,
    ...site,
    initialView: { ...DEFAULTS.initialView, ...site.initialView },
    /* Opened from disk: no origin for the Protomaps key to match. */
    fromDisk: location.protocol === "file:",
  };
})((window.AlpIce = window.AlpIce || {}));
