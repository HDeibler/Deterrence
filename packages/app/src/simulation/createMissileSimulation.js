import * as THREE from 'three';
import {
  applyEarthRotation,
  haversineDistanceKm,
  latLonToVector3,
  vector3ToLatLon,
} from '../world/geo/geoMath.js';
import { solveLambert } from './orbitalMath.js';

export function createMissileSimulation({ simulationConfig, worldConfig }) {
  const earthRadiusUnits = worldConfig.earthRadius;
  const earthRadiusMeters = earthRadiusUnits * simulationConfig.scaleMeters;
  const earthRotationRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const mu = simulationConfig.gravitationalConstant * worldConfig.earthMass;
  const actualPath = [];
  const predictedPath = [];

  let missileState = null;
  let launchContext = null;
  let predictionElapsed = 0;
  let pathElapsed = 0;
  let lastPredictionRevision = 0;
  let revision = 0;

  const snapshot = createIdleSnapshot();

  return {
    launch({ launchSite, target, earthRotationRadians }) {
      launchContext = createLaunchContext({
        launchSite,
        target,
        earthRotationRadians,
        earthRadiusUnits,
        earthRadiusMeters,
      });
      missileState = createInitialMissileState({ launchContext, earthRotationRate });
      actualPath.length = 0;
      predictedPath.length = 0;
      actualPath.push(
        toEarthFixedLocalPoint({
          position: missileState.position,
          earthRotationRadians: launchContext.earthRotationRadians,
        }),
      );
      predictionElapsed = simulationConfig.missile.predictionRefreshSeconds;
      pathElapsed = 0;
      revision += 1;
      refreshSnapshot();
    },
    step(deltaSeconds) {
      if (!missileState || !launchContext) {
        return;
      }

      if (missileState.phase === 'impact') {
        missileState.impactElapsedSeconds += deltaSeconds;
        // Clear predicted path immediately on impact
        predictedPath.length = 0;
        // Full cleanup after brief linger
        if (missileState.impactElapsedSeconds >= IMPACT_CLEANUP_SECONDS) {
          actualPath.length = 0;
          missileState.phase = 'complete';
        }
        refreshSnapshot();
        return;
      }

      if (missileState.phase === 'complete') {
        refreshSnapshot();
        return;
      }

      const stepSeconds = Math.min(
        deltaSeconds,
        simulationConfig.missile.maxIntegrationStepSeconds,
      );
      propagateMissile({
        state: missileState,
        context: launchContext,
        deltaSeconds: stepSeconds,
        mu,
        earthRadiusMeters,
        earthRotationRate,
        simulationConfig,
      });

      pathElapsed += stepSeconds;
      if (
        pathElapsed >= simulationConfig.missile.actualPathSampleSeconds ||
        missileState.phase === 'impact'
      ) {
        actualPath.push(
          toEarthFixedLocalPoint({
            position: missileState.position,
            earthRotationRadians:
              launchContext.earthRotationRadians +
              earthRotationRate * missileState.flightTimeSeconds,
          }),
        );
        if (actualPath.length > simulationConfig.missile.actualPathPoints) {
          actualPath.shift();
        }
        pathElapsed = 0;
      }

      predictionElapsed += stepSeconds;
      const shouldRefreshPrediction =
        predictionElapsed >= simulationConfig.missile.predictionRefreshSeconds ||
        lastPredictionRevision !== revision ||
        missileState.phase === 'impact';

      if (shouldRefreshPrediction) {
        recomputePredictedPath({
          predictedPath,
          state: missileState,
          context: launchContext,
          mu,
          earthRadiusMeters,
          earthRotationRate,
          simulationConfig,
        });
        predictionElapsed = 0;
        lastPredictionRevision = revision;
      }

      refreshSnapshot();
    },
    getSnapshot() {
      return snapshot;
    },
    isActive() {
      return Boolean(
        missileState && missileState.phase !== 'idle' && missileState.phase !== 'complete',
      );
    },
  };

  function refreshSnapshot() {
    if (!missileState || !launchContext || missileState.phase === 'complete') {
      Object.assign(snapshot, createIdleSnapshot());
      return;
    }

    const altitudeKm = Math.max(
      (missileState.position.length() * simulationConfig.scaleMeters - earthRadiusMeters) / 1000,
      0,
    );
    const speedKmS = (missileState.velocity.length() * simulationConfig.scaleMeters) / 1000;
    const targetDistanceKm = haversineDistanceKm(
      { lat: missileState.groundTrack.lat, lon: missileState.groundTrack.lon },
      launchContext.target,
    );

    Object.assign(snapshot, {
      active: missileState.phase !== 'idle',
      visible: true,
      phase: missileState.phase,
      stageLabel: missileState.stageLabel,
      stageIndex: missileState.stageIndex,
      altitudeKm,
      speedKmS,
      timeToImpactSeconds: missileState.predictedTimeToImpactSeconds,
      rangeToTargetKm: targetDistanceKm,
      apogeeKm: missileState.apogeeKm,
      flightTimeSeconds: missileState.flightTimeSeconds,
      launchSite: launchContext.launchSite,
      target: launchContext.target,
      impactPoint: missileState.impactPoint,
      position: missileState.position.clone(),
      direction:
        missileState.attitudeDirection?.clone() ??
        (missileState.velocity.lengthSq() > 1e-12
          ? missileState.velocity.clone().normalize()
          : missileState.position.clone().normalize()),
      actualPath,
      predictedPath,
    });
  }
}

