"""Checks on the built data files in data/.

These run on the committed build alone, without original-data/ or geopandas,
so they also run in CI. The helpers of the build script are tested where its
dependencies are installed.

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import importlib.util
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSIGNMENT = re.compile(r"^window\.ALPICE_DATA\.(\w+) = (.*);$", re.MULTILINE)


def load(name):
    text = (ROOT / "data" / name).read_text(encoding="utf-8")
    return {key: json.loads(value) for key, value in ASSIGNMENT.findall(text)}


class CoreData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.core = load("alpice-core.js")
        cls.samples = cls.core["samples"]["features"]
        cls.events = cls.core["events"]["features"]
        cls.landforms = cls.core["landforms"]["features"]

    def test_counts_match_meta(self):
        counts = self.core["meta"]["counts"]
        self.assertEqual(counts["samples"], len(self.samples))
        self.assertEqual(counts["events"], len(self.events))
        self.assertEqual(counts["landforms"], len(self.landforms))

    def test_ids_are_positions(self):
        # js/layers.js looks clicked features up by id as an index.
        for collection in (self.samples, self.events, self.landforms):
            self.assertEqual([f["id"] for f in collection], list(range(len(collection))))

    def test_samples_in_the_alps(self):
        for f in self.samples:
            lon, lat = f["geometry"]["coordinates"]
            self.assertTrue(4 < lon < 17 and 43 < lat < 49, f["properties"]["date_ID"])

    def test_sample_ids_unique(self):
        ids = [f["properties"]["date_ID"] for f in self.samples]
        self.assertEqual(len(ids), len(set(ids)))

    def test_methods(self):
        self.assertEqual({f["properties"]["m"] for f in self.samples}, {"10Be", "36Cl", "14C"})

    def test_every_event_links_to_its_ages(self):
        by_id = {f["properties"]["date_ID"]: f for f in self.samples}
        for event in self.events:
            p = event["properties"]
            self.assertTrue(p["samples"], p["eid"])
            for date_id in p["samples"]:
                self.assertIn(p["eid"], by_id[date_id]["properties"]["events"])

    def test_event_ages(self):
        for event in self.events:
            p = event["properties"]
            self.assertLessEqual(p["age_lo"], p["age"])
            self.assertLessEqual(p["age"], p["age_hi"])

    def test_event_ids_unique(self):
        ids = [f["properties"]["eid"] for f in self.events]
        self.assertEqual(len(ids), len(set(ids)))

    def test_every_reference_string_resolves(self):
        refs = self.core["references"]
        for f in self.samples + self.events:
            for field in ("orig_ref", "comp_ref"):
                if field in f["properties"]:
                    self.assertIn(f["properties"][field], refs)

    def test_every_record_has_a_site_type_code(self):
        # js/filters.js filters by these codes; js/popup.js names them.
        codes = {t["code"] for t in self.core["siteTypes"]}
        for f in self.samples + self.events:
            self.assertIn(f["properties"]["st"], codes, f["properties"].get("eid") or f["properties"]["date_ID"])

    def test_doi_links_are_https(self):
        for parts in self.core["references"].values():
            for ref in parts:
                if "doi" in ref:
                    self.assertTrue(ref["doi"].startswith("https://"), ref["doi"])


class DetailData(unittest.TestCase):
    def test_every_sample_has_details(self):
        core = load("alpice-core.js")
        details = load("alpice-details.js")
        for f in core["samples"]["features"]:
            p = f["properties"]
            row = details["details"][p["date_ID"]]
            self.assertEqual(len(row), len(details["detailSchemas"][p["m"]]))


class OutlineData(unittest.TestCase):
    def test_lgm_adds_outside_patches(self):
        # Ehlers (104 polygons) plus the GLACIMONTIS patches that touch none of them.
        features = load("alpice-outlines-lgm.js")["outlines_lgm"]["features"]
        self.assertGreater(len(features), 200)

    def test_outline_files(self):
        # js/outlines.js reads ALPICE_DATA.outlines_<key> from data/alpice-outlines-<key>.js.
        for key in ("lgm", "lia", "today", "lia_full", "today_full"):
            name = key.replace("_full", "-full")
            data = load(f"alpice-outlines-{name}.js")[f"outlines_{key}"]
            self.assertGreater(len(data["features"]), 50, key)
            for f in data["features"]:
                self.assertEqual(f["geometry"]["type"], "Polygon")
                lon, lat = f["geometry"]["coordinates"][0][0]
                self.assertTrue(4 < lon < 17 and 43 < lat < 49, key)


@unittest.skipUnless(
    importlib.util.find_spec("geopandas") and importlib.util.find_spec("openpyxl"),
    "build dependencies not installed",
)
class BuildHelpers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("build", ROOT / "processing-files/build_alpice_data.py")
        cls.build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.build)

    def test_clean(self):
        clean = self.build.clean
        self.assertIsNone(clean("-"))
        self.assertIsNone(clean(float("nan")))
        self.assertEqual(clean(451999.99999999994), 452000)
        self.assertEqual(clean(" text "), "text")

    def test_expand_short_refs(self):
        expand = self.build.expand_short_refs
        self.assertEqual(expand("Ivy-Ochs et al., 1996, 2006b"), ["Ivy-Ochs et al., 1996", "Ivy-Ochs et al., 2006b"])
        self.assertEqual(expand("Hormes et al., 2008, Longhi et al., 2024"), ["Hormes et al., 2008", "Longhi et al., 2024"])
        self.assertEqual(expand("Bichler et al., 2016; Wirsig et al., 2017"), ["Bichler et al., 2016", "Wirsig et al., 2017"])

    def test_ref_key_ignores_accents(self):
        self.assertEqual(self.build.ref_key("Akçar et al., 2011"), self.build.ref_key("Akcar et al., 2011"))


if __name__ == "__main__":
    unittest.main()
