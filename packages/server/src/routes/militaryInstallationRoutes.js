import { Router } from 'express';
import { fetchMilitaryInstallations } from '../modules/installations/installationService.js';

export const militaryInstallationRoutes = Router();

militaryInstallationRoutes.get('/', async (request, response, next) => {
  try {
    const limit = clampInteger(request.query.limit, { fallback: 5000, min: 1, max: 20000 });
    const offset = clampInteger(request.query.offset, { fallback: 0, min: 0, max: 1000000 });
    const hasCoordinates = request.query.hasCoordinates !== 'false';
    const types = parseTypes(request.query.types);
    const installations = await fetchMilitaryInstallations({
      limit,
      offset,
      hasCoordinates,
      types,
    });
    response.json({
      data: installations,
      pagination: { limit, offset, count: installations.length },
    });
  } catch (error) {
    next(error);
  }
});

function parseTypes(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clampInteger(value, { fallback, min, max }) {
  const parsed = Number.parseInt(value ?? `${fallback}`, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}