function createIdleSnapshot() {
  return {
    active: false,
    visible: false,
    phase: 'idle',
    stageLabel: 'Standby',
    stageIndex: null,
    altitudeKm: 0,
    speedKmS: 0,
    timeToImpactSeconds: null,
    rangeToTargetKm: null,
    apogeeKm: 0,
    flightTimeSeconds: 0,
    launchSite: null,
    target: null,
    impactPoint: null,
    position: null,
    direction: null,
    actualPath: [],
    predictedPath: [],
  };
}

function createLaunchContext({
  launchSite,
  target,
  earthRotationRadians,
  earthRadiusUnits,
  earthRadiusMeters,
}) {
  const launchLocal = latLonToVector3({
    lat: launchSite.latitude,
    lon: launchSite.longitude,
    radius: earthRadiusUnits,
  });
  const targetLocal = latLonToVector3({
    lat: target.lat,
    lon: target.lon,
    radius: earthRadiusUnits,
  });

  const planeNormalLocal = launchLocal.clone().cross(targetLocal);
  if (planeNormalLocal.lengthSq() < 1e-10) {
    planeNormalLocal.set(0, 1, 0);
  } else {
    planeNormalLocal.normalize();
  }

  const ballisticRangeKm = haversineDistanceKm(
    { lat: launchSite.latitude, lon: launchSite.longitude },
    target,
    earthRadiusMeters / 1000,
  );

  return {
    earthRotationRadians,
    launchSite,
    target,
    earthRadiusUnits,
    earthRadiusMeters,
    launchLocal,
    targetLocal,
    planeNormalLocal,
    centralAngleRadians: launchLocal.angleTo(targetLocal),
    ballisticRangeKm,
    flightPlan: createFlightPlan(ballisticRangeKm),
    boostProfile: createBoostProfile(ballisticRangeKm),
  };
}

function createInitialMissileState({ launchContext, earthRotationRate }) {
  const position = applyEarthRotation(
    launchContext.launchLocal,
    launchContext.earthRotationRadians,
  );
  const groundVelocity = new THREE.Vector3(0, earthRotationRate, 0).cross(position.clone());

  return {
    position,
    velocity: groundVelocity,
    attitudeDirection: position.clone().normalize(),
    massKg: computeInitialMassKg(STAGES, PAYLOAD_MASS_KG),
    stageIndex: 0,
    stageTimeSeconds: 0,
    flightTimeSeconds: 0,
    apogeeKm: 0,
    phase: 'boost',
    stageLabel: STAGES[0].name,
    guidanceRevision: 0,
    midcourseStartTime: null,
    impactElapsedSeconds: 0,
    impactPoint: null,
    predictedTimeToImpactSeconds: null,
    groundTrack: {
      lat: launchContext.launchSite.latitude,
      lon: launchContext.launchSite.longitude,
    },
  };
}

function recomputePredictedPath({
  predictedPath,
  state,
  context,
  mu,
  earthRadiusMeters,
  earthRotationRate,
  simulationConfig,
}) {
  predictedPath.length = 0;
  predictedPath.push(
    toEarthFixedLocalPoint({
      position: state.position,
      earthRotationRadians:
        context.earthRotationRadians + earthRotationRate * state.flightTimeSeconds,
    }),
  );

  if (state.phase === 'impact') {
    state.predictedTimeToImpactSeconds = 0;
    return;
  }

  const shadow = cloneState(state);
  let simSeconds = 0;
  const sampleInterval = simulationConfig.missile.predictionSampleSeconds;

  while (
    simSeconds < simulationConfig.missile.maxFlightSeconds &&
    predictedPath.length < simulationConfig.missile.predictedPathPoints
  ) {
    // Sub-step for accuracy: boost uses small steps (thrust direction changes rapidly),
    // coast uses moderate steps (Keplerian arc is smoother but Euler still drifts).
    let remaining = sampleInterval;
    while (remaining > 0.001) {
      const maxStep = shadow.phase === 'boost' ? 0.5 : 2;
      const step = Math.min(remaining, maxStep);
      propagateMissile({
        state: shadow,
        context,
        deltaSeconds: step,
        mu,
        earthRadiusMeters,
        earthRotationRate,
        simulationConfig,
      });
      remaining -= step;
      if (shadow.phase === 'impact') {
        break;
      }
    }

    predictedPath.push(
      toEarthFixedLocalPoint({
        position: shadow.position,
        earthRotationRadians:
          context.earthRotationRadians + earthRotationRate * shadow.flightTimeSeconds,
      }),
    );
    simSeconds += sampleInterval;

    if (shadow.phase === 'impact') {
      break;
    }
  }

  state.predictedTimeToImpactSeconds =
    shadow.phase === 'impact'
      ? Math.max(shadow.flightTimeSeconds - state.flightTimeSeconds, 0)
      : null;
}

