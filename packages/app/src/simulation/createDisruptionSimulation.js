import { DISRUPTION_TARGETS, CASCADE_RULES } from '../game/data/disruptionCatalog.js';

const MAX_CASCADE_DEPTH = 3;
const SECONDS_PER_HOUR = 3600;
const CASCADE_KEYS = Object.keys(CASCADE_RULES);

export function createDisruptionSimulation() {
  let state = createInitialState();
  let nextId = 1;

  function recalculateSupplyShocks() {
    const directDamage = {};

    for (const event of state.damageEvents) {
      const target = DISRUPTION_TARGETS[event.targetType];
      if (!target) {
        continue;
      }
      for (const key of target.cascadeKeys) {
        directDamage[key] = Math.min(
          (directDamage[key] ?? 0) + event.currentDamage,
          1,
        );
      }
    }

    const resolved = {};
    for (const key of CASCADE_KEYS) {
      resolved[key] = 0;
    }

    propagateCascade(directDamage, resolved, 0);

    for (const key of CASCADE_KEYS) {
      const totalDamage = Math.min((directDamage[key] ?? 0) + resolved[key], 1);
      state.supplyShocks[key] = Math.max(1 - totalDamage, 0);
    }
  }

  function propagateCascade(directDamage, resolved, depth) {
    if (depth >= MAX_CASCADE_DEPTH) {
      return;
    }

    const propagated = {};

    for (const key of CASCADE_KEYS) {
      const sourceDamage = (directDamage[key] ?? 0) + resolved[key];
      if (sourceDamage <= 0) {
        continue;
      }

      const rule = CASCADE_RULES[key];
      for (const output of rule.affectedOutputs) {
        const contribution = sourceDamage * rule.propagationFactor;
        if (Number.isFinite(contribution) && contribution > 0) {
          propagated[output] = Math.min(
            (propagated[output] ?? 0) + contribution,
            1,
          );
        }
      }
    }

    let hasNewDamage = false;
    for (const key of Object.keys(propagated)) {
      const additional = propagated[key] - (resolved[key] ?? 0);
      if (additional > 1e-9) {
        resolved[key] = propagated[key];
        hasNewDamage = true;
      }
    }

    if (hasNewDamage) {
      propagateCascade(directDamage, resolved, depth + 1);
    }
  }

  function estimateRecoveryHours(event) {
    const target = DISRUPTION_TARGETS[event.targetType];
    if (!target || target.recoveryRatePerHour <= 0) {
      return Infinity;
    }

    const repairEntry = state.repairQueue.find(
      (r) => r.targetId === event.id,
    );
    const effectiveRate =
      target.recoveryRatePerHour + (repairEntry ? repairEntry.repairRate : 0);

    if (effectiveRate <= 0) {
      return Infinity;
    }

    return event.currentDamage / effectiveRate;
  }

  function accumulateEconomicDamage(deltaSeconds) {
    const hourFraction = deltaSeconds / SECONDS_PER_HOUR;
    for (const event of state.damageEvents) {
      const target = DISRUPTION_TARGETS[event.targetType];
      if (!target) {
        continue;
      }
      const damage = event.currentDamage * target.economicMultiplier * hourFraction;
      if (Number.isFinite(damage)) {
        state.totalEconomicDamage += damage;
      }
    }
  }

  return {
    applyStrike(targetType, targetId, severity) {
      const target = DISRUPTION_TARGETS[targetType];
      if (!target) {
        return null;
      }

      const clampedSeverity = Math.min(
        Math.max(Number.isFinite(severity) ? severity : 0, 0),
        target.damageCapacity,
      );

      const event = {
        id: nextId,
        targetType,
        targetId,
        targetLabel: target.label,
        severity: clampedSeverity,
        currentDamage: clampedSeverity,
        recoveryProgress: 0,
      };
      nextId += 1;

      state.damageEvents.push(event);
      recalculateSupplyShocks();

      return event;
    },

    step(deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return;
      }

      accumulateEconomicDamage(deltaSeconds);

      const hourFraction = deltaSeconds / SECONDS_PER_HOUR;
      const repairByTargetId = new Map();
      for (const entry of state.repairQueue) {
        repairByTargetId.set(entry.targetId, entry);
      }

      for (const event of state.damageEvents) {
        const target = DISRUPTION_TARGETS[event.targetType];
        if (!target) {
          continue;
        }

        let recoveryAmount = target.recoveryRatePerHour * hourFraction;

        const repairEntry = repairByTargetId.get(event.id);
        if (repairEntry) {
          recoveryAmount += repairEntry.repairRate * hourFraction;
        }

        event.currentDamage = Math.max(event.currentDamage - recoveryAmount, 0);

        if (event.severity > 0) {
          event.recoveryProgress = 1 - event.currentDamage / event.severity;
        }
      }

      const removedIds = new Set();
      for (let i = state.damageEvents.length - 1; i >= 0; i -= 1) {
        if (state.damageEvents[i].currentDamage <= 0) {
          removedIds.add(state.damageEvents[i].id);
          state.damageEvents.splice(i, 1);
        }
      }

      if (removedIds.size > 0) {
        state.repairQueue = state.repairQueue.filter(
          (r) => !removedIds.has(r.targetId),
        );
      }

      recalculateSupplyShocks();
    },

    repairTarget(targetId, repairAmount) {
      if (!Number.isFinite(repairAmount) || repairAmount <= 0) {
        return;
      }

      const existing = state.repairQueue.find(
        (r) => r.targetId === targetId,
      );
      if (existing) {
        existing.repairRate = repairAmount;
        return;
      }

      state.repairQueue.push({
        targetId,
        repairRate: repairAmount,
      });
    },

    getSupplyShockMultipliers() {
      const result = {};
      for (const key of CASCADE_KEYS) {
        result[key] = state.supplyShocks[key] ?? 1;
      }
      return result;
    },

    getDamageEvents() {
      return state.damageEvents.map((e) => ({ ...e }));
    },

    getSnapshot() {
      return {
        damageEvents: state.damageEvents.map((e) => ({
          ...e,
          recoveryPercent: Math.round(
            (e.severity > 0 ? (1 - e.currentDamage / e.severity) : 1) * 100,
          ),
          estimatedRecoveryHours: estimateRecoveryHours(e),
        })),
        supplyShocks: { ...state.supplyShocks },
        activeDamageCount: state.damageEvents.length,
        totalEconomicDamage: state.totalEconomicDamage,
      };
    },

    serializeState() {
      return JSON.parse(JSON.stringify(state));
    },

    loadState(serialized) {
      state = {
        damageEvents: serialized.damageEvents ?? [],
        supplyShocks: serialized.supplyShocks ?? {},
        repairQueue: serialized.repairQueue ?? [],
        totalEconomicDamage: serialized.totalEconomicDamage ?? 0,
      };

      let maxId = 0;
      for (const event of state.damageEvents) {
        if (Number.isFinite(event.id) && event.id >= maxId) {
          maxId = event.id;
        }
      }
      nextId = maxId + 1;

      recalculateSupplyShocks();
    },

    reset() {
      state = createInitialState();
      nextId = 1;
    },
  };
}

function createInitialState() {
  const supplyShocks = {};
  for (const key of CASCADE_KEYS) {
    supplyShocks[key] = 1;
  }

  return {
    damageEvents: [],
    supplyShocks,
    repairQueue: [],
    totalEconomicDamage: 0,
  };
}
