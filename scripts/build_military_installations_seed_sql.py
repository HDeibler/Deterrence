from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'packages/server/migrations/005_seed_military_installations.sql'

# --- Data sources ---
OMB_SHAPEFILE = Path.home() / 'Desktop/Overseas Military Bases (Shapefile)/OMB'
ICBM_XML = ROOT / 'tmp/icbm-active.xml'

# Map shapefile operator names to ISO3
OPERATOR_TO_ISO3 = {
    'United States': 'USA',
    'Russia': 'RUS',
    'United Kingdoms': 'GBR',
    'France': 'FRA',
    'China': 'CHN',
    'India': 'IND',
    'Italy': 'ITA',
    'United Arab Emirates': 'ARE',
}

ARM_TO_TYPE = {
    'air force': 'air_base',
    'royal air force': 'air_base',
    'military air base': 'air_base',
    'royal air force station': 'air_base',
    'naval air facility': 'air_base',
    'navy': 'naval_base',
    'royal navy': 'naval_base',
    'british royal navy': 'naval_base',
    'british royal navy base': 'naval_base',
    'submarines and queen elizabeth-class aircraft carriers': 'naval_base',
    'pla navy(access right)': 'naval_base',
    'navy(berthing right)': 'naval_base',
    'navy, air force': 'naval_base',
    'navy & air force (access right)': 'naval_base',
    'army': 'army_base',
    'marines': 'army_base',
    'marine corps': 'army_base',
    'coastal guard': 'naval_base',
}

# Russian ICBM bases from Federation of American Scientists
# https://nuke.fas.org/guide/russia/facility/icbm/index.html
RUSSIAN_ICBM_BASES = [
    ("Bershet'", 57.7667, 56.3833),
    ("Dombarovskiy", 50.75, 59.5),
    ("Drovyanaya", 51.5, 113.05),
    ("Irkutsk", 52.3167, 104.2333),
    ("Itatka", 56.8167, 85.5833),
    ("Kansk", 56.3667, 95.4667),
    ("Kartaly", 53.9667, 57.8333),
    ("Kostroma", 57.75, 40.9167),
    ("Kozel'sk", 54.0333, 35.7667),
    ("Krasnoyarsk-Gladkaya", 56.3667, 92.4167),
    ("Nizhniy Tagil", 58.0667, 60.55),
    ("Novosibirsk", 55.3333, 83.0),
    ("Tatishchevo", 51.6667, 45.5667),
    ("Teykovo", 56.85, 40.5333),
    ("Uzhur", 55.3333, 89.8),
    ("Vypolzovo-Yedrovo", 57.8833, 33.65),
    ("Yasnaya-Olovyannaya", 50.9333, 115.55),
    ("Yoshkar Ola", 56.6333, 47.85),
    ("Yur'ya", 59.0333, 49.2667),
]

# Chinese ICBM/nuclear missile bases (public PLARF bases)
# Source: Federation of American Scientists / CSIS / DOD annual reports
CHINESE_MISSILE_BASES = [
    ("Luoning (Base 63 / 631 Brigade)", 34.39, 111.66),
    ("Huaihua (Base 63 / 632 Brigade)", 27.55, 109.98),
    ("Nanyang (Base 63 / 633 Brigade)", 33.0, 112.53),
    ("Kunming (Base 64 / 641 Brigade)", 25.0, 102.68),
    ("Jianshui (Base 64 / 642 Brigade)", 23.62, 102.83),
    ("Yiliang (Base 64 / 643 Brigade)", 24.77, 103.15),
    ("Datong (Base 65 / 651 Brigade)", 40.09, 113.3),
    ("Yidu (Base 65 / 652 Brigade)", 36.78, 118.43),
    ("Xining (Base 66 / 661 Brigade)", 36.62, 101.77),
    ("Haiyan (Base 66 / 662 Brigade)", 36.89, 100.99),
    ("Tianshui (Base 66 / 663 Brigade)", 34.58, 105.72),
    ("Hanzhong (Base 67 / 671 Brigade)", 33.07, 107.03),
]

