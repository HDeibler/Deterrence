// ── Force Budget Catalog ────────────────────────────────────────────
// Defines per-nation starting force compositions and fuel costs per
// missile type and military operation. Pure data — no runtime deps.

// ─── Nation force budgets ─────────────────────────────────────────
// What each nation starts with at game begin.
export const NATION_FORCE_BUDGETS = {
  USA: {
    icbm: 6,
    cruise_subsonic: 12,
    cruise_supersonic: 8,
    hypersonic_glide: 2,
    hypersonic_cruise: 4,
    interceptorSites: 3,     // NGI sites
    groundRadars: 2,
    satellites: 2,            // SBIRS slots
    fleets: 2,
    squadrons: 3,
  },
  CHN: {
    icbm: 8,
    cruise_subsonic: 10,
    cruise_supersonic: 6,
    hypersonic_glide: 4,      // China has invested heavily in HGV
    hypersonic_cruise: 2,
    interceptorSites: 2,
    groundRadars: 2,
    satellites: 1,
    fleets: 2,
    squadrons: 2,
  },
  RUS: {
    icbm: 10,                 // Russia has more ICBMs
    cruise_subsonic: 14,
    cruise_supersonic: 6,
    hypersonic_glide: 3,
    hypersonic_cruise: 3,
    interceptorSites: 4,      // S-400/A-235 equivalents
    groundRadars: 3,
    satellites: 2,
    fleets: 3,
    squadrons: 2,
  },
};

// ─── Fuel cost per missile launch (barrels of military fuel) ──────
export const MISSILE_FUEL_COSTS = {
  icbm: 50000,               // Liquid fuel ICBM
  cruise_subsonic: 5000,     // Turbofan cruise
  cruise_supersonic: 8000,   // Ramjet
  hypersonic_glide: 40000,   // Boost-glide rocket
  hypersonic_cruise: 15000,  // Scramjet
};

// ─── Fuel cost per operation (barrels) ────────────────────────────
export const OPERATION_FUEL_COSTS = {
  fleetDeployment: 100000,   // Deploy a carrier group
  fleetPerDayAtSea: 20000,   // Daily burn for fleet operations
  airSortie: 10000,          // Per squadron sortie
  interceptorLaunch: 5000,   // NGI launch
  radarOperation: 1000,      // Daily radar power
};

export function getNationBudget(iso3) {
  return NATION_FORCE_BUDGETS[iso3] ?? null;
}

export function getMissileFuelCost(missileTypeId) {
  return MISSILE_FUEL_COSTS[missileTypeId] ?? null;
}

export function getOperationFuelCost(operationType) {
  return OPERATION_FUEL_COSTS[operationType] ?? null;
}
