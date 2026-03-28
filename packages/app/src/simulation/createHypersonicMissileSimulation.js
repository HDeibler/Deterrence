import * as THREE from 'three';
import {
  applyEarthRotation,
  haversineDistanceKm,
  latLonToVector3,
  vector3ToLatLon,
} from '../world/geo/geoMath.js';

// ── Hypersonic Missile Flight Simulation ────────────────────────────
//
// Two distinct flight profiles sharing a common boost phase:
//
//   HGV (Boost-Glide, DF-ZF / Avangard class):
//     Phases:  boost → separation → pull-down → glide (skip) → terminal dive
//     Profile: Rocket to 60 km depressed, then unpowered skip-glide at
//              Mach 10-20 in 30-60 km corridor. Energy bleeds each skip.
//     Key physics: Lift from waverider compression at hypersonic speeds.
//              Skips are emergent — vehicle descends into denser air,
//              generates lift, climbs back out, goes ballistic, repeats.
//
//   HCM (Scramjet Cruise, Zircon class):
//     Phases:  boost → separation → scramjet light → cruise → terminal dive
//     Profile: Rocket to 25 km, scramjet sustains Mach 5-8 at 20-30 km.
//     Key physics: Scramjet operating corridor (alt + Mach constraints).
//              Flame-out if speed drops below Mach 4.5 or alt exits 15-35 km.
//
// Common physics:
//   - Velocity Verlet integration (symplectic — conserves energy)
//   - Upper atmosphere density model (exponential fit, 0-150 km)
//   - ISA temperature for speed of sound
//   - Lift perpendicular to velocity in the velocity-radial plane
//   - Drag proportional to dynamic pressure
//   - Gravity from inverse-square law
//   - G-load limited maneuvering

const G = 9.80665;
const R_AIR = 287.05287;
const RHO_SL = 1.225;
const IMPACT_LINGER_S = 5;

// ── Atmosphere ──────────────────────────────────────────────────────
function atmoDensity(altM) {
  if (altM < 0) return RHO_SL;
  if (altM > 150_000) return 0;
  if (altM < 11_000) return RHO_SL * Math.exp(-altM / 8500);
  if (altM < 25_000) return 0.364 * Math.exp(-(altM - 11000) / 6500);
  if (altM < 50_000) return 0.0395 * Math.exp(-(altM - 25000) / 7200);
  if (altM < 80_000) return 0.00116 * Math.exp(-(altM - 50000) / 6100);
  return 0.0000157 * Math.exp(-(altM - 80000) / 5800);
}

function isaTemp(altM) {
  if (altM < 11000) return 288.15 - 0.0065 * altM;
  if (altM < 20000) return 216.65;
  if (altM < 32000) return 216.65 + 0.001 * (altM - 20000);
  return 228.65 + 0.0028 * (altM - 32000);
}

function speedOfSound(altM) {
  return Math.sqrt(1.4 * R_AIR * isaTemp(Math.max(altM, 0)));
}

