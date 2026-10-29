"""Build the viewer's data files from the AlpIce-1 Excel tables and shapefiles.

Reads ``original-data/`` (the Zenodo release, unchanged) and writes three
plain-script data files into ``data/``:

``alpice-core.js``
    Everything the map draws and the short ("easy") popups show: the individual
    ages as points, the event ages with their geometries (point, line or
    polygon), the landform catalogue, the reference list and field
    descriptions.
``alpice-details.js``
    Every column of the Excel age tables, per Date-ID, for the "advanced"
    popup. Loaded only when someone first opens an advanced view.

They are scripts that assign to ``window.ALPICE_DATA`` rather than JSON files,
so the page also works when ``index.html`` is opened straight from disk, where
browsers refuse ``fetch()`` and module scripts but still run classic scripts.

Sources:
- Individual ages: the Excel files (Data S1, S2). The shapefiles in
  ``AlpIce-1_ages`` hold a subset of the columns and leave out ages without
  coordinates; the Excel files are the authoritative table.
- Event ages: ``AlpIce-1_event_age_geometry`` (TCN point/line/polygon, 14C
  point), joined with ``AlpIce-1_event_ages`` for the sample count and the
  representative (mean) location.
- Landform catalogue: ``AlpIce-1_landform_catalogue``, including the undated
  landforms mapped for completeness.

Usage:
    python processing-files/build_alpice_data.py [--source original-data] [--out data]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import re
import unicodedata
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

TCN_XLSX = "DataS1–S5_AlpIce-1/DataS1_AlpIce-1_TCN_ages_event_ages.xlsx"
C14_XLSX = "DataS1–S5_AlpIce-1/DataS2_AlpIce-1_radiocarbon_ages_event_ages.xlsx"
GIS = "DataS6_AlpIce-1_GIS"

# Sheet -> method label used in the viewer.
AGE_SHEETS = [
    (TCN_XLSX, "10Be_ages", "10Be"),
    (TCN_XLSX, "36Cl_ages", "36Cl"),
    (C14_XLSX, "14C_ages", "14C"),
]

# The columns copied into the map features: the "easy" popup and the filters.
# Everything else is in alpice-details.js. Short names as in the Excel files.
SAMPLE_FIELDS = [
    "date_ID", "orig_ref", "comp_ref", "country", "region", "site_name",
    "site_type", "site_ID", "site_info", "samp_name", "elevation", "sample_yr",
    "public_yr", "sample_tp", "sample_dp", "method", "r_exp_age", "r_ext_err",
    "recal_max", "recal_min", "confid_ra", "pc_cat", "pc_subcat", "pc_time",
    "pgl_name", "pgl_stad", "lgm_catch", "pc_cm", "event",
]

EVENT_FIELDS = [
    "site_type", "site_names", "site_name", "site_ID", "orig_ref", "comp_ref",
    "source", "method", "date_ID", "confid_ra", "confid_no", "sample_no",
    "pc_cat", "pc_subcat", "pc_time", "pgl_name", "pgl_stad", "samp_10Be",
    "samp_36Cl", "e_age", "e_pos_err", "e_neg_err", "e_age_max", "e_age_min",
    "mean_s_yr", "mean_p_yr",
]

LANDFORM_FIELDS = [
    "site_type", "site_names", "site_ID", "orig_ref", "source", "method",
    "pc_cat", "pc_subcat", "pc_time", "pgl_name", "pgl_stad", "samp_10Be",
    "samp_36Cl", "confid_no", "e_age", "e_pos_err", "e_neg_err",
]

# The site types of AlpIce-1 (Table 2 of the paper), in the README's order,
# with the code each Site-ID starts with ("ICEM-Wuethrich2018-A") and the
# site_type values the tables use for it. The viewer filters by code and shows
# the code beside the name, which is what explains the Site-IDs.
# #!!!! EDIT HERE THE SITE TYPES !!!!
SITE_TYPES = [
    ("ICE", "glacier", ["glacier"]),
    ("ICEM", "ice margin", ["ice margin"]),
    ("MOR", "moraine", ["moraine"]),
    ("ERR", "erratic boulder", ["erratic"]),
    ("PROGL", "proglacial area", ["proglacial"]),
    ("SED", "sediment section", ["sediment section"]),
    ("LAKE", "lake", ["lake"]),
    ("MIRE", "mire", ["mire"]),
    ("SOIL", "soil profile", ["soil profile"]),
    ("ARCH", "archaeological site", ["archeological site"]),
    ("MM", "mass movement", ["mass movement"]),
    ("ROCKGL", "rock glacier", ["rock glacier"]),
    ("CAVE", "cave", ["cave"]),
    ("BED", "bedrock", ["bedrock"]),
    ("OTHER", "other", ["other", "block deposit", "alluvial-fan terrace"]),
]
SITE_TYPE_CODE = {value: code for code, _, values in SITE_TYPES for value in values}


def site_type_code(props):
    """The site-type code of a record, from its site_type ("Lake" counts as "lake")."""
    value = props.get("site_type")
    code = SITE_TYPE_CODE.get(str(value).strip().lower()) if value else None
    if code is None:
        raise ValueError(f"unknown site type {value!r} for {props.get('date_ID') or props.get('site_ID')}")
    return code


def context_class(props):
    """The context class as in Fig. 3C of the paper: an 'ice free' record with
    a subclass (ice advance, ice retreat, ice retreat/readvance) counts as that
    subclass, everything else as its main class."""
    return props.get("pc_subcat") or props.get("pc_cat")


NUMERIC_FIELDS = ["e_age", "e_pos_err", "e_neg_err", "e_age_max", "e_age_min", "sample_no", "mean_s_yr", "mean_p_yr"]

# ~1 m at Alpine latitudes; the mapping is not more precise than that.
COORD_DECIMALS = 5


# ---------- value cleaning ----------

def clean(value):
    """One cell as JSON: None for blanks and the dataset's "-" placeholder."""
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value):
            return None
        # Excel float noise (451999.99999999994) back to what was typed.
        value = float(f"{value:.10g}")
        return int(value) if value.is_integer() else value
    if isinstance(value, (int,)) and not isinstance(value, bool):
        return value
    if hasattr(value, "item"):  # numpy scalars
        return clean(value.item())
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()[:10]
    text = str(value).strip()
    if text in {"", "-", "–", "nan", "None"}:
        return None
    return text