function propagateMissile({
  state,
  context,
  deltaSeconds,
  mu,
  earthRadiusMeters,
  earthRotationRate,
  simulationConfig,
}) {
  if (state.phase === 'impact') {
    return;
  }

  const previousPosition = state.position.clone();
  const dynamicsArgs = { state, context, mu, earthRadiusMeters, earthRotationRate, simulationConfig };

  // Velocity Verlet integration (symplectic — conserves orbital energy).
  // Euler drifts ~3-10 km over ICBM flights; Verlet keeps error < 1 km.
  const dynamics1 = computeDynamics(dynamicsArgs);
  state.velocity.addScaledVector(dynamics1.acceleration, deltaSeconds * 0.5);
  state.position.addScaledVector(state.velocity, deltaSeconds);
  const dynamics2 = computeDynamics(dynamicsArgs);
  state.velocity.addScaledVector(dynamics2.acceleration, deltaSeconds * 0.5);
  state.massKg = Math.max(state.massKg - dynamics1.massFlowKgS * deltaSeconds, PAYLOAD_MASS_KG);
  state.flightTimeSeconds += deltaSeconds;
  state.stageTimeSeconds += deltaSeconds;
  state.groundTrack = getGroundTrack({
    position: state.position,
    earthRotationRadians:
      context.earthRotationRadians + earthRotationRate * state.flightTimeSeconds,
  });

  const altitudeKm = Math.max(
    (state.position.length() * simulationConfig.scaleMeters - earthRadiusMeters) / 1000,
    0,
  );
  state.apogeeKm = Math.max(state.apogeeKm, altitudeKm);

  if (state.phase === 'boost' && state.stageIndex !== null) {
    const activeStage = STAGES[state.stageIndex];
    const effectiveBurnTimeSeconds = getEffectiveStageBurnTimeSeconds(context, state.stageIndex);
    if (activeStage && state.stageTimeSeconds >= effectiveBurnTimeSeconds) {
      state.massKg = Math.max(state.massKg - activeStage.dryMassKg, PAYLOAD_MASS_KG);
      state.stageIndex += 1;
      state.stageTimeSeconds = 0;
      if (state.stageIndex >= STAGES.length) {
        state.phase = 'midcourse';
        state.stageIndex = null;
        state.stageLabel = 'Post-Boost';
        state.midcourseStartTime = state.flightTimeSeconds;

        // Burnout velocity correction: solve Lambert for the exact velocity
        // needed to reach the target on a ballistic (Keplerian) arc.
        // This replaces the proportional PBV controller which introduced
        // feedback oscillation error.
        const burnoutRemaining = Math.max(
          context.flightPlan.totalFlightSeconds - state.flightTimeSeconds,
          30,
        );
        const burnoutImpactRot =
          context.earthRotationRadians +
          earthRotationRate * (state.flightTimeSeconds + burnoutRemaining);
        const burnoutTarget = applyEarthRotation(context.targetLocal, burnoutImpactRot);
        const scale = simulationConfig.scaleMeters;
        const muSim = mu / (scale * scale * scale);
        const burnoutLambert = solveLambert({
          r1Vec: state.position,
          r2Vec: burnoutTarget,
          tof: burnoutRemaining,
          mu: muSim,
        });
        if (burnoutLambert) {
          // Sanity check: Lambert velocity should be similar direction and magnitude
          const currentSpeed = state.velocity.length();
          const lambertSpeed = burnoutLambert.length();
          const cosAngle = state.velocity.dot(burnoutLambert) / (currentSpeed * lambertSpeed + 1e-12);
          // Only apply if direction change is < 30° and speed is within 50%
          if (
            lambertSpeed > 0.5 * currentSpeed &&
            lambertSpeed < 1.5 * currentSpeed &&
            cosAngle > 0.85
          ) {
            // Blend rather than snap — 70% Lambert, 30% current for smooth transition
            state.velocity.lerp(burnoutLambert, 0.7);
          }
        }
      } else {
        state.stageLabel = STAGES[state.stageIndex].name;
      }
    }
  }

  if (
    state.phase === 'midcourse' &&
    altitudeKm < simulationConfig.missile.terminalPhaseAltitudeKm &&
    state.velocity.dot(state.position) < 0
  ) {
    state.phase = 'terminal';
    state.stageLabel = 'Reentry Vehicle';
  }

  const impact =
    state.position.length() <= context.earthRadiusUnits
      ? computeImpactPoint({
          previousPosition,
          nextPosition: state.position,
          earthRadiusUnits: context.earthRadiusUnits,
          earthRotationRadians:
            context.earthRotationRadians + earthRotationRate * state.flightTimeSeconds,
        })
      : null;

  if (impact) {
    state.position.copy(impact.worldPoint);
    state.phase = 'impact';
    state.stageLabel = 'Impact';
    state.impactPoint = impact.surfacePoint;
    state.groundTrack = impact.surfacePoint;
  }
}

