-- Fix air bases to match realistic USAF deployment infrastructure.
-- Based on actual USAF installations, Coronet deployment corridors,
-- and active Status of Forces Agreements as of 2024-2025.
--
-- Sources:
--   Military.com USAF base guide
--   USAF Fact Sheets (af.mil)
--   CRS Reports on US Overseas Basing (R48123)
--   The Aviationist / Air & Space Forces Magazine reporting
BEGIN;

-- Remove the unrealistic bases added in migration 008 that don't
-- reflect actual USAF basing (we'll re-add the correct ones below).
DELETE FROM military_installations WHERE source_ref LIKE 'manual:%'
  AND source_ref NOT IN (
    -- Keep any manual entries from earlier migrations that are real
    'manual:hami-icbm-silo-field',
    'manual:yumen-icbm-silo-field',
    'manual:jiangyou-icbm-great-wall-bunker-complex',
    'manual:huainan-naval-base-ssbn',
    'manual:qingdao-naval-base',
    'manual:norfolk-naval-station',
    'manual:naval-base-kitsap-bangor',
    'manual:naval-base-san-diego',
    'manual:kings-bay-naval-submarine-base'
  )
  AND installation_type = 'air_base';

-- ═══════════════════════════════════════════════════════════════════
-- US DOMESTIC BASES (missing from original dataset)
-- ═══════════════════════════════════════════════════════════════════
WITH us_domestic (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    -- Alaska (critical Pacific corridor)
    ('USA', 'Eielson Air Force Base', 'air_base', 64.6636, -147.1014, 'manual:eielson-afb'),
    ('USA', 'Joint Base Elmendorf-Richardson', 'air_base', 61.2500, -149.7934, 'manual:jber'),
    -- Hawaii (Pacific mid-point)
    ('USA', 'Joint Base Pearl Harbor-Hickam', 'air_base', 21.3187, -157.9224, 'manual:jbphh'),
    -- Pacific islands
    ('USA', 'Wake Island Airfield', 'air_base', 19.2821, 166.6361, 'manual:wake-island'),
    -- Major CONUS fighter bases missing from DB
    ('USA', 'Hill Air Force Base', 'air_base', 41.1239, -111.9731, 'manual:hill-afb'),
    ('USA', 'Luke Air Force Base', 'air_base', 33.5352, -112.3830, 'manual:luke-afb'),
    ('USA', 'Nellis Air Force Base', 'air_base', 36.2361, -115.0342, 'manual:nellis-afb'),
    ('USA', 'Mountain Home Air Force Base', 'air_base', 43.0436, -115.8664, 'manual:mountain-home-afb'),
    ('USA', 'Langley Air Force Base', 'air_base', 37.0833, -76.3606, 'manual:langley-afb'),
    ('USA', 'Eglin Air Force Base', 'air_base', 30.4833, -86.5254, 'manual:eglin-afb'),
    ('USA', 'Shaw Air Force Base', 'air_base', 33.9704, -80.4718, 'manual:shaw-afb'),
    ('USA', 'Seymour Johnson Air Force Base', 'air_base', 35.3394, -77.9606, 'manual:seymour-johnson-afb'),
    ('USA', 'Moody Air Force Base', 'air_base', 30.9674, -83.1930, 'manual:moody-afb'),
    ('USA', 'Tyndall Air Force Base', 'air_base', 30.0696, -85.5768, 'manual:tyndall-afb'),
    ('USA', 'Travis Air Force Base', 'air_base', 38.2627, -121.9275, 'manual:travis-afb'),
    ('USA', 'Dover Air Force Base', 'air_base', 39.1297, -75.4660, 'manual:dover-afb'),
    ('USA', 'Joint Base Andrews', 'air_base', 38.8108, -76.8660, 'manual:jb-andrews'),
    ('USA', 'Joint Base McGuire-Dix-Lakehurst', 'air_base', 40.0157, -74.5936, 'manual:jb-mcguire'),
    ('USA', 'Fairchild Air Force Base', 'air_base', 47.6152, -117.6559, 'manual:fairchild-afb'),
    ('USA', 'McConnell Air Force Base', 'air_base', 37.6218, -97.2684, 'manual:mcconnell-afb'),
    ('USA', 'MacDill Air Force Base', 'air_base', 27.8494, -82.5213, 'manual:macdill-afb')
)
INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)
SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref
FROM us_domestic p
INNER JOIN countries c ON c.iso3 = p.iso3
WHERE NOT EXISTS (
  SELECT 1 FROM military_installations mi WHERE mi.source_ref = p.source_ref
);