def number(value):
    value = clean(value)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ---------- Excel age tables ----------

def read_age_sheet(path: Path, sheet: str):
    """Return (columns, rows) for one age sheet.

    The sheets have three header rows: a group ("Site Details"), a label
    ("Site name") and a short name ("site_name", or "-" when the column is not
    in the shapefiles). Groups are merged cells, so only their first column
    carries the name. Two analytical results are spread over three columns
    (value, "±", error); those become "<label>" and "<label> error".
    """
    raw = pd.read_excel(path, sheet_name=sheet, header=None, dtype=object)
    groups, labels, shorts = raw.iloc[0], raw.iloc[1], raw.iloc[2]
    body = raw.iloc[3:].dropna(how="all")
    body = body[body.iloc[:, 1].map(clean).notna()]  # Date-ID present

    columns, keep = [], []
    group = None
    for i in range(raw.shape[1]):
        if clean(groups.iloc[i]) is not None:
            group = clean(groups.iloc[i])
        label = clean(labels.iloc[i])
        short = clean(shorts.iloc[i])
        values = body.iloc[:, i].map(clean)
        if label is None:
            if values.dropna().empty or set(values.dropna()) == {"±"}:
                continue
            label = f"{columns[-1]['label']} error"
        if label == "No.":
            continue
        columns.append({"group": group, "label": label, "short": short})
        keep.append(i)

    rows = []
    for _, row in body.iterrows():
        rows.append([clean(row.iloc[i]) for i in keep])
    return columns, rows


def read_field_descriptions(path: Path):
    """From the workbook's READ-ME sheet: label -> description, and short name
    -> [label, description] for the fields that have one (``e_age``, ...)."""
    raw = pd.read_excel(path, sheet_name="READ-ME", header=None, dtype=object)
    by_label, by_short = {}, {}
    for row in raw.itertuples(index=False):
        cells = [str(c).strip() for c in row if pd.notna(c) and str(c).strip()]
        if len(cells) < 3 or cells[0] in {"Field", "Tabs"}:
            continue
        label, short, description = cells[0], cells[1], cells[-1]
        by_label[label] = description
        if re.fullmatch(r"[A-Za-z0-9_]+", short):
            by_short[short] = [label, description]
    return by_label, by_short


