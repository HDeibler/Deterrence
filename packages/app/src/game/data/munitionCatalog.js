// ── Munition Catalog ─────────────────────────────────────────────────
// Defines all missile types and warhead payloads available in the game.
// Each missile type has realistic flight characteristics; each warhead
// type has its own damage profile.

// ─── Warhead types ──────────────────────────────────────────────────
export const WARHEAD_TYPES = {
  nuclear_300kt: {
    id: 'nuclear_300kt',
    label: 'W87 Thermonuclear',
    category: 'nuclear',
    yieldKt: 300,
    massKg: 270,
    blastRadiusKm: 3.4,
    description: '300 kt thermonuclear warhead (Minuteman III class)',
  },
  nuclear_800kt: {
    id: 'nuclear_800kt',
    label: 'W88 Thermonuclear',
    category: 'nuclear',
    yieldKt: 800,
    massKg: 360,
    blastRadiusKm: 4.8,
    description: '475 kt thermonuclear warhead (Trident II class)',
  },
  nuclear_5kt: {
    id: 'nuclear_5kt',
    label: 'W80 Tactical Nuclear',
    category: 'nuclear',
    yieldKt: 5,
    massKg: 130,
    blastRadiusKm: 0.85,
    description: '5 kt variable-yield tactical warhead',
  },
  conventional_he: {
    id: 'conventional_he',
    label: 'Unitary HE',
    category: 'conventional',
    yieldKt: 0,
    massKg: 450,
    blastRadiusKm: 0.05,
    description: '450 kg high-explosive blast-fragmentation warhead',
  },
  conventional_penetrator: {
    id: 'conventional_penetrator',
    label: 'Bunker Buster',
    category: 'conventional',
    yieldKt: 0,
    massKg: 900,
    blastRadiusKm: 0.03,
    description: '900 kg earth-penetrating warhead for hardened targets',
  },
  thermobaric: {
    id: 'thermobaric',
    label: 'Thermobaric',
    category: 'conventional',
    yieldKt: 0,
    massKg: 500,
    blastRadiusKm: 0.12,
    description: 'Fuel-air explosive — massive overpressure, soft targets',
  },
  emp: {
    id: 'emp',
    label: 'EMP Device',
    category: 'special',
    yieldKt: 10,
    massKg: 200,
    blastRadiusKm: 0.5,
    empRadiusKm: 400,
    description: 'High-altitude EMP — disables electronics over wide area',
  },
  cluster: {
    id: 'cluster',
    label: 'Cluster Munition',
    category: 'conventional',
    yieldKt: 0,
    massKg: 400,
    blastRadiusKm: 0.3,
    description: '400 kg cluster payload — area denial over wide footprint',
  },
  antiship: {
    id: 'antiship',
    label: 'Anti-Ship',
    category: 'conventional',
    yieldKt: 0,
    massKg: 300,
    blastRadiusKm: 0.02,
    description: '300 kg semi-armor-piercing warhead for naval targets',
  },
};

