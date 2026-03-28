const DEG_TO_RAD = Math.PI / 180;
const KM_PER_DEGREE = 111.32;

const FORMATION_OFFSETS = [
  { bearing: 0, distanceKm: 0 },
  { bearing: 140, distanceKm: 8 },
  { bearing: 220, distanceKm: 8 },
  { bearing: 160, distanceKm: 16 },
  { bearing: 200, distanceKm: 16 },
  { bearing: 180, distanceKm: 24 },
];

const FLEET_SEPARATION_KM = 30;
const AVOIDANCE_FACTOR = 0.3;
// Gameplay multiplier — real naval speed is too slow for interactive play.
// At 30 knots * 200x * 8x time-scale, a fleet crosses ~6000 km in ~3 min real time.
const GAMEPLAY_SPEED_MULTIPLIER = 200;

const FLEET_NAMES = [
  'Vanguard', 'Sentinel', 'Trident', 'Aegis', 'Typhon',
  'Leviathan', 'Corsair', 'Tempest', 'Ironclad', 'Warden',
  'Poseidon', 'Narwhal', 'Kraken', 'Triton', 'Stormwall',
  'Bulwark', 'Javelin', 'Hammerhead', 'Raptor', 'Cerberus',
];

let _nextFleetId = 1;
let _nextShipId = 1;

export function createNavalSimulation() {
  const fleets = [];

  return {
    createFleet({ lat, lon, ships, name, speedKnots = 30, countryIso3 }) {
      const num = _nextFleetId++;
      const fleetId = `fleet_${num}`;
      const fleetName = name || FLEET_NAMES[(num - 1) % FLEET_NAMES.length];
      const fleet = {
        id: fleetId,
        name: fleetName,
        lat,
        lon,
        heading: 0,
        speedKnots,
        countryIso3: countryIso3 || null,
        waypoints: [],
        waypointIndex: 0,
        isMoving: false,
        ships: ships.map((s) => ({
          id: `ship_${_nextShipId++}`,
          fleetId,
          type: s.type,
          health: 100,
          sunk: false,
        })),
      };
      fleets.push(fleet);
      return fleet;
    },

    orderRoute(fleetId, waypoints) {
      const fleet = fleets.find((f) => f.id === fleetId);
      if (!fleet || waypoints.length === 0) {
        return;
      }
      fleet.waypoints = waypoints;
      fleet.waypointIndex = 0;
      fleet.isMoving = true;
    },

    getFleets() {
      return fleets;
    },

    getLastFleet() {
      return fleets.length > 0 ? fleets[fleets.length - 1] : null;
    },

    step(deltaSeconds) {
      for (const fleet of fleets) {
        if (!fleet.isMoving || fleet.waypoints.length === 0) {
          continue;
        }

        const target = fleet.waypoints[fleet.waypointIndex];
        if (!target) {
          fleet.isMoving = false;
          continue;
        }

        const latDiff = target.lat - fleet.lat;
        const lonDiff = target.lon - fleet.lon;
        const cosLat = Math.cos(fleet.lat * DEG_TO_RAD);
        const distKm = Math.sqrt(
          (latDiff * KM_PER_DEGREE) ** 2 + (lonDiff * KM_PER_DEGREE * cosLat) ** 2,
        );

        if (distKm < 2) {
          fleet.lat = target.lat;
          fleet.lon = target.lon;
          fleet.waypointIndex++;
          if (fleet.waypointIndex >= fleet.waypoints.length) {
            fleet.isMoving = false;
            fleet.waypoints = [];
            fleet.waypointIndex = 0;
          }
          continue;
        }

        const targetHeading = Math.atan2(lonDiff * cosLat, latDiff) * (180 / Math.PI);
        let headingDiff = ((targetHeading - fleet.heading + 540) % 360) - 180;
        fleet.heading += headingDiff * Math.min(1, deltaSeconds * 2);
        fleet.heading = ((fleet.heading + 540) % 360) - 180;

        const speedKmPerS = (fleet.speedKnots * 1.852 * GAMEPLAY_SPEED_MULTIPLIER) / 3600;
        const stepKm = speedKmPerS * deltaSeconds;
        const moveRatio = Math.min(stepKm / distKm, 1);

        fleet.lat += latDiff * moveRatio;
        fleet.lon += lonDiff * moveRatio;
      }

      applyFleetSeparation(fleets);
    },

    getSnapshot() {
      const shipSnapshots = [];

      for (const fleet of fleets) {
        for (let i = 0; i < fleet.ships.length; i++) {
          const ship = fleet.ships[i];
          if (ship.sunk) {
            continue;
          }

          const offset = FORMATION_OFFSETS[i % FORMATION_OFFSETS.length];
          const { lat, lon } = applyBearingOffset(
            fleet.lat,
            fleet.lon,
            fleet.heading,
            offset.bearing,
            offset.distanceKm,
          );

          shipSnapshots.push({
            id: ship.id,
            fleetId: fleet.id,
            type: ship.type,
            lat,
            lon,
            heading: fleet.heading,
            isMoving: fleet.isMoving,
            health: ship.health,
            sunk: ship.sunk,
          });
        }
      }

      return shipSnapshots;
    },

    damageShip(shipId, amount) {
      for (const fleet of fleets) {
        const ship = fleet.ships.find((s) => s.id === shipId);
        if (ship) {
          ship.health = Math.max(0, ship.health - amount);
          if (ship.health <= 0) {
            ship.sunk = true;
          }
          break;
        }
      }
    },

    getFleetRoute(fleetId) {
      const fleet = fleets.find((f) => f.id === fleetId);
      if (!fleet || !fleet.isMoving || fleet.waypoints.length === 0) {
        return [];
      }
      return fleet.waypoints.slice(fleet.waypointIndex);
    },

    getFleetByShipId(shipId) {
      for (const fleet of fleets) {
        if (fleet.ships.some((s) => s.id === shipId)) {
          return fleet;
        }
      }
      return null;
    },
  };
}

