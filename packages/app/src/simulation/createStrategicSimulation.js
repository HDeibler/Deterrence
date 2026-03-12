import {
  ASSET_STORAGE_RULES,
  BASE_TYPE_LABELS,
} from '../game/data/baseCapabilityCatalog.js';

const RESOURCE_ORDER = ['oil', 'rare_earths', 'chips'];
const RESOURCE_LABELS = {
  oil: 'Oil',
  rare_earths: 'Rare Earths',
  chips: 'Chips',
};
const INVENTORY_LABELS = {
  radar: 'Radar Arrays',
  missile_inventory: 'Missile Inventory',
  early_warning_satellite: 'Early Warning Satellites',
};
const FACILITY_LABELS = {
  chip_factory: 'Chip Factory',
  military_factory: 'Military Factory',
};
const INITIAL_DEPLOYMENT_RATIO = 0.65;
const DEFAULT_START_DATE_ISO = '2026-01-01T00:00:00.000Z';
const INDUSTRIAL_PROJECTS = {
  chip_factory: {
    key: 'chip_factory',
    label: 'Chip Factory',
    shortLabel: 'Chip',
    facilityType: 'chip_factory',
    treasuryCost: 120000,
    resourceCosts: {
      oil: 25,
      rare_earths: 40,
      chips: 12,
    },
    throughputBonus: 0.22,
  },
  military_factory: {
    key: 'military_factory',
    label: 'Military Factory',
    shortLabel: 'Military',
    facilityType: 'military_factory',
    treasuryCost: 180000,
    resourceCosts: {
      oil: 40,
      rare_earths: 8,
      chips: 28,
    },
    throughputBonus: 0.18,
  },
};
const INDUSTRIAL_UPGRADE_MULTIPLIER = 0.45;
const INDUSTRIAL_MAX_UPGRADE_LEVEL = 2;
const PROJECT_EMPHASIS_MODES = {
  chip_factory: ['balanced', 'surge', 'conserve'],
  military_factory: ['balanced', 'radar', 'missiles'],
};
const PROJECT_EMPHASIS_LABELS = {
  balanced: 'Balanced',
  surge: 'Surge Output',
  conserve: 'Conserve Stocks',
  radar: 'Radar Focus',
  missiles: 'Missile Focus',
};
const STRATEGIC_RECIPES = {
  'chip-fabrication': {
    key: 'chip-fabrication',
    name: 'Chip Fabrication Batch',
    facilityType: 'chip_factory',
    outputType: 'resource',
    outputKey: 'chips',
    outputAmount: 12,
    durationHours: 1,
    costs: { oil: 4, rare_earths: 9, chips: 0 },
    defaultTargetQuantity: 120,
    unlockRule: 'always',
  },
  'radar-array': {
    key: 'radar-array',
    name: 'Ground Radar Array',
    facilityType: 'military_factory',
    outputType: 'inventory',
    outputKey: 'radar',
    outputAmount: 1,
    durationHours: 18,
    costs: { oil: 28, rare_earths: 2, chips: 14 },
    defaultTargetQuantity: 8,
    unlockRule: 'airbase_network',
  },
  'missile-salvo': {
    key: 'missile-salvo',
    name: 'Missile Salvo',
    facilityType: 'military_factory',
    outputType: 'inventory',
    outputKey: 'missile_inventory',
    outputAmount: 4,
    durationHours: 14,
    costs: { oil: 32, rare_earths: 1, chips: 10 },
    defaultTargetQuantity: 12,
    unlockRule: 'silo_network',
  },
  'orbital-watch': {
    key: 'orbital-watch',
    name: 'Orbital Watch Payload',
    facilityType: 'military_factory',
    outputType: 'inventory',
    outputKey: 'early_warning_satellite',
    outputAmount: 1,
    durationHours: 32,
    costs: { oil: 18, rare_earths: 6, chips: 34 },
    defaultTargetQuantity: 3,
    unlockRule: 'space_program',
  },
};
const FACILITY_BASELINE_CAPACITY = {
  chip_factory: 1,
  military_factory: 1,
};
const CAMPAIGN_OBJECTIVES = [
  {
    id: 'place_chip_factory',
    title: 'Expand Chip Supply',
    detail: 'Place your first chip factory in domestic territory.',
    rewardTreasury: 60000,
    isComplete: (state) => countProjectsByKey(state, 'chip_factory') >= 1,
    getProgressLabel: (state) => `${countProjectsByKey(state, 'chip_factory')}/1 placed`,
  },
  {
    id: 'place_military_factory',
    title: 'Open Military Production',
    detail: 'Place your first military factory.',
    rewardTreasury: 80000,
    isComplete: (state) => countProjectsByKey(state, 'military_factory') >= 1,
    getProgressLabel: (state) => `${countProjectsByKey(state, 'military_factory')}/1 placed`,
  },
  {
    id: 'upgrade_military_factory',
    title: 'Modernize Industry',
    detail: 'Upgrade any military factory to level 1.',
    rewardTreasury: 90000,
    isComplete: (state) =>
      state.industrialProjects.some(
        (project) =>
          project.facilityType === 'military_factory' && toNumber(project.upgradeLevel, 0) >= 1,
      ),
    getProgressLabel: (state) =>
      `${state.industrialProjects.filter((project) => project.facilityType === 'military_factory' && toNumber(project.upgradeLevel, 0) >= 1).length}/1 upgraded`,
  },
  {
    id: 'queue_missiles',
    title: 'Commit To Missile Output',
    detail: 'Add or convert a queue to Missile Salvo production.',
    rewardTreasury: 50000,
    isComplete: (state) => state.queues.some((queue) => queue.recipe.key === 'missile-salvo'),
    getProgressLabel: (state) =>
      `${state.queues.filter((queue) => queue.recipe.key === 'missile-salvo').length}/1 queues configured`,
  },
  {
    id: 'sign_oil_contract',
    title: 'Secure Foreign Oil',
    detail: 'Sign your first oil import contract.',
    rewardTreasury: 70000,
    isComplete: (state) => state.tradeContracts.some((contract) => contract.resourceKey === 'oil'),
    getProgressLabel: (state) =>
      `${state.tradeContracts.filter((contract) => contract.resourceKey === 'oil').length}/1 contracts active`,
  },
  {
    id: 'stock_missiles',
    title: 'Fill The Arsenal',
    detail: 'Accumulate 24 missile inventory across reserve and domestic silos.',
    rewardTreasury: 120000,
    isComplete: (state) => getTotalInventory(state, 'missile_inventory') >= 24,
    getProgressLabel: (state) =>
      `${formatAmount(getTotalInventory(state, 'missile_inventory'))}/24 inventory`,
  },
  {
    id: 'unlock_orbital_watch',
    title: 'Activate Space Program',
    detail: 'Unlock Orbital Watch Payload production.',
    rewardTreasury: 140000,
    isComplete: (state) =>
      getRecipeAvailability(state, STRATEGIC_RECIPES['orbital-watch']).available,
    getProgressLabel: (state) =>
      getRecipeAvailability(state, STRATEGIC_RECIPES['orbital-watch']).available
        ? 'Unlocked'
        : getRecipeAvailability(state, STRATEGIC_RECIPES['orbital-watch']).reason,
  },
];
const CONTRACT_VOLUME_FACTOR = 0.38;
const HOME_IMPORT_PORTS = {
  USA: { id: 'home-usa', name: 'San Diego Naval Terminal', lat: 32.692, lon: -117.201, throughputPerHour: 9.5 },
  CHN: { id: 'home-chn', name: 'Shanghai Import Terminal', lat: 31.230, lon: 121.473, throughputPerHour: 10.8 },
  RUS: { id: 'home-rus', name: 'Vladivostok Fuel Port', lat: 43.115, lon: 131.885, throughputPerHour: 7.4 },
};
const PRODUCER_PORTS = {
  SAU: { id: 'producer-sau', name: 'Ras Tanura Export Port', lat: 26.643, lon: 50.157, throughputPerHour: 12.2 },
  ARE: { id: 'producer-are', name: 'Jebel Ali Fuel Port', lat: 25.011, lon: 55.060, throughputPerHour: 8.6 },
  IRQ: { id: 'producer-irq', name: 'Basra Offshore Terminal', lat: 29.761, lon: 48.773, throughputPerHour: 6.8 },
  KAZ: { id: 'producer-kaz', name: 'Aktau Energy Port', lat: 43.653, lon: 51.197, throughputPerHour: 5.4 },
  NOR: { id: 'producer-nor', name: 'Stavanger Energy Port', lat: 58.970, lon: 5.733, throughputPerHour: 5.1 },
  CAN: { id: 'producer-can', name: 'Halifax Atlantic Terminal', lat: 44.648, lon: -63.575, throughputPerHour: 7.8 },
  BRA: { id: 'producer-bra', name: 'Rio Offshore Terminal', lat: -22.906, lon: -43.172, throughputPerHour: 6.2 },
  NGA: { id: 'producer-nga', name: 'Bonny Export Terminal', lat: 4.452, lon: 7.170, throughputPerHour: 5.9 },
};
const TANKER_SPEED_KMH = 46;
const DISRUPTION_RECOVERY_COST = 65000;
const PORT_MAX_UPGRADE_LEVEL = 3;

