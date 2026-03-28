import { haversineDistanceKm } from '../world/geo/geoMath.js';
import { getWarheadType } from '../game/data/munitionCatalog.js';

// Blast radius scaling from yield (Glasstone & Dolan cube-root scaling)
// Returns radii in km for various damage zones
function computeBlastRadii(yieldKt) {
  if (yieldKt <= 0) {
    // Conventional warhead — small fixed radii
    return {
      fireballKm: 0.005,
      totalDestructionKm: 0.03,
      severeKm: 0.08,
      moderateKm: 0.2,
      lightKm: 0.5,
      thermalKm: 0.8,
    };
  }
  const cubeRoot = Math.pow(yieldKt, 1 / 3);
  return {
    fireballKm: 0.05 * cubeRoot,
    totalDestructionKm: 0.5 * cubeRoot,
    severeKm: 1.1 * cubeRoot,
    moderateKm: 2.5 * cubeRoot,
    lightKm: 5.0 * cubeRoot,
    thermalKm: 8.0 * cubeRoot,
  };
}

// Casualty estimation using distance-based mortality curves
function estimateCasualties(populationInRadius, distanceKm, blastRadii) {
  if (distanceKm <= blastRadii.fireballKm) return populationInRadius;
  if (distanceKm <= blastRadii.totalDestructionKm) return Math.round(populationInRadius * 0.95);
  if (distanceKm <= blastRadii.severeKm) return Math.round(populationInRadius * 0.50);
  if (distanceKm <= blastRadii.moderateKm) return Math.round(populationInRadius * 0.15);
  if (distanceKm <= blastRadii.lightKm) return Math.round(populationInRadius * 0.03);
  if (distanceKm <= blastRadii.thermalKm) return Math.round(populationInRadius * 0.005);
  return 0;
}

function estimateInjured(populationInRadius, distanceKm, blastRadii) {
  if (distanceKm <= blastRadii.fireballKm) return 0;
  if (distanceKm <= blastRadii.totalDestructionKm) return Math.round(populationInRadius * 0.04);
  if (distanceKm <= blastRadii.severeKm) return Math.round(populationInRadius * 0.35);
  if (distanceKm <= blastRadii.moderateKm) return Math.round(populationInRadius * 0.40);
  if (distanceKm <= blastRadii.lightKm) return Math.round(populationInRadius * 0.15);
  if (distanceKm <= blastRadii.thermalKm) return Math.round(populationInRadius * 0.05);
  return 0;
}

export function createDamageSimulation() {
  let cities = [];
  let status = 'idle';
  const impactReports = [];

  function ensureLoaded() {
    if (status !== 'idle') return;
    status = 'loading';
    fetch('/data/cities/world-cities-5000.json')
      .then((r) => r.json())
      .then((payload) => {
        cities = payload.cities.map((c) => ({
          name: c[0],
          countryCode: c[1],
          lat: c[2],
          lon: c[3],
          population: c[4],
          capitalRank: c[5],
        }));
        status = 'ready';
      })
      .catch(() => {
        status = 'error';
      });
  }

  function assessImpact({ impactPoint, warheadId = 'nuclear_300kt', missileId }) {
    const warhead = getWarheadType(warheadId);
    const yieldKt = warhead?.yieldKt ?? 300;
    const warheadLabel = warhead?.label ?? 'Unknown';
    const blastRadii = computeBlastRadii(yieldKt);

    let totalFatalities = 0;
    let totalInjured = 0;
    const affectedCities = [];

    for (const city of cities) {
      const distKm = haversineDistanceKm(
        { lat: impactPoint.lat, lon: impactPoint.lon },
        { lat: city.lat, lon: city.lon },
      );
      if (distKm > blastRadii.thermalKm) continue;

      const fatalities = estimateCasualties(city.population, distKm, blastRadii);
      const injured = estimateInjured(city.population, distKm, blastRadii);
      if (fatalities > 0 || injured > 0) {
        affectedCities.push({
          name: city.name,
          countryCode: city.countryCode,
          population: city.population,
          capitalRank: city.capitalRank,
          distanceKm: distKm,
          fatalities,
          injured,
        });
        totalFatalities += fatalities;
        totalInjured += injured;
      }
    }

    affectedCities.sort((a, b) => b.fatalities - a.fatalities);

    const report = {
      missileId,
      timestamp: Date.now(),
      impactPoint,
      warheadId,
      warheadLabel,
      yieldKt,
      blastRadii,
      totalFatalities,
      totalInjured,
      affectedCities,
      isNuclear: warhead?.category === 'nuclear',
      isConventional: warhead?.category === 'conventional',
    };

    impactReports.push(report);
    return report;
  }

  return {
    ensureLoaded,
    isReady() {
      return status === 'ready';
    },
    assessImpact,
    getReports() {
      return impactReports;
    },
    getLatestReport() {
      return impactReports.at(-1) ?? null;
    },
  };
}
