import * as THREE from 'three';
import {
  COUNTRY_SPACEPORTS,
  EARLY_WARNING_SATELLITE_PRESET,
  GEO_RADIUS_UNITS,
  GEO_SLOTS,
  GROUND_RADAR_PRESET,
} from '../game/data/radarCatalog.js';
import {
  computeOrbitalVelocity,
  computeCentralBodyAcceleration,
  integrateStateRK4,
} from './orbitalMath.js';
import { applyEarthRotation, buildSurfaceFrame, latLonToVector3 } from '../world/geo/geoMath.js';

const LAUNCH_PATH_SAMPLE_SECONDS = 8;
const LAUNCH_PATH_LIMIT = 360;
const VERTICAL_ASCENT_SECONDS = 12;
const PITCH_PROGRAM_END_SECONDS = 140;
const FAIRING_SEP_ALTITUDE_UNITS = 0.11;
const LAUNCH_SEQUENCE = [
  { name: 'First Stage', durationSeconds: 155, thrustMps2: 34, visualStage: 0, hasThrust: true },
  { name: 'Stage Separation', durationSeconds: 6, thrustMps2: 0, visualStage: 0, hasThrust: false },
  {
    name: 'Upper Stage – Orbit Insertion',
    durationSeconds: 200,
    thrustMps2: 18,
    visualStage: 1,
    hasThrust: true,
  },
  { name: 'Parking Orbit', durationSeconds: 300, thrustMps2: 0, visualStage: 2, hasThrust: false },
  {
    name: 'Upper Stage – Transfer Burn',
    durationSeconds: 185,
    thrustMps2: 14,
    visualStage: 2,
    hasThrust: true,
  },
];
const SATELLITE_TRANSFER_PHASE = {
  transfer: {
    name: 'Transfer',
    maxThrustMetersPerSecondSquared: 2.8,
    positionGain: 8.4e-8,
    velocityGain: 4.8e-4,
  },
  circularize: {
    name: 'Circularize',
    maxThrustMetersPerSecondSquared: 1.2,
    positionGain: 5.8e-8,
    velocityGain: 7.2e-4,
  },
  operational: {
    name: 'Operational',
    maxThrustMetersPerSecondSquared: 0.12,
    positionGain: 1.6e-8,
    velocityGain: 1.8e-4,
  },
};