export function createStrategicSimulation() {
  let state = createEmptyState();

  return {
    clear() {
      state = createEmptyState();
    },
    setBootstrap(bootstrap, domesticBases = []) {
      state = createStateFromBootstrap(bootstrap, domesticBases);
    },
    loadState(serializedState, domesticBases = [], bootstrap = null) {
      state = createStateFromSerialized(serializedState, domesticBases, bootstrap);
    },
    step(stepSeconds) {
      if (!state.ready || !Number.isFinite(stepSeconds) || stepSeconds <= 0) {
        return;
      }

      const deltaHours = stepSeconds / 3600;
      stepNotification(state, stepSeconds);
      stepObjectives(state);
      stepRouteDisruption(state, deltaHours);
      const { finance, resources, baselines, queues, reserveInventories } = state;
      const contractCostPerHour = computeTradeContractCostPerHour(state);

      state.currentDateMs += stepSeconds * 1000;
      finance.treasuryBalance += (finance.netPerHour - contractCostPerHour) * deltaHours;

      for (const resourceKey of RESOURCE_ORDER) {
        const baseline = baselines[resourceKey] ?? { productionPerHour: 0, upkeepPerHour: 0 };
        resources[resourceKey] = Math.max(
          0,
          resources[resourceKey] + (baseline.productionPerHour - baseline.upkeepPerHour) * deltaHours,
        );
      }

      stepTradeContracts(state, deltaHours);

      for (const queue of queues) {
        if (queue.completedQuantity >= queue.targetQuantity) {
          queue.progressUnits = 0;
          continue;
        }

        const throughputMultiplier = computeQueueThroughputMultiplier(state, queue);
        const possibleProgress = (deltaHours * throughputMultiplier) / queue.recipe.durationHours;
        const remainingProgress = queue.targetQuantity - queue.completedQuantity - queue.progressUnits;
        const resourceBoundedProgress = computeResourceBoundedProgress(resources, queue.recipe.costs);
        const actualProgress = Math.max(
          0,
          Math.min(possibleProgress, remainingProgress, resourceBoundedProgress),
        );

        if (actualProgress <= 0) {
          continue;
        }

        for (const resourceKey of RESOURCE_ORDER) {
          const cost = queue.recipe.costs[resourceKey] ?? 0;
          if (cost > 0) {
            resources[resourceKey] = Math.max(0, resources[resourceKey] - cost * actualProgress);
          }
        }

        queue.progressUnits += actualProgress;
        const completedThisStep = Math.floor(queue.progressUnits);
        if (completedThisStep <= 0) {
          continue;
        }

        queue.completedQuantity = Math.min(
          queue.targetQuantity,
          queue.completedQuantity + completedThisStep,
        );
        queue.progressUnits -= completedThisStep;
        if (queue.completedQuantity >= queue.targetQuantity) {
          queue.progressUnits = 0;
        }

        const outputKey = normalizeKey(queue.recipe.outputKey);
        if (!outputKey) {
          continue;
        }
        if (queue.recipe.outputType === 'resource') {
          resources[outputKey] = (resources[outputKey] ?? 0) +
            completedThisStep * queue.recipe.outputAmount;
        } else {
          reserveInventories[outputKey] = (reserveInventories[outputKey] ?? 0) +
            completedThisStep * queue.recipe.outputAmount;
        }
      }

      allocateReserveToBases(state, deltaHours);
    },
    getReserveInventory(assetKey) {
      if (!state.ready) {
        return 0;
      }
      return state.reserveInventories[normalizeKey(assetKey)] ?? 0;
    },
    getTotalBaseInventory(assetKey) {
      if (!state.ready) {
        return 0;
      }
      const normalizedKey = normalizeKey(assetKey);
      if (!normalizedKey) {
        return 0;
      }
      let total = 0;
      for (const baseInventory of Object.values(state.baseInventories)) {
        total += baseInventory[normalizedKey] ?? 0;
      }
      return total;
    },
    getBaseInventory(baseId, assetKey) {
      if (!state.ready) {
        return 0;
      }
      return state.baseInventories[baseId]?.[normalizeKey(assetKey)] ?? 0;
    },
    getLoadedBaseCount(assetKey) {
      if (!state.ready) {
        return 0;
      }
      const normalizedKey = normalizeKey(assetKey);
      if (!normalizedKey) {
        return 0;
      }
      return state.bases.filter(
        (base) => base.active && (state.baseInventories[base.id]?.[normalizedKey] ?? 0) >= 1,
      ).length;
    },
    consumeBaseInventory(assetKey, amount = 1, baseId = null) {
      if (!state.ready) {
        return null;
      }
      const normalizedKey = normalizeKey(assetKey);
      if (!normalizedKey || amount <= 0) {
        return null;
      }

      const targetBase =
        baseId !== null
          ? state.baseIndex[baseId] ?? null
          : pickBestBaseForAsset(state, normalizedKey, amount);
      if (!targetBase || !targetBase.active) {
        return null;
      }

      const available = state.baseInventories[targetBase.id]?.[normalizedKey] ?? 0;
      if (available < amount) {
        return null;
      }

      state.baseInventories[targetBase.id][normalizedKey] = available - amount;
      return {
        baseId: targetBase.id,
        baseName: targetBase.name,
      };
    },
    disableBase(baseId) {
      if (!state.ready) {
        return;
      }
      const base = state.baseIndex[baseId];
      if (!base) {
        return;
      }
      base.active = false;
      state.baseInventories[baseId] = {};
    },
    canAffordIndustrialProject(projectKey) {
      if (!state.ready) {
        return false;
      }
      return canAffordProject(state, projectKey);
    },
    placeIndustrialProject(projectKey, { lat, lon } = {}) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const project = INDUSTRIAL_PROJECTS[projectKey];
      if (!project) {
        return { ok: false, reason: 'Unknown project type' };
      }
      if (!canAffordProject(state, projectKey)) {
        return { ok: false, reason: `Insufficient funds or materials for ${project.label}.` };
      }

      state.finance.treasuryBalance -= project.treasuryCost;
      for (const [resourceKey, cost] of Object.entries(project.resourceCosts)) {
        state.resources[resourceKey] = Math.max(0, (state.resources[resourceKey] ?? 0) - cost);
      }

      const nextId = `${projectKey}-${state.nextProjectId}`;
      state.nextProjectId += 1;
      state.industrialProjects.push({
        id: nextId,
        key: projectKey,
        label: project.label,
        facilityType: project.facilityType,
        lat,
        lon,
        baseThroughputBonus: project.throughputBonus,
        upgradeLevel: 0,
        paused: false,
        emphasis: 'balanced',
      });
      return {
        ok: true,
        project: state.industrialProjects[state.industrialProjects.length - 1],
      };
    },
    upgradeIndustrialProject(projectId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const project = state.industrialProjects.find((entry) => entry.id === projectId);
      if (!project) {
        return { ok: false, reason: 'Factory not found.' };
      }
      if (project.upgradeLevel >= INDUSTRIAL_MAX_UPGRADE_LEVEL) {
        return { ok: false, reason: `${project.label} is already at max upgrade.` };
      }

      const cost = getProjectUpgradeCost(project);
      if (state.finance.treasuryBalance < cost.treasuryCost) {
        return { ok: false, reason: 'Insufficient treasury for upgrade.' };
      }
      for (const [resourceKey, amount] of Object.entries(cost.resourceCosts)) {
        if ((state.resources[resourceKey] ?? 0) < amount) {
          return { ok: false, reason: `Insufficient ${RESOURCE_LABELS[resourceKey] ?? resourceKey} for upgrade.` };
        }
      }

      state.finance.treasuryBalance -= cost.treasuryCost;
      for (const [resourceKey, amount] of Object.entries(cost.resourceCosts)) {
        state.resources[resourceKey] = Math.max(0, (state.resources[resourceKey] ?? 0) - amount);
      }
      project.upgradeLevel += 1;
      return { ok: true, project };
    },
    toggleIndustrialProjectPaused(projectId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const project = state.industrialProjects.find((entry) => entry.id === projectId);
      if (!project) {
        return { ok: false, reason: 'Factory not found.' };
      }
      project.paused = !project.paused;
      return { ok: true, project };
    },
    cycleIndustrialProjectEmphasis(projectId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const project = state.industrialProjects.find((entry) => entry.id === projectId);
      if (!project) {
        return { ok: false, reason: 'Factory not found.' };
      }
      const modes = PROJECT_EMPHASIS_MODES[project.facilityType] ?? ['balanced'];
      const currentIndex = Math.max(modes.indexOf(project.emphasis), 0);
      project.emphasis = modes[(currentIndex + 1) % modes.length];
      return { ok: true, project };
    },
    addProductionQueue(facilityType) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const recipes = getAvailableRecipesForFacilityType(state, facilityType);
      if (recipes.length === 0) {
        return { ok: false, reason: 'No recipes available for this facility.' };
      }
      const recipe = recipes[0];
      const queue = createQueueFromRecipe(recipe, state.nextQueueId);
      state.nextQueueId += 1;
      state.queues.push(queue);
      normalizeQueueOrdering(state);
      return { ok: true, queue };
    },
    cycleQueueRecipe(queueId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const queue = state.queues.find((entry) => entry.id === queueId);
      if (!queue) {
        return { ok: false, reason: 'Queue not found.' };
      }
      const recipes = getAvailableRecipesForFacilityType(state, queue.facilityType, queue.recipe.key);
      if (recipes.length <= 1) {
        return { ok: false, reason: 'No alternate recipe available.' };
      }
      const currentIndex = Math.max(
        recipes.findIndex((entry) => entry.key === queue.recipe.key),
        0,
      );
      const nextRecipe = recipes[(currentIndex + 1) % recipes.length];
      const nextTarget = Math.max(queue.completedQuantity, nextRecipe.defaultTargetQuantity);
      queue.recipe = cloneRecipe(nextRecipe);
      queue.targetQuantity = Math.max(nextTarget, 1);
      queue.completedQuantity = 0;
      queue.progressUnits = 0;
      return { ok: true, queue };
    },
    adjustQueueTarget(queueId, delta) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const queue = state.queues.find((entry) => entry.id === queueId);
      if (!queue) {
        return { ok: false, reason: 'Queue not found.' };
      }
      const nextTarget = Math.max(
        Math.ceil(queue.completedQuantity),
        Math.min(999, queue.targetQuantity + delta),
      );
      if (nextTarget === queue.targetQuantity) {
        return { ok: false, reason: 'Queue target cannot be reduced further.' };
      }
      queue.targetQuantity = nextTarget;
      return { ok: true, queue };
    },
    moveProductionQueue(queueId, direction) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const index = state.queues.findIndex((entry) => entry.id === queueId);
      if (index < 0) {
        return { ok: false, reason: 'Queue not found.' };
      }
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= state.queues.length) {
        return { ok: false, reason: 'Queue is already at the edge.' };
      }
      const [queue] = state.queues.splice(index, 1);
      state.queues.splice(nextIndex, 0, queue);
      normalizeQueueOrdering(state);
      return { ok: true, queue };
    },
    removeProductionQueue(queueId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const index = state.queues.findIndex((entry) => entry.id === queueId);
      if (index < 0) {
        return { ok: false, reason: 'Queue not found.' };
      }
      const [queue] = state.queues.splice(index, 1);
      normalizeQueueOrdering(state);
      return { ok: true, queue };
    },
    createTradeContract(producerCountryId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const producer = (state.foreignProducers?.oil ?? []).find(
        (entry) => entry.countryId === producerCountryId,
      );
      if (!producer) {
        return { ok: false, reason: 'Producer not found.' };
      }
      if (state.tradeContracts.some((contract) => contract.producerCountryId === producerCountryId)) {
        return { ok: false, reason: `Contract with ${producer.countryName} already active.` };
      }

      const contract = {
        id: `oil-contract-${state.nextContractId}`,
        producerCountryId: producer.countryId,
        producerIso3: producer.countryIso3,
        producerName: producer.countryName,
        resourceKey: producer.resourceKey,
        originPort: getProducerPort(producer.countryIso3),
        destinationPort: getHomeImportPort(state.country?.iso3),
        tripDistanceKm: calculateRouteDistanceKm(
          getProducerPort(producer.countryIso3),
          getHomeImportPort(state.country?.iso3),
        ),
        tripHours: Math.max(
          8,
          calculateRouteDistanceKm(getProducerPort(producer.countryIso3), getHomeImportPort(state.country?.iso3)) /
            TANKER_SPEED_KMH,
        ),
        cargoPerTrip: Math.max(18, Number(producer.productionPerHour) * CONTRACT_VOLUME_FACTOR * 18),
        unitCost: Number(producer.contractUnitCost),
        routeRisk: Number(producer.routeRisk),
        reliability: Math.max(0.45, 1 - Number(producer.routeRisk) * 0.7),
        tankerProgress: Math.random() * 0.65,
        tankerCount: 1,
        deliveredTotal: 0,
        disruptionHoursRemaining: 0,
        disruptionSeverity: 0,
      };
      state.nextContractId += 1;
      state.tradeContracts.push(contract);
      return { ok: true, contract };
    },
    cancelTradeContract(contractId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const index = state.tradeContracts.findIndex((contract) => contract.id === contractId);
      if (index < 0) {
        return { ok: false, reason: 'Contract not found.' };
      }
      const [contract] = state.tradeContracts.splice(index, 1);
      return { ok: true, contract };
    },
    stabilizeTradeContract(contractId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const contract = state.tradeContracts.find((entry) => entry.id === contractId);
      if (!contract) {
        return { ok: false, reason: 'Contract not found.' };
      }
      if (!contract.disruptionHoursRemaining || contract.disruptionHoursRemaining <= 0) {
        return { ok: false, reason: 'Route is already stable.' };
      }
      if (state.finance.treasuryBalance < DISRUPTION_RECOVERY_COST) {
        return { ok: false, reason: 'Insufficient treasury for route recovery.' };
      }
      state.finance.treasuryBalance -= DISRUPTION_RECOVERY_COST;
      contract.disruptionHoursRemaining = 0;
      contract.disruptionSeverity = 0;
      return { ok: true, contract };
    },
    upgradePortInfrastructure(portId) {
      if (!state.ready) {
        return { ok: false, reason: 'State not ready' };
      }
      const port = state.portInfrastructure?.[portId];
      if (!port) {
        return { ok: false, reason: 'Port not found.' };
      }
      if (!port.controlled) {
        return { ok: false, reason: 'Only home ports can be upgraded right now.' };
      }
      if (toNumber(port.upgradeLevel, 0) >= PORT_MAX_UPGRADE_LEVEL) {
        return { ok: false, reason: 'Port is already at maximum level.' };
      }

      const upgradeCost = getPortUpgradeCost(port);
      if (state.finance.treasuryBalance < upgradeCost.treasuryCost) {
        return { ok: false, reason: 'Insufficient treasury for port expansion.' };
      }
      for (const [resourceKey, cost] of Object.entries(upgradeCost.resourceCosts)) {
        if ((state.resources[resourceKey] ?? 0) < cost) {
          return {
            ok: false,
            reason: `Insufficient ${RESOURCE_LABELS[resourceKey] ?? resourceKey} for port expansion.`,
          };
        }
      }

      state.finance.treasuryBalance -= upgradeCost.treasuryCost;
      for (const [resourceKey, cost] of Object.entries(upgradeCost.resourceCosts)) {
        state.resources[resourceKey] = Math.max(0, (state.resources[resourceKey] ?? 0) - cost);
      }
      port.upgradeLevel = toNumber(port.upgradeLevel, 0) + 1;
      port.throughputBonusPerHour = computePortThroughputBonus(port.upgradeLevel);
      port.resilienceBonus = computePortResilienceBonus(port.upgradeLevel);
      return { ok: true, port };
    },
    setNotification(message, severity = 'info', durationSeconds = 4) {
      if (!state.ready) {
        return;
      }
      state.notification = {
        message,
        severity,
        remainingSeconds: durationSeconds,
      };
    },
    serializeState() {
      if (!state.ready) {
        return null;
      }
      return {
        country: state.country,
        currentDateMs: state.currentDateMs,
        finance: { ...state.finance },
        resources: { ...state.resources },
        baselines: cloneRecord(state.baselines),
        reserveInventories: { ...state.reserveInventories },
        bases: state.bases.map((base) => ({ ...base, capacities: { ...base.capacities } })),
        baseInventories: cloneRecord(state.baseInventories),
        industrialProjects: state.industrialProjects.map((project) => ({ ...project })),
        nextProjectId: state.nextProjectId,
        nextQueueId: state.nextQueueId,
        nextContractId: state.nextContractId,
        completedObjectives: { ...(state.completedObjectives ?? {}) },
        foreignProducers: cloneProducerGroups(state.foreignProducers ?? {}),
        portInfrastructure: cloneRecord(state.portInfrastructure ?? {}),
        tradeContracts: state.tradeContracts.map((contract) => ({ ...contract })),
        queues: state.queues.map((queue) => ({
          ...queue,
          recipe: {
            ...queue.recipe,
            costs: { ...queue.recipe.costs },
          },
        })),
      };
    },
    getSaveSummary() {
      if (!state.ready || !state.country) {
        return null;
      }
      const snapshot = buildSnapshot(state);
      return {
        countryIso3: state.country.iso3,
        countryName: state.country.name,
        gameDateIso: new Date(state.currentDateMs).toISOString(),
        gameDateLabel: formatGameDate(state.currentDateMs),
        treasuryBalance: snapshot.finance?.treasuryBalance ?? 0,
        resources: snapshot.resources.map((entry) => ({
          key: entry.key,
          label: entry.label,
          amount: entry.amount,
        })),
        reserveInventories: snapshot.reserveInventories,
        baseSummaries: snapshot.baseSummaries,
      };
    },
    getSnapshot() {
      return buildSnapshot(state);
    },
  };
}