function computeDynamics({
  state,
  context,
  mu,
  earthRadiusMeters,
  earthRotationRate,
  simulationConfig,
}) {
  const radiusMeters = state.position.length() * simulationConfig.scaleMeters;
  const radialDirection = state.position.clone().normalize();
  const gravity = radialDirection.multiplyScalar(
    -mu / (radiusMeters * radiusMeters) / simulationConfig.scaleMeters,
  );
  const altitudeMeters = Math.max(radiusMeters - earthRadiusMeters, 0);
  const density = computeAirDensityKgM3(altitudeMeters);
  const atmosphereVelocity = new THREE.Vector3(0, earthRotationRate, 0).cross(
    state.position.clone(),
  );
  const relativeVelocity = state.velocity.clone().sub(atmosphereVelocity);
  const relativeSpeedMetersPerSecond = relativeVelocity.length() * simulationConfig.scaleMeters;

  const aerodynamicProfile = getAerodynamicProfile(state.phase, state.stageIndex);
  const dragMagnitude =
    density > 0
      ? (0.5 *
          density *
          relativeSpeedMetersPerSecond *
          relativeSpeedMetersPerSecond *
          aerodynamicProfile.dragCoefficient *
          aerodynamicProfile.referenceAreaM2) /
        state.massKg
      : 0;
  const drag =
    relativeSpeedMetersPerSecond > 0
      ? relativeVelocity
          .clone()
          .normalize()
          .multiplyScalar(-(dragMagnitude / simulationConfig.scaleMeters))
      : new THREE.Vector3();

  let thrustAcceleration = new THREE.Vector3();
  let guidanceAcceleration = new THREE.Vector3();
  let massFlowKgS = 0;
  if (state.phase === 'boost' && state.stageIndex !== null) {
    const activeStage = STAGES[state.stageIndex];
    const thrustDirection = computeThrustDirection({
      state,
      context,
      mu,
      earthRotationRate,
      simulationConfig,
    });
    state.attitudeDirection = thrustDirection.clone();
    const stageThrustScale = getStageThrustScale(context, state.stageIndex);
    thrustAcceleration = thrustDirection.multiplyScalar(
      (activeStage.thrustNewtons * stageThrustScale) / state.massKg / simulationConfig.scaleMeters,
    );
    massFlowKgS = activeStage.propellantMassKg / activeStage.burnTimeSeconds;
  } else if (state.velocity.lengthSq() > 1e-12) {
    state.attitudeDirection = state.velocity.clone().normalize();
    // Post-boost vehicle: brief correction window after boost, then fully ballistic.
    // Terminal phase: RV is unpowered — zero guidance.
    if (state.phase === 'midcourse' && state.midcourseStartTime !== null) {
      const pbvElapsed = state.flightTimeSeconds - state.midcourseStartTime;
      if (pbvElapsed <= PBV_GUIDANCE_WINDOW_SECONDS) {
        guidanceAcceleration = computePbvGuidance({
          state,
          context,
          mu,
          earthRotationRate,
          simulationConfig,
        });
      }
    }
  }

  return {
    acceleration: gravity.add(drag).add(thrustAcceleration).add(guidanceAcceleration),
    massFlowKgS,
  };
}