export function createRadarSimulation({ simulationConfig, worldConfig }) {
  const earthRadiusUnits = worldConfig.earthRadius;
  const earthRotationRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const gravitationalParameter = simulationConfig.gravitationalConstant * worldConfig.earthMass;
  const geoCircularVelocityUnits =
    computeOrbitalVelocity({
      gravitationalConstant: simulationConfig.gravitationalConstant,
      centralMass: worldConfig.earthMass,
      radiusMeters: GEO_RADIUS_UNITS * simulationConfig.scaleMeters,
    }) / simulationConfig.scaleMeters;

  const groundRadars = [];
  const satellites = [];
  const launches = [];
  let nextGroundRadarId = 1;
  let nextSatelliteId = 1;
  let nextLaunchId = 1;

  return {
    placeGroundRadar({ countryIso3, lat, lon }) {
      const radar = {
        id: `ground-radar-${nextGroundRadarId}`,
        countryIso3,
        latitude: lat,
        longitude: lon,
        coverageKm: GROUND_RADAR_PRESET.coverageKm,
      };
      nextGroundRadarId += 1;
      groundRadars.push(radar);
      return radar;
    },
    launchEarlyWarningSatellite({ countryIso3, slotLongitude, earthRotationRadians }) {
      const spaceport = COUNTRY_SPACEPORTS[countryIso3];
      if (!spaceport) {
        return null;
      }

      const launch = {
        id: `sat-launch-${nextLaunchId}`,
        countryIso3,
        slotLongitude,
        spaceport,
        state: createLaunchVehicleState({
          countryIso3,
          earthRotationRadians,
          earthRotationRate,
          slotLongitude,
          spaceport,
          earthRadiusUnits,
        }),
      };
      nextLaunchId += 1;
      launches.push(launch);
      return launch;
    },
    step(deltaSeconds) {
      for (let index = launches.length - 1; index >= 0; index -= 1) {
        const launch = launches[index];
        stepLaunchVehicle({
          launch,
          deltaSeconds,
          earthRadiusUnits,
          earthRotationRate,
          gravitationalParameter,
          simulationConfig,
        });

        if (launch.state.phase === 'payload-deploy') {
          satellites.push(
            createSatelliteStateFromLaunch({
              id: `ew-sat-${nextSatelliteId}`,
              launch,
            }),
          );
          nextSatelliteId += 1;
          launches.splice(index, 1);
        }
      }

      for (const satellite of satellites) {
        stepSatellite({
          satellite,
          deltaSeconds,
          earthRotationRate,
          geoCircularVelocityUnits,
          gravitationalParameter,
          simulationConfig,
        });
      }
    },
    getSnapshot() {
      return {
        groundRadars: groundRadars.map((radar) => ({ ...radar })),
        satellites: satellites.map((satellite) => ({
          id: satellite.id,
          countryIso3: satellite.countryIso3,
          slotLongitude: satellite.slotLongitude,
          orbitalRadiusUnits: satellite.position.length(),
          footprintRadiusKm: satellite.footprintRadiusKm,
          spaceport: { ...satellite.spaceport },
          phase: satellite.phase,
          stageLabel: satellite.stageLabel,
          operational: satellite.operational,
          position: satellite.position.clone(),
          velocity: satellite.velocity.clone(),
          direction: satellite.attitudeDirection.clone(),
        })),
        launches: launches.map((launch) => ({
          id: launch.id,
          countryIso3: launch.countryIso3,
          slotLongitude: launch.slotLongitude,
          phase: launch.state.phase,
          stageIndex: launch.state.stageIndex,
          stageLabel: launch.state.stageLabel,
          engineOn: launch.state.engineOn,
          position: launch.state.position.clone(),
          velocity: launch.state.velocity.clone(),
          direction: launch.state.attitudeDirection.clone(),
          path: launch.state.path.map((point) => point.clone()),
          spaceport: { ...launch.spaceport },
        })),
        geoSlots: GEO_SLOTS.map((slot) => ({ ...slot })),
      };
    },
  };
}

function createLaunchVehicleState({
  countryIso3,
  earthRotationRadians,
  earthRotationRate,
  slotLongitude,
  spaceport,
  earthRadiusUnits,
}) {
  const launchLocal = latLonToVector3({
    lat: spaceport.latitude,
    lon: spaceport.longitude,
    radius: earthRadiusUnits,
  });
  const position = applyEarthRotation(launchLocal, earthRotationRadians);

  const angularVelocity = new THREE.Vector3(0, earthRotationRate, 0);
  const velocity = angularVelocity.clone().cross(position);

  const radial = position.clone().normalize();
  const frame = buildSurfaceFrame(radial);
  const launchLatRad = THREE.MathUtils.degToRad(spaceport.latitude);
  const azimuthEast = frame.east.clone();
  const azimuthSouth = frame.north.clone().multiplyScalar(-1);
  const southComponent = Math.sin(launchLatRad) * 0.35;
  const launchAzimuth = azimuthEast
    .clone()
    .multiplyScalar(1 - Math.abs(southComponent))
    .add(azimuthSouth.clone().multiplyScalar(southComponent))
    .normalize();

  return {
    countryIso3,
    slotLongitude,
    spaceport,
    initialEarthRotationRadians: earthRotationRadians,
    flightTimeSeconds: 0,
    sequenceIndex: 0,
    sequenceTimeSeconds: 0,
    sampleElapsed: 0,
    stageIndex: 0,
    stageLabel: LAUNCH_SEQUENCE[0].name,
    phase: 'boost',
    engineOn: true,
    fairingSeparated: false,
    launchAzimuth,
    position,
    velocity,
    attitudeDirection: radial.clone(),
    path: [position.clone()],
  };
}

