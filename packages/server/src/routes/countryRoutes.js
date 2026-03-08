import { Router } from 'express';
import {
  fetchCountry,
  fetchCountries,
  fetchCountryDirectory,
} from '../modules/countries/countryService.js';
import {
  createCountryAttributeRecord,
  fetchCountryAttributes,
} from '../modules/countryAttributes/countryAttributeService.js';

export const countryRoutes = Router();

countryRoutes.get('/', async (request, response, next) => {
  try {
    const limit = clampInteger(request.query.limit, { fallback: 50, min: 1, max: 200 });
    const offset = clampInteger(request.query.offset, { fallback: 0, min: 0, max: 1000000 });
    const countries = await fetchCountries({ limit, offset });
    response.json({ data: countries, pagination: { limit, offset, count: countries.length } });
  } catch (error) {
    next(error);
  }
});

countryRoutes.get('/directory', async (_request, response, next) => {
  try {
    const countries = await fetchCountryDirectory();
    response.json({ data: countries, count: countries.length });
  } catch (error) {
    next(error);
  }
});

countryRoutes.get('/:isoCode/attributes', async (request, response, next) => {
  try {
    const payload = await fetchCountryAttributes(request.params.isoCode);
    response.json({ data: payload.attributes, country: payload.country });
  } catch (error) {
    next(error);
  }
});

countryRoutes.post('/:isoCode/attributes', async (request, response, next) => {
  try {
    const payload = await createCountryAttributeRecord(request.params.isoCode, request.body ?? {});
    response
      .status(201)
      .json({ data: payload.record, definition: payload.definition, country: payload.country });
  } catch (error) {
    next(error);
  }
});

countryRoutes.get('/:isoCode', async (request, response, next) => {
  try {
    const country = await fetchCountry(request.params.isoCode);
    if (!country) {
      response.status(404).json({ error: 'Country not found' });
      return;
    }
    response.json({ data: country });
  } catch (error) {
    next(error);
  }
});

function clampInteger(value, { fallback, min, max }) {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}
