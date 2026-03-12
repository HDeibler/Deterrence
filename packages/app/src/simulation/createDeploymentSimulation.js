// ---------------------------------------------------------------------------
// Forward Deployment Simulation
//
// Models hub-to-forward-base asset transfers with sticky deployment rules:
// deploying is fast (2.0x), withdrawing is slow (0.3x). This asymmetry
// prevents unrealistic global force shuffling and forces players to commit
// to posture decisions.
// ---------------------------------------------------------------------------

const DEPLOY_SPEED_MULTIPLIER = 2.0;
const WITHDRAW_SPEED_MULTIPLIER = 0.3;

const BASE_TRANSFER_HOURS = 48;
const BASE_TRANSFER_SECONDS = BASE_TRANSFER_HOURS * 3600;

const READINESS_DEGRADE_PER_HOUR = 0.02;
const READINESS_RECOVER_PER_HOUR = 0.05;

// Maintenance cost per unit per hour: { oil, chips }
const MAINTENANCE_RATES = {
  fighter: { oil: 0.8, chips: 0.1 },
  surface_ship: { oil: 2.5, chips: 0.2 },
  submarine: { oil: 1.8, chips: 0.3 },
  interceptor: { oil: 0.5, chips: 0.15 },
  radar: { oil: 0.3, chips: 0.2 },
  missile_inventory: { oil: 0.05, chips: 0.01 },
};

// Forward base capacity limits by base type
const BASE_CAPACITY = {
  air_base: { fighter: 24, interceptor: 12, radar: 2 },
  naval_base: { surface_ship: 8, submarine: 6 },
  silo_base: { missile_inventory: 1 },
};

