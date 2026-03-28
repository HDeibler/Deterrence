import * as THREE from 'three';
import {
  applyEarthRotation,
  haversineDistanceKm,
  latLonToVector3,
  vector3ToLatLon,
} from '../world/geo/geoMath.js';

// ── Reentry Vehicle (RV) Simulation ─────────────────────────────────
//
// Lightweight simulation for an individual MIRV reentry vehicle after
// release from the post-boost vehicle (bus). Physics:
//   - Keplerian ballistic arc (no thrust)
//   - Atmospheric drag during reentry (Mach 15-23)
//   - Small velocity impulse at release to steer toward assigned target
//   - CEP (Circular Error Probable) random offset at impact
//
// The RV inherits position and velocity from the parent ICBM bus
// at the moment of release, plus a small delta-v to adjust its
// trajectory toward its individual target.

const G = 9.80665;
const R_AIR = 287.05287;
const IMPACT_LINGER_S = 5;

// Atmosphere density (same model as ICBM)
function atmoDensity(altM) {
  if (altM < 0) return 1.225;
  if (altM > 120_000) return 0;
  if (altM < 11_000) return 1.225 * Math.exp(-altM / 8500);
  if (altM < 25_000) return 0.364 * Math.exp(-(altM - 11000) / 6500);
  if (altM < 50_000) return 0.0395 * Math.exp(-(altM - 25000) / 7200);
  if (altM < 80_000) return 0.00116 * Math.exp(-(altM - 50000) / 6100);
  return 0.0000157 * Math.exp(-(altM - 80000) / 5800);
}

