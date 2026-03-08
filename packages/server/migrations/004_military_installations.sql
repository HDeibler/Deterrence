CREATE TABLE IF NOT EXISTS military_installations (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  installation_type TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  wikidata_id TEXT,
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_installation_type CHECK (installation_type IN (
    'military_base', 'air_base', 'naval_base', 'army_base',
    'missile_launch_facility', 'nuclear_weapons_facility',
    'military_headquarters', 'training_facility', 'logistics_base', 'other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_military_installations_country_id
  ON military_installations (country_id);
CREATE INDEX IF NOT EXISTS idx_military_installations_type
  ON military_installations (installation_type);
CREATE INDEX IF NOT EXISTS idx_military_installations_wikidata_id
  ON military_installations (wikidata_id);

DROP TRIGGER IF EXISTS military_installations_touch_updated_at ON military_installations;
CREATE TRIGGER military_installations_touch_updated_at
BEFORE UPDATE ON military_installations
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