function createSatelliteStateFromLaunch({ id, launch }) {
  return {
    id,
    countryIso3: launch.countryIso3,
    slotLongitude: launch.slotLongitude,
    spaceport: launch.spaceport,
    footprintRadiusKm: EARLY_WARNING_SATELLITE_PRESET.footprintRadiusKm,
    initialEarthRotationRadians: launch.state.initialEarthRotationRadians,
    flightTimeSeconds: launch.state.flightTimeSeconds,
    sampleElapsed: 0,
    phase: 'transfer',
    stageLabel: SATELLITE_TRANSFER_PHASE.transfer.name,
    operational: false,
    position: launch.state.position.clone(),
    velocity: launch.state.velocity.clone(),
    attitudeDirection: launch.state.attitudeDirection.clone(),
  };
}

function stepLaunchVehicle({
  launch,
  deltaSeconds,
  earthRadiusUnits,
  earthRotationRate,
  gravitationalParameter,
  simulationConfig,
}) {
  const state = launch.state;
  const seq = LAUNCH_SEQUENCE[Math.min(state.sequenceIndex, LAUNCH_SEQUENCE.length - 1)];
  const thrustAccelerationUnits = seq.hasThrust ? seq.thrustMps2 / simulationConfig.scaleMeters : 0;

  const earthRotationRadians =
    state.initialEarthRotationRadians + earthRotationRate * state.flightTimeSeconds;
  const desiredGeoState = computeDesiredGeoState({
    slotLongitude: state.slotLongitude,
    earthRotationRadians,
    earthRotationRate,
  });

  integrateStateRK4({
    position: state.position,
    velocity: state.velocity,
    deltaSeconds,
    accelerationAt(position, velocity) {
      const gravity = computeCentralBodyAcceleration({
        position,
        gravitationalParameter,
        scaleMeters: simulationConfig.scaleMeters,
      });

      if (!seq.hasThrust) {
        return gravity;
      }

      const thrustDirection = computeAscentGuidance({
        position,
        velocity,
        flightTimeSeconds: state.flightTimeSeconds,
        launchAzimuth: state.launchAzimuth,
        earthRadiusUnits,
        sequenceIndex: state.sequenceIndex,
        desiredGeoPosition: desiredGeoState.position,
      });

      return gravity.add(thrustDirection.multiplyScalar(thrustAccelerationUnits));
    },
  });

  state.flightTimeSeconds += deltaSeconds;
  state.sequenceTimeSeconds += deltaSeconds;
  state.sampleElapsed += deltaSeconds;

  if (seq.hasThrust) {
    state.attitudeDirection.copy(
      computeAscentGuidance({
        position: state.position,
        velocity: state.velocity,
        flightTimeSeconds: state.flightTimeSeconds,
        launchAzimuth: state.launchAzimuth,
        earthRadiusUnits,
        sequenceIndex: state.sequenceIndex,
        desiredGeoPosition: desiredGeoState.position,
      }),
    );
  } else if (state.velocity.lengthSq() > 1e-12) {
    state.attitudeDirection.copy(state.velocity).normalize();
  }

  const altitudeUnits = state.position.length() - earthRadiusUnits;
  if (!state.fairingSeparated && altitudeUnits > FAIRING_SEP_ALTITUDE_UNITS) {
    state.fairingSeparated = true;
  }

  if (state.sampleElapsed >= LAUNCH_PATH_SAMPLE_SECONDS) {
    state.path.push(state.position.clone());
    if (state.path.length > LAUNCH_PATH_LIMIT) {
      state.path.shift();
    }
    state.sampleElapsed = 0;
  }

  if (state.sequenceTimeSeconds >= seq.durationSeconds) {
    if (state.sequenceIndex < LAUNCH_SEQUENCE.length - 1) {
      state.sequenceIndex += 1;
      state.sequenceTimeSeconds = 0;
      const next = LAUNCH_SEQUENCE[state.sequenceIndex];
      state.stageLabel = next.name;
      state.stageIndex = next.visualStage;
      state.engineOn = next.hasThrust;
      state.phase = next.hasThrust ? 'boost' : 'coast';
    } else {
      state.phase = 'payload-deploy';
    }
  }
}

