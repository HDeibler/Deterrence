export const GEO_RADIUS_UNITS = 42.164;

export const GROUND_RADAR_PRESET = {
  type: 'ground',
  label: 'Ground Radar',
  coverageKm: 4200,
};

export const ORBIT_PRESETS = [
  { id: 'leo', label: 'LEO', altitudeKm: 800, inclinationDeg: 28, raanDeg: 0, description: 'Low Earth Orbit' },
  { id: 'meo', label: 'MEO', altitudeKm: 8000, inclinationDeg: 55, raanDeg: 0, description: 'Medium Earth Orbit' },
  { id: 'geo', label: 'GEO', altitudeKm: 35786, inclinationDeg: 0, raanDeg: 0, description: 'Geostationary Orbit' },
];

export const ORBIT_ALTITUDE_RANGE = {
  minKm: 400,
  maxKm: 35786,
  stepKm: 200,
};

export const EARTH_RADIUS_KM = 6371;
const MU = 3.986004418e14; // Earth standard gravitational parameter (m³/s²)

export function computeFootprintRadiusKm(altitudeKm) {
  const rho = Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm));
  return rho * EARTH_RADIUS_KM;
}

export function altitudeKmToOrbitRadiusUnits(altitudeKm) {
  return (EARTH_RADIUS_KM + altitudeKm) / 1000;
}

export function computeOrbitalPeriodSeconds(altitudeKm) {
  const radiusMeters = (EARTH_RADIUS_KM + altitudeKm) * 1000;
  return 2 * Math.PI * Math.sqrt((radiusMeters * radiusMeters * radiusMeters) / MU);
}

export function computeOrbitsPerHour(altitudeKm) {
  const periodSeconds = computeOrbitalPeriodSeconds(altitudeKm);
  return 3600 / periodSeconds;
}

export function computeOrbitalSpeedKmS(altitudeKm) {
  const radiusMeters = (EARTH_RADIUS_KM + altitudeKm) * 1000;
  return Math.sqrt(MU / radiusMeters) / 1000;
}

export function describeOrbit(altitudeKm) {
  const orbitsPerHour = computeOrbitsPerHour(altitudeKm);
  if (altitudeKm >= 35000) return 'Geostationary \u2014 fixed position';
  if (altitudeKm >= 15000) return `HEO \u2014 ${orbitsPerHour.toFixed(1)} orbits/hr`;
  if (altitudeKm >= 2000) return `MEO \u2014 ${orbitsPerHour.toFixed(1)} orbits/hr`;
  return `LEO \u2014 ${orbitsPerHour.toFixed(1)} orbits/hr`;
}

export const EARLY_WARNING_SATELLITE_PRESET = {
  type: 'satellite',
  label: 'Early Warning Satellite',
  geostationaryRadiusUnits: GEO_RADIUS_UNITS,
  footprintRadiusKm: computeFootprintRadiusKm(35786),
  defaultAltitudeKm: 2000,
  defaultInclinationDeg: 28,
  defaultRaanDeg: 0,
};

export const GEO_SLOTS = [
  { id: 'americas', label: 'Americas', longitude: -105 },
  { id: 'atlantic', label: 'Atlantic', longitude: -15 },
  { id: 'europe-africa', label: 'Europe / Africa', longitude: 45 },
  { id: 'indian', label: 'Indian Ocean', longitude: 85 },
  { id: 'asia-pacific', label: 'Asia / Pacific', longitude: 135 },
];

// ── Interceptor Presets ───────────────────────────────────────────────
export const INTERCEPTOR_PRESETS = {
  ngi: {
    type: 'ngi',
    label: 'Next Generation Interceptor (NGI)',
    shortLabel: 'NGI',
    interceptorsPerSite: 20, // Housed in legacy GBI silos
    maxRangeKm: 8000,
    interceptAltitudeMinKm: 80, // Can hit slightly lower than legacy GBI
    interceptAltitudeMaxKm: 2500,
    burnTimeSeconds: 200,
    maxSpeedKmS: 9.0, // Faster than legacy GBI
    thrustMps2: 50,
    killProbability: 0.85, // Vastly improved due to Multiple Kill Vehicle (MKV) payload
    engagementPhases: ['midcourse'],
  },
};

export const INTERCEPTOR_TYPES = ['ngi'];

// Boost phase detection window — satellites can only detect IR plume during powered flight
export const BOOST_PHASE_MAX_SECONDS = 300;

export const COUNTRY_SPACEPORTS = {
  USA: {
    name: 'Cape Canaveral Space Force Station',
    latitude: 28.6084,
    longitude: -80.6043,
  },
  CHN: {
    name: 'Wenchang Space Launch Site',
    latitude: 19.6144,
    longitude: 110.9511,
  },
  RUS: {
    name: 'Plesetsk Cosmodrome',
    latitude: 62.9273,
    longitude: 40.5776,
  },
};
