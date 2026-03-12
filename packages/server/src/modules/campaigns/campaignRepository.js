import { pool } from '../../db/pool.js';

export async function saveCampaign({
  countryIso3,
  saveName,
  gameState,
  summary,
  gameDate,
  playtimeHours,
}) {
  const result = await pool.query(
    `INSERT INTO campaign_saves (country_iso3, save_name, game_state, summary, game_date, playtime_hours)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (country_iso3, save_name)
     DO UPDATE SET game_state = $3, summary = $4, game_date = $5, playtime_hours = $6
     RETURNING *`,
    [
      countryIso3,
      saveName,
      JSON.stringify(gameState),
      summary != null ? JSON.stringify(summary) : null,
      gameDate,
      playtimeHours,
    ],
  );
  return result.rows[0];
}

export async function getLatestSave(countryIso3) {
  const result = await pool.query(
    'SELECT * FROM campaign_saves WHERE country_iso3 = $1 ORDER BY updated_at DESC LIMIT 1',
    [countryIso3],
  );
  return result.rows[0] ?? null;
}

export async function listSaves() {
  const result = await pool.query(
    `SELECT id, country_iso3, save_name, summary, game_date, playtime_hours, created_at, updated_at
     FROM campaign_saves
     ORDER BY updated_at DESC
     LIMIT 20`,
  );
  return result.rows;
}

export async function deleteSave(id) {
  const result = await pool.query('DELETE FROM campaign_saves WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] ?? null;
}
