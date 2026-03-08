import { pool } from '../../db/pool.js';

const baseSelect = `
  SELECT
    mi.id,
    mi.name,
    mi.installation_type AS "installationType",
    mi.latitude,
    mi.longitude,
    mi.wikidata_id AS "wikidataId",
    mi.source_ref AS "sourceRef",
    c.id AS "countryId",
    c.iso2 AS "countryIso2",
    c.iso3 AS "countryIso3",
    c.name AS "countryName",
    c.slug AS "countrySlug"
  FROM military_installations mi
  INNER JOIN countries c ON c.id = mi.country_id
`;

export async function listMilitaryInstallations({
  limit = 1000,
  offset = 0,
  hasCoordinates = true,
  types = [],
} = {}) {
  const clauses = [];
  const values = [];

  if (hasCoordinates) {
    clauses.push('mi.latitude IS NOT NULL AND mi.longitude IS NOT NULL');
  }

  if (types.length > 0) {
    values.push(types);
    clauses.push(`mi.installation_type = ANY($${values.length}::text[])`);
  }

  values.push(limit);
  const limitParameter = `$${values.length}`;
  values.push(offset);
  const offsetParameter = `$${values.length}`;

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `${baseSelect}
     ${whereClause}
     ORDER BY c.name ASC, mi.name ASC
     LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  );

  return result.rows;
}
