import { Router } from 'express';
import { fetchStrategicBootstrap } from '../modules/strategic/strategicService.js';

export const strategicRoutes = Router();

strategicRoutes.get('/bootstrap/:isoCode', async (request, response, next) => {
  try {
    const payload = await fetchStrategicBootstrap(request.params.isoCode);
    response.json({ data: payload });
  } catch (error) {
    next(error);
  }
});
