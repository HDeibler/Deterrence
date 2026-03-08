import { fetchCountryIdentity } from '../countries/countryService.js';
import {
  createAttributeDefinition,
  createCountryAttributeValue,
  getAttributeDefinitionByKey,
  listAttributeDefinitions,
  listCountryAttributeValues,
} from './countryAttributeRepository.js';

const VALID_VALUE_TYPES = new Set(['string', 'number', 'boolean', 'json', 'reference']);
const VALID_CARDINALITIES = new Set(['one', 'many']);

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

export async function fetchAttributeDefinitions() {
  return listAttributeDefinitions();
}

export async function createAttributeDefinitionRecord(input) {
  const key = normalizeKey(input.key);
  const name = normalizeRequiredString(input.name, 'name');
  const description = normalizeOptionalString(input.description);
  const valueType = normalizeEnum(input.valueType, VALID_VALUE_TYPES, 'valueType');
  const cardinality = normalizeEnum(input.cardinality ?? 'one', VALID_CARDINALITIES, 'cardinality');

  const existing = await getAttributeDefinitionByKey(key);
  if (existing) {
    throw new ConflictError(`Attribute definition already exists for key ${key}`);
  }

  return createAttributeDefinition({ key, name, description, valueType, cardinality });
}

export async function fetchCountryAttributes(isoCode) {
  const country = await fetchCountryIdentity(isoCode);
  if (!country) {
    throw new NotFoundError('Country not found');
  }

  const attributes = await listCountryAttributeValues(country.id);
  return {
    country,
    attributes,
  };
}

export async function createCountryAttributeRecord(isoCode, input) {
  const country = await fetchCountryIdentity(isoCode);
  if (!country) {
    throw new NotFoundError('Country not found');
  }

  const attributeKey = normalizeAttributeKey(input.attributeKey);
  const definition = await getAttributeDefinitionByKey(attributeKey);
  if (!definition) {
    throw new NotFoundError(`Attribute definition not found for key ${attributeKey}`);
  }

  if (!Object.prototype.hasOwnProperty.call(input, 'value')) {
    throw new ValidationError('value is required');
  }

  validateValue(definition.valueType, input.value);
  const sourceRef = normalizeOptionalString(input.sourceRef);
  const effectiveFrom = normalizeOptionalTimestamp(input.effectiveFrom, 'effectiveFrom');
  const effectiveTo = normalizeOptionalTimestamp(input.effectiveTo, 'effectiveTo');

  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
    throw new ValidationError('effectiveFrom must be before effectiveTo');
  }

  const record = await createCountryAttributeValue({
    countryId: country.id,
    attributeDefinitionId: definition.id,
    value: input.value,
    sourceRef,
    effectiveFrom,
    effectiveTo,
    cardinality: definition.cardinality,
  });

  return {
    country,
    definition,
    record,
  };
}

function normalizeAttributeKey(value) {
  const normalized = normalizeRequiredString(value, 'attributeKey')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    throw new ValidationError('attributeKey must contain at least one alphanumeric character');
  }

  return normalized;
}

function normalizeKey(value) {
  const normalized = normalizeRequiredString(value, 'key')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) {
    throw new ValidationError('key must contain at least one alphanumeric character');
  }

  return normalized;
}

function normalizeRequiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ValidationError('optional string fields must be strings');
  }
  return value.trim() || null;
}

function normalizeEnum(value, validValues, field) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} is required`);
  }
  const normalized = value.trim().toLowerCase();
  if (!validValues.has(normalized)) {
    throw new ValidationError(`${field} must be one of: ${Array.from(validValues).join(', ')}`);
  }
  return normalized;
}

function normalizeOptionalTimestamp(value, field) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function validateValue(valueType, value) {
  switch (valueType) {
    case 'string':
      if (typeof value !== 'string') {
        throw new ValidationError('value must be a string');
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ValidationError('value must be a finite number');
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ValidationError('value must be a boolean');
      }
      return;
    case 'json':
      assertJsonCompatible(value, 'value must be valid JSON-compatible data');
      return;
    case 'reference':
      if (!['string', 'number', 'object'].includes(typeof value) || value === null) {
        throw new ValidationError(
          'value must be a string, number, or object for reference attributes',
        );
      }
      assertJsonCompatible(value, 'value must be valid JSON-compatible data');
      return;
    default:
      throw new ValidationError(`Unsupported valueType ${valueType}`);
  }
}

function assertJsonCompatible(value, message) {
  try {
    if (value === undefined) {
      throw new Error('undefined is not JSON');
    }
    JSON.stringify(value);
  } catch {
    throw new ValidationError(message);
  }
}
