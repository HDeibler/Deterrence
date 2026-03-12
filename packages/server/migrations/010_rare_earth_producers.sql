-- Migration: 010_rare_earth_producers.sql

WITH producer_seed AS (
  SELECT *
  FROM (
    VALUES
      ('AUS', 'rare_earths', 3.8::numeric, 52::numeric, 0.06::numeric),
      ('COD', 'rare_earths', 2.1::numeric, 34::numeric, 0.22::numeric),
      ('CHL', 'rare_earths', 1.9::numeric, 48::numeric, 0.08::numeric),
      ('IND', 'rare_earths', 2.6::numeric, 44::numeric, 0.10::numeric),
      ('ZAF', 'rare_earths', 1.7::numeric, 46::numeric, 0.12::numeric),
      ('TWN', 'chips',       4.2::numeric, 68::numeric, 0.14::numeric),
      ('KOR', 'chips',       3.1::numeric, 72::numeric, 0.07::numeric),
      ('JPN', 'chips',       2.4::numeric, 76::numeric, 0.05::numeric)
  ) AS rows(iso3, resource_key, production_per_hour, contract_unit_cost, route_risk)
),
matched_countries AS (
  SELECT c.id, c.iso3
  FROM countries c
  INNER JOIN producer_seed s ON s.iso3 = c.iso3
)
INSERT INTO strategic_resource_producers (
  country_id,
  resource_key,
  production_per_hour,
  contract_unit_cost,
  route_risk
)
SELECT
  c.id,
  s.resource_key,
  s.production_per_hour,
  s.contract_unit_cost,
  s.route_risk
FROM matched_countries c
INNER JOIN producer_seed s ON s.iso3 = c.iso3
ON CONFLICT (country_id, resource_key) DO UPDATE SET
  production_per_hour = EXCLUDED.production_per_hour,
  contract_unit_cost = EXCLUDED.contract_unit_cost,
  route_risk = EXCLUDED.route_risk;