def describe(label: str, descriptions: dict):
    """The READ-ME description for a column label, matched loosely.

    The READ-ME labels differ slightly from the sheet headers ("Latest possible
    sample year (year of publication)", "Comment previous/subsequent studies"),
    and the split-off error columns ("Cl error") have no entry of their own.
    """
    norm = lambda text: re.sub(r"[^0-9a-z]", "", text.lower())
    by_norm = {norm(k): v for k, v in descriptions.items()}
    key = norm(label)
    if key in by_norm:
        return by_norm[key]
    for other, text in by_norm.items():
        if key and other.startswith(key):
            return text
    if label.endswith(" error"):
        base = describe(label[: -len(" error")], descriptions)
        if base:
            return f"Uncertainty of the value above. {base}"
    return None


def read_references(path: Path, sheet: str):
    """Short reference ("Akçar et al., 2011") -> {full, doi}."""
    raw = pd.read_excel(path, sheet_name=sheet, header=None, dtype=object)
    out = {}
    for row in raw.iloc[1:].itertuples(index=False):
        full = clean(row[1])
        if not isinstance(full, str):
            continue
        doi = clean(row[2]) if len(row) > 2 else None
        match = re.match(r"^(.+?\d{4}[a-z]?)\.\s", full)
        short = match.group(1).strip() if match else full.split(".")[0].strip()
        short = re.sub(r",\s*,", ",", short)
        out[short] = {"full": full}
        # The DOI column has a few typos ("http://doi:10...", "http://http://doi.org/...");
        # the DOI itself is the part from "10." on.
        doi = re.sub(r"\s+", "", str(doi or ""))  # and one "10.1 191/..."
        match = re.search(r"10\.\d{4,9}/\S+", doi)
        if match:
            out[short]["doi"] = f"https://doi.org/{match.group(0).rstrip('.')}"
        elif doi.startswith("http"):
            out[short]["doi"] = doi
    return out


def ref_key(text):
    """Comparable form of a short reference: letters and digits only, lower case."""
    text = text.replace("&", "and").replace(" und ", " and ")
    # Akçar and Akcar are the same paper.
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^0-9a-z]", "", text.lower())


def expand_short_refs(text):
    """"A et al., 1996, 2006b; B, 2010" -> ["A et al., 1996", "A et al., 2006b", "B, 2010"]."""
    out = []
    # Studies are separated by ";" or by "," before the next "Name ..., 2004".
    for part in re.split(r"\s*;\s*|,\s*(?=[^\d,;]+,\s*\d{4})", text):
        match = re.match(r"^(.*?),\s*((?:\d{4}[a-z]?(?:,\s*)?)+)$", part.strip())
        if not match:
            out.append(part.strip())
            continue
        author, years = match.groups()
        for year in re.findall(r"\d{4}[a-z]?", years):
            out.append(f"{author.strip()}, {year}")
    return [o for o in out if o]


def resolve_references(texts, references):
    """Each short-reference string in the data -> its full references, where found.

    Resolved here so the page only has to look up the exact string. A part not
    in the reference lists keeps its short form and has no link.
    """
    by_key = {ref_key(short): {"short": short, **ref} for short, ref in references.items()}
    resolved, unmatched = {}, set()
    for text in sorted(texts):
        parts = []
        for short in expand_short_refs(text):
            ref = by_key.get(ref_key(short))
            if ref is None:
                unmatched.add(short)
                ref = {"short": short}
            parts.append(ref)
        resolved[text] = parts
    return resolved, sorted(unmatched)


def central_age(props):
    """Central age in years and its interval, for colour and filtering.

    TCN: recalculated exposure age ± external error (years before sampling).
    14C: midpoint of the 95.4 % calibrated range (cal yr BP 1950). The two
    reference years differ by a few decades, which is far below what the
    colour scale resolves.
    """
    if props.get("r_exp_age") is not None:
        age = number(props["r_exp_age"])
        err = number(props.get("r_ext_err")) or 0
        return age, age - err, age + err
    lo, hi = number(props.get("recal_min")), number(props.get("recal_max"))
    if lo is None or hi is None:
        return None, None, None
    return (lo + hi) / 2, lo, hi


