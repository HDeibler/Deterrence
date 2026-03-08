import * as THREE from 'three';

export function latLonToVector3({ lat, lon, radius, out = new THREE.Vector3() }) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  out.set(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
  return out;
}

export function vector3ToLatLon(vector) {
  const normalized = vector.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, -normalized.x)) - 180;
  return {
    lat,
    lon: normalizeLongitude(lon),
  };
}

export function normalizeLongitude(lon) {
  let normalized = lon;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

export function applyEarthRotation(vector, rotationRadians, out = new THREE.Vector3()) {
  return out.copy(vector).applyAxisAngle(Y_AXIS, rotationRadians);
}

export function buildSurfaceFrame(vector) {
  const up = vector.clone().normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-8) {
    east.set(1, 0, 0);
  } else {
    east.normalize();
  }
  const north = up.clone().cross(east).normalize();
  return { east, north, up };
}

export function haversineDistanceKm(a, b, radiusKm = 6371) {
  const lat1 = THREE.MathUtils.degToRad(a.lat);
  const lat2 = THREE.MathUtils.degToRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = THREE.MathUtils.degToRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const chord = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(chord)));
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
