import * as THREE from 'three';
import { createSceneContext } from '../core/createSceneContext.js';
import { createHudController } from '../ui/createHudController.js';
import { createChromeController } from '../ui/createChromeController.js';
import { createNavalSimulation } from '../simulation/createNavalSimulation.js';
import { createRadarSimulation } from '../simulation/createRadarSimulation.js';
import { createSpaceEnvironment } from '../world/factories/createSpaceEnvironment.js';
import { createCelestialSystem } from '../world/factories/createCelestialSystem.js';
import { createRadarVisualSystem } from '../world/factories/createRadarVisualSystem.js';
import { createCityLabelSystem } from '../world/systems/createCityLabelSystem.js';
import { createCountryBorderSystem } from '../world/systems/createCountryBorderSystem.js';
import { createMissileOverlaySystem } from '../world/systems/createMissileOverlaySystem.js';
import { renderConfig, simulationConfig, worldConfig } from '../config/simulationConfig.js';
import { createMilitaryInstallationStore } from '../data/createMilitaryInstallationStore.js';
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
  const hud = createHudController({ document });
  const chrome = createChromeController({ document });
  const environment = createSpaceEnvironment({ scene: sceneContext.scene, renderConfig });
  const navalSimulation = createNavalSimulation({ worldConfig });
  const radarSimulation = createRadarSimulation({ simulationConfig, worldConfig });
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

    hud.render({ missile: primaryMissile });

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

    const country = installationStore.getActiveCountry();
    let launchIndex = 0;

    for (const target of selection.targets) {
      const silos = installationStore.selectLaunchSilos({
        iso3: country,
        targetLat: target.lat,
        targetLon: target.lon,
        count: 1,
      });

      if (silos.length === 0) {
        continue;
      }

      const silo = silos[0];
      installationStore.markSiloSpent(silo.id);
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
    installationStore.markSiloSpent(selection.launchSite.id);
    launchSingleMissile({
      launchSite: selection.launchSite,
      target: selection.target,
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
    radarSimulation.placeGroundRadar({
      countryIso3: activeCountryIso3,
      lat: radarSelection.groundTarget.lat,
      lon: radarSelection.groundTarget.lon,
    });
    radarSelection.groundTarget = null;
    requestRender();
  }

  function confirmSatelliteLaunch() {
    if (!activeCountryIso3 || !radarSelection.satelliteSlot) {
      return;
    }
    radarSimulation.launchEarlyWarningSatellite({
      countryIso3: activeCountryIso3,
      slotLongitude: radarSelection.satelliteSlot.longitude,
      earthRotationRadians: celestialSystem.getEarthRotationRadians(),
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
    activeCountryIso3 = session.activeCountryIso3;

    if (activeCountryIso3) {
      installationStore.setActiveCountry(activeCountryIso3);
    }
    missileOverlay.setGodView(godView);
    missileOverlay.setPreviewCountry(session.started ? null : activeCountryIso3);
    countryBorders.setActiveCountry(session.started ? activeCountryIso3 : null);
    countryBorders.setPreviewCountry(session.started ? null : activeCountryIso3);
    sceneContext.controls.enabled = session.started && !session.paused;

    if (!session.started || countryChanged) {
      resetBattleInputs();
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
      detachNaval();
      detachRadar();
      detachRadarModeCycle();
      detachViewLaunch();
      detachViewRadar();
      detachViewNaval();
      detachViewBases();
      detachViewContext();
      detachReset();
      detachSession();
      missileOverlay.dispose();
      countryBorders.dispose();
      cityLabels.dispose();
      radarVisualSystem.dispose();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    },
  };
}
