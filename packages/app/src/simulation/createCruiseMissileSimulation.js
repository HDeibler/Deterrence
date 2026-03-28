import * as THREE from 'three';
import {
  applyEarthRotation,
  haversineDistanceKm,
  latLonToVector3,
  vector3ToLatLon,
} from '../world/geo/geoMath.js';

// ── Cruise Missile Flight Simulation ────────────────────────────────
//
// Full-fidelity aerodynamic flight model for subsonic and supersonic
// cruise missiles with distinct flight envelopes:
//
//   LACM (Tomahawk-class):
//     Phases:  canister eject → booster → wing deploy → climb → cruise → terminal dive
//     Profile: Mach 0.75 at 30-100m AGL, turbofan sustained, TERCOM/DSMAC guidance
//     Range:   ~2500 km,  flight time ~3 hours
//
//   ASCM (BrahMos-class):
//     Phases:  booster → booster sep → ramjet light → accelerate → sea-skim → terminal weave
//     Profile: Mach 2.8 at 10-15m, ramjet sustained, active radar seeker
//     Range:   ~600 km,  flight time ~6 minutes
//
// Physics modeled:
//   - ISA atmosphere (temperature + density vs altitude)
//   - Altitude-corrected speed of sound → true Mach number
//   - Mass-varying fuel consumption (TSFC model)
//   - Aerodynamic drag (Cd × q × Aref)
//   - PD altitude hold with g-load limiting
//   - Bank-to-turn rate-limited heading control
//   - Ramjet min-speed flame-out (ASCM)
//   - Terrain-following noise (LACM over land simulation)
//   - Terminal evasion maneuvers (ASCM weave)
//   - Waypoint routing (optional)
//   - Ballistic crash on fuel exhaustion

const G = 9.80665;
const R_AIR = 287.05287;      // specific gas constant for air
const RHO_SL = 1.225;         // sea-level density kg/m³
const IMPACT_LINGER_S = 5;

// ── ISA temperature model (returns Kelvin at altitude in meters) ────
function isaTemperature(altM) {
  if (altM < 11000) return 288.15 - 0.0065 * altM;
  if (altM < 20000) return 216.65;
  if (altM < 32000) return 216.65 + 0.001 * (altM - 20000);
  return 228.65 + 0.0028 * (altM - 32000);
}

// Speed of sound at altitude (m/s)
function speedOfSound(altM) {
  return Math.sqrt(1.4 * R_AIR * isaTemperature(Math.max(altM, 0)));
}

// Air density at altitude (exponential fit, good to ~30 km)
function airDensity(altM) {
  if (altM < 0) return RHO_SL;
  if (altM > 50000) return 0;
  // Two-layer exponential: troposphere H=8500, stratosphere H=6500
  if (altM < 11000) return RHO_SL * Math.exp(-altM / 8500);
  return 0.364 * Math.exp(-(altM - 11000) / 6500);
}

// Terrain-following noise — simulates altitude undulation over land
// Returns a height offset in meters
function terrainNoise(flightTimeS, distFlownKm) {
  const a = 12 * Math.sin(distFlownKm * 0.31 + flightTimeS * 0.04);
  const b = 8 * Math.sin(distFlownKm * 0.73 + 1.7);
  const c = 5 * Math.sin(distFlownKm * 1.41 + 3.1);
  return a + b + c; // ±25m variation
}