function createEmptyState() {
  return {
    ready: false,
    country: null,
    notification: null,
    finance: {
      treasuryBalance: 0,
      taxIncomePerHour: 0,
      exportRevenuePerHour: 0,
      importCostPerHour: 0,
      operatingCostPerHour: 0,
      basingCostPerHour: 0,
      netPerHour: 0,
    },
    currentDateMs: Date.parse(DEFAULT_START_DATE_ISO),
    resources: {
      oil: 0,
      rare_earths: 0,
      chips: 0,
    },
    baselines: {},
    reserveInventories: {},
    bases: [],
    baseIndex: {},
    baseInventories: {},
    industrialProjects: [],
    nextProjectId: 1,
    nextQueueId: 1,
    nextContractId: 1,
    completedObjectives: {},
    foreignProducers: {},
    portInfrastructure: {},
    tradeContracts: [],
    queues: [],
  };
}

function createStateFromBootstrap(bootstrap, domesticBases) {
  const finance = {
    treasuryBalance: toNumber(bootstrap?.economy?.treasuryBalance),
    taxIncomePerHour: toNumber(bootstrap?.economy?.taxIncomePerHour),
    exportRevenuePerHour: toNumber(bootstrap?.economy?.exportRevenuePerHour),
    importCostPerHour: toNumber(bootstrap?.economy?.importCostPerHour),
    operatingCostPerHour: toNumber(bootstrap?.economy?.operatingCostPerHour),
    basingCostPerHour: toNumber(bootstrap?.economy?.basingCostPerHour),
    netPerHour: 0,
  };
  finance.netPerHour =
    finance.taxIncomePerHour +
    finance.exportRevenuePerHour -
    finance.importCostPerHour -
    finance.operatingCostPerHour -
    finance.basingCostPerHour;

  const resources = { oil: 0, rare_earths: 0, chips: 0 };
  for (const entry of bootstrap?.stockpiles ?? []) {
    const resourceKey = normalizeKey(entry.resourceKey);
    if (!resourceKey) {
      continue;
    }
    resources[resourceKey] = toNumber(entry.amount);
  }

  const baselines = {};
  for (const entry of bootstrap?.resourceBaselines ?? []) {
    const resourceKey = normalizeKey(entry.resourceKey);
    if (!resourceKey) {
      continue;
    }
    baselines[resourceKey] = {
      productionPerHour: toNumber(entry.productionPerHour),
      upkeepPerHour: toNumber(entry.upkeepPerHour),
    };
  }

  const reserveInventories = {};
  for (const entry of bootstrap?.inventories ?? []) {
    const assetKey = normalizeKey(entry.assetKey);
    if (!assetKey) {
      continue;
    }
    reserveInventories[assetKey] = toNumber(entry.amount);
  }

  const bases = (domesticBases ?? []).map((base) => ({
    ...base,
    active: base.active !== false,
  }));
  const baseIndex = Object.fromEntries(bases.map((base) => [base.id, base]));
  const baseInventories = Object.fromEntries(bases.map((base) => [base.id, {}]));

  const queues = (bootstrap?.productionQueues ?? []).map((entry) => ({
    id: entry.id,
    facilityType: entry.facilityType,
    targetQuantity: toNumber(entry.targetQuantity),
    completedQuantity: toNumber(entry.completedQuantity),
    progressUnits: toNumber(entry.progressUnits),
    recipe: {
      key: entry.recipeKey,
      name: entry.recipeName,
      outputType: entry.outputType,
      outputKey: entry.outputKey,
      outputAmount: toNumber(entry.outputAmount, 1),
      durationHours: Math.max(toNumber(entry.durationHours, 1), 0.01),
      costs: {
        oil: toNumber(entry.oilCost),
        rare_earths: toNumber(entry.rareEarthCost),
        chips: toNumber(entry.chipCost),
      },
    },
  }));

  const state = {
    ready: true,
    country: bootstrap?.country ?? null,
    notification: null,
    finance,
    currentDateMs: Date.parse(DEFAULT_START_DATE_ISO),
    resources,
    baselines,
    reserveInventories,
    bases,
    baseIndex,
    baseInventories,
    industrialProjects: [],
    nextProjectId: 1,
    nextQueueId:
      (bootstrap?.productionQueues ?? []).reduce(
        (maxId, entry) => Math.max(maxId, Number(entry.id) || 0),
        0,
      ) + 1,
    nextContractId: 1,
    completedObjectives: {},
    foreignProducers: {
      oil: (bootstrap?.foreignProducers?.oil ?? []).map((producer) => ({
        ...producer,
        productionPerHour: toNumber(producer.productionPerHour),
        contractUnitCost: toNumber(producer.contractUnitCost),
        routeRisk: toNumber(producer.routeRisk),
      })),
    },
    portInfrastructure: createInitialPortInfrastructure(bootstrap?.country?.iso3),
    tradeContracts: [],
    queues,
  };

  primeDomesticAllocations(state);
  return state;
}