function stepSatellite({
  satellite,
  deltaSeconds,
  earthRotationRate,
  geoCircularVelocityUnits,
  gravitationalParameter,
  simulationConfig,
}) {
  const earthRotationRadians =
    satellite.initialEarthRotationRadians + earthRotationRate * satellite.flightTimeSeconds;
  const desiredGeoState = computeDesiredGeoState({
    slotLongitude: satellite.slotLongitude,
    earthRotationRadians,
    earthRotationRate,
  });
  const positionError = desiredGeoState.position.clone().sub(satellite.position);
  const velocityError = desiredGeoState.velocity.clone().sub(satellite.velocity);
  const distanceToTarget = positionError.length();
  const speedError = velocityError.length();

  if (!satellite.operational && distanceToTarget < 6) {
    satellite.phase = 'circularize';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.circularize.name;
  }

  if (
    satellite.operational &&
    (distanceToTarget > 0.9 || speedError > geoCircularVelocityUnits * 0.08)
  ) {
    satellite.operational = false;
    satellite.phase = 'circularize';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.circularize.name;
  }

  const phaseProfile = satellite.operational
    ? SATELLITE_TRANSFER_PHASE.operational
    : (SATELLITE_TRANSFER_PHASE[satellite.phase] ?? SATELLITE_TRANSFER_PHASE.transfer);

  integrateStateRK4({
    position: satellite.position,
    velocity: satellite.velocity,
    deltaSeconds,
    accelerationAt(position, velocity) {
      const gravity = computeCentralBodyAcceleration({
        position,
        gravitationalParameter,
        scaleMeters: simulationConfig.scaleMeters,
      });
      const control = computeSatelliteControlAcceleration({
        position,
        velocity,
        desiredGeoState,
        phaseProfile,
        scaleMeters: simulationConfig.scaleMeters,
      });
      return gravity.add(control);
    },
  });

  satellite.flightTimeSeconds += deltaSeconds;
  satellite.attitudeDirection.copy(
    computeSatelliteAttitudeDirection({
      velocity: satellite.velocity,
      desiredGeoPosition: desiredGeoState.position,
      currentPosition: satellite.position,
    }),
  );

  const settledDistance = satellite.position.distanceTo(desiredGeoState.position);
  const settledVelocityError = satellite.velocity.distanceTo(desiredGeoState.velocity);
  if (
    !satellite.operational &&
    settledDistance < 0.28 &&
    settledVelocityError < geoCircularVelocityUnits * 0.035
  ) {
    satellite.operational = true;
    satellite.phase = 'operational';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.operational.name;
  }
}

