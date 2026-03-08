from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/server/migrations/003_seed_country_military_attributes.sql'
RDMC_CACHE = ROOT / 'tmp/rdmc_long_v1.csv'
RDMC_URL = 'https://www.dropbox.com/scl/fi/v6sp79cjzh4pxh2iink6l/rDMC_long_v1.csv?rlkey=am54mxz4wy59y77wlmowujod9&dl=1'
RDMC_SOURCE_PAGE = 'https://www.militarycapabilities.com/data'
SIPRI_NUCLEAR_SOURCE = 'https://www.sipri.org/sites/default/files/2025-08/yb25_summary_en_v2.pdf'
WORLD_BANK_INDICATORS = {
    'MS.MIL.TOTL.P1': {
        'key': 'military_armed_forces_personnel_total',
        'name': 'Armed Forces Personnel, Total',
        'description': 'Latest available armed forces personnel total from the World Bank indicator MS.MIL.TOTL.P1 (source: World Bank, originally SIPRI).',
    },
    'MS.MIL.XPND.CD': {
        'key': 'military_expenditure_current_usd',
        'name': 'Military Expenditure, Current USD',
        'description': 'Latest available military expenditure in current US dollars from the World Bank indicator MS.MIL.XPND.CD (source: World Bank, originally SIPRI).',
    },
    'MS.MIL.XPND.GD.ZS': {
        'key': 'military_expenditure_pct_gdp',
        'name': 'Military Expenditure, Percent of GDP',
        'description': 'Latest available military expenditure as a percent of GDP from the World Bank indicator MS.MIL.XPND.GD.ZS (source: World Bank, originally SIPRI).',
    },
    'MS.MIL.MPRT.KD': {
        'key': 'military_arms_imports_trend_indicator_value',
        'name': 'Arms Imports, Trend Indicator Value',
        'description': 'Latest available arms imports trend-indicator value from the World Bank indicator MS.MIL.MPRT.KD (source: World Bank, originally SIPRI Arms Transfers Database).',
    },
    'MS.MIL.XPRT.KD': {
        'key': 'military_arms_exports_trend_indicator_value',
        'name': 'Arms Exports, Trend Indicator Value',
        'description': 'Latest available arms exports trend-indicator value from the World Bank indicator MS.MIL.XPRT.KD (source: World Bank, originally SIPRI Arms Transfers Database).',
    },
}
RDMC_METRICS = [
    {
        'key': 'military_aircraft_total_units_2014',
        'name': 'Aircraft Total Units (2014)',
        'description': 'Total aircraft units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'aircraft_'),
    },
    {
        'key': 'military_helicopters_total_units_2014',
        'name': 'Helicopters Total Units (2014)',
        'description': 'Total helicopter units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'helicopters_'),
    },
    {
        'key': 'military_armoured_fighting_vehicles_total_units_2014',
        'name': 'Armoured Fighting Vehicles Total Units (2014)',
        'description': 'Total armoured fighting vehicle units recorded for 2014 in the rDMC Military Capabilities Dataset. This is the closest open country-level equipment proxy available here for tanks/armoured ground platforms.',
        'match': ('prefix', 'armoured fighting vehicles_'),
    },
    {
        'key': 'military_artillery_total_units_2014',
        'name': 'Artillery Total Units (2014)',
        'description': 'Artillery units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('exact', 'artillery'),
    },
    {
        'key': 'military_principal_surface_combatants_total_units_2014',
        'name': 'Principal Surface Combatants Total Units (2014)',
        'description': 'Principal surface combatant units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'principal surface combatants_'),
    },
    {
        'key': 'military_patrol_and_coastal_combatants_total_units_2014',
        'name': 'Patrol and Coastal Combatants Total Units (2014)',
        'description': 'Patrol and coastal combatant units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'patrol and coastal combatants_'),
    },
    {
        'key': 'military_submarines_total_units_2014',
        'name': 'Submarines Total Units (2014)',
        'description': 'Submarine units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'submarines_'),
    },
    {
        'key': 'military_ballistic_missiles_total_units_2014',
        'name': 'Ballistic Missiles Total Units (2014)',
        'description': 'Ballistic missile units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'ballistic missiles_'),
    },
    {
        'key': 'military_unmanned_aerial_vehicles_total_units_2014',
        'name': 'Unmanned Aerial Vehicles Total Units (2014)',
        'description': 'Unmanned aerial vehicle units recorded for 2014 in the rDMC Military Capabilities Dataset.',
        'match': ('prefix', 'unmanned aerial vehicles_'),
    },
]
SIPRI_NUCLEAR_DEFINITIONS = [
    {
        'key': 'military_nuclear_warheads_deployed_2025',
        'name': 'Nuclear Warheads Deployed (2025)',
        'description': 'Estimated deployed nuclear warheads at the start of 2025 from SIPRI Yearbook 2025 summary.',
    },
    {
        'key': 'military_nuclear_warheads_stored_2025',
        'name': 'Nuclear Warheads Stored (2025)',
        'description': 'Estimated stored nuclear warheads at the start of 2025 from SIPRI Yearbook 2025 summary.',
    },
    {
        'key': 'military_nuclear_warheads_stockpile_total_2025',
        'name': 'Nuclear Warheads Military Stockpile Total (2025)',
        'description': 'Estimated military stockpile total nuclear warheads at the start of 2025 from SIPRI Yearbook 2025 summary.',
    },
    {
        'key': 'military_nuclear_warheads_retired_2025',
        'name': 'Nuclear Warheads Retired (2025)',
        'description': 'Estimated retired nuclear warheads awaiting dismantlement at the start of 2025 from SIPRI Yearbook 2025 summary.',
    },
    {
        'key': 'military_nuclear_warheads_total_inventory_2025',
        'name': 'Nuclear Warheads Total Inventory (2025)',
        'description': 'Estimated total nuclear warhead inventory at the start of 2025 from SIPRI Yearbook 2025 summary.',
    },
]
SIPRI_NUCLEAR_VALUES = {
    'USA': {'military_nuclear_warheads_deployed_2025': 1770, 'military_nuclear_warheads_stored_2025': 1930, 'military_nuclear_warheads_stockpile_total_2025': 3700, 'military_nuclear_warheads_retired_2025': 1477, 'military_nuclear_warheads_total_inventory_2025': 5177},
    'RUS': {'military_nuclear_warheads_deployed_2025': 1718, 'military_nuclear_warheads_stored_2025': 2591, 'military_nuclear_warheads_stockpile_total_2025': 4309, 'military_nuclear_warheads_retired_2025': 1150, 'military_nuclear_warheads_total_inventory_2025': 5459},
    'GBR': {'military_nuclear_warheads_deployed_2025': 120, 'military_nuclear_warheads_stored_2025': 105, 'military_nuclear_warheads_stockpile_total_2025': 225, 'military_nuclear_warheads_total_inventory_2025': 225},
    'FRA': {'military_nuclear_warheads_deployed_2025': 280, 'military_nuclear_warheads_stored_2025': 10, 'military_nuclear_warheads_stockpile_total_2025': 290, 'military_nuclear_warheads_total_inventory_2025': 290},
    'CHN': {'military_nuclear_warheads_deployed_2025': 24, 'military_nuclear_warheads_stored_2025': 576, 'military_nuclear_warheads_stockpile_total_2025': 600, 'military_nuclear_warheads_total_inventory_2025': 600},
    'IND': {'military_nuclear_warheads_deployed_2025': 0, 'military_nuclear_warheads_stored_2025': 180, 'military_nuclear_warheads_stockpile_total_2025': 180, 'military_nuclear_warheads_total_inventory_2025': 180},
    'PAK': {'military_nuclear_warheads_deployed_2025': 0, 'military_nuclear_warheads_stored_2025': 170, 'military_nuclear_warheads_stockpile_total_2025': 170, 'military_nuclear_warheads_total_inventory_2025': 170},
    'PRK': {'military_nuclear_warheads_deployed_2025': 0, 'military_nuclear_warheads_stored_2025': 50, 'military_nuclear_warheads_stockpile_total_2025': 50, 'military_nuclear_warheads_total_inventory_2025': 50},
    'ISR': {'military_nuclear_warheads_deployed_2025': 0, 'military_nuclear_warheads_stored_2025': 90, 'military_nuclear_warheads_stockpile_total_2025': 90, 'military_nuclear_warheads_total_inventory_2025': 90},
}
ISO3_PATTERN = re.compile(r'^[A-Z]{3}$')


