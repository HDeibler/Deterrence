import * as THREE from 'three';

export function computeOrbitalVelocity({ gravitationalConstant, centralMass, radiusMeters }) {
  return Math.sqrt((gravitationalConstant * centralMass) / radiusMeters);
}

export function computeCentralBodyAcceleration({
  position,
  gravitationalParameter,
  scaleMeters,
  origin = ORIGIN,
}) {
  const offset = origin.clone().sub(position);
  const distanceUnits = Math.max(offset.length(), 1e-6);
  const distanceMeters = distanceUnits * scaleMeters;
  const magnitude = gravitationalParameter / (distanceMeters * distanceMeters);
  return offset.normalize().multiplyScalar(magnitude / scaleMeters);
}

export function computeTotalAcceleration({
  position,
  attractors,
  gravitationalConstant,
  scaleMeters,
}) {
  const acceleration = new THREE.Vector3();

  for (const attractor of attractors) {
    const offset = attractor.position.clone().sub(position);
    const distanceUnits = Math.max(offset.length(), 0.001);
    const distanceMeters = distanceUnits * scaleMeters;
    const magnitude = (gravitationalConstant * attractor.mass) / (distanceMeters * distanceMeters);
    acceleration.add(offset.normalize().multiplyScalar(magnitude / scaleMeters));
  }

  return acceleration;
}

export function integrateStateRK4({ position, velocity, deltaSeconds, accelerationAt }) {
  const k1v = accelerationAt(position, velocity);
  const k1x = velocity.clone();

  const p2 = position.clone().addScaledVector(k1x, deltaSeconds * 0.5);
  const v2 = velocity.clone().addScaledVector(k1v, deltaSeconds * 0.5);
  const k2v = accelerationAt(p2, v2);
  const k2x = v2.clone();

  const p3 = position.clone().addScaledVector(k2x, deltaSeconds * 0.5);
  const v3 = velocity.clone().addScaledVector(k2v, deltaSeconds * 0.5);
  const k3v = accelerationAt(p3, v3);
  const k3x = v3.clone();

  const p4 = position.clone().addScaledVector(k3x, deltaSeconds);
  const v4 = velocity.clone().addScaledVector(k3v, deltaSeconds);
  const k4v = accelerationAt(p4, v4);
  const k4x = v4.clone();

  position.addScaledVector(k1x, deltaSeconds / 6);
  position.addScaledVector(k2x, deltaSeconds / 3);
  position.addScaledVector(k3x, deltaSeconds / 3);
  position.addScaledVector(k4x, deltaSeconds / 6);

  velocity.addScaledVector(k1v, deltaSeconds / 6);
  velocity.addScaledVector(k2v, deltaSeconds / 3);
  velocity.addScaledVector(k3v, deltaSeconds / 3);
  velocity.addScaledVector(k4v, deltaSeconds / 6);
}

export function integrateEuler({
  body,
  attractors,
  deltaSeconds,
  gravitationalConstant,
  scaleMeters,
}) {
  const acceleration = computeTotalAcceleration({
    position: body.position,
    attractors,
    gravitationalConstant,
    scaleMeters,
  });

  body.velocity.addScaledVector(acceleration, deltaSeconds);
  body.position.addScaledVector(body.velocity, deltaSeconds);
}

const ORIGIN = new THREE.Vector3();

// Lambert's problem solver (universal variable / Stumpff function method).
// Given two positions and a time of flight, finds the initial velocity for a
// Keplerian orbit connecting them. Standard orbital mechanics — no approximations.
export function solveLambert({ r1Vec, r2Vec, tof, mu }) {
  const r1 = r1Vec.length();
  const r2 = r2Vec.length();
  if (r1 < 1e-10 || r2 < 1e-10 || tof <= 0) {
    return null;
  }

  const cosAngle = THREE.MathUtils.clamp(r1Vec.dot(r2Vec) / (r1 * r2), -1, 1);
  const angle = Math.acos(cosAngle);
  const sinAngle = Math.sin(angle);
  if (sinAngle < 1e-10) {
    return null;
  }

  const A = sinAngle * Math.sqrt((r1 * r2) / (1 - cosAngle));

  function stumpffC(z) {
    if (z > 1e-6) {
      return (1 - Math.cos(Math.sqrt(z))) / z;
    }
    if (z < -1e-6) {
      return (Math.cosh(Math.sqrt(-z)) - 1) / (-z);
    }
    return 0.5;
  }

  function stumpffS(z) {
    if (z > 1e-6) {
      const sq = Math.sqrt(z);
      return (sq - Math.sin(sq)) / (sq * sq * sq);
    }
    if (z < -1e-6) {
      const sq = Math.sqrt(-z);
      return (Math.sinh(sq) - sq) / (sq * sq * sq);
    }
    return 1 / 6;
  }

  function yFromZ(z) {
    const sqrtC = Math.sqrt(Math.max(stumpffC(z), 1e-20));
    return r1 + r2 + A * (z * stumpffS(z) - 1) / sqrtC;
  }

  function timeError(z) {
    const Cz = stumpffC(z);
    const y = yFromZ(z);
    if (y < 0) {
      return NaN;
    }
    const chi = Math.sqrt(y / Math.max(Cz, 1e-20));
    return chi * chi * chi * stumpffS(z) + A * Math.sqrt(y) - Math.sqrt(mu) * tof;
  }

  // Bisection: find z where timeError(z) = 0
  // For sub-orbital ICBM transfers, z ∈ (0, 4π²).
  // Find the lowest z where y ≥ 0 (valid orbit geometry).
  let zLow = 0;
  for (let i = 0; i < 40; i += 1) {
    if (yFromZ(zLow) >= 0) {
      break;
    }
    zLow += 0.2;
  }

  let zHigh = 4 * Math.PI * Math.PI * 0.95;
  let fLow = timeError(zLow);
  let fHigh = timeError(zHigh);

  // Shrink upper bound if invalid
  for (let i = 0; i < 20; i += 1) {
    if (!isNaN(fHigh) && fHigh > 0) {
      break;
    }
    zHigh *= 0.8;
    fHigh = timeError(zHigh);
  }

  if (isNaN(fLow) || isNaN(fHigh) || fLow * fHigh >= 0) {
    return null;
  }

  let z = 0;
  for (let i = 0; i < 50; i += 1) {
    z = (zLow + zHigh) * 0.5;
    const fMid = timeError(z);
    if (isNaN(fMid)) {
      zHigh = z;
      continue;
    }
    if (Math.abs(fMid) < 1e-8) {
      break;
    }
    if (fMid * fLow < 0) {
      zHigh = z;
    } else {
      zLow = z;
      fLow = fMid;
    }
  }

  const y = yFromZ(z);
  if (y < 0) {
    return null;
  }

  const f = 1 - y / r1;
  const g = A * Math.sqrt(y / mu);
  if (Math.abs(g) < 1e-20) {
    return null;
  }

  return new THREE.Vector3().copy(r2Vec).addScaledVector(r1Vec, -f).divideScalar(g);
}

