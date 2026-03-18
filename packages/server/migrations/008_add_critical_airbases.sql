-- Add critical allied air bases missing from the original dataset.
-- These are essential for global air routing (tanker staging, refueling corridors).
-- Sources: public military/government data, DoD base listings.
BEGIN;

WITH payload (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    -- US Pacific (critical gap — no bases between CONUS and Guam)
    ('USA', 'Joint Base Pearl Harbor-Hickam', 'air_base', 21.3187, -157.9224, 'manual:jbphh-hawaii'),
    ('USA', 'Eielson Air Force Base', 'air_base', 64.6636, -147.1014, 'manual:eielson-alaska'),
    ('USA', 'Joint Base Elmendorf-Richardson', 'air_base', 61.2500, -149.7934, 'manual:jber-alaska'),
    ('USA', 'Wake Island Airfield', 'air_base', 19.2821, 166.6361, 'manual:wake-island'),

    -- Japan (major US ally, key Pacific staging)
    ('JPN', 'Misawa Air Base', 'air_base', 40.7032, 141.3686, 'manual:misawa-japan'),
    ('JPN', 'Yokota Air Base', 'air_base', 35.7485, 139.3485, 'manual:yokota-japan'),
    ('JPN', 'Kadena Air Base', 'air_base', 26.3516, 127.7692, 'manual:kadena-okinawa'),
    ('JPN', 'Iwakuni Marine Corps Air Station', 'air_base', 34.1464, 132.2358, 'manual:iwakuni-japan'),

    -- South Korea
    ('KOR', 'Osan Air Base', 'air_base', 37.0905, 127.0305, 'manual:osan-korea'),
    ('KOR', 'Kunsan Air Base', 'air_base', 35.9022, 126.6160, 'manual:kunsan-korea'),

    -- Australia
    ('AUS', 'RAAF Base Tindal', 'air_base', -14.5214, 132.3778, 'manual:tindal-australia'),
    ('AUS', 'RAAF Base Amberley', 'air_base', -27.6406, 152.7111, 'manual:amberley-australia'),
    ('AUS', 'RAAF Base Darwin', 'air_base', -12.4147, 130.8728, 'manual:darwin-australia'),

    -- NATO Europe (filling coverage gaps)
    ('NOR', 'Bardufoss Air Station', 'air_base', 69.0558, 18.5403, 'manual:bardufoss-norway'),
    ('NOR', 'Orland Air Station', 'air_base', 63.6989, 9.6044, 'manual:orland-norway'),
    ('ISL', 'Keflavik Air Base', 'air_base', 63.9850, -22.6056, 'manual:keflavik-iceland'),
    ('DEU', 'Ramstein Air Base', 'air_base', 49.4369, 7.6003, 'manual:ramstein-germany'),
    ('DEU', 'Spangdahlem Air Base', 'air_base', 49.9725, 6.6925, 'manual:spangdahlem-germany'),
    ('TUR', 'Incirlik Air Base', 'air_base', 37.0021, 35.4259, 'manual:incirlik-turkey'),
    ('GRC', 'Souda Bay Air Base', 'air_base', 35.4914, 24.1186, 'manual:souda-bay-greece'),
    ('ESP', 'Moron Air Base', 'air_base', 37.1749, -5.6158, 'manual:moron-spain'),
    ('PRT', 'Lajes Field Azores', 'air_base', 38.7618, -27.0908, 'manual:lajes-azores'),

    -- Middle East partners
    ('QAT', 'Al Udeid Air Base', 'air_base', 25.1174, 51.3150, 'manual:al-udeid-qatar'),
    ('BHR', 'Isa Air Base', 'air_base', 25.9183, 50.5906, 'manual:isa-bahrain'),
    ('KWT', 'Ali Al Salem Air Base', 'air_base', 29.3467, 47.5231, 'manual:ali-al-salem-kuwait'),
    ('JOR', 'Muwaffaq Salti Air Base', 'air_base', 32.3564, 36.2592, 'manual:muwaffaq-salti-jordan'),
    ('SAU', 'Prince Sultan Air Base', 'air_base', 24.0627, 47.5802, 'manual:prince-sultan-saudi'),

    -- Diego Garcia (critical Indian Ocean staging)
    ('GBR', 'Diego Garcia Naval Support Facility', 'air_base', -7.3133, 72.4111, 'manual:diego-garcia'),

    -- Canada
    ('CAN', 'CFB Cold Lake', 'air_base', 54.4050, -110.2789, 'manual:cold-lake-canada'),
    ('CAN', 'CFB Bagotville', 'air_base', 48.3308, -70.9964, 'manual:bagotville-canada'),

    -- Singapore / Philippines (Pacific allies)
    ('SGP', 'Changi Air Base', 'air_base', 1.3553, 103.9717, 'manual:changi-singapore'),
    ('PHL', 'Basa Air Base', 'air_base', 15.4886, 120.5581, 'manual:basa-philippines'),

    -- Russia additional (domestic bases for RUS player)
    ('RUS', 'Khabarovsk-Bolshoy Air Base', 'air_base', 48.5280, 135.1880, 'manual:khabarovsk-russia'),
    ('RUS', 'Vladivostok-Knevichi Air Base', 'air_base', 43.3960, 132.1480, 'manual:vladivostok-russia'),
    ('RUS', 'Novosibirsk-Tolmachevo Air Base', 'air_base', 55.0128, 82.6508, 'manual:novosibirsk-russia'),
    ('RUS', 'Murmansk-Severomorsk Air Base', 'air_base', 69.0167, 33.4167, 'manual:severomorsk-russia'),

    -- China additional (domestic bases for CHN player)
    ('CHN', 'Nanjing-Lukou Air Base', 'air_base', 31.7420, 118.8620, 'manual:nanjing-china'),
    ('CHN', 'Chengdu-Qionglai Air Base', 'air_base', 30.5880, 103.4600, 'manual:chengdu-china'),
    ('CHN', 'Shenyang-Changchun Air Base', 'air_base', 41.7800, 123.4500, 'manual:shenyang-china'),
    ('CHN', 'Guangzhou-Shadi Air Base', 'air_base', 23.3500, 113.3000, 'manual:guangzhou-china')
)
INSERT INTO military_installations (country_id, name, installation_type, latitude, longitude, source_ref)
SELECT c.id, p.name, p.installation_type, p.latitude, p.longitude, p.source_ref
FROM payload p
INNER JOIN countries c ON c.iso3 = p.iso3
WHERE NOT EXISTS (
  SELECT 1 FROM military_installations mi
  WHERE mi.name = p.name AND mi.country_id = c.id
);

COMMIT;
