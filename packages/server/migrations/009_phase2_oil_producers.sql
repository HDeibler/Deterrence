CREATE TABLE IF NOT EXISTS strategic_resource_producers (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  production_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  contract_unit_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  route_risk NUMERIC(6, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_strategic_resource_producers UNIQUE (country_id, resource_key),
  CONSTRAINT chk_strategic_resource_producers_route_risk
    CHECK (route_risk >= 0 AND route_risk <= 1)
);

CREATE INDEX IF NOT EXISTS idx_strategic_resource_producers_resource_key
  ON strategic_resource_producers (resource_key);

DROP TRIGGER IF EXISTS strategic_resource_producers_touch_updated_at ON strategic_resource_producers;
CREATE TRIGGER strategic_resource_producers_touch_updated_at
BEFORE UPDATE ON strategic_resource_producers
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

WITH producer_seed AS (
  SELECT *
  FROM (
    VALUES
      ('SAU', 'oil', 11.5::numeric, 42::numeric, 0.08::numeric),
      ('ARE', 'oil', 6.2::numeric, 44::numeric, 0.07::numeric),
      ('IRQ', 'oil', 5.7::numeric, 39::numeric, 0.16::numeric),
      ('KAZ', 'oil', 4.1::numeric, 37::numeric, 0.11::numeric),
      ('NOR', 'oil', 3.3::numeric, 46::numeric, 0.05::numeric),
      ('CAN', 'oil', 5.1::numeric, 41::numeric, 0.04::numeric),
      ('BRA', 'oil', 3.7::numeric, 40::numeric, 0.09::numeric),
      ('NGA', 'oil', 4.4::numeric, 35::numeric, 0.18::numeric)
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
