import { Router } from 'express';
import {
  createAttributeDefinitionRecord,
  fetchAttributeDefinitions,
} from '../modules/countryAttributes/countryAttributeService.js';

export const countryAttributeDefinitionRoutes = Router();

countryAttributeDefinitionRoutes.get('/', async (_request, response, next) => {
  try {
    const definitions = await fetchAttributeDefinitions();
    response.json({ data: definitions });
  } catch (error) {
    next(error);
  }
});

countryAttributeDefinitionRoutes.post('/', async (request, response, next) => {
  try {
    const definition = await createAttributeDefinitionRecord(request.body ?? {});
    response.status(201).json({ data: definition });
  } catch (error) {
    next(error);
  }
});
