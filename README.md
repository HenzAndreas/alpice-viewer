# AlpIce-1 viewer

An interactive map of the AlpIce-1 database: radiocarbon and cosmogenic
nuclide (¹⁰Be, ³⁶Cl) surface exposure ages that constrain glacier fluctuations
across the European Alps from the Last Glacial Maximum to the Holocene. It
shows the individual ages, the event ages computed from them (on the dated
moraine or landform where it is mapped), and the landform catalogue. Click any
symbol for its record, in a short or a full view.

## Reference

Kamleitner, S., Ivy-Ochs, S., Leger, T. P. M., Henz, A., Nussbaumer, S. U.,
Vieli, A. and Jouvet, G. (2026). AlpIce-1: a database of geochronological and
geomorphological constraints on Alps-wide palaeoglacier fluctuations between
the Last Glacial Maximum and the Holocene. *Boreas*.
[doi:10.1111/bor.70084](https://doi.org/10.1111/bor.70084)

The data is on Zenodo:
[doi:10.5281/zenodo.21841122](https://doi.org/10.5281/zenodo.21841122).
Please cite the paper when you use the data, and the original studies named in
each record.

Glacier outlines: Last Glacial Maximum from GLACIMONTIS: Lima, A.C., Dulfer,
H.E., Hughes, A.L.C., Margold, M., Barr, I., Laabs, B.J.C., Flantua, S.G.A.
(2026). Mountain glacier extents at the Last Glacial Maximum. *Scientific
Data* 13, 629. [doi:10.1038/s41597-026-06841-z](https://doi.org/10.1038/s41597-026-06841-z);
data [doi:10.5281/zenodo.15600659](https://doi.org/10.5281/zenodo.15600659),
CC BY 4.0. (Previously: modified after Ehlers, J., Gibbard, P. L. & Hughes, P. D.
2011: Quaternary glaciations – extent and chronology. A Closer Look. Elsevier,
Amsterdam.) Little Ice Age: Reinthaler and Paul (2025). Today: Paul et al. (2020).

## Licences

- **Data:** as published on Zenodo; please cite Kamleitner et al. (2026).
- **Code:** MIT, see [LICENSE](LICENSE).
- Basemap imagery, labels and terrain belong to their providers (Esri,
  OpenStreetMap/Protomaps, Mapterhorn) and are credited on the map.

## Credits

The viewer is maintained by Andreas Henz. It reuses the panel, map setup and
styling of the [Little Ice Age glacier viewer](https://henzandreas.github.io/little-ice-age-glacier-viewer/)
([code](https://github.com/HenzAndreas/little-ice-age-glacier-viewer)), which
was adapted from Luis Q. Gentner's GLACE viewer. The code was written
with the help of Claude (Anthropic). Built with
[MapLibre GL JS](https://maplibre.org/).

## Running it locally

The page is plain HTML, CSS and JavaScript with no build step, and the map
data is in `data/`. Open `index.html` directly, or serve the folder:

```bash
python scripts/serve.py
```

and open `http://localhost:8000/`.

## Data sources

The map draws only the two files in `data/`, which are built from the Zenodo
release. Of the Zenodo files, these are read by the build — the rest are not
needed for the viewer:

| Zenodo file | what it gives the map |
| --- | --- |
| `DataS1–S5_AlpIce-1/DataS1_AlpIce-1_TCN_ages_event_ages.xlsx` | the ¹⁰Be and ³⁶Cl ages (positions and every column of the popups), the TCN reference list with DOIs, the field descriptions |
| `DataS1–S5_AlpIce-1/DataS2_AlpIce-1_radiocarbon_ages_event_ages.xlsx` | the same for the ¹⁴C ages |
| `DataS6_AlpIce-1_GIS/AlpIce-1_event_age_geometry/` (4 shapefiles: TCN `_pt`, `_ln`, `_poly`; 14C `_pt`) | the event-age layer, on its point, ice-margin line or landform polygon |
| `DataS6_AlpIce-1_GIS/AlpIce-1_event_ages/AlpIce1_TCN_event_ages.shp` | the number of samples and the representative (mean) location of each TCN event |
| `DataS6_AlpIce-1_GIS/AlpIce-1_landform_catalogue/` (4 shapefiles) | the landform catalogue layer, dated and undated |

The glacier outlines come from outside the AlpIce-1 release, in
`original-data/outlines/`:

| file | outline |
| --- | --- |
| `GLACIMONTIS_SHP/Shapefiles/FilteredReconstructedPaleoglaciers.shp` (+ `TechnicalValidation.shp` for the "European Alps" region) | Last Glacial Maximum, GLACIMONTIS (Lima et al., 2026); the polygons touching the Alps region, kept whole |
| `LGMAlpsoutline_Ehlersmodified_mai2024_utm32N.shp` | Last Glacial Maximum modified after Ehlers et al. (2011); kept as the alternative, not used at the moment |
| `LIA_Alps_Reinthaler_Paul_2024.shp` | Little Ice Age, Reinthaler and Paul (2025), [doi:10.5194/tc-19-753-2025](https://doi.org/10.5194/tc-19-753-2025) |
| `paul2020_pangaea/c3s_gi_rgi11_s2_2015_v2/c3s_gi_rgi11_s2_2015_v2.shp` | today (2015–2017), Paul et al. (2020), [doi:10.5194/essd-12-1805-2020](https://doi.org/10.5194/essd-12-1805-2020), CC BY 4.0; downloaded from PANGAEA, [doi:10.1594/PANGAEA.909133](https://doi.org/10.1594/PANGAEA.909133) |

Not used: `DataS3`–`DataS5` (recalculation and recalibration inputs), the
`AlpIce-1_ages` shapefiles (the Excel tables hold the same ages with all
columns, including those without coordinates) and the ¹⁴C event-age points
(identical to the ¹⁴C event-age geometry). The event ages in the Excel files
(`TCN_event_ages`, `14C_event_ages` sheets) duplicate the shapefile attributes
and are not read either.

## Rebuilding the data

`data/alpice-core.js` (map layers, short popups, references),
`data/alpice-details.js` (every Excel column, for the "Full record" popup view) and
`data/alpice-outlines-{lgm,lia,today}.js` (simplified outlines) are generated
from the files above, placed in `original-data/` with the folder
names of the Zenodo release:

```bash
python processing-files/build_alpice_data.py
python -m unittest discover -s tests
```

The build needs Python with pandas, openpyxl and geopandas (see `pixi.toml`).
