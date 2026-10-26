/*
 * Anonymous usage statistics: which controls people use. Off unless
 * `statsUrl` is set in site-config.js, and never from a page opened from disk.
 *
 * Built for GoatCounter (goatcounter.com): no cookies, no personal data and no
 * consent banner needed, free for non-commercial sites, and it shows events as
 * paths, e.g. "filter/context/ice-margin". `statsUrl` is the site's count
 * endpoint, "https://<code>.goatcounter.com/count". The script also counts
 * the page view itself.
 *
 * Other code calls A.stats.track("filter/context/ice margin"); with statistics
 * off that does nothing.
 */

(function (A) {
  "use strict";

  const url = A.config.statsUrl;
  const on = Boolean(url) && !A.config.fromDisk;

  if (on) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://gc.zgo.at/count.js";
    script.dataset.goatcounter = url;
    document.head.append(script);
  }

  /* Paths are lower case with dashes, so "Ice margin" and "ice margin" count
   * as one. Events sent before the script has loaded are dropped. */
  function track(path) {
    if (!on || !window.goatcounter?.count) return;
    const clean = String(path)
      .toLowerCase()
      .replace(/[^a-z0-9/]+/g, "-")
      .replace(/-+$/g, "");
    window.goatcounter.count({ path: clean, title: path, event: true });
  }

  A.stats = { on, track };
})((window.AlpIce = window.AlpIce || {}));
