import { buildDomesticBaseNetwork, deriveBaseType } from '../game/data/baseCapabilityCatalog.js';

const API_PORT = import.meta.env.VITE_API_PORT ?? '3000';
const LAUNCH_SITE_TYPES = [
  'missile_launch_facility',
  'nuclear_weapons_facility',
  'military_base',
  'air_base',
  'army_base',
  'naval_base',
];

const CATEGORY_MAP = {
  missile_launch_facility: 'silo',
  nuclear_weapons_facility: 'silo',
  air_base: 'airbase',
  naval_base: 'naval',
  military_base: 'airbase',
  army_base: 'airbase',
};

const CATEGORY_CYCLE = ['all', 'silo', 'airbase', 'naval'];

export function createMilitaryInstallationStore({ window, requestRender }) {
  let status = 'idle';
  let loadPromise = null;
  let sites = [];
  let sitesByCountry = {};
  let activeCategory = 'all';
  let activeCountryIso3 = 'USA';
  const spentSiloIds = new Set();

  return {
    ensureLoaded,
    getStatus() {
      return status;
    },
    getSites() {
      return sites;
    },
    getFilteredSites() {
      return sites.filter((site) => {
        if (activeCategory !== 'all' && site.category !== activeCategory) {
          return false;
        }
        return true;
      });
    },
    getCountrySites(iso3) {
      return sitesByCountry[iso3] ?? [];
    },
    getStrategicDomesticBases(iso3) {
      return buildDomesticBaseNetwork({
        countryIso3: iso3,
        installations: sitesByCountry[iso3] ?? [],
      });
    },
    getActiveCategory() {
      return activeCategory;
    },
    cycleCategory() {
      const currentIndex = CATEGORY_CYCLE.indexOf(activeCategory);
      activeCategory = CATEGORY_CYCLE[(currentIndex + 1) % CATEGORY_CYCLE.length];
      requestRender?.();
      return activeCategory;
    },
    setActiveCategory(category) {
      if (CATEGORY_CYCLE.includes(category)) {
        activeCategory = category;
        requestRender?.();
      }
    },
    getActiveCountry() {
      return activeCountryIso3;
    },
    setActiveCountry(iso3) {
      activeCountryIso3 = iso3;
      requestRender?.();
    },
    getAvailableCountries() {
      return Object.keys(sitesByCountry).sort();
    },
    getSpentSiloIds() {
      return [...spentSiloIds];
    },
    setSpentSiloIds(siteIds = []) {
      spentSiloIds.clear();
      for (const siteId of siteIds) {
        spentSiloIds.add(siteId);
      }
      requestRender?.();
    },
    markSiloSpent(siteId) {
      spentSiloIds.add(siteId);
    },
    isSiloSpent(siteId) {
      return spentSiloIds.has(siteId);
    },
    getAvailableSilos(iso3) {
      return (sitesByCountry[iso3] ?? []).filter(
        (site) => site.category === 'silo' && !spentSiloIds.has(site.id),
      );
    },
    getAvailableSiloCount(iso3) {
      return this.getAvailableSilos(iso3).length;
    },
    selectLaunchSilos({ iso3, targetLat, targetLon, count }) {
      const available = this.getAvailableSilos(iso3);
      if (available.length === 0) {
        return [];
      }

      const scored = available.map((site) => ({
        site,
        distance: haversineDistance(site.latitude, site.longitude, targetLat, targetLon),
      }));
      scored.sort((a, b) => a.distance - b.distance);

      const selected = scored.slice(0, count).map((entry) => entry.site);
      return selected;
    },
    resetSpentSilos() {
      spentSiloIds.clear();
      requestRender?.();
    },
  };

  function ensureLoaded() {
    if (loadPromise) {
      return loadPromise;
    }

    status = 'loading';
    loadPromise = fetch(getInstallationsUrl(window))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Military installation load failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        sites = (payload.data ?? []).map((site) => ({
          id: site.id,
          name: site.name,
          countryName: site.countryName,
          countryIso2: site.countryIso2,
          countryIso3: site.countryIso3,
          installationType: site.installationType,
          category: CATEGORY_MAP[site.installationType] ?? 'airbase',
          baseType: deriveBaseType({ category: CATEGORY_MAP[site.installationType] ?? 'airbase' }),
          latitude: Number(site.latitude),
          longitude: Number(site.longitude),
          sourceRef: site.sourceRef,
        }));
        sitesByCountry = groupByCountry(sites);
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

function groupByCountry(sites) {
  const grouped = {};
  for (const site of sites) {
    if (!grouped[site.countryIso3]) {
      grouped[site.countryIso3] = [];
    }
    grouped[site.countryIso3].push(site);
  }
  return grouped;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat * 0.5) * Math.sin(dLat * 0.5) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon * 0.5) * Math.sin(dLon * 0.5);
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371;
}

function getInstallationsUrl(window) {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const search = new URLSearchParams({
    hasCoordinates: 'true',
    limit: '20000',
    types: LAUNCH_SITE_TYPES.join(','),
  });
  return `${protocol}//${hostname}:${API_PORT}/military-installations?${search.toString()}`;
}
