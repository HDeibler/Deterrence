// Oil economy simulation.
//
// National oil production serves the ENTIRE civilian economy. The military
// only receives a small allocation (~2-3% of total production). This is
// historically accurate — the US military consumes ~500K bpd out of ~20M bpd.
//
// Two separate pools:
//   1. National reserves (SPR) — strategic petroleum reserve for the country
//   2. Military fuel — the allocation available for military operations
//
// Military fuel is consumed by:
//   - Fleet operations (ships burn fuel while underway)
//   - Air missions (sortie fuel costs)
//   - Missile launches (solid fuel, but logistics costs)
//
// If military fuel runs out, operations slow or halt.

const SECONDS_PER_DAY = 86400;

// Military gets ~2.5% of national production (US: ~500K of 20M bpd)
const MILITARY_ALLOCATION_FRACTION = 0.025;

// National economy consumes the rest through civilian use + exports
const CIVILIAN_CONSUMPTION_FRACTION = 0.55; // domestic industry, transport, heating
// Remainder after military + civilian + exports = net into national reserves

// Starting stockpiles
const DEFAULT_NATIONAL_RESERVE_CAPACITY = 700_000_000; // 700M bbl (US SPR capacity)
const DEFAULT_NATIONAL_RESERVE_FILL = 0.5; // start at 50%
const DEFAULT_MILITARY_FUEL_CAPACITY = 50_000_000; // 50M bbl military stockpile
const DEFAULT_MILITARY_FUEL_FILL = 0.8; // start at 80%

const RESERVE_FACILITY_CAPACITY = 100_000_000; // +100M bbl per placed facility

export function createOilSimulation() {
  let oilFieldData = [];
  let countryData = [];
  const countryState = new Map();
  const reserveFacilities = [];
  let nextFacilityId = 1;
  let loaded = false;

  fetch('/data/oil-production.json')
    .then((r) => r.json())
    .then((data) => {
      oilFieldData = data.oilFields ?? [];
      countryData = data.countries ?? [];
      initializeCountries();
      loaded = true;
    })
    .catch((err) => { console.error('Failed to load oil production data:', err); });

  function initializeCountries() {
    for (const country of countryData) {
      const bpd = country.bpd;
      const exports = country.exportsBpd ?? 0;

      // Scale reserves to country size (larger producers have larger SPRs)
      const scaleFactor = Math.max(bpd / 20_000_000, 0.05);
      const nationalCapacity = Math.round(DEFAULT_NATIONAL_RESERVE_CAPACITY * scaleFactor);
      const militaryCapacity = Math.round(DEFAULT_MILITARY_FUEL_CAPACITY * scaleFactor);

      countryState.set(country.iso3, {
        iso3: country.iso3,
        name: country.name,
        dailyProductionBpd: bpd,
        exportsBpd: exports,

        // National strategic petroleum reserve
        nationalReserves: Math.round(nationalCapacity * DEFAULT_NATIONAL_RESERVE_FILL),
        nationalCapacity,

        // Military fuel allocation
        militaryFuel: Math.round(militaryCapacity * DEFAULT_MILITARY_FUEL_FILL),
        militaryCapacity,
        militaryDailyAllocation: Math.round(bpd * MILITARY_ALLOCATION_FRACTION),

        // Fill rate tracking (bbl/day, updated each step)
        sprFillRateBpd: 0,
      });
    }
  }

  return {
    step(deltaSeconds) {
      if (!loaded) return;

      for (const [, state] of countryState) {
        const dt = deltaSeconds / SECONDS_PER_DAY;

        // Total daily production
        const produced = state.dailyProductionBpd * dt;

        // Outflows
        const exported = state.exportsBpd * dt;
        const civilianConsumed = state.dailyProductionBpd * CIVILIAN_CONSUMPTION_FRACTION * dt;
        const militaryAllocation = state.militaryDailyAllocation * dt;

        // Military fuel fills up from its daily allocation
        state.militaryFuel = Math.min(
          state.militaryCapacity,
          state.militaryFuel + militaryAllocation,
        );

        // National reserves get whatever is left after exports + civilian + military
        const netToReserves = produced - exported - civilianConsumed - militaryAllocation;
        const prevReserves = state.nationalReserves;
        state.nationalReserves = Math.max(
          0,
          Math.min(state.nationalCapacity, state.nationalReserves + netToReserves),
        );
        // Track actual fill rate (accounts for capacity clamping)
        const actualDelta = state.nationalReserves - prevReserves;
        state.sprFillRateBpd = dt > 0 ? actualDelta / dt : 0;
      }
    },

    // Consume military fuel for an operation. Returns true if enough fuel available.
    consumeMilitaryFuel(iso3, barrels) {
      const state = countryState.get(iso3);
      if (!state || state.militaryFuel < barrels) return false;
      state.militaryFuel -= barrels;
      return true;
    },

    // Deliver oil cargo to an importer's national reserves
    deliverCargo(iso3, barrels) {
      const state = countryState.get(iso3);
      if (!state) return;
      state.nationalReserves = Math.min(
        state.nationalCapacity,
        state.nationalReserves + barrels,
      );
    },

    // Load oil cargo from an exporter's production. Returns barrels actually loaded.
    loadCargo(iso3, barrels) {
      const state = countryState.get(iso3);
      if (!state) return 0;
      // Deduct from reserves (exporter has surplus flowing through)
      const available = Math.min(barrels, state.nationalReserves);
      state.nationalReserves -= available;
      return available;
    },

    getCountryState(iso3) {
      return countryState.get(iso3) ?? null;
    },

    getAllCountryStates() {
      return [...countryState.values()];
    },

    getOilFields() {
      return oilFieldData;
    },

    getCountryFields(iso3) {
      return oilFieldData.filter((f) => f.country === iso3);
    },

    getReserveFacilities() {
      return reserveFacilities;
    },

    placeReserveFacility({ countryIso3, lat, lon }) {
      const id = `oil-reserve-${nextFacilityId}`;
      nextFacilityId += 1;
      reserveFacilities.push({ id, countryIso3, lat, lon });
      const state = countryState.get(countryIso3);
      if (state) {
        state.nationalCapacity += RESERVE_FACILITY_CAPACITY;
      }
      return id;
    },

    getSnapshot() {
      return {
        countries: [...countryState.entries()].map(([iso3, s]) => ({
          iso3,
          name: s.name,
          dailyProductionBpd: s.dailyProductionBpd,
          exportsBpd: s.exportsBpd,
          nationalReserves: Math.round(s.nationalReserves),
          nationalCapacity: s.nationalCapacity,
          nationalFillPct: s.nationalCapacity > 0
            ? Math.round((s.nationalReserves / s.nationalCapacity) * 100) : 0,
          militaryFuel: Math.round(s.militaryFuel),
          militaryCapacity: s.militaryCapacity,
          militaryFillPct: s.militaryCapacity > 0
            ? Math.round((s.militaryFuel / s.militaryCapacity) * 100) : 0,
          militaryDailyAllocation: s.militaryDailyAllocation,
        })),
        facilities: reserveFacilities.map((f) => ({ ...f })),
      };
    },

    isLoaded() {
      return loaded;
    },
  };
}
