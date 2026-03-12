export function createGameSessionStore({
  initialCountryIso3 = null,
  initialGodView = false,
  initialPaused = true,
  initialStarted = false,
  devMode = false,
  initialScreen = 'mainMenu',
  initialSaveSummary = null,
}) {
  const listeners = new Set();
  const state = {
    activeCountryIso3: normalizeIso3(initialCountryIso3),
    godView: Boolean(initialGodView),
    paused: Boolean(initialPaused),
    started: Boolean(initialStarted),
    devMode: Boolean(devMode),
    screen: normalizeScreen(initialScreen),
    saveSummary: initialSaveSummary ?? null,
    hasSavedGame: Boolean(initialSaveSummary),
  };

  return {
    getSnapshot() {
      return { ...state };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...state });
      return () => listeners.delete(listener);
    },
    openMainMenu() {
      state.screen = 'mainMenu';
      state.started = false;
      state.paused = true;
      emit();
    },
    openNewGameSetup() {
      state.screen = 'nationSelect';
      state.started = false;
      state.paused = true;
      emit();
    },
    selectNation(iso3) {
      state.activeCountryIso3 = normalizeIso3(iso3);
      state.screen = 'inGame';
      state.started = true;
      state.paused = false;
      emit();
    },
    restoreGame({ iso3, godView = false, paused = false } = {}) {
      state.activeCountryIso3 = normalizeIso3(iso3);
      state.godView = Boolean(godView);
      state.screen = 'inGame';
      state.started = true;
      state.paused = Boolean(paused);
      emit();
    },
    setActiveCountry(iso3) {
      state.activeCountryIso3 = normalizeIso3(iso3);
      if (!state.started) {
        state.paused = true;
      }
      emit();
    },
    setPaused(nextPaused) {
      state.paused = Boolean(nextPaused);
      emit();
    },
    resume() {
      state.paused = false;
      emit();
    },
    openSettings() {
      if (!state.started) {
        return;
      }
      state.screen = 'inGame';
      state.paused = true;
      emit();
    },
    setGodView(nextGodView) {
      state.godView = Boolean(nextGodView);
      emit();
    },
    toggleGodView() {
      state.godView = !state.godView;
      emit();
    },
    setSavedGameSummary(summary) {
      state.saveSummary = summary ?? null;
      state.hasSavedGame = Boolean(summary);
      emit();
    },
  };

  function emit() {
    const snapshot = { ...state };
    for (const listener of listeners) {
      listener(snapshot);
    }
  }
}

function normalizeScreen(value) {
  return value === 'nationSelect' || value === 'inGame' ? value : 'mainMenu';
}

function normalizeIso3(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : null;
}
