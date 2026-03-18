import { createMissileSimulation } from '../simulation/createMissileSimulation.js';
import { MAX_TRACKED_MISSILES } from './appConstants.js';

export function createMissileFlightController({
  simulationConfig,
  worldConfig,
  getEarthRotationRadians,
}) {
  const flights = [];
  let nextMissileId = 1;

  return {
    step(stepSeconds) {
      for (const flight of flights) {
        flight.simulation.step(stepSeconds);
      }
      // Auto-remove flights that completed their impact cleanup
      for (let i = flights.length - 1; i >= 0; i -= 1) {
        if (!flights[i].simulation.isActive()) {
          flights.splice(i, 1);
        }
      }
    },
    launch({ launchSite, target }) {
      const simulation = createMissileSimulation({ simulationConfig, worldConfig });
      simulation.launch({
        launchSite,
        target,
        earthRotationRadians: getEarthRotationRadians(),
      });
      flights.push({ id: nextMissileId, simulation });
      nextMissileId += 1;
      if (flights.length > MAX_TRACKED_MISSILES) {
        flights.splice(0, flights.length - MAX_TRACKED_MISSILES);
      }
    },
    getSnapshots() {
      return flights.map((flight) => ({
        id: flight.id,
        ...flight.simulation.getSnapshot(),
      }));
    },
    destroyMissile(missileId) {
      const index = flights.findIndex((f) => f.id === missileId);
      if (index >= 0) {
        flights.splice(index, 1);
      }
    },
    getPrimarySnapshot(snapshots) {
      const source =
        snapshots ??
        flights.map((flight) => ({
          id: flight.id,
          ...flight.simulation.getSnapshot(),
        }));
      return [...source].reverse().find((snapshot) => snapshot.active) ?? source.at(-1) ?? null;
    },
  };
}
