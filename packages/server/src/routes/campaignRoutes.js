import { Router } from 'express';
import {
  saveGame,
  loadLatestGame,
  listAllSaves,
  removeGame,
} from '../modules/campaigns/campaignService.js';

export const campaignRoutes = Router();

campaignRoutes.post('/save', async (request, response, next) => {
  try {
    const { countryIso3, saveName, gameState, summary, gameDate, playtimeHours } = request.body;
    const save = await saveGame({
      countryIso3,
      saveName,
      gameState,
      summary,
      gameDate,
      playtimeHours,
    });
    response.status(201).json({ data: save });
  } catch (error) {
    next(error);
  }
});

campaignRoutes.get('/list', async (_request, response, next) => {
  try {
    const saves = await listAllSaves();
    response.json({ data: saves, count: saves.length });
  } catch (error) {
    next(error);
  }
});

campaignRoutes.get('/:isoCode/latest', async (request, response, next) => {
  try {
    const save = await loadLatestGame(request.params.isoCode);
    response.json({ data: save });
  } catch (error) {
    next(error);
  }
});

campaignRoutes.delete('/:id', async (request, response, next) => {
  try {
    const deleted = await removeGame(request.params.id);
    response.json({ data: deleted });
  } catch (error) {
    next(error);
  }
});
