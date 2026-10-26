# Visitor statistics (GoatCounter)

How visits and clicks on the AlpIce-1 viewer are counted. The setup follows the
Little Ice Age glacier viewer's (same GoatCounter account, separate site).
Written 2026-10-26.

## Account

- Service: [GoatCounter](https://www.goatcounter.com), free for non-commercial use.
- Account: `henzandreas` (the Little Ice Age viewer counts there).
- This viewer's site code: **`henzandreas-alpice-viewer`**. It has to be added once
  in the dashboard: *Settings → Sites → Add site*, code `henzandreas-alpice-viewer`.
  Until then GoatCounter rejects the counts.
- Dashboard: <https://henzandreas-alpice-viewer.goatcounter.com>
- Count endpoint: `https://henzandreas-alpice-viewer.goatcounter.com/count`

The site code appears in the page source anyway, so it is not a secret.

Ad blockers block 10–30% of such scripts, so treat the numbers as lower
bounds. Nothing is counted from `localhost` (GoatCounter ignores it) or from
a page opened from disk (`js/stats.js` stays off), so the test copy for
colleagues and local work are never counted.

## How it works here

1. `site-config.js` sets `statsUrl` to the count endpoint above. Empty means off.
2. `js/stats.js` then loads `https://gc.zgo.at/count.js` (which also counts
   the page view) and offers `A.stats.track("name")`. Paths are lower-cased,
   other characters become dashes. Events before the script has loaded, or
   with the script blocked, are dropped; nothing breaks.
3. The controls call `A.stats.track(...)` where they handle a click
   (`filters.js`, `map.js`, `app.js`, `outlines.js`, `popup.js`, `tour.js`).
4. The credits say that visits and clicks are counted anonymously with
   GoatCounter, without cookies or personal data.

## Events in the dashboard

Events are listed among the paths.

| Event | When it is counted |
|---|---|
| `colour/age`, `colour/method`, `colour/confidence`, `colour/context` | "Colour by" switch |
| `filter/<key>/<value>` | A click on a filter chip (`methods`, `confidence`, `contexts`, `sitetypes`) |
| `filter/age/youngest`, `filter/age/oldest` | Age slider, once per drag, when released |
| `filter/sitetypes/all` | "Show all" in Site type |
| `filter/remove-one`, `filter/reset` | × on one active filter, or "Reset" |
| `layer/<samples\|events\|landforms>/<on\|off>` | Layer checkboxes |
| `outline/<today\|lia\|lgm\|lgm_ehlers>/<on\|off>` | Glacier outline checkboxes |
| `basemap/relief`, `basemap/imagery` | Basemap choice |
| `imagery-shade/on\|off`, `imagery-shade/strength` | Hillshade over the imagery (strength once per drag) |
| `labels/on\|off` | Place labels |
| `3d/on`, `3d/off` | 3D button |
| `tour/open`, `tour/done`, `tour/skipped-at/<step>` | "?" button, finishing the tour, leaving it at a step (the automatic first-visit tour is not counted as `tour/open`) |
| `popup/<sample\|event\|landform>/<overview\|full-record>` | A popup opens, with the view it opens in |
| `section/<name>` | A collapsible section is opened (outlines, extras = Map options, site-types, contribute, credits) |
| `panel/open`, `panel/close` | Panel toggle (mostly phones) |
| `contribute/e-mail` | The contribution e-mail link |
| `link/<host>/<path>` | Links leaving the page: paper, data, and the studies' DOIs in the popups |

The popup events say what kind of record was opened, not which one. The
outbound links do show which publication was followed.

## Checking it

After deploying, open the live site in a browser without an ad blocker, click
a few controls, and look at the dashboard: the first hits show within a minute.

## Credits

The GoatCounter setup was copied from the Little Ice Age glacier viewer and
extended with the help of Claude (Anthropic) in Claude Code on 2026-10-26.
