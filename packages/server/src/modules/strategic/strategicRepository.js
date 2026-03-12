import { pool } from '../../db/pool.js';

export async function getStrategicEconomyByCountryId(countryId) {
  const result = await pool.query(
    `SELECT
       treasury_balance AS "treasuryBalance",
       tax_income_per_hour AS "taxIncomePerHour",
       export_revenue_per_hour AS "exportRevenuePerHour",
       import_cost_per_hour AS "importCostPerHour",
       operating_cost_per_hour AS "operatingCostPerHour",
       basing_cost_per_hour AS "basingCostPerHour"
     FROM strategic_country_economies
     WHERE country_id = $1
     LIMIT 1`,
    [countryId],
  );
  return result.rows[0] ?? null;
}

export async function listStrategicStockpilesByCountryId(countryId) {
  const result = await pool.query(
    `SELECT
       resource_key AS "resourceKey",
       amount
     FROM strategic_country_stockpiles
     WHERE country_id = $1
     ORDER BY resource_key ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listStrategicResourceBaselinesByCountryId(countryId) {
  const result = await pool.query(
    `SELECT
       resource_key AS "resourceKey",
       production_per_hour AS "productionPerHour",
       upkeep_per_hour AS "upkeepPerHour"
     FROM strategic_country_resource_baselines
     WHERE country_id = $1
     ORDER BY resource_key ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listStrategicInventoriesByCountryId(countryId) {
  const result = await pool.query(
    `SELECT
       asset_key AS "assetKey",
       amount
     FROM strategic_country_inventories
     WHERE country_id = $1
     ORDER BY asset_key ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listStrategicProductionQueuesByCountryId(countryId) {
  const result = await pool.query(
    `SELECT
       q.id,
       q.facility_type AS "facilityType",
       q.recipe_key AS "recipeKey",
       q.target_quantity AS "targetQuantity",
       q.completed_quantity AS "completedQuantity",
       q.progress_units AS "progressUnits",
       q.sort_order AS "sortOrder",
       r.name AS "recipeName",
       r.output_type AS "outputType",
       r.output_key AS "outputKey",
       r.output_amount AS "outputAmount",
       r.duration_hours AS "durationHours",
       r.oil_cost AS "oilCost",
       r.rare_earth_cost AS "rareEarthCost",
       r.chip_cost AS "chipCost"
     FROM strategic_country_production_queues q
     INNER JOIN strategic_recipes r ON r.key = q.recipe_key
     WHERE q.country_id = $1
     ORDER BY q.sort_order ASC, q.id ASC`,
    [countryId],
  );
  return result.rows;
}

export async function listStrategicResourceProducers(resourceKey) {
  const result = await pool.query(
    `SELECT
       p.id,
       c.id AS "countryId",
       c.iso3 AS "countryIso3",
       c.name AS "countryName",
       p.resource_key AS "resourceKey",
       p.production_per_hour AS "productionPerHour",
       p.contract_unit_cost AS "contractUnitCost",
       p.route_risk AS "routeRisk"
     FROM strategic_resource_producers p
     INNER JOIN countries c ON c.id = p.country_id
     WHERE p.resource_key = $1
     ORDER BY p.production_per_hour DESC, c.name ASC`,
    [resourceKey],
  );
  return result.rows;
}
