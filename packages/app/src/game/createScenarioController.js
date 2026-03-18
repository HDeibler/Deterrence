// Scenario controller: triggers scripted events during gameplay.
// Scenarios are defined as timed sequences of actions (missile launches, etc).

export function createScenarioController({ missileFlights, radarSimulation, getEarthRotationRadians }) {
  let activeScenario = null;
  let elapsed = 0;
  let firedEvents = new Set();

  return {
    loadScenario(scenario) {
      activeScenario = scenario;
      elapsed = 0;
      firedEvents.clear();
    },

    step(deltaSeconds) {
      if (!activeScenario) return;
      elapsed += deltaSeconds;

      for (const event of activeScenario.events) {
        if (firedEvents.has(event.id)) continue;
        if (elapsed < event.triggerAtSeconds) continue;

        firedEvents.add(event.id);
        executeEvent(event);
      }
    },

    getActiveScenario() {
      return activeScenario;
    },
  };

  function executeEvent(event) {
    if (event.type === 'launch') {
      missileFlights.launch({
        launchSite: {
          latitude: event.launchLat,
          longitude: event.launchLon,
          name: event.launchName ?? 'Unknown Site',
          countryIso3: event.countryIso3,
        },
        target: {
          lat: event.targetLat,
          lon: event.targetLon,
          label: event.targetName ?? 'Target',
        },
      });
    }
  }
}

// ── Pre-built scenarios ──────────────────────────────────────────────────

export const SCENARIOS = {
  chinaStrike: {
    name: 'Chinese First Strike',
    description: 'Intelligence indicates imminent Chinese ICBM launches targeting US cities and New Delhi. Your SBIRS satellite constellation over Asia provides early warning. Defend the homeland with NGI interceptors from Fort Greely and Vandenberg.',
    countries: ['USA'],
    // Pre-deploy a GEO satellite over Asia for early warning
    setup: {
      satellites: [
        { longitude: 105, altitudeKm: 36000, label: 'SBIRS GEO-Asia' },
      ],
      interceptorSites: [
        { lat: 64.8, lon: -146.3, type: 'ngi', label: 'Fort Greely, AK' },
        { lat: 34.7, lon: -120.6, type: 'ngi', label: 'Vandenberg SFB, CA' },
      ],
      groundRadars: [
        { lat: 64.3, lon: -149.2, label: 'Clear AFS, AK' },
        { lat: 71.3, lon: -156.8, label: 'Cape Lisburne, AK' },
      ],
    },
    events: [
      // Wave 1: Two ICBMs toward US mainland (60 seconds in)
      {
        id: 'cn-icbm-1',
        type: 'launch',
        triggerAtSeconds: 60,
        countryIso3: 'CHN',
        launchLat: 40.0,
        launchLon: 92.0,
        launchName: 'Jilantai Missile Base',
        targetLat: 38.9,
        targetLon: -77.0,
        targetName: 'Washington, DC',
      },
      {
        id: 'cn-icbm-2',
        type: 'launch',
        triggerAtSeconds: 65,
        countryIso3: 'CHN',
        launchLat: 34.5,
        launchLon: 104.1,
        launchName: 'Tianshui Missile Base',
        targetLat: 40.7,
        targetLon: -74.0,
        targetName: 'New York City',
      },
      // Wave 2: Strike toward India (90 seconds in)
      {
        id: 'cn-icbm-3',
        type: 'launch',
        triggerAtSeconds: 90,
        countryIso3: 'CHN',
        launchLat: 28.2,
        launchLon: 86.7,
        launchName: 'Delingha Missile Base',
        targetLat: 28.6,
        targetLon: 77.2,
        targetName: 'New Delhi',
      },
      // Wave 3: Second salvo toward US (120 seconds in)
      {
        id: 'cn-icbm-4',
        type: 'launch',
        triggerAtSeconds: 120,
        countryIso3: 'CHN',
        launchLat: 36.6,
        launchLon: 101.8,
        launchName: 'Xining Missile Base',
        targetLat: 34.1,
        targetLon: -118.2,
        targetName: 'Los Angeles',
      },
      {
        id: 'cn-icbm-5',
        type: 'launch',
        triggerAtSeconds: 125,
        countryIso3: 'CHN',
        launchLat: 40.0,
        launchLon: 92.0,
        launchName: 'Jilantai Missile Base',
        targetLat: 47.6,
        targetLon: -122.3,
        targetName: 'Seattle',
      },
    ],
  },
};
