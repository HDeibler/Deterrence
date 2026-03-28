// Scenario controller: triggers scripted events during gameplay.
// Scenarios are defined as timed sequences of actions (missile launches, etc).

export function createScenarioController({ missileFlights, radarSimulation, getEarthRotationRadians, navalSimulation, notifications }) {
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
    } else if (event.type === 'deploy_fleet') {
      if (!navalSimulation) return;
      navalSimulation.createFleet({
        lat: event.lat,
        lon: event.lon,
        ships: event.ships,
        name: event.name ?? 'Enemy Fleet',
      });
    } else if (event.type === 'alert') {
      if (!notifications) return;
      const dispatch = notifications[event.level] ?? notifications.info;
      dispatch(event.message);
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

  russianSubStrike: {
    name: 'Russian Submarine Strike',
    description: 'SOSUS arrays detect Russian SSBN launch signatures in the North Atlantic. Submarine-launched ballistic missiles give minimal warning time. Deploy THAAD and Aegis defenses.',
    countries: ['USA'],
    setup: {
      satellites: [
        { longitude: -15, altitudeKm: 36000, label: 'SBIRS GEO-Atlantic' },
      ],
      interceptorSites: [
        { lat: 64.8, lon: -146.3, type: 'ngi', label: 'Fort Greely, AK' },
      ],
      groundRadars: [
        { lat: 76.5, lon: -68.8, label: 'Thule SFS, Greenland' },
      ],
    },
    events: [
      // Wave 1: 2 SLBMs targeting DC and Chicago (30s)
      {
        id: 'ru-slbm-1',
        type: 'launch',
        triggerAtSeconds: 30,
        countryIso3: 'RUS',
        launchLat: 60.0,
        launchLon: -30.0,
        launchName: 'SSBN Yuri Dolgorukiy',
        targetLat: 38.9,
        targetLon: -77.0,
        targetName: 'Washington, DC',
      },
      {
        id: 'ru-slbm-2',
        type: 'launch',
        triggerAtSeconds: 30,
        countryIso3: 'RUS',
        launchLat: 60.0,
        launchLon: -30.0,
        launchName: 'SSBN Yuri Dolgorukiy',
        targetLat: 41.9,
        targetLon: -87.6,
        targetName: 'Chicago',
      },
      // Wave 2: 1 SLBM targeting Norfolk (50s)
      {
        id: 'ru-slbm-3',
        type: 'launch',
        triggerAtSeconds: 50,
        countryIso3: 'RUS',
        launchLat: 60.0,
        launchLon: -30.0,
        launchName: 'SSBN Yuri Dolgorukiy',
        targetLat: 36.8,
        targetLon: -76.3,
        targetName: 'Norfolk Naval Base',
      },
      // Wave 3: 2 SLBMs targeting San Francisco and Houston (80s)
      {
        id: 'ru-slbm-4',
        type: 'launch',
        triggerAtSeconds: 80,
        countryIso3: 'RUS',
        launchLat: 60.0,
        launchLon: -30.0,
        launchName: 'SSBN Yuri Dolgorukiy',
        targetLat: 37.8,
        targetLon: -122.4,
        targetName: 'San Francisco',
      },
      {
        id: 'ru-slbm-5',
        type: 'launch',
        triggerAtSeconds: 80,
        countryIso3: 'RUS',
        launchLat: 60.0,
        launchLon: -30.0,
        launchName: 'SSBN Yuri Dolgorukiy',
        targetLat: 29.8,
        targetLon: -95.4,
        targetName: 'Houston',
      },
    ],
  },

  nuclearDeterrence: {
    name: 'Nuclear Deterrence',
    description: 'Both superpowers maintain full strategic arsenals. Your objective: survive 30 minutes without total casualties exceeding 1 million on either side. Exercise restraint — escalation leads to mutual destruction.',
    countries: ['USA', 'CHN', 'RUS'],
    setup: {
      satellites: [
        { longitude: -90, altitudeKm: 36000, label: 'SBIRS GEO-West' },
        { longitude: 90, altitudeKm: 36000, label: 'SBIRS GEO-East' },
      ],
      interceptorSites: [
        { lat: 64.8, lon: -146.3, type: 'ngi', label: 'Fort Greely, AK' },
        { lat: 34.7, lon: -120.6, type: 'ngi', label: 'Vandenberg SFB, CA' },
      ],
      groundRadars: [
        { lat: 64.3, lon: -149.2, label: 'Clear AFS, AK' },
        { lat: 76.5, lon: -68.8, label: 'Thule SFS, Greenland' },
      ],
    },
    events: [
      // Tension escalation: alert at 120s
      {
        id: 'nd-alert-1',
        type: 'alert',
        triggerAtSeconds: 120,
        message: 'DEFCON 2: Intelligence reports enemy strategic forces moving to elevated readiness.',
        level: 'warn',
      },
      // Enemy fleet deployment near player waters at 180s
      {
        id: 'nd-fleet-1',
        type: 'deploy_fleet',
        triggerAtSeconds: 180,
        lat: 35.0,
        lon: -65.0,
        countryIso3: 'RUS',
        ships: [{ type: 'cruiser' }, { type: 'cruiser' }, { type: 'destroyer' }],
        name: 'Northern Fleet Task Force',
      },
      // Warning shot: 1 ICBM at unpopulated area at 300s
      {
        id: 'nd-warning-shot',
        type: 'launch',
        triggerAtSeconds: 300,
        countryIso3: 'RUS',
        launchLat: 62.5,
        launchLon: 40.2,
        launchName: 'Plesetsk Cosmodrome',
        targetLat: 55.0,
        targetLon: -135.0,
        targetName: 'Gulf of Alaska (Warning Shot)',
      },
      // Retaliation: 3 ICBMs at player cities at 600s
      {
        id: 'nd-retaliation-1',
        type: 'launch',
        triggerAtSeconds: 600,
        countryIso3: 'RUS',
        launchLat: 62.5,
        launchLon: 40.2,
        launchName: 'Plesetsk Cosmodrome',
        targetLat: 38.9,
        targetLon: -77.0,
        targetName: 'Washington, DC',
      },
      {
        id: 'nd-retaliation-2',
        type: 'launch',
        triggerAtSeconds: 600,
        countryIso3: 'RUS',
        launchLat: 56.3,
        launchLon: 47.2,
        launchName: 'Yoshkar-Ola Missile Base',
        targetLat: 40.7,
        targetLon: -74.0,
        targetName: 'New York City',
      },
      {
        id: 'nd-retaliation-3',
        type: 'launch',
        triggerAtSeconds: 600,
        countryIso3: 'RUS',
        launchLat: 52.9,
        launchLon: 59.7,
        launchName: 'Dombarovsky Missile Base',
        targetLat: 34.1,
        targetLon: -118.2,
        targetName: 'Los Angeles',
      },
    ],
  },

  oilEmbargo: {
    name: 'Oil Embargo',
    description: 'Hostile forces threaten major oil shipping lanes through the Strait of Hormuz. Deploy naval assets to protect tanker traffic. Loss of oil supply will cripple military operations.',
    countries: ['USA'],
    setup: {
      satellites: [
        { longitude: 55, altitudeKm: 36000, label: 'SBIRS GEO-MiddleEast' },
      ],
      interceptorSites: [],
      groundRadars: [
        { lat: 24.4, lon: 54.5, label: 'Al Dhafra AB, UAE' },
      ],
    },
    events: [
      // Alert about hostile fleet movements at 60s
      {
        id: 'oe-alert-1',
        type: 'alert',
        triggerAtSeconds: 60,
        message: 'FLASH: Hostile naval activity detected near Strait of Hormuz. Iranian Revolutionary Guard Navy mobilizing fast-attack craft.',
        level: 'warn',
      },
      // Enemy fleet near Hormuz at 90s
      {
        id: 'oe-fleet-1',
        type: 'deploy_fleet',
        triggerAtSeconds: 90,
        lat: 26.0,
        lon: 56.5,
        countryIso3: 'IRN',
        ships: [{ type: 'cruiser' }, { type: 'destroyer' }, { type: 'destroyer' }],
        name: 'IRGCN Hormuz Squadron',
      },
      // Second enemy fleet near Malacca at 180s
      {
        id: 'oe-fleet-2',
        type: 'deploy_fleet',
        triggerAtSeconds: 180,
        lat: 2.0,
        lon: 103.0,
        countryIso3: 'CHN',
        ships: [{ type: 'cruiser' }, { type: 'destroyer' }],
        name: 'PLAN Malacca Task Group',
      },
      // Alert about escalation at 240s
      {
        id: 'oe-alert-2',
        type: 'alert',
        triggerAtSeconds: 240,
        message: 'WARNING: Hostile forces preparing anti-ship missile strikes against Gulf oil infrastructure.',
        level: 'error',
      },
      // Cruise missile launches at Gulf oil infrastructure at 300s
      {
        id: 'oe-cruise-1',
        type: 'launch',
        triggerAtSeconds: 300,
        countryIso3: 'IRN',
        launchLat: 27.2,
        launchLon: 56.0,
        launchName: 'Bandar Abbas',
        targetLat: 26.3,
        targetLon: 50.2,
        targetName: 'Ras Tanura Oil Terminal',
      },
      {
        id: 'oe-cruise-2',
        type: 'launch',
        triggerAtSeconds: 305,
        countryIso3: 'IRN',
        launchLat: 27.2,
        launchLon: 56.0,
        launchName: 'Bandar Abbas',
        targetLat: 25.4,
        targetLon: 49.6,
        targetName: 'Abqaiq Processing Facility',
      },
    ],
  },
};