export function createDeploymentSimulation() {
  let state = createInitialState();
  let nextId = 1;

  function step(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }

    advanceTransfers(state, deltaSeconds);
    recalculateMaintenanceDrain(state);
    updateBaseReadiness(state, deltaSeconds);
  }

  function getSnapshot() {
    const transitDeployments = state.deployments.map((d) => ({
      id: d.id,
      hubId: d.hubId,
      baseId: d.baseId,
      baseName: d.baseName,
      assetType: d.assetType,
      quantity: d.quantity,
      direction: d.direction,
      progress: d.progress,
      speed: d.speed,
      status: d.status,
      progressPercent: Math.round(d.progress * 100),
      estimatedHoursRemaining: estimateRemainingHours(d),
    }));

    return {
      ready: state.ready,
      deployments: transitDeployments,
      baseLoads: deepCopyBaseLoads(state.baseLoads),
      baseReadiness: { ...state.baseReadiness },
      maintenanceDrain: { ...state.maintenanceDrain },
      totalDeployedAssets: countTotalDeployed(state.baseLoads),
    };
  }

  function serializeState() {
    return JSON.parse(JSON.stringify(state));
  }

  function loadState(serialized = null) {
    if (!serialized) {
      state = createInitialState();
      nextId = 1;
      return;
    }
    state = JSON.parse(JSON.stringify(serialized));
    const maxId = state.deployments.reduce((max, d) => Math.max(max, Number(String(d.id).replace(/\D/g, '')) || 0), 0);
    nextId = maxId + 1;
  }

  function reset() {
    state = createInitialState();
    nextId = 1;
  }

  function deployAssets(hubId, baseId, assetType, quantity) {
    if (!validateDeploymentArgs(hubId, baseId, assetType, quantity)) {
      return null;
    }

    const remaining = getRemainingCapacity(state, baseId, assetType);
    if (remaining < quantity) {
      return null;
    }

    const deployment = {
      id: nextId++,
      hubId,
      baseId,
      baseName: baseId,
      assetType,
      quantity,
      direction: 'deploy',
      progress: 0,
      speed: DEPLOY_SPEED_MULTIPLIER,
      status: 'transit',
    };

    state.deployments.push(deployment);
    ensureBaseTracking(state, baseId);

    return deployment.id;
  }

  function withdrawAssets(baseId, assetType, quantity) {
    if (!baseId || !assetType || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    const currentLoad = (state.baseLoads[baseId] && state.baseLoads[baseId][assetType]) || 0;
    if (currentLoad < quantity) {
      return null;
    }

    state.baseLoads[baseId][assetType] -= quantity;

    const deployment = {
      id: nextId++,
      hubId: null,
      baseId,
      baseName: baseId,
      assetType,
      quantity,
      direction: 'withdraw',
      progress: 0,
      speed: WITHDRAW_SPEED_MULTIPLIER,
      status: 'transit',
    };

    state.deployments.push(deployment);

    return deployment.id;
  }

  function getBaseLoad(baseId) {
    if (!state.baseLoads[baseId]) {
      return {};
    }
    return { ...state.baseLoads[baseId] };
  }

  function getBaseReadiness(baseId) {
    if (!Number.isFinite(state.baseReadiness[baseId])) {
      return 0;
    }
    return state.baseReadiness[baseId];
  }

  return {
    step,
    getSnapshot,
    serializeState,
    loadState,
    reset,
    deployAssets,
    withdrawAssets,
    getBaseLoad,
    getBaseReadiness,
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function createInitialState() {
  return {
    ready: true,
    deployments: [],
    baseLoads: {},
    baseReadiness: {},
    baseSupplyStatus: {},
    maintenanceDrain: { oil: 0, chips: 0 },
  };
}

// ---------------------------------------------------------------------------
// Transfer progression
// ---------------------------------------------------------------------------

function advanceTransfers(state, deltaSeconds) {
  for (let i = state.deployments.length - 1; i >= 0; i--) {
    const deployment = state.deployments[i];
    if (deployment.status !== 'transit') {
      continue;
    }

    const progressPerSecond = deployment.speed / BASE_TRANSFER_SECONDS;
    deployment.progress += progressPerSecond * deltaSeconds;

    if (deployment.progress >= 1.0) {
      deployment.progress = 1.0;
      completeTransfer(state, deployment);
      state.deployments.splice(i, 1);
    }
  }
}

function completeTransfer(state, deployment) {
  if (deployment.direction === 'deploy') {
    ensureBaseTracking(state, deployment.baseId);
    const loads = state.baseLoads[deployment.baseId];
    loads[deployment.assetType] = (loads[deployment.assetType] || 0) + deployment.quantity;
  }
  // Withdraw: assets were already removed from baseLoads at order time
}

// ---------------------------------------------------------------------------
// Maintenance drain
// ---------------------------------------------------------------------------

function recalculateMaintenanceDrain(state) {
  let totalOil = 0;
  let totalChips = 0;

  const baseIds = Object.keys(state.baseLoads);
  for (let i = 0; i < baseIds.length; i++) {
    const loads = state.baseLoads[baseIds[i]];
    const assetTypes = Object.keys(loads);
    for (let j = 0; j < assetTypes.length; j++) {
      const assetType = assetTypes[j];
      const quantity = loads[assetType];
      const rates = MAINTENANCE_RATES[assetType];
      if (rates && quantity > 0) {
        totalOil += rates.oil * quantity;
        totalChips += rates.chips * quantity;
      }
    }
  }

  state.maintenanceDrain.oil = totalOil;
  state.maintenanceDrain.chips = totalChips;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

function updateBaseReadiness(state, deltaSeconds) {
  const deltaHours = deltaSeconds / 3600;
  const baseIds = Object.keys(state.baseReadiness);

  for (let i = 0; i < baseIds.length; i++) {
    const baseId = baseIds[i];
    const supplied = state.baseSupplyStatus[baseId] !== false;

    if (supplied) {
      state.baseReadiness[baseId] = Math.min(
        state.baseReadiness[baseId] + READINESS_RECOVER_PER_HOUR * deltaHours,
        1.0,
      );
    } else {
      state.baseReadiness[baseId] = Math.max(
        state.baseReadiness[baseId] - READINESS_DEGRADE_PER_HOUR * deltaHours,
        0,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

function getRemainingCapacity(state, baseId, assetType) {
  const maxCapacity = getMaxCapacity(assetType);
  if (!Number.isFinite(maxCapacity)) {
    return 0;
  }

  const currentLoad = (state.baseLoads[baseId] && state.baseLoads[baseId][assetType]) || 0;

  let inTransit = 0;
  for (let i = 0; i < state.deployments.length; i++) {
    const d = state.deployments[i];
    if (d.baseId === baseId && d.assetType === assetType && d.direction === 'deploy') {
      inTransit += d.quantity;
    }
  }

  return Math.max(maxCapacity - currentLoad - inTransit, 0);
}

function getMaxCapacity(assetType) {
  const baseTypes = Object.keys(BASE_CAPACITY);
  for (let i = 0; i < baseTypes.length; i++) {
    const capacities = BASE_CAPACITY[baseTypes[i]];
    if (Number.isFinite(capacities[assetType])) {
      return capacities[assetType];
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureBaseTracking(state, baseId) {
  if (!state.baseLoads[baseId]) {
    state.baseLoads[baseId] = {};
  }
  if (!Number.isFinite(state.baseReadiness[baseId])) {
    state.baseReadiness[baseId] = 1.0;
  }
  if (state.baseSupplyStatus[baseId] === undefined) {
    state.baseSupplyStatus[baseId] = true;
  }
}

function estimateRemainingHours(deployment) {
  const remaining = 1.0 - deployment.progress;
  if (remaining <= 0 || deployment.speed <= 0) {
    return 0;
  }
  return (remaining * BASE_TRANSFER_HOURS) / deployment.speed;
}

function countTotalDeployed(baseLoads) {
  let total = 0;
  const baseIds = Object.keys(baseLoads);
  for (let i = 0; i < baseIds.length; i++) {
    const loads = baseLoads[baseIds[i]];
    const assetTypes = Object.keys(loads);
    for (let j = 0; j < assetTypes.length; j++) {
      total += loads[assetTypes[j]];
    }
  }
  return total;
}

function deepCopyBaseLoads(baseLoads) {
  const copy = {};
  const baseIds = Object.keys(baseLoads);
  for (let i = 0; i < baseIds.length; i++) {
    copy[baseIds[i]] = { ...baseLoads[baseIds[i]] };
  }
  return copy;
}

function validateDeploymentArgs(hubId, baseId, assetType, quantity) {
  if (!hubId || !baseId || !assetType) {
    return false;
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }
  if (!MAINTENANCE_RATES[assetType]) {
    return false;
  }
  return true;
}
