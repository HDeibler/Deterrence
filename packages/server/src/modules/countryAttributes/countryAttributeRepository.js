import { pool } from '../../db/pool.js';

export async function listAttributeDefinitions() {
  const result = await pool.query(
    `SELECT
       id,
       key,
       name,
       description,
       value_type AS "valueType",
       cardinality,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM country_attribute_definitions
     ORDER BY key ASC`,
  );
  return result.rows;
}

export async function createAttributeDefinition({
  key,
  name,
  description,
  valueType,
  cardinality,
}) {
  const result = await pool.query(
    `INSERT INTO country_attribute_definitions (key, name, description, value_type, cardinality)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id,
       key,
       name,
       description,
       value_type AS "valueType",
       cardinality,
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [key, name, description, valueType, cardinality],
  );
  return result.rows[0];
}

export async function getAttributeDefinitionByKey(key) {
  const result = await pool.query(
    `SELECT
       id,
       key,
       name,
       description,
       value_type AS "valueType",
       cardinality,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM country_attribute_definitions
     WHERE key = $1
     LIMIT 1`,
    [key],
  );
  return result.rows[0] ?? null;
}

export async function listCountryAttributeValues(countryId) {
  const result = await pool.query(
    `SELECT
       values.id,
       definitions.id AS "definitionId",
       definitions.key AS "attributeKey",
       definitions.name AS "attributeName",
       definitions.value_type AS "valueType",
       definitions.cardinality,
       values.value_json AS value,
       values.source_ref AS "sourceRef",
       values.effective_from AS "effectiveFrom",
       values.effective_to AS "effectiveTo",
       values.created_at AS "createdAt",
       values.updated_at AS "updatedAt"
     FROM country_attribute_values AS values
     INNER JOIN country_attribute_definitions AS definitions
       ON definitions.id = values.attribute_definition_id
     WHERE values.country_id = $1
     ORDER BY definitions.key ASC, values.created_at ASC`,
    [countryId],
  );
  return result.rows;
}

export async function createCountryAttributeValue({
  countryId,
  attributeDefinitionId,
  value,
  sourceRef,
  effectiveFrom,
  effectiveTo,
  cardinality,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (cardinality === 'one' && effectiveFrom === null && effectiveTo === null) {
      await client.query(
        `DELETE FROM country_attribute_values
         WHERE country_id = $1
           AND attribute_definition_id = $2
           AND effective_from IS NULL
           AND effective_to IS NULL`,
        [countryId, attributeDefinitionId],
      );
    }

    const result = await client.query(
      `INSERT INTO country_attribute_values (
         country_id,
         attribute_definition_id,
         value_json,
         source_ref,
         effective_from,
         effective_to
       )
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING
         id,
         country_id AS "countryId",
         attribute_definition_id AS "attributeDefinitionId",
         value_json AS value,
         source_ref AS "sourceRef",
         effective_from AS "effectiveFrom",
         effective_to AS "effectiveTo",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        countryId,
        attributeDefinitionId,
        JSON.stringify(value),
        sourceRef,
        effectiveFrom,
        effectiveTo,
      ],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