export function createCruiseMissileSimulation({ simulationConfig, worldConfig, missileSpec }) {
  const earthR = worldConfig.earthRadius;
  const earthRm = earthR * simulationConfig.scaleMeters;
  const scale = simulationConfig.scaleMeters;
  const rotRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const mu = simulationConfig.gravitationalConstant * worldConfig.earthMass;

  const actualPath = [];
  const predictedPath = [];
  let state = null;
  let ctx = null;
  let pathClock = 0;
  const snap = idleSnap();

  // ── Is this a supersonic (ramjet) variant? ────────────────────────
  const isSupersonic = (missileSpec.cruiseSpeedMach ?? 0.85) > 1.5;

  // ── Derived spec ──────────────────────────────────────────────────
  const S = {
    typeId:     missileSpec.id ?? 'cruise_subsonic',
    label:      missileSpec.label ?? 'LACM',
    warheadId:  missileSpec.warheadId ?? missileSpec.defaultWarhead ?? 'conventional_he',
    maxRangeKm: missileSpec.maxRangeKm ?? 2500,

    // Cruise parameters
    cruiseAltM:    (missileSpec.cruiseAltitudeKm ?? 0.05) * 1000,
    cruiseMach:    missileSpec.cruiseSpeedMach ?? 0.85,
    terminalMach:  missileSpec.terminalSpeedMach ?? 0.9,

    // Sustainer engine
    thrustN:       missileSpec.thrustNewtons ?? 3200,
    Cd:            missileSpec.dragCoefficient ?? 0.035,
    Aref:          missileSpec.referenceAreaM2 ?? 0.45,
    turnRateRadS:  missileSpec.turnRateRadS ?? 0.02,

    // Masses
    dryMassKg: (missileSpec.massKg ?? 1500) - (missileSpec.fuelMassKg ?? 450),
    fuelKg:    missileSpec.fuelMassKg ?? 450,

    // Booster (solid rocket kick motor)
    boosterThrustN:  isSupersonic ? 180_000 : 28_000,
    boosterBurnS:    isSupersonic ? 6 : 4,
    boosterDryKg:    isSupersonic ? 250 : 120,

    // TSFC — thrust-specific fuel consumption (kg per N·s)
    // Turbofan (LACM) ≈ 0.000065, Ramjet (ASCM) ≈ 0.00012
    tsfc: isSupersonic ? 0.00012 : 0.000065,

    // ASCM-specific
    ramjetMinMach:   1.8,   // below this → flame-out
    terminalWeaveG:  2.0,   // g-load for evasive weave
    terminalWeaveKm: 8,     // begin weave this far from target
    seaSkimAltM:     isSupersonic ? 12 : null,

    // LACM-specific
    canisterEjectS:  isSupersonic ? 0 : 2,  // VLS canister eject time
    wingDeployS:     isSupersonic ? 0 : 1.5, // wing unfold time after booster sep

    isSupersonic,
  };

  return {
    launch({ launchSite, target, earthRotationRadians, waypoints }) {
      ctx = buildContext(launchSite, target, earthRotationRadians, waypoints);
      state = buildState();
      actualPath.length = 0;
      predictedPath.length = 0;
      actualPath.push(earthFixed(state.pos, ctx.rot0));
      pathClock = 0;
      refresh();
    },

    step(dt) {
      if (!state || !ctx) return;

      if (state.phase === 'impact') {
        state.impactT += dt;
        predictedPath.length = 0;
        if (state.impactT >= IMPACT_LINGER_S) {
          actualPath.length = 0;
          state.phase = 'complete';
        }
        refresh();
        return;
      }
      if (state.phase === 'complete') { refresh(); return; }

      // Sub-step for stability — boost needs small steps
      let remaining = Math.min(dt, 1.0);
      while (remaining > 0.001) {
        const maxStep = state.phase === 'booster' || state.phase === 'canister' ? 0.15 : 0.4;
        const step = Math.min(remaining, maxStep);
        propagate(step);
        remaining -= step;
        if (state.phase === 'impact' || state.phase === 'complete') break;
      }

      pathClock += dt;
      if (pathClock >= 1.2 || state.phase === 'impact') {
        const rot = ctx.rot0 + rotRate * state.t;
        actualPath.push(earthFixed(state.pos, rot));
        if (actualPath.length > 1600) actualPath.shift();
        pathClock = 0;
      }
      refresh();
    },

    getSnapshot() { return snap; },
    isActive() {
      return Boolean(state && state.phase !== 'idle' && state.phase !== 'complete');
    },
  };

  // ════════════════════════════════════════════════════════════════════
  // PROPAGATION
  // ════════════════════════════════════════════════════════════════════
  function propagate(dt) {
    if (state.phase === 'impact' || state.phase === 'complete') return;

    const radial = state.pos.clone().normalize();
    const rM = state.pos.length() * scale;
    const altM = rM - earthRm;
    const rot = ctx.rot0 + rotRate * state.t;

    // Atmosphere
    const rho = airDensity(altM);
    const aSound = speedOfSound(altM);
    const gLocal = mu / (rM * rM); // m/s²

    // Velocity decomposition
    const vRad = state.vel.dot(radial);
    const vRadVec = radial.clone().multiplyScalar(vRad);
    const vTan = state.vel.clone().sub(vRadVec);
    const tangentSpeedMS = vTan.length() * scale;
    const totalSpeedMS = state.vel.length() * scale;
    const machTrue = tangentSpeedMS / aSound;

    // Current waypoint or final target
    const currentTarget = getNextWaypoint(rot);
    const toTgt = currentTarget.clone().sub(state.pos);
    const distKm = toTgt.length() * scale / 1000;

    // Desired horizontal direction (projected onto tangent plane)
    const tgtTangent = toTgt.clone().sub(radial.clone().multiplyScalar(toTgt.dot(radial)));
    const desiredDir = tgtTangent.lengthSq() > 1e-15
      ? tgtTangent.normalize()
      : (vTan.lengthSq() > 1e-15 ? vTan.clone().normalize()
        : radial.clone().cross(new THREE.Vector3(0, 1, 0)).normalize());

    // ── Phase machine ───────────────────────────────────────────────
    advancePhase(altM, distKm, machTrue);

    // ── Falling (no engine / flame-out) ─────────────────────────────
    if (state.phase === 'falling') {
      // Pure ballistic: gravity + drag, no thrust, no altitude control
      const gVec = radial.clone().multiplyScalar(-gLocal / scale);
      state.vel.addScaledVector(gVec, dt);
      if (totalSpeedMS > 1) {
        const dragN = 0.5 * rho * totalSpeedMS * totalSpeedMS * S.Cd * S.Aref * 2; // tumbling → higher Cd
        const dragA = dragN / state.massKg / scale;
        state.vel.addScaledVector(state.vel.clone().normalize(), -dragA * dt);
      }
      state.pos.addScaledVector(state.vel, dt);
      state.t += dt;
      state.distFlownKm += tangentSpeedMS / 1000 * dt;
      finalize(altM, tangentSpeedMS, distKm, machTrue);
      return;
    }

    // ── Canister eject (LACM only — brief vertical rise, no thrust) ─
    if (state.phase === 'canister') {
      // Small upward velocity from VLS gas ejector
      const ejectSpeed = 15 / scale; // 15 m/s upward
      state.vel.copy(radial).multiplyScalar(ejectSpeed);
      state.pos.addScaledVector(state.vel, dt);
      state.t += dt;
      finalize(altM, 0, distKm, 0);
      return;
    }

    // ── Thrust computation ──────────────────────────────────────────
    let thrustN = 0;
    if (state.phase === 'booster') {
      thrustN = S.boosterThrustN;
    } else if (state.phase === 'wingDeploy') {
      thrustN = 0; // coasting briefly while wings unfold
    } else if (state.phase === 'climb' || state.phase === 'cruise' || state.phase === 'terminal') {
      thrustN = S.thrustN;
      // Ramjet: thrust varies with dynamic pressure (higher at lower alt)
      if (S.isSupersonic && rho > 0) {
        const qNorm = Math.min((0.5 * rho * tangentSpeedMS * tangentSpeedMS) / 80000, 1.5);
        thrustN = S.thrustN * Math.max(qNorm, 0.3);
      }
    }

    // Fuel consumption
    if (thrustN > 0 && state.fuel > 0) {
      const burn = thrustN * S.tsfc * dt;
      state.fuel = Math.max(0, state.fuel - burn);
      state.massKg = S.dryMassKg + state.fuel;
    }

    // ── Desired altitude ────────────────────────────────────────────
    let desiredAltM;
    if (state.phase === 'booster') {
      // Booster: climb steeply — target 200m by end of burn (LACM) or 300m (ASCM)
      const t01 = Math.min(state.boostT / S.boosterBurnS, 1);
      desiredAltM = (S.isSupersonic ? 300 : 200) * t01;
    } else if (state.phase === 'wingDeploy') {
      desiredAltM = 150; // hold altitude during deploy
    } else if (state.phase === 'climb') {
      desiredAltM = S.cruiseAltM;
    } else if (state.phase === 'terminal') {
      desiredAltM = computeTerminalAlt(distKm);
    } else {
      // Cruise: terrain-following for LACM, flat sea-skim for ASCM
      if (S.isSupersonic) {
        desiredAltM = S.seaSkimAltM;
      } else {
        // Terrain noise — simulates hills/valleys
        const noise = terrainNoise(state.t, state.distFlownKm);
        desiredAltM = S.cruiseAltM + noise;
      }
    }

    // ── Desired speed ───────────────────────────────────────────────
    let desiredSpeedMS;
    if (state.phase === 'booster') {
      desiredSpeedMS = S.isSupersonic ? 400 : 120; // just accelerating
    } else if (state.phase === 'wingDeploy') {
      desiredSpeedMS = 100;
    } else if (state.phase === 'terminal') {
      desiredSpeedMS = S.terminalMach * aSound;
    } else {
      desiredSpeedMS = S.cruiseMach * aSound;
    }

    // ── Heading control ─────────────────────────────────────────────
    const currentDir = vTan.lengthSq() > 1e-15
      ? vTan.clone().normalize()
      : desiredDir.clone();

    let steerDir = desiredDir;

    // ASCM terminal weave: random S-turns to defeat CIWS
    if (S.isSupersonic && state.phase === 'terminal' && distKm < S.terminalWeaveKm) {
      const weaveFreq = 0.8; // Hz
      const weavePhase = Math.sin(state.t * weaveFreq * Math.PI * 2);
      // Lateral direction: perpendicular to desired dir and radial
      const lateral = desiredDir.clone().cross(radial).normalize();
      const weaveAngle = weavePhase * 0.15; // ±0.15 rad ≈ ±8.6°
      steerDir = desiredDir.clone()
        .add(lateral.multiplyScalar(Math.tan(weaveAngle)))
        .normalize();
    }

    const maxTurn = S.turnRateRadS * dt;
    const cosA = THREE.MathUtils.clamp(currentDir.dot(steerDir), -1, 1);
    const angle = Math.acos(cosA);
    let newDir;
    if (angle > 0.0005) {
      const axis = currentDir.clone().cross(steerDir);
      if (axis.lengthSq() > 1e-16) {
        axis.normalize();
        newDir = currentDir.clone().applyAxisAngle(axis, Math.min(angle, maxTurn));
      } else {
        newDir = currentDir.clone();
      }
    } else {
      newDir = steerDir.clone();
    }

    // ── Booster / canister / wingDeploy: direct integration ─────────
    // These phases use direct thrust+gravity instead of the PD altitude
    // controller, because the PD controller can't handle the initial
    // zero-velocity state at launch.
    if (state.phase === 'booster' || state.phase === 'canister' || state.phase === 'wingDeploy') {
      const accel = radial.clone().multiplyScalar(-gLocal / scale); // gravity

      if (state.phase === 'booster' && thrustN > 0) {
        // Pitch program: start ~80° from horizontal, pitch to ~20° by burnout
        const t01 = Math.min(state.boostT / S.boosterBurnS, 1);
        const pitchRad = THREE.MathUtils.lerp(1.40, 0.35, t01 * t01);
        const thrustDir = radial.clone().multiplyScalar(Math.sin(pitchRad))
          .add(desiredDir.clone().multiplyScalar(Math.cos(pitchRad)))
          .normalize();
        accel.addScaledVector(thrustDir, thrustN / state.massKg / scale);
      } else if (state.phase === 'canister') {
        // Small upward push from VLS ejector
        accel.addScaledVector(radial, 15 / scale);
      }

      // Drag
      if (tangentSpeedMS > 1) {
        const qPa = 0.5 * rho * tangentSpeedMS * tangentSpeedMS;
        const dragAccel = qPa * S.Cd * S.Aref / state.massKg / scale;
        if (state.vel.lengthSq() > 1e-18) {
          accel.addScaledVector(state.vel.clone().normalize(), -dragAccel);
        }
      }

      state.vel.addScaledVector(accel, dt);
      state.pos.addScaledVector(state.vel, dt);
      state.t += dt;
      if (state.phase === 'booster') state.boostT += dt;
      state.distFlownKm += tangentSpeedMS / 1000 * dt;

      finalize(altM, tangentSpeedMS, distKm, machTrue);
      return;
    }

    // ── Cruise / climb / terminal: PD-controlled aerodynamic flight ─
    const desiredU = desiredSpeedMS / scale;
    const currentTU = vTan.length();

    const thrustAccelU = thrustN / state.massKg / scale;
    const qPa = 0.5 * rho * tangentSpeedMS * tangentSpeedMS;
    const dragN = qPa * S.Cd * S.Aref;
    const dragAccelU = dragN / state.massKg / scale;

    const speedErr = desiredU - currentTU;
    const maxAccel = thrustAccelU - dragAccelU;
    const cmdAccel = THREE.MathUtils.clamp(speedErr * 2.5, -dragAccelU * 0.5, maxAccel);
    const newTanSpeed = Math.max(0, currentTU + cmdAccel * dt);

    // ── Altitude control (PD) ───────────────────────────────────────
    const desiredR = earthR + Math.max(desiredAltM, 0) / scale;
    const currentR = state.pos.length();
    const altErrM = (desiredR - currentR) * scale;
    const vRadMS = vRad * scale;

    const kP = 0.04;
    const kD = 0.12;
    const vertCmdMS = kP * altErrM - kD * vRadMS;

    const maxVertG = state.phase === 'terminal' ? 5 : 3;
    const maxVertMS = maxVertG * G;
    const vertAccelMS = THREE.MathUtils.clamp(vertCmdMS, -maxVertMS, maxVertMS);

    const netVertAccelMS = vertAccelMS - gLocal;
    state.vel.copy(newDir).multiplyScalar(newTanSpeed);
    state.vel.addScaledVector(radial, (vRadMS + netVertAccelMS * dt) / scale);

    state.pos.addScaledVector(state.vel, dt);
    state.t += dt;
    state.distFlownKm += tangentSpeedMS / 1000 * dt;

    finalize(altM, tangentSpeedMS, distKm, machTrue);
  }

  // ── Phase state machine ───────────────────────────────────────────
  function advancePhase(altM, distKm, machTrue) {
    const p = state.phase;

    // Canister eject → booster ignition
    if (p === 'canister' && state.t >= S.canisterEjectS) {
      state.phase = 'booster';
      state.label = 'Booster';
      return;
    }

    // Booster burnout → wing deploy (LACM) or ramjet light (ASCM)
    if (p === 'booster' && state.boostT >= S.boosterBurnS) {
      state.massKg -= S.boosterDryKg; // jettison booster casing
      state.boosterSepTime = state.t;
      if (S.isSupersonic) {
        state.phase = 'climb';
        state.label = 'Ramjet Ignition';
      } else {
        state.phase = S.wingDeployS > 0 ? 'wingDeploy' : 'climb';
        state.label = S.wingDeployS > 0 ? 'Wing Deploy' : 'Climb';
      }
      return;
    }

    // Wing deploy complete → climb
    if (p === 'wingDeploy' && state.t - (state.boosterSepTime ?? 0) >= S.wingDeployS) {
      state.phase = 'climb';
      state.label = 'Climb';
      return;
    }

    // Climb → cruise (reached altitude)
    if (p === 'climb' && altM >= S.cruiseAltM * 0.7) {
      state.phase = 'cruise';
      state.label = S.isSupersonic ? 'Sea Skim' : 'Cruise';
      return;
    }

    // Cruise → terminal (close to target)
    const terminalRange = S.isSupersonic ? 15 : 8; // km
    if (p === 'cruise' && distKm < terminalRange) {
      state.phase = 'terminal';
      state.label = S.isSupersonic ? 'Terminal Attack' : 'Terminal Dive';
      return;
    }

    // Fuel exhaustion → falling
    if (state.fuel <= 0 && p !== 'falling' && p !== 'terminal' && p !== 'impact') {
      state.phase = 'falling';
      state.label = 'No Fuel';
      return;
    }

    // ASCM ramjet flame-out (below minimum Mach)
    if (S.isSupersonic && p === 'cruise' && machTrue < S.ramjetMinMach) {
      state.phase = 'falling';
      state.label = 'Flame-Out';
      return;
    }

    // Max range safety
    if (state.distFlownKm > S.maxRangeKm * 1.15 && p !== 'falling' && p !== 'impact') {
      state.phase = 'falling';
      state.label = 'Max Range';
    }
  }

  // LACM terminal: DSMAC steep dive in last 2km
  // ASCM terminal: pop-up to 30m then dive, with weave
  function computeTerminalAlt(distKm) {
    if (S.isSupersonic) {
      // Pop up slightly for terminal radar lock, then dive
      if (distKm > 5) return 30;
      return 30 * (distKm / 5) * 0.2; // dive to ~1m in last km
    }
    // LACM: steep DSMAC dive
    if (distKm > 2) return S.cruiseAltM;
    return S.cruiseAltM * (distKm / 2) * 0.15; // dive to ~1-2m
  }

  // ── Waypoint routing ──────────────────────────────────────────────
  function getNextWaypoint(rot) {
    // If we have waypoints and haven't reached them all yet, steer to next
    if (ctx.waypoints && state.waypointIdx < ctx.waypoints.length) {
      const wp = ctx.waypoints[state.waypointIdx];
      const wpLocal = latLonToVector3({ lat: wp.lat, lon: wp.lon, radius: earthR });
      const wpWorld = applyEarthRotation(wpLocal, rot);
      const toWp = wpWorld.clone().sub(state.pos);
      const wpDistKm = toWp.length() * scale / 1000;
      // Advance to next waypoint when within 5km
      if (wpDistKm < 5) {
        state.waypointIdx += 1;
        return getNextWaypoint(rot); // recurse to check next
      }
      return wpWorld;
    }
    // Final target
    return applyEarthRotation(ctx.tgtLocal, rot);
  }

  // ── Impact check + telemetry ──────────────────────────────────────
  function finalize(altM, tangentSpeedMS, distKm, machTrue) {
    const newRot = ctx.rot0 + rotRate * state.t;
    state.groundTrack = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));

    // Impact detection
    if (state.pos.length() <= earthR) {
      const sp = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));
      state.pos.normalize().multiplyScalar(earthR);
      state.phase = 'impact';
      state.label = 'Impact';
      state.impactPt = sp;
      state.groundTrack = sp;
    }

    // Telemetry
    state.altKm = Math.max(altM / 1000, 0);
    state.speedKmS = tangentSpeedMS / 1000;
    state.distKm = distKm;
    state.mach = machTrue;
  }

  // ── Snapshot for renderer ─────────────────────────────────────────
  function refresh() {
    if (!state || !ctx || state.phase === 'complete') {
      Object.assign(snap, idleSnap());
      return;
    }
    const v = state.vel;
    const wingsDeployed = state.phase !== 'canister' && state.phase !== 'booster'
      && state.phase !== 'wingDeploy';
    const boosterAttached = state.phase === 'canister' || state.phase === 'booster';

    Object.assign(snap, {
      active: state.phase !== 'idle',
      visible: true,
      phase: state.phase,
      stageLabel: state.label,
      stageIndex: null,
      altitudeKm: state.altKm ?? 0,
      speedKmS: state.speedKmS ?? 0,
      machNumber: state.mach ?? 0,
      timeToImpactSeconds: state.distKm && state.speedKmS > 0
        ? state.distKm / state.speedKmS : null,
      rangeToTargetKm: state.distKm ?? null,
      apogeeKm: S.cruiseAltM / 1000,
      flightTimeSeconds: state.t,
      launchSite: ctx.launchSite,
      target: ctx.target,
      impactPoint: state.impactPt,
      position: state.pos.clone(),
      direction: v.lengthSq() > 1e-15
        ? v.clone().normalize()
        : state.pos.clone().normalize(),
      actualPath,
      predictedPath,
      missileType: S.typeId,
      warheadId: S.warheadId,
      fuelRemainingKg: state.fuel,
      fuelFraction: S.fuelKg > 0 ? state.fuel / S.fuelKg : 0,
      distFlownKm: state.distFlownKm,
      // Visual state hints for the 3D model
      wingsDeployed,
      boosterAttached,
      isSupersonic: S.isSupersonic,
    });
  }

  // ── Context builder ───────────────────────────────────────────────
  function buildContext(launchSite, target, rot0, waypoints) {
    const launchLocal = latLonToVector3({
      lat: launchSite.latitude, lon: launchSite.longitude, radius: earthR,
    });
    const tgtLocal = latLonToVector3({
      lat: target.lat, lon: target.lon, radius: earthR,
    });
    return {
      rot0,
      launchSite,
      target,
      launchLocal,
      tgtLocal,
      waypoints: waypoints ?? null,
      rangeKm: haversineDistanceKm(
        { lat: launchSite.latitude, lon: launchSite.longitude }, target,
      ),
    };
  }

  // ── Initial state ─────────────────────────────────────────────────
  function buildState() {
    const pos = applyEarthRotation(ctx.launchLocal, ctx.rot0);
    const earthVel = new THREE.Vector3(0, rotRate, 0).cross(pos.clone());
    // Tiny upward kick so the missile clears the launch pad
    const upKick = pos.clone().normalize().multiplyScalar(8 / scale);
    return {
      pos,
      vel: earthVel.add(upKick),
      t: 0,
      boostT: 0,
      boosterSepTime: null,
      phase: S.canisterEjectS > 0 ? 'canister' : 'booster',
      label: S.canisterEjectS > 0 ? 'Canister Eject' : 'Booster',
      massKg: S.dryMassKg + S.fuelKg + S.boosterDryKg,
      fuel: S.fuelKg,
      impactT: 0,
      impactPt: null,
      groundTrack: { lat: ctx.launchSite.latitude, lon: ctx.launchSite.longitude },
      altKm: 0,
      speedKmS: 0,
      distKm: ctx.rangeKm,
      mach: 0,
      distFlownKm: 0,
      waypointIdx: 0,
    };
  }

  function earthFixed(pos, rot) {
    return applyEarthRotation(pos, -rot);
  }
}

// ── Idle snapshot ───────────────────────────────────────────────────
function idleSnap() {
  return {
    active: false, visible: false, phase: 'idle', stageLabel: 'Standby',
    stageIndex: null, altitudeKm: 0, speedKmS: 0, machNumber: 0,
    timeToImpactSeconds: null, rangeToTargetKm: null,
    apogeeKm: 0, flightTimeSeconds: 0,
    launchSite: null, target: null, impactPoint: null,
    position: null, direction: null,
    actualPath: [], predictedPath: [],
    missileType: null, warheadId: null,
    fuelRemainingKg: 0, fuelFraction: 0, distFlownKm: 0,
    wingsDeployed: false, boosterAttached: false, isSupersonic: false,
  };
}
