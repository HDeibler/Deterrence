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
