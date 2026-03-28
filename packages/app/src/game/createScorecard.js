// End-game scorecard compiler.
// Gathers stats from damage, oil, and missile simulations
// and produces a graded summary of the player's performance.

export function createScorecard({ countryDirectory }) {
  return {
    compile({ damageSimulation, missileFlights, oilSimulation, activeCountryIso3, elapsedSeconds, gameStatus }) {
      const playerCountry = countryDirectory.getByIso3(activeCountryIso3);
      const playerIso2 = playerCountry?.iso2?.toUpperCase() ?? '';

      const reports = damageSimulation.getReports();
      let playerCasualties = 0;
      let enemyCasualties = 0;

      for (const report of reports) {
        for (const city of report.affectedCities) {
          const cityIso2 = (city.countryCode ?? '').toUpperCase();
          if (cityIso2 === playerIso2) {
            playerCasualties += city.fatalities;
          } else {
            enemyCasualties += city.fatalities;
          }
        }
      }

      const snapshots = missileFlights.getSnapshots();
      const missilesLaunched = snapshots.filter(
        (m) => m.launchSite?.countryIso3 === activeCountryIso3,
      ).length;

      // Counts all inactive enemy missiles (includes both intercepted and impacted).
      // Snapshot data does not distinguish termination reason.
      const interceptedCount = snapshots.filter(
        (m) => !m.active && m.launchSite?.countryIso3 !== activeCountryIso3,
      ).length;

      const oilState = oilSimulation.getCountryState(activeCountryIso3);
      const oilReservesRemaining = oilState?.nationalReserves ?? 0;
      const militaryFuelRemaining = oilState?.militaryFuel ?? 0;

      const grade = computeGrade(playerCasualties, missilesLaunched, elapsedSeconds);

      return {
        playerCasualties,
        enemyCasualties,
        missilesLaunched,
        missilesIntercepted: interceptedCount,
        oilReservesRemaining,
        militaryFuelRemaining,
        survivalTimeSeconds: elapsedSeconds,
        gameStatus,
        grade,
      };
    },
  };
}

function computeGrade(playerCasualties, missilesLaunched, survivalTime) {
  let score = 100;
  // Lower own casualties = better: -1 point per 100K, max -50
  score -= Math.min(50, playerCasualties / 100_000);
  // Fewer missiles used = more efficient: -2 per missile, max -20
  score -= Math.min(20, missilesLaunched * 2);
  // Longer survival = better: +1 per 90s survived, max +20
  score += Math.min(20, survivalTime / 90);

  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
