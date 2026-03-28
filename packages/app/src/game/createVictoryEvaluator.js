const DEFEAT_CASUALTY_THRESHOLD = 5_000_000;
const DEFAULT_VICTORY_TIME_SECONDS = 1800; // 30 minutes of game time

export function createVictoryEvaluator({ damageSimulation, activeCountryIso3, gameClock }) {
  return {
    evaluate() {
      const reports = damageSimulation.getReports();
      const elapsedSeconds = gameClock.getElapsedSeconds();

      // Tally fatalities inflicted on the player's nation
      let playerFatalities = 0;
      let playerInjured = 0;
      let totalImpacts = reports.length;

      for (const report of reports) {
        for (const city of report.affectedCities) {
          if (city.countryCode === activeCountryIso3) {
            playerFatalities += city.fatalities;
            playerInjured += city.injured;
          }
        }
      }

      const stats = {
        playerFatalities,
        playerInjured,
        totalImpacts,
        elapsedSeconds,
      };

      // DEFEAT: catastrophic casualties
      if (playerFatalities >= DEFEAT_CASUALTY_THRESHOLD) {
        return {
          status: 'defeat',
          reason: `Your nation sustained ${formatNumber(playerFatalities)} fatalities.`,
          stats,
        };
      }

      // VICTORY: survived the full duration without defeat
      if (elapsedSeconds >= DEFAULT_VICTORY_TIME_SECONDS) {
        return {
          status: 'victory',
          reason: 'Your nation survived the engagement window.',
          stats,
        };
      }

      return { status: 'ongoing', reason: '', stats };
    },
  };
}

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
