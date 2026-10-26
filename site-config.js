/*
 * Per-deployment overrides for the viewer.
 *
 * A plain script loaded before js/config.js. Everything here is optional, and
 * everything left out falls back to the built-in defaults in js/config.js.
 *
 * Keys, with their defaults:
 *
 *   basemapUrl          Protomaps' hosted API (labels), as a TileJSON URL with an API key
 *   basemapFlavor       "dark"
 *   basemapAssets       Protomaps' fonts and sprites endpoint
 *   referenceLabelsUrl  Esri label tiles, used when the page is opened from disk
 *   worldImageryUrl     Esri World Imagery XYZ tile template
 *   terrainTilejson     Mapterhorn's global terrain
 *   initialView         { center: [lon, lat], zoom, minZoom, maxZoom } before the #hash applies
 *   statsUrl            "" (off); GoatCounter count URL for anonymous click statistics
 */

window.ALPICE_CONFIG = {
  /* Its own site in the henzandreas GoatCounter account, so the counts are
   * kept apart from the Little Ice Age viewer's. */
  statsUrl: "https://henzandreas-alpice-viewer.goatcounter.com/count",
};