# Key nuclear-power domestic bases not in the HKU overseas dataset
# Sources: public government/military sites, Wikipedia
DOMESTIC_BASES = [
    # USA — major strategic bases
    ("USA", "F.E. Warren Air Force Base", "air_base", 41.145, -104.862),
    ("USA", "Malmstrom Air Force Base", "air_base", 47.506, -111.183),
    ("USA", "Minot Air Force Base", "air_base", 48.416, -101.358),
    ("USA", "Whiteman Air Force Base", "air_base", 38.730, -93.548),
    ("USA", "Barksdale Air Force Base", "air_base", 32.501, -93.663),
    ("USA", "Ellsworth Air Force Base", "air_base", 44.145, -103.104),
    ("USA", "Dyess Air Force Base", "air_base", 32.421, -99.855),
    ("USA", "Offutt Air Force Base", "air_base", 41.118, -95.913),
    ("USA", "Peterson Space Force Base", "air_base", 38.824, -104.700),
    ("USA", "Vandenberg Space Force Base", "air_base", 34.733, -120.568),
    ("USA", "Naval Base Kitsap-Bangor", "naval_base", 47.729, -122.714),
    ("USA", "Kings Bay Naval Submarine Base", "naval_base", 30.797, -81.515),
    ("USA", "Norfolk Naval Station", "naval_base", 36.946, -76.303),
    ("USA", "Naval Base San Diego", "naval_base", 32.684, -117.129),
    ("USA", "Joint Base Pearl Harbor-Hickam", "naval_base", 21.347, -157.974),
    ("USA", "Fort Liberty (Bragg)", "army_base", 35.140, -79.006),
    ("USA", "Fort Cavazos (Hood)", "army_base", 31.138, -97.775),
    ("USA", "Fort Moore (Benning)", "army_base", 32.359, -84.949),
    ("USA", "Pentagon", "military_base", 38.871, -77.056),
    ("USA", "Cheyenne Mountain Complex", "military_base", 38.744, -104.846),
    # Russia — key strategic bases
    ("RUS", "Engels-2 Air Base", "air_base", 51.482, 46.203),
    ("RUS", "Ukrainka Air Base", "air_base", 51.540, 128.417),
    ("RUS", "Shagol Air Base", "air_base", 55.268, 61.295),
    ("RUS", "Gadzhiyevo Naval Base", "naval_base", 69.252, 33.317),
    ("RUS", "Vilyuchinsk Naval Base", "naval_base", 52.932, 158.402),
    ("RUS", "Severomorsk Naval Base", "naval_base", 69.071, 33.425),
    ("RUS", "National Defence Control Centre", "military_base", 55.741, 37.611),
    # UK — nuclear bases
    ("GBR", "HMNB Clyde (Faslane)", "naval_base", 56.066, -4.821),
    ("GBR", "RAF Lakenheath", "air_base", 52.409, 0.561),
    ("GBR", "AWE Aldermaston", "nuclear_weapons_facility", 51.363, -1.157),
    ("GBR", "RNAD Coulport", "nuclear_weapons_facility", 56.053, -4.868),
    # France
    ("FRA", "Île Longue Submarine Base", "naval_base", 48.298, -4.518),
    ("FRA", "Base Aérienne 113 Saint-Dizier", "air_base", 48.636, 4.900),
    ("FRA", "Base Aérienne 125 Istres", "air_base", 43.523, 4.924),
    # India
    ("IND", "INS Arihant Base (Visakhapatnam)", "naval_base", 17.687, 83.288),
    ("IND", "Agra Air Force Station", "air_base", 27.157, 77.961),
    # Pakistan
    ("PAK", "Sargodha Air Base (Mushaf)", "air_base", 32.049, 72.665),
    ("PAK", "Kamra Air Base", "air_base", 33.869, 72.401),
    ("PAK", "Masroor Air Base", "air_base", 24.894, 66.939),
    ("PAK", "Pakistan Naval Dockyard (Karachi)", "naval_base", 24.838, 66.977),
    # Israel
    ("ISR", "Sdot Micha (Jericho missile base)", "missile_launch_facility", 31.713, 34.983),
    ("ISR", "Palmachim Air Base", "air_base", 31.898, 34.691),
    ("ISR", "Negev Nuclear Research Center (Dimona)", "nuclear_weapons_facility", 31.001, 35.145),
    # North Korea
    ("PRK", "Yongbyon Nuclear Complex", "nuclear_weapons_facility", 39.799, 125.755),
    ("PRK", "Punggye-ri Nuclear Test Site", "nuclear_weapons_facility", 41.277, 129.084),
    ("PRK", "Sanum-dong Missile Facility", "missile_launch_facility", 39.041, 125.667),
    ("PRK", "Tonghae Satellite Launching Ground", "missile_launch_facility", 40.856, 129.666),
    # China — domestic strategic
    ("CHN", "Jiangyou (ICBM Great Wall bunker complex)", "missile_launch_facility", 31.78, 104.74),
    ("CHN", "Yumen ICBM silo field", "missile_launch_facility", 40.17, 97.20),
    ("CHN", "Hami ICBM silo field", "missile_launch_facility", 42.73, 93.72),
    ("CHN", "Huainan Naval Base (SSBN)", "naval_base", 18.22, 109.55),
    ("CHN", "Qingdao Naval Base", "naval_base", 36.066, 120.382),
]


