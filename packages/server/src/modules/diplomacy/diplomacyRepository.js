import { pool } from '../../db/pool.js';

export async function listDiplomaticRelations(countryId) {
  const result = await pool.query(
    `SELECT
       dr.id,
       dr.country_id AS "countryId",
       dr.target_country_id AS "targetCountryId",
       tc.iso3 AS "targetIso3",
       tc.name AS "targetName",
       dr.alignment_score AS "alignmentScore",
       dr.posture,
       dr.trade_openness AS "tradeOpenness",
       dr.created_at AS "createdAt",
       dr.updated_at AS "updatedAt"
     FROM strategic_diplomatic_relations dr
     INNER JOIN countries tc ON tc.id = dr.target_country_id
     WHERE dr.country_id = $1
     ORDER BY dr.alignment_score DESC`,
    [countryId],
  );
  return result.rows;
}

export async function listAccessAgreements(receivingCountryId) {
  const result = await pool.query(
    `SELECT
       aa.id,
       aa.granting_country_id AS "grantingCountryId",
       gc.iso3 AS "grantingIso3",
       gc.name AS "grantingName",
       aa.receiving_country_id AS "receivingCountryId",
       aa.access_type AS "accessType",
       aa.location_name AS "locationName",
       aa.latitude,
       aa.longitude,
       aa.annual_cost AS "annualCost",
       aa.status,
       aa.created_at AS "createdAt",
       aa.updated_at AS "updatedAt"
     FROM strategic_access_agreements aa
     INNER JOIN countries gc ON gc.id = aa.granting_country_id
     WHERE aa.receiving_country_id = $1
       AND aa.status = 'active'
     ORDER BY gc.name ASC, aa.location_name ASC`,
    [receivingCountryId],
  );
  return result.rows;
}

export async function listSanctions(targetCountryId) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.imposing_country_id AS "imposingCountryId",
       ic.iso3 AS "imposingIso3",
       ic.name AS "imposingName",
       s.target_country_id AS "targetCountryId",
       s.sanction_type AS "sanctionType",
       s.resource_key AS "resourceKey",
       s.severity,
       s.status,
       s.created_at AS "createdAt",
       s.updated_at AS "updatedAt"
     FROM strategic_sanctions s
     INNER JOIN countries ic ON ic.id = s.imposing_country_id
     WHERE s.target_country_id = $1
       AND s.status = 'active'
     ORDER BY s.severity DESC`,
    [targetCountryId],
  );
  return result.rows;
}

export async function listImposedSanctions(imposingCountryId) {
  const result = await pool.query(
    `SELECT
       s.id,
       s.imposing_country_id AS "imposingCountryId",
       s.target_country_id AS "targetCountryId",
       tc.iso3 AS "targetIso3",
       tc.name AS "targetName",
       s.sanction_type AS "sanctionType",
       s.resource_key AS "resourceKey",
       s.severity,
       s.status,
       s.created_at AS "createdAt",
       s.updated_at AS "updatedAt"
     FROM strategic_sanctions s
     INNER JOIN countries tc ON tc.id = s.target_country_id
     WHERE s.imposing_country_id = $1
       AND s.status = 'active'
     ORDER BY s.severity DESC`,
    [imposingCountryId],
  );
  return result.rows;
}
