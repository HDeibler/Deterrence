import { INTERCEPTOR_TYPES, INTERCEPTOR_MAINTENANCE } from '../game/data/interceptCatalog.js';

const MAX_RECENT_RESULTS = 50;
const SNAPSHOT_RESULTS_LIMIT = 10;
const DEFAULT_AMMO_PER_INTERCEPTOR = 10;

export function createInterceptSimulation() {
  let state = createInitialState();
  let nextEngagementId = 1;

  return {
    step(deltaSeconds) {
      resolveEngagements(state, deltaSeconds);
      pruneOldResults(state);
      recalculateMaintenanceDrain(state);
    },

    getSnapshot() {
      return {
        ready: state.ready,
        interceptorBases: state.interceptorBases.map((base) => ({
          baseId: base.baseId,
          baseName: base.baseName,
          lat: base.lat,
          lon: base.lon,
          interceptorCount: base.interceptorCount,
          interceptorType: base.interceptorType,
          ammo: base.ammo,
          ammoPercent:
            base.ammo > 0
              ? Math.round((base.ammo / (base.interceptorCount * DEFAULT_AMMO_PER_INTERCEPTOR)) * 100)
              : 0,
        })),
        activeEngagements: state.engagementQueue.length,
        recentResults: state.engagementResults.slice(-SNAPSHOT_RESULTS_LIMIT),
        stats: {
          totalEngagements: state.totalEngagements,
          totalInterceptions: state.totalInterceptions,
          totalMisses: state.totalMisses,
          interceptRate:
            state.totalEngagements > 0
              ? Math.round((state.totalInterceptions / state.totalEngagements) * 100)
              : 0,
        },
        maintenanceDrain: { ...state.maintenanceDrain },
      };
    },

    serializeState() {
      return JSON.parse(JSON.stringify(state));
    },

    loadState(serialized) {
      state = {
        ready: serialized.ready,
        interceptorBases: serialized.interceptorBases.map((base) => ({ ...base })),
        engagementQueue: serialized.engagementQueue.map((engagement) => ({ ...engagement })),
        engagementResults: serialized.engagementResults.map((result) => ({ ...result })),
        totalEngagements: serialized.totalEngagements,
        totalInterceptions: serialized.totalInterceptions,
        totalMisses: serialized.totalMisses,
        maintenanceDrain: { ...serialized.maintenanceDrain },
      };
    },

    reset() {
      state = createInitialState();
    },

    setDeployedInterceptors(deployments) {
      state.interceptorBases = deployments.map((deployment) => ({
        baseId: deployment.baseId,
        baseName: deployment.baseName,
        lat: deployment.lat,
        lon: deployment.lon,
        interceptorCount: deployment.interceptorCount,
        interceptorType: deployment.interceptorType,
        ammo: deployment.interceptorCount * DEFAULT_AMMO_PER_INTERCEPTOR,
      }));
      state.ready = state.interceptorBases.length > 0;
      recalculateMaintenanceDrain(state);
    },

    evaluateIncoming(incomingMissiles, radarCoverage) {
      const queued = [];

      for (const missile of incomingMissiles) {
        if (!isMissileDetectedByRadar(missile, radarCoverage)) {
          continue;
        }

        const candidateBase = findBestInterceptorBase(state.interceptorBases, missile);
        if (!candidateBase) {
          continue;
        }

        const interceptorSpec = INTERCEPTOR_TYPES[candidateBase.interceptorType];
        if (!interceptorSpec) {
          continue;
        }

        const engagement = {
          id: nextEngagementId,
          missileId: missile.id,
          interceptorBaseId: candidateBase.baseId,
          interceptorType: candidateBase.interceptorType,
          status: 'pending',
          resolveTime: interceptorSpec.reactionTimeSeconds,
        };
        nextEngagementId += 1;

        state.engagementQueue.push(engagement);
        queued.push({ ...engagement });
      }

      return queued;
    },

    getEngagementResults() {
      return state.engagementResults.map((result) => ({ ...result }));
    },

    getMaintenanceDrain() {
      return { ...state.maintenanceDrain };
    },
  };
}

