BEGIN;

WITH payload (iso3, name, installation_type, latitude, longitude, source_ref) AS (
  VALUES
    -- China: spaceports / launch centers
    ('CHN', 'Wenchang Space Launch Site', 'military_base', 19.6144, 110.9511, 'cgwic_launch_site:wenchang-space-launch-site'),
    ('CHN', 'Jiuquan Satellite Launch Center', 'military_base', 40.9606, 100.2983, 'cgwic_launch_site:jiuquan-satellite-launch-center'),
    ('CHN', 'Taiyuan Satellite Launch Center', 'military_base', 38.8494, 111.6081, 'cgwic_launch_site:taiyuan-satellite-launch-center'),
    ('CHN', 'Xichang Satellite Launch Center', 'military_base', 28.2460, 102.0266, 'cgwic_launch_site:xichang-satellite-launch-center'),

    -- China: naval facilities / ports
    ('CHN', 'Yulin Naval Base', 'naval_base', 18.2875, 109.4636, 'globalsecurity_plan_fleet:yulin-naval-base'),
    ('CHN', 'Ningbo Naval Base', 'naval_base', 29.8667, 121.5500, 'globalsecurity_plan_fleet:ningbo-naval-base'),
    ('CHN', 'Shanghai Naval Base', 'naval_base', 31.2333, 121.4833, 'globalsecurity_plan_fleet:shanghai-naval-base'),
    ('CHN', 'Zhoushan Naval Base', 'naval_base', 30.0167, 122.1000, 'globalsecurity_plan_fleet:zhoushan-naval-base'),
    ('CHN', 'Zhanjiang Naval Base', 'naval_base', 21.1667, 110.4000, 'globalsecurity_plan_fleet:zhanjiang-naval-base'),
    ('CHN', 'Guangzhou Naval Base', 'naval_base', 23.1000, 113.2500, 'globalsecurity_plan_fleet:guangzhou-naval-base'),
    ('CHN', 'Lushunkou Naval Base', 'naval_base', 38.8000, 121.2500, 'globalsecurity_plan_fleet:lushunkou-naval-base'),
    ('CHN', 'Xiaopingdao Naval Base', 'naval_base', 38.9500, 121.6200, 'globalsecurity_plan_fleet:xiaopingdao-naval-base'),
    ('CHN', 'Jianggezhuang Submarine Base', 'naval_base', 36.1400, 120.6000, 'globalsecurity_plan_fleet:jianggezhuang-submarine-base'),
    ('CHN', 'Beihai Naval Base', 'naval_base', 21.4833, 109.1000, 'globalsecurity_plan_fleet:beihai-naval-base'),

    -- China: strategic aviation
    ('CHN', 'Anqing Air Base', 'air_base', 30.5833, 117.0333, 'globalsecurity_plaf:anqing-air-base'),
    ('CHN', 'Quzhou Air Base', 'air_base', 28.9667, 118.9000, 'globalsecurity_plaf:quzhou-air-base'),
    ('CHN', 'Daishan Naval Air Station', 'air_base', 30.2833, 122.1333, 'globalsecurity_plan_fleet:daishan-naval-air-station'),
    ('CHN', 'Luqiao Naval Air Station', 'air_base', 28.5667, 121.4333, 'globalsecurity_plan_fleet:luqiao-naval-air-station'),
    ('CHN', 'Shanghai Dachang Naval Air Station', 'air_base', 31.3167, 121.4167, 'globalsecurity_plan_fleet:shanghai-dachang-naval-air-station'),
    ('CHN', 'Ningbo Zhangqiao Naval Air Station', 'air_base', 29.9167, 121.5667, 'globalsecurity_plan_fleet:ningbo-zhangqiao-naval-air-station'),

    -- Russia: spaceports / launch centers
    ('RUS', 'Plesetsk Cosmodrome', 'military_base', 62.9256, 40.5778, 'roscosmos_spaceport:plesetsk-cosmodrome'),
    ('RUS', 'Vostochny Cosmodrome', 'military_base', 51.8844, 128.3339, 'roscosmos_spaceport:vostochny-cosmodrome'),
    ('RUS', 'Kapustin Yar', 'missile_launch_facility', 48.5861, 45.7447, 'globalsecurity_russia_missile:kapustin-yar'),
    ('RUS', 'Yasny Launch Base', 'missile_launch_facility', 51.0944, 59.8422, 'globalsecurity_russia_missile:yasny-launch-base'),

    -- Russia: naval facilities / ports
    ('RUS', 'Baltiysk Naval Base', 'naval_base', 54.6333, 19.9167, 'globalsecurity_russia_navy:baltiysk-naval-base'),
    ('RUS', 'Kronstadt Naval Base', 'naval_base', 59.9930, 29.7660, 'globalsecurity_russia_navy:kronstadt-naval-base'),
    ('RUS', 'Vladivostok Naval Base', 'naval_base', 43.1130, 131.8730, 'globalsecurity_russia_navy:vladivostok-naval-base'),
    ('RUS', 'Fokino Naval Base', 'naval_base', 42.9740, 132.4100, 'globalsecurity_russia_navy:fokino-naval-base'),
    ('RUS', 'Novorossiysk Naval Base', 'naval_base', 44.7230, 37.7800, 'globalsecurity_russia_navy:novorossiysk-naval-base'),
    ('RUS', 'Polyarny Naval Base', 'naval_base', 69.2000, 33.4667, 'globalsecurity_russia_navy:polyarny-naval-base'),
    ('RUS', 'Severodvinsk Naval Base', 'naval_base', 64.5667, 39.8333, 'globalsecurity_russia_navy:severodvinsk-naval-base'),
    ('RUS', 'Kaspiysk Naval Base', 'naval_base', 42.8910, 47.6360, 'globalsecurity_russia_navy:kaspiysk-naval-base'),

    -- Russia: strategic aviation
    ('RUS', 'Dyagilevo Air Base', 'air_base', 54.6000, 39.6833, 'globalsecurity_russia_airfield:dyagilevo-air-base'),
    ('RUS', 'Shaykovka Air Base', 'air_base', 54.2500, 34.3333, 'globalsecurity_russia_airfield:shaykovka-air-base'),
    ('RUS', 'Belaya Air Base', 'air_base', 52.9150, 103.5750, 'globalsecurity_russia_airfield:belaya-air-base'),
    ('RUS', 'Olenya Air Base', 'air_base', 68.1500, 33.4500, 'globalsecurity_russia_airfield:olenya-air-base'),
    ('RUS', 'Soltsy-2 Air Base', 'air_base', 58.1390, 30.3300, 'globalsecurity_russia_airfield:soltsy-2-air-base'),
    ('RUS', 'Seshcha Air Base', 'air_base', 53.7361, 33.3387, 'globalsecurity_russia_airfield:seshcha-air-base')
),
resolved AS (
  SELECT
    c.id AS country_id,
    p.name,
    p.installation_type,
    p.latitude,
    p.longitude,
    p.source_ref
  FROM payload p
  INNER JOIN countries c ON c.iso3 = p.iso3
),
missing AS (
  SELECT r.*
  FROM resolved r
  WHERE NOT EXISTS (
    SELECT 1
    FROM military_installations mi
    WHERE mi.country_id = r.country_id
      AND mi.name = r.name
      AND mi.installation_type = r.installation_type
  )
)
INSERT INTO military_installations (
  country_id,
  name,
  installation_type,
  latitude,
  longitude,
  source_ref
)
SELECT
  country_id,
  name,
  installation_type,
  latitude,
  longitude,
  source_ref
FROM missing;

COMMIT;