def main() -> None:
    installations: list[dict] = []
    seen: set[str] = set()

    def add(inst: dict) -> None:
        key = f"{inst['iso3']}:{inst['name']}:{inst['lat']}:{inst['lon']}"
        if key in seen:
            return
        seen.add(key)
        installations.append(inst)

    # 1. HKU Overseas Military Bases shapefile
    print('Loading HKU Overseas Military Bases shapefile...')
    for inst in load_shapefile():
        add(inst)
    print(f'  → {len(installations)} overseas bases')

    # 2. US ICBM silos from ALC Press XML
    before = len(installations)
    print('Loading US ICBM silos from XML...')
    for inst in load_icbm_xml():
        add(inst)
    print(f'  → {len(installations) - before} US silos')

    # 3. Russian ICBM bases from FAS
    before = len(installations)
    print('Loading Russian ICBM bases...')
    for name, lat, lon in RUSSIAN_ICBM_BASES:
        add({
            'name': name,
            'iso3': 'RUS',
            'installation_type': 'missile_launch_facility',
            'lat': lat,
            'lon': lon,
            'source_ref': f'fas_russia_icbm:{name_to_slug(name)}',
        })
    print(f'  → {len(installations) - before} Russian ICBM bases')

    # 4. Chinese PLARF missile bases
    before = len(installations)
    print('Loading Chinese PLARF missile bases...')
    for name, lat, lon in CHINESE_MISSILE_BASES:
        add({
            'name': name,
            'iso3': 'CHN',
            'installation_type': 'missile_launch_facility',
            'lat': lat,
            'lon': lon,
            'source_ref': f'fas_china_plarf:{name_to_slug(name)}',
        })
    print(f'  → {len(installations) - before} Chinese missile bases')

    # 5. Domestic strategic bases for nuclear powers
    before = len(installations)
    print('Loading domestic strategic bases...')
    for iso3, name, inst_type, lat, lon in DOMESTIC_BASES:
        add({
            'name': name,
            'iso3': iso3,
            'installation_type': inst_type,
            'lat': lat,
            'lon': lon,
            'source_ref': f'manual:{name_to_slug(name)}',
        })
    print(f'  → {len(installations) - before} domestic bases')

    installations.sort(key=lambda r: (r['iso3'], r['installation_type'], r['name']))

    sql = render_sql(installations)
    OUT.write_text(sql, encoding='utf-8')
    print(f'\nTotal: {len(installations)} installations → {OUT}')

    by_country: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for inst in installations:
        by_country[inst['iso3']] = by_country.get(inst['iso3'], 0) + 1
        by_type[inst['installation_type']] = by_type.get(inst['installation_type'], 0) + 1
    print(f'By country: {dict(sorted(by_country.items(), key=lambda x: -x[1]))}')
    print(f'By type: {dict(sorted(by_type.items(), key=lambda x: -x[1]))}')


