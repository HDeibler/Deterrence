const STORAGE_KEY = 'deterrence.saved-game.v1';

export function createSavedGameStore({ window }) {
  return {
    load() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1 || !parsed.summary || !parsed.gameState) {
          return null;
        }
        return parsed;
      } catch (error) {
        console.error('Failed to load saved game', error);
        return null;
      }
    },
    loadSummary() {
      return this.load()?.summary ?? null;
    },
    save(payload) {
      const wrapped = {
        version: 1,
        savedAt: new Date().toISOString(),
        ...payload,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wrapped));
      return wrapped;
    },
    clear() {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
}