-- ═══════════════════════════════════════════════════════════════════
-- OVERSEAS USAF BASES (permanent installations with SOFA agreements)
-- ═══════════════════════════════════════════════════════════════════
WITH overseas (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    -- ── UK (largest USAF presence in Europe) ──
    ('GBR', 'RAF Lakenheath', 'air_base', 52.4093, 0.5609, 'manual:raf-lakenheath'),
    ('GBR', 'RAF Mildenhall', 'air_base', 52.3614, 0.4864, 'manual:raf-mildenhall'),
    ('GBR', 'RAF Fairford', 'air_base', 51.6822, -1.7900, 'manual:raf-fairford'),

    -- ── Germany (USAFE headquarters) ──
    ('DEU', 'Ramstein Air Base', 'air_base', 49.4369, 7.6003, 'manual:ramstein-ab'),
    ('DEU', 'Spangdahlem Air Base', 'air_base', 49.9725, 6.6925, 'manual:spangdahlem-ab'),

    -- ── Italy ──
    ('ITA', 'Aviano Air Base', 'air_base', 46.0319, 12.5965, 'manual:aviano-ab'),

    -- ── Spain (tanker staging for Coronet missions) ──
    ('ESP', 'Moron Air Base', 'air_base', 37.1749, -5.6158, 'manual:moron-ab'),

    -- ── Portugal / Azores (Atlantic mid-point for Coronet) ──
    ('PRT', 'Lajes Field', 'air_base', 38.7618, -27.0908, 'manual:lajes-field'),

    -- ── Greece ──
    ('GRC', 'Souda Bay Air Base', 'air_base', 35.4914, 24.1186, 'manual:souda-bay'),

    -- ── Turkey ──
    ('TUR', 'Incirlik Air Base', 'air_base', 37.0021, 35.4259, 'manual:incirlik-ab'),

    -- ── Japan (PACAF forward bases) ──
    ('JPN', 'Kadena Air Base', 'air_base', 26.3516, 127.7692, 'manual:kadena-ab'),
    ('JPN', 'Yokota Air Base', 'air_base', 35.7485, 139.3485, 'manual:yokota-ab'),
    ('JPN', 'Misawa Air Base', 'air_base', 40.7032, 141.3686, 'manual:misawa-ab'),

    -- ── South Korea ──
    ('KOR', 'Osan Air Base', 'air_base', 37.0905, 127.0305, 'manual:osan-ab'),
    ('KOR', 'Kunsan Air Base', 'air_base', 35.9022, 126.6160, 'manual:kunsan-ab'),

    -- ── Middle East (active USAF presence) ──
    ('QAT', 'Al Udeid Air Base', 'air_base', 25.1174, 51.3150, 'manual:al-udeid-ab'),
    ('ARE', 'Al Dhafra Air Base', 'air_base', 24.2481, 54.5472, 'manual:al-dhafra-ab'),

    -- ── Australia (rotational access under Force Posture Agreement) ──
    ('AUS', 'RAAF Base Tindal', 'air_base', -14.5214, 132.3778, 'manual:raaf-tindal'),
    ('AUS', 'RAAF Base Darwin', 'air_base', -12.4147, 130.8728, 'manual:raaf-darwin'),

    -- ── Iceland (NATO tanker staging, no permanent USAF but available) ──
    ('ISL', 'Keflavik Air Base', 'air_base', 63.9850, -22.6056, 'manual:keflavik-ab'),

    -- ── Norway (NATO ally, hosts rotational USAF/USMC) ──
    ('NOR', 'Orland Air Station', 'air_base', 63.6989, 9.6044, 'manual:orland-norway'),

    -- ── Diego Garcia (critical Indian Ocean staging) ──
    ('GBR', 'Diego Garcia', 'air_base', -7.3133, 72.4111, 'manual:diego-garcia'),

    -- ── Canada (NORAD partner) ──
    ('CAN', 'CFB Cold Lake', 'air_base', 54.4050, -110.2789, 'manual:cfb-cold-lake'),
    ('CAN', 'CFB Bagotville', 'air_base', 48.3308, -70.9964, 'manual:cfb-bagotville'),

    -- ── Singapore (rotational access) ──
    ('SGP', 'Changi Air Base', 'air_base', 1.3553, 103.9717, 'manual:changi-ab')
)
INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)
SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref
FROM overseas p
INNER JOIN countries c ON c.iso3 = p.iso3
WHERE NOT EXISTS (
  SELECT 1 FROM military_installations mi WHERE mi.source_ref = p.source_ref
);

