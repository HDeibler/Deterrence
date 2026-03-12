import { saveCampaign, getLatestSave, listSaves, deleteSave } from './campaignRepository.js';

export async function saveGame({
  countryIso3,
  saveName,
  gameState,
  summary,
  gameDate,
  playtimeHours,
}) {
  if (!countryIso3 || !gameState) {
    const error = new Error('countryIso3 and gameState are required');
    error.statusCode = 400;
    throw error;
  }
  return saveCampaign({
    countryIso3,
    saveName: saveName || 'autosave',
    gameState,
    summary,
    gameDate,
    playtimeHours: playtimeHours || 0,
  });
}

export async function loadLatestGame(countryIso3) {
  if (!countryIso3) {
    const error = new Error('countryIso3 is required');
    error.statusCode = 400;
    throw error;
  }
  const save = await getLatestSave(countryIso3);
  if (!save) {
    const error = new Error(`No save found for ${countryIso3}`);
    error.statusCode = 404;
    throw error;
  }
  return save;
}

export async function listAllSaves() {
  return listSaves();
}

export async function removeGame(id) {
  if (!id) {
    const error = new Error('Save id is required');
    error.statusCode = 400;
    throw error;
  }
  const deleted = await deleteSave(id);
  if (!deleted) {
    const error = new Error(`Save ${id} not found`);
    error.statusCode = 404;
    throw error;
  }
  return deleted;
}
