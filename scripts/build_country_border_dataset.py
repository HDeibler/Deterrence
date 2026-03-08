from __future__ import annotations

import json
import re
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'tmp/naturalearth/borders/ne_50m_admin_0_boundary_lines_land.shp'
OUT = ROOT / 'packages/app/public/data/borders/country-borders-50m.json'
ISO3_PATTERN = re.compile(r'^[A-Z]{3}$')


def round_point(point):
    return [round(point[0], 3), round(point[1], 3)]


def normalize_iso3(value):
    if not isinstance(value, str):
        return None
    normalized = value.strip().upper()
    return normalized if ISO3_PATTERN.match(normalized) else None


def main() -> None:
    reader = shapefile.Reader(str(SRC))
    field_names = [field[0] for field in reader.fields[1:]]
    idx_name = field_names.index('NAME')
    idx_brk_a3 = field_names.index('BRK_A3')
    idx_min_zoom = field_names.index('MIN_ZOOM')

    segments = []
    for shape_record in reader.iterShapeRecords():
        record = shape_record.record
        shape = shape_record.shape
        name = record[idx_name]
        iso3 = normalize_iso3(record[idx_brk_a3])
        min_zoom = float(record[idx_min_zoom] or 0)
        parts = list(shape.parts) + [len(shape.points)]
        for start, end in zip(parts, parts[1:]):
            points = [round_point(point) for point in shape.points[start:end]]
            if len(points) < 2:
                continue
            segments.append([name, iso3, round(min_zoom, 1), points])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'source': 'Natural Earth admin_0_boundary_lines_land 50m',
        'fields': ['name', 'iso3', 'minZoom', 'points'],
        'count': len(segments),
        'segments': segments,
    }
    OUT.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {len(segments)} segments to {OUT}')


if __name__ == '__main__':
    main()