def round_coord(value):
    return round(float(value), COORD_DECIMALS)


def build_samples(source: Path):
    features, details, schemas = [], {}, {}
    missing_coords = []
    for xlsx, sheet, method in AGE_SHEETS:
        columns, rows = read_age_sheet(source / xlsx, sheet)
        schemas[method] = columns
        index = {c["short"]: i for i, c in enumerate(columns) if c["short"]}
        labels = {c["label"]: i for i, c in enumerate(columns)}
        lat_i, lon_i = labels["Latitude"], labels["Longitude"]
        for row in rows:
            props = {"m": method}
            for field in SAMPLE_FIELDS:
                if field in index:
                    props[field] = row[index[field]]
            # The 14C sheet has no short name on the sample/publication years.
            for label, field in [("Sample year", "sample_yr"), ("Latest possible sample year", "public_yr")]:
                if field not in props and label in labels:
                    props[field] = row[labels[label]]
            age, lo, hi = central_age(props)
            props["age"], props["age_lo"], props["age_hi"] = age, lo, hi
            props["st"] = site_type_code(props)
            props["ctx"] = context_class(props)
            details[props["date_ID"]] = row
            lat, lon = number(row[lat_i]), number(row[lon_i])
            if lat is None or lon is None:
                missing_coords.append(props["date_ID"])
                continue
            props = {k: v for k, v in props.items() if v is not None}
            features.append({
                "type": "Feature",
                "id": len(features),
                "geometry": {"type": "Point", "coordinates": [round_coord(lon), round_coord(lat)]},
                "properties": props,
            })
    return features, details, schemas, missing_coords


# ---------- shapefiles ----------

def read_shp(path: Path) -> gpd.GeoDataFrame:
    frame = gpd.read_file(path)
    if frame.crs is None:
        raise ValueError(f"{path} has no CRS")
    return frame.to_crs(4326)


def geometry_json(geom, decimals=COORD_DECIMALS):
    mapping = geom.__geo_interface__

    def rnd(coords):
        if isinstance(coords[0], (int, float)):
            return [round(float(coords[0]), decimals), round(float(coords[1]), decimals)]
        return [rnd(c) for c in coords]

    return {"type": mapping["type"], "coordinates": rnd(mapping["coordinates"])}


def split_names(value):
    if not value:
        return []
    return [s.strip() for s in re.split(r"[,;]\s*", str(value)) if s.strip()]