function createStateFromSerialized(serializedState, domesticBases, bootstrap = null) {
  const baseNetwork = (domesticBases ?? []).map((base) => ({
    ...base,
    active: base.active !== false,
  }));
  const baseIndex = Object.fromEntries(baseNetwork.map((base) => [base.id, base]));
  const baseInventories = Object.fromEntries(baseNetwork.map((base) => [base.id, {}]));

  for (const [baseId, inventory] of Object.entries(serializedState?.baseInventories ?? {})) {
    if (!baseInventories[baseId]) {
      continue;
    }
    for (const [assetKey, amount] of Object.entries(inventory ?? {})) {
      baseInventories[baseId][assetKey] = toNumber(amount);
    }
  }

  for (const savedBase of serializedState?.bases ?? []) {
    const current = baseIndex[savedBase.id];
    if (!current) {
      continue;
    }
    current.active = savedBase.active !== false;
  }

  const savedForeignProducers = cloneProducerGroups(serializedState?.foreignProducers ?? {});
  const bootstrapForeignProducers = {
    oil: (bootstrap?.foreignProducers?.oil ?? []).map((producer) => ({
      ...producer,
      productionPerHour: toNumber(producer.productionPerHour),
      contractUnitCost: toNumber(producer.contractUnitCost),
      routeRisk: toNumber(producer.routeRisk),
    })),
  };
  const effectiveForeignProducers =
    Object.keys(savedForeignProducers).length > 0 ? savedForeignProducers : bootstrapForeignProducers;

  return {
    ready: true,
    country: serializedState?.country ?? bootstrap?.country ?? null,
    notification: null,
    finance: { ...(serializedState?.finance ?? createEmptyState().finance) },
    currentDateMs: toNumber(serializedState?.currentDateMs, Date.parse(DEFAULT_START_DATE_ISO)),
    resources: { ...(serializedState?.resources ?? createEmptyState().resources) },
    baselines: cloneRecord(serializedState?.baselines ?? {}),
    reserveInventories: { ...(serializedState?.reserveInventories ?? {}) },
    bases: baseNetwork,
    baseIndex,
    baseInventories,
    industrialProjects: (serializedState?.industrialProjects ?? []).map((project) => ({
      ...project,
      baseThroughputBonus: toNumber(project.baseThroughputBonus, toNumber(project.throughputBonus)),
      upgradeLevel: toNumber(project.upgradeLevel, 0),
      paused: Boolean(project.paused),
      emphasis: normalizeEmphasis(project.facilityType, project.emphasis),
    })),
    nextProjectId: toNumber(serializedState?.nextProjectId, 1),
    nextQueueId: toNumber(serializedState?.nextQueueId, 1),
    nextContractId: toNumber(serializedState?.nextContractId, 1),
    completedObjectives: { ...(serializedState?.completedObjectives ?? {}) },
    foreignProducers: effectiveForeignProducers,
    portInfrastructure: createPortInfrastructureFromSerialized(
      serializedState?.portInfrastructure,
      serializedState?.country?.iso3 ?? bootstrap?.country?.iso3,
    ),
    tradeContracts: (serializedState?.tradeContracts ?? []).map((contract) => ({ ...contract })),
    queues: (serializedState?.queues ?? []).map((queue) => ({
      ...queue,
      recipe: {
        ...queue.recipe,
        costs: { ...(queue.recipe?.costs ?? {}) },
      },
    })),
  };
}