def load_shapefile() -> list[dict]:
    import shapefile
    sf = shapefile.Reader(str(OMB_SHAPEFILE))
    fields = [f[0] for f in sf.fields[1:]]
    results = []
    for rec, shape in zip(sf.records(), sf.shapes()):
        row = dict(zip(fields, rec))
        primary_operator = row['Operator'].split(',')[0].strip()
        iso3 = OPERATOR_TO_ISO3.get(primary_operator)
        if not iso3:
            continue
        lon, lat = shape.points[0] if shape.points else (None, None)
        results.append({
            'name': row['Name'] or 'Unnamed Base',
            'iso3': iso3,
            'installation_type': classify_arm((row['Arm'] or '').strip()),
            'lat': round(lat, 6) if lat is not None else None,
            'lon': round(lon, 6) if lon is not None else None,
            'source_ref': f'hku_omb:{name_to_slug(row["Name"] or "unnamed")}',
        })
    return results


def load_icbm_xml() -> list[dict]:
    tree = ET.parse(str(ICBM_XML))
    root = tree.getroot()
    results = []
    for mark in root.findall('mark'):
        name_el = mark.find('name')
        geo_el = mark.find('geo')
        if name_el is None or geo_el is None:
            continue
        name = (name_el.text or '').strip()
        geo = (geo_el.text or '').strip()
        if not geo:
            continue
        parts = geo.split(',')
        if len(parts) != 2:
            continue
        try:
            lat = round(float(parts[0].strip()), 6)
            lon = round(float(parts[1].strip()), 6)
        except ValueError:
            continue
        results.append({
            'name': name,
            'iso3': 'USA',
            'installation_type': 'missile_launch_facility',
            'lat': lat,
            'lon': lon,
            'source_ref': f'alcpress_icbm:{name_to_slug(name)}',
        })
    return results


def classify_arm(arm: str) -> str:
    normalized = arm.lower().replace('\xa0', ' ').strip()
    if normalized in ARM_TO_TYPE:
        return ARM_TO_TYPE[normalized]
    if 'air' in normalized:
        return 'air_base'
    if 'nav' in normalized or 'submarine' in normalized:
        return 'naval_base'
    if 'army' in normalized or 'marine' in normalized:
        return 'army_base'
    return 'military_base'


def name_to_slug(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:80]


def sql_text(value: str | None) -> str:
    if value is None:
        return 'NULL'
    return "'" + value.replace("'", "''") + "'"


def sql_float(value: float | None) -> str:
    if value is None:
        return 'NULL'
    return str(value)


def render_sql(installations: list[dict]) -> str:
    lines = [
        '-- Generated by scripts/build_military_installations_seed_sql.py',
        '-- Sources:',
        '--   HKU Overseas Military Bases (https://datahub.hku.hk/articles/dataset/Overseas_Military_Bases/20438805)',
        '--   ALC Press ICBM Active Silos (https://alcpress.org/military/icbm/index.html)',
        '--   FAS Russian ICBM Bases (https://nuke.fas.org/guide/russia/facility/icbm/index.html)',
        '--   FAS/CSIS Chinese PLARF Bases',
        '--   Public government/military sources for domestic bases',
        'BEGIN;',
        '',
        'DELETE FROM military_installations;',
        '',
        'WITH payload (iso3, name, installation_type, latitude, longitude, source_ref) AS (',
        '  VALUES',
    ]

    value_rows = []
    for inst in installations:
        value_rows.append(
            '    (' + ', '.join([
                sql_text(inst['iso3']),
                sql_text(inst['name']),
                sql_text(inst['installation_type']),
                sql_float(inst['lat']),
                sql_float(inst['lon']),
                sql_text(inst['source_ref']),
            ]) + ')'
        )

    lines.append(',\n'.join(value_rows))
    lines.append(')')
    lines.append('INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)')
    lines.append('SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref')
    lines.append('FROM payload p')
    lines.append('INNER JOIN countries c ON c.iso3 = p.iso3;')
    lines.append('')
    lines.append('COMMIT;')
    lines.append('')
    return '\n'.join(lines)


if __name__ == '__main__':
    main()
