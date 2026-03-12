CREATE TABLE IF NOT EXISTS campaign_saves (
  id BIGSERIAL PRIMARY KEY,
  country_iso3 TEXT NOT NULL,
  save_name TEXT NOT NULL DEFAULT 'autosave',
  game_state JSONB NOT NULL,
  summary JSONB,
  game_date TEXT,
  playtime_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_campaign_saves_country_save UNIQUE (country_iso3, save_name)
);

CREATE INDEX IF NOT EXISTS idx_campaign_saves_country_updated
  ON campaign_saves (country_iso3, updated_at DESC);

DROP TRIGGER IF EXISTS campaign_saves_touch_updated_at ON campaign_saves;
CREATE TRIGGER campaign_saves_touch_updated_at
BEFORE UPDATE ON campaign_saves
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();