def build_events(source: Path, samples):
    gis = source / GIS
    by_date = {f["properties"]["date_ID"]: f for f in samples}
    by_site = {}
    for f in samples:
        by_site.setdefault(f["properties"].get("site_ID"), []).append(f)

    # Sample count and representative location per TCN event, from the event-age points.
    tcn_points = read_shp(gis / "AlpIce-1_event_ages/AlpIce1_TCN_event_ages.shp")
    tcn_extra = {r.site_ID: r for r in tcn_points.itertuples()}

    events = []
    for kind, path in [
        ("point", "AlpIce-1_event_age_geometry/AlpIce1_TCN_event_age_geometry_pt.shp"),
        ("line", "AlpIce-1_event_age_geometry/AlpIce1_TCN_event_age_geometry_ln.shp"),
        ("polygon", "AlpIce-1_event_age_geometry/AlpIce1_TCN_event_age_geometry_poly.shp"),
        ("point", "AlpIce-1_event_age_geometry/AlpIce1_14C_event_age_geometry_pt.shp"),
    ]:
        frame = read_shp(gis / path)
        for _, row in frame.iterrows():
            props = {f: clean(row[f]) for f in EVENT_FIELDS if f in frame.columns}
            # Some shapefiles store the ages as text; the page compares them as numbers.
            for field in NUMERIC_FIELDS:
                if field in props:
                    props[field] = clean(number(props[field])) if number(props[field]) is not None else props[field]
            props["geom"] = kind
            method = props.get("method")
            if method == "14C":
                sample = by_date.get(props.get("date_ID"))
                members = [sample] if sample else []
                for field in ("site_name", "site_type", "region", "samp_name", "pgl_name", "pgl_stad"):
                    if sample and props.get(field) is None and sample["properties"].get(field) is not None:
                        props[field] = sample["properties"][field]
                lo, hi = number(props.get("e_age_min")), number(props.get("e_age_max"))
                age = (lo + hi) / 2 if lo is not None and hi is not None else None
                props["eid"] = props.get("date_ID")
                rep = row.geometry
            else:
                # A landform dated in two studies carries both Site-IDs joined by
                # "_"; its samples carry either the joined ID or one of the parts.
                site_ids = [props["site_ID"], *props["site_ID"].split("_")]
                names = set(split_names(props.get("samp_10Be")) + split_names(props.get("samp_36Cl")))
                candidates = list({id(f): f for sid in site_ids for f in by_site.get(sid, [])}.values())
                members = [f for f in candidates if f["properties"].get("samp_name") in names] or candidates
                extra = tcn_extra.get(props["site_ID"])
                if extra is not None:
                    props["sample_no"] = clean(extra.sample_no)
                    rep = extra.geometry
                else:
                    rep = row.geometry.representative_point()
                age = number(props.get("e_age"))
                pos, neg = number(props.get("e_pos_err")) or 0, number(props.get("e_neg_err")) or 0
                lo, hi = (age - neg, age + pos) if age is not None else (None, None)
                props["eid"] = props["site_ID"]

            for field in ("region", "country"):
                if members and props.get(field) is None:
                    props[field] = members[0]["properties"].get(field)
            props["age"], props["age_lo"], props["age_hi"] = age, lo, hi
            props["st"] = site_type_code(props)
            props["ctx"] = context_class(props)
            props["samples"] = [f["properties"]["date_ID"] for f in members]
            props["rep"] = [round_coord(rep.x), round_coord(rep.y)]
            props = {k: v for k, v in props.items() if v is not None}
            events.append({
                "type": "Feature",
                "id": len(events),
                "geometry": geometry_json(row.geometry),
                "properties": props,
            })

    # Back-references, so a sample popup can name its event.
    for event in events:
        for date_id in event["properties"]["samples"]:
            sample = by_date.get(date_id)
            if sample is not None:
                sample["properties"].setdefault("events", []).append(event["properties"]["eid"])
    return events


def build_landforms(source: Path):
    features = []
    folder = source / GIS / "AlpIce-1_landform_catalogue"
    for path in sorted(folder.glob("*.shp")):
        frame = read_shp(path)
        frame = frame.rename(columns={"Method": "method"})
        for _, row in frame.iterrows():
            props = {f: clean(row[f]) for f in LANDFORM_FIELDS if f in frame.columns}
            for field in NUMERIC_FIELDS:
                if field in props and number(props[field]) is not None:
                    props[field] = clean(number(props[field]))
            props["layer"] = path.stem.replace("AlpIce1_", "")
            props["dated"] = number(props.get("e_age")) is not None
            props = {k: v for k, v in props.items() if v is not None}
            features.append({
                "type": "Feature",
                "id": len(features),
                "geometry": geometry_json(row.geometry),
                "properties": props,
            })
    return features


# ---------- glacier outlines ----------

