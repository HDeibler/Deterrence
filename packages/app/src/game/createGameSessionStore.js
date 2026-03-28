export function createGameSessionStore({
  initialCountryIso3 = null,
  initialGodView = false,
  initialPaused = true,
  initialStarted = false,
  devMode = false,
}) {
  const listeners = new Set();
  const state = {
    activeCountryIso3: normalizeIso3(initialCountryIso3),
    godView: Boolean(initialGodView),
    defenseTargetOwn: true,
    paused: Boolean(initialPaused),
    started: Boolean(initialStarted),
    devMode: Boolean(devMode),
    gameStatus: 'ongoing',
    gameStatusReason: '',
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
    selectNation(iso3) {
      state.activeCountryIso3 = normalizeIso3(iso3);
      state.started = true;
      state.paused = false;
      state.gameStatus = 'ongoing';
      state.gameStatusReason = '';
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
    setDefenseTargetOwn(value) {
      state.defenseTargetOwn = Boolean(value);
      emit();
    },
    setGameOver(status, reason) {
      state.gameStatus = status;
      state.gameStatusReason = reason;
      state.paused = true;
      emit();
    },
    returnToMenu() {
      state.started = false;
      state.paused = true;
      state.gameStatus = 'ongoing';
      state.gameStatusReason = '';
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

function normalizeIso3(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : null;
}
