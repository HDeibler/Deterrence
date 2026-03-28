import { createMissileSimulation } from '../simulation/createMissileSimulation.js';
import { createCruiseMissileSimulation } from '../simulation/createCruiseMissileSimulation.js';
import { createHypersonicMissileSimulation } from '../simulation/createHypersonicMissileSimulation.js';
import { createReentryVehicleSimulation } from '../simulation/createReentryVehicleSimulation.js';
import { getMissileType } from '../game/data/munitionCatalog.js';
import { MAX_TRACKED_MISSILES } from './appConstants.js';

export function createMissileFlightController({
  simulationConfig,
  worldConfig,
  getEarthRotationRadians,
}) {
  const flights = [];
  let nextMissileId = 1;

  function createSimulationForType(missileTypeId, warheadId) {
    const missileSpec = getMissileType(missileTypeId);

    if (!missileSpec || missileSpec.flightModel === 'ballistic') {
      return {
        simulation: createMissileSimulation({ simulationConfig, worldConfig }),
        missileTypeId: missileTypeId ?? 'icbm',
        warheadId: warheadId ?? 'nuclear_300kt',
      };
    }

    if (missileSpec.flightModel === 'cruise') {
      const spec = { ...missileSpec, warheadId: warheadId ?? missileSpec.defaultWarhead };
      return {
        simulation: createCruiseMissileSimulation({ simulationConfig, worldConfig, missileSpec: spec }),
        missileTypeId,
        warheadId: warheadId ?? missileSpec.defaultWarhead,
      };
    }

    if (missileSpec.flightModel === 'hypersonic') {
      const spec = { ...missileSpec, warheadId: warheadId ?? missileSpec.defaultWarhead };
      return {
        simulation: createHypersonicMissileSimulation({ simulationConfig, worldConfig, missileSpec: spec }),
        missileTypeId,
        warheadId: warheadId ?? missileSpec.defaultWarhead,
      };
    }

    return {
      simulation: createMissileSimulation({ simulationConfig, worldConfig }),
      missileTypeId: 'icbm',
      warheadId: warheadId ?? 'nuclear_300kt',
    };
  }

  return {
    step(stepSeconds) {
      // Step all active flights
      for (const flight of flights) {
        flight.simulation.step(stepSeconds);
      }

      // MIRV deployment: check for ICBMs entering midcourse phase
      for (const flight of flights) {
        if (flight.mirvDeployed) continue;
        if (flight.missileTypeId !== 'icbm') continue;

        const snap = flight.simulation.getSnapshot();
        if (snap.phase !== 'midcourse') continue;

        // Deploy RVs if this ICBM has multiple targets
        const targets = flight.mirvTargets;
        if (!targets || targets.length <= 1) {
          flight.mirvDeployed = true;
          continue;
        }

        // Spawn an RV for each target
        const parentPos = snap.position;
        const parentVel = snap.direction
          ? snap.direction.clone().multiplyScalar(snap.speedKmS * 1000 / simulationConfig.scaleMeters)
          : null;

        if (!parentPos || !parentVel) {
          flight.mirvDeployed = true;
          continue;
        }

        // Get actual velocity from the simulation snapshot
        // The direction × speed gives us velocity in sim units
        const busVel = snap.direction.clone().multiplyScalar(snap.speedKmS / 1000 * simulationConfig.scaleMeters / simulationConfig.scaleMeters);
        // Actually we need the raw velocity. The snapshot has position and direction.
        // Reconstruct: vel = direction * speed_in_sim_units
        const speedSimUnits = snap.speedKmS * 1000 / simulationConfig.scaleMeters;
        const vel = snap.direction.clone().multiplyScalar(speedSimUnits);

        for (let i = 0; i < targets.length; i++) {
          const rvSim = createReentryVehicleSimulation({ simulationConfig, worldConfig });
          rvSim.release({
            position: parentPos.clone(),
            velocity: vel.clone(),
            target: targets[i],
            launchSite: snap.launchSite,
            earthRotationRadians: getEarthRotationRadians(),
            warheadId: flight.warheadId,
          });

          flights.push({
            id: nextMissileId,
            simulation: rvSim,
            missileTypeId: 'rv',
            warheadId: flight.warheadId,
            mirvDeployed: true,
            parentId: flight.id,
          });
          nextMissileId += 1;
        }

        // The bus continues as a decoy (no warhead) — or we can destroy it
        // For realism: bus continues on its original trajectory as a decoy
        flight.mirvDeployed = true;
        flight.isDecoy = true;
      }

      // Auto-remove flights that completed their impact cleanup
      for (let i = flights.length - 1; i >= 0; i -= 1) {
        if (!flights[i].simulation.isActive()) {
          flights.splice(i, 1);
        }
      }

      // Cap total flights
      if (flights.length > MAX_TRACKED_MISSILES) {
        flights.splice(0, flights.length - MAX_TRACKED_MISSILES);
      }
    },

    launch({ launchSite, target, missileTypeId, warheadId, mirvTargets }) {
      const { simulation, missileTypeId: resolvedType, warheadId: resolvedWarhead } =
        createSimulationForType(missileTypeId, warheadId);

      simulation.launch({
        launchSite,
        target,
        earthRotationRadians: getEarthRotationRadians(),
      });

      flights.push({
        id: nextMissileId,
        simulation,
        missileTypeId: resolvedType,
        warheadId: resolvedWarhead,
        mirvTargets: mirvTargets ?? null,
        mirvDeployed: false,
        isDecoy: false,
      });
      nextMissileId += 1;
    },

    getSnapshots() {
      return flights.map((flight) => ({
        id: flight.id,
        missileType: flight.missileTypeId,
        warheadId: flight.isDecoy ? null : flight.warheadId,
        isDecoy: flight.isDecoy,
        parentId: flight.parentId ?? null,
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
          missileType: flight.missileTypeId,
          warheadId: flight.warheadId,
          ...flight.simulation.getSnapshot(),
        }));
      return [...source].reverse().find((snapshot) => snapshot.active) ?? source.at(-1) ?? null;
    },
  };
}
