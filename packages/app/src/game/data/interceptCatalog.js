export const INTERCEPTOR_TYPES = {
  terminal_defense: {
    label: 'Terminal Defense',
    rangeKm: 200,
    probabilityOfKill: 0.45,
    reactionTimeSeconds: 8,
    interceptAltitudeMinKm: 0,
    interceptAltitudeMaxKm: 50,
    ammoPerEngagement: 2,
    deploymentBaseTypes: ['air_base', 'silo_base'],
  },
  midcourse_defense: {
    label: 'Midcourse Interceptor',
    rangeKm: 1500,
    probabilityOfKill: 0.35,
    reactionTimeSeconds: 15,
    interceptAltitudeMinKm: 100,
    interceptAltitudeMaxKm: 1500,
    ammoPerEngagement: 1,
    deploymentBaseTypes: ['air_base'],
  },
};

export const RADAR_DETECTION_REQUIREMENTS = {
  terminal_defense: {
    minRadarRangeKm: 300,
    detectionLeadTimeSeconds: 30,
  },
  midcourse_defense: {
    minRadarRangeKm: 2000,
    detectionLeadTimeSeconds: 120,
  },
};

export const INTERCEPTOR_MAINTENANCE = {
  interceptor: {
    oilPerHour: 0.5,
    chipsPerHour: 0.15,
  },
};