def main() -> None:
    definitions = []
    seen_definition_keys = set()
    values = []

    for indicator, config in WORLD_BANK_INDICATORS.items():
        add_definition(definitions, seen_definition_keys, config['key'], config['name'], config['description'])
        values.extend(fetch_world_bank_values(indicator, config['key']))

    for metric in RDMC_METRICS:
        add_definition(definitions, seen_definition_keys, metric['key'], metric['name'], metric['description'])
    values.extend(fetch_rdmc_values())

    for definition in SIPRI_NUCLEAR_DEFINITIONS:
        add_definition(definitions, seen_definition_keys, definition['key'], definition['name'], definition['description'])
    values.extend(build_nuclear_values())

    sql = render_sql(definitions, values)
    OUT.write_text(sql, encoding='utf-8')
    print(f'wrote {len(definitions)} definitions and {len(values)} values to {OUT}')


def add_definition(definitions, seen_keys, key, name, description):
    if key in seen_keys:
        return
    definitions.append({'key': key, 'name': name, 'description': description, 'value_type': 'number', 'cardinality': 'one'})
    seen_keys.add(key)


def fetch_world_bank_values(indicator: str, attribute_key: str):
    url = f'https://api.worldbank.org/v2/country/all/indicator/{indicator}?format=json&per_page=20000'
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    payload = response.json()
    latest_by_country = {}
    for row in payload[1]:
        iso3 = (row.get('countryiso3code') or '').strip().upper()
        if not ISO3_PATTERN.match(iso3):
            continue
        value = row.get('value')
        if value is None:
            continue
        year = int(row['date'])
        current = latest_by_country.get(iso3)
        if current is None or year > current['year']:
            latest_by_country[iso3] = {'value': value, 'year': year}

    return [
        {
            'iso3': iso3,
            'attribute_key': attribute_key,
            'value': normalize_number(data['value']),
            'source_ref': f'{url}|year={data["year"]}',
        }
        for iso3, data in sorted(latest_by_country.items())
    ]


