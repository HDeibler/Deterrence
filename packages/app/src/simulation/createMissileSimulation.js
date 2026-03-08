import * as THREE from 'three';
import {
  applyEarthRotation,
  haversineDistanceKm,
  latLonToVector3,
  vector3ToLatLon,
} from '../world/geo/geoMath.js';

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
      return Boolean(missileState && missileState.phase !== 'idle');
    },
  };

  function refreshSnapshot() {
    if (!missileState || !launchContext) {
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

  while (
    simSeconds < simulationConfig.missile.maxFlightSeconds &&
    predictedPath.length < simulationConfig.missile.predictedPathPoints
  ) {
    propagateMissile({
      state: shadow,
      context,
      deltaSeconds: simulationConfig.missile.predictionSampleSeconds,
      mu,
      earthRadiusMeters,
      earthRotationRate,
      simulationConfig,
    });

    predictedPath.push(
      toEarthFixedLocalPoint({
        position: shadow.position,
        earthRotationRadians:
          context.earthRotationRadians + earthRotationRate * shadow.flightTimeSeconds,
      }),
    );
    simSeconds += simulationConfig.missile.predictionSampleSeconds;

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
  const dynamics = computeDynamics({
    state,
    context,
    mu,
    earthRadiusMeters,
    earthRotationRate,
    simulationConfig,
  });

  state.velocity.addScaledVector(dynamics.acceleration, deltaSeconds);
  state.position.addScaledVector(state.velocity, deltaSeconds);
  state.massKg = Math.max(state.massKg - dynamics.massFlowKgS * deltaSeconds, PAYLOAD_MASS_KG);
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
      earthRotationRate,
    });
    state.attitudeDirection = thrustDirection.clone();
    const stageThrustScale = getStageThrustScale(context, state.stageIndex);
    thrustAcceleration = thrustDirection.multiplyScalar(
      (activeStage.thrustNewtons * stageThrustScale) / state.massKg / simulationConfig.scaleMeters,
    );
    massFlowKgS = activeStage.propellantMassKg / activeStage.burnTimeSeconds;
  } else if (state.velocity.lengthSq() > 1e-12) {
    state.attitudeDirection = state.velocity.clone().normalize();
    guidanceAcceleration = computeGuidanceAcceleration({
      state,
      context,
      earthRotationRate,
      simulationConfig,
    });
  }

  return {
    acceleration: gravity.add(drag).add(thrustAcceleration).add(guidanceAcceleration),
    massFlowKgS,
  };
}

function computeThrustDirection({ state, context, earthRotationRate }) {
  const radial = state.position.clone().normalize();
  const desiredPoint = computeReferencePoint({
    context,
    earthRotationRate,
    timeSeconds: state.flightTimeSeconds,
    lookAheadSeconds: 120,
  });
  const desiredDirection = desiredPoint.sub(state.position).normalize();

  const activeStage = STAGES[state.stageIndex] ?? STAGES[STAGES.length - 1];
  const effectiveBurnTimeSeconds = getEffectiveStageBurnTimeSeconds(context, state.stageIndex);
  const stageProgress = THREE.MathUtils.clamp(
    state.stageTimeSeconds / effectiveBurnTimeSeconds,
    0,
    1,
  );
  const radialBlend = THREE.MathUtils.lerp(
    activeStage.radialBlendStart,
    activeStage.radialBlendEnd,
    stageProgress,
  );
  return radial
    .multiplyScalar(radialBlend)
    .add(desiredDirection.multiplyScalar(1 - radialBlend))
    .normalize();
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
  const steeringMagnitude = state.phase === 'terminal' ? 32 : 8;

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
  const altitudeUnits =
    (context.flightPlan.apogeeKm / 1000) * Math.pow(Math.sin(Math.PI * progress), 1.15);
  const localDirection = context.launchLocal
    .clone()
    .normalize()
    .applyAxisAngle(context.planeNormalLocal, context.centralAngleRadians * progress);
  const localPosition = localDirection.multiplyScalar(context.earthRadiusUnits + altitudeUnits);
  return applyEarthRotation(localPosition, context.earthRotationRadians + earthRotationRate * t);
}

function createFlightPlan(rangeKm) {
  return {
    totalFlightSeconds: THREE.MathUtils.clamp(660 + rangeKm * 0.11, 780, 2100),
    apogeeKm: THREE.MathUtils.clamp(190 + rangeKm * 0.105, 260, 1450),
  };
}

function createBoostProfile(rangeKm) {
  const shortRangeBlend = THREE.MathUtils.clamp(rangeKm / 3500, 0, 1);
  const longRangeAssist = THREE.MathUtils.clamp((rangeKm - 8000) / 3000, 0, 1);
  return {
    stageBurnFractions: [
      1,
      THREE.MathUtils.lerp(0.65, 1, Math.pow(shortRangeBlend, 0.8)),
      THREE.MathUtils.lerp(0.28, 1, Math.pow(shortRangeBlend, 1.15)),
    ],
    stageThrustScales: [1, 1 + longRangeAssist * 0.12, 1 + longRangeAssist * 0.5],
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
  const longRangeAssist = THREE.MathUtils.clamp((context.ballisticRangeKm - 6000) / 4000, 0, 1);
  const scheduledSecondsRemaining = THREE.MathUtils.clamp(
    remainingFlightSeconds,
    state.phase === 'terminal' ? 8 : 45,
    900,
  );
  const desiredClosingSpeedUnitsPerSecond = Math.max(
    (targetDistanceUnits / scheduledSecondsRemaining) * (1 + longRangeAssist * 0.18),
    0.0005,
  );
  const axialError = desiredClosingSpeedUnitsPerSecond - closingSpeedUnitsPerSecond;
  const axialLimit = state.phase === 'terminal' ? 10 : THREE.MathUtils.lerp(3, 7, longRangeAssist);
  const axialAcceleration = THREE.MathUtils.clamp(
    axialError / (state.phase === 'terminal' ? 6 : 30),
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

const STAGES = [
  {
    name: 'Stage 1',
    burnTimeSeconds: 62,
    thrustNewtons: 1_350_000,
    propellantMassKg: 24_000,
    dryMassKg: 2_600,
    dragCoefficient: 0.38,
    referenceAreaM2: 1.35,
    radialBlendStart: 0.94,
    radialBlendEnd: 0.42,
  },
  {
    name: 'Stage 2',
    burnTimeSeconds: 58,
    thrustNewtons: 315_000,
    propellantMassKg: 7_200,
    dryMassKg: 840,
    dragCoefficient: 0.32,
    referenceAreaM2: 0.72,
    radialBlendStart: 0.4,
    radialBlendEnd: 0.16,
  },
  {
    name: 'Stage 3',
    burnTimeSeconds: 46,
    thrustNewtons: 122_000,
    propellantMassKg: 2_300,
    dryMassKg: 420,
    dragCoefficient: 0.26,
    referenceAreaM2: 0.34,
    radialBlendStart: 0.14,
    radialBlendEnd: 0.06,
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
