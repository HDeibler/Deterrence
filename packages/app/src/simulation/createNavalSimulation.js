export function createNavalSimulation({ worldConfig: _worldConfig }) {
  const packages = [];
  let nextGeneratedId = 1;

  function createPackage({ lat, lon, shipsConfig }) {
    const pkg = {
      id: `naval-package-${nextGeneratedId}`,
      lat,
      lon,
      targetLat: lat,
      targetLon: lon,
      speedKnots: 30, // Knots
      ships: shipsConfig.map((s) => ({
        ...s,
        health: 100,
        sunk: false,
      })),
      isMoving: false,
    };
    nextGeneratedId += 1;
    packages.push(pkg);
    return pkg;
  }

  function orderMove(pkgId, lat, lon) {
    const pkg = packages.find((p) => p.id === pkgId);
    if (pkg) {
      pkg.targetLat = lat;
      pkg.targetLon = lon;
      pkg.isMoving = true;
    }
  }

  function step(deltaSeconds) {
    for (const pkg of packages) {
      if (!pkg.isMoving) continue;

      const latDiff = pkg.targetLat - pkg.lat;
      const lonDiff = pkg.targetLon - pkg.lon;

      const distanceDeg = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
      if (distanceDeg < 0.01) {
        pkg.lat = pkg.targetLat;
        pkg.lon = pkg.targetLon;
        pkg.isMoving = false;
        continue;
      }

      // Convert speed to degrees per second (very rough approx for globe movement)
      const speedKmPerS = (pkg.speedKnots * 1.852) / 3600; // km/s
      const degreesPerSecond = speedKmPerS / 111; // 1 degree ~ 111km

      const stepDeg = degreesPerSecond * deltaSeconds;

      const moveRatio = Math.min(stepDeg / distanceDeg, 1);
      pkg.lat += latDiff * moveRatio;
      pkg.lon += lonDiff * moveRatio;
    }
  }

  function getSnapshot() {
    return packages.map((pkg) => ({
      id: pkg.id,
      lat: pkg.lat,
      lon: pkg.lon,
      targetLat: pkg.targetLat,
      targetLon: pkg.targetLon,
      isMoving: pkg.isMoving,
      ships: pkg.ships.map((s) => ({ ...s })),
    }));
  }

  return {
    createPackage,
    orderMove,
    step,
    getSnapshot,
    reset() {
      packages.length = 0;
      nextGeneratedId = 1;
    },
    serializeState() {
      return {
        packages: packages.map((pkg) => ({
          id: pkg.id,
          lat: pkg.lat,
          lon: pkg.lon,
          targetLat: pkg.targetLat,
          targetLon: pkg.targetLon,
          speedKnots: pkg.speedKnots,
          isMoving: pkg.isMoving,
          ships: pkg.ships.map((ship) => ({ ...ship })),
        })),
      };
    },
    loadState(serializedState = null) {
      packages.length = 0;
      nextGeneratedId = 1;
      for (const pkg of serializedState?.packages ?? []) {
        packages.push({
          id: pkg.id,
          lat: pkg.lat,
          lon: pkg.lon,
          targetLat: pkg.targetLat,
          targetLon: pkg.targetLon,
          speedKnots: pkg.speedKnots,
          isMoving: Boolean(pkg.isMoving),
          ships: (pkg.ships ?? []).map((ship) => ({ ...ship })),
        });
        nextGeneratedId += 1;
      }
    },
    // Stubs for capabilities
    launchPlanes: (pkgId, shipIndex, target) => {
      console.log('Planes launched from', pkgId, shipIndex, 'to', target);
    },
    launchCruiseMissile: (pkgId, shipIndex, target) => {
      console.log('Cruise missile launched from', pkgId, shipIndex, 'to', target);
    },
    launchICBM: (pkgId, shipIndex, target) => {
      console.log('ICBM launched from', pkgId, shipIndex, 'to', target);
    },
    damageShip: (pkgId, shipIndex, amount) => {
      const pkg = packages.find((p) => p.id === pkgId);
      if (pkg && pkg.ships[shipIndex]) {
        pkg.ships[shipIndex].health -= amount;
        if (pkg.ships[shipIndex].health <= 0) {
          pkg.ships[shipIndex].health = 0;
          pkg.ships[shipIndex].sunk = true;
        }
      }
    },
  };
}