function computeThrustDirection({ state, context, mu, earthRotationRate, simulationConfig }) {
  const radial = state.position.clone().normalize();

  // Compute the downrange direction: the horizontal component in the great-circle
  // plane from the current position toward the target. This stays strictly in-plane
  // unlike the reference-point approach which drifted out of plane due to Earth rotation.
  let downrangeDir;

  if (state.stageIndex === 2) {
    // Stage 3: precision velocity injection using Lambert targeting.
    const remainingBurn = STAGES[2].burnTimeSeconds - state.stageTimeSeconds;
    const burnoutTime = state.flightTimeSeconds + remainingBurn;
    const coastTime = Math.max(context.flightPlan.totalFlightSeconds - burnoutTime, 30);
    const impactRotation =
      context.earthRotationRadians + earthRotationRate * (burnoutTime + coastTime);
    const targetAtImpact = applyEarthRotation(context.targetLocal, impactRotation);
    const scale = simulationConfig.scaleMeters;
    const muSim = mu / (scale * scale * scale);
    const lambertV = solveLambert({
      r1Vec: state.position,
      r2Vec: targetAtImpact,
      tof: coastTime,
      mu: muSim,
    });
    if (lambertV) {
      downrangeDir = lambertV.normalize();
    } else {
      // Fallback: aim along the great circle toward the target
      downrangeDir = computeInPlaneDownrange(state.position, context, earthRotationRate, state.flightTimeSeconds);
    }
  } else {
    // Stages 1-2: thrust in the great-circle plane toward the target.
    // This produces a clean arc with no lateral deviation.
    downrangeDir = computeInPlaneDownrange(state.position, context, earthRotationRate, state.flightTimeSeconds);
  }

  // Pitch program — radialBlend is the fraction of thrust that's vertical.
  // 1.0 = straight up, 0.0 = fully horizontal (downrange).
  // Short range: stay mostly vertical (high lob, like throwing a ball straight up nearby)
  // Long range: pitch over more to build horizontal velocity for the long arc
  const rangeBlend = THREE.MathUtils.clamp(context.ballisticRangeKm / 12000, 0, 1);
  const effectiveBurnTime = getEffectiveStageBurnTimeSeconds(context, state.stageIndex);
  const stageProgress = THREE.MathUtils.clamp(state.stageTimeSeconds / effectiveBurnTime, 0, 1);

  let radialBlend;
  if (state.stageIndex === 0) {
    // Stage 1: starts vertical, pitches over gradually.
    // Short range: ends at 0.75 (still mostly vertical)
    // Long range: ends at 0.45 (pitched over significantly)
    const blendEnd = THREE.MathUtils.lerp(0.75, 0.45, rangeBlend);
    radialBlend = THREE.MathUtils.lerp(0.97, blendEnd, stageProgress);
  } else if (state.stageIndex === 1) {
    // Stage 2: continues the gravity turn.
    // Short range: stays 0.65-0.55 (mostly vertical — lob trajectory)
    // Long range: 0.40-0.15 (nearly horizontal — efficient range trajectory)
    const blendStart = THREE.MathUtils.lerp(0.65, 0.40, rangeBlend);
    const blendEnd = THREE.MathUtils.lerp(0.55, 0.15, rangeBlend);
    radialBlend = THREE.MathUtils.lerp(blendStart, blendEnd, stageProgress);
  } else {
    // Stage 3: final velocity injection.
    // Short range: 0.50-0.40 (still quite vertical)
    // Long range: 0.12-0.02 (nearly horizontal)
    const blendStart = THREE.MathUtils.lerp(0.50, 0.12, rangeBlend);
    const blendEnd = THREE.MathUtils.lerp(0.40, 0.02, rangeBlend);
    radialBlend = THREE.MathUtils.lerp(blendStart, blendEnd, stageProgress);
  }

  return radial
    .multiplyScalar(radialBlend)
    .add(downrangeDir.multiplyScalar(1 - radialBlend))
    .normalize();
}

// Compute the downrange direction strictly in the great-circle plane.
// This is the tangent direction along the arc from the missile's current
// position toward the target, projected to be perpendicular to the radial.
function computeInPlaneDownrange(position, context, earthRotationRate, flightTimeSeconds) {
  const earthRotationRadians = context.earthRotationRadians + earthRotationRate * flightTimeSeconds;
  const targetWorld = applyEarthRotation(context.targetLocal, earthRotationRadians);

  const radial = position.clone().normalize();
  const toTarget = targetWorld.clone().sub(position);

  // Project to tangent plane (remove radial component)
  const tangent = toTarget.sub(radial.clone().multiplyScalar(toTarget.dot(radial)));

  if (tangent.lengthSq() > 1e-12) {
    return tangent.normalize();
  }

  // Fallback: use the orbital plane normal to compute tangent
  const planeNormal = applyEarthRotation(context.planeNormalLocal, earthRotationRadians);
  return planeNormal.clone().cross(radial).normalize();
}