export function createHypersonicMissileSimulation({ simulationConfig, worldConfig, missileSpec }) {
  const earthR = worldConfig.earthRadius;
  const earthRm = earthR * simulationConfig.scaleMeters;
  const sc = simulationConfig.scaleMeters;
  const rotRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const mu = simulationConfig.gravitationalConstant * worldConfig.earthMass;

  const actualPath = [];
  const predictedPath = [];
  let state = null;
  let ctx = null;
  let pathClock = 0;
  const snap = idleSnap();

  const isScramjet = Boolean(missileSpec.scramjetThrustNewtons);

  const S = {
    typeId:        missileSpec.id ?? 'hypersonic_glide',
    label:         missileSpec.label ?? 'HGV',
    warheadId:     missileSpec.warheadId ?? missileSpec.defaultWarhead ?? 'conventional_he',
    maxRangeKm:    missileSpec.maxRangeKm ?? 6000,
    // Boost
    boostBurnS:    missileSpec.boostBurnTimeSeconds ?? 90,
    boostThrustN:  missileSpec.boostThrustNewtons ?? 850_000,
    boostPropKg:   missileSpec.boostPropellantMassKg ?? 8_000,
    boostDryKg:    missileSpec.boostDryMassKg ?? 1_200,
    // Glide vehicle
    glideKg:       missileSpec.glideMassKg ?? 1_600,
    LD:            missileSpec.liftToDragRatio ?? 3.5,
    Aref:          missileSpec.referenceAreaM2 ?? 1.8,
    maxG:          missileSpec.maxPullGees ?? 8,
    // Target altitudes
    boostAltM:     (missileSpec.boostAltitudeKm ?? 80) * 1000,
    glideAltM:     (missileSpec.glideAltitudeKm ?? 40) * 1000,
    // Scramjet (HCM only)
    scramjetN:     missileSpec.scramjetThrustNewtons ?? 0,
    scramjetFuelKg:missileSpec.scramjetFuelMassKg ?? 0,
    scramjetMinMach: 4.5,
    scramjetMaxMach: 8.5,
    scramjetMinAltM: 15_000,
    scramjetMaxAltM: 35_000,
    isScramjet,
  };

  // Drag coefficient: for a waverider at hypersonic speeds,
  // Cd ≈ 1/(L/D) when lift = weight (trimmed flight).
  // We'll compute lift and drag separately from L/D ratio.
  const Cd0 = 1 / (S.LD * 3);  // zero-lift drag coefficient
  const CdLift = 1 / S.LD;     // lift-induced drag coefficient

  return {
    launch({ launchSite, target, earthRotationRadians }) {
      ctx = buildCtx(launchSite, target, earthRotationRadians);
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

      // Sub-step: boost needs 0.2s steps, glide can use 0.4s
      let rem = Math.min(dt, 1.0);
      while (rem > 0.001) {
        const maxStep = state.phase === 'boost' ? 0.2 : 0.4;
        const step = Math.min(rem, maxStep);
        propagate(step);
        rem -= step;
        if (state.phase === 'impact' || state.phase === 'complete') break;
      }

      pathClock += dt;
      if (pathClock >= 1.5 || state.phase === 'impact') {
        const rot = ctx.rot0 + rotRate * state.t;
        actualPath.push(earthFixed(state.pos, rot));
        if (actualPath.length > 1400) actualPath.shift();
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
  // PROPAGATION — Velocity Verlet
  // ════════════════════════════════════════════════════════════════════
  function propagate(dt) {
    if (state.phase === 'impact' || state.phase === 'complete') return;

    const radial = state.pos.clone().normalize();
    const rM = state.pos.length() * sc;
    const altM = rM - earthRm;
    const rot = ctx.rot0 + rotRate * state.t;

    // Atmosphere
    const rho = atmoDensity(altM);
    const aSound = speedOfSound(altM);
    const gLocal = mu / (rM * rM);

    // Target info
    const tgtWorld = applyEarthRotation(ctx.tgtLocal, rot);
    const toTgt = tgtWorld.clone().sub(state.pos);
    const distKm = toTgt.length() * sc / 1000;
    const tgtTangent = toTgt.clone().sub(radial.clone().multiplyScalar(toTgt.dot(radial)));
    const desiredHDir = tgtTangent.lengthSq() > 1e-15
      ? tgtTangent.normalize()
      : state.vel.clone().normalize();

    // Velocity info
    const speedMS = state.vel.length() * sc;
    const mach = speedMS / aSound;
    const vRad = state.vel.dot(radial); // radial velocity (sim units/s)
    const vRadMS = vRad * sc;
    const velDir = speedMS > 1 ? state.vel.clone().normalize() : radial.clone();
    // Flight path angle (positive = climbing)
    const gamma = Math.asin(THREE.MathUtils.clamp(vRad / (state.vel.length() + 1e-18), -1, 1));

    // Dynamic pressure
    const qPa = 0.5 * rho * speedMS * speedMS;

    // ── Compute acceleration ────────────────────────────────────────
    // Start with gravity
    const accel = radial.clone().multiplyScalar(-gLocal / sc);

    if (state.phase === 'boost') {
      // ── BOOST PHASE ───────────────────────────────────────────────
      const t01 = Math.min(state.boostT / S.boostBurnS, 1);

      // Depressed trajectory pitch program (DF-17 style):
      // Aggressively pitch over to build horizontal velocity.
      // Range-dependent: short range = more lofted, long range = more depressed.
      const rangeFrac = THREE.MathUtils.clamp(ctx.rangeKm / S.maxRangeKm, 0, 1);

      // Pitch angle from vertical (radians):
      //   t=0:    ~85° (nearly vertical — clear the pad)
      //   t=0.10: ~70° (begin gravity turn)
      //   t=0.40: ~35° (mid-turn)
      //   t=1.00: ~5-15° (nearly horizontal — depressed)
      // Short range: end at 15° (more lofted)
      // Long range: end at 5° (more depressed — maximum horizontal v)
      const endPitch = THREE.MathUtils.lerp(0.26, 0.087, rangeFrac); // 15°→5°
      let pitchFromVert;
      if (t01 < 0.10) {
        pitchFromVert = THREE.MathUtils.lerp(1.48, 1.22, t01 / 0.10); // 85°→70°
      } else if (t01 < 0.40) {
        pitchFromVert = THREE.MathUtils.lerp(1.22, 0.61, (t01 - 0.10) / 0.30); // 70°→35°
      } else {
        pitchFromVert = THREE.MathUtils.lerp(0.61, endPitch, (t01 - 0.40) / 0.60); // 35°→end
      }

      const thrustDir = radial.clone().multiplyScalar(Math.sin(pitchFromVert))
        .add(desiredHDir.clone().multiplyScalar(Math.cos(pitchFromVert)))
        .normalize();

      const mass = S.boostDryKg + S.glideKg + S.boostPropKg * (1 - t01);
      const thrustAccel = S.boostThrustN / mass / sc;
      accel.add(thrustDir.clone().multiplyScalar(thrustAccel));

      state.boostT += dt;
      state.attDir = thrustDir.clone();

      // Burnout → separation
      if (state.boostT >= S.boostBurnS) {
        state.phase = 'separation';
        state.label = 'Booster Sep';
        state.sepTime = state.t;
      }

      // Atmospheric drag during boost
      if (qPa > 0 && speedMS > 1) {
        const boostCd = 0.3; // cylindrical booster stack
        const boostArea = 1.2; // m²
        const dragAccel = qPa * boostCd * boostArea / mass / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }

    } else if (state.phase === 'separation') {
      // ── BOOSTER SEPARATION (brief, 2s) ────────────────────────────
      // Glider coasts, aligns with velocity vector
      state.attDir = velDir.clone();
      // Drag on the glider alone
      if (qPa > 0) {
        const dragAccel = qPa * Cd0 * S.Aref / S.glideKg / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }
      if (state.t - (state.sepTime ?? state.t) >= 2) {
        state.phase = S.isScramjet ? 'scramjetLight' : 'glide';
        state.label = S.isScramjet ? 'Scramjet Ignition' : 'Glide';
      }

    } else if (state.phase === 'scramjetLight') {
      // ── SCRAMJET IGNITION (brief, 3s) ─────────────────────────────
      // Engine ramps up to full thrust
      const lightProgress = Math.min((state.t - (state.sepTime ?? 0) - 2) / 3, 1);
      if (qPa > 0) {
        const dragAccel = qPa * Cd0 * S.Aref / S.glideKg / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }
      if (state.scramjetFuel > 0 && mach >= S.scramjetMinMach) {
        const thrust = S.scramjetN * lightProgress;
        accel.addScaledVector(velDir, thrust / S.glideKg / sc);
        state.scramjetFuel -= thrust * 0.00008 * dt;
      }
      // Lift for altitude hold
      addLiftForce(accel, radial, velDir, qPa, altM, S.glideAltM, vRadMS, dt);
      addSteeringForce(accel, velDir, radial, desiredHDir);
      state.attDir = velDir.clone();
      if (lightProgress >= 1) {
        state.phase = 'cruise';
        state.label = 'Scramjet Cruise';
      }

    } else if (state.phase === 'cruise') {
      // ── SCRAMJET CRUISE (HCM) ─────────────────────────────────────
      // Sustained thrust at constant altitude, Mach 5-8 corridor
      if (qPa > 0) {
        const dragAccel = qPa * Cd0 * S.Aref / S.glideKg / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }
      // Scramjet thrust
      if (state.scramjetFuel > 0 && mach >= S.scramjetMinMach) {
        accel.addScaledVector(velDir, S.scramjetN / S.glideKg / sc);
        // TSFC: fuel burn proportional to thrust
        state.scramjetFuel -= S.scramjetN * 0.00008 * dt;
        state.scramjetFuel = Math.max(0, state.scramjetFuel);
      }
      // Lift for altitude hold at scramjet corridor altitude
      addLiftForce(accel, radial, velDir, qPa, altM, S.glideAltM, vRadMS, dt);
      addSteeringForce(accel, velDir, radial, desiredHDir);
      state.attDir = velDir.clone();

      // Flame-out checks
      if (mach < S.scramjetMinMach || state.scramjetFuel <= 0) {
        state.phase = 'falling';
        state.label = state.scramjetFuel <= 0 ? 'Fuel Exhausted' : 'Flame-Out';
      }
      if (altM < S.scramjetMinAltM || altM > S.scramjetMaxAltM * 1.5) {
        state.phase = 'falling';
        state.label = 'Corridor Exit';
      }
      // Terminal transition
      if (distKm < 80) {
        state.phase = 'terminal';
        state.label = 'Terminal Dive';
      }

    } else if (state.phase === 'glide') {
      // ── UNPOWERED GLIDE (HGV) ────────────────────────────────────
      // The core of the skip-glide model. No artificial sinusoidal target.
      // Physics produces natural skips:
      //   1. Vehicle descends under gravity into denser atmosphere
      //   2. Dynamic pressure increases → lift increases
      //   3. Lift exceeds weight → vehicle climbs
      //   4. Vehicle rises into thinner air → lift decreases
      //   5. Gravity pulls it back down → repeat
      //
      // The pilot (autopilot) modulates angle of attack to:
      //   - Pull up when descending below the glide corridor floor
      //   - Push down when climbing above the corridor ceiling
      //   - Maintain heading toward target

      // Drag (always present)
      if (qPa > 0) {
        const dragAccel = qPa * CdLift * S.Aref / S.glideKg / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }

      // Lift: perpendicular to velocity, in the plane containing radial.
      // The "lift direction" is the component of radial that is perpendicular
      // to the velocity vector. This makes the vehicle turn (curve its path
      // upward or downward) rather than just adding radial velocity.
      if (qPa > 0.1) {
        // Available lift acceleration
        const liftAccel = qPa * S.LD * Cd0 * S.Aref / S.glideKg; // m/s²

        // Autopilot: modulate lift to maintain glide corridor
        // Below floor → full positive lift (pull up)
        // Above ceiling → negative lift (push down)
        // In corridor → mild lift to balance gravity component
        const floorM = S.glideAltM * 0.5;    // ~20 km
        const ceilingM = S.boostAltM * 1.1;   // ~88 km

        let liftFrac; // -1 to +1
        if (altM < floorM) {
          // Below corridor — pull up hard
          liftFrac = 1.0;
        } else if (altM > ceilingM) {
          // Above corridor — push down
          liftFrac = -0.3;
        } else {
          // In corridor — balance: lift ≈ centripetal + gravity component
          // Negative gamma (descending) → more lift. Positive (climbing) → less.
          const altFrac = (altM - floorM) / (ceilingM - floorM);
          const gammaTerm = THREE.MathUtils.clamp(-gamma * 2, -0.5, 0.5);
          liftFrac = THREE.MathUtils.clamp(0.3 - altFrac * 0.6 + gammaTerm, -0.8, 1.0);
        }

        // G-load limit
        const maxLift = S.maxG * G;
        const cmdLift = THREE.MathUtils.clamp(liftFrac * liftAccel, -maxLift, maxLift);

        // Lift direction: perpendicular to velocity, toward radial "up"
        const liftDir = computeLiftDirection(velDir, radial);
        accel.addScaledVector(liftDir, cmdLift / sc);
      }

      // Lateral steering toward target (gentle — limited by g budget)
      addSteeringForce(accel, velDir, radial, desiredHDir);
      state.attDir = velDir.clone();

      // Track skips (altitude minimums)
      if (altM < S.glideAltM * 0.7 && vRadMS < 0) {
        if (!state.inDip) { state.skipCount += 1; state.inDip = true; }
      } else {
        state.inDip = false;
      }

      // Terminal transition: based on remaining distance and energy
      // Start terminal when distance is small enough to reach in a steep dive
      const terminalRangeKm = Math.max(50, altM / 1000 * 2); // ~2:1 glide slope
      if (distKm < terminalRangeKm) {
        state.phase = 'terminal';
        state.label = 'Terminal Dive';
      }

    } else if (state.phase === 'terminal') {
      // ── TERMINAL DIVE ─────────────────────────────────────────────
      // Steep descent toward target at Mach 5-8+.
      // Full steering authority for evasive maneuvers.

      // Drag (increases dramatically in denser lower atmosphere)
      if (qPa > 0) {
        const termCd = Cd0 * 1.5; // higher drag in dive attitude
        const dragAccel = qPa * termCd * S.Aref / S.glideKg / sc;
        accel.addScaledVector(velDir, -dragAccel);
      }

      // Steer toward target with full g-budget
      const toTgtDir = toTgt.lengthSq() > 1e-15 ? toTgt.clone().normalize() : velDir.clone();
      const steerErr = toTgtDir.clone().sub(velDir);
      if (steerErr.lengthSq() > 1e-16) {
        const maxSteerAccel = S.maxG * G / sc;
        const cmdSteer = Math.min(steerErr.length() * 40, maxSteerAccel);
        accel.addScaledVector(steerErr.normalize(), cmdSteer);
      }

      state.attDir = velDir.clone();

    } else if (state.phase === 'falling') {
      // ── FALLING (flame-out / fuel exhausted) ──────────────────────
      // Unpowered ballistic with drag
      if (qPa > 0 && speedMS > 1) {
        const dragAccel = qPa * Cd0 * S.Aref * 3 / S.glideKg / sc; // tumbling = high drag
        accel.addScaledVector(velDir, -dragAccel);
      }
      state.attDir = velDir.clone();
    }

    // ── Velocity Verlet integration ─────────────────────────────────
    // Half-step velocity update with current acceleration
    state.vel.addScaledVector(accel, dt * 0.5);
    state.pos.addScaledVector(state.vel, dt);
    // Recompute acceleration at new position would be ideal,
    // but for simplicity we use the same accel for the second half-step
    state.vel.addScaledVector(accel, dt * 0.5);
    state.t += dt;

    // ── Telemetry ───────────────────────────────────────────────────
    const newRot = ctx.rot0 + rotRate * state.t;
    state.groundTrack = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));
    const newAltM = (state.pos.length() * sc) - earthRm;
    state.altKm = Math.max(newAltM / 1000, 0);
    state.apogeeKm = Math.max(state.apogeeKm, state.altKm);
    state.speedKmS = (state.vel.length() * sc) / 1000;
    state.distKm = distKm;
    state.mach = mach;
    state.gamma = gamma;
    state.qPa = qPa;

    // ── Impact detection ────────────────────────────────────────────
    if (state.pos.length() <= earthR) {
      const sp = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));
      state.pos.normalize().multiplyScalar(earthR);
      state.phase = 'impact';
      state.label = 'Impact';
      state.impactPt = sp;
      state.groundTrack = sp;
    }
  }

  // ── Lift direction: perpendicular to velocity, toward "up" ────────
  function computeLiftDirection(velDir, radial) {
    // Component of radial perpendicular to velocity
    const dot = radial.dot(velDir);
    const liftDir = radial.clone().sub(velDir.clone().multiplyScalar(dot));
    if (liftDir.lengthSq() > 1e-16) {
      return liftDir.normalize();
    }
    // Velocity is purely radial — pick arbitrary perpendicular
    return velDir.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  }

  // ── Lift force for altitude hold (used by HCM cruise) ─────────────
  function addLiftForce(accel, radial, velDir, qPa, altM, targetAltM, vRadMS, dt) {
    if (qPa < 0.1) return;
    const liftAvail = qPa * S.LD * Cd0 * S.Aref / S.glideKg; // m/s²
    const altErr = targetAltM - altM;
    const kP = 0.0003;
    const kD = 0.005;
    const cmd = THREE.MathUtils.clamp(kP * altErr - kD * vRadMS, -1, 1);
    const maxLift = S.maxG * G;
    const liftAccel = THREE.MathUtils.clamp(cmd * liftAvail, -maxLift, maxLift);
    const liftDir = computeLiftDirection(velDir, radial);
    accel.addScaledVector(liftDir, liftAccel / sc);
  }

  // ── Lateral steering force ────────────────────────────────────────
  function addSteeringForce(accel, velDir, radial, desiredHDir) {
    // Project velocity onto tangent plane
    const hDir = velDir.clone().sub(radial.clone().multiplyScalar(velDir.dot(radial)));
    if (hDir.lengthSq() < 1e-16) return;
    hDir.normalize();
    const err = desiredHDir.clone().sub(hDir);
    if (err.lengthSq() < 1e-16) return;
    const maxSteer = S.maxG * G * 0.25; // use 25% of g-budget for steering
    const cmdSteer = Math.min(err.length() * 15, maxSteer);
    accel.addScaledVector(err.normalize(), cmdSteer / sc);
  }

  // ── Snapshot ──────────────────────────────────────────────────────
  function refresh() {
    if (!state || !ctx || state.phase === 'complete') {
      Object.assign(snap, idleSnap());
      return;
    }
    Object.assign(snap, {
      active: state.phase !== 'idle',
      visible: true,
      phase: state.phase,
      stageLabel: state.label,
      stageIndex: state.phase === 'boost' ? 0 : null,
      altitudeKm: state.altKm ?? 0,
      speedKmS: state.speedKmS ?? 0,
      machNumber: state.mach ?? 0,
      timeToImpactSeconds: state.distKm && state.speedKmS > 0
        ? state.distKm / state.speedKmS : null,
      rangeToTargetKm: state.distKm ?? null,
      apogeeKm: state.apogeeKm ?? 0,
      flightTimeSeconds: state.t,
      launchSite: ctx.launchSite,
      target: ctx.target,
      impactPoint: state.impactPt,
      position: state.pos.clone(),
      direction: state.attDir?.clone()
        ?? (state.vel.lengthSq() > 1e-12
          ? state.vel.clone().normalize()
          : state.pos.clone().normalize()),
      actualPath,
      predictedPath,
      missileType: S.typeId,
      warheadId: S.warheadId,
      skipCount: state.skipCount ?? 0,
      flightPathAngle: state.gamma ?? 0,
      dynamicPressurePa: state.qPa ?? 0,
      boosterAttached: state.phase === 'boost',
      isScramjet: S.isScramjet,
      scramjetFuelKg: state.scramjetFuel ?? 0,
    });
  }

  function buildCtx(launchSite, target, rot0) {
    const launchLocal = latLonToVector3({ lat: launchSite.latitude, lon: launchSite.longitude, radius: earthR });
    const tgtLocal = latLonToVector3({ lat: target.lat, lon: target.lon, radius: earthR });
    return {
      rot0, launchSite, target, launchLocal, tgtLocal,
      rangeKm: haversineDistanceKm({ lat: launchSite.latitude, lon: launchSite.longitude }, target),
    };
  }

  function buildState() {
    const pos = applyEarthRotation(ctx.launchLocal, ctx.rot0);
    const earthVel = new THREE.Vector3(0, rotRate, 0).cross(pos.clone());
    return {
      pos,
      vel: earthVel,
      attDir: pos.clone().normalize(),
      t: 0,
      boostT: 0,
      sepTime: null,
      phase: 'boost',
      label: 'Boost',
      impactT: 0,
      impactPt: null,
      groundTrack: { lat: ctx.launchSite.latitude, lon: ctx.launchSite.longitude },
      altKm: 0, apogeeKm: 0, speedKmS: 0, distKm: ctx.rangeKm,
      mach: 0, gamma: 0, qPa: 0,
      skipCount: 0, inDip: false,
      scramjetFuel: S.scramjetFuelKg,
    };
  }

  function earthFixed(pos, rot) {
    return applyEarthRotation(pos, -rot);
  }
}

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
    skipCount: 0, flightPathAngle: 0, dynamicPressurePa: 0,
    boosterAttached: false, isScramjet: false, scramjetFuelKg: 0,
  };
}
