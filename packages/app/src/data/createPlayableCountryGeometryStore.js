const PLAYABLE_COUNTRY_POLYGON_DATA_URL = '/data/countries/playable-country-polygons.json';

export function createPlayableCountryGeometryStore() {
  const geometries = new Map();
  let status = 'idle';
  let loadPromise = null;

  return {
    ensureLoaded,
    contains(iso3, lat, lon) {
      const geometry = geometries.get(normalizeIso3(iso3));
      if (!geometry) {
        return false;
      }
      return geometry.some((polygon) => pointInPolygonSet(lon, lat, polygon));
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
    loadPromise = fetch(PLAYABLE_COUNTRY_POLYGON_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Playable country polygon load failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        for (const country of payload.countries ?? []) {
          geometries.set(normalizeIso3(country.iso3), normalizeGeometry(country.geometry));
        }
        status = 'ready';
      })
      .catch((error) => {
        console.error(error);
        status = 'error';
      });

    return loadPromise;
  }
}

function normalizeGeometry(geometry) {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates;
  }
  return [];
}

function pointInPolygonSet(lon, lat, polygonRings) {
  if (!polygonRings?.length) {
    return false;
  }
  if (!pointInRing(lon, lat, polygonRings[0])) {
    return false;
  }
  for (let index = 1; index < polygonRings.length; index += 1) {
    if (pointInRing(lon, lat, polygonRings[index])) {
      return false;
    }
  }
  return true;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects =
      y1 > lat !== y2 > lat &&
      lon < ((x2 - x1) * (lat - y1)) / ((y2 - y1) || Number.EPSILON) + x1;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function normalizeIso3(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : null;
}