function computePbvGuidance({ state, context, mu, earthRotationRate, simulationConfig }) {
  // Solve Lambert's problem: given current position and target position,
  // compute the exact velocity needed for a Keplerian orbit that reaches the target.
  // This is the same math real ICBM guidance systems use.
  const remainingSeconds = Math.max(
    context.flightPlan.totalFlightSeconds - state.flightTimeSeconds,
    30,
  );

  // Target position at estimated impact time (accounting for Earth rotation)
  const impactRotation =
    context.earthRotationRadians + earthRotationRate * (state.flightTimeSeconds + remainingSeconds);
  const targetAtImpact = applyEarthRotation(context.targetLocal, impactRotation);

  // mu in simulation units: G*M / scaleMeters^3
  const scale = simulationConfig.scaleMeters;
  const muSim = mu / (scale * scale * scale);

  const requiredVelocity = solveLambert({
    r1Vec: state.position,
    r2Vec: targetAtImpact,
    tof: remainingSeconds,
    mu: muSim,
  });

  if (!requiredVelocity) {
    return new THREE.Vector3();
  }

  // Steer actual velocity toward Lambert solution
  const velError = new THREE.Vector3().subVectors(requiredVelocity, state.velocity);
  const correction = velError.multiplyScalar(0.1);

  const maxAccel = PBV_MAX_ACCELERATION_MS2 / simulationConfig.scaleMeters;
  if (correction.lengthSq() > maxAccel * maxAccel) {
    correction.normalize().multiplyScalar(maxAccel);
  }

  return correction;
}

function computeGuidanceAcceleration({ state, context, earthRotationRate, simulationConfig }) {
  const remainingRangeKm = haversineDistanceKm(
    state.groundTrack,
    context.target,
    context.earthRadiusMeters / 1000,
  );
  const currentEarthRotationRadians =
    context.earthRotationRadians + earthRotationRate * state.flightTimeSeconds;
  const directTargetPoint = applyEarthRotation(context.targetLocal, currentEarthRotationRadians);
  const desiredPoint =
    state.phase === 'terminal' || remainingRangeKm < 1200
      ? directTargetPoint
      : computeReferencePoint({
          context,
          earthRotationRate,
          timeSeconds: state.flightTimeSeconds,
          lookAheadSeconds: state.phase === 'midcourse' ? 140 : 24,
        });
  const toDesired = desiredPoint.sub(state.position);
  if (toDesired.lengthSq() < 1e-10) {
    return new THREE.Vector3();
  }

  const desiredDirection = toDesired.normalize();
  const velocityDirection = state.velocity.clone().normalize();
  const steeringError = desiredDirection.sub(velocityDirection);
  // Stronger guidance closer to target, stronger in terminal phase
  const rangeFactor = THREE.MathUtils.clamp(1 - remainingRangeKm / 5000, 0.3, 1);
  const steeringMagnitude = state.phase === 'terminal' ? 40 : 6 + 14 * rangeFactor;

  if (steeringError.lengthSq() < 1e-10) {
    return computeAxialCorrection({
      state,
      context,
      earthRotationRate,
      desiredDirection,
      simulationConfig,
    });
  }

  const lateral = steeringError
    .normalize()
    .multiplyScalar(steeringMagnitude / simulationConfig.scaleMeters);
  const axial = computeAxialCorrection({
    state,
    context,
    earthRotationRate,
    desiredDirection,
    simulationConfig,
  });
  return lateral.add(axial);
}

function computeReferencePoint({ context, earthRotationRate, timeSeconds, lookAheadSeconds }) {
  const t = Math.min(timeSeconds + lookAheadSeconds, context.flightPlan.totalFlightSeconds);
  const progress = THREE.MathUtils.clamp(t / context.flightPlan.totalFlightSeconds, 0, 1);
  // Smooth altitude profile: sin curve peaks at midpoint.
  // Exponent < 1 broadens the peak for a flatter trajectory at high altitude.
  const altitudeUnits =
    (context.flightPlan.apogeeKm / 1000) * Math.pow(Math.sin(Math.PI * progress), 0.9);
  // Rotate from launch direction toward target along the great-circle plane
  const localDirection = context.launchLocal
    .clone()
    .normalize()
    .applyAxisAngle(context.planeNormalLocal, context.centralAngleRadians * progress);
  const localPosition = localDirection.multiplyScalar(context.earthRadiusUnits + altitudeUnits);
  return applyEarthRotation(localPosition, context.earthRotationRadians + earthRotationRate * t);
}

function createFlightPlan(rangeKm) {
  // Apogee from real ICBM data (Minuteman III profiles):
  //   1000 km → ~300 km    3000 km → ~500 km    8000 km → ~900 km
  //  10000 km → ~1000 km  13000 km → ~1200 km  18000 km → ~1400 km
  // Cap at 17500 km — near-antipodal transfers (>17500 km) cause Lambert
  // solver degeneracy. No real ICBM flies further than ~15000 km anyway.
  const effectiveRangeKm = Math.min(rangeKm, 17500);
  const rangeFraction = THREE.MathUtils.clamp(effectiveRangeKm / 20000, 0, 1);
  const apogeeKm = THREE.MathUtils.lerp(280, 1400, Math.pow(rangeFraction, 0.65));

  // Total flight time fit to real ICBM trajectory data (Minuteman III profiles):
  //   1000 km → ~360s    5000 km → ~1200s    8000 km → ~1680s
  //  10000 km → ~1800s  13000 km → ~2100s   18000 km → ~2580s
  // Sqrt fit: -325 + 21.65 * sqrt(range) matches within ±4% for 1000-18000 km.
  const totalFlightSeconds = Math.max(200, -325 + 21.65 * Math.sqrt(effectiveRangeKm));

  return {
    totalFlightSeconds,
    apogeeKm,
  };
}

