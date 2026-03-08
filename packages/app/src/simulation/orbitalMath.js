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
