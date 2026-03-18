import { createApplication } from './Application.js';
import { createCountryDirectoryStore } from '../data/createCountryDirectoryStore.js';
import { createGameSessionStore } from '../game/createGameSessionStore.js';
import { createGameMenuController } from '../ui/createGameMenuController.js';

const PLAYABLE_NATIONS = ['USA', 'CHN', 'RUS'];

export async function bootstrapApplication({ mountNode, document, window, environment }) {
  const devMode = Boolean(environment?.DEV);
  const autoNation = coercePlayableNation(devMode ? environment?.VITE_DEV_AUTO_NATION : null);
  const initialGodView = devMode && environment?.VITE_DEV_GOD_VIEW === 'true';
  const skipNationSelect =
    devMode && Boolean(autoNation) ? environment?.VITE_DEV_SKIP_NATION_SELECT !== 'false' : false;

  const countryDirectory = createCountryDirectoryStore({
    window,
    requestRender: () => {},
  });
  await countryDirectory.ensureLoaded();

  const sessionStore = createGameSessionStore({
    initialCountryIso3: autoNation,
    initialGodView,
    initialPaused: !skipNationSelect,
    initialStarted: skipNationSelect,
    devMode,
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

  const detachSession = sessionStore.subscribe((session) => {
    gameMenu.render(session);
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
  const detachOpenSettings = gameMenu.onOpenSettings(() => {
    sessionStore.openSettings();
  });
  const detachResume = gameMenu.onResume(() => {
    sessionStore.resume();
  });
  const detachChangeCountry = gameMenu.onChangeCountry((iso3) => {
    sessionStore.setActiveCountry(iso3);
  });
  const detachToggleGodView = gameMenu.onToggleGodView((enabled) => {
    sessionStore.setGodView(enabled);
  });
  const detachDefenseTargetOwn = gameMenu.onDefenseTargetOwn((enabled) => {
    sessionStore.setDefenseTargetOwn(enabled);
  });

  return {
    dispose() {
      detachSession();
      detachStart();
      detachPreview();
      detachOpenSettings();
      detachResume();
      detachChangeCountry();
      detachToggleGodView();
      detachDefenseTargetOwn();
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
