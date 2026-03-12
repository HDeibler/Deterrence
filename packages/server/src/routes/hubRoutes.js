import { Router } from 'express';
import { fetchHubBootstrap } from '../modules/hubs/hubService.js';

export const hubRoutes = Router();

hubRoutes.get('/bootstrap/:isoCode', async (request, response, next) => {
  try {
    const payload = await fetchHubBootstrap(request.params.isoCode);
    response.json({ data: payload });
  } catch (error) {
    next(error);
  }
});
