import { createApplication } from './Application.js';
import { createCountryDirectoryStore } from '../data/createCountryDirectoryStore.js';
import { createGameSessionStore } from '../game/createGameSessionStore.js';
import { createSavedGameStore } from '../game/createSavedGameStore.js';
import { createGameMenuController } from '../ui/createGameMenuController.js';

const PLAYABLE_NATIONS = ['USA', 'CHN', 'RUS'];

export async function bootstrapApplication({ mountNode, document, window, environment }) {
  const devMode = Boolean(environment?.DEV);
  const autoNation = coercePlayableNation(devMode ? environment?.VITE_DEV_AUTO_NATION : null);
  const initialGodView = devMode && environment?.VITE_DEV_GOD_VIEW === 'true';

  const countryDirectory = createCountryDirectoryStore({
    window,
    requestRender: () => {},
  });
  await countryDirectory.ensureLoaded();
  const savedGameStore = createSavedGameStore({ window });
  const savedGame = savedGameStore.load();

  const sessionStore = createGameSessionStore({
    initialCountryIso3: autoNation,
    initialGodView,
    initialPaused: true,
    initialStarted: false,
    devMode,
    initialScreen: 'mainMenu',
    initialSaveSummary: savedGame?.summary ?? null,
  });
  const gameMenu = createGameMenuController({ document, window });
  const playableCountries = countryDirectory
    .getAll()
    .filter((country) => PLAYABLE_NATIONS.includes(country.iso3));
  gameMenu.setCountries(playableCountries);
  if (!sessionStore.getSnapshot().activeCountryIso3 && playableCountries.length > 0) {
    sessionStore.setActiveCountry(playableCountries[0].iso3);
  }

  const app = await createApplication({
    mountNode,
    document,
    window,
    countryDirectory,
    sessionStore,
    devMode,
  });
  app.start();

  const autoSaveTimer = window.setInterval(() => {
    persistCurrentGame();
  }, 15000);

  const beforeUnloadHandler = () => {
    persistCurrentGame();
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  const detachSession = sessionStore.subscribe((session) => {
    gameMenu.render(session);
  });
  const detachOpenNewGame = gameMenu.onOpenNewGame(() => {
    sessionStore.openNewGameSetup();
  });
  const detachResumeSavedGame = gameMenu.onResumeSavedGame(async () => {
    const latestSave = savedGameStore.load();
    if (!latestSave?.gameState || !latestSave?.summary) {
      sessionStore.setSavedGameSummary(null);
      return;
    }
    app.queueSavedGameLoad(latestSave.gameState);
    sessionStore.setSavedGameSummary(latestSave.summary);
    sessionStore.restoreGame({
      iso3: latestSave.summary.countryIso3,
      godView: latestSave.gameState.session?.godView ?? false,
      paused: false,
    });
  });
  const detachStart = gameMenu.onStart((iso3) => {
    sessionStore.selectNation(iso3);
  });
  const detachPreview = gameMenu.onPreviewCountry((iso3, options = {}) => {
    if (options.confirm) {
      sessionStore.selectNation(iso3);
      return;
    }
    sessionStore.setActiveCountry(iso3);
  });
  const detachBackToMainMenu = gameMenu.onBackToMainMenu(() => {
    sessionStore.openMainMenu();
  });
  const detachOpenSettings = gameMenu.onOpenSettings(() => {
    sessionStore.openSettings();
  });
  const detachResume = gameMenu.onResume(() => {
    sessionStore.resume();
  });
  const detachSaveQuit = gameMenu.onSaveAndQuit(() => {
    const saved = persistCurrentGame();
    sessionStore.setSavedGameSummary(saved?.summary ?? sessionStore.getSnapshot().saveSummary);
    sessionStore.openMainMenu();
  });
  const detachChangeCountry = gameMenu.onChangeCountry((iso3) => {
    sessionStore.setActiveCountry(iso3);
  });
  const detachToggleGodView = gameMenu.onToggleGodView((enabled) => {
    sessionStore.setGodView(enabled);
  });

  function persistCurrentGame() {
    const session = sessionStore.getSnapshot();
    if (!session.started) {
      return null;
    }

    const gameState = app.captureSaveState();
    const summary = app.getSaveSummary();
    if (!gameState || !summary) {
      return null;
    }

    const saved = savedGameStore.save({ summary, gameState });
    sessionStore.setSavedGameSummary(saved.summary);
    return saved;
  }

  return {
    dispose() {
      window.clearInterval(autoSaveTimer);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      detachSession();
      detachOpenNewGame();
      detachResumeSavedGame();
      detachStart();
      detachPreview();
      detachBackToMainMenu();
      detachOpenSettings();
      detachResume();
      detachSaveQuit();
      detachChangeCountry();
      detachToggleGodView();
      app.dispose();
    },
  };
}

function coercePlayableNation(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return PLAYABLE_NATIONS.includes(normalized) ? normalized : null;
}
