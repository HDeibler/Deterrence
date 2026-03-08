import { pool } from '../../db/pool.js';

const baseSelect = `
  SELECT
    id,
    iso2,
    iso3,
    iso_numeric AS "isoNumeric",
    name,
    slug,
    capital,
    continent_code AS "continentCode",
    population,
    area_km2 AS "areaKm2"
  FROM countries
`;

export async function listCountries({ limit = 50, offset = 0 } = {}) {
  const result = await pool.query(
    `${baseSelect}
     ORDER BY name ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

export async function listCountryDirectory() {
  const result = await pool.query(
    `SELECT id, iso2, iso3, name, slug
     FROM countries
     ORDER BY name ASC`,
  );
  return result.rows;
}

export async function getCountryByIsoCode(isoCode) {
  const normalized = isoCode.trim().toUpperCase();
  const result = await pool.query(
    `${baseSelect}
     WHERE iso2 = $1 OR iso3 = $1
     LIMIT 1`,
    [normalized],
  );
  return result.rows[0] ?? null;
}

export async function getCountryIdentityByIsoCode(isoCode) {
  const normalized = isoCode.trim().toUpperCase();
  const result = await pool.query(
    `SELECT id, iso2, iso3, name, slug
     FROM countries
     WHERE iso2 = $1 OR iso3 = $1
     LIMIT 1`,
    [normalized],
  );
  return result.rows[0] ?? null;
}
