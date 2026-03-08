const API_PORT = import.meta.env.VITE_API_PORT ?? '3000';

export function createCountryDirectoryStore({ window, requestRender }) {
  const byIso2 = new Map();
  const byIso3 = new Map();
  let status = 'idle';
  let loadPromise = null;

  return {
    ensureLoaded,
    getAll() {
      return [...byIso3.values()].sort((left, right) => {
        const leftName = left?.name ?? left?.iso3 ?? '';
        const rightName = right?.name ?? right?.iso3 ?? '';
        return leftName.localeCompare(rightName);
      });
    },
    getByIso2(iso2) {
      return byIso2.get(normalizeIso(iso2, 2)) ?? null;
    },
    getByIso3(iso3) {
      return byIso3.get(normalizeIso(iso3, 3)) ?? null;
    },
    getStatus() {
      return status;
    },
  };

  function ensureLoaded() {
    if (loadPromise) {
      return loadPromise;
    }

    status = 'loading';
    loadPromise = fetch(getDirectoryUrl(window))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Country directory load failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        for (const country of payload.data ?? []) {
          const normalizedIso2 = normalizeIso(country.iso2, 2);
          const normalizedIso3 = normalizeIso(country.iso3, 3);
          if (normalizedIso2) {
            byIso2.set(normalizedIso2, country);
          }
          if (normalizedIso3) {
            byIso3.set(normalizedIso3, country);
          }
        }
        status = 'ready';
        requestRender?.();
      })
      .catch((error) => {
        console.error(error);
        status = 'error';
      });

    return loadPromise;
  }
}

function getDirectoryUrl(window) {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:${API_PORT}/countries/directory`;
}

function normalizeIso(value, length) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== length) {
    return null;
  }
  return normalized;
}
