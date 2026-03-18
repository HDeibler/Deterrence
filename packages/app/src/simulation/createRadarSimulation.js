import * as THREE from 'three';
import {
  COUNTRY_SPACEPORTS,
  GROUND_RADAR_PRESET,
  GEO_SLOTS,
  INTERCEPTOR_PRESETS,
  computeFootprintRadiusKm,
  altitudeKmToOrbitRadiusUnits,
  EARTH_RADIUS_KM,
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

function buildLaunchSequence(targetAltitudeKm) {
  // Scale durations to target altitude — LEO needs much less time than GEO
  const altitudeFraction = Math.min(targetAltitudeKm / 35786, 1);
  const smoothFraction = altitudeFraction * altitudeFraction * (3 - 2 * altitudeFraction);

  // Orbit insertion: short for LEO (~60s), long for GEO (~200s)
  const insertionDuration = 60 + smoothFraction * 140;
  // Parking coast: brief for LEO (~30s), longer for GEO (~300s)
  const parkingDuration = 30 + smoothFraction * 270;
  // Transfer burn: minimal for LEO (~15s), substantial for GEO (~185s)
  const transferBurnDuration = 15 + smoothFraction * 170;

  return [
    { name: 'First Stage', durationSeconds: 155, thrustMps2: 34, visualStage: 0, hasThrust: true },
    { name: 'Stage Separation', durationSeconds: 6, thrustMps2: 0, visualStage: 0, hasThrust: false },
    {
      name: 'Upper Stage \u2013 Orbit Insertion',
      durationSeconds: insertionDuration,
      thrustMps2: 18,
      visualStage: 1,
      hasThrust: true,
    },
    { name: 'Parking Orbit', durationSeconds: parkingDuration, thrustMps2: 0, visualStage: 2, hasThrust: false },
    {
      name: 'Upper Stage \u2013 Transfer Burn',
      durationSeconds: transferBurnDuration,
      thrustMps2: 14,
      visualStage: 2,
      hasThrust: true,
    },
  ];
}

const SATELLITE_TRANSFER_PHASE = {
  transfer: {
    name: 'Transfer',
    maxThrustMetersPerSecondSquared: 12,
    radialGain: 3.2e-4,
    tangentialGain: 6.0e-4,
    dampingGain: 1.8e-3,
  },
  circularize: {
    name: 'Circularize',
    maxThrustMetersPerSecondSquared: 6,
    radialGain: 2.4e-4,
    tangentialGain: 4.5e-4,
    dampingGain: 2.2e-3,
  },
  operational: {
    name: 'Operational',
    maxThrustMetersPerSecondSquared: 0.5,
    radialGain: 4.0e-5,
    tangentialGain: 8.0e-5,
    dampingGain: 3.0e-4,
  },
};

// Legacy gains for GEO position-tracking controller
const GEO_TRANSFER_PHASE = {
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

  const groundRadars = [];
  const satellites = [];
  const launches = [];
  const interceptorSites = [];
  let nextGroundRadarId = 1;
  let nextSatelliteId = 1;
  let nextLaunchId = 1;
  let nextInterceptorSiteId = 1;

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
    placeInterceptorSite({ countryIso3, lat, lon, type }) {
      const preset = INTERCEPTOR_PRESETS[type];
      if (!preset) return null;
      const site = {
        id: `interceptor-site-${nextInterceptorSiteId}`,
        countryIso3,
        latitude: lat,
        longitude: lon,
        type: preset.type,
        label: preset.shortLabel,
        interceptorsRemaining: preset.interceptorsPerSite,
        interceptorsTotal: preset.interceptorsPerSite,
        maxRangeKm: preset.maxRangeKm,
        interceptAltitudeMinKm: preset.interceptAltitudeMinKm,
        interceptAltitudeMaxKm: preset.interceptAltitudeMaxKm,
        burnTimeSeconds: preset.burnTimeSeconds,
        thrustMps2: preset.thrustMps2,
        maxSpeedKmS: preset.maxSpeedKmS,
        killProbability: preset.killProbability,
      };
      nextInterceptorSiteId += 1;
      interceptorSites.push(site);
      return site;
    },
    consumeInterceptor(siteId) {
      const site = interceptorSites.find((s) => s.id === siteId);
      if (site && site.interceptorsRemaining > 0) {
        site.interceptorsRemaining -= 1;
        return true;
      }
      return false;
    },
    getInterceptorSites() {
      return interceptorSites;
    },
    // Instantly deploy a satellite already in its operational orbit (for scenarios)
    deployOperationalSatellite({ countryIso3, slotLongitude, earthRotationRadians, altitudeKm }) {
      const targetRadiusUnits = altitudeKmToOrbitRadiusUnits(altitudeKm);
      const isGeostationary = altitudeKm >= 35000;
      const footprintRadiusKm = computeFootprintRadiusKm(altitudeKm);
      const desired = computeDesiredOrbitState({
        slotLongitude,
        earthRotationRadians,
        earthRotationRate,
        targetRadiusUnits,
        isGeostationary,
      });
      const id = `ew-sat-${nextSatelliteId}`;
      nextSatelliteId += 1;
      satellites.push({
        id,
        countryIso3,
        slotLongitude,
        altitudeKm,
        inclinationDeg: 0,
        raanDeg: 0,
        targetRadiusUnits,
        isGeostationary,
        spaceport: COUNTRY_SPACEPORTS[countryIso3] ?? null,
        footprintRadiusKm,
        initialEarthRotationRadians: earthRotationRadians,
        flightTimeSeconds: 0,
        sampleElapsed: 0,
        phase: 'operational',
        stageLabel: 'Operational',
        operational: true,
        position: desired.position,
        velocity: desired.velocity,
        attitudeDirection: desired.position.clone().normalize().multiplyScalar(-1),
      });
      return id;
    },

    launchEarlyWarningSatellite({ countryIso3, slotLongitude, earthRotationRadians, altitudeKm, inclinationDeg = 0, raanDeg = 0 }) {
      const spaceport = COUNTRY_SPACEPORTS[countryIso3];
      if (!spaceport) {
        return null;
      }

      const targetRadiusUnits = altitudeKmToOrbitRadiusUnits(altitudeKm);
      const isGeostationary = altitudeKm >= 35000 && inclinationDeg < 2;
      const launchSequence = buildLaunchSequence(altitudeKm);

      const launch = {
        id: `sat-launch-${nextLaunchId}`,
        countryIso3,
        slotLongitude,
        altitudeKm,
        inclinationDeg,
        raanDeg,
        targetRadiusUnits,
        isGeostationary,
        launchSequence,
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
          gravitationalParameter,
          simulationConfig,
        });
      }
    },
    getSnapshot() {
      return {
        groundRadars: groundRadars.map((radar) => ({ ...radar })),
        satellites: satellites.map((satellite) => {
          const currentRadiusUnits = satellite.position.length();
          const currentAltitudeKm = (currentRadiusUnits - 6.371) * 1000;
          const speedMps = satellite.velocity.length() * simulationConfig.scaleMeters;
          return {
            id: satellite.id,
            countryIso3: satellite.countryIso3,
            slotLongitude: satellite.slotLongitude,
            altitudeKm: satellite.altitudeKm,
            inclinationDeg: satellite.inclinationDeg ?? 0,
            raanDeg: satellite.raanDeg ?? 0,
            isGeostationary: satellite.isGeostationary,
            orbitalRadiusUnits: currentRadiusUnits,
            currentAltitudeKm: Math.round(currentAltitudeKm),
            currentSpeedKmS: Math.round(speedMps / 100) / 10,
            targetRadiusUnits: satellite.targetRadiusUnits,
            footprintRadiusKm: satellite.footprintRadiusKm,
            spaceport: { ...satellite.spaceport },
            phase: satellite.phase,
            stageLabel: satellite.stageLabel,
            operational: satellite.operational,
            flightTimeSeconds: satellite.flightTimeSeconds,
            position: satellite.position.clone(),
            velocity: satellite.velocity.clone(),
            direction: satellite.attitudeDirection.clone(),
          };
        }),
        launches: launches.map((launch) => ({
          id: launch.id,
          countryIso3: launch.countryIso3,
          slotLongitude: launch.slotLongitude,
          altitudeKm: launch.altitudeKm,
          phase: launch.state.phase,
          stageIndex: launch.state.stageIndex,
          stageLabel: launch.state.stageLabel,
          engineOn: launch.state.engineOn,
          fairingSeparated: launch.state.fairingSeparated,
          flightTimeSeconds: launch.state.flightTimeSeconds,
          sequenceIndex: launch.state.sequenceIndex,
          position: launch.state.position.clone(),
          velocity: launch.state.velocity.clone(),
          direction: launch.state.attitudeDirection.clone(),
          path: launch.state.path.map((point) => point.clone()),
          spaceport: { ...launch.spaceport },
        })),
        geoSlots: GEO_SLOTS.map((slot) => ({ ...slot })),
        interceptorSites: interceptorSites.map((site) => ({ ...site })),
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
    stageLabel: 'First Stage',
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
  const footprintRadiusKm = computeFootprintRadiusKm(launch.altitudeKm);
  return {
    id,
    countryIso3: launch.countryIso3,
    slotLongitude: launch.slotLongitude,
    altitudeKm: launch.altitudeKm,
    inclinationDeg: launch.inclinationDeg ?? 0,
    raanDeg: launch.raanDeg ?? 0,
    targetRadiusUnits: launch.targetRadiusUnits,
    isGeostationary: launch.isGeostationary,
    spaceport: launch.spaceport,
    footprintRadiusKm,
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
  const launchSequence = launch.launchSequence;
  const targetRadiusUnits = launch.targetRadiusUnits;
  const seq = launchSequence[Math.min(state.sequenceIndex, launchSequence.length - 1)];
  const thrustAccelerationUnits = seq.hasThrust ? seq.thrustMps2 / simulationConfig.scaleMeters : 0;

  const earthRotationRadians =
    state.initialEarthRotationRadians + earthRotationRate * state.flightTimeSeconds;
  const desiredState = computeDesiredOrbitState({
    slotLongitude: state.slotLongitude,
    earthRotationRadians,
    earthRotationRate,
    targetRadiusUnits,
    isGeostationary: launch.isGeostationary,
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
        desiredPosition: desiredState.position,
        targetRadiusUnits,
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
        desiredPosition: desiredState.position,
        targetRadiusUnits,
      }),
    );
  } else if (state.velocity.lengthSq() > 1e-12) {
    state.attitudeDirection.copy(state.velocity).normalize();
  }

  // Collision guard for launch vehicle
  enforceMinimumAltitude(state.position, state.velocity, earthRadiusUnits);

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
    if (state.sequenceIndex < launchSequence.length - 1) {
      state.sequenceIndex += 1;
      state.sequenceTimeSeconds = 0;
      const next = launchSequence[state.sequenceIndex];
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
  gravitationalParameter,
  simulationConfig,
}) {
  const targetRadiusUnits = satellite.targetRadiusUnits;
  const earthRadiusUnits = 6.371;
  const scaleMeters = simulationConfig.scaleMeters;
  const circularVelocityUnits =
    computeOrbitalVelocity({
      gravitationalConstant: simulationConfig.gravitationalConstant,
      centralMass: gravitationalParameter / simulationConfig.gravitationalConstant,
      radiusMeters: targetRadiusUnits * scaleMeters,
    }) / scaleMeters;

  if (satellite.isGeostationary) {
    stepGeoSatellite({ satellite, deltaSeconds, earthRotationRate, gravitationalParameter, simulationConfig, targetRadiusUnits, circularVelocityUnits, earthRadiusUnits });
  } else {
    stepNonGeoSatellite({ satellite, deltaSeconds, gravitationalParameter, simulationConfig, targetRadiusUnits, circularVelocityUnits, earthRadiusUnits });
  }

  satellite.flightTimeSeconds += deltaSeconds;
  satellite.attitudeDirection.copy(
    satellite.velocity.lengthSq() > 1e-12
      ? satellite.velocity.clone().normalize()
      : satellite.position.clone().normalize(),
  );
}

