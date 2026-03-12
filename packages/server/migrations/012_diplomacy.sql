-- Diplomatic relations between countries
CREATE TABLE IF NOT EXISTS strategic_diplomatic_relations (
  id BIGSERIAL PRIMARY KEY,
  country_id BIGINT NOT NULL REFERENCES countries(id),
  target_country_id BIGINT NOT NULL REFERENCES countries(id),
  alignment_score NUMERIC(6,4) NOT NULL DEFAULT 0,
  posture TEXT NOT NULL DEFAULT 'neutral',
  trade_openness NUMERIC(6,4) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_diplomatic_alignment_range
    CHECK (alignment_score >= -1.0 AND alignment_score <= 1.0),
  CONSTRAINT chk_diplomatic_posture
    CHECK (posture IN ('allied', 'friendly', 'neutral', 'rival', 'hostile')),
  CONSTRAINT chk_diplomatic_trade_openness_range
    CHECK (trade_openness >= 0 AND trade_openness <= 1.0),
  CONSTRAINT chk_diplomatic_no_self_relation
    CHECK (country_id <> target_country_id),
  CONSTRAINT uq_diplomatic_relation
    UNIQUE (country_id, target_country_id)
);

CREATE INDEX IF NOT EXISTS idx_diplomatic_relations_country
  ON strategic_diplomatic_relations (country_id);
CREATE INDEX IF NOT EXISTS idx_diplomatic_relations_target
  ON strategic_diplomatic_relations (target_country_id);
CREATE INDEX IF NOT EXISTS idx_diplomatic_relations_posture
  ON strategic_diplomatic_relations (posture);

DROP TRIGGER IF EXISTS strategic_diplomatic_relations_touch_updated_at
  ON strategic_diplomatic_relations;
CREATE TRIGGER strategic_diplomatic_relations_touch_updated_at
BEFORE UPDATE ON strategic_diplomatic_relations
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- Access agreements (basing rights, port access, transit, overflight)
CREATE TABLE IF NOT EXISTS strategic_access_agreements (
  id BIGSERIAL PRIMARY KEY,
  granting_country_id BIGINT NOT NULL REFERENCES countries(id),
  receiving_country_id BIGINT NOT NULL REFERENCES countries(id),
  access_type TEXT NOT NULL,
  location_name TEXT,
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  annual_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_access_type
    CHECK (access_type IN ('port_access', 'basing_rights', 'transit_rights', 'overflight')),
  CONSTRAINT chk_access_status
    CHECK (status IN ('active', 'suspended', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_access_agreements_granting
  ON strategic_access_agreements (granting_country_id);
CREATE INDEX IF NOT EXISTS idx_access_agreements_receiving
  ON strategic_access_agreements (receiving_country_id);
CREATE INDEX IF NOT EXISTS idx_access_agreements_status
  ON strategic_access_agreements (status);

DROP TRIGGER IF EXISTS strategic_access_agreements_touch_updated_at
  ON strategic_access_agreements;
CREATE TRIGGER strategic_access_agreements_touch_updated_at
BEFORE UPDATE ON strategic_access_agreements
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- Sanctions between countries
CREATE TABLE IF NOT EXISTS strategic_sanctions (
  id BIGSERIAL PRIMARY KEY,
  imposing_country_id BIGINT NOT NULL REFERENCES countries(id),
  target_country_id BIGINT NOT NULL REFERENCES countries(id),
  sanction_type TEXT NOT NULL,
  resource_key TEXT,
  severity NUMERIC(6,4) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sanction_type
    CHECK (sanction_type IN ('trade_embargo', 'arms_embargo', 'financial', 'resource_specific')),
  CONSTRAINT chk_sanction_severity_range
    CHECK (severity >= 0 AND severity <= 1.0),
  CONSTRAINT chk_sanction_status
    CHECK (status IN ('active', 'suspended', 'lifted'))
);

CREATE INDEX IF NOT EXISTS idx_sanctions_imposing
  ON strategic_sanctions (imposing_country_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_target
  ON strategic_sanctions (target_country_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_status
  ON strategic_sanctions (status);

DROP TRIGGER IF EXISTS strategic_sanctions_touch_updated_at
  ON strategic_sanctions;
CREATE TRIGGER strategic_sanctions_touch_updated_at
BEFORE UPDATE ON strategic_sanctions
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

-- Seed diplomatic relations between playable nations and key countries
-- Uses subqueries to resolve country IDs by iso3 code

INSERT INTO strategic_diplomatic_relations (country_id, target_country_id, alignment_score, posture, trade_openness)
VALUES
  -- USA alliances and partnerships
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'sau'), 0.55, 'friendly', 0.9),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'jpn'), 0.85, 'allied', 0.95),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'kor'), 0.80, 'allied', 0.95),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'twn'), 0.70, 'friendly', 0.90),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'nor'), 0.75, 'allied', 0.95),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'can'), 0.90, 'allied', 0.98),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'aus'), 0.85, 'allied', 0.95),

  -- China partnerships
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), (SELECT id FROM countries WHERE LOWER(iso3) = 'rus'), 0.35, 'friendly', 0.7),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), (SELECT id FROM countries WHERE LOWER(iso3) = 'sau'), 0.30, 'neutral', 0.75),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), (SELECT id FROM countries WHERE LOWER(iso3) = 'irq'), 0.20, 'neutral', 0.6),

  -- Russia partnerships
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'rus'), (SELECT id FROM countries WHERE LOWER(iso3) = 'ind'), 0.40, 'friendly', 0.7),

  -- Rivalries and hostilities
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), -0.30, 'rival', 0.55),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), (SELECT id FROM countries WHERE LOWER(iso3) = 'rus'), -0.50, 'hostile', 0.3),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), (SELECT id FROM countries WHERE LOWER(iso3) = 'twn'), -0.65, 'hostile', 0.4);

-- Seed access agreements
INSERT INTO strategic_access_agreements (granting_country_id, receiving_country_id, access_type, location_name, latitude, longitude, annual_cost, status)
VALUES
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'deu'), (SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), 'basing_rights', 'Ramstein Air Base', 49.4369, 7.6003, 850000, 'active'),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'jpn'), (SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), 'basing_rights', 'Yokosuka Naval Base', 35.2836, 139.6681, 920000, 'active'),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'gbr'), (SELECT id FROM countries WHERE LOWER(iso3) = 'usa'), 'port_access', 'Diego Garcia', -7.3195, 72.4229, 400000, 'active'),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'syr'), (SELECT id FROM countries WHERE LOWER(iso3) = 'rus'), 'port_access', 'Tartus Naval Facility', 34.8959, 35.8867, 180000, 'active'),
  ((SELECT id FROM countries WHERE LOWER(iso3) = 'dji'), (SELECT id FROM countries WHERE LOWER(iso3) = 'chn'), 'port_access', 'Djibouti Support Base', 11.5461, 43.1456, 320000, 'active');
