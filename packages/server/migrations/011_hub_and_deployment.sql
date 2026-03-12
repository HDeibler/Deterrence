-- ---------------------------------------------------------------------------
-- 011  Hub bases, deployments, and transport assets
-- ---------------------------------------------------------------------------

-- Strategic hub bases: forward operating locations for force projection
CREATE TABLE IF NOT EXISTS strategic_hub_bases (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude NUMERIC(10,6) NOT NULL,
  longitude NUMERIC(10,6) NOT NULL,
  hub_type TEXT NOT NULL DEFAULT 'forward_hub',
  oil_capacity NUMERIC(14,4) NOT NULL DEFAULT 50000,
  munitions_capacity NUMERIC(14,4) NOT NULL DEFAULT 200,
  aircraft_capacity NUMERIC(14,4) NOT NULL DEFAULT 100,
  ship_capacity NUMERIC(14,4) NOT NULL DEFAULT 20,
  throughput_per_hour NUMERIC(14,4) NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_hub_type CHECK (hub_type IN ('forward_hub', 'logistics_hub', 'naval_hub'))
);

CREATE INDEX IF NOT EXISTS idx_strategic_hub_bases_country_id
  ON strategic_hub_bases (country_id);

DROP TRIGGER IF EXISTS strategic_hub_bases_touch_updated_at ON strategic_hub_bases;
CREATE TRIGGER strategic_hub_bases_touch_updated_at
BEFORE UPDATE ON strategic_hub_bases
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- Deployments: assets in transit or stationed at a destination
CREATE TABLE IF NOT EXISTS strategic_deployments (
  id BIGSERIAL PRIMARY KEY,
  hub_base_id BIGINT NOT NULL REFERENCES strategic_hub_bases(id) ON DELETE CASCADE,
  destination_base_name TEXT NOT NULL,
  destination_lat NUMERIC(10,6) NOT NULL,
  destination_lon NUMERIC(10,6) NOT NULL,
  asset_type TEXT NOT NULL,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'transit',
  progress NUMERIC(6,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_deployment_status CHECK (status IN ('transit', 'deployed', 'withdrawing'))
);

CREATE INDEX IF NOT EXISTS idx_strategic_deployments_hub_base_id
  ON strategic_deployments (hub_base_id);
CREATE INDEX IF NOT EXISTS idx_strategic_deployments_status
  ON strategic_deployments (status);

DROP TRIGGER IF EXISTS strategic_deployments_touch_updated_at ON strategic_deployments;
CREATE TRIGGER strategic_deployments_touch_updated_at
BEFORE UPDATE ON strategic_deployments
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- Transport assets: cargo planes and oil tankers available per country
CREATE TABLE IF NOT EXISTS strategic_transport_assets (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  assigned_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transport_asset_type CHECK (asset_type IN ('cargo_plane', 'oil_tanker'))
);

CREATE INDEX IF NOT EXISTS idx_strategic_transport_assets_country_id
  ON strategic_transport_assets (country_id);

DROP TRIGGER IF EXISTS strategic_transport_assets_touch_updated_at ON strategic_transport_assets;
CREATE TRIGGER strategic_transport_assets_touch_updated_at
BEFORE UPDATE ON strategic_transport_assets
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------------
-- Seed data: hub locations for the three playable powers
-- ---------------------------------------------------------------------------

-- USA hubs
INSERT INTO strategic_hub_bases (country_id, name, latitude, longitude, hub_type)
SELECT c.id, hub.name, hub.lat, hub.lon, hub.hub_type
FROM countries c
CROSS JOIN (VALUES
  ('Diego Garcia',  -7.319500,  72.422900, 'naval_hub'),
  ('Guam',          13.444300, 144.793700, 'forward_hub'),
  ('Ramstein',      49.436900,   7.600300, 'logistics_hub'),
  ('Yokosuka',      35.283500, 139.668600, 'naval_hub')
) AS hub(name, lat, lon, hub_type)
WHERE LOWER(c.iso3) = 'usa'
ON CONFLICT DO NOTHING;

-- CHN hubs
INSERT INTO strategic_hub_bases (country_id, name, latitude, longitude, hub_type)
SELECT c.id, hub.name, hub.lat, hub.lon, hub.hub_type
FROM countries c
CROSS JOIN (VALUES
  ('Djibouti', 11.547500, 43.132400, 'naval_hub'),
  ('Gwadar',   25.126400, 62.322500, 'logistics_hub')
) AS hub(name, lat, lon, hub_type)
WHERE LOWER(c.iso3) = 'chn'
ON CONFLICT DO NOTHING;

-- RUS hubs
INSERT INTO strategic_hub_bases (country_id, name, latitude, longitude, hub_type)
SELECT c.id, hub.name, hub.lat, hub.lon, hub.hub_type
FROM countries c
CROSS JOIN (VALUES
  ('Tartus',   34.895900, 35.886600, 'naval_hub'),
  ('Cam Ranh', 11.954200, 109.219400, 'naval_hub')
) AS hub(name, lat, lon, hub_type)
WHERE LOWER(c.iso3) = 'rus'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed data: transport assets
-- ---------------------------------------------------------------------------

-- USA: 12 cargo planes, 8 oil tankers
INSERT INTO strategic_transport_assets (country_id, asset_type, quantity)
SELECT c.id, asset.type, asset.qty
FROM countries c
CROSS JOIN (VALUES
  ('cargo_plane', 12),
  ('oil_tanker',   8)
) AS asset(type, qty)
WHERE LOWER(c.iso3) = 'usa'
ON CONFLICT DO NOTHING;

-- CHN: 8 cargo planes, 6 oil tankers
INSERT INTO strategic_transport_assets (country_id, asset_type, quantity)
SELECT c.id, asset.type, asset.qty
FROM countries c
CROSS JOIN (VALUES
  ('cargo_plane', 8),
  ('oil_tanker',  6)
) AS asset(type, qty)
WHERE LOWER(c.iso3) = 'chn'
ON CONFLICT DO NOTHING;

-- RUS: 6 cargo planes, 5 oil tankers
INSERT INTO strategic_transport_assets (country_id, asset_type, quantity)
SELECT c.id, asset.type, asset.qty
FROM countries c
CROSS JOIN (VALUES
  ('cargo_plane', 6),
  ('oil_tanker',  5)
) AS asset(type, qty)
WHERE LOWER(c.iso3) = 'rus'
ON CONFLICT DO NOTHING;
