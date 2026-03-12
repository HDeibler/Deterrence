CREATE TABLE IF NOT EXISTS strategic_country_economies (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL UNIQUE REFERENCES countries(id) ON DELETE CASCADE,
  treasury_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_income_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  export_revenue_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  import_cost_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  operating_cost_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  basing_cost_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategic_country_stockpiles (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_strategic_country_stockpiles UNIQUE (country_id, resource_key)
);

CREATE TABLE IF NOT EXISTS strategic_country_resource_baselines (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  production_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  upkeep_per_hour NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_strategic_country_resource_baselines UNIQUE (country_id, resource_key)
);

CREATE TABLE IF NOT EXISTS strategic_recipes (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  facility_type TEXT NOT NULL,
  output_type TEXT NOT NULL,
  output_key TEXT NOT NULL,
  output_amount NUMERIC(18, 2) NOT NULL DEFAULT 1,
  duration_hours NUMERIC(12, 4) NOT NULL,
  oil_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  rare_earth_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  chip_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_strategic_recipe_facility_type
    CHECK (facility_type IN ('chip_factory', 'military_factory')),
  CONSTRAINT chk_strategic_recipe_output_type
    CHECK (output_type IN ('resource', 'inventory'))
);

CREATE TABLE IF NOT EXISTS strategic_country_inventories (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  asset_key TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_strategic_country_inventories UNIQUE (country_id, asset_key)
);

CREATE TABLE IF NOT EXISTS strategic_country_production_queues (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  facility_type TEXT NOT NULL,
  recipe_key TEXT NOT NULL REFERENCES strategic_recipes(key) ON DELETE RESTRICT,
  target_quantity INTEGER NOT NULL DEFAULT 1,
  completed_quantity NUMERIC(18, 2) NOT NULL DEFAULT 0,
  progress_units NUMERIC(18, 6) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_strategic_queue_facility_type
    CHECK (facility_type IN ('chip_factory', 'military_factory')),
  CONSTRAINT chk_strategic_queue_target_quantity
    CHECK (target_quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_strategic_country_stockpiles_country_id
  ON strategic_country_stockpiles (country_id);
CREATE INDEX IF NOT EXISTS idx_strategic_country_resource_baselines_country_id
  ON strategic_country_resource_baselines (country_id);
CREATE INDEX IF NOT EXISTS idx_strategic_country_inventories_country_id
  ON strategic_country_inventories (country_id);
CREATE INDEX IF NOT EXISTS idx_strategic_country_production_queues_country_id
  ON strategic_country_production_queues (country_id);

DROP TRIGGER IF EXISTS strategic_country_economies_touch_updated_at ON strategic_country_economies;
CREATE TRIGGER strategic_country_economies_touch_updated_at
BEFORE UPDATE ON strategic_country_economies
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS strategic_country_stockpiles_touch_updated_at ON strategic_country_stockpiles;
CREATE TRIGGER strategic_country_stockpiles_touch_updated_at
BEFORE UPDATE ON strategic_country_stockpiles
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS strategic_country_resource_baselines_touch_updated_at ON strategic_country_resource_baselines;
CREATE TRIGGER strategic_country_resource_baselines_touch_updated_at
BEFORE UPDATE ON strategic_country_resource_baselines
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS strategic_recipes_touch_updated_at ON strategic_recipes;
CREATE TRIGGER strategic_recipes_touch_updated_at
BEFORE UPDATE ON strategic_recipes
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS strategic_country_inventories_touch_updated_at ON strategic_country_inventories;
CREATE TRIGGER strategic_country_inventories_touch_updated_at
BEFORE UPDATE ON strategic_country_inventories
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS strategic_country_production_queues_touch_updated_at ON strategic_country_production_queues;
CREATE TRIGGER strategic_country_production_queues_touch_updated_at
BEFORE UPDATE ON strategic_country_production_queues
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

INSERT INTO strategic_recipes (
  key,
  name,
  facility_type,
  output_type,
  output_key,
  output_amount,
  duration_hours,
  oil_cost,
  rare_earth_cost,
  chip_cost
)
VALUES
  ('chip-fabrication', 'Chip Fabrication Batch', 'chip_factory', 'resource', 'chips', 12, 1.0, 4, 9, 0),
  ('radar-array', 'Ground Radar Array', 'military_factory', 'inventory', 'radar', 1, 18.0, 28, 2, 14),
  ('missile-salvo', 'Missile Salvo', 'military_factory', 'inventory', 'missile_inventory', 4, 14.0, 32, 1, 10)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  facility_type = EXCLUDED.facility_type,
  output_type = EXCLUDED.output_type,
  output_key = EXCLUDED.output_key,
  output_amount = EXCLUDED.output_amount,
  duration_hours = EXCLUDED.duration_hours,
  oil_cost = EXCLUDED.oil_cost,
  rare_earth_cost = EXCLUDED.rare_earth_cost,
  chip_cost = EXCLUDED.chip_cost;

WITH target_countries AS (
  SELECT id, iso3
  FROM countries
  WHERE iso3 IN ('USA', 'CHN', 'RUS')
),
economy_seed AS (
  SELECT *
  FROM (
    VALUES
      ('USA', 1850000::numeric, 5200::numeric, 1300::numeric, 980::numeric, 1100::numeric, 420::numeric),
      ('CHN', 1320000::numeric, 4300::numeric, 1400::numeric, 910::numeric, 980::numeric, 310::numeric),
      ('RUS', 740000::numeric, 1800::numeric, 760::numeric, 520::numeric, 640::numeric, 190::numeric)
  ) AS rows(
    iso3,
    treasury_balance,
    tax_income_per_hour,
    export_revenue_per_hour,
    import_cost_per_hour,
    operating_cost_per_hour,
    basing_cost_per_hour
  )
)
INSERT INTO strategic_country_economies (
  country_id,
  treasury_balance,
  tax_income_per_hour,
  export_revenue_per_hour,
  import_cost_per_hour,
  operating_cost_per_hour,
  basing_cost_per_hour
)
SELECT
  c.id,
  s.treasury_balance,
  s.tax_income_per_hour,
  s.export_revenue_per_hour,
  s.import_cost_per_hour,
  s.operating_cost_per_hour,
  s.basing_cost_per_hour
FROM target_countries c
INNER JOIN economy_seed s ON s.iso3 = c.iso3
ON CONFLICT (country_id) DO UPDATE SET
  treasury_balance = EXCLUDED.treasury_balance,
  tax_income_per_hour = EXCLUDED.tax_income_per_hour,
  export_revenue_per_hour = EXCLUDED.export_revenue_per_hour,
  import_cost_per_hour = EXCLUDED.import_cost_per_hour,
  operating_cost_per_hour = EXCLUDED.operating_cost_per_hour,
  basing_cost_per_hour = EXCLUDED.basing_cost_per_hour;

WITH target_countries AS (
  SELECT id, iso3
  FROM countries
  WHERE iso3 IN ('USA', 'CHN', 'RUS')
),
stockpile_seed AS (
  SELECT *
  FROM (
    VALUES
      ('USA', 'oil', 2800::numeric),
      ('USA', 'rare_earths', 620::numeric),
      ('USA', 'chips', 410::numeric),
      ('CHN', 'oil', 2200::numeric),
      ('CHN', 'rare_earths', 980::numeric),
      ('CHN', 'chips', 520::numeric),
      ('RUS', 'oil', 2600::numeric),
      ('RUS', 'rare_earths', 460::numeric),
      ('RUS', 'chips', 250::numeric)
  ) AS rows(iso3, resource_key, amount)
)
INSERT INTO strategic_country_stockpiles (country_id, resource_key, amount)
SELECT c.id, s.resource_key, s.amount
FROM target_countries c
INNER JOIN stockpile_seed s ON s.iso3 = c.iso3
ON CONFLICT (country_id, resource_key) DO UPDATE SET
  amount = EXCLUDED.amount;

WITH target_countries AS (
  SELECT id, iso3
  FROM countries
  WHERE iso3 IN ('USA', 'CHN', 'RUS')
),
baseline_seed AS (
  SELECT *
  FROM (
    VALUES
      ('USA', 'oil', 16::numeric, 3::numeric),
      ('USA', 'rare_earths', 2.8::numeric, 0.3::numeric),
      ('USA', 'chips', 0::numeric, 0::numeric),
      ('CHN', 'oil', 10::numeric, 2.2::numeric),
      ('CHN', 'rare_earths', 6.5::numeric, 0.6::numeric),
      ('CHN', 'chips', 0::numeric, 0::numeric),
      ('RUS', 'oil', 14::numeric, 2.7::numeric),
      ('RUS', 'rare_earths', 2.1::numeric, 0.2::numeric),
      ('RUS', 'chips', 0::numeric, 0::numeric)
  ) AS rows(iso3, resource_key, production_per_hour, upkeep_per_hour)
)
INSERT INTO strategic_country_resource_baselines (
  country_id,
  resource_key,
  production_per_hour,
  upkeep_per_hour
)
SELECT c.id, s.resource_key, s.production_per_hour, s.upkeep_per_hour
FROM target_countries c
INNER JOIN baseline_seed s ON s.iso3 = c.iso3
ON CONFLICT (country_id, resource_key) DO UPDATE SET
  production_per_hour = EXCLUDED.production_per_hour,
  upkeep_per_hour = EXCLUDED.upkeep_per_hour;

WITH target_countries AS (
  SELECT id, iso3
  FROM countries
  WHERE iso3 IN ('USA', 'CHN', 'RUS')
),
inventory_seed AS (
  SELECT *
  FROM (
    VALUES
      ('USA', 'radar', 0::numeric),
      ('USA', 'missile_inventory', 24::numeric),
      ('USA', 'early_warning_satellite', 2::numeric),
      ('CHN', 'radar', 0::numeric),
      ('CHN', 'missile_inventory', 28::numeric),
      ('CHN', 'early_warning_satellite', 1::numeric),
      ('RUS', 'radar', 0::numeric),
      ('RUS', 'missile_inventory', 30::numeric),
      ('RUS', 'early_warning_satellite', 1::numeric)
  ) AS rows(iso3, asset_key, amount)
)
INSERT INTO strategic_country_inventories (country_id, asset_key, amount)
SELECT c.id, s.asset_key, s.amount
FROM target_countries c
INNER JOIN inventory_seed s ON s.iso3 = c.iso3
ON CONFLICT (country_id, asset_key) DO UPDATE SET
  amount = EXCLUDED.amount;

WITH target_countries AS (
  SELECT id, iso3
  FROM countries
  WHERE iso3 IN ('USA', 'CHN', 'RUS')
),
queue_seed AS (
  SELECT *
  FROM (
    VALUES
      ('USA', 'chip_factory', 'chip-fabrication', 120, 0::numeric, 0::numeric, 1),
      ('USA', 'military_factory', 'radar-array', 8, 0::numeric, 0::numeric, 2),
      ('CHN', 'chip_factory', 'chip-fabrication', 150, 0::numeric, 0::numeric, 1),
      ('CHN', 'military_factory', 'missile-salvo', 16, 0::numeric, 0::numeric, 2),
      ('RUS', 'chip_factory', 'chip-fabrication', 90, 0::numeric, 0::numeric, 1),
      ('RUS', 'military_factory', 'missile-salvo', 14, 0::numeric, 0::numeric, 2)
  ) AS rows(
    iso3,
    facility_type,
    recipe_key,
    target_quantity,
    completed_quantity,
    progress_units,
    sort_order
  )
)
INSERT INTO strategic_country_production_queues (
  country_id,
  facility_type,
  recipe_key,
  target_quantity,
  completed_quantity,
  progress_units,
  sort_order
)
SELECT
  c.id,
  s.facility_type,
  s.recipe_key,
  s.target_quantity,
  s.completed_quantity,
  s.progress_units,
  s.sort_order
FROM target_countries c
INNER JOIN queue_seed s ON s.iso3 = c.iso3
ON CONFLICT DO NOTHING;
