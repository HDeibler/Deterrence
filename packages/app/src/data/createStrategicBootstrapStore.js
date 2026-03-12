const API_PORT = import.meta.env.VITE_API_PORT ?? '3000';

export function createStrategicBootstrapStore({ window }) {
  const entries = new Map();

  return {
    ensureLoaded,
    getStatus(iso3) {
      return getEntry(iso3)?.status ?? 'idle';
    },
    getSnapshot(iso3) {
      return getEntry(iso3)?.data ?? null;
    },
  };

  function ensureLoaded(iso3) {
    const normalizedIso3 = normalizeIso3(iso3);
    if (!normalizedIso3) {
      return Promise.reject(new Error('Strategic bootstrap requires a valid ISO3 country code'));
    }

    const existing = getEntry(normalizedIso3);
    if (existing?.loadPromise) {
      return existing.loadPromise;
    }

    const nextEntry = existing ?? { status: 'idle', data: null, error: null, loadPromise: null };
    nextEntry.status = 'loading';
    nextEntry.error = null;
    nextEntry.loadPromise = fetch(getBootstrapUrl(window, normalizedIso3))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Strategic bootstrap load failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        nextEntry.status = 'ready';
        nextEntry.data = payload.data ?? null;
        nextEntry.error = null;
        nextEntry.loadPromise = null;
        return nextEntry.data;
      })
      .catch((error) => {
        nextEntry.status = 'error';
        nextEntry.error = error;
        nextEntry.loadPromise = null;
        throw error;
      });

    entries.set(normalizedIso3, nextEntry);
    return nextEntry.loadPromise;
  }

  function getEntry(iso3) {
    const normalizedIso3 = normalizeIso3(iso3);
    if (!normalizedIso3) {
      return null;
    }
    return entries.get(normalizedIso3) ?? null;
  }
}

function getBootstrapUrl(window, iso3) {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:${API_PORT}/strategic/bootstrap/${iso3}`;
}

function normalizeIso3(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : null;
}