function stepGeoSatellite({ satellite, deltaSeconds, earthRotationRate, gravitationalParameter, simulationConfig, targetRadiusUnits, circularVelocityUnits, earthRadiusUnits }) {
  const earthRotationRadians =
    satellite.initialEarthRotationRadians + earthRotationRate * satellite.flightTimeSeconds;
  const desiredState = computeDesiredOrbitState({
    slotLongitude: satellite.slotLongitude,
    earthRotationRadians,
    earthRotationRate,
    targetRadiusUnits,
    isGeostationary: true,
  });

  const distanceToTarget = desiredState.position.clone().sub(satellite.position).length();
  const speedError = desiredState.velocity.clone().sub(satellite.velocity).length();

  if (!satellite.operational && distanceToTarget < 6) {
    satellite.phase = 'circularize';
    satellite.stageLabel = GEO_TRANSFER_PHASE.circularize.name;
  }
  if (satellite.operational && (distanceToTarget > 0.9 || speedError > circularVelocityUnits * 0.08)) {
    satellite.operational = false;
    satellite.phase = 'circularize';
    satellite.stageLabel = GEO_TRANSFER_PHASE.circularize.name;
  }

  const phaseProfile = satellite.operational
    ? GEO_TRANSFER_PHASE.operational
    : (GEO_TRANSFER_PHASE[satellite.phase] ?? GEO_TRANSFER_PHASE.transfer);

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
        desiredState,
        phaseProfile,
        scaleMeters: simulationConfig.scaleMeters,
      });
      return gravity.add(control);
    },
  });

  enforceMinimumAltitude(satellite.position, satellite.velocity, earthRadiusUnits);

  const settledDistance = satellite.position.distanceTo(desiredState.position);
  const settledVelocityError = satellite.velocity.distanceTo(desiredState.velocity);
  if (!satellite.operational && settledDistance < 0.28 && settledVelocityError < circularVelocityUnits * 0.035) {
    satellite.operational = true;
    satellite.phase = 'operational';
    satellite.stageLabel = GEO_TRANSFER_PHASE.operational.name;
  }
}