function applyBearingOffset(lat, lon, fleetHeading, bearingOffset, distanceKm) {
  if (distanceKm === 0) {
    return { lat, lon };
  }

  const absoluteBearing = (fleetHeading + bearingOffset) * DEG_TO_RAD;
  const dLat = (Math.cos(absoluteBearing) * distanceKm) / KM_PER_DEGREE;
  const cosLat = Math.cos(lat * DEG_TO_RAD);
  const dLon = cosLat > 0.01 ? (Math.sin(absoluteBearing) * distanceKm) / (KM_PER_DEGREE * cosLat) : 0;

  return {
    lat: lat + dLat,
    lon: lon + dLon,
  };
}

function applyFleetSeparation(fleets) {
  for (let i = 0; i < fleets.length; i++) {
    for (let j = i + 1; j < fleets.length; j++) {
      const a = fleets[i];
      const b = fleets[j];
      const cosLat = Math.cos(((a.lat + b.lat) * 0.5) * DEG_TO_RAD);
      const dLat = (b.lat - a.lat) * KM_PER_DEGREE;
      const dLon = (b.lon - a.lon) * KM_PER_DEGREE * cosLat;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);

      if (dist < FLEET_SEPARATION_KM && dist > 0.01) {
        const overlap = (FLEET_SEPARATION_KM - dist) * AVOIDANCE_FACTOR;
        const pushLat = (dLat / dist) * overlap / KM_PER_DEGREE;
        const pushLon = cosLat > 0.01 ? (dLon / dist) * overlap / (KM_PER_DEGREE * cosLat) : 0;

        if (a.isMoving) {
          a.lat -= pushLat * 0.5;
          a.lon -= pushLon * 0.5;
        }
        if (b.isMoving) {
          b.lat += pushLat * 0.5;
          b.lon += pushLon * 0.5;
        }
      }
    }
  }
}