export function createReentryVehicleSimulation({ simulationConfig, worldConfig }) {
  const earthR = worldConfig.earthRadius;
  const earthRm = earthR * simulationConfig.scaleMeters;
  const sc = simulationConfig.scaleMeters;
  const rotRate = (Math.PI * 2) / simulationConfig.earthRotationPeriodSeconds;
  const mu = simulationConfig.gravitationalConstant * worldConfig.earthMass;

  const actualPath = [];
  let state = null;
  let ctx = null;
  let pathClock = 0;
  const snap = idleSnap();

  // RV aerodynamic properties (Mk21-class RV)
  const RV_MASS_KG = 360;     // warhead + RV structure
  const RV_CD = 0.18;          // blunt cone, ablating
  const RV_AREA_M2 = 0.11;    // ~37 cm diameter base
  const RV_CD_TERMINAL = 0.22; // higher Cd in dense lower atmo

  // CEP: Gaussian offset at impact (meters)
  const CEP_M = 200; // Minuteman III class

  return {
    // Release from bus: inherits position + velocity, steers toward own target
    release({ position, velocity, target, launchSite, earthRotationRadians, warheadId }) {
      ctx = {
        rot0: earthRotationRadians,
        launchSite,
        target,
        tgtLocal: latLonToVector3({ lat: target.lat, lon: target.lon, radius: earthR }),
        warheadId: warheadId ?? 'nuclear_300kt',
      };

      // Apply small delta-v to steer toward this RV's individual target
      const rot = earthRotationRadians + rotRate * 0; // current rotation
      const tgtWorld = applyEarthRotation(ctx.tgtLocal, rot);
      const toTgt = tgtWorld.clone().sub(position).normalize();

      // Delta-v: small impulse toward target (PBV bus maneuver)
      // Real PBV has ~200 m/s delta-v budget spread across all RVs
      const deltaVMS = 50; // m/s per RV release
      const impulse = toTgt.multiplyScalar(deltaVMS / sc);

      state = {
        pos: position.clone(),
        vel: velocity.clone().add(impulse),
        t: 0,
        phase: 'midcourse',
        label: 'Ballistic',
        impactT: 0,
        impactPt: null,
        groundTrack: vector3ToLatLon(applyEarthRotation(position, -rot)),
        altKm: 0,
        apogeeKm: 0,
        speedKmS: 0,
        distKm: 0,
      };

      actualPath.length = 0;
      actualPath.push(applyEarthRotation(position, -rot));
      pathClock = 0;
      refresh();
    },

    step(dt) {
      if (!state || !ctx) return;
      if (state.phase === 'impact') {
        state.impactT += dt;
        if (state.impactT >= IMPACT_LINGER_S) {
          actualPath.length = 0;
          state.phase = 'complete';
        }
        refresh();
        return;
      }
      if (state.phase === 'complete') { refresh(); return; }

      // Sub-step for reentry accuracy
      let rem = Math.min(dt, 1.0);
      while (rem > 0.001) {
        const step = Math.min(rem, 0.3);
        propagate(step);
        rem -= step;
        if (state.phase === 'impact' || state.phase === 'complete') break;
      }

      pathClock += dt;
      if (pathClock >= 2 || state.phase === 'impact') {
        const rot = ctx.rot0 + rotRate * state.t;
        actualPath.push(applyEarthRotation(state.pos, -rot));
        if (actualPath.length > 800) actualPath.shift();
        pathClock = 0;
      }
      refresh();
    },

    getSnapshot() { return snap; },
    isActive() {
      return Boolean(state && state.phase !== 'idle' && state.phase !== 'complete');
    },
  };

  function propagate(dt) {
    if (state.phase === 'impact' || state.phase === 'complete') return;

    const radial = state.pos.clone().normalize();
    const rM = state.pos.length() * sc;
    const altM = rM - earthRm;
    const rot = ctx.rot0 + rotRate * state.t;

    // Gravity
    const gAccel = mu / (rM * rM);
    const accel = radial.clone().multiplyScalar(-gAccel / sc);

    // Atmospheric drag (significant during reentry)
    const rho = atmoDensity(altM);
    const speedMS = state.vel.length() * sc;
    if (rho > 0 && speedMS > 1) {
      const cd = altM < 50_000 ? RV_CD_TERMINAL : RV_CD;
      const qPa = 0.5 * rho * speedMS * speedMS;
      const dragAccel = qPa * cd * RV_AREA_M2 / RV_MASS_KG / sc;
      const velDir = state.vel.clone().normalize();
      accel.addScaledVector(velDir, -dragAccel);
    }

    // Phase transition: midcourse → terminal when descending through 320 km
    if (state.phase === 'midcourse' && altM < 320_000 && state.vel.dot(radial) < 0) {
      state.phase = 'terminal';
      state.label = 'Reentry';
    }

    // Velocity Verlet
    state.vel.addScaledVector(accel, dt * 0.5);
    state.pos.addScaledVector(state.vel, dt);
    state.vel.addScaledVector(accel, dt * 0.5);
    state.t += dt;

    // Telemetry
    const newRot = ctx.rot0 + rotRate * state.t;
    state.groundTrack = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));
    const newAltM = (state.pos.length() * sc) - earthRm;
    state.altKm = Math.max(newAltM / 1000, 0);
    state.apogeeKm = Math.max(state.apogeeKm, state.altKm);
    state.speedKmS = speedMS / 1000;

    const tgtWorld = applyEarthRotation(ctx.tgtLocal, newRot);
    state.distKm = tgtWorld.clone().sub(state.pos).length() * sc / 1000;

    // Impact detection
    if (state.pos.length() <= earthR) {
      // Apply CEP offset to impact point
      const sp = vector3ToLatLon(applyEarthRotation(state.pos, -newRot));
      const cepOffsetDeg = (CEP_M / 111_000); // rough meters → degrees
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(-2 * Math.log(Math.random() + 1e-10)) * cepOffsetDeg; // Rayleigh
      sp.lat += r * Math.cos(angle);
      sp.lon += r * Math.sin(angle);

      state.pos.normalize().multiplyScalar(earthR);
      state.phase = 'impact';
      state.label = 'Impact';
      state.impactPt = sp;
      state.groundTrack = sp;
    }
  }

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
      stageIndex: null,
      altitudeKm: state.altKm ?? 0,
      speedKmS: state.speedKmS ?? 0,
      timeToImpactSeconds: null,
      rangeToTargetKm: state.distKm ?? null,
      apogeeKm: state.apogeeKm ?? 0,
      flightTimeSeconds: state.t,
      launchSite: ctx.launchSite,
      target: ctx.target,
      impactPoint: state.impactPt,
      position: state.pos.clone(),
      direction: state.vel.lengthSq() > 1e-12
        ? state.vel.clone().normalize()
        : state.pos.clone().normalize(),
      actualPath,
      predictedPath: [],
      missileType: 'rv',
      warheadId: ctx.warheadId,
      isRV: true,
    });
  }
}

function idleSnap() {
  return {
    active: false, visible: false, phase: 'idle', stageLabel: 'Standby',
    stageIndex: null, altitudeKm: 0, speedKmS: 0,
    timeToImpactSeconds: null, rangeToTargetKm: null,
    apogeeKm: 0, flightTimeSeconds: 0,
    launchSite: null, target: null, impactPoint: null,
    position: null, direction: null,
    actualPath: [], predictedPath: [],
    missileType: 'rv', warheadId: null, isRV: false,
  };
}