function stepNonGeoSatellite({ satellite, deltaSeconds, gravitationalParameter, simulationConfig, targetRadiusUnits, circularVelocityUnits, earthRadiusUnits }) {
  const scaleMeters = simulationConfig.scaleMeters;

  // Decompose current state into radial and tangential components
  const radialDir = satellite.position.clone().normalize();
  const currentRadius = satellite.position.length();
  const radiusError = targetRadiusUnits - currentRadius;
  const radialVelocity = satellite.velocity.dot(radialDir);

  // Tangential direction (prograde)
  const tangentialVel = satellite.velocity.clone().sub(radialDir.clone().multiplyScalar(radialVelocity));
  const tangentialSpeed = tangentialVel.length();
  const progradeDir = tangentialSpeed > 1e-12
    ? tangentialVel.clone().normalize()
    : fallbackPrograde(radialDir);
  const speedError = circularVelocityUnits - tangentialSpeed;

  // Phase detection
  const radiusSettled = Math.abs(radiusError) < 0.12;
  const speedSettled = Math.abs(speedError) < circularVelocityUnits * 0.025;
  const radialSettled = Math.abs(radialVelocity) < circularVelocityUnits * 0.015;

  if (!satellite.operational && radiusSettled && speedSettled && radialSettled) {
    satellite.operational = true;
    satellite.phase = 'operational';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.operational.name;
  }
  if (satellite.operational && !(radiusSettled && speedSettled)) {
    satellite.operational = false;
    satellite.phase = 'circularize';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.circularize.name;
  }
  if (!satellite.operational && satellite.phase === 'transfer' && Math.abs(radiusError) < 1.5) {
    satellite.phase = 'circularize';
    satellite.stageLabel = SATELLITE_TRANSFER_PHASE.circularize.name;
  }

  const phaseProfile = satellite.operational
    ? SATELLITE_TRANSFER_PHASE.operational
    : (SATELLITE_TRANSFER_PHASE[satellite.phase] ?? SATELLITE_TRANSFER_PHASE.transfer);

  const maxControlAccel = phaseProfile.maxThrustMetersPerSecondSquared / scaleMeters;

  integrateStateRK4({
    position: satellite.position,
    velocity: satellite.velocity,
    deltaSeconds,
    accelerationAt(position, velocity) {
      const gravity = computeCentralBodyAcceleration({
        position,
        gravitationalParameter,
        scaleMeters,
      });

      const r = position.length();
      const rDir = position.clone().normalize();
      const rError = targetRadiusUnits - r;
      const rVel = velocity.dot(rDir);

      const tVel = velocity.clone().sub(rDir.clone().multiplyScalar(rVel));
      const tSpeed = tVel.length();
      const tDir = tSpeed > 1e-12 ? tVel.clone().normalize() : progradeDir.clone();
      const sError = circularVelocityUnits - tSpeed;

      // PD controller: radial thrust to reach target altitude
      const radialAccel = rError * phaseProfile.radialGain - rVel * phaseProfile.dampingGain;
      // P controller: tangential thrust to reach circular velocity
      const tangentAccel = sError * phaseProfile.tangentialGain;

      const control = rDir.clone().multiplyScalar(radialAccel)
        .add(tDir.multiplyScalar(tangentAccel));

      return gravity.add(clampVectorMagnitude(control, maxControlAccel));
    },
  });

  enforceMinimumAltitude(satellite.position, satellite.velocity, earthRadiusUnits);
}