function createBoostProfile(rangeKm) {
  // For short range, reduce burn time on later stages to avoid overshoot.
  // Real short-range ballistic missiles have fewer stages and less propellant.
  // We simulate this by cutting burn fractions for short-range shots.
  const rangeFraction = THREE.MathUtils.clamp(rangeKm / 10000, 0, 1);

  // Stage 1: always burns fully
  // Stage 2: slightly reduced for short range (70% minimum)
  // Stage 3: reduced for short range (40% minimum) — less horizontal injection
  const stage2Burn = THREE.MathUtils.lerp(0.7, 1.0, rangeFraction);
  const stage3Burn = THREE.MathUtils.lerp(0.4, 1.0, rangeFraction);

  return {
    stageBurnFractions: [1, stage2Burn, stage3Burn],
    stageThrustScales: [1, 1, 1],
  };
}

function computeImpactPoint({
  previousPosition,
  nextPosition,
  earthRadiusUnits,
  earthRotationRadians,
}) {
  const direction = nextPosition.clone().sub(previousPosition);
  const a = direction.dot(direction);
  const b = 2 * previousPosition.dot(direction);
  const c = previousPosition.dot(previousPosition) - earthRadiusUnits * earthRadiusUnits;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0 || a === 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const t0 = (-b - root) / (2 * a);
  const t1 = (-b + root) / (2 * a);
  const t = [t0, t1].find((value) => value >= 0 && value <= 1);
  if (t === undefined) {
    return null;
  }

  const worldPoint = previousPosition.clone().lerp(nextPosition, t);
  const localPoint = applyEarthRotation(worldPoint, -earthRotationRadians);
  const surfacePoint = vector3ToLatLon(localPoint);
  return { worldPoint, surfacePoint };
}

function getGroundTrack({ position, earthRotationRadians }) {
  return vector3ToLatLon(applyEarthRotation(position, -earthRotationRadians));
}

function cloneState(state) {
  return {
    ...state,
    position: state.position.clone(),
    velocity: state.velocity.clone(),
    attitudeDirection: state.attitudeDirection?.clone() ?? null,
    groundTrack: { ...state.groundTrack },
    impactPoint: state.impactPoint ? { ...state.impactPoint } : null,
  };
}

function toEarthFixedLocalPoint({ position, earthRotationRadians }) {
  return applyEarthRotation(position, -earthRotationRadians);
}

function getEffectiveStageBurnTimeSeconds(context, stageIndex) {
  const stage = STAGES[stageIndex];
  const burnFraction = context.boostProfile.stageBurnFractions[stageIndex] ?? 1;
  return stage.burnTimeSeconds * burnFraction;
}

function getStageThrustScale(context, stageIndex) {
  return context.boostProfile.stageThrustScales?.[stageIndex] ?? 1;
}

function computeAxialCorrection({
  state,
  context,
  earthRotationRate,
  desiredDirection,
  simulationConfig,
}) {
  const closingSpeedUnitsPerSecond = state.velocity.dot(desiredDirection);
  const remainingFlightSeconds = Math.max(
    context.flightPlan.totalFlightSeconds - state.flightTimeSeconds,
    state.phase === 'terminal' ? 8 : 45,
  );
  const currentEarthRotationRadians =
    context.earthRotationRadians + earthRotationRate * state.flightTimeSeconds;
  const targetWorld = applyEarthRotation(context.targetLocal, currentEarthRotationRadians);
  const targetDistanceUnits = Math.max(state.position.distanceTo(targetWorld), 0.0005);
  const scheduledSecondsRemaining = THREE.MathUtils.clamp(
    remainingFlightSeconds,
    state.phase === 'terminal' ? 8 : 30,
    900,
  );
  const desiredClosingSpeedUnitsPerSecond = Math.max(
    targetDistanceUnits / scheduledSecondsRemaining,
    0.0005,
  );
  const axialError = desiredClosingSpeedUnitsPerSecond - closingSpeedUnitsPerSecond;
  const axialLimit = state.phase === 'terminal' ? 15 : 5;
  const axialAcceleration = THREE.MathUtils.clamp(
    axialError / (state.phase === 'terminal' ? 4 : 20),
    -axialLimit,
    axialLimit,
  );
  return desiredDirection.clone().multiplyScalar(axialAcceleration / simulationConfig.scaleMeters);
}

