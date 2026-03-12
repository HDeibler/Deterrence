import { Router } from 'express';
import { fetchDiplomacyBootstrap } from '../modules/diplomacy/diplomacyService.js';

export const diplomacyRoutes = Router();

diplomacyRoutes.get('/bootstrap/:isoCode', async (request, response, next) => {
  try {
    const payload = await fetchDiplomacyBootstrap(request.params.isoCode);
    response.json({ data: payload });
  } catch (error) {
    next(error);
  }
});
