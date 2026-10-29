"""Zip the viewer into a test copy that opens without any server.

The recipient unzips it and double-clicks ``index.html``. Everything the page
needs is in the zip except the libraries and map tiles, which come from their
CDNs as on the published site, so an internet connection is still required.

Usage:
    python scripts/package-test-copy.py [--out dist]
"""

from __future__ import annotations

import argparse
import datetime as dt
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The page and nothing else: no source data, scripts, tests or private notes.
PAGE_FILES = ["index.html", "style.css", "site-config.js", "LICENSE"]
PAGE_DIRS = ["js", "data", "favicon"]

INSTRUCTIONS = """\
AlpIce-1 viewer — test copy ({date})
======================================

This is a preview, not yet public. Please do not share it further.

How to open
-----------
1. Unzip this folder anywhere.
2. Double-click index.html (or right-click it and open it with Firefox, etc.).
   It opens in your web browser (Chrome, Edge, Firefox or Safari). No
   installation and no server are needed, but the computer must be online:
   the map, satellite images and terrain are loaded from the internet.

Place labels come from a different provider when the page is opened from a
file (Esri instead of OpenStreetMap/Protomaps); on the published site they will
look slightly different.

What to try
-----------
- A short tour opens on the first visit; the "?" button at the top of the
  panel plays it again.
- Click a symbol on the map. "Overview" shows the essentials, "Full record" every
  column of the AlpIce-1 tables (hover or tap a field name for its
  description).
- Switch on "Event ages" and "Landform catalogue" in the panel.
- Drag the two handles of the age slider, and try the filters (method,
  confidence, palaeoglaciological context, site type). Active filters are
  listed at the top of the filter area; click one to remove it.
- "Colour by": age, or method, confidence and palaeoglaciological context
  in the colours of Fig. 3 of the AlpIce-1 paper.
- "Glacier outlines": today, Little Ice Age and Last Glacial Maximum (modified
  after Ehlers et al. 2011, smaller ice patches outside it from GLACIMONTIS).
- Map options: Hillshade or Satellite, 3D button at the top right.

Feedback
--------
Anything that is wrong, unclear or missing, share with me. Either the address
bar (that shares the map position) or a screenshot, or both.
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", type=Path, default=ROOT / "dist")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    today = dt.date.today().isoformat()
    folder = f"AlpIce-viewer-test-{today}"
    target = args.out / f"{folder}.zip"
    files = [ROOT / name for name in PAGE_FILES]
    for directory in PAGE_DIRS:
        files += sorted(p for p in (ROOT / directory).rglob("*") if p.is_file() and "__pycache__" not in p.parts)

    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, f"{folder}/{path.relative_to(ROOT).as_posix()}")
        archive.writestr(f"{folder}/README-TEST.txt", INSTRUCTIONS.format(date=today))

    print(f"{target} ({target.stat().st_size / 1e6:.1f} MB, {len(files) + 1} files)")


if __name__ == "__main__":
    main()
