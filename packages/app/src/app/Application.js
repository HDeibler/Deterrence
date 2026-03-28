import * as THREE from 'three';
import { createSceneContext } from '../core/createSceneContext.js';
import { createHudController } from '../ui/createHudController.js';
import { createChromeController } from '../ui/createChromeController.js';
import { createNavalSimulation } from '../simulation/createNavalSimulation.js';
import { createAirSimulation, filterAlliedBases } from '../simulation/createAirSimulation.js';
import { createGameClock } from '../simulation/createGameClock.js';
import { createOceanNavGrid } from '../world/nav/createOceanNavGrid.js';
import { createFleetBuilderController } from '../ui/createFleetBuilderController.js';
import { createFleetActionController } from '../ui/createFleetActionController.js';
import { createRadarSimulation } from '../simulation/createRadarSimulation.js';
import { createSpaceEnvironment } from '../world/factories/createSpaceEnvironment.js';
import { createCelestialSystem } from '../world/factories/createCelestialSystem.js';
import { createRadarVisualSystem } from '../world/factories/createRadarVisualSystem.js';
import { createCityLabelSystem } from '../world/systems/createCityLabelSystem.js';
import { createCountryBorderSystem } from '../world/systems/createCountryBorderSystem.js';
import { createMissileOverlaySystem } from '../world/systems/createMissileOverlaySystem.js';
import { createFleetOverlaySystem } from '../world/systems/createFleetOverlaySystem.js';
import { createTradeOverlaySystem } from '../world/systems/createTradeOverlaySystem.js';
import { createTradeSimulation } from '../simulation/createTradeSimulation.js';
import { createSquadronOverlaySystem } from '../world/systems/createSquadronOverlaySystem.js';
import { createSquadronBuilderController } from '../ui/createSquadronBuilderController.js';
import { createSquadronActionController } from '../ui/createSquadronActionController.js';
import { createNotificationController } from '../ui/createNotificationController.js';
import { renderConfig, simulationConfig, worldConfig } from '../config/simulationConfig.js';
import { createMilitaryInstallationStore } from '../data/createMilitaryInstallationStore.js';
import {
  COUNTRY_SPACEPORTS,
  EARLY_WARNING_SATELLITE_PRESET,
  GROUND_RADAR_PRESET,
  INTERCEPTOR_PRESETS,
  INTERCEPTOR_TYPES,
  computeFootprintRadiusKm,
} from '../game/data/radarCatalog.js';
import { createOrbitPlannerController } from '../ui/createOrbitPlannerController.js';
import { createMissileDefenseSimulation } from '../simulation/createMissileDefenseSimulation.js';
import { createDefenseOverlaySystem } from '../world/systems/createDefenseOverlaySystem.js';
import { haversineDistanceKm, latLonToVector3 } from '../world/geo/geoMath.js';
import {
  createInitialRadarSelection,
  createInitialStrikeSelection,
  GEO_SELECTION_CAMERA_POSITION,
  STRIKE_LAUNCH_STAGGER_MS,
} from './appConstants.js';
import { createOilSimulation } from '../simulation/createOilSimulation.js';
import { createDamageSimulation } from '../simulation/createDamageSimulation.js';
import { getMissileType, getCompatibleWarheads, getWarheadType } from '../game/data/munitionCatalog.js';
import { createMissileFlightController } from './createMissileFlightController.js';
import { createScenarioController, SCENARIOS } from '../game/createScenarioController.js';
import { createPointerController } from './createPointerController.js';
import { createViewStateController } from './createViewStateController.js';
import { formatTargetLabel } from './formatTargetLabel.js';
import { createVictoryEvaluator } from '../game/createVictoryEvaluator.js';