// ─── Missile types ──────────────────────────────────────────────────
// flightModel: 'ballistic' | 'cruise' | 'hypersonic'
export const MISSILE_TYPES = {
  // ── Ballistic (existing ICBM) ─────────────────────────────────────
  icbm: {
    id: 'icbm',
    label: 'ICBM',
    fullName: 'Intercontinental Ballistic Missile',
    flightModel: 'ballistic',
    maxRangeKm: 13000,
    minRangeKm: 500,
    cruiseAltitudeKm: null,
    maxSpeedMach: 23,
    radarCrossSectionM2: 0.05,   // RV cone — very small
    launchPlatforms: ['silo'],
    compatibleWarheads: ['nuclear_300kt', 'nuclear_800kt', 'emp'],
    defaultWarhead: 'nuclear_300kt',
    stages: 3,
    description: 'Three-stage solid-fuel ICBM. Ballistic arc through space, Mach 23 reentry.',
  },

  // ── Cruise missiles ───────────────────────────────────────────────
  cruise_subsonic: {
    id: 'cruise_subsonic',
    label: 'LACM',
    fullName: 'Land-Attack Cruise Missile',
    flightModel: 'cruise',
    maxRangeKm: 2500,
    minRangeKm: 50,
    cruiseAltitudeKm: 0.05,        // 50 meters — terrain following
    cruiseSpeedMach: 0.85,          // ~1040 km/h
    terminalSpeedMach: 0.9,
    maxSpeedMach: 0.9,
    thrustNewtons: 3200,            // Small turbofan
    massKg: 1500,
    fuelMassKg: 450,
    dragCoefficient: 0.035,         // Swept wing, very slick
    referenceAreaM2: 0.45,
    liftCoefficient: 0.6,
    wingAreaM2: 3.2,
    radarCrossSectionM2: 0.1,       // Small, low-RCS design
    launchPlatforms: ['airbase', 'naval'],
    compatibleWarheads: ['conventional_he', 'conventional_penetrator', 'thermobaric', 'cluster', 'nuclear_5kt'],
    defaultWarhead: 'conventional_he',
    turnRateRadS: 0.02,            // ~1.1 deg/s — gentle turns
    guidanceType: 'TERCOM/DSMAC',  // terrain contour + scene matching
    description: 'Subsonic terrain-following cruise missile. Low altitude, GPS/INS/TERCOM guidance. Tomahawk class.',
  },
  cruise_supersonic: {
    id: 'cruise_supersonic',
    label: 'ASCM',
    fullName: 'Anti-Ship Cruise Missile',
    flightModel: 'cruise',
    maxRangeKm: 600,
    minRangeKm: 30,
    cruiseAltitudeKm: 0.015,       // 15 meters — sea-skimming
    cruiseSpeedMach: 2.8,           // Ramjet sustained
    terminalSpeedMach: 3.0,
    maxSpeedMach: 3.0,
    thrustNewtons: 48000,           // Ramjet
    massKg: 3000,
    fuelMassKg: 900,
    dragCoefficient: 0.055,
    referenceAreaM2: 0.65,
    liftCoefficient: 0.4,
    wingAreaM2: 1.8,
    launchPlatforms: ['naval', 'airbase'],
    compatibleWarheads: ['antiship', 'conventional_he', 'thermobaric'],
    defaultWarhead: 'antiship',
    radarCrossSectionM2: 0.5,       // Larger body, prominent intake
    turnRateRadS: 0.06,            // ~3.4 deg/s — aggressive terminal maneuvers
    guidanceType: 'Active Radar',
    description: 'Supersonic sea-skimming anti-ship missile. Ramjet sustained Mach 2.8. BrahMos class.',
  },

  // ── Hypersonic missiles ───────────────────────────────────────────
  hypersonic_glide: {
    id: 'hypersonic_glide',
    label: 'HGV',
    fullName: 'Hypersonic Glide Vehicle',
    flightModel: 'hypersonic',
    maxRangeKm: 6000,
    minRangeKm: 500,
    boostAltitudeKm: 80,           // Boost to 80 km then release glider
    glideAltitudeKm: 40,           // Pulls up into 40-60 km skip-glide corridor
    maxSpeedMach: 20,
    cruiseSpeedMach: 12,            // Mach 12 in glide phase
    boostBurnTimeSeconds: 90,
    boostThrustNewtons: 850_000,
    boostPropellantMassKg: 8_000,
    boostDryMassKg: 1_200,
    glideMassKg: 1_600,            // Glide vehicle dry mass
    liftToDragRatio: 3.5,          // Hypersonic L/D
    referenceAreaM2: 1.8,
    maxPullGees: 8,                // g-loading for skip maneuvers
    radarCrossSectionM2: 0.02,     // Plasma sheath partially shields, flat profile
    launchPlatforms: ['silo', 'naval'],
    compatibleWarheads: ['conventional_he', 'conventional_penetrator', 'nuclear_5kt', 'nuclear_300kt'],
    defaultWarhead: 'conventional_he',
    guidanceType: 'INS/Stellar/GPS',
    description: 'Boost-glide hypersonic vehicle. Boost to 80 km, then skip-glide at Mach 12-20. DF-ZF / Avangard class.',
  },
  hypersonic_cruise: {
    id: 'hypersonic_cruise',
    label: 'HCM',
    fullName: 'Hypersonic Cruise Missile',
    flightModel: 'hypersonic',
    maxRangeKm: 2000,
    minRangeKm: 200,
    boostAltitudeKm: 25,
    glideAltitudeKm: 20,           // Sustained scramjet at 20-25 km
    maxSpeedMach: 8,
    cruiseSpeedMach: 6,             // Scramjet sustained Mach 6
    boostBurnTimeSeconds: 30,
    boostThrustNewtons: 320_000,
    boostPropellantMassKg: 2_500,
    boostDryMassKg: 600,
    glideMassKg: 2_200,
    scramjetThrustNewtons: 65_000,  // Scramjet provides thrust during cruise
    scramjetFuelMassKg: 800,
    liftToDragRatio: 4.0,
    referenceAreaM2: 0.9,
    maxPullGees: 5,
    radarCrossSectionM2: 0.15,     // Cylindrical body, moderate RCS
    launchPlatforms: ['silo', 'airbase', 'naval'],
    compatibleWarheads: ['conventional_he', 'conventional_penetrator', 'thermobaric', 'antiship'],
    defaultWarhead: 'conventional_he',
    guidanceType: 'INS/Active Radar',
    description: 'Scramjet-powered hypersonic cruise missile. Sustained Mach 6 at 20-25 km. Zircon class.',
  },
};

export function getMissileType(typeId) {
  return MISSILE_TYPES[typeId] ?? null;
}

export function getWarheadType(warheadId) {
  return WARHEAD_TYPES[warheadId] ?? null;
}

export function getCompatibleWarheads(missileTypeId) {
  const missile = MISSILE_TYPES[missileTypeId];
  if (!missile) return [];
  return missile.compatibleWarheads.map((id) => WARHEAD_TYPES[id]).filter(Boolean);
}

export function getMissileTypesByPlatform(platform) {
  return Object.values(MISSILE_TYPES).filter((m) => m.launchPlatforms.includes(platform));
}