# Context outlines, drawn as lines and not clickable (the LIA viewer has their
# attributes). Each goes to its own data file, so the page only loads the ones
# switched on. At full resolution: MapLibre simplifies GeoJSON per zoom level
# itself, so zoomed out it draws a thinned line and zoomed in every vertex.
# The tolerance (metres, UTM 32N) only drops points closer than that to the
# line, which no background image can show; coordinates keep ~0.1 m.
# #!!!! EDIT HERE THE OUTLINE SOURCES AND SIMPLIFICATION !!!!
#
# LGM: the outline modified after Ehlers et al. (2011), plus the small ice
# patches of GLACIMONTIS (Lima et al., 2026) that lie wholly outside it, mostly
# in the eastern Alps. GLACIMONTIS alone was on trial 2026-10-23 to -29.
GLACIMONTIS = "GLACIMONTIS_SHP/Shapefiles"
OUTLINE_TOLERANCE_M = 0.5
# Invisible below zoom ~13, where a pixel is ~13 m.
OVERVIEW_TOLERANCE_M = 10
OUTLINE_DECIMALS = 6
OUTLINES = {
    # CHANGED FROM THE ORIGINAL DATA (said so in the viewer's panel and Credits):
    # a GLACIMONTIS polygon is added only where it touches no Ehlers polygon;
    # where the two overlap, Ehlers is kept as it is. Of those added, only the
    # outer outline is kept (no nunataks), and the outline, traced from a ~70 m
    # raster as a staircase, is smoothed (see smooth_ring()).
    "lgm": {
        "source": "outlines/LGMAlpsoutline_Ehlersmodified_mai2024_utm32N.shp",
        "tolerance": OUTLINE_TOLERANCE_M,
        "add_outside": {
            "source": f"{GLACIMONTIS}/FilteredReconstructedPaleoglaciers.shp",
            "select": (f"{GLACIMONTIS}/TechnicalValidation.shp", "mrange4", "European Alps"),
            "outline_only": True,
            "smooth_cell": 70,
        },
    },
    # LIA and today are large at full resolution (~17 MB each). Each also gets a
    # small overview file (`overview` m tolerance) that the page draws at once;
    # js/outlines.js swaps in the full file when zoomed in far enough to see
    # the difference.
    "lia": {
        "source": "outlines/LIA_Alps_Reinthaler_Paul_2024.shp",
        "tolerance": OUTLINE_TOLERANCE_M,
        "overview": OVERVIEW_TOLERANCE_M,
    },
    # Paul et al. (2020), the original from PANGAEA (doi:10.1594/PANGAEA.909133),
    # not the LIA viewer's copy, which is simplified to 10 m.
    "today": {
        "source": "outlines/paul2020_pangaea/c3s_gi_rgi11_s2_2015_v2/c3s_gi_rgi11_s2_2015_v2.shp",
        "tolerance": OUTLINE_TOLERANCE_M,
        "overview": OVERVIEW_TOLERANCE_M,
    },
}


def smooth_ring(coords, cell):
    """A closed ring traced from a raster, made smooth.

    The staircase is first straightened by simplifying at the raster cell size
    (each step is one cell), then rounded by three rounds of Chaikin corner
    cutting, which replaces every corner by two points at 1/4 and 3/4 along its
    edges. The result stays within about half a cell of the original line and
    has a vertex every ~20-50 m.
    """
    import numpy as np
    from shapely.geometry import LineString

    line = LineString(coords).simplify(cell, preserve_topology=False)
    points = np.asarray(line.coords)[:-1]
    if len(points) < 4:
        return coords
    for _ in range(3):
        nxt = np.roll(points, -1, axis=0)
        points = np.column_stack([0.75 * points + 0.25 * nxt, 0.25 * points + 0.75 * nxt]).reshape(-1, 2)
    return np.vstack([points, points[:1]])


def outline_polygons(root: Path, source: str, select=None, outline_only=False, smooth_cell=None):
    """The polygons of one outline source, in UTM 32N.

    `select` is (shapefile, column, value): only the polygons touching that
    feature are kept, whole, e.g. the Alps out of a global layer. Whole rather
    than cut at its edge: the region follows the mountain front, and the LGM
    piedmont lobes reach far out onto the foreland.
    `outline_only` drops the holes (e.g. nunataks); `smooth_cell` smooths a
    raster-traced outline of that cell size (m), see smooth_ring().
    """
    from shapely.geometry import Polygon

    frame = gpd.read_file(root / source)
    if frame.crs is None:
        raise ValueError(f"{source} has no CRS")
    geometry = frame.geometry.make_valid()
    if select:
        # In the source's own CRS: a global layer has polygons that UTM 32N
        # cannot project.
        path, column, value = select
        mask = gpd.read_file(root / path)
        mask = mask[mask[column] == value]
        if mask.empty:
            raise ValueError(f"no {column} = {value!r} in {path}")
        region = mask.geometry.to_crs(frame.crs).make_valid().union_all()
        geometry = geometry.explode(index_parts=False)
        geometry = geometry[geometry.intersects(region)]
    geometry = geometry.to_crs(32632)
    # make_valid() can return collections; keep their polygon parts only.
    geometry = geometry.explode(index_parts=False)
    geometry = geometry[geometry.geom_type == "Polygon"]
    if outline_only:
        geometry = gpd.GeoSeries([Polygon(poly.exterior) for poly in geometry], crs=32632)
    if smooth_cell:
        rings = [Polygon(smooth_ring(poly.exterior.coords, smooth_cell)) for poly in geometry]
        geometry = gpd.GeoSeries(rings, crs=32632).make_valid().explode(index_parts=False)
        geometry = geometry[geometry.geom_type == "Polygon"]
    return geometry


