export const worldConfig = {
  earthRadius: 6.371,
  earthMass: 5.972e24,
  moonRadius: 1.737,
  moonMass: 7.34767309e22,
  earthMoonDistance: 384.4,
};

export const simulationConfig = {
  gravitationalConstant: 6.6743e-11,
  scaleMeters: 1_000_000,
  fixedTimeStep: 1 / 120,
  simulationTimeScale: 8,
  earthRotationPeriodSeconds: 86164,
  cloudRotationPeriodSeconds: 54000,
  missile: {
    actualPathSampleSeconds: 4,
    actualPathPoints: 900,
    predictedPathPoints: 240,
    predictionSampleSeconds: 12,
    predictionRefreshSeconds: 1.2,
    maxFlightSeconds: 3600,
    maxIntegrationStepSeconds: 0.25,
    terminalPhaseAltitudeKm: 320,
  },
};

export const renderConfig = {
  camera: {
    fov: 42,
    near: 0.01,
    far: 4000,
    initialPosition: [-18, 9, 22],
  },
  controls: {
    enableDamping: false,
    minDistanceMultiplier: 1.08,
    maxDistance: 1500,
    zoomSpeed: 0.85,
    rotateSpeed: 0.65,
    panSpeed: 0.7,
    dampingFactor: 0.05,
  },
  scene: {
    fogColor: 0x03060d,
    fogDensity: 0.0013,
    fogRange: [0.0007, 0.0018],
  },
  lighting: {
    ambientColor: 0xffffff,
    ambientIntensity: 0.05,
    hemisphereSkyColor: 0xf0f4fb,
    hemisphereGroundColor: 0x242a35,
    hemisphereIntensity: 0.34,
    nightFillColor: 0xc8d6ea,
    nightFillIntensity: 0.28,
    sunColor: 0xffffff,
    sunIntensity: 2.8,
    sunPosition: [150, 40, 120],
    sunGlowColor: 0xfff2cf,
    sunGlowOpacity: 0.14,
    sunGlowRadius: 11,
  },
  stars: {
    count: 14000,
    radius: 1500,
    size: 1.6,
    opacity: 0.92,
  },
  atmosphere: {
    color: 0x5db6ff,
    radiusMultiplier: 1.016,
  },
  trail: {
    points: 1800,
    color: 0xffc47a,
    opacity: 0.55,
  },
  missile: {
    actualPathColor: 0xffbb74,
    actualPathOpacity: 0.72,
    predictedPathColor: 0x74dcff,
    predictedPathOpacity: 0.42,
  },
};
