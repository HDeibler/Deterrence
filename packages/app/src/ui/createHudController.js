import { hudElementIds } from '../config/uiConfig.js';

export function createHudController({ document }) {
  const stageNode = document.getElementById(hudElementIds.stage);
  const speedNode = document.getElementById(hudElementIds.speed);
  const altitudeNode = document.getElementById(hudElementIds.altitude);
  const timeToImpactNode = document.getElementById(hudElementIds.timeToImpact);
  const rangeToTargetNode = document.getElementById(hudElementIds.rangeToTarget);
  const apogeeNode = document.getElementById(hudElementIds.apogee);

  return {
    render({ missile }) {
      stageNode.textContent = missile?.stageLabel ?? 'Standby';
      speedNode.textContent = missile?.active ? `${missile.speedKmS.toFixed(2)} km/s` : '-';
      altitudeNode.textContent = missile?.active ? `${missile.altitudeKm.toFixed(0)} km` : '-';
      timeToImpactNode.textContent = Number.isFinite(missile?.timeToImpactSeconds)
        ? formatDuration(missile.timeToImpactSeconds)
        : '-';
      rangeToTargetNode.textContent = Number.isFinite(missile?.rangeToTargetKm)
        ? `${missile.rangeToTargetKm.toFixed(0)} km`
        : '-';
      apogeeNode.textContent = missile?.active ? `${missile.apogeeKm.toFixed(0)} km` : '-';
    },
  };
}

function formatDuration(totalSeconds) {
  const rounded = Math.max(Math.round(totalSeconds), 0);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${`${seconds}`.padStart(2, '0')}`;
}
