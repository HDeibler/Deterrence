export const GEO_RADIUS_UNITS = 42.164;

export const GROUND_RADAR_PRESET = {
  type: 'ground',
  label: 'Ground Radar',
  coverageKm: 4200,
};

export const EARLY_WARNING_SATELLITE_PRESET = {
  type: 'satellite',
  label: 'Early Warning Satellite',
  geostationaryRadiusUnits: GEO_RADIUS_UNITS,
  footprintRadiusKm: 9000,
};

export const GEO_SLOTS = [
  { id: 'americas', label: 'Americas', longitude: -105 },
  { id: 'atlantic', label: 'Atlantic', longitude: -15 },
  { id: 'europe-africa', label: 'Europe / Africa', longitude: 45 },
  { id: 'indian', label: 'Indian Ocean', longitude: 85 },
  { id: 'asia-pacific', label: 'Asia / Pacific', longitude: 135 },
];

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
