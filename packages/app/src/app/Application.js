import * as THREE from 'three';
import { createSceneContext } from '../core/createSceneContext.js';
import { createHudController } from '../ui/createHudController.js';
import { createStrategicHudController } from '../ui/createStrategicHudController.js';
import { createChromeController } from '../ui/createChromeController.js';
import { createLogisticsHudController } from '../ui/createLogisticsHudController.js';
import { createDiplomacyHudController } from '../ui/createDiplomacyHudController.js';
import { createIntelligenceHudController } from '../ui/createIntelligenceHudController.js';
import { createNavalSimulation } from '../simulation/createNavalSimulation.js';
import { createRadarSimulation } from '../simulation/createRadarSimulation.js';
import { createStrategicSimulation } from '../simulation/createStrategicSimulation.js';
import { createLogisticsSimulation } from '../simulation/createLogisticsSimulation.js';
import { createDeploymentSimulation } from '../simulation/createDeploymentSimulation.js';
import { createDisruptionSimulation } from '../simulation/createDisruptionSimulation.js';
import { createInterceptSimulation } from '../simulation/createInterceptSimulation.js';
import { createStrategicAiSimulation } from '../simulation/createStrategicAiSimulation.js';
import { createCampaignEventSystem } from '../simulation/createCampaignEventSystem.js';
import { createSpaceEnvironment } from '../world/factories/createSpaceEnvironment.js';
import { createCelestialSystem } from '../world/factories/createCelestialSystem.js';
import { createRadarVisualSystem } from '../world/factories/createRadarVisualSystem.js';
import { createCityLabelSystem } from '../world/systems/createCityLabelSystem.js';
import { createCountryBorderSystem } from '../world/systems/createCountryBorderSystem.js';
import { createIndustrialOverlaySystem } from '../world/systems/createIndustrialOverlaySystem.js';
import { createMissileOverlaySystem } from '../world/systems/createMissileOverlaySystem.js';
import { createTradeRouteOverlaySystem } from '../world/systems/createTradeRouteOverlaySystem.js';
import { createHubOverlaySystem } from '../world/systems/createHubOverlaySystem.js';
import { createSupplyNetworkOverlaySystem } from '../world/systems/createSupplyNetworkOverlaySystem.js';
import { renderConfig, simulationConfig, worldConfig } from '../config/simulationConfig.js';
import { createMilitaryInstallationStore } from '../data/createMilitaryInstallationStore.js';
import { createPlayableCountryGeometryStore } from '../data/createPlayableCountryGeometryStore.js';
import { createStrategicBootstrapStore } from '../data/createStrategicBootstrapStore.js';
import {
  COUNTRY_SPACEPORTS,
  EARLY_WARNING_SATELLITE_PRESET,
  GROUND_RADAR_PRESET,
} from '../game/data/radarCatalog.js';
import {
  createInitialRadarSelection,
  createInitialStrikeSelection,
  GEO_SELECTION_CAMERA_POSITION,
  STRIKE_LAUNCH_STAGGER_MS,
} from './appConstants.js';
import { createMissileFlightController } from './createMissileFlightController.js';
import { createPointerController } from './createPointerController.js';
import { createViewStateController } from './createViewStateController.js';
import { formatTargetLabel } from './formatTargetLabel.js';

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
  const playableCountryGeometryStore = createPlayableCountryGeometryStore();
  const strategicBootstrapStore = createStrategicBootstrapStore({ window });
  const hud = createHudController({ document });
  const strategicHud = createStrategicHudController({ document });
  const chrome = createChromeController({ document });
  const environment = createSpaceEnvironment({ scene: sceneContext.scene, renderConfig });
  const navalSimulation = createNavalSimulation({ worldConfig });
  const radarSimulation = createRadarSimulation({ simulationConfig, worldConfig });
  const strategicSimulation = createStrategicSimulation();
  const logisticsSimulation = createLogisticsSimulation();
  const deploymentSimulation = createDeploymentSimulation();
  const disruptionSimulation = createDisruptionSimulation();
  const interceptSimulation = createInterceptSimulation();
  const strategicAiSimulation = createStrategicAiSimulation();
  const campaignEvents = createCampaignEventSystem();
  let navalModeActive = false;
  let radarMode = 'off';
  const radarSelection = createInitialRadarSelection();
  const selection = createInitialStrikeSelection();

  let requestRender = () => {};
  let running = false;
  let accumulated = 0;
  let rafId = null;
  let paused = sessionStore.getSnapshot().paused;
  let godView = sessionStore.getSnapshot().godView;
  let activeCountryIso3 = sessionStore.getSnapshot().activeCountryIso3;
  let strategicLoadSequence = 0;
  let pendingSavedGameState = null;
  let strategicPlacementMode = null;
  let strategicPlacementPreview = null;
  let selectedIndustrialProjectId = null;
  let hoveredIndustrialProjectId = null;

  await installationStore.ensureLoaded();
  await playableCountryGeometryStore.ensureLoaded();
  await loadStrategicState(activeCountryIso3);

  const celestialSystem = await createCelestialSystem({
    scene: sceneContext.scene,
    renderer: sceneContext.renderer,
    worldConfig,
    renderConfig,
    onInvalidate: () => requestRender(),
  });
  const radarVisualSystem = createRadarVisualSystem({
    scene: sceneContext.scene,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    renderConfig,
  });
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
  const industrialOverlay = createIndustrialOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    requestRender: () => requestRender(),
  });
  const tradeRouteOverlay = createTradeRouteOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    requestRender: () => requestRender(),
  });
  const hubOverlay = createHubOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    requestRender: () => requestRender(),
  });
  const supplyNetworkOverlay = createSupplyNetworkOverlaySystem({
    document,
    mountNode,
    renderer: sceneContext.renderer,
    camera: sceneContext.camera,
    earthGroup: celestialSystem.groups.earth,
    worldConfig,
    requestRender: () => requestRender(),
  });
  const logisticsHud = createLogisticsHudController({ document });
  const diplomacyHud = createDiplomacyHudController({ document });
  const intelligenceHud = createIntelligenceHudController({ document });
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
      missileFlights.step(stepSeconds);
      navalSimulation.step(stepSeconds);
      radarSimulation.step(stepSeconds);
      strategicSimulation.step(stepSeconds);
      logisticsSimulation.step(stepSeconds);
      deploymentSimulation.step(stepSeconds);
      disruptionSimulation.step(stepSeconds);
      interceptSimulation.step(stepSeconds);
      strategicAiSimulation.step(stepSeconds);
      campaignEvents.step(stepSeconds);
      accumulated -= simulationConfig.fixedTimeStep;
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
    const primaryMissile = missileFlights.getPrimarySnapshot(missileSnapshots);

    celestialSystem.updateMissiles(
      missileSnapshots,
      deltaSeconds,
      clock.elapsedTime,
      sceneContext.camera,
    );
    celestialSystem.updateNavalUnits(navalSimulation.getSnapshot(), sceneContext.camera);
    const visibleRadarSnapshot = getVisibleRadarSnapshot();
    radarVisualSystem.update(visibleRadarSnapshot, sceneContext.camera, clock.elapsedTime);

    const strategicSnapshot = strategicSimulation.getSnapshot();
    const logisticsSnapshot = logisticsSimulation.getSnapshot();
    const deploymentSnapshot = deploymentSimulation.getSnapshot();
    const disruptionSnapshot = disruptionSimulation.getSnapshot();
    const interceptSnapshot = interceptSimulation.getSnapshot();

    // Feed world state to AI for evaluation
    strategicAiSimulation.setWorldState({
      strategic: strategicSnapshot,
      logistics: logisticsSnapshot,
      disruption: disruptionSnapshot,
    });

    // Evaluate campaign event triggers
    campaignEvents.evaluate({
      strategic: strategicSnapshot,
      logistics: logisticsSnapshot,
      deployment: deploymentSnapshot,
      disruption: disruptionSnapshot,
      intercept: interceptSnapshot,
    });

    hud.render({ missile: primaryMissile });
    renderStrategicHud(strategicSnapshot);
    logisticsHud.render(logisticsSnapshot);
    diplomacyHud.render(strategicAiSimulation.getSnapshot());
    intelligenceHud.render(campaignEvents.getSnapshot());

    sceneContext.renderer.render(sceneContext.scene, sceneContext.camera);
    missileOverlay.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
      selection,
      flights: missileSnapshots,
      radar: buildRadarOverlayState(visibleRadarSnapshot),
      showFlightMarkers: viewController.isEnabled('launch'),
    });
    countryBorders.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
    });
    cityLabels.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
    });
    industrialOverlay.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
      projects: strategicSnapshot.industrialProjects ?? [],
      placementMode: strategicPlacementMode,
      placementPreview: strategicPlacementPreview,
      hoveredProjectId: hoveredIndustrialProjectId,
      selectedProjectId: selectedIndustrialProjectId,
    });
    tradeRouteOverlay.render({
      contracts: strategicSnapshot.trade?.contracts ?? [],
    });
    hubOverlay.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
      hubs: logisticsSnapshot.hubs ?? [],
      deployments: deploymentSnapshot.deployments ?? [],
    });
    supplyNetworkOverlay.render({
      altitudeKm: celestialSystem.getCameraAltitudeKm(sceneContext.camera, sceneContext.controls),
      routes: logisticsSnapshot.routes ?? [],
      supplyShocks: disruptionSnapshot.supplyShocks ?? {},
    });

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

  function handlePointerMove(event) {
    const session = sessionStore.getSnapshot();
    if (!session.started || session.paused) {
      return;
    }

    if (strategicPlacementMode) {
      const target = getTargetFromPointer(event);
      const nextPreview = target
        ? {
            lat: target.lat,
            lon: target.lon,
            label: formatPlacementLabel(strategicPlacementMode),
            valid: playableCountryGeometryStore.contains(activeCountryIso3, target.lat, target.lon),
          }
        : null;
      if (JSON.stringify(nextPreview) !== JSON.stringify(strategicPlacementPreview)) {
        strategicPlacementPreview = nextPreview;
        renderStrategicHud();
        requestRender();
      }
      return;
    }

    const hoveredProject = industrialOverlay.pickProject(event.clientX, event.clientY);
    const nextHoveredId = hoveredProject?.id ?? null;
    if (nextHoveredId !== hoveredIndustrialProjectId) {
      hoveredIndustrialProjectId = nextHoveredId;
      requestRender();
    }
  }

  function handlePointerLeave() {
    if (strategicPlacementPreview || hoveredIndustrialProjectId) {
      strategicPlacementPreview = null;
      hoveredIndustrialProjectId = null;
      renderStrategicHud();
      requestRender();
    }
  }

  function handlePointerDown(event) {
    const session = sessionStore.getSnapshot();
    if (!session.started || session.paused) {
      return;
    }

    if (strategicPlacementMode) {
      handleStrategicPlacement(event);
      return;
    }

    const selectedProject = industrialOverlay.pickProject(event.clientX, event.clientY);
    if (selectedProject) {
      selectedIndustrialProjectId = selectedProject.id;
      renderStrategicHud();
      requestRender();
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

    if (radarMode === 'satellite') {
      if (!activeCountryIso3) {
        return;
      }
      const slot = pickGeoSlotFromPointer(event);
      if (!slot) {
        return;
      }
      radarSelection.satelliteSlot = slot;
      radarVisualSystem.setSelectedGeoSlot(slot.id);
      requestRender();
      return;
    }

    if (navalModeActive) {
      const target = getTargetFromPointer(event);
      if (!target) return;

      // Only allow placement on ocean
      if (!celestialSystem.isOcean(target.lat, target.lon)) {
        return;
      }

      // Always spawn a new carrier strike group
      navalSimulation.createPackage({
        lat: target.lat,
        lon: target.lon,
        shipsConfig: [{ type: 'carrier' }, { type: 'cruiser' }, { type: 'cruiser' }],
      });
      requestRender();
      return;
    }

    const currentMode = missileOverlay.getMode();

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

  function executeStrike() {
    if (selection.targets.length === 0) {
      return;
    }

    const availableMissiles = Math.floor(strategicSimulation.getTotalBaseInventory('missile_inventory'));
    if (availableMissiles <= 0) {
      strategicSimulation.setNotification(
        'No missile inventory is loaded into domestic silo bases.',
        'warning',
      );
      requestRender();
      return;
    }

    const country = installationStore.getActiveCountry();
    let launchIndex = 0;

    for (const target of selection.targets) {
      if (launchIndex >= availableMissiles) {
        break;
      }

      const silos = selectLoadedLaunchSilos({
        iso3: country,
        targetLat: target.lat,
        targetLon: target.lon,
        count: 1,
      });

      if (silos.length === 0) {
        continue;
      }

      const silo = silos[0];
      const consumption = strategicSimulation.consumeBaseInventory('missile_inventory', 1, silo.id);
      if (!consumption) {
        break;
      }
      installationStore.markSiloSpent(silo.id);
      strategicSimulation.disableBase(silo.id);
      const labeledTarget = { ...target, label: target.label ?? formatTargetLabel(target) };
      const delay = launchIndex * STRIKE_LAUNCH_STAGGER_MS;

      if (delay === 0) {
        launchSingleMissile({ launchSite: silo, target: labeledTarget });
      } else {
        setTimeout(() => {
          launchSingleMissile({ launchSite: silo, target: labeledTarget });
          requestRender();
        }, delay);
      }
      launchIndex += 1;
    }

    if (launchIndex === 0) {
      strategicSimulation.setNotification(
        'Strike aborted: no silo capacity or missile inventory available.',
        'warning',
      );
      requestRender();
      return;
    }

    strategicSimulation.setNotification(
      launchIndex < selection.targets.length
        ? `Launched ${launchIndex} missiles. Remaining targets were blocked by loaded silo inventory or base limits.`
        : `Launched ${launchIndex} missiles from domestic silo bases.`,
      'info',
    );

    // Keep targets visible as reference, reset for next round
    const warheadCount = missileOverlay.getStrikeCount();
    const available = installationStore.getAvailableSiloCount(country);
    missileOverlay.setStrikeCount(Math.min(warheadCount, available));
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
    const consumption = strategicSimulation.consumeBaseInventory(
      'missile_inventory',
      1,
      selection.launchSite.id,
    );
    if (!consumption) {
      strategicSimulation.setNotification(
        'Selected silo has no loaded missile inventory available.',
        'warning',
      );
      requestRender();
      return;
    }
    installationStore.markSiloSpent(selection.launchSite.id);
    strategicSimulation.disableBase(selection.launchSite.id);
    launchSingleMissile({
      launchSite: selection.launchSite,
      target: selection.target,
    });
    strategicSimulation.setNotification(
      `Manual launch consumed one missile from ${consumption.baseName}.`,
      'info',
    );
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

    if (strategicPlacementMode && key === 'escape') {
      strategicPlacementMode = null;
      renderStrategicHud();
      requestRender();
      return;
    }

    if (key === 'escape') {
      if (!session.started) {
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
    } else if (key === 'n') {
      toggleNavalMode();
    } else if (key === 'r') {
      toggleRadarMode();
    } else if (key === 'enter') {
      if (radarMode === 'ground') {
        confirmGroundRadarPlacement();
      } else if (radarMode === 'satellite') {
        confirmSatelliteLaunch();
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
    } else if (key === 'tab' && radarMode !== 'off') {
      event.preventDefault();
      cycleRadarMode();
    } else if (key === 'tab' && (isStrike || currentMode === 'selectLaunch')) {
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
    } else if (key === '0') {
      sceneContext.resetView();
      requestRender();
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

  function toggleNavalMode() {
    if (navalModeActive) {
      navalModeActive = false;
      chrome.setNavalState({ enabled: false });
      requestRender();
      return;
    }
    navalModeActive = true;
    chrome.setNavalState({ enabled: true });
    setRadarMode('off');
    exitStrikeMode();
    requestRender();
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
      setRadarMode('ground');
    }
  }

  function setRadarMode(nextMode) {
    const normalizedMode = nextMode === 'ground' || nextMode === 'satellite' ? nextMode : 'off';

    radarMode = normalizedMode;
    clearRadarSelection();
    chrome.setRadarState({ mode: radarMode });
    radarVisualSystem.setGeoSelectionVisible(radarMode === 'satellite');
    viewController.apply();

    if (radarMode !== 'off') {
      navalModeActive = false;
      chrome.setNavalState({ enabled: false });
      if (missileOverlay.getMode() !== 'idle') {
        exitStrikeMode();
      }
      if (radarMode === 'satellite') {
        focusGeoSelectionView();
      }
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
    const consumption = strategicSimulation.consumeBaseInventory('radar', 1);
    if (!consumption) {
      strategicSimulation.setNotification(
        'No radar arrays are loaded into compatible domestic air bases.',
        'warning',
      );
      requestRender();
      return;
    }
    radarSimulation.placeGroundRadar({
      countryIso3: activeCountryIso3,
      lat: radarSelection.groundTarget.lat,
      lon: radarSelection.groundTarget.lon,
    });
    radarSelection.groundTarget = null;
    strategicSimulation.setNotification(
      `Ground radar deployed from ${consumption.baseName}.`,
      'info',
    );
    requestRender();
  }

  function confirmSatelliteLaunch() {
    if (!activeCountryIso3 || !radarSelection.satelliteSlot) {
      return;
    }
    const consumption = strategicSimulation.consumeBaseInventory(
      'early_warning_satellite',
      1,
      `spaceport-${activeCountryIso3}`,
    );
    if (!consumption) {
      strategicSimulation.setNotification(
        'No early warning satellites are loaded at the national spaceport.',
        'warning',
      );
      requestRender();
      return;
    }
    radarSimulation.launchEarlyWarningSatellite({
      countryIso3: activeCountryIso3,
      slotLongitude: radarSelection.satelliteSlot.longitude,
      earthRotationRadians: celestialSystem.getEarthRotationRadians(),
    });
    clearRadarSelection();
    strategicSimulation.setNotification(
      `Early warning satellite launch committed from ${consumption.baseName}.`,
      'info',
    );
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

  function enterStrikeMode() {
    setRadarMode('off');
    if (navalModeActive) {
      navalModeActive = false;
      chrome.setNavalState({ enabled: false });
    }
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
    navalModeActive = false;
    radarMode = 'off';
    strategicPlacementMode = null;
    clearRadarSelection();
    missileOverlay.setStrikeCount(1);
    missileOverlay.setMode('idle');
    chrome.setMissileState({ mode: 'idle' });
    chrome.setWarheadCount(missileOverlay.getStrikeCount());
    chrome.setNavalState({ enabled: false });
    chrome.setRadarState({ mode: 'off' });
    radarVisualSystem.setGeoSelectionVisible(false);
    viewController.apply();
  }

  function launchSingleMissile({ launchSite, target }) {
    missileFlights.launch({ launchSite, target });
  }

  function getTargetFromPointer(event) {
    return pointerController.getTargetFromPointer(event);
  }

  function pickGeoSlotFromPointer(event) {
    return pointerController.pickGeoSlotFromPointer(event);
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
    };
  }

  function buildRadarOverlayState(snapshot) {
    const operationalSatelliteCount = snapshot.satellites.filter(
      (satellite) => satellite.operational,
    ).length;
    const inFlightSatelliteCount = snapshot.satellites.length - operationalSatelliteCount;
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
      footprintRadiusKm: EARLY_WARNING_SATELLITE_PRESET.footprintRadiusKm,
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

  function buildStrategicUiState() {
    return {
      placementMode: strategicPlacementMode,
      placementCountryName: countryDirectory.getByIso3(activeCountryIso3)?.name ?? activeCountryIso3,
      placementPreview: strategicPlacementPreview,
      selectedProjectId: selectedIndustrialProjectId,
    };
  }

  function renderStrategicHud(snapshot = strategicSimulation.getSnapshot()) {
    strategicHud.render(snapshot, buildStrategicUiState());
  }

  function enterStrategicPlacementMode(projectKey) {
    if (!activeCountryIso3) {
      return;
    }

    strategicPlacementMode = strategicPlacementMode === projectKey ? null : projectKey;
    strategicPlacementPreview = null;
    if (strategicPlacementMode) {
      setRadarMode('off');
      if (navalModeActive) {
        navalModeActive = false;
        chrome.setNavalState({ enabled: false });
      }
      exitStrikeMode();
      strategicSimulation.setNotification(
        `Placement mode active: click inside ${activeCountryIso3} to place ${formatPlacementLabel(projectKey)}.`,
        'info',
      );
    }
    renderStrategicHud();
    requestRender();
  }

  function handleStrategicPlacement(event) {
    if (!activeCountryIso3 || !strategicPlacementMode) {
      return;
    }
    const target = getTargetFromPointer(event);
    if (!target) {
      return;
    }
    if (!playableCountryGeometryStore.contains(activeCountryIso3, target.lat, target.lon)) {
      strategicSimulation.setNotification(
        `Place ${formatPlacementLabel(strategicPlacementMode)} inside ${activeCountryIso3}.`,
        'warning',
      );
      renderStrategicHud();
      requestRender();
      return;
    }

    const result = strategicSimulation.placeIndustrialProject(strategicPlacementMode, target);
    if (!result.ok) {
      strategicSimulation.setNotification(result.reason ?? 'Unable to place project.', 'warning');
      renderStrategicHud();
      requestRender();
      return;
    }

    selectedIndustrialProjectId = result.project.id;
    strategicPlacementMode = null;
    strategicPlacementPreview = null;
    strategicSimulation.setNotification(`${result.project.label} placed successfully.`, 'info');
    renderStrategicHud();
    requestRender();
  }

  function formatPlacementLabel(projectKey) {
    return projectKey === 'chip_factory' ? 'Chip Factory' : 'Military Factory';
  }

  async function loadStrategicState(countryIso3) {
    const loadSequence = ++strategicLoadSequence;
    const previewCountry = countryDirectory.getByIso3(countryIso3);

    if (!countryIso3) {
      strategicSimulation.clear();
      renderStrategicHud();
      return;
    }

    strategicHud.render(
      {
        status: 'loading',
        countryLabel: previewCountry?.name ?? countryIso3,
      },
      buildStrategicUiState(),
    );

    try {
      const bootstrap = await strategicBootstrapStore.ensureLoaded(countryIso3);
      if (loadSequence !== strategicLoadSequence) {
        return;
      }
      strategicSimulation.setBootstrap(
        bootstrap,
        installationStore.getStrategicDomesticBases(countryIso3),
      );
      renderStrategicHud();
      requestRender();
    } catch (error) {
      if (loadSequence !== strategicLoadSequence) {
        return;
      }
      console.error(error);
      strategicSimulation.clear();
      strategicHud.render(
        {
          status: 'error',
          countryLabel: previewCountry?.name ?? countryIso3,
          message: error.message ?? 'Strategic bootstrap failed',
        },
        buildStrategicUiState(),
      );
      requestRender();
    }
  }

  function selectLoadedLaunchSilos({ iso3, targetLat, targetLon, count }) {
    const available = installationStore
      .getAvailableSilos(iso3)
      .filter((site) => strategicSimulation.getBaseInventory(site.id, 'missile_inventory') >= 1);
    if (available.length === 0) {
      return [];
    }

    const scored = available.map((site) => ({
      site,
      distance: calculateTargetDistance(site.latitude, site.longitude, targetLat, targetLon),
    }));
    scored.sort((left, right) => left.distance - right.distance);
    return scored.slice(0, count).map((entry) => entry.site);
  }

  function calculateTargetDistance(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a =
      Math.sin(dLat * 0.5) * Math.sin(dLat * 0.5) +
      Math.cos(lat1 * toRad) *
        Math.cos(lat2 * toRad) *
        Math.sin(dLon * 0.5) *
        Math.sin(dLon * 0.5);
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371;
  }

  function resetRuntimeState() {
    strategicSimulation.clear();
    radarSimulation.reset();
    navalSimulation.reset();
    logisticsSimulation.reset();
    deploymentSimulation.reset();
    disruptionSimulation.reset();
    interceptSimulation.reset();
    strategicAiSimulation.reset();
    campaignEvents.reset();
    installationStore.resetSpentSilos();
    resetBattleInputs();
  }

  function applySavedGameState(savedGameState) {
    if (!savedGameState) {
      return;
    }
    const countryIso3 = savedGameState?.session?.activeCountryIso3 ?? activeCountryIso3;
    const strategicBootstrap = strategicBootstrapStore.getSnapshot(countryIso3);
    installationStore.setSpentSiloIds(savedGameState?.spentSiloIds ?? []);
    navalSimulation.loadState(savedGameState?.naval ?? null);
    radarSimulation.loadState(savedGameState?.radar ?? null);
    strategicSimulation.loadState(
      savedGameState?.strategic ?? null,
      installationStore.getStrategicDomesticBases(countryIso3),
      strategicBootstrap,
    );
    if (savedGameState?.logistics) {
      logisticsSimulation.loadState(savedGameState.logistics);
    }
    if (savedGameState?.deployment) {
      deploymentSimulation.loadState(savedGameState.deployment);
    }
    if (savedGameState?.disruption) {
      disruptionSimulation.loadState(savedGameState.disruption);
    }
    if (savedGameState?.intercept) {
      interceptSimulation.loadState(savedGameState.intercept);
    }
    if (savedGameState?.ai) {
      strategicAiSimulation.loadState(savedGameState.ai);
    }
    if (savedGameState?.events) {
      campaignEvents.loadState(savedGameState.events);
    }
    selectedIndustrialProjectId = null;
    strategicPlacementPreview = null;
    resetBattleInputs();
    requestRender();
  }

  sceneContext.controls.addEventListener('change', requestRender);
  sceneContext.renderer.domElement.addEventListener('pointerdown', handlePointerDown);
  sceneContext.renderer.domElement.addEventListener('pointermove', handlePointerMove);
  sceneContext.renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  sceneContext.renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeydown);

  const detachSession = sessionStore.subscribe((session) => {
    const countryChanged =
      session.activeCountryIso3 && session.activeCountryIso3 !== activeCountryIso3;
    paused = session.paused;
    godView = session.godView;
    activeCountryIso3 = session.activeCountryIso3;

    if (activeCountryIso3) {
      installationStore.setActiveCountry(activeCountryIso3);
    }
    missileOverlay.setGodView(godView);
    missileOverlay.setPreviewCountry(session.screen === 'nationSelect' ? activeCountryIso3 : null);
    countryBorders.setActiveCountry(session.screen === 'inGame' ? activeCountryIso3 : null);
    countryBorders.setPreviewCountry(session.screen === 'nationSelect' ? activeCountryIso3 : null);
    sceneContext.controls.enabled = session.started && !session.paused;

    if (!session.started) {
      selectedIndustrialProjectId = null;
      hoveredIndustrialProjectId = null;
      strategicPlacementPreview = null;
      resetRuntimeState();
    }

    if (session.started) {
      if (
        pendingSavedGameState &&
        pendingSavedGameState?.session?.activeCountryIso3 === activeCountryIso3
      ) {
        applySavedGameState(pendingSavedGameState);
        pendingSavedGameState = null;
      } else {
        const strategicSnapshot = strategicSimulation.getSnapshot();
        if (
          countryChanged ||
          strategicSnapshot.status !== 'ready' ||
          strategicSnapshot.country?.iso3 !== activeCountryIso3
        ) {
          radarSimulation.reset();
          navalSimulation.reset();
          installationStore.resetSpentSilos();
          resetBattleInputs();
          loadStrategicState(activeCountryIso3);
        }
      }
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
  const detachNaval = chrome.onToggleNaval(() => {
    toggleNavalMode();
  });
  const detachRadar = chrome.onToggleRadar(() => {
    toggleRadarMode();
  });
  const detachRadarModeCycle = chrome.onCycleRadarMode(() => {
    if (radarMode !== 'off') {
      cycleRadarMode();
    }
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
  const detachReset = chrome.onResetView(() => {
    sceneContext.resetView();
    requestRender();
  });
  const detachBuildChipFactory = strategicHud.onBuildChipFactory(() => {
    enterStrategicPlacementMode('chip_factory');
  });
  const detachBuildMilitaryFactory = strategicHud.onBuildMilitaryFactory(() => {
    enterStrategicPlacementMode('military_factory');
  });
  const detachCancelPlacement = strategicHud.onCancelPlacement(() => {
    strategicPlacementMode = null;
    strategicPlacementPreview = null;
    renderStrategicHud();
    requestRender();
  });
  const detachUpgradeFactory = strategicHud.onUpgradeSelectedFactory(() => {
    if (!selectedIndustrialProjectId) {
      return;
    }
    const result = strategicSimulation.upgradeIndustrialProject(selectedIndustrialProjectId);
    strategicSimulation.setNotification(
      result.ok
        ? `${result.project.label} upgraded to level ${result.project.upgradeLevel}.`
        : result.reason ?? 'Unable to upgrade factory.',
      result.ok ? 'info' : 'warning',
    );
    renderStrategicHud();
    requestRender();
  });
  const detachToggleFactoryPaused = strategicHud.onToggleSelectedFactoryPaused(() => {
    if (!selectedIndustrialProjectId) {
      return;
    }
    const result = strategicSimulation.toggleIndustrialProjectPaused(selectedIndustrialProjectId);
    strategicSimulation.setNotification(
      result.ok
        ? `${result.project.label} ${result.project.paused ? 'paused' : 'resumed'}.`
        : result.reason ?? 'Unable to update factory state.',
      result.ok ? 'info' : 'warning',
    );
    renderStrategicHud();
    requestRender();
  });
  const detachCycleFactoryEmphasis = strategicHud.onCycleSelectedFactoryEmphasis(() => {
    if (!selectedIndustrialProjectId) {
      return;
    }
    const result = strategicSimulation.cycleIndustrialProjectEmphasis(selectedIndustrialProjectId);
    strategicSimulation.setNotification(
      result.ok
        ? `${result.project.label} focus set to ${result.project.emphasis.replace('_', ' ')}.`
        : result.reason ?? 'Unable to change factory focus.',
      result.ok ? 'info' : 'warning',
    );
    renderStrategicHud();
    requestRender();
  });
  const detachAddChipQueue = strategicHud.onAddChipQueue(() => {
    const result = strategicSimulation.addProductionQueue('chip_factory');
    strategicSimulation.setNotification(
      result.ok
        ? `${result.queue.recipe.name} queue added.`
        : result.reason ?? 'Unable to add chip queue.',
      result.ok ? 'info' : 'warning',
    );
    renderStrategicHud();
    requestRender();
  });
  const detachAddMilitaryQueue = strategicHud.onAddMilitaryQueue(() => {
    const result = strategicSimulation.addProductionQueue('military_factory');
    strategicSimulation.setNotification(
      result.ok
        ? `${result.queue.recipe.name} queue added.`
        : result.reason ?? 'Unable to add military queue.',
      result.ok ? 'info' : 'warning',
    );
    renderStrategicHud();
    requestRender();
  });
  const detachQueueAction = strategicHud.onQueueAction(({ action, queueId }) => {
    const numericQueueId = Number.isNaN(Number(queueId)) ? queueId : Number(queueId);
    let result = null;
    if (action === 'cycle') {
      result = strategicSimulation.cycleQueueRecipe(numericQueueId);
    } else if (action === 'increase') {
      result = strategicSimulation.adjustQueueTarget(numericQueueId, 1);
    } else if (action === 'decrease') {
      result = strategicSimulation.adjustQueueTarget(numericQueueId, -1);
    } else if (action === 'up' || action === 'down') {
      result = strategicSimulation.moveProductionQueue(numericQueueId, action);
    } else if (action === 'remove') {
      result = strategicSimulation.removeProductionQueue(numericQueueId);
    }

    if (!result) {
      return;
    }

    const message = result.ok
      ? formatQueueActionMessage(action, result.queue)
      : result.reason ?? 'Unable to update queue.';
    strategicSimulation.setNotification(message, result.ok ? 'info' : 'warning');
    renderStrategicHud();
    requestRender();
  });
  const detachTradeAction = strategicHud.onTradeAction(
    ({ action, producerCountryId, contractId, portId }) => {
      let result = null;
      if (action === 'sign') {
        result = strategicSimulation.createTradeContract(Number(producerCountryId));
      } else if (action === 'cancel') {
        result = strategicSimulation.cancelTradeContract(contractId);
      } else if (action === 'stabilize') {
        result = strategicSimulation.stabilizeTradeContract(contractId);
      } else if (action === 'upgrade-port') {
        result = strategicSimulation.upgradePortInfrastructure(portId);
      }
      if (!result) {
        return;
      }

      const message = result.ok
        ? action === 'sign'
          ? `${result.contract.producerName} oil contract activated.`
          : action === 'cancel'
            ? `${result.contract.producerName} oil contract cancelled.`
            : action === 'stabilize'
              ? `${result.contract.producerName} route stabilized.`
              : `${result.port.name} expanded to level ${result.port.upgradeLevel}.`
        : result.reason ?? 'Unable to update trade contract.';
      strategicSimulation.setNotification(message, result.ok ? 'info' : 'warning');
      renderStrategicHud();
      requestRender();
    },
  );

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
    queueSavedGameLoad(savedGameState) {
      pendingSavedGameState = savedGameState ?? null;
    },
    captureSaveState() {
      const session = sessionStore.getSnapshot();
      if (!session.started || !activeCountryIso3) {
        return null;
      }

      return {
        session: {
          activeCountryIso3,
          godView,
        },
        strategic: strategicSimulation.serializeState(),
        radar: radarSimulation.serializeState(),
        naval: navalSimulation.serializeState(),
        logistics: logisticsSimulation.serializeState(),
        deployment: deploymentSimulation.serializeState(),
        disruption: disruptionSimulation.serializeState(),
        intercept: interceptSimulation.serializeState(),
        ai: strategicAiSimulation.serializeState(),
        events: campaignEvents.serializeState(),
        spentSiloIds: installationStore.getSpentSiloIds(),
      };
    },
    getSaveSummary() {
      return strategicSimulation.getSaveSummary();
    },
    dispose() {
      running = false;
      sceneContext.controls.removeEventListener('change', requestRender);
      sceneContext.renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      sceneContext.renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      sceneContext.renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      sceneContext.renderer.domElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
      detachMissile();
      detachSiteFilter();
      detachWarheadIncrease();
      detachWarheadDecrease();
      detachNaval();
      detachRadar();
      detachRadarModeCycle();
      detachViewLaunch();
      detachViewRadar();
      detachViewNaval();
      detachViewBases();
      detachViewContext();
      detachReset();
      detachBuildChipFactory();
      detachBuildMilitaryFactory();
      detachCancelPlacement();
      detachUpgradeFactory();
      detachToggleFactoryPaused();
      detachCycleFactoryEmphasis();
      detachAddChipQueue();
      detachAddMilitaryQueue();
      detachQueueAction();
      detachTradeAction();
      detachSession();
      missileOverlay.dispose();
      countryBorders.dispose();
      cityLabels.dispose();
      industrialOverlay.dispose();
      tradeRouteOverlay.dispose();
      hubOverlay.dispose();
      supplyNetworkOverlay.dispose();
      radarVisualSystem.dispose();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    },
  };

  function formatQueueActionMessage(action, queue) {
    if (action === 'cycle') {
      return `Queue switched to ${queue.recipe.name}.`;
    }
    if (action === 'increase' || action === 'decrease') {
      return `${queue.recipe.name} target set to ${queue.targetQuantity} batches.`;
    }
    if (action === 'up' || action === 'down') {
      return `${queue.recipe.name} queue order updated.`;
    }
    if (action === 'remove') {
      return `${queue.recipe.name} queue removed.`;
    }
    return 'Queue updated.';
  }
}