function getAerodynamicProfile(phase, stageIndex) {
  if (phase === 'boost' && stageIndex !== null) {
    const activeStage = STAGES[stageIndex];
    return {
      dragCoefficient: activeStage.dragCoefficient,
      referenceAreaM2: activeStage.referenceAreaM2,
    };
  }

  if (phase === 'terminal') {
    return {
      dragCoefficient: 0.22,
      referenceAreaM2: 0.11,
    };
  }

  return {
    dragCoefficient: 0.18,
    referenceAreaM2: 0.09,
  };
}

function computeAirDensityKgM3(altitudeMeters) {
  if (altitudeMeters >= 120000) {
    return 0;
  }

  const layer =
    ATMOSPHERE_LAYERS.find((candidate, index) => {
      const next = ATMOSPHERE_LAYERS[index + 1];
      return !next || altitudeMeters < next.baseAltitudeMeters;
    }) ?? ATMOSPHERE_LAYERS[ATMOSPHERE_LAYERS.length - 1];

  const h = altitudeMeters - layer.baseAltitudeMeters;
  if (layer.lapseRate !== 0) {
    const temperature = layer.baseTemperatureKelvin + layer.lapseRate * h;
    const pressure =
      layer.basePressurePascal *
      Math.pow(
        layer.baseTemperatureKelvin / temperature,
        STANDARD_GRAVITY / (SPECIFIC_GAS_CONSTANT * layer.lapseRate),
      );
    return pressure / (SPECIFIC_GAS_CONSTANT * temperature);
  }

  const pressure =
    layer.basePressurePascal *
    Math.exp((-STANDARD_GRAVITY * h) / (SPECIFIC_GAS_CONSTANT * layer.baseTemperatureKelvin));
  return pressure / (SPECIFIC_GAS_CONSTANT * layer.baseTemperatureKelvin);
}

function computeInitialMassKg(stages, payloadMassKg) {
  return stages.reduce(
    (total, stage) => total + stage.propellantMassKg + stage.dryMassKg,
    payloadMassKg,
  );
}

const PAYLOAD_MASS_KG = 1100;
const STANDARD_GRAVITY = 9.80665;
const SPECIFIC_GAS_CONSTANT = 287.05287;
const IMPACT_CLEANUP_SECONDS = 5;
const PBV_GUIDANCE_WINDOW_SECONDS = 120;
const PBV_MAX_ACCELERATION_MS2 = 15;

// Stage radialBlend is set dynamically based on range in computeThrustDirection.
// These are the base values — actual blend is scaled by range.
const STAGES = [
  {
    name: 'Stage 1',
    burnTimeSeconds: 62,
    thrustNewtons: 1_350_000,
    propellantMassKg: 24_000,
    dryMassKg: 2_600,
    dragCoefficient: 0.38,
    referenceAreaM2: 1.35,
  },
  {
    name: 'Stage 2',
    burnTimeSeconds: 58,
    thrustNewtons: 315_000,
    propellantMassKg: 7_200,
    dryMassKg: 840,
    dragCoefficient: 0.32,
    referenceAreaM2: 0.72,
  },
  {
    name: 'Stage 3',
    burnTimeSeconds: 46,
    thrustNewtons: 122_000,
    propellantMassKg: 2_300,
    dryMassKg: 420,
    dragCoefficient: 0.26,
    referenceAreaM2: 0.34,
  },
];

const ATMOSPHERE_LAYERS = [
  {
    baseAltitudeMeters: 0,
    baseTemperatureKelvin: 288.15,
    basePressurePascal: 101325,
    lapseRate: -0.0065,
  },
  {
    baseAltitudeMeters: 11000,
    baseTemperatureKelvin: 216.65,
    basePressurePascal: 22632.06,
    lapseRate: 0,
  },
  {
    baseAltitudeMeters: 20000,
    baseTemperatureKelvin: 216.65,
    basePressurePascal: 5474.889,
    lapseRate: 0.001,
  },
  {
    baseAltitudeMeters: 32000,
    baseTemperatureKelvin: 228.65,
    basePressurePascal: 868.0187,
    lapseRate: 0.0028,
  },
  {
    baseAltitudeMeters: 47000,
    baseTemperatureKelvin: 270.65,
    basePressurePascal: 110.9063,
    lapseRate: 0,
  },
  {
    baseAltitudeMeters: 51000,
    baseTemperatureKelvin: 270.65,
    basePressurePascal: 66.93887,
    lapseRate: -0.0028,
  },
  {
    baseAltitudeMeters: 71000,
    baseTemperatureKelvin: 214.65,
    basePressurePascal: 3.95642,
    lapseRate: -0.002,
  },
  {
    baseAltitudeMeters: 86000,
    baseTemperatureKelvin: 186.87,
    basePressurePascal: 0.3734,
    lapseRate: 0,
  },
];
