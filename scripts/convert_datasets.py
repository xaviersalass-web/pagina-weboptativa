#!/usr/bin/env python3
"""Convert song datasets (CSV + XLSX) into compact JSON for the web page."""

import csv
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)

NUMERIC = {
    "duration_ms", "year", "popularity", "danceability", "energy", "key",
    "loudness", "mode", "speechiness", "acousticness", "instrumentalness",
    "liveness", "valence", "tempo",
}


def coerce(key: str, value):
    if value is None or value == "":
        return None
    if key in NUMERIC:
        try:
            f = float(value)
            return int(f) if f.is_integer() and key in {"duration_ms", "year", "popularity", "key", "mode"} else round(f, 4)
        except (TypeError, ValueError):
            return None
    if key == "explicit":
        return str(value).strip().lower() in {"true", "1", "yes"}
    if key == "genre":
        return [g.strip() for g in str(value).split(",") if g.strip()]
    return str(value).strip()


def from_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [{k: coerce(k, v) for k, v in row.items()} for row in reader]


def from_xlsx(path: Path, sheet: str = "Base de datos"):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() for h in next(rows)]
    out = []
    for row in rows:
        if all(v is None for v in row):
            continue
        out.append({h: coerce(h, v) for h, v in zip(header, row)})
    return out


def summarize(songs):
    years = [s["year"] for s in songs if s.get("year")]
    return {
        "count": len(songs),
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
    }


def main():
    set_a = from_csv(ROOT / "DataBase 200 songs.csv")
    set_b = from_xlsx(ROOT / "Base de datos 2000 canciones.xlsx")

    (OUT / "songs_a.json").write_text(json.dumps(set_a, ensure_ascii=False), encoding="utf-8")
    (OUT / "songs_b.json").write_text(json.dumps(set_b, ensure_ascii=False), encoding="utf-8")

    manifest = {
        "set_a": {"file": "songs_a.json", "label": "Dataset A", **summarize(set_a)},
        "set_b": {"file": "songs_b.json", "label": "Dataset B", **summarize(set_b)},
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
