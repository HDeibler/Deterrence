import { COUNTRY_SPACEPORTS } from './radarCatalog.js';

export const BASE_TYPE_LABELS = {
  silo_base: 'Silo Base',
  air_base: 'Air Base',
  naval_base: 'Naval Base',
  spaceport: 'Spaceport',
  hub_base: 'Hub Base',
  forward_base: 'Forward Base',
};

export const ASSET_STORAGE_RULES = {
  missile_inventory: {
    label: 'Missile Inventory',
    allowedBaseTypes: ['silo_base'],
    baseCapacities: {
      silo_base: 1,
    },
    allocationPerHour: 0.18,
  },
  radar: {
    label: 'Radar Arrays',
    allowedBaseTypes: ['air_base'],
    baseCapacities: {
      air_base: 2,
    },
    allocationPerHour: 0.08,
  },
  early_warning_satellite: {
    label: 'Early Warning Satellites',
    allowedBaseTypes: ['spaceport'],
    baseCapacities: {
      spaceport: 2,
    },
    allocationPerHour: 0.04,
  },
  fighter: {
    label: 'Fighters',
    allowedBaseTypes: ['air_base'],
    baseCapacities: {
      air_base: 24,
    },
    allocationPerHour: 1.2,
  },
  interceptor: {
    label: 'Interceptors',
    allowedBaseTypes: ['air_base'],
    baseCapacities: {
      air_base: 12,
    },
    allocationPerHour: 0.6,
  },
  cargo_plane: {
    label: 'Cargo Planes',
    allowedBaseTypes: ['air_base'],
    baseCapacities: {
      air_base: 10,
    },
    allocationPerHour: 0.4,
  },
  surface_ship: {
    label: 'Surface Ships',
    allowedBaseTypes: ['naval_base'],
    baseCapacities: {
      naval_base: 8,
    },
    allocationPerHour: 0.08,
  },
  submarine: {
    label: 'Submarines',
    allowedBaseTypes: ['naval_base'],
    baseCapacities: {
      naval_base: 6,
    },
    allocationPerHour: 0.05,
  },
  oil_tanker: {
    label: 'Oil Tankers',
    allowedBaseTypes: ['naval_base'],
    baseCapacities: {
      naval_base: 4,
    },
    allocationPerHour: 0.04,
  },
  launch_vehicle: {
    label: 'Launch Vehicles',
    allowedBaseTypes: ['spaceport'],
    baseCapacities: {
      spaceport: 3,
    },
    allocationPerHour: 0.05,
  },
};

export function isBaseTypeCompatible(baseType, assetKey) {
  const rule = ASSET_STORAGE_RULES[assetKey];
  if (!rule) {
    return false;
  }
  return rule.allowedBaseTypes.includes(baseType);
}

export function getAssetBaseCapacity(baseType, assetKey) {
  const rule = ASSET_STORAGE_RULES[assetKey];
  if (!rule) {
    return 0;
  }
  return rule.baseCapacities[baseType] ?? 0;
}

export function deriveBaseType(site) {
  if (!site) {
    return null;
  }
  if (site.category === 'silo') {
    return 'silo_base';
  }
  if (site.category === 'airbase') {
    return 'air_base';
  }
  if (site.category === 'naval') {
    return 'naval_base';
  }
  return null;
}

export function buildDomesticBaseNetwork({ countryIso3, installations = [] }) {
  const bases = [];

  for (const site of installations) {
    const baseType = deriveBaseType(site);
    if (!baseType) {
      continue;
    }

    const capacities = buildCapacityProfile(baseType);
    if (Object.keys(capacities).length === 0) {
      continue;
    }

    bases.push({
      id: site.id,
      name: site.name,
      countryIso3,
      baseType,
      latitude: site.latitude,
      longitude: site.longitude,
      source: 'installation',
      active: true,
      capacities,
    });
  }

  const spaceport = COUNTRY_SPACEPORTS[countryIso3];
  if (spaceport) {
    bases.push({
      id: `spaceport-${countryIso3}`,
      name: spaceport.name,
      countryIso3,
      baseType: 'spaceport',
      latitude: spaceport.latitude,
      longitude: spaceport.longitude,
      source: 'catalog',
      active: true,
      capacities: buildCapacityProfile('spaceport'),
    });
  }

  return bases;
}

function buildCapacityProfile(baseType) {
  const capacities = {};
  for (const [assetKey, rule] of Object.entries(ASSET_STORAGE_RULES)) {
    const capacity = rule.baseCapacities[baseType] ?? 0;
    if (capacity > 0) {
      capacities[assetKey] = capacity;
    }
  }
  return capacities;
}
