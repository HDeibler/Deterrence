// ── Force Budget Store ───────────────────────────────────────────────
// Runtime store that tracks remaining assets per nation and gates
// missile launches, interceptor placements, radar deployments, and
// satellite launches behind budget checks.

import { getNationBudget, getMissileFuelCost } from './data/forceBudgetCatalog.js';

export function createForceBudgetStore({ iso3, oilSimulation }) {
  const budget = { ...getNationBudget(iso3) };

  return {
    canLaunch(missileTypeId) {
      return (budget[missileTypeId] || 0) > 0;
    },

    consumeLaunch(missileTypeId) {
      if (!this.canLaunch(missileTypeId)) return false;
      budget[missileTypeId]--;
      const fuelCost = getMissileFuelCost(missileTypeId);
      oilSimulation.consumeMilitaryFuel(iso3, fuelCost);
      return true;
    },

    canDeployInterceptor() {
      return budget.interceptorSites > 0;
    },

    consumeInterceptor() {
      if (budget.interceptorSites <= 0) return false;
      budget.interceptorSites--;
      return true;
    },

    canDeployRadar() {
      return budget.groundRadars > 0;
    },

    consumeRadar() {
      if (budget.groundRadars <= 0) return false;
      budget.groundRadars--;
      return true;
    },

    canDeploySatellite() {
      return budget.satellites > 0;
    },

    consumeSatellite() {
      if (budget.satellites <= 0) return false;
      budget.satellites--;
      return true;
    },

    getRemaining() {
      return { ...budget };
    },

    getRemainingMissiles(typeId) {
      return budget[typeId] || 0;
    },
  };
}