-- ═══════════════════════════════════════════════════════════════════
-- RUSSIA DOMESTIC (for RUS player)
-- ═══════════════════════════════════════════════════════════════════
WITH russia (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    ('RUS', 'Khabarovsk-Bolshoy Air Base', 'air_base', 48.5280, 135.1880, 'manual:khabarovsk-ab'),
    ('RUS', 'Vladivostok-Knevichi Air Base', 'air_base', 43.3960, 132.1480, 'manual:vladivostok-ab'),
    ('RUS', 'Novosibirsk-Tolmachevo Air Base', 'air_base', 55.0128, 82.6508, 'manual:novosibirsk-ab'),
    ('RUS', 'Severomorsk-3 Air Base', 'air_base', 69.0167, 33.4167, 'manual:severomorsk-ab'),
    ('RUS', 'Engels Air Base', 'air_base', 51.4830, 46.2005, 'manual:engels-ab'),
    ('RUS', 'Shagol Air Base', 'air_base', 55.2130, 61.3166, 'manual:shagol-ab')
)
INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)
SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref
FROM russia p
INNER JOIN countries c ON c.iso3 = p.iso3
WHERE NOT EXISTS (
  SELECT 1 FROM military_installations mi WHERE mi.source_ref = p.source_ref
);

-- ═══════════════════════════════════════════════════════════════════
-- CHINA DOMESTIC (for CHN player)
-- ═══════════════════════════════════════════════════════════════════
WITH china (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    ('CHN', 'Nanjing-Lukou Air Base', 'air_base', 31.7420, 118.8620, 'manual:nanjing-ab'),
    ('CHN', 'Chengdu-Qionglai Air Base', 'air_base', 30.5880, 103.4600, 'manual:chengdu-ab'),
    ('CHN', 'Shenyang Air Base', 'air_base', 41.7800, 123.4500, 'manual:shenyang-ab'),
    ('CHN', 'Guangzhou-Shadi Air Base', 'air_base', 23.3500, 113.3000, 'manual:guangzhou-ab'),
    ('CHN', 'Hotan Air Base', 'air_base', 37.0389, 79.8653, 'manual:hotan-ab'),
    ('CHN', 'Urumqi Air Base', 'air_base', 43.9071, 87.4742, 'manual:urumqi-ab')
)
INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)
SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref
FROM china p
INNER JOIN countries c ON c.iso3 = p.iso3
WHERE NOT EXISTS (
  SELECT 1 FROM military_installations mi WHERE mi.source_ref = p.source_ref
);

COMMIT;
