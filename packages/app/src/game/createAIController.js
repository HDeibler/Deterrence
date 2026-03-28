// AI opponent controller — reactive state machine that controls non-player nations.
// Progression: dormant → alert (incoming threats) → retaliatory (after absorbing hits).
// The AI does NOT cheat: it reacts to detected threats and confirmed damage.

const DEFAULT_LAUNCH_SITES = {
  CHN: [
    { lat: 40.0, lon: 92.0, name: 'Jilantai' },
    { lat: 34.5, lon: 104.1, name: 'Tianshui' },
    { lat: 28.2, lon: 86.7, name: 'Delingha' },
  ],
  RUS: [
    { lat: 62.5, lon: 40.3, name: 'Plesetsk' },
    { lat: 51.7, lon: 128.0, name: 'Svobodny' },
    { lat: 56.2, lon: 54.0, name: 'Dombarovsky' },
  ],
  USA: [
    { lat: 48.4, lon: -105.5, name: 'Malmstrom AFB' },
    { lat: 44.2, lon: -103.1, name: 'Ellsworth AFB' },
    { lat: 41.1, lon: -104.8, name: 'FE Warren AFB' },
  ],
};

const CITY_TARGETS = {
  USA: [
    { lat: 38.9, lon: -77.0, name: 'Washington DC' },
    { lat: 40.7, lon: -74.0, name: 'New York' },
    { lat: 34.1, lon: -118.2, name: 'Los Angeles' },
    { lat: 41.9, lon: -87.6, name: 'Chicago' },
  ],
  CHN: [
    { lat: 39.9, lon: 116.4, name: 'Beijing' },
    { lat: 31.2, lon: 121.5, name: 'Shanghai' },
    { lat: 23.1, lon: 113.3, name: 'Guangzhou' },
  ],
  RUS: [
    { lat: 55.8, lon: 37.6, name: 'Moscow' },
    { lat: 59.9, lon: 30.3, name: 'Saint Petersburg' },
    { lat: 56.8, lon: 60.6, name: 'Yekaterinburg' },
  ],
};

const TERRITORY_BOUNDS = {
  USA: { latMin: 24, latMax: 50, lonMin: -130, lonMax: -65 },
  CHN: { latMin: 18, latMax: 54, lonMin: 73, lonMax: 135 },
  RUS: { latMin: 41, latMax: 82, lonMin: 27, lonMax: 180 },
};

function getTargetsAgainst(aiIso3) {
  const targets = [];
  for (const [nation, cities] of Object.entries(CITY_TARGETS)) {
    if (nation !== aiIso3) targets.push(...cities);
  }
  return targets;
}

function isInsideTerritory(lat, lon, iso3) {
  const b = TERRITORY_BOUNDS[iso3];
  if (!b) return false;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

export function createAIController({
  iso3,
  missileFlights,
  radarSimulation,
  damageSimulation,
  installationStore,
}) {
  let state = 'dormant'; // 'dormant' | 'alert' | 'retaliatory'
  let lastLaunchTime = 0;
  const launchCooldown = 30; // seconds between launches
  let missilesLaunched = 0;
  const maxMissiles = 6;
  let radarsDeployed = false;
  let lastCheckedReportCount = 0;

  function getLaunchSites() {
    // Try installation store first, fall back to hardcoded sites
    const storeSites = installationStore.selectLaunchSites({
      iso3,
      targetLat: 0,
      targetLon: 0,
      count: maxMissiles,
      categories: ['icbm_silo', 'mobile_launcher'],
    });

    if (storeSites.length > 0) {
      return storeSites.map((s) => ({
        lat: s.site.latitude,
        lon: s.site.longitude,
        name: s.site.name ?? s.site.id,
      }));
    }

    return DEFAULT_LAUNCH_SITES[iso3] ?? [];
  }

  function deployDefenses() {
    // Place ground radar coverage for this AI's territory
    const bounds = TERRITORY_BOUNDS[iso3];
    if (!bounds) return;

    const centerLat = (bounds.latMin + bounds.latMax) / 2;
    const centerLon = (bounds.lonMin + bounds.lonMax) / 2;
    radarSimulation.placeGroundRadar({ countryIso3: iso3, lat: centerLat, lon: centerLon });
  }

  function launchRetaliatory(elapsedSeconds) {
    const sites = getLaunchSites();
    if (sites.length === 0) return;

    const targets = getTargetsAgainst(iso3);
    if (targets.length === 0) return;

    const site = sites[missilesLaunched % sites.length];
    const target = targets[missilesLaunched % targets.length];

    missileFlights.launch({
      launchSite: {
        latitude: site.lat,
        longitude: site.lon,
        name: site.name,
        countryIso3: iso3,
      },
      target: {
        lat: target.lat,
        lon: target.lon,
        label: target.name,
      },
    });

    missilesLaunched++;
    lastLaunchTime = elapsedSeconds;
  }

  return {
    step(deltaSeconds, elapsedSeconds) {
      // Phase 1: Detect incoming threats (enemy missiles in flight)
      const snapshots = missileFlights.getSnapshots();
      const incomingThreats = snapshots.filter(
        (m) => m.active && m.launchSite && m.launchSite.countryIso3 !== iso3,
      );

      // Phase 2: State transitions (one-way escalation)
      if (state === 'dormant' && incomingThreats.length > 0) {
        state = 'alert';
      }

      // Check for confirmed hits on our territory
      const reports = damageSimulation.getReports();
      if (reports.length > lastCheckedReportCount) {
        for (let i = lastCheckedReportCount; i < reports.length; i++) {
          const r = reports[i];
          if (r.impactPoint && isInsideTerritory(r.impactPoint.lat, r.impactPoint.lon, iso3)) {
            state = 'retaliatory';
            break;
          }
        }
        lastCheckedReportCount = reports.length;
      }

      // Phase 3: Actions
      if (state === 'alert' && !radarsDeployed) {
        deployDefenses();
        radarsDeployed = true;
      }

      if (state === 'retaliatory' && missilesLaunched < maxMissiles) {
        if (elapsedSeconds - lastLaunchTime > launchCooldown) {
          launchRetaliatory(elapsedSeconds);
        }
      }
    },

    getState() {
      return state;
    },

    getIso3() {
      return iso3;
    },

    getMissilesLaunched() {
      return missilesLaunched;
    },
  };
}