function computeAscentGuidance({
  position,
  velocity,
  flightTimeSeconds,
  launchAzimuth,
  earthRadiusUnits,
  sequenceIndex,
  desiredGeoPosition,
}) {
  const radial = position.clone().normalize();

  if (flightTimeSeconds < VERTICAL_ASCENT_SECONDS) {
    return radial.clone();
  }

  const horizontalDir = computeHorizontalDirection({ velocity, radial, launchAzimuth });

  if (sequenceIndex <= 2 && flightTimeSeconds < PITCH_PROGRAM_END_SECONDS) {
    const pitchProgress = THREE.MathUtils.clamp(
      (flightTimeSeconds - VERTICAL_ASCENT_SECONDS) /
        (PITCH_PROGRAM_END_SECONDS - VERTICAL_ASCENT_SECONDS),
      0,
      1,
    );
    const smoothed = pitchProgress * pitchProgress * (3 - 2 * pitchProgress);
    const pitchFromVerticalDeg = smoothed * 82;
    const pitchRad = THREE.MathUtils.degToRad(pitchFromVerticalDeg);

    return radial
      .clone()
      .multiplyScalar(Math.cos(pitchRad))
      .add(horizontalDir.multiplyScalar(Math.sin(pitchRad)))
      .normalize();
  }

  if (sequenceIndex <= 2) {
    const altitudeUnits = Math.max(position.length() - earthRadiusUnits, 0);
    const parkingAltitude = 0.2;
    const radialFraction = THREE.MathUtils.clamp(
      0.08 * (1 - altitudeUnits / parkingAltitude),
      0.01,
      0.08,
    );
    return horizontalDir
      .multiplyScalar(1 - radialFraction)
      .add(radial.clone().multiplyScalar(radialFraction))
      .normalize();
  }

  if (sequenceIndex === 4) {
    const toTarget = desiredGeoPosition.clone().sub(position);
    const tangential = toTarget.clone().sub(radial.clone().multiplyScalar(toTarget.dot(radial)));
    const prograde =
      velocity.lengthSq() > 1e-12 ? velocity.clone().normalize() : horizontalDir.clone();

    const altitudeUnits = position.length() - earthRadiusUnits;
    const altitudeProgress = THREE.MathUtils.clamp(
      altitudeUnits / (GEO_RADIUS_UNITS - earthRadiusUnits),
      0,
      1,
    );
    const radialBias = THREE.MathUtils.clamp(0.15 - altitudeProgress * 0.13, 0.01, 0.15);

    if (tangential.lengthSq() > 1e-8) {
      tangential.normalize();
      const guided = prograde
        .clone()
        .multiplyScalar(0.65)
        .add(tangential.clone().multiplyScalar(0.35))
        .normalize();
      return guided
        .multiplyScalar(1 - radialBias)
        .add(radial.clone().multiplyScalar(radialBias))
        .normalize();
    }
    return prograde
      .multiplyScalar(1 - radialBias)
      .add(radial.clone().multiplyScalar(radialBias))
      .normalize();
  }

  return velocity.lengthSq() > 1e-12 ? velocity.clone().normalize() : radial.clone();
}

function computeHorizontalDirection({ velocity, radial, launchAzimuth }) {
  if (velocity.lengthSq() > 1e-12) {
    const prograde = velocity.clone().normalize();
    const horizontal = prograde.clone().sub(radial.clone().multiplyScalar(prograde.dot(radial)));
    if (horizontal.lengthSq() > 1e-8) {
      return horizontal.normalize();
    }
  }
  return launchAzimuth.clone();
}

function computeSatelliteControlAcceleration({
  position,
  velocity,
  desiredGeoState,
  phaseProfile,
  scaleMeters,
}) {
  const positionError = desiredGeoState.position.clone().sub(position);
  const velocityError = desiredGeoState.velocity.clone().sub(velocity);
  const commanded = positionError
    .multiplyScalar(phaseProfile.positionGain)
    .add(velocityError.multiplyScalar(phaseProfile.velocityGain));

  return clampVectorMagnitude(
    commanded,
    phaseProfile.maxThrustMetersPerSecondSquared / scaleMeters,
  );
}

function computeSatelliteAttitudeDirection({ velocity, desiredGeoPosition, currentPosition }) {
  if (velocity.lengthSq() > 1e-12) {
    return velocity.clone().normalize();
  }
  return desiredGeoPosition.clone().sub(currentPosition).normalize();
}

function computeDesiredGeoState({ slotLongitude, earthRotationRadians, earthRotationRate }) {
  const localPosition = latLonToVector3({
    lat: 0,
    lon: slotLongitude,
    radius: GEO_RADIUS_UNITS,
  });
  const position = applyEarthRotation(localPosition, earthRotationRadians);
  const velocity = new THREE.Vector3(0, earthRotationRate, 0).cross(position.clone());
  return { position, velocity };
}

function clampVectorMagnitude(vector, maxLength) {
  if (vector.lengthSq() <= maxLength * maxLength) {
    return vector;
  }
  return vector.normalize().multiplyScalar(maxLength);
}