def fetch_rdmc_values():
    ensure_rdmc_cache()
    state_metric_totals = defaultdict(lambda: defaultdict(float))
    state_metric_seen = defaultdict(lambda: defaultdict(bool))

    with RDMC_CACHE.open('r', encoding='utf-8', newline='') as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row['year'] != '2014':
                continue
            iso3 = (row['stateabb'] or '').strip().upper()
            if not ISO3_PATTERN.match(iso3):
                continue
            unit_count = row['unit_count']
            if unit_count in ('', 'NA'):
                continue
            tek = row['tek']
            numeric_value = float(unit_count)
            for metric in RDMC_METRICS:
                if metric_matches(metric['match'], tek):
                    state_metric_totals[iso3][metric['key']] += numeric_value
                    state_metric_seen[iso3][metric['key']] = True

    values = []
    for iso3 in sorted(state_metric_totals.keys()):
        for metric in RDMC_METRICS:
            key = metric['key']
            if not state_metric_seen[iso3][key]:
                continue
            values.append({
                'iso3': iso3,
                'attribute_key': key,
                'value': int(round(state_metric_totals[iso3][key])),
                'source_ref': f'{RDMC_SOURCE_PAGE}|dataset=rDMC_long_v1.csv|year=2014',
            })
    return values


def metric_matches(match_spec, tek: str) -> bool:
    mode, value = match_spec
    if mode == 'prefix':
        return tek.startswith(value)
    if mode == 'exact':
        return tek == value
    raise ValueError(f'Unsupported match mode: {mode}')


