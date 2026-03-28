// ── Force Budget Catalog ─────────────────────────────────────────────
// Per-nation starting force compositions and missile fuel costs.
// These define the finite resources available to each player nation.

export const NATION_FORCE_BUDGETS = {
  USA: {
    icbm: 6,
    cruise_subsonic: 12,
    cruise_supersonic: 8,
    hypersonic_glide: 2,
    hypersonic_cruise: 4,
    interceptorSites: 3,
    groundRadars: 2,
    satellites: 2,
  },
  CHN: {
    icbm: 8,
    cruise_subsonic: 10,
    cruise_supersonic: 6,
    hypersonic_glide: 4,
    hypersonic_cruise: 2,
    interceptorSites: 2,
    groundRadars: 2,
    satellites: 1,
  },
  RUS: {
    icbm: 10,
    cruise_subsonic: 14,
    cruise_supersonic: 6,
    hypersonic_glide: 3,
    hypersonic_cruise: 3,
    interceptorSites: 4,
    groundRadars: 3,
    satellites: 2,
  },
};

export const MISSILE_FUEL_COSTS = {
  icbm: 50000,
  cruise_subsonic: 5000,
  cruise_supersonic: 8000,
  hypersonic_glide: 40000,
  hypersonic_cruise: 15000,
};

export function getNationBudget(iso3) {
  return NATION_FORCE_BUDGETS[iso3] || NATION_FORCE_BUDGETS.USA;
}

export function getMissileFuelCost(typeId) {
  return MISSILE_FUEL_COSTS[typeId] || 10000;
}