function fallbackPrograde(radialDir) {
  const prograde = new THREE.Vector3().crossVectors(radialDir, new THREE.Vector3(0, 1, 0));
  if (prograde.lengthSq() < 1e-12) {
    prograde.crossVectors(radialDir, new THREE.Vector3(1, 0, 0));
  }
  return prograde.normalize();
}

function computeAscentGuidance({
  position,
  velocity,
  flightTimeSeconds,
  launchAzimuth,
  earthRadiusUnits,
  sequenceIndex,
  desiredPosition,
  targetRadiusUnits,
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
    const toTarget = desiredPosition.clone().sub(position);
    const tangential = toTarget.clone().sub(radial.clone().multiplyScalar(toTarget.dot(radial)));
    const prograde =
      velocity.lengthSq() > 1e-12 ? velocity.clone().normalize() : horizontalDir.clone();

    const altitudeUnits = position.length() - earthRadiusUnits;
    const altitudeProgress = THREE.MathUtils.clamp(
      altitudeUnits / (targetRadiusUnits - earthRadiusUnits),
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
  desiredState,
  phaseProfile,
  scaleMeters,
}) {
  const positionError = desiredState.position.clone().sub(position);
  const velocityError = desiredState.velocity.clone().sub(velocity);
  const commanded = positionError
    .multiplyScalar(phaseProfile.positionGain)
    .add(velocityError.multiplyScalar(phaseProfile.velocityGain));

  return clampVectorMagnitude(
    commanded,
    phaseProfile.maxThrustMetersPerSecondSquared / scaleMeters,
  );
}

function computeDesiredOrbitState({
  slotLongitude,
  earthRotationRadians,
  earthRotationRate,
  targetRadiusUnits,
  isGeostationary,
}) {
  if (isGeostationary) {
    const localPosition = latLonToVector3({
      lat: 0,
      lon: slotLongitude,
      radius: targetRadiusUnits,
    });
    const position = applyEarthRotation(localPosition, earthRotationRadians);
    const velocity = new THREE.Vector3(0, earthRotationRate, 0).cross(position.clone());
    return { position, velocity };
  }

  // For non-geostationary orbits, compute the desired circular orbit position
  // The satellite orbits freely — we just guide it to the target altitude and
  // let it fly a prograde circular orbit at that radius.
  const localPosition = latLonToVector3({
    lat: 0,
    lon: slotLongitude,
    radius: targetRadiusUnits,
  });
  const position = applyEarthRotation(localPosition, earthRotationRadians);

  // For non-GEO, the desired velocity is orbital velocity at that radius
  // directed prograde (perpendicular to radial, in the orbital plane)
  const velocity = new THREE.Vector3(0, earthRotationRate, 0).cross(position.clone());
  // Scale velocity to match circular orbital speed at target radius
  const orbitalSpeed = Math.sqrt(
    (6.6743e-11 * 5.972e24) / (targetRadiusUnits * 1e6),
  ) / 1e6;
  if (velocity.lengthSq() > 1e-12) {
    velocity.normalize().multiplyScalar(orbitalSpeed);
  }

  return { position, velocity };
}

// Prevent any orbiting body from clipping through Earth.
// If below minimum altitude, project position back to surface and kill radial velocity.
function enforceMinimumAltitude(position, velocity, earthRadiusUnits) {
  const minRadius = earthRadiusUnits + 0.05; // ~50km buffer above surface
  const radius = position.length();
  if (radius < minRadius) {
    // Push back to minimum altitude
    const radialDir = position.clone().normalize();
    position.copy(radialDir.multiplyScalar(minRadius));

    // Remove inward radial velocity
    const radialVel = velocity.dot(position.clone().normalize());
    if (radialVel < 0) {
      velocity.sub(position.clone().normalize().multiplyScalar(radialVel));
    }
  }
}

function clampVectorMagnitude(vector, maxLength) {
  if (vector.lengthSq() <= maxLength * maxLength) {
    return vector;
  }
  return vector.normalize().multiplyScalar(maxLength);
}