function createInitialState() {
  return {
    ready: false,
    interceptorBases: [],
    engagementQueue: [],
    engagementResults: [],
    totalEngagements: 0,
    totalInterceptions: 0,
    totalMisses: 0,
    maintenanceDrain: { oil: 0, chips: 0 },
  };
}

function resolveEngagements(state, deltaSeconds) {
  for (let i = state.engagementQueue.length - 1; i >= 0; i -= 1) {
    const engagement = state.engagementQueue[i];
    engagement.resolveTime -= deltaSeconds;

    if (engagement.resolveTime > 0) {
      continue;
    }

    const interceptorSpec = INTERCEPTOR_TYPES[engagement.interceptorType];
    if (!interceptorSpec) {
      state.engagementQueue.splice(i, 1);
      continue;
    }

    const intercepted = Math.random() < interceptorSpec.probabilityOfKill;

    const base = state.interceptorBases.find((b) => b.baseId === engagement.interceptorBaseId);
    if (base) {
      base.ammo = Math.max(base.ammo - interceptorSpec.ammoPerEngagement, 0);
    }

    state.engagementResults.push({
      id: engagement.id,
      missileId: engagement.missileId,
      intercepted,
      interceptorType: engagement.interceptorType,
      baseId: engagement.interceptorBaseId,
    });

    state.totalEngagements += 1;
    if (intercepted) {
      state.totalInterceptions += 1;
    } else {
      state.totalMisses += 1;
    }

    state.engagementQueue.splice(i, 1);
  }
}

function pruneOldResults(state) {
  if (state.engagementResults.length > MAX_RECENT_RESULTS) {
    state.engagementResults.splice(0, state.engagementResults.length - MAX_RECENT_RESULTS);
  }
}

function recalculateMaintenanceDrain(state) {
  let totalInterceptors = 0;
  for (const base of state.interceptorBases) {
    if (Number.isFinite(base.interceptorCount)) {
      totalInterceptors += base.interceptorCount;
    }
  }

  state.maintenanceDrain.oil = totalInterceptors * INTERCEPTOR_MAINTENANCE.interceptor.oilPerHour;
  state.maintenanceDrain.chips = totalInterceptors * INTERCEPTOR_MAINTENANCE.interceptor.chipsPerHour;
}

function isMissileDetectedByRadar(missile, radarCoverage) {
  if (!Number.isFinite(missile.lat) || !Number.isFinite(missile.lon)) {
    return false;
  }

  for (const radar of radarCoverage) {
    if (!Number.isFinite(radar.lat) || !Number.isFinite(radar.lon) || !Number.isFinite(radar.rangeKm)) {
      continue;
    }

    const distanceKm = haversineDistanceKm(radar.lat, radar.lon, missile.lat, missile.lon);
    if (distanceKm <= radar.rangeKm) {
      return true;
    }
  }
  return false;
}

function findBestInterceptorBase(bases, missile) {
  let bestBase = null;
  let bestDistance = Infinity;

  for (const base of bases) {
    const interceptorSpec = INTERCEPTOR_TYPES[base.interceptorType];
    if (!interceptorSpec) {
      continue;
    }

    if (base.ammo < interceptorSpec.ammoPerEngagement) {
      continue;
    }

    if (Number.isFinite(missile.altitudeKm)) {
      if (
        missile.altitudeKm < interceptorSpec.interceptAltitudeMinKm ||
        missile.altitudeKm > interceptorSpec.interceptAltitudeMaxKm
      ) {
        continue;
      }
    }

    const impactLat = Number.isFinite(missile.impactLat) ? missile.impactLat : missile.lat;
    const impactLon = Number.isFinite(missile.impactLon) ? missile.impactLon : missile.lon;

    if (!Number.isFinite(impactLat) || !Number.isFinite(impactLon)) {
      continue;
    }

    const distanceKm = haversineDistanceKm(base.lat, base.lon, impactLat, impactLon);
    if (distanceKm > interceptorSpec.rangeKm) {
      continue;
    }

    if (distanceKm < bestDistance) {
      bestDistance = distanceKm;
      bestBase = base;
    }
  }

  return bestBase;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371;
}