def ensure_rdmc_cache():
    if RDMC_CACHE.exists() and RDMC_CACHE.stat().st_size > 0:
        return
    RDMC_CACHE.parent.mkdir(parents=True, exist_ok=True)
    response = requests.get(RDMC_URL, timeout=120)
    response.raise_for_status()
    RDMC_CACHE.write_bytes(response.content)


def build_nuclear_values():
    values = []
    for iso3, metrics in sorted(SIPRI_NUCLEAR_VALUES.items()):
        for attribute_key, value in metrics.items():
            values.append({
                'iso3': iso3,
                'attribute_key': attribute_key,
                'value': value,
                'source_ref': f'{SIPRI_NUCLEAR_SOURCE}|year=2025',
            })
    return values


def normalize_number(value):
    numeric = float(value)
    if numeric.is_integer():
        return int(numeric)
    return numeric


def sql_text(value: str | None) -> str:
    if value is None:
        return 'NULL'
    return "'" + value.replace("'", "''") + "'"


def sql_json_number(value) -> str:
    return sql_text(json.dumps(value, separators=(',', ':'))) + '::jsonb'


def render_sql(definitions, values) -> str:
    managed_keys = [definition['key'] for definition in definitions]
    lines = [
        '-- Generated by scripts/build_country_military_seed_sql.py',
        'BEGIN;',
        '',
        'INSERT INTO country_attribute_definitions (key, name, description, value_type, cardinality)',
        'VALUES',
    ]
    definition_values = []
    for definition in definitions:
        definition_values.append(
            '  (' + ', '.join([
                sql_text(definition['key']),
                sql_text(definition['name']),
                sql_text(definition['description']),
                sql_text(definition['value_type']),
                sql_text(definition['cardinality']),
            ]) + ')'
        )
    lines.append(',\n'.join(definition_values))
    lines.append('ON CONFLICT (key) DO UPDATE SET')
    lines.append('  name = EXCLUDED.name,')
    lines.append('  description = EXCLUDED.description,')
    lines.append('  value_type = EXCLUDED.value_type,')
    lines.append('  cardinality = EXCLUDED.cardinality,')
    lines.append('  updated_at = NOW();')
    lines.append('')
    lines.append('DELETE FROM country_attribute_values AS values')
    lines.append('USING country_attribute_definitions AS definitions')
    lines.append('WHERE values.attribute_definition_id = definitions.id')
    lines.append(f'  AND definitions.key IN ({", ".join(sql_text(key) for key in managed_keys)});')
    lines.append('')
    lines.append('WITH payload (iso3, attribute_key, value_json, source_ref) AS (')
    lines.append('  VALUES')
    value_rows = []
    for value in values:
        value_rows.append(
            '    (' + ', '.join([
                sql_text(value['iso3']),
                sql_text(value['attribute_key']),
                sql_json_number(value['value']),
                sql_text(value['source_ref']),
            ]) + ')'
        )
    lines.append(',\n'.join(value_rows))
    lines.append(')')
    lines.append('INSERT INTO country_attribute_values (country_id, attribute_definition_id, value_json, source_ref)')
    lines.append('SELECT countries.id, definitions.id, payload.value_json, payload.source_ref')
    lines.append('FROM payload')
    lines.append('INNER JOIN countries ON countries.iso3 = payload.iso3')
    lines.append('INNER JOIN country_attribute_definitions AS definitions ON definitions.key = payload.attribute_key;')
    lines.append('')
    lines.append('COMMIT;')
    lines.append('')
    return '\n'.join(lines)


if __name__ == '__main__':
    main()
