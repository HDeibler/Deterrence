// UI controller for the end-game scorecard overlay.
// Renders a graded performance summary into the DOM.

export function createScorecardController({ document }) {
  const container = document.getElementById('scorecardContainer');

  return {
    render(scorecard) {
      if (!container) return;
      container.innerHTML = buildScorecardHTML(scorecard);
      container.hidden = false;
    },
    hide() {
      if (!container) return;
      container.innerHTML = '';
      container.hidden = true;
    },
  };
}

function buildScorecardHTML(sc) {
  const statusLabel = sc.gameStatus === 'victory' ? 'VICTORY' : 'DEFEAT';
  const statusClass = sc.gameStatus === 'victory' ? 'scorecard-victory' : 'scorecard-defeat';

  return `
    <div class="scorecard-header ${statusClass}">${statusLabel}</div>
    <div class="scorecard-grade grade-${sc.grade.toLowerCase()}">${sc.grade}</div>
    <div class="scorecard-grid">
      <div class="scorecard-stat">
        <span class="scorecard-label">Your Casualties</span>
        <span class="scorecard-value">${formatNumber(sc.playerCasualties)}</span>
      </div>
      <div class="scorecard-stat">
        <span class="scorecard-label">Enemy Casualties</span>
        <span class="scorecard-value">${formatNumber(sc.enemyCasualties)}</span>
      </div>
      <div class="scorecard-stat">
        <span class="scorecard-label">Missiles Launched</span>
        <span class="scorecard-value">${sc.missilesLaunched}</span>
      </div>
      <div class="scorecard-stat">
        <span class="scorecard-label">Intercepted</span>
        <span class="scorecard-value">${sc.missilesIntercepted}</span>
      </div>
      <div class="scorecard-stat">
        <span class="scorecard-label">Survival Time</span>
        <span class="scorecard-value">${formatTime(sc.survivalTimeSeconds)}</span>
      </div>
      <div class="scorecard-stat">
        <span class="scorecard-label">Fuel Remaining</span>
        <span class="scorecard-value">${formatNumber(sc.militaryFuelRemaining)} bbl</span>
      </div>
    </div>
  `;
}

function formatNumber(n) {
  return Math.round(n).toLocaleString();
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