export async function createApplication({
  mountNode,
  document,
  window,
  countryDirectory,
  sessionStore,
  devMode = false,
}) {
  const sceneContext = createSceneContext({ mountNode, window, worldConfig, renderConfig });
  const installationStore = createMilitaryInstallationStore({
    window,
    requestRender: () => requestRender(),
  });
  const hud = createHudController({ document });
  hud.onClose(() => {
    stopTracking();
  });
  const chrome = createChromeController({ document });
  const environment = createSpaceEnvironment({ scene: sceneContext.scene, renderConfig });
  const navalSimulation = createNavalSimulation();
  const airSimulation = createAirSimulation();
  airSimulation.setCarrierPositionResolver((fleetId) => {
    const fleet = navalSimulation.getFleets().find((f) => f.id === fleetId);
    return fleet ? { lat: fleet.lat, lon: fleet.lon } : null;
  });
  airSimulation.onEvent((type, data) => {
    if (type === 'crash') {
      notifications.error(`${data.missionName}: ${data.aircraftCount} aircraft lost — fuel exhausted`);
    } else if (type === 'bingo') {
      notifications.warn(`${data.missionName}: Bingo fuel (${data.fuelPct}%) — returning to carrier`);
    }
  });
  const radarSimulation = createRadarSimulation({ simulationConfig, worldConfig });
  const gameClock = createGameClock();
  const clockEl = document.getElementById('gameClock');
  const clockTimeEl = document.getElementById('gameClockTime');
  const clockDateEl = document.getElementById('gameClockDate');
  let selectedFleetId = null;
  let selectedSquadronId = null;
  let oceanNavGrid = null;
  let awaitingDestination = false;
  let awaitingAirDestination = false;
  let pendingRoute = null;
  let pendingAirRoute = null;
  let pendingAircraft = null;
  let pendingAirHomeBase = null;
  let pendingMissionPlan = null;
  let radarMode = 'off';
  let selectedInterceptorType = 'ngi';
  let selectedMissileType = 'icbm';
  let selectedWarheadId = 'nuclear_300kt';
  const radarSelection = createInitialRadarSelection();
  const selection = createInitialStrikeSelection();

  let requestRender = () => {};
  let running = false;
  let accumulated = 0;
  let rafId = null;
  let paused = sessionStore.getSnapshot().paused;
  let godView = sessionStore.getSnapshot().godView;
  let defenseTargetOwn = sessionStore.getSnapshot().defenseTargetOwn ?? true;
  let activeCountryIso3 = sessionStore.getSnapshot().activeCountryIso3;
  let savedCameraPosition = null;
  let savedCameraTarget = null;
  let lastFollowPos = null;
  const notifiedThreatIds = new Set();
  let selectedScenarioId = '';
  let scenarioLoaded = false;
  const scenarioOptionsEl = document.getElementById('scenarioOptions');

  const celestialSystem = await createCelestialSystem({
    scene: sceneContext.scene,
    renderer: sceneContext.renderer,
    worldConfig,
    renderConfig,
    onInvalidate: () => requestRender(),
  });
  const missileDefenseSim = createMissileDefenseSimulation({
    worldConfig,
    simulationConfig,
    getEarthRotationRadians: () => celestialSystem.getEarthRotationRadians(),
    radarSimulation,
  });
  const radarVisualSystem = createRadarVisualSystem({
    scene: sceneContext.scene,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    renderConfig,
  });
  const fleetBuilder = createFleetBuilderController({ document, mountNode });
  const fleetAction = createFleetActionController({ document, mountNode });
  const orbitPlanner = createOrbitPlannerController({ document, mountNode });
  const squadronBuilder = createSquadronBuilderController({ document, mountNode });
  const squadronAction = createSquadronActionController({ document, mountNode });
  const notifications = createNotificationController({ document, mountNode });
  const navalHint = document.createElement('div');
  navalHint.className = 'naval-hint';
  navalHint.hidden = true;
  mountNode.appendChild(navalHint);
  const airHint = document.createElement('div');
  airHint.className = 'air-hint';
  airHint.hidden = true;
  mountNode.appendChild(airHint);

  function showNavalHint(text) {
    navalHint.textContent = text;
    navalHint.hidden = false;
  }

  function hideNavalHint() {
    navalHint.hidden = true;
  }

  function showAirHint(text) {
    airHint.textContent = text;
    airHint.hidden = false;
  }

  function hideAirHint() {
    airHint.hidden = true;
  }

  // ── Damage report UI ──────────────────────────────────────────────
  const damageReportEl = document.getElementById('damageReport');
  const damageReportTitle = document.getElementById('damageReportTitle');
  const damageReportFatalities = document.getElementById('damageReportFatalities');
  const damageReportInjured = document.getElementById('damageReportInjured');
  const damageReportYield = document.getElementById('damageReportYield');
  const damageReportWarhead = document.getElementById('damageReportWarhead');
  const damageReportCities = document.getElementById('damageReportCities');
  const damageReportCloseBtn = document.getElementById('damageReportClose');
  let damageReportTimer = null;

  damageReportCloseBtn?.addEventListener('click', () => {
    damageReportEl.hidden = true;
    if (damageReportTimer) clearTimeout(damageReportTimer);
  });

  function showDamageReport(report) {
    const coordLabel = formatTargetLabel(report.impactPoint);
    const nearestCity = report.affectedCities[0]?.name ?? null;
    damageReportTitle.textContent = nearestCity
      ? `${nearestCity} region (${coordLabel})`
      : coordLabel;

    damageReportFatalities.textContent = formatCompactNumber(report.totalFatalities);
    damageReportInjured.textContent = formatCompactNumber(report.totalInjured);
    damageReportYield.textContent = report.yieldKt >= 1000
      ? `${(report.yieldKt / 1000).toFixed(1)} Mt`
      : report.yieldKt >= 1
        ? `${report.yieldKt} kt`
        : 'Conventional';
    damageReportWarhead.textContent = report.warheadLabel;

    damageReportCities.innerHTML = '';
    for (const city of report.affectedCities.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'damage-city-row';
      row.innerHTML = `<span class="damage-city-name">${city.name}</span>`
        + `<span class="damage-city-pop">${formatCompactNumber(city.population)} pop</span>`
        + `<span class="damage-city-fatalities">${formatCompactNumber(city.fatalities)} killed</span>`;
      damageReportCities.appendChild(row);
    }

    damageReportEl.hidden = false;

    if (damageReportTimer) clearTimeout(damageReportTimer);
    damageReportTimer = setTimeout(() => {
      damageReportEl.hidden = true;
    }, 20000);

    notifications.push({
      text: report.totalFatalities > 0
        ? `IMPACT: ${formatCompactNumber(report.totalFatalities)} casualties${nearestCity ? ` near ${nearestCity}` : ''}`
        : `IMPACT: Detonation at ${coordLabel} — no population centers affected`,
      type: 'alert',
      duration: 15000,
      group: `impact-${report.missileId}`,
    });
  }

  function formatCompactNumber(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  // Build ocean nav grid from earth texture (deferred — non-blocking)
  if (celestialSystem.isOcean) {
    oceanNavGrid = createOceanNavGrid({ isOcean: celestialSystem.isOcean });
  }

  const cityLabels = createCityLabelSystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    onStateChange: (state) => chrome.setCitiesState(state),
    requestRender: () => requestRender(),
    countryDirectory,
  });
  const countryBorders = createCountryBorderSystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    onStateChange: (state) => chrome.setBordersState(state),
    requestRender: () => requestRender(),
    countryDirectory,
  });
  const missileOverlay = createMissileOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    requestRender: () => requestRender(),
    installationStore,
  });
  const fleetOverlay = createFleetOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
  });
  const squadronOverlay = createSquadronOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
  });
  const defenseOverlay = createDefenseOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    scene: sceneContext.scene,
    worldConfig,
  });
  const pointerController = createPointerController({
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthMesh: celestialSystem.meshes.earth,
    radarVisualSystem,
    missileOverlay,
  });
  const missileFlights = createMissileFlightController({
    simulationConfig,
    worldConfig,
    getEarthRotationRadians: () => celestialSystem.getEarthRotationRadians(),
  });
  const oilSimulation = createOilSimulation();
  missileOverlay.setOilSimulation(oilSimulation);
  const tradeSimulation = createTradeSimulation({
    oilSimulation,
    oceanNavGrid,
    navalSimulation,
  });
  const tradeOverlay = createTradeOverlaySystem({
    document,
    mountNode: sceneContext.renderer.domElement,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
  });
  const damageSimulation = createDamageSimulation();
  damageSimulation.ensureLoaded();
  const impactedMissileIds = new Set();
  let victoryEvaluator = null;

  // Petroleum panel elements
  const placeReserveBtn = document.getElementById('placeReserveBtn');
  const placePortBtn = document.getElementById('placePortBtn');
  const petroleumSummaryLabel = document.getElementById('petroleumSummaryLabel');

  placeReserveBtn?.addEventListener('click', () => {
    if (!activeCountryIso3) return;
    placingReserve = true;
    pendingReserveTarget = null;
    notifications.info('Click on the globe to stage reserve location. Enter confirms, Escape cancels.');
  });

  placePortBtn?.addEventListener('click', () => {
    if (!activeCountryIso3) return;
    placingPort = true;
    pendingPortTarget = null;
    // Auto-enable trade view so the player sees ports
    if (!viewController.isEnabled('trade')) {
      viewController.toggle('trade');
    }
    notifications.info('Click a coastal location to place an oil port. Enter confirms, Escape cancels.');
  });

  let placingReserve = false;
  let pendingReserveTarget = null;
  let placingPort = false;
  let pendingPortTarget = null;

  // Resource panel elements
  const resourcePanel = document.getElementById('resourcePanel');
  const resourceMilFuel = document.getElementById('resourceMilFuel');
  const resourceMilRate = document.getElementById('resourceMilRate');
  const resourceMilBar = document.getElementById('resourceMilBar');
  const resourceOilReserves = document.getElementById('resourceOilReserves');
  const resourceOilRate = document.getElementById('resourceOilRate');
  const resourceOilBar = document.getElementById('resourceOilBar');

  const scenarioController = createScenarioController({
    missileFlights,
    radarSimulation,
    getEarthRotationRadians: () => celestialSystem.getEarthRotationRadians(),
  });

  const viewController = createViewStateController({
    chrome,
    celestialSystem,
    missileOverlay,
    cityLabels,
    countryBorders,
    radarVisualSystem,
    getRadarMode: () => radarMode,
  });
  const clock = new THREE.Clock();

  if (activeCountryIso3) {
    installationStore.setActiveCountry(activeCountryIso3);
  }
  countryBorders.setActiveCountry(activeCountryIso3);
  chrome.setRadarState({ mode: radarMode });
  missileOverlay.setGodView(godView);
  viewController.apply();

  function renderFrame() {
    rafId = null;
    if (!running) {
      return;
    }

    const deltaSeconds = Math.min(clock.getDelta(), 1 / 30);
    accumulated += deltaSeconds;
    const effectiveSimulationConfig = paused
      ? { ...simulationConfig, simulationTimeScale: 0 }
      : simulationConfig;

    while (
      !paused &&
      simulationConfig.simulationTimeScale > 0 &&
      accumulated >= simulationConfig.fixedTimeStep
    ) {
      const stepSeconds = simulationConfig.fixedTimeStep * simulationConfig.simulationTimeScale;
      gameClock.tick(stepSeconds);
      missileFlights.step(stepSeconds);
      navalSimulation.step(stepSeconds);
      airSimulation.step(stepSeconds);
      radarSimulation.step(stepSeconds);
      scenarioController.step(stepSeconds);
      oilSimulation.step(stepSeconds);
      tradeSimulation.step(stepSeconds);

      // Missile defense: detect threats + launch interceptors
      const radarSnap = radarSimulation.getSnapshot();
      const missileSnaps = missileFlights.getSnapshots();
      // When defenseTargetOwn is false, only process enemy missiles (not ours)
      const defenseMissiles = defenseTargetOwn
        ? missileSnaps
        : missileSnaps.filter((m) => m.launchSite && m.launchSite.countryIso3 !== activeCountryIso3);
      missileDefenseSim.step({
        missileSnapshots: defenseMissiles,
        radarSnapshot: radarSnap,
        deltaSeconds: stepSeconds,
      });

      // Process intercept kills
      const defenseSnap = missileDefenseSim.getSnapshot();
      for (const intc of defenseSnap.interceptors) {
        if (intc.result === 'kill') {
          defenseOverlay.spawnExplosion(intc.position);
          missileFlights.destroyMissile(intc.targetMissileId);
          notifications.success(`INTERCEPT: ${intc.type.toUpperCase()} destroyed incoming ICBM`, 'intercept-kill');
        } else if (intc.result === 'miss') {
          defenseOverlay.spawnExplosion(intc.position);
          notifications.warn(`MISS: ${intc.type.toUpperCase()} interceptor self-destructed`, 'intercept-miss');
        }
      }

      // Detect missile ground impacts — spawn ground explosion + damage report
      for (const snap of missileSnaps) {
        if (snap.phase !== 'impact') continue;
        if (impactedMissileIds.has(snap.id)) continue;
        impactedMissileIds.add(snap.id);

        // Spawn warhead-specific ground impact explosion
        if (snap.position) {
          defenseOverlay.spawnGroundImpact(snap.position, snap.warheadId ?? 'nuclear_300kt');
        }

        // Compute damage report if city data is loaded
        if (damageSimulation.isReady() && snap.impactPoint) {
          const report = damageSimulation.assessImpact({
            impactPoint: snap.impactPoint,
            warheadId: snap.warheadId ?? 'nuclear_300kt',
            missileId: snap.id,
          });
          showDamageReport(report);
        }
      }

      // Launch detection alerts — notify when a new enemy launch is first detected
      for (const threat of defenseSnap.threats) {
        if (threat.status === 'undetected') continue;
        if (notifiedThreatIds.has(threat.missileId)) continue;
        notifiedThreatIds.add(threat.missileId);

        const missile = missileSnaps.find((m) => m.id === threat.missileId);
        if (!missile || missile.launchSite?.countryIso3 === activeCountryIso3) continue;

        const origin = missile.launchSite?.countryIso3 ?? 'UNKNOWN';
        const sensor = threat.status === 'satellite-tracked' ? 'SBIRS SATELLITE' : 'GROUND RADAR';
        const missileId = threat.missileId;

        notifications.push({
          text: `LAUNCH DETECTED: ${origin} ICBM launch detected by ${sensor}`,
          type: 'alert',
          duration: 30000,
          group: `launch-detect-${origin}`,
          actions: [{
            label: 'View',
            onClick: () => {
              const m = missileFlights.getSnapshots().find((s) => s.id === missileId && s.active);
              if (m) {
                startTracking('icbm', missileId);
                requestRender();
              }
            },
          }],
        });
      }

      // Evaluate victory/defeat conditions
      if (victoryEvaluator) {
        const result = victoryEvaluator.evaluate();
        if (result.status !== 'ongoing') {
          sessionStore.setGameOver(result.status, result.reason);
          victoryEvaluator = null;
          accumulated = 0;
          break;
        }
      }

      accumulated -= simulationConfig.fixedTimeStep;
    }

    // Update clock display
    if (clockTimeEl) {
      clockTimeEl.textContent = gameClock.getFormattedTime();
    }
    if (clockDateEl) {
      clockDateEl.textContent = gameClock.getFormattedDate();
    }

    // Update resource panel
    if (resourcePanel && activeCountryIso3 && oilSimulation.isLoaded()) {
      resourcePanel.hidden = false;
      const s = oilSimulation.getCountryState(activeCountryIso3);
      if (s) {
        // Military fuel (top row — what the player actually spends)
        resourceMilFuel.textContent = formatBarrels(s.militaryFuel);
        resourceMilRate.textContent = `+${formatBpd(s.militaryDailyAllocation)} alloc/day`;
        const milPct = s.militaryCapacity > 0
          ? Math.round((s.militaryFuel / s.militaryCapacity) * 100) : 0;
        resourceMilBar.style.width = `${milPct}%`;

        // National SPR (bottom row — background economy)
        resourceOilReserves.textContent = formatBarrels(s.nationalReserves);
        const sprPct = s.nationalCapacity > 0
          ? Math.round((s.nationalReserves / s.nationalCapacity) * 100) : 0;
        resourceOilRate.textContent = `SPR ${sprPct}%`;
        resourceOilBar.style.width = `${sprPct}%`;
      }
    } else if (resourcePanel) {
      resourcePanel.hidden = true;
    }

    // Update petroleum summary label
    if (petroleumSummaryLabel && activeCountryIso3 && oilSimulation.isLoaded()) {
      const ps = oilSimulation.getCountryState(activeCountryIso3);
      if (ps) {
        petroleumSummaryLabel.textContent = formatBarrels(ps.militaryFuel);
      }
    }

    celestialSystem.updateVisuals({
      deltaSeconds,
      elapsedSeconds: clock.elapsedTime,
      camera: sceneContext.camera,
      controls: sceneContext.controls,
      sunLight: environment.sunLight,
      simulationConfig: effectiveSimulationConfig,
      renderConfig,
      worldConfig,
    });

    const missileSnapshots = missileFlights.getSnapshots();

    // Fog of war: only show enemy missiles that have been detected.
    // Own missiles (launched by the player) are always visible.
    // In god view, everything is visible.
    const defenseState = missileDefenseSim.getSnapshot();
    const detectedMissileIds = new Set(
      defenseState.threats
        .filter((t) => t.status !== 'undetected')
        .map((t) => t.missileId),
    );
    const visibleMissileSnapshots = godView
      ? missileSnapshots
      : missileSnapshots.filter((m) => {
          // Own missiles are always visible
          if (m.launchSite?.countryIso3 === activeCountryIso3) return true;
          // Enemy missiles only if detected by satellite or radar
          return detectedMissileIds.has(m.id);
        });

    const primaryMissile = missileFlights.getPrimarySnapshot(visibleMissileSnapshots);

    celestialSystem.updateMissiles(
      visibleMissileSnapshots,
      deltaSeconds,
      clock.elapsedTime,
      sceneContext.camera,
      activeCountryIso3,
    );
    const altitudeKm = celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls);
    celestialSystem.updateNavalUnits(navalSimulation.getSnapshot(), sceneContext.camera, altitudeKm);

    // Assemble naval route data for visualization
    const navalRoutes = [];
    for (const fleet of navalSimulation.getFleets()) {
      const remaining = navalSimulation.getFleetRoute(fleet.id);
      if (remaining.length > 0) {
        navalRoutes.push({
          id: fleet.id,
          waypoints: remaining,
          fleetLat: fleet.lat,
          fleetLon: fleet.lon,
          pending: false,
        });
      }
    }
    if (pendingRoute && selectedFleetId) {
      navalRoutes.push({
        id: `pending_${selectedFleetId}`,
        waypoints: pendingRoute,
        pending: true,
      });
    }
    celestialSystem.updateNavalRoutes(navalRoutes);

    // Assemble air route data for visualization
    const airRoutes = airSimulation.getMissionRoutes();
    if (pendingAirRoute && pendingAirHomeBase) {
      // Build leg indices for the pending combat route so it's color-coded by leg
      const plan = pendingMissionPlan;
      let legIndices = null;
      if (plan && plan.refuelDistances && plan.refuelDistances.length > 0) {
        legIndices = buildPendingLegIndices(pendingAirRoute, plan);
      }

      airRoutes.push({
        id: 'pending_air_mission',
        waypoints: pendingAirRoute.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
        legIndices,
        squadronLat: pendingAirHomeBase.latitude,
        squadronLon: pendingAirHomeBase.longitude,
        pending: true,
        isTanker: false,
        refuelStops: plan ? plan.refuelStops : [],
      });

      // Pending tanker routes — show where each tanker will fly
      if (plan && plan.tankerAssignments) {
        for (let ti = 0; ti < plan.tankerAssignments.length; ti++) {
          const ta = plan.tankerAssignments[ti];
          // Primary tankers with a relay stop show: base → relay → refuel → return
          // All others show: base → refuel → return
          const waypoints = [{ lat: ta.baseLat, lon: ta.baseLon }];
          if (ta.needsRelayAt) {
            waypoints.push({ lat: ta.needsRelayAt.lat, lon: ta.needsRelayAt.lon });
          }
          waypoints.push({ lat: ta.refuelPoint.lat, lon: ta.refuelPoint.lon });
          waypoints.push({ lat: ta.returnLat, lon: ta.returnLon });

          airRoutes.push({
            id: `pending_tanker_${ti}`,
            waypoints,
            squadronLat: ta.baseLat,
            squadronLon: ta.baseLon,
            pending: true,
            isTanker: true,
            tankerPhase: ta.isRelay ? 'loitering' : 'outbound',
          });
        }
      }
    }
    celestialSystem.updateAirRoutes(airRoutes);

    const visibleRadarSnapshot = getVisibleRadarSnapshot();
    radarVisualSystem.update(visibleRadarSnapshot, sceneContext.camera, clock.elapsedTime);

    // Defense overlay: icons, detection lines, interceptor missiles
    if (viewController.isEnabled('defense')) {
      const defSnap = missileDefenseSim.getSnapshot();
      defenseOverlay.render({
        radarSnapshot: visibleRadarSnapshot,
        defenseSnapshot: defSnap,
        missileSnapshots,
        elapsedSeconds: clock.elapsedTime,
      });
    }

    // Info card: show real-time data for tracked object
    const defSnap2 = missileDefenseSim.getSnapshot();
    const allFleets = navalSimulation.getFleets();
    const allMissions = airSimulation.getActiveMissions();
    hud.render({
      missileSnapshots: visibleMissileSnapshots,
      defenseSnapshot: defSnap2,
      fleets: allFleets,
      squadrons: allMissions,
    });

    // Camera follow tracked object — move the controls target, keep camera-to-target offset
    const tracked = hud.getTracked();
    if (tracked) {
      let followPos = null;
      if (tracked.type === 'icbm') {
        // Only follow if the missile is still VISIBLE (detected or own)
        const m = visibleMissileSnapshots.find((s) => s.id === tracked.id && s.active);
        if (m?.position) {
          followPos = m.position;
        } else {
          // Missile lost detection — stop tracking
          stopTracking();
          notifications.warn('TRACK LOST: Target ICBM no longer detected');
        }
      } else if (tracked.type === 'interceptor') {
        const i = defSnap2.interceptors.find((x) => x.id === tracked.id && x.phase !== 'complete');
        if (i?.position) followPos = i.position;
      } else if (tracked.type === 'fleet') {
        const f = allFleets.find((fl) => fl.id === tracked.id);
        if (f) {
          followPos = latLonToWorld(f.lat, f.lon);
        }
      } else if (tracked.type === 'squadron') {
        // Could be a mission ID or a tanker ID — check both
        const sq = allMissions.find((m) => m.id === tracked.id);
        if (sq) {
          followPos = latLonToWorld(sq.lat, sq.lon);
        } else {
          // Search tanker flights across all missions
          for (const m of allMissions) {
            const tf = m.tankerFlights?.find((t) => t.id === tracked.id && t.phase !== 'landed');
            if (tf) {
              followPos = latLonToWorld(tf.lat, tf.lon);
              break;
            }
          }
        }
      } else if (tracked.type === 'oilfield') {
        const field = missileOverlay.pickOilFieldByName(tracked.id);
        if (field) {
          followPos = latLonToWorld(field.lat, field.lon);
        }
      } else if (tracked.type === 'reserve') {
        const fac = oilSimulation.getReserveFacilities().find((f) => f.id === tracked.id);
        if (fac) {
          followPos = latLonToWorld(fac.lat, fac.lon);
        }
      } else if (tracked.type === 'port') {
        const port = tradeSimulation.getPortById(tracked.id);
        if (port) {
          followPos = latLonToWorld(port.lat, port.lon);
        }
      }
      if (followPos) {
        sceneContext.controls.minDistance = 0.3;

        if (hud.consumeInitialZoom()) {
          // First frame: snap close to the object
          const radial = followPos.clone().normalize();
          const camOffset = radial.clone().multiplyScalar(1.0);
          sceneContext.controls.target.copy(followPos);
          sceneContext.camera.position.copy(followPos).add(camOffset);
          lastFollowPos = followPos.clone();
        } else if (lastFollowPos) {
          // Apply the object's movement delta to both target and camera.
          // This preserves the user's orbit angle perfectly — no jitter.
          const delta = followPos.clone().sub(lastFollowPos);
          sceneContext.controls.target.add(delta);
          sceneContext.camera.position.add(delta);
          lastFollowPos.copy(followPos);
        } else {
          lastFollowPos = followPos.clone();
        }
        sceneContext.controls.update();
      }
    }

    sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
    missileOverlay.render({
      altitudeKm,
      selection,
      flights: visibleMissileSnapshots,
      radar: buildRadarOverlayState(visibleRadarSnapshot),
      showFlightMarkers: viewController.isEnabled('launch'),
      playerCountry: activeCountryIso3,
      pendingReserve: placingReserve ? pendingReserveTarget : null,
      missileTypeLabel: getMissileType(selectedMissileType)?.label ?? null,
      warheadLabel: getWarheadType(selectedWarheadId)?.label ?? null,
    });
    countryBorders.render({ altitudeKm });
    cityLabels.render({ altitudeKm });

    // Fleet icons only when zoomed out (3D models hidden above 800km)
    if (altitudeKm >= 800) {
      const fleets = navalSimulation.getFleets().map((f) => ({
        lat: f.lat,
        lon: f.lon,
        name: f.name,
        shipCount: f.ships.filter((s) => !s.sunk).length,
      }));
      fleetOverlay.render({ fleets, elapsedTime: clock.elapsedTime });

      // Zoomed out — show package icons per mission + tanker icons
      const airOverlayItems = [];
      for (const m of airSimulation.getActiveMissions()) {
        airOverlayItems.push({
          id: m.id,
          lat: m.lat,
          lon: m.lon,
          heading: m.heading,
          name: m.name,
          aircraftCount: m.aircraft.filter((a) => !a.destroyed).length,
          isTanker: false,
        });
        for (const tf of m.tankerFlights) {
          if (tf.phase === 'landed') {
            continue;
          }
          airOverlayItems.push({
            id: tf.id,
            lat: tf.lat,
            lon: tf.lon,
            heading: tf.heading,
            name: `KC-135 (${tf.baseName})`,
            aircraftCount: 1,
            isTanker: true,
          });
        }
      }
      const selectedTrails = selectedSquadronId
        ? airSimulation.getMissionHistory(selectedSquadronId)
        : null;
      squadronOverlay.render({
        squadrons: airOverlayItems,
        elapsedTime: clock.elapsedTime,
        trails: selectedTrails,
        sunLightPosition: environment.sunLight.position,
      });
    } else {
      fleetOverlay.render({ fleets: [], elapsedTime: 0 });

      // Zoomed in — show individual aircraft SVGs with heading
      const selectedTrailsZoomed = selectedSquadronId
        ? airSimulation.getMissionHistory(selectedSquadronId)
        : null;
      squadronOverlay.renderAircraft({
        aircraftSnapshots: airSimulation.getSnapshot(),
        elapsedTime: clock.elapsedTime,
        trails: selectedTrailsZoomed,
        sunLightPosition: environment.sunLight.position,
      });
    }

    // Trade overlay — shipping lanes, cargo ships, ports
    if (viewController.isEnabled('trade') && tradeSimulation.isLoaded()) {
      tradeOverlay.render({
        routes: tradeSimulation.getRoutes(),
        cargoShips: tradeSimulation.getCargoShipSnapshots(),
        ports: tradeSimulation.getPorts(),
        elapsedTime: clock.elapsedTime,
        pendingPort: placingPort ? pendingPortTarget : null,
      });
    } else {
      tradeOverlay.render({ routes: [], cargoShips: [], ports: [], elapsedTime: 0, pendingPort: placingPort ? pendingPortTarget : null });
    }

    // Only update floating screen positions when NOT embedded in the info card
    if (!hud.getTracked()) {
      fleetBuilder.updateScreenPosition({
        camera: sceneContext.camera,
        renderer: sceneContext.renderer,
        earthGroup: celestialSystem.groups.earth,
        worldConfig,
      });
      fleetAction.updateScreenPosition({
        camera: sceneContext.camera,
        renderer: sceneContext.renderer,
        earthGroup: celestialSystem.groups.earth,
        worldConfig,
      });
      squadronBuilder.updateScreenPosition({
        camera: sceneContext.camera,
        renderer: sceneContext.renderer,
        earthGroup: celestialSystem.groups.earth,
        worldConfig,
      });
      squadronAction.updateScreenPosition({
        camera: sceneContext.camera,
        renderer: sceneContext.renderer,
        earthGroup: celestialSystem.groups.earth,
        worldConfig,
      });
    }

    if (running) {
      requestRender();
    }
  }

  requestRender = function requestRenderImpl() {
    if (rafId !== null) {
      return;
    }
    rafId = window.requestAnimationFrame(renderFrame);
  };

  function handleResize() {
    sceneContext.resize(window.innerWidth, window.innerHeight);
    requestRender();
  }

  function handlePointerDown(event) {
    const session = sessionStore.getSnapshot();
    if (!session.started || session.paused) {
      return;
    }

    if (radarMode === 'ground') {
      if (!activeCountryIso3) {
        return;
      }
      const target = getTargetFromPointer(event);
      if (!target) {
        return;
      }
      radarSelection.groundTarget = {
        ...target,
        label: formatTargetLabel(target),
      };
      requestRender();
      return;
    }

    if (radarMode === 'interceptor') {
      if (!activeCountryIso3) {
        return;
      }
      const target = getTargetFromPointer(event);
      if (!target) {
        return;
      }
      radarSelection.groundTarget = {
        ...target,
        label: formatTargetLabel(target),
      };
      requestRender();
      return;
    }

    if (radarMode === 'satellite') {
      if (!activeCountryIso3) {
        return;
      }
      // Try picking a satellite first
      const pickedSatId = pickSatelliteFromPointer(event);
      if (pickedSatId) {
        const currentSelected = radarVisualSystem.getSelectedSatelliteId();
        radarVisualSystem.setSelectedSatellite(currentSelected === pickedSatId ? null : pickedSatId);
        requestRender();
        return;
      }
      const slot = pickGeoSlotFromPointer(event);
      if (!slot) {
        // Click on empty space deselects satellite
        radarVisualSystem.setSelectedSatellite(null);
        requestRender();
        return;
      }
      radarSelection.satelliteSlot = slot;
      radarVisualSystem.setSelectedGeoSlot(slot.id);
      orbitPlanner.setLaunchEnabled(true);
      requestRender();
      return;
    }

    // When tracking an object, block all picking — only Escape / close button exits
    if (hud.getTracked()) {
      return;
    }

    // Try interceptor selection
    {
      const pickedIntcId = pickInterceptorFromPointer(event);
      if (pickedIntcId) {
        startTracking('interceptor', pickedIntcId);
        defenseOverlay.setSelectedInterceptor(pickedIntcId);
        requestRender();
        return;
      }
    }

    // Try ICBM selection
    {
      const raycaster = new THREE.Raycaster();
      const rect = sceneContext.renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, sceneContext.camera);
      const pickedMissileId = celestialSystem.pickMissile(raycaster);
      if (pickedMissileId) {
        startTracking('icbm', pickedMissileId);
        requestRender();
        return;
      }
    }

    // Try satellite selection outside radar mode too
    {
      const pickedSatId = pickSatelliteFromPointer(event);
      if (pickedSatId) {
        const currentSelected = radarVisualSystem.getSelectedSatelliteId();
        radarVisualSystem.setSelectedSatellite(currentSelected === pickedSatId ? null : pickedSatId);
        defenseOverlay.setSelectedInterceptor(null);
        requestRender();
      }
    }
    // Note: interceptor selection persists through camera orbit — only cleared by
    // clicking another object or pressing Escape

    const currentMode = missileOverlay.getMode();

    // Naval & Air interactions — always available when no missile/radar mode is active
    if (currentMode === 'idle' && radarMode === 'off') {
      // If awaiting naval destination, ocean click sets the pending route
      if (awaitingDestination && selectedFleetId && oceanNavGrid) {
        const target = getTargetFromPointer(event);
        if (target) {
          const fleet = navalSimulation.getFleets().find((f) => f.id === selectedFleetId);
          if (fleet) {
            const path = oceanNavGrid.findPath(fleet.lat, fleet.lon, target.lat, target.lon);
            if (path.length > 0) {
              pendingRoute = path;
              fleetAction.showConfirm();
              showNavalHint('Route set \u2014 click Confirm or press Enter');
            }
          }
        }
        requestRender();
        return;
      }

      // If awaiting air destination, click must be on a friendly air base
      if (awaitingAirDestination && pendingAircraft && pendingAirHomeBase) {
        const isCarrierMission = pendingAirHomeBase.category === 'carrier';

        // Carrier missions: click anywhere on the globe as destination
        // Land-based missions: must click on a friendly air base
        let destLat = null;
        let destLon = null;
        let destName = null;

        if (isCarrierMission) {
          const target = getTargetFromPointer(event);
          if (target) {
            destLat = target.lat;
            destLon = target.lon;
            destName = `${target.lat.toFixed(1)}°, ${target.lon.toFixed(1)}°`;
          }
        } else {
          const site = missileOverlay.pickLaunchSite(event.clientX, event.clientY);
          const alliedCountries = filterAlliedBases([site].filter(Boolean), activeCountryIso3);
          if (site && site.category === 'airbase' && alliedCountries.length > 0) {
            // Don't route to the same base
            if (Math.abs(site.latitude - pendingAirHomeBase.latitude) < 0.01 &&
                Math.abs(site.longitude - pendingAirHomeBase.longitude) < 0.01) {
              showAirHint('Select a different air base as destination');
              requestRender();
              return;
            }
            destLat = site.latitude;
            destLon = site.longitude;
            destName = site.name ?? 'Destination';
          }
        }

        if (destLat !== null) {
          const allBases = installationStore
            .getSites()
            .filter((s) => s.category === 'airbase')
            .map((s) => ({ lat: s.latitude, lon: s.longitude, name: s.name, category: s.category, countryIso3: s.countryIso3 }));
          const friendlyBases = filterAlliedBases(allBases, activeCountryIso3);

          const aircraftTypes = pendingAircraft.map((a) => a.type);
          const routePlan = airSimulation.planRoute({
            homeLat: pendingAirHomeBase.latitude,
            homeLon: pendingAirHomeBase.longitude,
            homeName: pendingAirHomeBase.name,
            destLat,
            destLon,
            aircraftTypes,
            friendlyBases,
            playerCountry: activeCountryIso3,
          });

          if (routePlan.viable) {
            pendingMissionPlan = routePlan;
            pendingAirRoute = routePlan.waypoints;
            squadronAction.openRoutePlan({
              baseName: pendingAirHomeBase.name ?? 'Base',
              destName,
              routePlan,
            });
            showAirHint('Route planned \u2014 click Confirm or press Enter');
          } else {
            pendingMissionPlan = null;
            pendingAirRoute = null;
            squadronAction.showNotViable(routePlan.reason);
            showAirHint(`Route not viable: ${routePlan.reason}`);
          }
        } else if (!isCarrierMission) {
          showAirHint('Click on a friendly air base as destination');
        }
        requestRender();
        return;
      }

      // Reserve placement mode — click stages location, Enter confirms
      if (placingReserve && activeCountryIso3) {
        const target = getTargetFromPointer(event);
        if (target) {
          pendingReserveTarget = target;
          requestRender();
          return;
        }
      }

      // Port placement mode — click stages coastal location
      if (placingPort && activeCountryIso3) {
        const target = getTargetFromPointer(event);
        if (target) {
          if (!tradeSimulation.isCoastal(target.lat, target.lon)) {
            notifications.warn('Port must be placed on or near the coast.');
          } else {
            pendingPortTarget = target;
            requestRender();
          }
          return;
        }
      }

      // Check if clicking on a port (trade overlay)
      if (viewController.isEnabled('trade')) {
        const pickedPort = tradeOverlay.pickPort(event.clientX, event.clientY);
        if (pickedPort) {
          startTracking('port', pickedPort.id);
          requestRender();
          return;
        }
      }

      // Check if clicking on an oil field or reserve facility
      const pickedOil = missileOverlay.pickOilField(event.clientX, event.clientY);
      if (pickedOil) {
        if (pickedOil.type === 'facility') {
          startTracking('reserve', pickedOil.data.id);
        } else {
          startTracking('oilfield', pickedOil.data.name);
        }
        requestRender();
        return;
      }

      // Check if clicking on a base belonging to active country
      const site = missileOverlay.pickLaunchSite(event.clientX, event.clientY);
      if (site && site.countryIso3 === activeCountryIso3) {
        if (site.category === 'naval') {
          closeAllPopups();
          fleetBuilder.open(site);
          requestRender();
          return;
        }
        if (site.category === 'airbase') {
          closeAllPopups();
          squadronBuilder.open(site);
          requestRender();
          return;
        }
      }

      // Check if clicking on a deployed fleet/ship or squadron/aircraft
      const currentAlt = celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls);
      let pickedFleet = null;
      let pickedSquadron = null;

      if (currentAlt >= 800) {
        // Zoomed out — hit-test 2D icons (check both fleets and squadrons)
        const allFleets = navalSimulation.getFleets();
        const iconFleets = allFleets.map((f) => ({ lat: f.lat, lon: f.lon, id: f.id }));
        const hitFleet = fleetOverlay.pickFleet(event.clientX, event.clientY, iconFleets);
        if (hitFleet) {
          pickedFleet = allFleets.find((f) => f.id === hitFleet.id);
        }

        if (!pickedFleet) {
          // Build clickable items: missions + active tanker flights
          const allMissions = airSimulation.getActiveMissions();
          const clickableAirItems = [];
          for (const m of allMissions) {
            clickableAirItems.push({ lat: m.lat, lon: m.lon, id: m.id });
            for (const tf of m.tankerFlights) {
              if (tf.phase !== 'landed') {
                clickableAirItems.push({ lat: tf.lat, lon: tf.lon, id: tf.id, parentMissionId: m.id });
              }
            }
          }
          const hitSq = squadronOverlay.pickSquadron(event.clientX, event.clientY, clickableAirItems);
          if (hitSq) {
            // If it's a tanker, find its parent mission
            const parentId = hitSq.parentMissionId || hitSq.id;
            pickedSquadron = allMissions.find((m) => m.id === parentId);
            // Store the clicked ID (mission or tanker) for trail display
            if (pickedSquadron) {
              selectedSquadronId = hitSq.id;
            }
          }
        }
      } else {
        // Zoomed in — raycast against 3D naval models
        const raycaster = new THREE.Raycaster();
        const canvasRect = sceneContext.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((event.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
          -((event.clientY - canvasRect.top) / canvasRect.height) * 2 + 1,
        );
        raycaster.setFromCamera(mouse, sceneContext.camera);

        const pickedShipId = celestialSystem.pickNavalUnit(raycaster);
        if (pickedShipId) {
          pickedFleet = navalSimulation.getFleetByShipId(pickedShipId);
        }

        // Aircraft picking — 2D overlay hit-test on individual plane icons
        if (!pickedFleet) {
          const acSnapshots = airSimulation.getSnapshot();
          const hitAc = squadronOverlay.pickAircraft(event.clientX, event.clientY, acSnapshots);
          if (hitAc) {
            const found = airSimulation.findByAircraftId(hitAc.id);
            if (found) {
              pickedSquadron = found.data;
              // Store the clicked aircraft/tanker ID for trail display
              selectedSquadronId = hitAc.role === 'tanker' ? hitAc.id : found.data.id;
            }
          }
        }
      }

      if (pickedFleet) {
        closeAllPopups();
        selectedFleetId = pickedFleet.id;
        startTracking('fleet', pickedFleet.id);
        fleetAction.open(pickedFleet);
        // Re-embed after open since startTracking runs before the panel is shown
        embedActionPanels();
        requestRender();
        return;
      }

      if (pickedSquadron) {
        const clickedId = selectedSquadronId || pickedSquadron.id;
        closeAllPopups();
        selectedSquadronId = clickedId;
        // Track the actual clicked object — if a tanker was clicked, track it directly
        startTracking('squadron', clickedId);
        squadronAction.openSquadronInfo(pickedSquadron);
        embedActionPanels();
        requestRender();
        return;
      }

      // Clicking empty space — close any open popup
      if (fleetBuilder.isOpen() || fleetAction.isOpen() ||
          squadronBuilder.isOpen() || squadronAction.isOpen()) {
        closeAllPopups();
        requestRender();
        return;
      }
    }

    if (viewController.isEnabled('bases') && currentMode === 'idle') {
      const site = missileOverlay.pickLaunchSite(event.clientX, event.clientY);
      missileOverlay.setSelectedBase(site ?? null);
      requestRender();
      if (site) {
        return;
      }
    }

    // Manual mode: pick a silo (silos only)
    if (currentMode === 'selectLaunch') {
      const site = missileOverlay.pickLaunchSite(event.clientX, event.clientY);
      if (!site) {
        return;
      }
      if (site.countryIso3 !== installationStore.getActiveCountry()) {
        return;
      }
      if (site.category !== 'silo') {
        return;
      }
      selection.launchSite = site;
      selection.target = null;
      missileOverlay.setMode('selectTarget');
      chrome.setMissileState({ mode: 'selectTarget' });
      requestRender();
      return;
    }

    // Manual mode: pick a target — stage it, don't fire
    if (currentMode === 'selectTarget' && selection.launchSite) {
      const target = getTargetFromPointer(event);
      if (!target) {
        return;
      }
      selection.target = { ...target, label: formatTargetLabel(target) };
      missileOverlay.setMode('confirm');
      chrome.setMissileState({ mode: 'confirm' });
      requestRender();
      return;
    }

    // Confirm mode (manual): click changes target
    if (currentMode === 'confirm') {
      const target = getTargetFromPointer(event);
      if (target) {
        selection.target = { ...target, label: formatTargetLabel(target) };
        requestRender();
      }
      return;
    }

    // Strike mode: each click places one target (up to warhead count)
    if (currentMode === 'strike' || currentMode === 'strikeConfirm') {
      const target = getTargetFromPointer(event);
      if (!target) {
        return;
      }
      const maxTargets = missileOverlay.getStrikeCount();
      const labeled = { ...target, label: formatTargetLabel(target) };

      if (selection.targets.length < maxTargets) {
        selection.targets.push(labeled);
      } else {
        // All slots filled — replace the last one
        selection.targets[selection.targets.length - 1] = labeled;
      }

      // Keep selection.target pointing at the latest for the overlay
      selection.target = labeled;

      const allPlaced = selection.targets.length >= maxTargets;
      const nextMode = allPlaced ? 'strikeConfirm' : 'strike';
      missileOverlay.setMode(nextMode);
      syncStrikeChrome(nextMode);
      requestRender();
      return;
    }
  }

  function syncStrikeChrome(mode) {
    chrome.setMissileState({
      mode,
      category: installationStore.getActiveCategory(),
      warheadCount: missileOverlay.getStrikeCount(),
      targetsPlaced: selection.targets.length,
    });
  }

  function getLaunchCategories(missileTypeId) {
    const missileType = getMissileType(missileTypeId);
    if (!missileType) return ['silo'];
    const platformToCategory = {
      silo: 'silo',
      airbase: 'airbase',
      naval: 'naval',
    };
    return missileType.launchPlatforms.map((p) => platformToCategory[p]).filter(Boolean);
  }

  function findLaunchSite(country, categories, targetLat, targetLon) {
    const sites = installationStore.selectLaunchSites({
      iso3: country, targetLat, targetLon, count: 1, categories,
    });
    if (sites.length > 0) return sites[0];

    // Fallback: try naval fleets for ship-launched missiles
    if (categories.includes('naval')) {
      const fleets = navalSimulation.getFleets().filter((f) =>
        f.countryIso3 === country || !f.countryIso3,
      );
      if (fleets.length > 0) {
        let bestFleet = fleets[0];
        let bestDist = Infinity;
        for (const fleet of fleets) {
          const d = haversineDistanceKm(
            { lat: fleet.lat, lon: fleet.lon },
            { lat: targetLat, lon: targetLon },
          );
          if (d < bestDist) { bestDist = d; bestFleet = fleet; }
        }
        return {
          id: `fleet_${bestFleet.id}`,
          name: bestFleet.name ?? `Fleet ${bestFleet.id}`,
          latitude: bestFleet.lat,
          longitude: bestFleet.lon,
          category: 'naval',
          countryIso3: country,
        };
      }
    }
    return null;
  }

  function validateRange(launchSite, target, missileTypeData) {
    const dist = haversineDistanceKm(
      { lat: launchSite.latitude, lon: launchSite.longitude },
      { lat: target.lat, lon: target.lon },
    );
    if (dist > missileTypeData.maxRangeKm) {
      notifications.warn(`Target out of range for ${missileTypeData.label}: ${Math.round(dist)} km (max ${missileTypeData.maxRangeKm} km)`);
      return false;
    }
    if (dist < (missileTypeData.minRangeKm ?? 0)) {
      notifications.warn(`Target too close for ${missileTypeData.label}: ${Math.round(dist)} km (min ${missileTypeData.minRangeKm} km)`);
      return false;
    }
    return true;
  }

  function executeStrike() {
    if (selection.targets.length === 0) return;

    const country = installationStore.getActiveCountry();
    const categories = getLaunchCategories(selectedMissileType);
    const missileTypeData = getMissileType(selectedMissileType);
    const isICBM = selectedMissileType === 'icbm';
    const rvPerMissile = isICBM ? 3 : 1; // Minuteman III carries 3 MIRVs

    // For ICBMs: group targets into batches of rvPerMissile for MIRV
    // For other types: one missile per target
    const targetBatches = [];
    if (isICBM && selection.targets.length > 1) {
      for (let i = 0; i < selection.targets.length; i += rvPerMissile) {
        targetBatches.push(selection.targets.slice(i, i + rvPerMissile));
      }
    } else {
      for (const t of selection.targets) {
        targetBatches.push([t]);
      }
    }

    let launchIndex = 0;
    for (const batch of targetBatches) {
      const primaryTarget = batch[0];
      const launchSite = findLaunchSite(country, categories, primaryTarget.lat, primaryTarget.lon);

      if (!launchSite) {
        notifications.warn(`No ${categories.join('/')} launch site available for ${missileTypeData?.label ?? 'missile'}`);
        continue;
      }

      if (missileTypeData && !validateRange(launchSite, primaryTarget, missileTypeData)) {
        continue;
      }

      installationStore.markSiloSpent(launchSite.id);
      const labeledTarget = { ...primaryTarget, label: primaryTarget.label ?? formatTargetLabel(primaryTarget) };

      // MIRV targets: all targets in this batch (for ICBM with >1 target)
      const mirvTargets = batch.length > 1
        ? batch.map((t) => ({ ...t, label: t.label ?? formatTargetLabel(t) }))
        : null;

      const delay = launchIndex * STRIKE_LAUNCH_STAGGER_MS;
      const typeId = selectedMissileType;
      const whId = selectedWarheadId;
      const site = launchSite;

      const doLaunch = () => {
        missileFlights.launch({
          launchSite: site,
          target: labeledTarget,
          missileTypeId: typeId,
          warheadId: whId,
          mirvTargets,
        });
      };

      if (delay === 0) {
        doLaunch();
      } else {
        setTimeout(() => { doLaunch(); requestRender(); }, delay);
      }

      if (mirvTargets) {
        notifications.info(`MIRV: ${batch.length} RVs assigned to ICBM from ${site.name}`);
      }

      launchIndex += 1;
    }

    const warheadCount = missileOverlay.getStrikeCount();
    const available = installationStore.getAvailableSiteCount(country, categories);
    missileOverlay.setStrikeCount(Math.min(warheadCount, Math.max(available, 1)));
    selection.targets = [];
    missileOverlay.setMode('strike');
    syncStrikeChrome('strike');
  }

  function executeManualLaunch() {
    if (!selection.launchSite || !selection.target) {
      return;
    }
    if (selection.launchSite.category !== 'silo') {
      return;
    }
    installationStore.markSiloSpent(selection.launchSite.id);
    launchSingleMissile({
      launchSite: selection.launchSite,
      target: selection.target,
      missileTypeId: selectedMissileType,
      warheadId: selectedWarheadId,
    });
    selection.launchSite = null;
    missileOverlay.setMode('selectLaunch');
    chrome.setMissileState({ mode: 'selectLaunch' });
    requestRender();
  }

  function handleKeydown(event) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (devMode && event.code === 'Numpad9') {
      sessionStore.toggleGodView();
      return;
    }

    const key = event.key.toLowerCase();
    const session = sessionStore.getSnapshot();

    if (key === 'escape') {
      if (!session.started) {
        return;
      }
      // Cancel reserve placement
      if (placingReserve) {
        placingReserve = false;
        pendingReserveTarget = null;
        notifications.info('Reserve placement cancelled');
        requestRender();
        return;
      }
      // Cancel port placement
      if (placingPort) {
        placingPort = false;
        pendingPortTarget = null;
        notifications.info('Port placement cancelled');
        requestRender();
        return;
      }
      // Clear tracked object first — restores camera
      if (hud.getTracked()) {
        stopTracking();
        return;
      }
      // Clear interceptor / satellite selection
      if (defenseOverlay.getSelectedInterceptorId() || radarVisualSystem.getSelectedSatelliteId()) {
        defenseOverlay.setSelectedInterceptor(null);
        radarVisualSystem.setSelectedSatellite(null);
        requestRender();
        return;
      }
      // Close naval/air popups first if open
      if (fleetBuilder.isOpen() || fleetAction.isOpen() || awaitingDestination ||
          squadronBuilder.isOpen() || squadronAction.isOpen() || awaitingAirDestination) {
        closeAllPopups();
        requestRender();
        return;
      }
      if (session.paused) {
        sessionStore.resume();
      } else {
        sessionStore.openSettings();
      }
      return;
    }

    if (!session.started || session.paused) {
      return;
    }

    const currentMode = missileOverlay.getMode();
    const isStrike = currentMode === 'strike' || currentMode === 'strikeConfirm';

    if (key === 'm') {
      if (
        currentMode === 'idle' ||
        currentMode === 'selectLaunch' ||
        currentMode === 'selectTarget' ||
        currentMode === 'confirm'
      ) {
        enterStrikeMode();
      } else if (isStrike) {
        exitStrikeMode();
      }
    } else if (key === 'r') {
      toggleRadarMode();
    } else if (key === 'enter') {
      if (placingReserve && pendingReserveTarget && activeCountryIso3) {
        oilSimulation.placeReserveFacility({
          countryIso3: activeCountryIso3,
          lat: pendingReserveTarget.lat,
          lon: pendingReserveTarget.lon,
        });
        placingReserve = false;
        pendingReserveTarget = null;
        notifications.success('Strategic Oil Reserve placed');
        requestRender();
      } else if (placingPort && pendingPortTarget && activeCountryIso3) {
        tradeSimulation.placePort({
          countryIso3: activeCountryIso3,
          lat: pendingPortTarget.lat,
          lon: pendingPortTarget.lon,
        });
        placingPort = false;
        pendingPortTarget = null;
        // Auto-enable trade view so the player sees the result
        if (!viewController.isEnabled('trade')) {
          viewController.toggle('trade');
        }
        notifications.success('Oil Port placed — trade routes recalculating');
        requestRender();
      } else if (awaitingDestination && pendingRoute && selectedFleetId) {
        confirmNavalRoute();
      } else if (pendingMissionPlan && pendingAircraft && pendingAirHomeBase) {
        confirmAirRoute();
      } else if (radarMode === 'ground') {
        confirmGroundRadarPlacement();
      } else if (radarMode === 'satellite') {
        confirmSatelliteLaunch();
      } else if (radarMode === 'interceptor') {
        confirmInterceptorPlacement();
      } else if (currentMode === 'strikeConfirm') {
        executeStrike();
      } else if (currentMode === 'strike' && selection.targets.length > 0) {
        // Allow launching with fewer targets than warhead count
        executeStrike();
      } else if (currentMode === 'confirm') {
        executeManualLaunch();
      }
    } else if (key === 'backspace' && isStrike) {
      // Remove last placed target
      if (selection.targets.length > 0) {
        selection.targets.pop();
        selection.target = selection.targets.at(-1) ?? null;
        missileOverlay.setMode('strike');
        syncStrikeChrome('strike');
        requestRender();
      }
      event.preventDefault();
      const newCategory = installationStore.cycleCategory();
      chrome.setMissileState({ mode: currentMode, category: newCategory });
      requestRender();
    } else if ((key === '=' || key === '+') && isStrike) {
      missileOverlay.adjustStrikeCount(1);
      chrome.setWarheadCount(missileOverlay.getStrikeCount());
    } else if (key === '-' && isStrike) {
      missileOverlay.adjustStrikeCount(-1);
      // Trim targets if count was reduced below current targets
      trimTargetsToCount();
      chrome.setWarheadCount(missileOverlay.getStrikeCount());
    } else if (key === 'w' && isStrike) {
      // Cycle warhead type
      const warheads = getCompatibleWarheads(selectedMissileType);
      if (warheads.length > 1) {
        const currentIndex = warheads.findIndex((w) => w.id === selectedWarheadId);
        const nextIndex = (currentIndex + 1) % warheads.length;
        selectedWarheadId = warheads[nextIndex].id;
        chrome.setWarheadLabel(warheads[nextIndex].label);
        requestRender();
      }
    } else if (key === ']' && isStrike) {
      missileOverlay.adjustStrikeCount(10);
      chrome.setWarheadCount(missileOverlay.getStrikeCount());
    } else if (key === '[' && isStrike) {
      missileOverlay.adjustStrikeCount(-10);
      trimTargetsToCount();
      chrome.setWarheadCount(missileOverlay.getStrikeCount());
    } else if (key === '1') {
      toggleLaunchView();
    } else if (key === '2') {
      toggleRadarView();
    } else if (key === '3') {
      toggleNavalView();
    } else if (key === '4') {
      toggleBasesView();
    } else if (key === '5') {
      toggleContextView();
    } else if (key === '6') {
      toggleDefenseView();
    } else if (key === '7') {
      toggleEconomyView();
    } else if (key === '8') {
      toggleTradeView();
    } else if (key === '0') {
      sceneContext.resetView();
      requestRender();
    } else if (key === 'arrowright' || key === 'arrowleft') {
      // Cycle through trackable objects (ICBMs, interceptors)
      if (hud.getTracked()) {
        cycleTrackedObject(key === 'arrowright' ? 1 : -1);
      }
    }
  }

  function trimTargetsToCount() {
    const max = missileOverlay.getStrikeCount();
    if (selection.targets.length > max) {
      selection.targets.length = max;
      selection.target = selection.targets.at(-1) ?? null;
      requestRender();
    }
  }

  function handleWheel(event) {
    const session = sessionStore.getSnapshot();
    if (!session.started || session.paused) {
      return;
    }
    const currentMode = missileOverlay.getMode();
    if ((currentMode === 'strike' || currentMode === 'strikeConfirm') && event.shiftKey) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 1 : -1;
      missileOverlay.adjustStrikeCount(delta);
      if (delta < 0) {
        trimTargetsToCount();
      }
      chrome.setWarheadCount(missileOverlay.getStrikeCount());
    }
  }

  function confirmNavalRoute() {
    if (!pendingRoute || !selectedFleetId) {
      return;
    }
    navalSimulation.orderRoute(selectedFleetId, pendingRoute);
    closeAllPopups();
    requestRender();
  }

  function confirmAirRoute() {
    if (!pendingMissionPlan || !pendingAircraft || !pendingAirHomeBase) {
      return;
    }
    const isCarrier = pendingAirHomeBase.category === 'carrier';
    let routePlan = pendingMissionPlan;

    if (isCarrier && pendingAirHomeBase.carrierFleetId) {
      // Replan from carrier's CURRENT position — it may have moved since planning
      const fleet = navalSimulation.getFleets().find((f) => f.id === pendingAirHomeBase.carrierFleetId);
      if (fleet) {
        const allBases = installationStore
          .getSites()
          .filter((s) => s.category === 'airbase')
          .map((s) => ({ lat: s.latitude, lon: s.longitude, name: s.name, category: s.category, countryIso3: s.countryIso3 }));
        const friendlyBases = filterAlliedBases(allBases, activeCountryIso3);
        const aircraftTypes = pendingAircraft.map((a) => a.type);
        const freshPlan = airSimulation.planRoute({
          homeLat: fleet.lat,
          homeLon: fleet.lon,
          homeName: pendingAirHomeBase.name,
          destLat: pendingMissionPlan.waypoints[pendingMissionPlan.waypoints.length - 1].lat,
          destLon: pendingMissionPlan.waypoints[pendingMissionPlan.waypoints.length - 1].lon,
          aircraftTypes,
          friendlyBases,
          playerCountry: activeCountryIso3,
        });
        if (freshPlan.viable) {
          routePlan = freshPlan;
        }
        airSimulation.launchMission({
          homeLat: fleet.lat,
          homeLon: fleet.lon,
          aircraft: pendingAircraft,
          routePlan,
          carrierFleetId: pendingAirHomeBase.carrierFleetId,
        });
        closeAllPopups();
        requestRender();
        return;
      }
    }

    airSimulation.launchMission({
      homeLat: pendingAirHomeBase.latitude,
      homeLon: pendingAirHomeBase.longitude,
      aircraft: pendingAircraft,
      routePlan,
    });
    closeAllPopups();
    requestRender();
  }

  function closeNavalPopups() {
    fleetBuilder.close();
    fleetAction.close();
    awaitingDestination = false;
    pendingRoute = null;
    selectedFleetId = null;
    hideNavalHint();
  }

  function closeAirPopups() {
    squadronBuilder.close();
    squadronAction.close();
    awaitingAirDestination = false;
    pendingAirRoute = null;
    pendingAircraft = null;
    pendingAirHomeBase = null;
    pendingMissionPlan = null;
    selectedSquadronId = null;
    hideAirHint();
  }

  function closeAllPopups() {
    closeNavalPopups();
    closeAirPopups();
  }

  function toggleRadarMode() {
    if (radarMode === 'off') {
      setRadarMode('ground');
      return;
    }
    setRadarMode('off');
  }

  function cycleRadarMode() {
    if (radarMode === 'ground') {
      setRadarMode('satellite');
      return;
    }
    if (radarMode === 'satellite') {
      setRadarMode('interceptor');
      return;
    }
    if (radarMode === 'interceptor') {
      setRadarMode('ground');
    }
  }


  function confirmInterceptorPlacement() {
    if (!activeCountryIso3 || !radarSelection.groundTarget) return;

    const target = radarSelection.groundTarget;
    // NGI must be within a ground radar's coverage radius
    const radarSnap = radarSimulation.getSnapshot();
    const withinCoverage = radarSnap.groundRadars.some((radar) => {
      const dist = haversineDistanceKm(
        { lat: target.lat, lon: target.lon },
        { lat: radar.latitude, lon: radar.longitude },
      );
      return dist < radar.coverageKm;
    });

    if (!withinCoverage) {
      notifications.warn('Interceptor must be placed within ground radar coverage');
      return;
    }

    radarSimulation.placeInterceptorSite({
      countryIso3: activeCountryIso3,
      lat: target.lat,
      lon: target.lon,
      type: selectedInterceptorType,
    });
    radarSelection.groundTarget = null;
    requestRender();
  }

  function setRadarMode(nextMode) {
    const validModes = ['ground', 'satellite', 'interceptor'];
    const normalizedMode = validModes.includes(nextMode) ? nextMode : 'off';

    radarMode = normalizedMode;
    clearRadarSelection();
    chrome.setRadarState({ mode: radarMode });
    radarVisualSystem.setOrbitPreviewVisible(radarMode === 'satellite');
    viewController.apply();

    if (radarMode !== 'off') {
      closeAllPopups();
      if (missileOverlay.getMode() !== 'idle') {
        exitStrikeMode();
      }
      if (radarMode === 'satellite') {
        orbitPlanner.open();
        radarVisualSystem.setOrbitParameters(orbitPlanner.getState());
        focusGeoSelectionView();
      }
    }
    if (radarMode !== 'satellite') {
      orbitPlanner.close();
    }
    requestRender();
  }

  function clearRadarSelection() {
    radarSelection.groundTarget = null;
    radarSelection.satelliteSlot = null;
    radarVisualSystem.setSelectedGeoSlot(null);
  }

  function confirmGroundRadarPlacement() {
    if (!activeCountryIso3 || !radarSelection.groundTarget) {
      return;
    }
    radarSimulation.placeGroundRadar({
      countryIso3: activeCountryIso3,
      lat: radarSelection.groundTarget.lat,
      lon: radarSelection.groundTarget.lon,
    });
    radarSelection.groundTarget = null;
    requestRender();
  }

  function confirmSatelliteLaunch() {
    if (!activeCountryIso3) {
      return;
    }
    const plannerState = orbitPlanner.getState();
    const isGeo = orbitPlanner.isGeostationary();

    // GEO requires a slot selection; non-GEO launches directly
    if (isGeo && !radarSelection.satelliteSlot) {
      return;
    }

    radarSimulation.launchEarlyWarningSatellite({
      countryIso3: activeCountryIso3,
      slotLongitude: radarSelection.satelliteSlot?.longitude ?? 0,
      earthRotationRadians: celestialSystem.getEarthRotationRadians(),
      altitudeKm: plannerState.altitudeKm,
      inclinationDeg: plannerState.inclinationDeg,
      raanDeg: plannerState.raanDeg,
    });
    clearRadarSelection();
    requestRender();
  }

  function toggleLaunchView() {
    viewController.toggle('launch');
    requestRender();
  }

  function toggleRadarView() {
    viewController.toggle('radar');
    requestRender();
  }

  function toggleNavalView() {
    viewController.toggle('naval');
    requestRender();
  }

  function toggleBasesView() {
    viewController.toggle('bases');
    requestRender();
  }

  function toggleContextView() {
    viewController.toggle('context');
    requestRender();
  }

  function toggleDefenseView() {
    const enabled = viewController.toggle('defense');
    defenseOverlay.setVisible(enabled);
    requestRender();
  }

  function toggleEconomyView() {
    const enabled = viewController.toggle('economy');
    missileOverlay.setOilFieldsVisible(enabled);
    requestRender();
  }

  function toggleTradeView() {
    viewController.toggle('trade');
    requestRender();
  }

  function enterStrikeMode() {
    setRadarMode('off');
    closeAllPopups();
    selection.launchSite = null;
    selection.target = null;
    selection.targets = [];
    missileOverlay.setMode('strike');
    syncStrikeChrome('strike');
    requestRender();
  }

  function exitStrikeMode() {
    selection.launchSite = null;
    selection.target = null;
    selection.targets = [];
    missileOverlay.setMode('idle');
    chrome.setMissileState({ mode: 'idle' });
    requestRender();
  }

  function resetBattleInputs() {
    selection.launchSite = null;
    selection.target = null;
    selection.targets = [];
    selectedFleetId = null;
    selectedSquadronId = null;
    awaitingDestination = false;
    awaitingAirDestination = false;
    pendingRoute = null;
    pendingAirRoute = null;
    pendingAircraft = null;
    pendingAirHomeBase = null;
    pendingMissionPlan = null;
    hideNavalHint();
    hideAirHint();
    fleetBuilder.close();
    fleetAction.close();
    squadronBuilder.close();
    squadronAction.close();
    radarMode = 'off';
    clearRadarSelection();
    missileOverlay.setStrikeCount(1);
    missileOverlay.setMode('idle');
    chrome.setMissileState({ mode: 'idle' });
    chrome.setWarheadCount(missileOverlay.getStrikeCount());
    chrome.setNavalState({ enabled: false });
    chrome.setRadarState({ mode: 'off' });
    radarVisualSystem.setOrbitPreviewVisible(false);
    orbitPlanner.close();
    radarVisualSystem.setSelectedSatellite(null);
    viewController.reset();
  }

  const infoCardActions = document.getElementById('infoCardActions');

  function startTracking(type, id) {
    // Save camera state before zooming in
    if (!savedCameraPosition) {
      savedCameraPosition = sceneContext.camera.position.clone();
      savedCameraTarget = sceneContext.controls.target.clone();
    }
    // Move action panels into the info card
    embedActionPanels();

    if (type === 'icbm') {
      hud.trackIcbm(id);
    } else if (type === 'interceptor') {
      hud.trackInterceptor(id);
    } else if (type === 'fleet') {
      const fleet = navalSimulation.getFleets().find((f) => f.id === id);
      hud.trackFleet(id, fleet?.name);
    } else if (type === 'squadron') {
      const mission = airSimulation.getActiveMissions().find((m) => m.id === id);
      hud.trackSquadron(id, mission?.name);
    } else if (type === 'oilfield') {
      const field = missileOverlay.pickOilFieldByName(id);
      hud.trackOilField(id, field);
    } else if (type === 'reserve') {
      hud.trackReserve(id, oilSimulation);
    } else if (type === 'port') {
      hud.trackPort(id, tradeSimulation);
    }
  }

  function stopTracking() {
    restoreActionPanels();
    hud.clear();
    defenseOverlay.setSelectedInterceptor(null);
    lastFollowPos = null;
    sceneContext.controls.minDistance =
      worldConfig.earthRadius * renderConfig.controls.minDistanceMultiplier;
    if (savedCameraPosition) {
      sceneContext.camera.position.copy(savedCameraPosition);
      sceneContext.controls.target.copy(savedCameraTarget);
      sceneContext.controls.update();
      savedCameraPosition = null;
      savedCameraTarget = null;
    }
    requestRender();
  }

  // Reparent fleet/squadron action panels into the info card so they appear
  // in the bottom-right instead of floating over the globe.
  function embedActionPanels() {
    const fleetPanel = mountNode.querySelector('.fleet-action');
    const squadronPanel = mountNode.querySelector('.squadron-action');
    if (fleetPanel && !fleetPanel.hidden) {
      infoCardActions.appendChild(fleetPanel);
    }
    if (squadronPanel && !squadronPanel.hidden) {
      infoCardActions.appendChild(squadronPanel);
    }
  }

  function restoreActionPanels() {
    // Move any embedded panels back to mountNode
    while (infoCardActions.firstChild) {
      const child = infoCardActions.firstChild;
      child.hidden = true;
      mountNode.appendChild(child);
    }
  }

  function getTrackableObjects() {
    const objects = [];
    for (const f of navalSimulation.getFleets()) {
      objects.push({ type: 'fleet', id: f.id });
    }
    for (const m of airSimulation.getActiveMissions()) {
      objects.push({ type: 'squadron', id: m.id });
      for (const tf of m.tankerFlights ?? []) {
        if (tf.phase !== 'landed') {
          objects.push({ type: 'squadron', id: tf.id });
        }
      }
    }
    const snaps = missileFlights.getSnapshots();
    for (const m of snaps) {
      if (m.active) objects.push({ type: 'icbm', id: m.id });
    }
    const defSnap = missileDefenseSim.getSnapshot();
    for (const i of defSnap.interceptors) {
      if (i.phase !== 'complete') objects.push({ type: 'interceptor', id: i.id });
    }
    return objects;
  }

  function cycleTrackedObject(delta) {
    const objects = getTrackableObjects();
    if (objects.length === 0) return;
    const current = hud.getTracked();
    let idx = current
      ? objects.findIndex((o) => o.type === current.type && o.id === current.id)
      : -1;
    idx = ((idx + delta) % objects.length + objects.length) % objects.length;
    const next = objects[idx];
    if (next.type === 'icbm') {
      hud.trackIcbm(next.id);
      defenseOverlay.setSelectedInterceptor(null);
    } else {
      hud.trackInterceptor(next.id);
      defenseOverlay.setSelectedInterceptor(next.id);
    }
    requestRender();
  }

  function populateScenarioOptions(countryIso3) {
    if (!scenarioOptionsEl) return;
    scenarioOptionsEl.innerHTML = '';

    // Free Play option (always first)
    const freeBtn = document.createElement('button');
    freeBtn.type = 'button';
    freeBtn.className = 'scenario-option' + (selectedScenarioId === '' ? ' selected' : '');
    freeBtn.dataset.scenario = '';
    freeBtn.innerHTML =
      '<span class="scenario-name">Free Play</span>' +
      '<span class="scenario-desc">No scripted events. Full control over all assets. Deploy your own radars, satellites, and interceptors.</span>';
    freeBtn.addEventListener('click', () => selectScenario(''));
    scenarioOptionsEl.appendChild(freeBtn);

    // Scenario options for this country
    for (const [id, scenario] of Object.entries(SCENARIOS)) {
      if (scenario.countries && !scenario.countries.includes(countryIso3)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scenario-option' + (selectedScenarioId === id ? ' selected' : '');
      btn.dataset.scenario = id;
      btn.innerHTML =
        `<span class="scenario-name">${scenario.name}</span>` +
        `<span class="scenario-desc">${scenario.description}</span>`;
      btn.addEventListener('click', () => selectScenario(id));
      scenarioOptionsEl.appendChild(btn);
    }
  }

  function selectScenario(id) {
    selectedScenarioId = id;
    if (scenarioOptionsEl) {
      for (const btn of scenarioOptionsEl.querySelectorAll('.scenario-option')) {
        btn.classList.toggle('selected', btn.dataset.scenario === id);
      }
    }
  }

  function loadScenarioAssets(scenario, countryIso3) {
    if (!scenario.setup) return;
    for (const sat of scenario.setup.satellites ?? []) {
      radarSimulation.deployOperationalSatellite({
        countryIso3,
        slotLongitude: sat.longitude,
        earthRotationRadians: celestialSystem.getEarthRotationRadians(),
        altitudeKm: sat.altitudeKm,
      });
    }
    for (const radar of scenario.setup.groundRadars ?? []) {
      radarSimulation.placeGroundRadar({ countryIso3, lat: radar.lat, lon: radar.lon });
    }
    for (const site of scenario.setup.interceptorSites ?? []) {
      radarSimulation.placeInterceptorSite({ countryIso3, lat: site.lat, lon: site.lon, type: site.type });
    }
  }

  function launchSingleMissile({ launchSite, target, missileTypeId, warheadId, mirvTargets }) {
    missileFlights.launch({ launchSite, target, missileTypeId, warheadId, mirvTargets });
  }

  function formatBarrels(bbl) {
    if (bbl >= 1e9) return `${(bbl / 1e9).toFixed(1)}B bbl`;
    if (bbl >= 1e6) return `${(bbl / 1e6).toFixed(1)}M bbl`;
    if (bbl >= 1e3) return `${Math.round(bbl / 1000)}K bbl`;
    return `${Math.round(bbl)} bbl`;
  }

  function formatBpd(bpd) {
    const abs = Math.abs(bpd);
    const sign = bpd < 0 ? '-' : '';
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M bpd`;
    if (abs >= 1e3) return `${sign}${Math.round(abs / 1000)}K bpd`;
    return `${sign}${Math.round(abs)} bpd`;
  }

  function latLonToWorld(lat, lon) {
    const local = latLonToVector3({ lat, lon, radius: worldConfig.earthRadius * 1.002 });
    return local.applyQuaternion(celestialSystem.groups.earth.quaternion);
  }

  function getTargetFromPointer(event) {
    return pointerController.getTargetFromPointer(event);
  }

  function pickGeoSlotFromPointer(event) {
    return pointerController.pickGeoSlotFromPointer(event);
  }

  function pickSatelliteFromPointer(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = sceneContext.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, sceneContext.camera);
    raycaster.params.Points = { threshold: 1 };

    const satActors = radarVisualSystem.getSatelliteActors();
    const meshes = [];
    for (const actor of satActors.values()) {
      meshes.push(actor.asset.object3d);
    }
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length === 0) {
      return null;
    }
    // Walk up to find the satellite root
    let obj = intersects[0].object;
    while (obj && !obj.userData.satelliteId) {
      obj = obj.parent;
    }
    return obj?.userData.satelliteId ?? null;
  }

  function pickInterceptorFromPointer(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = sceneContext.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, sceneContext.camera);

    const intcActors = defenseOverlay.getInterceptorActors();
    const meshes = [];
    const idMap = new Map();
    for (const [id, actor] of intcActors.entries()) {
      if (actor.asset.object3d.visible) {
        meshes.push(actor.asset.object3d);
        idMap.set(actor.asset.object3d.id, id);
      }
    }
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length === 0) return null;

    let obj = intersects[0].object;
    while (obj) {
      if (idMap.has(obj.id)) return idMap.get(obj.id);
      obj = obj.parent;
    }
    return null;
  }

  function getVisibleRadarSnapshot() {
    const snapshot = radarSimulation.getSnapshot();
    if (godView || !activeCountryIso3) {
      return snapshot;
    }
    return {
      ...snapshot,
      groundRadars: snapshot.groundRadars.filter(
        (radar) => radar.countryIso3 === activeCountryIso3,
      ),
      satellites: snapshot.satellites.filter(
        (satellite) => satellite.countryIso3 === activeCountryIso3,
      ),
      launches: snapshot.launches.filter((launch) => launch.countryIso3 === activeCountryIso3),
      interceptorSites: (snapshot.interceptorSites ?? []).filter(
        (site) => site.countryIso3 === activeCountryIso3,
      ),
    };
  }

  function buildRadarOverlayState(snapshot) {
    const operationalSatelliteCount = snapshot.satellites.filter(
      (satellite) => satellite.operational,
    ).length;
    const inFlightSatelliteCount = snapshot.satellites.length - operationalSatelliteCount;
    const selectedSat = radarVisualSystem.getSelectedSatelliteId()
      ? snapshot.satellites.find((s) => s.id === radarVisualSystem.getSelectedSatelliteId())
      : null;
    return {
      mode: radarMode,
      coverageKm: GROUND_RADAR_PRESET.coverageKm,
      coverageVisible: viewController.isEnabled('radar') || radarMode !== 'off',
      groundCount: snapshot.groundRadars.length,
      satelliteCount: operationalSatelliteCount,
      launchCount: snapshot.launches.length + inFlightSatelliteCount,
      pendingGroundTarget: radarSelection.groundTarget,
      pendingSatelliteSlot: radarSelection.satelliteSlot,
      spaceportName: activeCountryIso3
        ? (COUNTRY_SPACEPORTS[activeCountryIso3]?.name ?? null)
        : null,
      footprintRadiusKm: computeFootprintRadiusKm(orbitPlanner.getState().altitudeKm),
      orbitAltitudeKm: orbitPlanner.getState().altitudeKm,
      selectedSatellite: selectedSat,
      interceptorSiteCount: (snapshot.interceptorSites ?? []).length,
      selectedInterceptorType,
      defenseSnapshot: missileDefenseSim.getSnapshot(),
    };
  }

  function focusGeoSelectionView() {
    sceneContext.controls.target.set(0, 0, 0);
    sceneContext.camera.position.set(
      GEO_SELECTION_CAMERA_POSITION.x,
      GEO_SELECTION_CAMERA_POSITION.y,
      GEO_SELECTION_CAMERA_POSITION.z,
    );
    sceneContext.controls.update();
  }

  sceneContext.controls.addEventListener('change', requestRender);
  sceneContext.renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  sceneContext.renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeydown);

  const detachSession = sessionStore.subscribe((session) => {
    const countryChanged =
      session.activeCountryIso3 && session.activeCountryIso3 !== activeCountryIso3;
    paused = session.paused;
    godView = session.godView;
    defenseTargetOwn = session.defenseTargetOwn ?? true;
    activeCountryIso3 = session.activeCountryIso3;

    if (activeCountryIso3) {
      installationStore.setActiveCountry(activeCountryIso3);
      tradeSimulation.setActiveCountry(activeCountryIso3);
    }
    missileOverlay.setGodView(godView);
    missileOverlay.setPreviewCountry(session.started ? null : activeCountryIso3);
    countryBorders.setActiveCountry(session.started ? activeCountryIso3 : null);
    countryBorders.setPreviewCountry(session.started ? null : activeCountryIso3);
    sceneContext.controls.enabled = session.started && !session.paused;

    if (!session.started || countryChanged) {
      resetBattleInputs();
      gameClock.reset();
      notifiedThreatIds.clear();
      scenarioLoaded = false;
      victoryEvaluator = null;
    }

    // Create victory evaluator when a session starts
    if (session.started && session.gameStatus === 'ongoing' && !victoryEvaluator && activeCountryIso3) {
      victoryEvaluator = createVictoryEvaluator({
        damageSimulation,
        activeCountryIso3,
        gameClock,
      });
    }

    // Update scenario options while on the nation select screen
    if (!session.started && activeCountryIso3) {
      populateScenarioOptions(activeCountryIso3);
    }

    // Load the selected scenario when entering battle (once)
    if (session.started && selectedScenarioId && !scenarioLoaded) {
      scenarioLoaded = true;
      const scenario = SCENARIOS[selectedScenarioId];
      if (scenario) {
        loadScenarioAssets(scenario, activeCountryIso3);
        scenarioController.loadScenario(scenario);
      }
    }

    if (clockEl) {
      clockEl.hidden = !session.started;
    }

    requestRender();
  });

  const detachMissile = chrome.onToggleMissile(() => {
    const currentMode = missileOverlay.getMode();
    if (currentMode === 'idle') {
      enterStrikeMode();
    } else {
      exitStrikeMode();
    }
  });
  const detachSiteFilter = chrome.onToggleSiteFilter(() => {
    const currentMode = missileOverlay.getMode();
    if (
      currentMode === 'strike' ||
      currentMode === 'strikeConfirm' ||
      currentMode === 'selectLaunch'
    ) {
      const newCategory = installationStore.cycleCategory();
      chrome.setSiteFilter(newCategory);
      requestRender();
    }
  });
  const detachWarheadIncrease = chrome.onIncreaseWarheads(() => {
    missileOverlay.adjustStrikeCount(1);
    chrome.setWarheadCount(missileOverlay.getStrikeCount());
    requestRender();
  });
  const detachWarheadDecrease = chrome.onDecreaseWarheads(() => {
    missileOverlay.adjustStrikeCount(-1);
    trimTargetsToCount();
    chrome.setWarheadCount(missileOverlay.getStrikeCount());
    requestRender();
  });
  const detachMissileType = chrome.onSelectMissileType((typeId) => {
    selectedMissileType = typeId;
    const missileType = getMissileType(typeId);
    if (missileType) {
      selectedWarheadId = missileType.defaultWarhead;
      const warheads = getCompatibleWarheads(typeId);
      const wh = warheads.find((w) => w.id === selectedWarheadId);
      chrome.setWarheadLabel(wh?.label ?? selectedWarheadId);
    }
    requestRender();
  });
  const detachWarheadCycle = chrome.onCycleWarhead(() => {
    const warheads = getCompatibleWarheads(selectedMissileType);
    if (warheads.length <= 1) return;
    const currentIndex = warheads.findIndex((w) => w.id === selectedWarheadId);
    const nextIndex = (currentIndex + 1) % warheads.length;
    selectedWarheadId = warheads[nextIndex].id;
    chrome.setWarheadLabel(warheads[nextIndex].label);
    requestRender();
  });
  const detachFleetDeploy = fleetBuilder.onDeploy(({ baseSite, ships }) => {
    // Prevent duplicate deploys from the same base
    const alreadyDeployed = navalSimulation.getFleets().some(
      (f) => Math.abs(f.lat - baseSite.latitude) < 0.01 && Math.abs(f.lon - baseSite.longitude) < 0.01,
    );
    if (alreadyDeployed) {
      return;
    }
    const fleet = navalSimulation.createFleet({
      lat: baseSite.latitude,
      lon: baseSite.longitude,
      ships,
    });
    selectedFleetId = fleet.id;
    fleetAction.open(fleet);
    requestRender();
  });
  const detachFleetSetRoute = fleetAction.onSetRoute(() => {
    awaitingDestination = true;
    pendingRoute = null;
    showNavalHint('Click ocean to set destination');
    requestRender();
  });
  const detachFleetConfirmRoute = fleetAction.onConfirmRoute(() => {
    confirmNavalRoute();
  });
  const detachFleetLaunchAircraft = fleetAction.onLaunchAircraft(() => {
    const fleet = fleetAction.getFleet();
    if (!fleet) {
      return;
    }
    const carrierCount = fleet.ships.filter((s) => s.type === 'carrier' && !s.sunk).length;
    const carrierSite = {
      name: fleet.name + ' (Carrier)',
      latitude: fleet.lat,
      longitude: fleet.lon,
      countryIso3: activeCountryIso3,
      category: 'carrier',
      carrierFleetId: fleet.id,
      maxF35: carrierCount * 20,
    };
    fleetAction.close();
    squadronBuilder.open(carrierSite);
    requestRender();
  });
  const detachFleetActionClose = fleetAction.onClose(() => {
    awaitingDestination = false;
    pendingRoute = null;
    selectedFleetId = null;
    hideNavalHint();
    requestRender();
  });
  const detachSquadronDeploy = squadronBuilder.onDeploy(({ baseSite, aircraft }) => {
    // Enter destination selection mode — aircraft don't spawn until mission is confirmed
    pendingAircraft = aircraft;
    pendingAirHomeBase = baseSite;
    pendingMissionPlan = null;
    pendingAirRoute = null;
    awaitingAirDestination = true;
    squadronBuilder.close();
    const isCarrier = baseSite.category === 'carrier';
    showAirHint(isCarrier ? 'Click anywhere to set patrol destination' : 'Click on a destination air base');
    requestRender();
  });
  const detachSquadronConfirmRoute = squadronAction.onConfirmRoute(() => {
    confirmAirRoute();
  });
  const detachSquadronActionClose = squadronAction.onClose(() => {
    awaitingAirDestination = false;
    pendingAirRoute = null;
    pendingAircraft = null;
    pendingAirHomeBase = null;
    pendingMissionPlan = null;
    selectedSquadronId = null;
    hideAirHint();
    requestRender();
  });
  const detachNaval = chrome.onToggleNaval(() => {
    closeNavalPopups();
    requestRender();
  });
  const detachRadarMode = chrome.onSelectRadarMode((mode) => {
    if (mode === radarMode) {
      setRadarMode('off');
    } else {
      setRadarMode(mode);
    }
  });
  const detachOrbitPlannerChange = orbitPlanner.onChange((params) => {
    radarVisualSystem.setOrbitParameters(params);
    // Non-GEO: launch always available. GEO: requires slot selection.
    if (orbitPlanner.isGeostationary()) {
      orbitPlanner.setLaunchEnabled(Boolean(radarSelection.satelliteSlot));
    }
    // Clear slot selection when switching away from GEO
    if (!orbitPlanner.isGeostationary()) {
      radarSelection.satelliteSlot = null;
      radarVisualSystem.setSelectedGeoSlot(null);
    }
    requestRender();
  });
  const detachOrbitPlannerLaunch = orbitPlanner.onLaunch(() => {
    confirmSatelliteLaunch();
  });
  const detachViewLaunch = chrome.onToggleViewLaunch(() => {
    toggleLaunchView();
  });
  const detachViewRadar = chrome.onToggleViewRadar(() => {
    toggleRadarView();
  });
  const detachViewNaval = chrome.onToggleViewNaval(() => {
    toggleNavalView();
  });
  const detachViewBases = chrome.onToggleViewBases(() => {
    toggleBasesView();
  });
  const detachViewContext = chrome.onToggleViewContext(() => {
    toggleContextView();
  });
  const detachViewDefense = chrome.onToggleViewDefense(() => {
    toggleDefenseView();
  });
  const detachViewEconomy = chrome.onToggleViewEconomy(() => {
    toggleEconomyView();
  });
  const detachViewTrade = chrome.onToggleViewTrade(() => {
    toggleTradeView();
  });
  const detachReset = chrome.onResetView(() => {
    sceneContext.resetView();
    requestRender();
  });

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      accumulated = 0;
      clock.start();
      requestRender();
    },
    dispose() {
      running = false;
      sceneContext.controls.removeEventListener('change', requestRender);
      sceneContext.renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      sceneContext.renderer.domElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
      detachMissile();
      detachSiteFilter();
      detachWarheadIncrease();
      detachWarheadDecrease();
      detachMissileType();
      detachWarheadCycle();
      detachFleetDeploy();
      detachFleetSetRoute();
      detachFleetConfirmRoute();
      detachFleetLaunchAircraft();
      detachFleetActionClose();
      detachSquadronDeploy();
      detachSquadronConfirmRoute();
      detachSquadronActionClose();
      detachNaval();
      detachRadarMode();
      detachOrbitPlannerChange();
      detachOrbitPlannerLaunch();
      detachViewLaunch();
      detachViewRadar();
      detachViewNaval();
      detachViewBases();
      detachViewContext();
      detachViewDefense();
      detachViewEconomy();
      detachViewTrade();
      detachReset();
      detachSession();
      fleetBuilder.dispose();
      fleetAction.dispose();
      fleetOverlay.dispose();
      tradeOverlay.dispose();
      squadronBuilder.dispose();
      squadronAction.dispose();
      squadronOverlay.dispose();
      navalHint.remove();
      airHint.remove();
      missileOverlay.dispose();
      countryBorders.dispose();
      cityLabels.dispose();
      radarVisualSystem.dispose();
      defenseOverlay.dispose();
      orbitPlanner.dispose();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    },
  };
}

// Build per-waypoint leg indices for a pending route preview.
// Walks the dense waypoint array and assigns each waypoint to a leg
// based on cumulative distance vs the route plan's refuel distances.
function buildPendingLegIndices(waypoints, plan) {
  const DEG_TO_RAD = Math.PI / 180;
  const R = 6371;
  const refuelDists = plan.refuelDistances || [];
  if (refuelDists.length === 0) {
    return null;
  }
  const indices = new Array(waypoints.length);
  let cumDist = 0;
  let leg = 0;
  indices[0] = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dLat = (waypoints[i].lat - waypoints[i - 1].lat) * DEG_TO_RAD;
    const dLon = (waypoints[i].lon - waypoints[i - 1].lon) * DEG_TO_RAD;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(waypoints[i - 1].lat * DEG_TO_RAD) *
      Math.cos(waypoints[i].lat * DEG_TO_RAD) *
      Math.sin(dLon / 2) ** 2;
    cumDist += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (leg < refuelDists.length && cumDist >= refuelDists[leg]) {
      leg++;
    }
    indices[i] = leg;
  }
  return indices;
}
