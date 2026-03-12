import { AI_COUNTRY_PROFILES, AI_DECISION_THRESHOLDS } from '../game/data/aiCountryProfiles.js';

// ---------------------------------------------------------------------------
// Strategic AI Simulation
//
// Periodically evaluates the world state for every AI-controlled country and
// produces pending decisions: price changes on resource contracts, diplomatic
// posture shifts, access-revocation rulings, and military build orders.
//
// The simulation is fully deterministic -- threshold comparisons only, no
// randomness.  The caller feeds world state via `setWorldState` and advances
// time via `step`.  Accumulated decisions are read through accessor methods
// and remain until the next evaluation cycle clears them.
// ---------------------------------------------------------------------------

const RIVAL_POWERS = {
  USA: ['CHN', 'RUS'],
  CHN: ['USA'],
  RUS: ['USA'],
};

export function createStrategicAiSimulation() {
  let state = createInitialState();

  return {
    step(deltaSeconds) {
      if (!state.ready) {
        return;
      }

      state.timeSinceLastEvaluation += deltaSeconds;

      if (state.timeSinceLastEvaluation < state.evaluationInterval) {
        return;
      }

      runEvaluationCycle();
      state.timeSinceLastEvaluation = 0;
    },

    getSnapshot() {
      return {
        ready: state.ready,
        countryStates: shallowCopyMap(state.countryStates),
        pendingPriceChanges: state.pendingPriceChanges.map((c) => ({ ...c })),
        pendingPostureChanges: state.pendingPostureChanges.map((c) => ({ ...c })),
        pendingAccessDecisions: state.pendingAccessDecisions.map((d) => ({ ...d })),
        aiBuildOrders: state.aiBuildOrders.map((o) => ({ ...o })),
        lastEvaluationAge: state.timeSinceLastEvaluation,
      };
    },

    serializeState() {
      return {
        ready: state.ready,
        evaluationInterval: state.evaluationInterval,
        timeSinceLastEvaluation: state.timeSinceLastEvaluation,
        countryStates: JSON.parse(JSON.stringify(state.countryStates)),
        pendingPriceChanges: state.pendingPriceChanges.map((c) => ({ ...c })),
        pendingPostureChanges: state.pendingPostureChanges.map((c) => ({ ...c })),
        pendingAccessDecisions: state.pendingAccessDecisions.map((d) => ({ ...d })),
        aiBuildOrders: state.aiBuildOrders.map((o) => ({ ...o })),
      };
    },

    loadState(serialized = null) {
      if (!serialized) {
        state = createInitialState();
        return;
      }
      state.ready = false;
      state.evaluationInterval = serialized.evaluationInterval ?? 3600;
      state.timeSinceLastEvaluation = serialized.timeSinceLastEvaluation ?? 0;
      state.countryStates = serialized.countryStates ?? {};
      state.pendingPriceChanges = serialized.pendingPriceChanges ?? [];
      state.pendingPostureChanges = serialized.pendingPostureChanges ?? [];
      state.pendingAccessDecisions = serialized.pendingAccessDecisions ?? [];
      state.aiBuildOrders = serialized.aiBuildOrders ?? [];
      state.worldState = null;
    },

    reset() {
      state = createInitialState();
    },

    setWorldState(worldSnapshot) {
      state.worldState = worldSnapshot;
      state.ready = true;

      // Initialize country states for any profiles not yet tracked
      for (const iso3 of Object.keys(AI_COUNTRY_PROFILES)) {
        if (!state.countryStates[iso3]) {
          state.countryStates[iso3] = createCountryState();
        }
      }
    },

    getProposedPriceChanges() {
      return state.pendingPriceChanges.map((c) => ({ ...c }));
    },

    getDiplomaticPostureChanges() {
      return state.pendingPostureChanges.map((c) => ({ ...c }));
    },

    getAccessDecisions() {
      return state.pendingAccessDecisions.map((d) => ({ ...d }));
    },

    getAiCountryBuildOrders() {
      return state.aiBuildOrders.map((o) => ({ ...o }));
    },
  };

  // -----------------------------------------------------------------------
  // Evaluation cycle
  // -----------------------------------------------------------------------

  function runEvaluationCycle() {
    state.pendingPriceChanges = [];
    state.pendingPostureChanges = [];
    state.pendingAccessDecisions = [];
    state.aiBuildOrders = [];

    const world = state.worldState;

    for (const [iso3, profile] of Object.entries(AI_COUNTRY_PROFILES)) {
      if (iso3 === world.playerCountryIso3) {
        continue;
      }

      const countryState = state.countryStates[iso3];
      if (!countryState) {
        continue;
      }

      evaluateContractPricing(iso3, profile, countryState, world);
      evaluateDiplomaticPosture(iso3, profile, countryState, world);
      evaluateAccessDecisions(iso3, profile, countryState, world);
    }

    evaluateRivalBuildOrders(world);
  }

  // -----------------------------------------------------------------------
  // Price evaluation
  // -----------------------------------------------------------------------

  function evaluateContractPricing(iso3, profile, countryState, world) {
    const thresholds = AI_DECISION_THRESHOLDS.contractRepricing;

    for (const resource of profile.resourceExports) {
      const scarcity = calculateScarcity(resource, world);
      const profitDrive = profile.profitSensitivity * scarcity;
      const rawMultiplier = 1.0 + profitDrive * (thresholds.maxPriceMultiplier - 1);
      const newMultiplier = clamp(rawMultiplier, thresholds.minPriceMultiplier, thresholds.maxPriceMultiplier);

      const oldMultiplier = countryState.priceMultipliers[resource] ?? 1.0;

      // Only emit a change when the multiplier shifts meaningfully (> 1 %)
      if (Math.abs(newMultiplier - oldMultiplier) > 0.01) {
        countryState.priceMultipliers[resource] = newMultiplier;
        state.pendingPriceChanges.push({
          countryIso3: iso3,
          resourceKey: resource,
          oldPrice: oldMultiplier,
          newPrice: newMultiplier,
          reason: scarcity > 0.5 ? 'scarcity_markup' : 'market_adjustment',
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Diplomatic posture evaluation
  // -----------------------------------------------------------------------

  function evaluateDiplomaticPosture(iso3, profile, countryState, world) {
    const playerIso3 = world.playerCountryIso3;
    const nearbyMilitaryCount = countMilitaryAssetsNearCountry(iso3, world);
    const thresholds = AI_DECISION_THRESHOLDS.diplomaticShift;

    // Adjusted threat threshold -- high-security-concern nations react sooner
    const adjustedThreshold = thresholds.buildupThreatThreshold * (1 - profile.securityConcern);

    const baseAlignment = profile.alignmentBias[playerIso3] ?? 0;
    const hasTradeContract = countActiveContracts(iso3, playerIso3, world) > 0;
    const tradeBias = hasTradeContract ? 0.15 : 0;

    let postureShift = 0;

    if (nearbyMilitaryCount > adjustedThreshold) {
      // Military buildup drives posture hostile
      const threatSeverity = clamp(
        (nearbyMilitaryCount - adjustedThreshold) / adjustedThreshold,
        0,
        1,
      );
      postureShift = -threatSeverity * 0.3;
    }

    const targetPosture = clamp(baseAlignment + tradeBias + postureShift, -1, 1);
    const oldPosture = countryState.posture;

    if (Math.abs(targetPosture - oldPosture) > 0.02) {
      // Move toward target posture gradually rather than snapping
      const step = clamp(targetPosture - oldPosture, -0.1, 0.1);
      const newPosture = clamp(oldPosture + step, -1, 1);
      countryState.posture = newPosture;

      state.pendingPostureChanges.push({
        countryIso3: iso3,
        towardIso3: playerIso3,
        oldPosture,
        newPosture,
        reason: postureShift < 0 ? 'military_buildup' : 'baseline_alignment',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Access decisions
  // -----------------------------------------------------------------------

  function evaluateAccessDecisions(iso3, profile, countryState, world) {
    const playerIso3 = world.playerCountryIso3;
    const thresholds = AI_DECISION_THRESHOLDS.accessRevocation;
    const currentPosture = countryState.posture;

    if (currentPosture >= thresholds.hostilityThreshold) {
      // Posture isn't hostile enough to consider revoking access
      return;
    }

    // Countries with high leverage and high coercion resistance are harder to pressure
    const resistanceFactor = profile.coercionResistance * profile.leverageAwareness;

    if (resistanceFactor >= thresholds.leverageThreshold) {
      state.pendingAccessDecisions.push({
        countryIso3: iso3,
        targetIso3: playerIso3,
        agreementType: 'resource_export',
        decision: 'restrict',
        reason: 'leverage_position',
      });
    } else {
      state.pendingAccessDecisions.push({
        countryIso3: iso3,
        targetIso3: playerIso3,
        agreementType: 'resource_export',
        decision: 'revoke',
        reason: 'hostile_posture',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Rival build orders
  // -----------------------------------------------------------------------

  function evaluateRivalBuildOrders(world) {
    const playerIso3 = world.playerCountryIso3;
    const rivals = RIVAL_POWERS[playerIso3] ?? [];
    const playerMilitaryCount = countTotalMilitaryAssets(playerIso3, world);

    for (const rivalIso3 of rivals) {
      const rivalMilitaryCount = countTotalMilitaryAssets(rivalIso3, world);
      const deficit = playerMilitaryCount - rivalMilitaryCount;

      if (deficit <= 0) {
        continue;
      }

      // Build proportionally to close the gap, capped at a reasonable rate
      const buildQuantity = Math.min(Math.ceil(deficit * 0.1), 5);

      state.aiBuildOrders.push({
        countryIso3: rivalIso3,
        assetType: 'mixed_military',
        quantity: buildQuantity,
        reason: 'parity_response',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// State factories
// ---------------------------------------------------------------------------

function createInitialState() {
  return {
    ready: false,
    evaluationInterval: 3600,
    timeSinceLastEvaluation: 0,
    worldState: null,
    countryStates: {},
    pendingPriceChanges: [],
    pendingPostureChanges: [],
    pendingAccessDecisions: [],
    aiBuildOrders: [],
  };
}

function createCountryState() {
  return {
    priceMultipliers: {},
    posture: 0,
  };
}

// ---------------------------------------------------------------------------
// World-state queries
// ---------------------------------------------------------------------------

// Baseline capacity estimates (index units) per resource type
const BASELINE_CAPACITY = { oil: 5000, rare_earths: 1000, chips: 800 };

function calculateScarcity(resource, world) {
  const stockpiles = world.resourceStockpiles ?? {};
  const current = stockpiles[resource] ?? 0;
  const shocks = world.supplyShocks ?? {};
  const shockSeverity = shocks[resource] ?? 0;

  const capacity = BASELINE_CAPACITY[resource] ?? 1000;

  // Ratio: 0 = totally depleted, 1 = at capacity
  const stockpileRatio = clamp(current / capacity, 0, 1);

  // Invert so that low stockpiles = high scarcity, layer in supply shocks
  return clamp(1 - stockpileRatio + shockSeverity * 0.3, 0, 1);
}

function countMilitaryAssetsNearCountry(countryIso3, world) {
  const deployments = world.militaryDeployments ?? [];
  let count = 0;
  for (const deployment of deployments) {
    if (deployment.countryIso3 === countryIso3) {
      continue;
    }
    if (deployment.nearCountries && deployment.nearCountries.includes(countryIso3)) {
      count += deployment.assetCount ?? 1;
    }
  }
  return count;
}

function countTotalMilitaryAssets(countryIso3, world) {
  const deployments = world.militaryDeployments ?? [];
  let total = 0;
  for (const deployment of deployments) {
    if (deployment.countryIso3 === countryIso3) {
      total += deployment.assetCount ?? 1;
    }
  }
  return total;
}

function countActiveContracts(sellerIso3, buyerIso3, world) {
  const contracts = world.activeContracts ?? [];
  let count = 0;
  for (const contract of contracts) {
    if (contract.sellerIso3 === sellerIso3 && contract.buyerIso3 === buyerIso3) {
      count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shallowCopyMap(source) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = { ...value };
  }
  return result;
}