function buildSnapshot(state) {
  if (!state.ready || !state.country) {
    return {
      status: 'idle',
      country: null,
      notification: null,
      finance: null,
      resources: [],
      reserveInventories: [],
      baseSummaries: [],
      queues: [],
    };
  }

  const queueDemandPerHour = { oil: 0, rare_earths: 0, chips: 0 };
  const queueOutputPerHour = { oil: 0, rare_earths: 0, chips: 0 };
  for (const queue of state.queues) {
    if (queue.completedQuantity >= queue.targetQuantity) {
      continue;
    }
    const throughputMultiplier = computeQueueThroughputMultiplier(state, queue);
    for (const resourceKey of RESOURCE_ORDER) {
      queueDemandPerHour[resourceKey] +=
        ((queue.recipe.costs[resourceKey] ?? 0) / queue.recipe.durationHours) * throughputMultiplier;
    }
    if (queue.recipe.outputType === 'resource' && RESOURCE_ORDER.includes(queue.recipe.outputKey)) {
      queueOutputPerHour[queue.recipe.outputKey] +=
        (queue.recipe.outputAmount / queue.recipe.durationHours) * throughputMultiplier;
    }
  }

  const baseSummaries = buildBaseSummaries(state);
  const objectives = buildObjectiveSnapshot(state);
  const tradeCostPerHour = computeTradeContractCostPerHour(state);
  const oilImportPerHour = computeTradeImportPerHour(state, 'oil');

  return {
    status: 'ready',
    country: state.country,
    notification: state.notification
      ? {
          message: state.notification.message,
          severity: state.notification.severity,
        }
      : null,
    finance: {
      ...state.finance,
      gameDateLabel: formatGameDate(state.currentDateMs),
      gameDateIso: new Date(state.currentDateMs).toISOString(),
      revenuePerHour: state.finance.taxIncomePerHour + state.finance.exportRevenuePerHour,
      expensePerHour:
        state.finance.importCostPerHour +
        state.finance.operatingCostPerHour +
        state.finance.basingCostPerHour +
        tradeCostPerHour,
      tradeCostPerHour,
      effectiveNetPerHour: state.finance.netPerHour - tradeCostPerHour,
    },
    commandCenter: buildCommandCenter(state),
    objectives,
    trade: buildTradeSnapshot(state),
    resources: RESOURCE_ORDER.map((resourceKey) => {
      const baseline = state.baselines[resourceKey] ?? { productionPerHour: 0, upkeepPerHour: 0 };
      const demandPerHour = queueDemandPerHour[resourceKey] ?? 0;
      const importPerHour = resourceKey === 'oil' ? oilImportPerHour : 0;
      return {
        key: resourceKey,
        label: RESOURCE_LABELS[resourceKey] ?? resourceKey,
        amount: state.resources[resourceKey] ?? 0,
        productionPerHour: baseline.productionPerHour,
        upkeepPerHour: baseline.upkeepPerHour,
        importPerHour,
        queueDemandPerHour: demandPerHour,
        queueOutputPerHour: queueOutputPerHour[resourceKey] ?? 0,
        netPerHour:
          baseline.productionPerHour +
          importPerHour +
          (queueOutputPerHour[resourceKey] ?? 0) -
          baseline.upkeepPerHour -
          demandPerHour,
      };
    }),
    reserveInventories: Object.entries(state.reserveInventories)
      .map(([assetKey, amount]) => ({
        key: assetKey,
        label: INVENTORY_LABELS[assetKey] ?? assetKey,
        amount,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    baseSummaries,
    industrialProjects: state.industrialProjects.map((project) => ({
      ...project,
      throughputPercent: Math.round(computeProjectEffectiveBonus(project) * 100),
      upgradeLevel: project.upgradeLevel ?? 0,
      paused: Boolean(project.paused),
      emphasis: normalizeEmphasis(project.facilityType, project.emphasis),
      emphasisLabel:
        PROJECT_EMPHASIS_LABELS[normalizeEmphasis(project.facilityType, project.emphasis)] ??
        'Balanced',
      nextUpgradeCost:
        (project.upgradeLevel ?? 0) < INDUSTRIAL_MAX_UPGRADE_LEVEL
          ? getProjectUpgradeCost(project)
          : null,
    })),
    queues: state.queues.map((queue) => ({
      id: queue.id,
      recipeKey: queue.recipe.key,
      facilityType: queue.facilityType,
      facilityLabel: FACILITY_LABELS[queue.facilityType] ?? queue.facilityType,
      recipeName: queue.recipe.name,
      outputKey: queue.recipe.outputKey,
      outputLabel:
        INVENTORY_LABELS[queue.recipe.outputKey] ??
        RESOURCE_LABELS[queue.recipe.outputKey] ??
        queue.recipe.outputKey,
      outputAmount: queue.recipe.outputAmount,
      throughputPercent: Math.round(
        (computeQueueThroughputMultiplier(state, queue) - 1) * 100,
      ),
      assignmentPercent: Math.round(computeQueueAssignmentFactor(state, queue) * 100),
      targetQuantity: queue.targetQuantity,
      completedQuantity: queue.completedQuantity,
      progressUnits: queue.progressUnits,
      progressRatio:
        queue.targetQuantity > 0
          ? Math.min((queue.completedQuantity + queue.progressUnits) / queue.targetQuantity, 1)
          : 0,
      status: queue.completedQuantity >= queue.targetQuantity ? 'Complete' : 'Running',
      plannerStatus: buildQueuePlannerStatus(state, queue),
      canMoveUp: state.queues.indexOf(queue) > 0,
      canMoveDown: state.queues.indexOf(queue) < state.queues.length - 1,
    })),
  };
}

function buildBaseSummaries(state) {
  const summaries = new Map();

  for (const base of state.bases) {
    const summary = summaries.get(base.baseType) ?? {
      baseType: base.baseType,
      label: BASE_TYPE_LABELS[base.baseType] ?? base.baseType,
      totalBases: 0,
      activeBases: 0,
      loadedBases: 0,
      allocatedAssets: {},
      reservePressure: {},
    };
    summary.totalBases += 1;
    if (base.active) {
      summary.activeBases += 1;
    }

    const inventory = state.baseInventories[base.id] ?? {};
    let isLoaded = false;
    for (const [assetKey, amount] of Object.entries(inventory)) {
      if (amount <= 0) {
        continue;
      }
      isLoaded = true;
      summary.allocatedAssets[assetKey] = (summary.allocatedAssets[assetKey] ?? 0) + amount;
    }
    if (isLoaded) {
      summary.loadedBases += 1;
    }

    summaries.set(base.baseType, summary);
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...summary,
      assetSummary: Object.entries(summary.allocatedAssets)
        .map(([assetKey, amount]) => `${INVENTORY_LABELS[assetKey] ?? assetKey} ${formatAmount(amount)}`)
        .join(' · '),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function allocateReserveToBases(state, deltaHours) {
  for (const [assetKey, rule] of Object.entries(ASSET_STORAGE_RULES)) {
    let remainingReserve = state.reserveInventories[assetKey] ?? 0;
    if (remainingReserve <= 0) {
      continue;
    }

    for (const base of state.bases) {
      if (!base.active) {
        continue;
      }
      const capacity = base.capacities[assetKey] ?? 0;
      if (capacity <= 0) {
        continue;
      }

      const current = state.baseInventories[base.id][assetKey] ?? 0;
      const remainingCapacity = capacity - current;
      if (remainingCapacity <= 0) {
        continue;
      }

      const moveAmount = Math.min(rule.allocationPerHour * deltaHours, remainingCapacity, remainingReserve);
      if (moveAmount <= 0) {
        continue;
      }

      state.baseInventories[base.id][assetKey] = current + moveAmount;
      remainingReserve -= moveAmount;
      if (remainingReserve <= 0) {
        break;
      }
    }

    state.reserveInventories[assetKey] = remainingReserve;
  }
}

function primeDomesticAllocations(state) {
  for (const [assetKey] of Object.entries(ASSET_STORAGE_RULES)) {
    let transferable = (state.reserveInventories[assetKey] ?? 0) * INITIAL_DEPLOYMENT_RATIO;
    if (transferable <= 0) {
      continue;
    }

    for (const base of state.bases) {
      const capacity = base.capacities[assetKey] ?? 0;
      if (!base.active || capacity <= 0) {
        continue;
      }

      const current = state.baseInventories[base.id][assetKey] ?? 0;
      const remainingCapacity = capacity - current;
      if (remainingCapacity <= 0) {
        continue;
      }

      const moveAmount = Math.min(remainingCapacity, transferable);
      if (moveAmount <= 0) {
        continue;
      }

      state.baseInventories[base.id][assetKey] = current + moveAmount;
      transferable -= moveAmount;
      state.reserveInventories[assetKey] -= moveAmount;
      if (transferable <= 0) {
        break;
      }
    }
  }
}

function pickBestBaseForAsset(state, assetKey, amount) {
  let bestBase = null;
  let bestAmount = 0;

  for (const base of state.bases) {
    if (!base.active || (base.capacities[assetKey] ?? 0) <= 0) {
      continue;
    }
    const available = state.baseInventories[base.id]?.[assetKey] ?? 0;
    if (available < amount) {
      continue;
    }
    if (!bestBase || available > bestAmount) {
      bestBase = base;
      bestAmount = available;
    }
  }

  return bestBase;
}

function buildCommandCenter(state) {
  const activeObjective = CAMPAIGN_OBJECTIVES.find((objective) => !state.completedObjectives?.[objective.id]);
  const mostStressedPort = Object.values(computePortPressure(state)).sort(
    (left, right) => right.utilization - left.utilization,
  )[0];
  const resourcePressure = RESOURCE_ORDER
    .map((resourceKey) => {
      const net = computeResourceNetPerHour(state, resourceKey);
      return { resourceKey, net };
    })
    .sort((left, right) => left.net - right.net)[0];

  const leadingProblem =
    mostStressedPort && mostStressedPort.utilization > 1
      ? `${mostStressedPort.name} is congested and dragging supply throughput.`
      : resourcePressure && resourcePressure.net < 0
      ? `${RESOURCE_LABELS[resourcePressure.resourceKey]} is trending negative.`
      : 'Domestic stocks are stable.';
  const nextAction =
    mostStressedPort && mostStressedPort.utilization > 1
      ? `Upgrade ${mostStressedPort.name} or cut contract load before imports stall.`
      : activeObjective
      ? activeObjective.detail
      : resourcePressure && resourcePressure.net < 0
      ? resourcePressure.resourceKey === 'chips'
        ? 'Place a chip factory and keep chips positive.'
        : 'Build industrial capacity before expanding deployments.'
      : 'Place a military factory to turn stable supply into usable assets.';

  return {
    headline: 'Build economy -> fill bases -> project force',
    leadingProblem,
    nextAction,
    projects: Object.values(INDUSTRIAL_PROJECTS).map((project) => ({
      key: project.key,
      label: project.label,
      shortLabel: project.shortLabel,
      affordable: canAffordProject(state, project.key),
      treasuryCost: project.treasuryCost,
      resourceCosts: project.resourceCosts,
      placedCount: state.industrialProjects.filter((entry) => entry.key === project.key).length,
      throughputPercent: Math.round(project.throughputBonus * 100),
    })),
    queueBuildOptions: ['chip_factory', 'military_factory'].map((facilityType) => {
      const recipes = getAvailableRecipesForFacilityType(state, facilityType);
      return {
        facilityType,
        label:
          facilityType === 'chip_factory' ? 'Add Chip Queue' : 'Add Military Queue',
        available: recipes.length > 0,
        detail:
          recipes.length > 0
            ? `${recipes.length} recipe${recipes.length === 1 ? '' : 's'} unlocked`
            : getRecipeAvailabilitySummary(state, facilityType),
      };
    }),
  };
}

function buildObjectiveSnapshot(state) {
  return CAMPAIGN_OBJECTIVES.map((objective) => {
    const completed = Boolean(state.completedObjectives?.[objective.id]);
    return {
      id: objective.id,
      title: objective.title,
      detail: objective.detail,
      rewardTreasury: objective.rewardTreasury,
      completed,
      progressLabel: objective.getProgressLabel(state),
    };
  });
}

function buildTradeSnapshot(state) {
  const activeProducerIds = new Set(state.tradeContracts.map((contract) => contract.producerCountryId));
  const portPressure = computePortPressure(state);
  return {
    producers: {
      oil: (state.foreignProducers?.oil ?? []).map((producer) => ({
        ...producer,
        productionPerHour: toNumber(producer.productionPerHour),
        contractUnitCost: toNumber(producer.contractUnitCost),
        routeRisk: toNumber(producer.routeRisk),
        isContracted: activeProducerIds.has(producer.countryId),
        offeredVolumePerHour: formatAmount(
          Math.max(1.2, toNumber(producer.productionPerHour) * CONTRACT_VOLUME_FACTOR),
        ),
        portName: getProducerPort(producer.countryIso3).name,
      })),
    },
    contracts: state.tradeContracts.map((contract) => ({
      ...contract,
      routeLabel: `${contract.originPort.name} -> ${contract.destinationPort.name}`,
      deliveredVolumePerHour: computeContractDeliveredVolumePerHour(state, contract),
      costPerHour: ((contract.cargoPerTrip * contract.unitCost) / contract.tripHours) * contract.tankerCount,
      reliabilityPercent: Math.round(contract.reliability * 100),
      tankerLat: interpolateCoordinate(contract.originPort.lat, contract.destinationPort.lat, contract.tankerProgress),
      tankerLon: interpolateLongitude(contract.originPort.lon, contract.destinationPort.lon, contract.tankerProgress),
      tripProgressPercent: Math.round(contract.tankerProgress * 100),
      throttledPercent: Math.round(computeContractThrottleFactor(state, contract) * 100),
      portStatus:
        buildPortStatusLabel(portPressure[contract.destinationPort.id]) ??
        'Port flowing normally',
      deliveredTotal: contract.deliveredTotal ?? 0,
      disrupted: (contract.disruptionHoursRemaining ?? 0) > 0,
      disruptionHoursRemaining: contract.disruptionHoursRemaining ?? 0,
      routeIntegrityPercent: Math.round(computeRouteIntegrityFactor(contract) * 100),
      recoveryCost: DISRUPTION_RECOVERY_COST,
    })),
    ports: Object.values(portPressure)
      .map((port) => {
        const infrastructure = state.portInfrastructure?.[port.id] ?? null;
        const upgradeCost = infrastructure ? getPortUpgradeCost(infrastructure) : null;
        return {
          ...port,
          controlled: Boolean(infrastructure?.controlled),
          upgradeLevel: toNumber(infrastructure?.upgradeLevel, 0),
          resiliencePercent: Math.round((toNumber(infrastructure?.resilienceBonus, 0)) * 100),
          upgradeAvailable:
            Boolean(infrastructure?.controlled) &&
            toNumber(infrastructure?.upgradeLevel, 0) < PORT_MAX_UPGRADE_LEVEL,
          upgradeCost,
        };
      })
      .sort((left, right) => right.utilization - left.utilization),
  };
}

function computeQueueThroughputMultiplier(state, queue) {
  const assignmentFactor = computeQueueAssignmentFactor(state, queue);
  if (assignmentFactor <= 0) {
    return 0;
  }
  let bonus = 0;
  for (const project of state.industrialProjects) {
    if (project.facilityType === queue.facilityType) {
      bonus += computeProjectEffectiveBonus(project, queue.recipe.outputKey);
    }
  }
  return assignmentFactor * (1 + bonus);
}

function computeProjectEffectiveBonus(project, outputKey = null) {
  if (project.paused) {
    return 0;
  }
  const baseBonus = toNumber(project.baseThroughputBonus, toNumber(project.throughputBonus));
  const upgradeMultiplier = 1 + INDUSTRIAL_UPGRADE_MULTIPLIER * toNumber(project.upgradeLevel, 0);
  const emphasisMultiplier = getProjectEmphasisMultiplier(project, outputKey);
  return baseBonus * upgradeMultiplier * emphasisMultiplier;
}

function getProjectEmphasisMultiplier(project, outputKey) {
  const emphasis = normalizeEmphasis(project.facilityType, project.emphasis);
  if (project.facilityType === 'chip_factory') {
    if (emphasis === 'surge') {
      return 1.3;
    }
    if (emphasis === 'conserve') {
      return 0.65;
    }
    return 1;
  }

  if (project.facilityType === 'military_factory') {
    if (emphasis === 'radar') {
      return outputKey === 'radar' ? 1.35 : 0.72;
    }
    if (emphasis === 'missiles') {
      return outputKey === 'missile_inventory' ? 1.35 : 0.72;
    }
    return 1;
  }

  return 1;
}

function getProjectUpgradeCost(project) {
  const nextLevel = toNumber(project.upgradeLevel, 0) + 1;
  const multiplier = 0.55 + nextLevel * 0.35;
  return {
    treasuryCost: Math.round((project.key === 'chip_factory' ? 90000 : 115000) * multiplier),
    resourceCosts: {
      oil: Math.round((project.key === 'chip_factory' ? 12 : 20) * multiplier),
      rare_earths: Math.round((project.key === 'chip_factory' ? 18 : 6) * multiplier),
      chips: Math.round((project.key === 'chip_factory' ? 8 : 14) * multiplier),
    },
  };
}

function normalizeEmphasis(facilityType, emphasis) {
  const modes = PROJECT_EMPHASIS_MODES[facilityType] ?? ['balanced'];
  return modes.includes(emphasis) ? emphasis : 'balanced';
}

function getRecipesForFacilityType(facilityType) {
  return Object.values(STRATEGIC_RECIPES).filter((recipe) => recipe.facilityType === facilityType);
}

function getAvailableRecipesForFacilityType(state, facilityType, includeRecipeKey = null) {
  return getRecipesForFacilityType(facilityType).filter((recipe) => {
    if (includeRecipeKey && recipe.key === includeRecipeKey) {
      return true;
    }
    return getRecipeAvailability(state, recipe).available;
  });
}

function getRecipeAvailabilitySummary(state, facilityType) {
  const locked = getRecipesForFacilityType(facilityType)
    .map((recipe) => getRecipeAvailability(state, recipe))
    .find((entry) => !entry.available);
  return locked?.reason ?? 'No unlocked recipes';
}

function cloneRecipe(recipe) {
  return {
    ...recipe,
    costs: { ...(recipe.costs ?? {}) },
  };
}

function createQueueFromRecipe(recipe, queueId) {
  return {
    id: queueId,
    facilityType: recipe.facilityType,
    targetQuantity: recipe.defaultTargetQuantity,
    completedQuantity: 0,
    progressUnits: 0,
    recipe: cloneRecipe(recipe),
  };
}

function normalizeQueueOrdering(state) {
  state.queues = state.queues.map((queue, index) => ({
    ...queue,
    sortOrder: index,
  }));
}

function computeQueueAssignmentFactor(state, queue) {
  if (queue.completedQuantity >= queue.targetQuantity) {
    return 0;
  }
  const availability = getRecipeAvailability(state, queue.recipe);
  if (!availability.available) {
    return 0;
  }

  const facilityQueues = state.queues.filter(
    (entry) =>
      entry.facilityType === queue.facilityType &&
      entry.completedQuantity < entry.targetQuantity &&
      getRecipeAvailability(state, entry.recipe).available,
  );
  const queueIndex = facilityQueues.indexOf(queue);
  if (queueIndex < 0) {
    return 0;
  }

  const capacityUnits = getFacilityCapacityUnits(state, queue.facilityType);
  const assignedBefore = queueIndex;
  return Math.max(0, Math.min(1, capacityUnits - assignedBefore));
}

function getFacilityCapacityUnits(state, facilityType) {
  let capacity = FACILITY_BASELINE_CAPACITY[facilityType] ?? 0;
  for (const project of state.industrialProjects) {
    if (project.facilityType !== facilityType || project.paused) {
      continue;
    }
    capacity += 1 + toNumber(project.upgradeLevel, 0) * 0.5;
  }
  return capacity;
}

function getRecipeAvailability(state, recipe) {
  if (!recipe) {
    return { available: false, reason: 'Recipe not found.' };
  }
  if (recipe.unlockRule === 'always') {
    return { available: true, reason: null };
  }
  if (recipe.unlockRule === 'airbase_network') {
    const hasAirbase = state.bases.some((base) => base.baseType === 'air_base' && base.active);
    return hasAirbase
      ? { available: true, reason: null }
      : { available: false, reason: 'Requires an active domestic air base network.' };
  }
  if (recipe.unlockRule === 'silo_network') {
    const hasSilo = state.bases.some((base) => base.baseType === 'silo_base' && base.active);
    return hasSilo
      ? { available: true, reason: null }
      : { available: false, reason: 'Requires an active domestic silo network.' };
  }
  if (recipe.unlockRule === 'space_program') {
    const hasSpaceport = state.bases.some((base) => base.baseType === 'spaceport' && base.active);
    const hasUpgradedMilitaryProject = state.industrialProjects.some(
      (project) =>
        project.facilityType === 'military_factory' &&
        !project.paused &&
        toNumber(project.upgradeLevel, 0) >= 1,
    );
    if (!hasSpaceport) {
      return { available: false, reason: 'Requires an active spaceport.' };
    }
    if (!hasUpgradedMilitaryProject) {
      return { available: false, reason: 'Requires a level 1 military factory upgrade.' };
    }
    return { available: true, reason: null };
  }
  return { available: true, reason: null };
}

function buildQueuePlannerStatus(state, queue) {
  const availability = getRecipeAvailability(state, queue.recipe);
  if (!availability.available) {
    return availability.reason;
  }
  const assignmentPercent = Math.round(computeQueueAssignmentFactor(state, queue) * 100);
  if (assignmentPercent >= 100) {
    return 'Fully staffed priority line';
  }
  if (assignmentPercent > 0) {
    return `Partial facility assignment (${assignmentPercent}%)`;
  }
  return 'Waiting for facility capacity';
}

function canAffordProject(state, projectKey) {
  const project = INDUSTRIAL_PROJECTS[projectKey];
  if (!project) {
    return false;
  }
  if (state.finance.treasuryBalance < project.treasuryCost) {
    return false;
  }
  return Object.entries(project.resourceCosts).every(
    ([resourceKey, cost]) => (state.resources[resourceKey] ?? 0) >= cost,
  );
}

function computeResourceNetPerHour(state, resourceKey) {
  const baseline = state.baselines[resourceKey] ?? { productionPerHour: 0, upkeepPerHour: 0 };
  let queueDemand = 0;
  let queueOutput = 0;

  for (const queue of state.queues) {
    if (queue.completedQuantity >= queue.targetQuantity) {
      continue;
    }
    const throughputMultiplier = computeQueueThroughputMultiplier(state, queue);
    queueDemand +=
      ((queue.recipe.costs[resourceKey] ?? 0) / queue.recipe.durationHours) * throughputMultiplier;
    if (queue.recipe.outputType === 'resource' && queue.recipe.outputKey === resourceKey) {
      queueOutput +=
        (queue.recipe.outputAmount / queue.recipe.durationHours) *
        throughputMultiplier;
    }
  }

  return baseline.productionPerHour + queueOutput - baseline.upkeepPerHour - queueDemand;
}

function computeResourceBoundedProgress(resources, costs) {
  let boundedProgress = Number.POSITIVE_INFINITY;
  for (const resourceKey of RESOURCE_ORDER) {
    const cost = costs[resourceKey] ?? 0;
    if (cost <= 0) {
      continue;
    }
    boundedProgress = Math.min(boundedProgress, (resources[resourceKey] ?? 0) / cost);
  }
  return Number.isFinite(boundedProgress) ? boundedProgress : Number.POSITIVE_INFINITY;
}

function stepObjectives(state) {
  for (const objective of CAMPAIGN_OBJECTIVES) {
    if (state.completedObjectives?.[objective.id]) {
      continue;
    }
    if (!objective.isComplete(state)) {
      continue;
    }

    state.completedObjectives[objective.id] = true;
    state.finance.treasuryBalance += objective.rewardTreasury;
    state.notification = {
      message: `${objective.title} complete. Treasury +$${objective.rewardTreasury.toLocaleString()}.`,
      severity: 'info',
      remainingSeconds: 5,
    };
    break;
  }
}

function countProjectsByKey(state, projectKey) {
  return state.industrialProjects.filter((project) => project.key === projectKey).length;
}

function getTotalInventory(state, assetKey) {
  let total = state.reserveInventories[assetKey] ?? 0;
  for (const inventory of Object.values(state.baseInventories)) {
    total += inventory?.[assetKey] ?? 0;
  }
  return total;
}

function computeTradeImportPerHour(state, resourceKey) {
  return state.tradeContracts
    .filter((contract) => contract.resourceKey === resourceKey)
    .reduce(
      (total, contract) => total + computeContractDeliveredVolumePerHour(state, contract),
      0,
    );
}

function computeTradeContractCostPerHour(state) {
  return state.tradeContracts.reduce(
    (total, contract) =>
      total + (((contract.cargoPerTrip * contract.unitCost) / contract.tripHours) * contract.tankerCount),
    0,
  );
}

function computeContractDeliveredVolumePerHour(state, contract) {
  return ((contract.cargoPerTrip * contract.reliability) / contract.tripHours) *
    (contract.tankerCount ?? 1) *
    computeRouteIntegrityFactor(contract) *
    computeContractThrottleFactor(state, contract);
}

function computeRouteIntegrityFactor(contract) {
  const disruptionHoursRemaining = contract?.disruptionHoursRemaining ?? 0;
  if (disruptionHoursRemaining <= 0) {
    return 1;
  }
  const severity = Math.max(0, Math.min(contract?.disruptionSeverity ?? 0, 0.85));
  return Math.max(0.18, 1 - severity);
}

function computeContractThrottleFactor(state, contract) {
  const portPressure = computePortPressure(state);
  const originFactor = portPressure[contract.originPort.id]?.throttleFactor ?? 1;
  const destinationFactor = portPressure[contract.destinationPort.id]?.throttleFactor ?? 1;
  return Math.max(0, Math.min(originFactor, destinationFactor));
}

function computePortPressure(state) {
  const ports = new Map();

  for (const port of Object.values(state.portInfrastructure ?? {})) {
    ports.set(port.id, {
      id: port.id,
      name: port.name,
      throughputPerHour: getPortThroughputPerHour(state, port),
      demandPerHour: 0,
      utilization: 0,
      throttleFactor: 1,
    });
  }

  for (const contract of state.tradeContracts) {
    const idealFlow = ((contract.cargoPerTrip * contract.reliability) / contract.tripHours) *
      (contract.tankerCount ?? 1);
    for (const port of [contract.originPort, contract.destinationPort]) {
      if (!port?.id) {
        continue;
      }
      const current = ports.get(port.id) ?? {
        id: port.id,
        name: port.name,
        throughputPerHour: getPortThroughputPerHour(state, port),
        demandPerHour: 0,
        utilization: 0,
        throttleFactor: 1,
      };
      current.demandPerHour += idealFlow;
      ports.set(port.id, current);
    }
  }

  for (const port of ports.values()) {
    port.utilization =
      port.throughputPerHour > 0 ? port.demandPerHour / port.throughputPerHour : 0;
    port.throttleFactor =
      port.utilization <= 1 ? 1 : Math.max(0.2, 1 / port.utilization);
    port.status = buildPortStatusLabel(port);
  }

  return Object.fromEntries([...ports.entries()].map(([id, value]) => [id, value]));
}

function getPortThroughputPerHour(state, port) {
  if (!port?.id) {
    return 1;
  }
  const infrastructure = state.portInfrastructure?.[port.id];
  return (
    toNumber(infrastructure?.baseThroughputPerHour, toNumber(port.throughputPerHour, 1)) +
    toNumber(infrastructure?.throughputBonusPerHour, 0)
  );
}

function buildPortStatusLabel(port) {
  if (!port) {
    return null;
  }
  if (port.utilization <= 0.85) {
    return 'Port flowing normally';
  }
  if (port.utilization <= 1) {
    return 'Port nearing capacity';
  }
  return `Congested: ${Math.round(port.utilization * 100)}% load`;
}

function stepRouteDisruption(state, deltaHours) {
  if (deltaHours <= 0 || state.tradeContracts.length <= 0) {
    return;
  }

  const portPressure = computePortPressure(state);
  for (const contract of state.tradeContracts) {
    if ((contract.disruptionHoursRemaining ?? 0) > 0) {
      contract.disruptionHoursRemaining = Math.max(
        0,
        contract.disruptionHoursRemaining - deltaHours,
      );
      if (contract.disruptionHoursRemaining <= 0) {
        contract.disruptionHoursRemaining = 0;
        contract.disruptionSeverity = 0;
      }
      continue;
    }

    const destinationLoad = portPressure[contract.destinationPort.id]?.utilization ?? 0;
    const originLoad = portPressure[contract.originPort.id]?.utilization ?? 0;
    const destinationResilience = toNumber(
      state.portInfrastructure?.[contract.destinationPort.id]?.resilienceBonus,
      0,
    );
    const congestionFactor = Math.max(0, Math.max(destinationLoad, originLoad) - 0.9);
    const incidentChancePerHour = Math.min(
      0.22,
      Math.max(0.008, (contract.routeRisk ?? 0) * 0.08 + congestionFactor * 0.06 - destinationResilience * 0.035),
    );
    if (Math.random() >= incidentChancePerHour * deltaHours) {
      continue;
    }

    const severity = Math.min(
      0.78,
      0.24 +
        (contract.routeRisk ?? 0) * 0.5 +
        Math.random() * 0.18 +
        congestionFactor * 0.18 -
        destinationResilience * 0.25,
    );
    const durationHours = Math.max(
      6,
      10 + severity * 24 + Math.random() * 12,
    );
    contract.disruptionSeverity = severity;
    contract.disruptionHoursRemaining = durationHours;
    state.notification = {
      message: `${contract.producerName} route disrupted near ${contract.destinationPort.name}. Stabilize the lane or accept reduced oil flow.`,
      severity: 'warning',
      remainingSeconds: 6,
    };
  }
}

function stepTradeContracts(state, deltaHours) {
  for (const contract of state.tradeContracts) {
    const tripHours = Math.max(contract.tripHours ?? 1, 1);
    contract.tankerProgress += (deltaHours / tripHours) * (contract.tankerCount ?? 1);
    while (contract.tankerProgress >= 1) {
      contract.tankerProgress -= 1;
      const delivered =
        contract.cargoPerTrip *
        contract.reliability *
        computeRouteIntegrityFactor(contract) *
        computeContractThrottleFactor(state, contract);
      state.resources[contract.resourceKey] =
        (state.resources[contract.resourceKey] ?? 0) + delivered;
      contract.deliveredTotal = (contract.deliveredTotal ?? 0) + delivered;
    }
  }
}

function createInitialPortInfrastructure(countryIso3) {
  const homePort = getHomeImportPort(countryIso3);
  if (!homePort?.id) {
    return {};
  }
  return {
    [homePort.id]: {
      id: homePort.id,
      name: homePort.name,
      lat: homePort.lat,
      lon: homePort.lon,
      countryIso3,
      controlled: true,
      baseThroughputPerHour: toNumber(homePort.throughputPerHour, 1),
      throughputBonusPerHour: 0,
      resilienceBonus: 0,
      upgradeLevel: 0,
    },
  };
}

function createPortInfrastructureFromSerialized(serializedPortInfrastructure, countryIso3) {
  const fallback = createInitialPortInfrastructure(countryIso3);
  const normalized = { ...fallback };
  for (const [portId, savedPort] of Object.entries(serializedPortInfrastructure ?? {})) {
    normalized[portId] = {
      ...(fallback[portId] ?? {}),
      ...savedPort,
      baseThroughputPerHour: toNumber(
        savedPort?.baseThroughputPerHour,
        toNumber(fallback[portId]?.baseThroughputPerHour, 1),
      ),
      throughputBonusPerHour: toNumber(savedPort?.throughputBonusPerHour, 0),
      resilienceBonus: toNumber(savedPort?.resilienceBonus, 0),
      upgradeLevel: toNumber(savedPort?.upgradeLevel, 0),
      controlled: savedPort?.controlled !== false,
    };
  }
  return normalized;
}

function getPortUpgradeCost(port) {
  const nextLevel = toNumber(port?.upgradeLevel, 0) + 1;
  const multiplier = 0.85 + nextLevel * 0.45;
  return {
    treasuryCost: Math.round(70000 * multiplier),
    resourceCosts: {
      oil: Math.round(18 * multiplier),
      rare_earths: Math.round(4 * multiplier),
      chips: Math.round(10 * multiplier),
    },
  };
}

function computePortThroughputBonus(upgradeLevel) {
  return upgradeLevel <= 0 ? 0 : 2.6 * upgradeLevel + Math.max(0, upgradeLevel - 1) * 0.8;
}

function computePortResilienceBonus(upgradeLevel) {
  return Math.min(0.36, upgradeLevel * 0.11);
}

function getHomeImportPort(countryIso3) {
  return HOME_IMPORT_PORTS[countryIso3] ?? { name: `${countryIso3} Home Port`, lat: 0, lon: 0 };
}

function getProducerPort(countryIso3) {
  return PRODUCER_PORTS[countryIso3] ?? { name: `${countryIso3} Export Port`, lat: 0, lon: 0 };
}

function calculateRouteDistanceKm(origin, destination) {
  if (!origin || !destination) {
    return 0;
  }
  const toRad = Math.PI / 180;
  const lat1 = origin.lat * toRad;
  const lat2 = destination.lat * toRad;
  const dLat = (destination.lat - origin.lat) * toRad;
  const dLon = (destination.lon - origin.lon) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolateCoordinate(start, end, progress) {
  return start + (end - start) * progress;
}

function interpolateLongitude(start, end, progress) {
  let delta = end - start;
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  let value = start + delta * progress;
  while (value > 180) {
    value -= 360;
  }
  while (value < -180) {
    value += 360;
  }
  return value;
}

function stepNotification(state, stepSeconds) {
  if (!state.notification) {
    return;
  }
  state.notification.remainingSeconds -= stepSeconds;
  if (state.notification.remainingSeconds <= 0) {
    state.notification = null;
  }
}

function normalizeKey(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAmount(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function formatGameDate(dateMs) {
  return new Date(dateMs).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function cloneRecord(record) {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [key, { ...value }]),
  );
}

function cloneProducerGroups(groups) {
  return Object.fromEntries(
    Object.entries(groups ?? {}).map(([key, values]) => [key, (values ?? []).map((value) => ({ ...value }))]),
  );
}
