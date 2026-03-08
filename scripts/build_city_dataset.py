from __future__ import annotations

import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'tmp/cities5000/cities5000.txt'
OUT = ROOT / 'packages/app/public/data/cities/world-cities-5000.json'

CAPITAL_RANK = {
    'PPLC': 4,
    'PPLA': 3,
    'PPLA2': 2,
    'PPLA3': 2,
    'PPLA4': 2,
    'PPLA5': 1,
}


def score(population: int, capital_rank: int) -> float:
    return capital_rank * 100 + math.log10(max(population, 1))


def main() -> None:
    cities = []
    with SRC.open('r', encoding='utf-8') as handle:
        reader = csv.reader(handle, delimiter='\t')
        for row in reader:
            name = row[1]
            latitude = round(float(row[4]), 4)
            longitude = round(float(row[5]), 4)
            feature_code = row[7]
            country_code = row[8]
            population = int(row[14] or 0)
            capital_rank = CAPITAL_RANK.get(feature_code, 0)
            cities.append([
                name,
                country_code,
                latitude,
                longitude,
                population,
                capital_rank,
                round(score(population, capital_rank), 5),
            ])

    cities.sort(key=lambda item: item[6], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'source': 'GeoNames cities5000',
        'fields': ['name', 'countryCode', 'lat', 'lon', 'population', 'capitalRank', 'score'],
        'count': len(cities),
        'cities': cities,
    }
    with OUT.open('w', encoding='utf-8') as handle:
        json.dump(payload, handle, separators=(',', ':'))

    print(f'wrote {len(cities)} cities to {OUT}')


if __name__ == '__main__':
    main()
