import { integrateEuler, computeOrbitalVelocity } from './orbitalMath.js';

export function createOrbitalSimulation({ celestialSystem, simulationConfig, worldConfig }) {
  const bodies = {
    earth: {
      mass: worldConfig.earthMass,
      position: celestialSystem.anchors.earth.position,
      velocity: celestialSystem.anchors.earth.velocity,
    },
    moon: {
      mass: worldConfig.moonMass,
      position: celestialSystem.anchors.moon.position,
      velocity: celestialSystem.anchors.moon.velocity,
    },
    probe: {
      mass: celestialSystem.anchors.probe.mass,
      position: celestialSystem.anchors.probe.position,
      velocity: celestialSystem.anchors.probe.velocity,
    },
  };

  bodies.moon.velocity.set(0, 0, 1.022);
  bodies.probe.velocity.set(
    0,
    0,
    computeOrbitalVelocity({
      gravitationalConstant: simulationConfig.gravitationalConstant,
      centralMass: worldConfig.earthMass,
      radiusMeters: (worldConfig.earthRadius + 2.8) * simulationConfig.scaleMeters,
    }) / simulationConfig.scaleMeters,
  );

  return {
    step(deltaSeconds) {
      integrateEuler({
        body: bodies.moon,
        attractors: [bodies.earth],
        deltaSeconds,
        gravitationalConstant: simulationConfig.gravitationalConstant,
        scaleMeters: simulationConfig.scaleMeters,
      });

      integrateEuler({
        body: bodies.probe,
        attractors: [bodies.earth, bodies.moon],
        deltaSeconds,
        gravitationalConstant: simulationConfig.gravitationalConstant,
        scaleMeters: simulationConfig.scaleMeters,
      });

      celestialSystem.syncBodies();
    },
    getMoonDistanceKm() {
      return bodies.moon.position.length() * 1000;
    },
    getProbeSpeedKmS() {
      return (bodies.probe.velocity.length() * simulationConfig.scaleMeters) / 1000;
    },
  };
}