def build_outline(root: Path, source: str, tolerance: float, add_outside=None, **options):
    """Polygons as a GeoJSON collection with no attributes.

    `options` go to outline_polygons(). `add_outside` names a second source
    (its options likewise) whose polygons are added where they touch none of
    the first, e.g. the small ice patches beyond the LGM ice sheet.
    """
    import pandas as pd

    geometry = outline_polygons(root, source, **options)
    if add_outside:
        extra = outline_polygons(root, **add_outside)
        extra = extra[~extra.intersects(geometry.union_all())]
        geometry = gpd.GeoSeries(pd.concat([geometry, extra], ignore_index=True), crs=32632)
    geometry = geometry.simplify(tolerance, preserve_topology=True).to_crs(4326)
    features = [
        {"type": "Feature", "properties": {}, "geometry": geometry_json(geom, OUTLINE_DECIMALS)} for geom in geometry
    ]
    return {"type": "FeatureCollection", "features": features}


# ---------- output ----------

def write_script(path: Path, assignments: dict):
    lines = [
        "/* Generated by processing-files/build_alpice_data.py from the AlpIce-1",
        " * data (Kamleitner et al., 2026, Boreas). Do not edit by hand. */",
        "window.ALPICE_DATA = window.ALPICE_DATA || {};",
    ]
    for key, value in assignments.items():
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        lines.append(f"window.ALPICE_DATA.{key} = {payload};")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--source", type=Path, default=ROOT / "original-data")
    parser.add_argument("--out", type=Path, default=ROOT / "data")
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    samples, details, schemas, missing = build_samples(args.source)
    events = build_events(args.source, samples)
    landforms = build_landforms(args.source)

    references = {}
    for xlsx, sheet in [(TCN_XLSX, "TCN_references"), (C14_XLSX, "14C_references")]:
        references.update(read_references(args.source / xlsx, sheet))
    texts = {
        f["properties"][field]
        for collection in (samples, events, landforms)
        for f in collection
        for field in ("orig_ref", "comp_ref")
        if isinstance(f["properties"].get(field), str)
    }
    references, unmatched_refs = resolve_references(texts, references)
    descriptions, fields = {}, {}
    for xlsx in (TCN_XLSX, C14_XLSX):
        by_label, by_short = read_field_descriptions(args.source / xlsx)
        descriptions.update(by_label)
        fields.update(by_short)
    for columns in schemas.values():
        for column in columns:
            column["description"] = describe(column["label"], descriptions)

    meta = {
        "built": dt.date.today().isoformat(),
        "counts": {
            "samples": len(samples),
            "samples_without_coordinates": len(missing),
            "events": len(events),
            "landforms": len(landforms),
        },
        "without_coordinates": missing,
        "unmatched_references": unmatched_refs,
    }
    write_script(args.out / "alpice-core.js", {
        "meta": meta,
        "samples": {"type": "FeatureCollection", "features": samples},
        "events": {"type": "FeatureCollection", "features": events},
        "landforms": {"type": "FeatureCollection", "features": landforms},
        "references": references,
        "descriptions": descriptions,
        "fields": fields,
        "siteTypes": [{"code": code, "name": name} for code, name, _ in SITE_TYPES],
    })
    write_script(args.out / "alpice-details.js", {
        "detailSchemas": schemas,
        "details": details,
    })
    outline_files = []
    for key, spec in OUTLINES.items():
        spec = dict(spec)
        overview = spec.pop("overview", None)
        write_script(args.out / f"alpice-outlines-{key}.js", {
            f"outlines_{key}": build_outline(args.source, **{**spec, "tolerance": overview or spec["tolerance"]}),
        })
        outline_files.append(f"alpice-outlines-{key}.js")
        if overview:
            write_script(args.out / f"alpice-outlines-{key}-full.js", {
                f"outlines_{key}_full": build_outline(args.source, **spec),
            })
            outline_files.append(f"alpice-outlines-{key}-full.js")
    for name in ("alpice-core.js", "alpice-details.js", *outline_files):
        size = (args.out / name).stat().st_size / 1e6
        print(f"{name}: {size:.1f} MB")
    print(json.dumps(meta["counts"]))


if __name__ == "__main__":
    main()
