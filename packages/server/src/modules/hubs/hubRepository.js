import { pool } from '../../db/pool.js';

export async function listHubBases(countryId) {
  const result = await pool.query(
    `SELECT
       id,
       country_id AS "countryId",
       name,
       latitude,
       longitude,
       hub_type AS "hubType",
       oil_capacity AS "oilCapacity",
       munitions_capacity AS "munitionsCapacity",
       aircraft_capacity AS "aircraftCapacity",
       ship_capacity AS "shipCapacity",
       throughput_per_hour AS "throughputPerHour"
     FROM strategic_hub_bases
     WHERE country_id = $1
     ORDER BY name ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listTransportAssets(countryId) {
  const result = await pool.query(
    `SELECT
       id,
       country_id AS "countryId",
       asset_type AS "assetType",
       quantity,
       assigned_quantity AS "assignedQuantity"
     FROM strategic_transport_assets
     WHERE country_id = $1
     ORDER BY asset_type ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listDeployments(hubBaseId) {
  const result = await pool.query(
    `SELECT
       id,
       hub_base_id AS "hubBaseId",
       destination_base_name AS "destinationBaseName",
       destination_lat AS "destinationLat",
       destination_lon AS "destinationLon",
       asset_type AS "assetType",
       quantity,
       status,
       progress
     FROM strategic_deployments
     WHERE hub_base_id = $1
     ORDER BY created_at ASC`,
    [hubBaseId],
  );
  return result.rows;
}
