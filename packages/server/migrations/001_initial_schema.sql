CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS countries (
  id BIGSERIAL PRIMARY KEY,
  iso2 CHAR(2) NOT NULL UNIQUE,
  iso3 CHAR(3) NOT NULL UNIQUE,
  iso_numeric CHAR(3),
  fips_code TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  capital TEXT,
  continent_code CHAR(2),
  tld TEXT,
  currency_code TEXT,
  currency_name TEXT,
  phone_prefix TEXT,
  postal_code_format TEXT,
  postal_code_regex TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  geoname_id BIGINT,
  neighbors TEXT[] NOT NULL DEFAULT '{}',
  area_km2 NUMERIC(14, 2),
  population BIGINT,
  raw_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_countries_name ON countries (name);
CREATE INDEX IF NOT EXISTS idx_countries_continent_code ON countries (continent_code);
CREATE INDEX IF NOT EXISTS idx_countries_population ON countries (population DESC);

CREATE TABLE IF NOT EXISTS country_attribute_definitions (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  value_type TEXT NOT NULL,
  cardinality TEXT NOT NULL DEFAULT 'one',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_country_attribute_value_type CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'reference')),
  CONSTRAINT chk_country_attribute_cardinality CHECK (cardinality IN ('one', 'many'))
);

CREATE TABLE IF NOT EXISTS country_attribute_values (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  attribute_definition_id BIGINT NOT NULL REFERENCES country_attribute_definitions(id) ON DELETE CASCADE,
  value_json JSONB NOT NULL,
  source_ref TEXT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_country_attribute_values_country_id
  ON country_attribute_values (country_id);
CREATE INDEX IF NOT EXISTS idx_country_attribute_values_attribute_definition_id
  ON country_attribute_values (attribute_definition_id);
CREATE INDEX IF NOT EXISTS idx_country_attribute_values_effective_from
  ON country_attribute_values (effective_from);
CREATE INDEX IF NOT EXISTS idx_country_attribute_values_value_json
  ON country_attribute_values USING GIN (value_json);

CREATE UNIQUE INDEX IF NOT EXISTS uq_country_attribute_values_current
  ON country_attribute_values (country_id, attribute_definition_id)
  WHERE effective_from IS NULL AND effective_to IS NULL;

DROP TRIGGER IF EXISTS countries_touch_updated_at ON countries;
CREATE TRIGGER countries_touch_updated_at
BEFORE UPDATE ON countries
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS country_attribute_definitions_touch_updated_at ON country_attribute_definitions;
CREATE TRIGGER country_attribute_definitions_touch_updated_at
BEFORE UPDATE ON country_attribute_definitions
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS country_attribute_values_touch_updated_at ON country_attribute_values;
CREATE TRIGGER country_attribute_values_touch_updated_at
BEFORE UPDATE ON country_attribute_values
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
