"""Extract fire-zone GeoJSON features from MLIT's prefecture GeoJSON ZIPs.

Source: https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html
Pass the prefecture ZIP paths as arguments. Pipe stdout to tippecanoe
with layer name fire_zones to build public/fire_zones.pmtiles.
"""
import argparse
from collections import Counter
import json
import sys
from zipfile import ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archives", nargs="+")
    args = parser.parse_args()

    totals = Counter()
    for path in args.archives:
        with ZipFile(path) as archive:
            for name in archive.namelist():
                if not name.endswith("_bouka.geojson"):
                    continue
                with archive.open(name) as source:
                    data = json.load(source)
                for feature in data["features"]:
                    properties = feature["properties"]
                    kind = properties["AreaType"]
                    if kind not in ("防火地域", "準防火地域"):
                        raise ValueError(f"{name}: unexpected AreaType {kind!r}")
                    geometry = feature["geometry"]
                    if geometry is None:
                        print(f"{name}: skipping feature without geometry", file=sys.stderr)
                        continue
                    if geometry["type"] not in ("Polygon", "MultiPolygon"):
                        raise ValueError(f"{name}: expected polygon geometry")
                    feature["properties"] = {
                        "kind": kind,
                        "city": properties["Cityname"],
                    }
                    print(json.dumps(feature, ensure_ascii=False, separators=(",", ":")))
                    totals[kind] += 1
    print(dict(totals), file=sys.stderr)


if __name__ == "__main__":
    main()
